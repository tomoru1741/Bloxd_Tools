// ===== Bloxd Translation Checker =====
// Game items data extracted from bloxd.io

// Fallback embedded data (Empty - relying on dynamic fetch as requested)
const EMBEDDED_GAME_ITEMS = [];

// Configuration
const CONFIG = {
    bloxdUrl: 'https://bloxd.io/',
    wikiDataUrl: 'https://bloxdjapan.miraheze.org/wiki/MediaWiki:ItemName.json?action=raw',
    corsProxy: 'https://corsproxy.io/?'
};

// State
let state = {
    gameItems: EMBEDDED_GAME_ITEMS,
    wikiTranslations: {},
    currentFilter: 'all',
    searchQuery: '',
    sortBy: 'original'
};

// DOM Elements
let elements = {};

// ===== Theme Toggle =====

function initTheme() {
    const savedTheme = localStorage.getItem('bloxd-theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        if (elements.themeToggle) elements.themeToggle.textContent = '☀️';
    }
}

function toggleTheme() {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    elements.themeToggle.textContent = isLight ? '☀️' : '🌙';
    localStorage.setItem('bloxd-theme', isLight ? 'light' : 'dark');
}

// ===== Data Loading =====

async function loadGameData() {
    // 1. Try to fetch latest data to get correct order (starting with "Unloaded", "Dirt", ...)
    if (elements.gameDataStatus) {
        elements.gameDataStatus.className = 'status loading';
        elements.gameDataStatus.textContent = '最新のゲームデータを取得中...';
    }

    try {
        const latestItems = await fetchLatestGameItems();
        if (latestItems && latestItems.length > 0) {
            state.gameItems = latestItems;
            if (elements.gameDataStatus) {
                elements.gameDataStatus.className = 'status success';
                elements.gameDataStatus.textContent = `${state.gameItems.length} アイテム (ソースコード順)`;
            }
            return true;
        }
    } catch (e) {
        console.warn("Using fallback data due to:", e);
        if (elements.gameDataStatus) {
            elements.gameDataStatus.className = 'status error';
            elements.gameDataStatus.textContent = `データ取得失敗: ${e.message}`;
        }
    }

    // 2. Fallback (Fail if no embedded data)
    state.gameItems = EMBEDDED_GAME_ITEMS;
    if (state.gameItems.length === 0) {
        if (elements.gameDataStatus) {
            elements.gameDataStatus.className = 'status error';
            elements.gameDataStatus.textContent = 'データ取得失敗: ローカル環境ではCORS制限によりブロックされることがあります。簡易サーバーを使用するか、CORS解除拡張機能をお試しください。';
        }
    } else {
        if (elements.gameDataStatus) {
            elements.gameDataStatus.className = 'status warning';
            elements.gameDataStatus.textContent = `${state.gameItems.length} アイテム (埋め込みデータ・ABC順)`;
        }
    }
    return false;
}

// Crawl bloxd.io scripts to find item list
async function fetchLatestGameItems() {
    const proxies = [
        { url: 'https://corsproxy.io/?', resultType: 'text' },
        { url: 'https://api.allorigins.win/raw?url=', resultType: 'text' }
    ];

    async function fetchWithProxy(targetUrl) {
        const proxies = [
            { url: 'https://corsproxy.io/?', type: 'text' }, // Proven to work for HTML
            { url: 'https://api.allorigins.win/get?url=', type: 'json' }, // JSON wrapper to bypass some CORS
            { url: 'https://api.allorigins.win/raw?url=', type: 'text' } // Raw fallback
        ];

        for (const proxy of proxies) {
            try {
                // console.log(`Trying fetch via ${proxy.url}: ${targetUrl}`);
                const res = await fetch(proxy.url + encodeURIComponent(targetUrl));
                if (res.ok) {
                    if (proxy.type === 'json') {
                        const data = await res.json();
                        if (data && data.contents) return data.contents;
                    } else {
                        return await res.text();
                    }
                }
            } catch (e) {
                // Continue to next proxy
                console.warn(`Proxy ${proxy.url} failed for ${targetUrl}:`, e);
            }
        }
        return null;
    }

    // 1. Get Main JS URL from Index HTML
    console.log('Fetching bloxd.io main page...');
    const htmlText = await fetchWithProxy(CONFIG.bloxdUrl);

    if (!htmlText) {
        throw new Error("Failed to fetch bloxd.io with any proxy");
    }

    const srcRegex = /src="(\/static\/js\/main\.[^"]+\.js)"/;
    let mainScriptMatch = srcRegex.exec(htmlText);

    if (!mainScriptMatch) {
        // Fallback: try to find any script that looks like main
        const genericMatch = /src="(\/static\/js\/[^"]+\.js)"/.exec(htmlText);
        if (!genericMatch) throw new Error("Could not find main script in index.html");
        mainScriptMatch = genericMatch;
    }

    const mainScriptUrl = CONFIG.bloxdUrl.replace(/\/$/, '') + mainScriptMatch[1];
    console.log(`Found main script: ${mainScriptUrl}`);

    // 2. Fetch Main JS and find chunk URLs for 2.chunk and 32.chunk
    const mainJsText = await fetchWithProxy(mainScriptUrl);
    if (!mainJsText) throw new Error("Failed to fetch main script");

    // Regex to find chunk filenames: "2.8d23a1b4.chunk.js" or similar
    // Webpack often maps ids to file names. We look for the patterns "2.[hash].chunk.js" and "32.[hash].chunk.js"
    // Since we don't know the exact format of the webpack boilerplate, we search for the filenames strictly.
    const chunkRegex = /["']((?:2|32)\.[a-z0-9]+\.chunk\.js)["']/g;
    const targetFiles = new Set();
    let chunkMatch;
    while ((chunkMatch = chunkRegex.exec(mainJsText)) !== null) {
        targetFiles.add(chunkMatch[1]);
    }

    if (targetFiles.size === 0) {
        console.warn("Could not find specific chunk names (2 or 32) in main.js. Fallback: scanning all .js references.");
        // Fallback: try to find ANY .chunk.js files mentioned
        const generalChunkRegex = /["']([0-9]+\.[a-z0-9]+\.chunk\.js)["']/g;
        while ((chunkMatch = generalChunkRegex.exec(mainJsText)) !== null) {
            targetFiles.add(chunkMatch[1]);
        }
    }

    console.log(`Found ${targetFiles.size} target chunks:`, Array.from(targetFiles));

    let allItems = [];

    // 3. Scan Target Chunks
    for (const fileName of targetFiles) {
        // Only target 2 and 32 if we found them, otherwise we might be scanning everything in fallback
        if (!fileName.startsWith('2.') && !fileName.startsWith('32.')) {
            // If we are in fallback mode, maybe we should skip unless we are desperate?
            // For now, let's just log and continue, trusting the regex found meaningful files.
        }

        const url = CONFIG.bloxdUrl.replace(/\/$/, '') + '/static/js/' + fileName;
        try {
            console.log(`Scanning ${url}...`);
            const jsText = await fetchWithProxy(url);

            if (!jsText) {
                console.warn(`Failed to fetch script: ${url}`);
                continue;
            }

            // Strategy 1: Anchor Search
            const anchorResult = scanStartingFromAnchor(jsText);
            if (anchorResult && anchorResult.length > 50) {
                console.log(`Found ${anchorResult.length} items in ${fileName} (Anchor)`);
                allItems = allItems.concat(anchorResult);
                continue; // Found items in this file, move to next
            }

            // Strategy 2: Heuristic Search
            const heuristicResult = scanForSequentialEnums(jsText);
            if (heuristicResult && heuristicResult.length > 50) {
                console.log(`Found ${heuristicResult.length} items in ${fileName} (Heuristic)`);
                allItems = allItems.concat(heuristicResult);
                continue;
            }

        } catch (e) {
            console.warn(`Failed scanning ${url}:`, e);
        }
    }

    if (allItems.length > 0) {
        // Deduplicate based on ID or Name if needed? 
        // For now, let's assume they are distinct lists (blocks vs items) or sequential.
        // Actually, if both define "Air" or similar, we might have duplicates.
        // Let's allow duplicates for now or filtering by unique name.
        const uniqueItems = [...new Set(allItems)];
        return uniqueItems;
    }

    throw new Error("Item list not found in target chunks (2, 32).");
}

function scanStartingFromAnchor(text) {
    const markers = [/Unloaded\s*:\s*0/, /Unloaded\s*=\s*0/, /"Unloaded"\s*:\s*0/];

    for (const marker of markers) {
        const match = text.match(marker);
        if (match) {
            console.log(`Found anchor at index ${match.index}`);
            return extractSequentialItems(text, match.index);
        }
    }
    return null;
}

function scanForSequentialEnums(text) {
    // Look for key: 0 pattern to potential start of enum
    const startPattern = /[,;{]\s*(?:["']?([a-zA-Z0-9_\s]+)["']?)\s*[:=]\s*0(?![0-9])/g;

    let bestList = [];
    let match;
    while ((match = startPattern.exec(text)) !== null) {
        const list = extractSequentialItems(text, match.index);
        if (list && list.length > bestList.length) {
            bestList = list;
        }
    }
    return bestList.length > 0 ? bestList : null;
}

function extractSequentialItems(text, startIndex) {
    const validItems = new Map();
    const itemRegex = /[,;{]\s*(?:["']?([a-zA-Z0-9_\s]+)["']?)\s*[:=]\s*(\d+)/y;

    let currentIndex = startIndex;
    let lastId = -1; // expecting 0 next
    let failureCount = 0;

    // Attempt to align regex
    itemRegex.lastIndex = startIndex;

    while (failureCount < 10) {
        itemRegex.lastIndex = currentIndex;
        const match = itemRegex.exec(text);

        if (match) {
            const name = match[1];
            const id = parseInt(match[2], 10);

            // Allow:
            // 1. Exact next ID (0, 1, 2...)
            // 2. Same ID (alias) (0, 0, 1...)
            // 3. First item being 0 (if lastId is -1)

            if (id === lastId + 1 || id === lastId || (lastId === -1 && id === 0)) {
                if (id === lastId + 1) {
                    validItems.set(name, id);
                    lastId = id;
                    failureCount = 0;
                } else if (id === lastId) {
                    // Alias - skip adding to Map if we want unique names, or add if map allows.
                    // Map overwrites if key same, but here names are diff.
                    // We can include aliases.
                    // But Bloxd usually has unique IDs for main items.
                    // Let's assume aliases are rare or acceptable.
                    failureCount = 0;
                }
                currentIndex = itemRegex.lastIndex;
            } else {
                failureCount++;
                currentIndex++;
            }
        } else {
            failureCount++;
            currentIndex++;
        }

        if (currentIndex >= text.length || validItems.size > 2000) break;
        if (validItems.size > 200 && failureCount > 20) break;
    }

    if (validItems.size > 100) {
        // Return sorted by ID
        return Array.from(validItems.entries())
            .sort((a, b) => a[1] - b[1])
            .map(entry => entry[0]);
    }
    return null;
}

async function loadWikiData() {
    if (elements.wikiDataStatus) {
        elements.wikiDataStatus.className = 'status loading';
        elements.wikiDataStatus.textContent = '読み込み中...';
    }

    try {
        let data;
        try {
            const response = await fetch(CONFIG.wikiDataUrl);
            data = await response.json();
        } catch {
            const response = await fetch(CONFIG.corsProxy + encodeURIComponent(CONFIG.wikiDataUrl));
            data = await response.json();
        }

        state.wikiTranslations = data || {};
        const count = Object.keys(state.wikiTranslations).length;

        if (elements.wikiDataStatus) {
            elements.wikiDataStatus.className = 'status success';
            elements.wikiDataStatus.textContent = `${count} 翻訳読み込み完了`;
        }
        return true;
    } catch (error) {
        console.error('Failed to load wiki data:', error);
        if (elements.wikiDataStatus) {
            elements.wikiDataStatus.className = 'status error';
            elements.wikiDataStatus.textContent = 'エラー: Wiki接続失敗';
        }
        state.wikiTranslations = {};
        return false;
    }
}

// ===== Statistics =====

function updateStats() {
    const gameCount = state.gameItems.length;
    const wikiCount = Object.keys(state.wikiTranslations).length;
    const translatedItems = state.gameItems.filter(item => state.wikiTranslations[item] !== undefined);
    const translatedCount = translatedItems.length;
    const missingCount = gameCount - translatedCount;
    const coverage = gameCount > 0 ? ((translatedCount / gameCount) * 100).toFixed(1) : 0;

    if (elements.gameItemCount) elements.gameItemCount.textContent = gameCount.toLocaleString();
    if (elements.wikiItemCount) elements.wikiItemCount.textContent = wikiCount.toLocaleString();
    if (elements.missingCount) elements.missingCount.textContent = missingCount.toLocaleString();
    if (elements.coveragePercent) elements.coveragePercent.textContent = `${coverage}%`;
    if (elements.lastUpdate) elements.lastUpdate.textContent = new Date().toLocaleString('ja-JP');
}

// ===== Item List Rendering =====

function getFilteredItems() {
    let items = state.gameItems.map((name, index) => ({
        name,
        originalIndex: index,
        translation: state.wikiTranslations[name] || null,
        isTranslated: state.wikiTranslations[name] !== undefined
    }));

    if (state.currentFilter === 'missing') {
        items = items.filter(item => !item.isTranslated);
    } else if (state.currentFilter === 'translated') {
        items = items.filter(item => item.isTranslated);
    }

    if (state.searchQuery) {
        const query = state.searchQuery.toLowerCase();
        items = items.filter(item =>
            item.name.toLowerCase().includes(query) ||
            (item.translation && item.translation.includes(query))
        );
    }

    switch (state.sortBy) {
        case 'original':
            // Already in original order
            break;
        case 'name-asc': items.sort((a, b) => a.name.localeCompare(b.name)); break;
        case 'name-desc': items.sort((a, b) => b.name.localeCompare(a.name)); break;
        case 'status': items.sort((a, b) => {
            if (a.isTranslated === b.isTranslated) return a.originalIndex - b.originalIndex;
            return a.isTranslated ? 1 : -1;
        }); break;
    }

    return items;
}

function renderItemList() {
    const items = getFilteredItems();

    if (items.length === 0) {
        if (elements.itemList) elements.itemList.innerHTML = `<div class="loading-spinner"><p>該当するアイテムがありません</p></div>`;
        return;
    }

    const displayItems = items.slice(0, 500);
    const html = displayItems.map(item => `
        <div class="item-row ${item.isTranslated ? 'translated' : 'missing'}">
            <div class="item-index">#${item.originalIndex + 1}</div>
            <div class="item-name">
                <div class="english">${escapeHtml(item.name)}</div>
                ${item.translation ? `<div class="japanese">→ ${escapeHtml(item.translation)}</div>` : ''}
            </div>
            <div class="item-status ${item.isTranslated ? 'translated' : 'missing'}">
                ${item.isTranslated ? '✓ 翻訳済み' : '⚠ 未翻訳'}
            </div>
        </div>
    `).join('');

    if (elements.itemList) {
        elements.itemList.innerHTML = html;
        if (items.length > 500) {
            elements.itemList.innerHTML += `<div class="loading-spinner"><p>他 ${items.length - 500} 件のアイテムがあります</p></div>`;
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== Template Generation =====

function getMissingItems() {
    return state.gameItems.filter(item => state.wikiTranslations[item] === undefined);
}

function generateTemplate() {
    const missing = getMissingItems();
    if (missing.length === 0) return '// すべてのアイテムが翻訳済みです！';
    return missing.map(item => `\t"${item}": ""`).join(',\n');
}

function updateTemplatePreview() {
    if (elements.templatePreview) elements.templatePreview.textContent = generateTemplate();
}

function copyTemplateToClipboard() {
    navigator.clipboard.writeText(generateTemplate()).then(() => {
        const originalText = elements.copyTemplate.textContent;
        elements.copyTemplate.textContent = '✓ コピーしました！';
        setTimeout(() => { elements.copyTemplate.textContent = originalText; }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('コピーに失敗しました');
    });
}

function exportTemplateAsJSON() {
    const missing = getMissingItems();
    const template = {};
    missing.forEach(item => { template[item] = ""; });
    const content = JSON.stringify(template, null, '\t');
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bloxd_missing_translations_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

// ===== Event Handlers =====

function setupEventListeners() {
    if (elements.themeToggle) elements.themeToggle.addEventListener('click', toggleTheme);
    if (elements.refreshWikiData) {
        elements.refreshWikiData.addEventListener('click', async () => {
            // Refresh both
            await loadGameData();
            await loadWikiData();
            updateStats();
            renderItemList();
            updateTemplatePreview();
        });
    }
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            renderItemList();
        });
    }
    elements.filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentFilter = btn.dataset.filter;
            renderItemList();
        });
    });
    if (elements.sortSelect) {
        elements.sortSelect.addEventListener('change', (e) => {
            state.sortBy = e.target.value;
            renderItemList();
        });
    }
    if (elements.copyTemplate) elements.copyTemplate.addEventListener('click', copyTemplateToClipboard);
    if (elements.exportTemplate) elements.exportTemplate.addEventListener('click', exportTemplateAsJSON);
}

// ===== Initialize DOM Elements =====

function initElements() {
    elements = {
        themeToggle: document.getElementById('theme-toggle'),
        gameItemCount: document.getElementById('gameItemCount'),
        wikiItemCount: document.getElementById('wikiItemCount'),
        missingCount: document.getElementById('missingCount'),
        coveragePercent: document.getElementById('coveragePercent'),
        gameDataStatus: document.getElementById('gameDataStatus'),
        wikiDataStatus: document.getElementById('wikiDataStatus'),
        refreshWikiData: document.getElementById('refreshWikiData'),
        searchInput: document.getElementById('searchInput'),
        filterButtons: document.querySelectorAll('.filter-btn'),
        sortSelect: document.getElementById('sortSelect'),
        itemList: document.getElementById('itemList'),
        templatePreview: document.getElementById('templatePreview'),
        copyTemplate: document.getElementById('copyTemplate'),
        exportTemplate: document.getElementById('exportTemplate'),
        lastUpdate: document.getElementById('lastUpdate')
    };
}

// ===== Initialization =====

async function init() {
    initElements();
    initTheme();
    setupEventListeners();

    // Load data in parallel (Game data first to establish order)
    await loadGameData();
    await loadWikiData();

    updateStats();
    renderItemList();
    updateTemplatePreview();
}

document.addEventListener('DOMContentLoaded', init);
