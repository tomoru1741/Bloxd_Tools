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

// Immediate theme application to prevent flash
(function () {
    const savedTheme = localStorage.getItem('bloxd-theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    }
    document.body.classList.add('preload');
    window.addEventListener('load', () => {
        requestAnimationFrame(() => {
            document.body.classList.remove('preload');
        });
    });
})();

function initTheme() {
    const savedTheme = localStorage.getItem('bloxd-theme');
    // Button state update
    if (elements.themeToggle) {
        elements.themeToggle.textContent = savedTheme === 'light' ? '☀️' : '🌙';
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
        console.error('Core extraction failed:', e);

        let errorMsg = 'データ取得失敗: ';
        if (e.message.includes('manifest')) {
            errorMsg += 'マニフェスト (CORS/Network Error)';
        } else if (e.message.includes('target chunks')) {
            errorMsg += 'リスト抽出失敗 (Parse Error)';
        } else {
            errorMsg += e.message; // Detailed error
        }

        if (elements.gameDataStatus) {
            elements.gameDataStatus.className = 'status error';
            elements.gameDataStatus.textContent = errorMsg;
        }
        return false;
    }
}

// CORS Proxy Helper (Same as viewer.js for consistency)
async function fetchWithProxy(url) {
    const proxies = [
        // CodeTabs - often more reliable for plain text/json
        (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
        // AllOrigins
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        // CORS Proxy IO (often blocked but worth a try)
        (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`
    ];

    let lastError = null;

    for (const proxyGen of proxies) {
        try {
            const proxyUrl = proxyGen(url);
            console.log(`Trying proxy: ${proxyUrl}`);
            const response = await fetch(proxyUrl);

            if (!response.ok) {
                throw new Error(`Status ${response.status}`);
            }

            return response;
        } catch (e) {
            console.warn(`Proxy failed:`, e);
            lastError = e;
        }
    }

    throw new Error('All CORS proxies failed. Please try using a browser extension like "Allow CORS" or run a local proxy.');
}

// Crawl bloxd.io scripts to find item list
async function fetchLatestGameItems() {
    console.log('Fetching asset-manifest.json from bloxd.io...');

    // 1. Fetch Manifest (Method from viewer.js)
    const manifestUrl = 'https://bloxd.io/asset-manifest.json';
    let manifest;
    try {
        const manifestRes = await fetchWithProxy(manifestUrl);
        manifest = await manifestRes.json();
    } catch (e) {
        console.error("Failed to fetch manifest:", e);
        throw new Error("Could not fetch bloxd.io manifest. Check connection or CORS.");
    }

    // 2. Define target chunks to scan in order of likelihood for Items
    // viewer.js uses chunk 3 (blocks). We also check 32 (items).
    // User requested 3 -> 32 order.
    const chunkIds = ['3', '32'];
    let allItems = [];
    const scannedUrls = new Set();

    for (const id of chunkIds) {
        // Find chunk key using regex (same logic as viewer.js)
        const regex = new RegExp(`^static\\/js\\/.*\\.${id}\\.[a-f0-9]+\\.chunk\\.js$`);
        const chunkKey = Object.keys(manifest.files).find(key => regex.test(key));

        if (!chunkKey) {
            console.warn(`Chunk ${id} not found in manifest.`);
            continue;
        }

        const url = `https://bloxd.io${manifest.files[chunkKey]}`;
        if (scannedUrls.has(url)) continue;
        scannedUrls.add(url);

        try {
            console.log(`Scanning chunk ${id}: ${url}...`);
            const chunkRes = await fetchWithProxy(url);
            const jsText = await chunkRes.text();

            let foundInFile = false;

            // Strategy 1: Anchor Search (Object format: Unloaded:0)
            const anchorResult = scanStartingFromAnchor(jsText);
            if (anchorResult && anchorResult.length > 20) {
                console.log(`Found ${anchorResult.length} items in chunk ${id} (Anchor)`);
                allItems = allItems.concat(anchorResult);
                foundInFile = true;
            }

            // Strategy 2: Large String Array Search
            if (!foundInFile) {
                const arrayResult = scanForLargeStringArray(jsText);
                if (arrayResult && arrayResult.length > 20) {
                    console.log(`Found ${arrayResult.length} items in chunk ${id} (Large String Array)`);
                    allItems = allItems.concat(arrayResult);
                    foundInFile = true;
                }
            }

            // Strategy 3: Heuristic Search
            if (!foundInFile) {
                const heuristicResult = scanForSequentialEnums(jsText);
                if (heuristicResult && heuristicResult.length > 20) {
                    console.log(`Found ${heuristicResult.length} items in chunk ${id} (Heuristic)`)
                    allItems = allItems.concat(heuristicResult);
                    foundInFile = true;
                }
            }

            // Strategy 4: textureInfo extraction (same as viewer.js)
            if (!foundInFile) {
                const textureInfoResult = scanForTextureInfoBlocks(jsText);
                if (textureInfoResult && textureInfoResult.length > 20) {
                    console.log(`Found ${textureInfoResult.length} blocks in chunk ${id} (textureInfo)`);
                    allItems = allItems.concat(textureInfoResult);
                    foundInFile = true;
                }
            }

        } catch (e) {
            console.warn(`Failed scanning chunk ${id} (${url}):`, e);
        }
    }

    if (allItems.length > 0) {
        // Deduplicate and filter out items containing "|"
        const uniqueItems = [...new Set(allItems.map(item => typeof item === 'string' ? item : item.name))]
            .filter(item => !item.includes('|'));
        console.log(`Total unique items found: ${uniqueItems.length} (excluded items with |)`);
        return uniqueItems;
    }

    throw new Error("Item list not found in target chunks (32, 3).");
}

// Strategy 4: textureInfo extraction (viewer.js approach)
function scanForTextureInfoBlocks(text) {
    const blockNames = [];
    const textureInfoRegex = /textureInfo:(\[[^\]]*\]|\"[^\"]+\"|[a-zA-Z0-9_$]+(?:\.[a-zA-Z0-9_$]+)?)/g;
    let match;

    while ((match = textureInfoRegex.exec(text)) !== null) {
        const infoPos = match.index;

        // Lookback for block name
        const scanLimit = 1500;
        const startScan = Math.max(0, infoPos - scanLimit);
        const lookbackText = text.substring(startScan, infoPos);

        const candidates = [];
        const wrapperRegex = /(?:[a-zA-Z0-9_$]{1,3})\(\s*\"([^\"]+)\"\s*,/g;
        let wMatch;
        while ((wMatch = wrapperRegex.exec(lookbackText)) !== null) {
            candidates.push({ name: wMatch[1], pos: wMatch.index });
        }

        const objRegex = /(?:\"([^\"]+)\"|([a-zA-Z0-9_$]+))\s*:\s*\{/g;
        let oMatch;
        while ((oMatch = objRegex.exec(lookbackText)) !== null) {
            candidates.push({ name: oMatch[1] || oMatch[2], pos: oMatch.index });
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => b.pos - a.pos);
            const keywords = ['displayName', 'translationKey', 'ttb', 'textureInfo', 'harvestType', 'soundType', 'description', 'specialToolDrop', 'onMinedAura', 'specialToolBonusDrops', 'soundGroup'];

            for (const cand of candidates) {
                if (!keywords.includes(cand.name) && !blockNames.includes(cand.name)) {
                    blockNames.push(cand.name);
                    break;
                }
            }
        }
    }

    return blockNames.length > 0 ? blockNames : null;
}

function scanStartingFromAnchor(text) {
    const markers = [/Unloaded\s*[:=]\s*0/, /Unloaded\s*=\s*0/, /"Unloaded"\s*:\s*0/];

    for (const marker of markers) {
        const match = text.match(marker);
        if (match) {
            console.log(`Found anchor at index ${match.index}`);
            return extractSequentialItems(text, match.index);
        }
    }
    return null;
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

// Strategy 2: Large String Array Search
// Finds the longest array of strings in the file. Reliable for item lists.
function scanForLargeStringArray(text) {
    // fast heuristic: look for start of string arrays
    // e.g. ["Item1","Item2"... or ['Item1','Item2'...
    // Allow single quotes and lack of spaces for minification
    const startRegex = /\[\s*(?:'|")[^'"]+(?:'|")\s*,\s*(?:'|")[^'"]+/g;
    let match;
    let bestArray = [];

    // Candidate arrays must contain at least one of these to be considered the item list
    const mandatoryKeywords = ['Dirt', 'Stone', 'Wood', 'Grass Block', 'Air'];

    while ((match = startRegex.exec(text)) !== null) {
        const startIndex = match.index;

        // Quick check: does the surrounding 1200 chars contain keywords?
        const preview = text.substring(startIndex, startIndex + 1200);
        if (!mandatoryKeywords.some(kw => preview.includes(kw))) {
            continue;
        }

        // Extract full array
        let openBrackets = 0;
        let arrayStr = '';
        let validParse = false;
        let inString = false;
        let quoteChar = '';

        for (let i = startIndex; i < text.length; i++) {
            const char = text[i];

            // Handle strings to ignore brackets inside them
            if (inString) {
                if (char === quoteChar && text[i - 1] !== '\\') {
                    inString = false;
                }
                arrayStr += char;
                continue;
            }

            if (char === '"' || char === "'") {
                inString = true;
                quoteChar = char;
                arrayStr += char;
                continue;
            }

            if (char === '[') openBrackets++;
            if (char === ']') openBrackets--;

            arrayStr += char;

            if (openBrackets === 0) {
                validParse = true;
                break;
            }
            // Safety break
            if (arrayStr.length > 200000) break;
        }

        if (validParse) {
            try {
                // heuristic cleanup: replace single quotes if mostly standard json
                // tricky if content contains single quotes, but usually game IDs don't.
                // Safest to try parsing as JS code if JSON fails? No, eval is bad.
                // Let's rely on JSON.parse after normalizing quotes.

                // 1. If it looks like JSON already, try parse
                let items;
                try {
                    items = JSON.parse(arrayStr);
                } catch (e) {
                    // 2. Try swapping single quotes to double quotes for outer wrappers?
                    // Be careful not to break internal quotes.
                    // Simple regex replace for 'item' -> "item"
                    const fixedStr = arrayStr.replace(/'/g, '"');
                    items = JSON.parse(fixedStr);
                }

                if (Array.isArray(items) && items.length > bestArray.length) {
                    // Check if it's a string array (allow some nulls/numbers if mixed, but mostly strings)
                    const stringCount = items.filter(i => typeof i === 'string').length;
                    if (stringCount > items.length * 0.8 && stringCount > 50) {
                        bestArray = items;
                    }
                }
            } catch (e) {
                // ignore parse error
            }
        }
    }

    // Normalize result: filter out non-strings if any
    if (bestArray.length > 0) {
        return bestArray.filter(i => typeof i === 'string');
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







async function loadWikiData() {
    if (elements.wikiDataStatus) {
        elements.wikiDataStatus.className = 'status loading';
        elements.wikiDataStatus.textContent = '読み込み中...';
    }

    // Wiki-specific CORS proxies (some work better for MediaWiki)
    const wikiProxies = [
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
        (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
        (u) => `https://cors-anywhere.herokuapp.com/${u}`,
    ];

    for (const proxyGen of wikiProxies) {
        try {
            const proxyUrl = proxyGen(CONFIG.wikiDataUrl);
            console.log(`Trying Wiki proxy: ${proxyUrl}`);
            const res = await fetch(proxyUrl);

            if (!res.ok) continue;

            const text = await res.text();

            // Check if it's HTML error page
            if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
                console.warn('Wiki proxy returned HTML, trying next...');
                continue;
            }

            const data = JSON.parse(text);
            state.wikiTranslations = data;

            const count = Object.keys(state.wikiTranslations).length;
            if (elements.wikiDataStatus) {
                elements.wikiDataStatus.className = 'status success';
                elements.wikiDataStatus.textContent = `${count} 翻訳読み込み完了`;
            }
            return true;
        } catch (e) {
            console.warn('Wiki proxy failed:', e);
        }
    }

    // All proxies failed
    if (elements.wikiDataStatus) {
        elements.wikiDataStatus.className = 'status error';
        elements.wikiDataStatus.textContent = 'エラー: Wiki接続失敗 (CORS)';
    }
    state.wikiTranslations = {};
    return false;
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
    // Handle orphan filter separately (Wiki items not in game)
    if (state.currentFilter === 'orphan') {
        const gameItemsSet = new Set(state.gameItems);
        const orphanItems = Object.keys(state.wikiTranslations)
            .filter(wikiKey => !gameItemsSet.has(wikiKey))
            .map((name, index) => ({
                name,
                originalIndex: index,
                translation: state.wikiTranslations[name],
                isTranslated: true,
                isOrphan: true
            }));

        if (state.searchQuery) {
            const query = state.searchQuery.toLowerCase();
            return orphanItems.filter(item =>
                item.name.toLowerCase().includes(query) ||
                (item.translation && item.translation.includes(query))
            );
        }
        return orphanItems;
    }

    // Normal game items filter
    let items = state.gameItems.map((name, index) => ({
        name,
        originalIndex: index,
        translation: state.wikiTranslations[name] || null,
        isTranslated: state.wikiTranslations[name] !== undefined,
        isOrphan: false
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

    // Show ALL items (no limit)
    const html = items.map(item => {
        let statusClass = item.isTranslated ? 'translated' : 'missing';
        let statusText = item.isTranslated ? '✓ 翻訳済み' : '⚠ 未翻訳';

        if (item.isOrphan) {
            statusClass = 'orphan';
            statusText = '🗑 ゲームに無し';
        }

        return `
        <div class="item-row ${statusClass}">
            <div class="item-index">#${item.originalIndex + 1}</div>
            <div class="item-name">
                <div class="english">${escapeHtml(item.name)}</div>
                ${item.translation ? `<div class="japanese">→ ${escapeHtml(item.translation)}</div>` : ''}
            </div>
            <div class="item-status ${statusClass}">
                ${statusText}
            </div>
        </div>
    `}).join('');

    if (elements.itemList) {
        elements.itemList.innerHTML = html;
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

function getMissingItemsWithPositions() {
    // Returns groups of missing items with their insertion position info
    const groups = [];
    let currentGroup = null;

    for (let i = 0; i < state.gameItems.length; i++) {
        const item = state.gameItems[i];
        const isMissing = state.wikiTranslations[item] === undefined;

        if (isMissing) {
            if (!currentGroup) {
                // Find the last translated item before this one
                let prevTranslated = null;
                for (let j = i - 1; j >= 0; j--) {
                    if (state.wikiTranslations[state.gameItems[j]] !== undefined) {
                        prevTranslated = state.gameItems[j];
                        break;
                    }
                }
                currentGroup = {
                    insertAfter: prevTranslated,
                    startIndex: i + 1, // 1-indexed for display
                    items: []
                };
            }
            currentGroup.items.push(item);
        } else {
            if (currentGroup) {
                groups.push(currentGroup);
                currentGroup = null;
            }
        }
    }

    // Don't forget the last group
    if (currentGroup) {
        groups.push(currentGroup);
    }

    return groups;
}

function generateTemplate() {
    const groups = getMissingItemsWithPositions();

    if (groups.length === 0) {
        return '// すべてのアイテムが翻訳済みです！';
    }

    let output = '';

    for (const group of groups) {
        // Add position header
        if (group.insertAfter) {
            output += `// === 「${group.insertAfter}」の後に挿入 (#${group.startIndex}～) ===\n`;
        } else {
            output += `// === ファイルの先頭に挿入 (#${group.startIndex}～) ===\n`;
        }

        // Add items
        output += group.items.map(item => `\t"${item}": ""`).join(',\n');
        output += '\n\n';
    }

    return output.trim();
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
