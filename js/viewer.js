let textures = []; // Store fetched texture data
let blockMapping = {}; // Store block -> texture info
let textureBase64Data = {}; // Store texture name -> base64 mapping
let faces = {}; // Store face elements
let inputs = {}; // Store input elements
let clearBtns = {}; // Store clear button elements
let lists = {}; // Store list elements

// Elements
let halfBlockToggle;
let allFacesSameToggle;
let showSpecialToggle;
let showNoTextureToggle;
let saveBtn;

// Multi-Select Elements
let multiSelectToggle;
let selectAllBtn;
let selectedCountSpan;
let multiSelectActions;
let selectedBlocks = new Set();
let currentFilteredBlockItems = [];

// Cancellation
let cancelBtn;
let isExportCanceling = false;

function updateSelectedCount() {
    if (selectedCountSpan) selectedCountSpan.textContent = `${selectedBlocks.size}個選択中`;
}
let loadingIndicator;
let sideInputs;
let topLabel;

// OS
let userAgent;


function isTextureHalfHeight(texture) {
    try {
        const img = new Image();
        img.src = texture.base64;

        if (img.complete && img.naturalWidth > 0) {
            return img.naturalWidth === 16 && img.naturalHeight === 8;
        }
    } catch (e) {
        console.warn('Failed to parse texture dimensions:', texture.name);
    }

    return false;
}

function isTextureNonStandard(texture) {
    try {
        const img = new Image();
        img.src = texture.base64;

        if (img.complete && img.naturalWidth > 0) {
            const aspectRatio = img.naturalWidth / img.naturalHeight;
            return aspectRatio < 0.5 || aspectRatio > 2.0;
        }
    } catch (e) {
        console.warn('Failed to parse texture dimensions:', texture.name);
    }

    return false;
}

function isHalfHeightBlock(blockName) {
    // Check if block name ends with " Slab"
    if (blockName.endsWith(' Slab')) {
        return true;
    }

    // Check if block name matches "Fallen * Leaves" pattern
    if (blockName.startsWith('Fallen ') && blockName.endsWith(' Leaves')) {
        return true;
    }

    return false;
}

function isNonFullBlock(blockName) {
    if (isHalfHeightBlock(blockName)) return false;

    const mapping = blockMapping[blockName];
    if (!mapping) return false;

    const info = mapping.info;
    const texNames = Array.isArray(info) ? info : [info];

    return texNames.some(texName => {
        if (typeof texName !== 'string') return false;
        const texture = textures.find(t => t.name.toLowerCase() === texName.toLowerCase());
        if (!texture || !texture.base64) return false;

        return isTextureNonStandard(texture);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Get Elements
    halfBlockToggle = document.getElementById('half-block-toggle');
    allFacesSameToggle = document.getElementById('all-faces-same-toggle');
    showSpecialToggle = document.getElementById('show-special-toggle');
    showNoTextureToggle = document.getElementById('show-no-texture-toggle');
    saveBtn = document.getElementById('save-btn');
    cancelBtn = document.getElementById('cancel-btn');

    // Multi-Select Elements
    multiSelectToggle = document.getElementById('multi-select-toggle');
    selectAllBtn = document.getElementById('select-all-btn');
    selectedCountSpan = document.getElementById('selected-count');
    multiSelectActions = document.getElementById('multi-select-actions');

    loadingIndicator = document.getElementById('loading-indicator');
    sideInputs = document.querySelectorAll('.side-input');
    topLabel = document.getElementById('top-label');

    faces = {
        top: document.querySelector('.Face.top'),
        left: document.querySelector('.Face.left'),
        right: document.querySelector('.Face.right')
    };

    inputs = {
        block: document.getElementById('block-search'),
        top: document.getElementById('texture-search-top'),
        left: document.getElementById('texture-search-side-l'),
        right: document.getElementById('texture-search-side-r')
    };

    clearBtns = {
        block: document.getElementById('clear-block-search'),
        top: document.getElementById('clear-texture-top'),
        left: document.getElementById('clear-texture-side-l'),
        right: document.getElementById('clear-texture-side-r')
    };

    lists = {
        block: document.getElementById('list-block'),
        top: document.getElementById('list-top'),
        left: document.getElementById('list-side-l'),
        right: document.getElementById('list-side-r')
    };

    userAgent = window.navigator.userAgent.toLowerCase();

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('bloxd-theme') || 'light'; // Default to light

    // Disable transition during initial load for instant theme application
    document.body.style.transition = 'none';

    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        themeToggle.textContent = '☀️';
    } else {
        document.body.classList.remove('light-theme');
        themeToggle.textContent = '🌙';
    }

    // Re-enable transitions after a short delay
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            document.body.style.transition = '';
        });
    });

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        themeToggle.textContent = isLight ? '☀️' : '🌙';
        localStorage.setItem('bloxd-theme', isLight ? 'light' : 'dark');
    });

    // Initialize Listeners
    setupListeners();

    // Start Fetching
    init();
});

function setupListeners() {
    // Toggle Listeners
    halfBlockToggle.addEventListener('change', updateHalfBlock);
    allFacesSameToggle.addEventListener('change', updateAllFacesSame);

    // Filter Toggles
    const refreshBlockList = () => {
        // If block input is focused or active, refresh list
        if (document.activeElement === inputs.block || (lists.block && !lists.block.classList.contains('hidden'))) {
            handleInputFocus('block');
        }
    };
    showSpecialToggle.addEventListener('change', refreshBlockList);
    showNoTextureToggle.addEventListener('change', refreshBlockList);

    // Save Button
    if (saveBtn) saveBtn.addEventListener('click', saveImage);

    // Cancel Button
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            isExportCanceling = true;
            cancelBtn.textContent = 'キャンセル中...';
            cancelBtn.disabled = true;
        });
    }

    // Multi-Select Listeners
    multiSelectToggle.addEventListener('change', () => {
        selectedBlocks.clear();
        updateSelectedCount();
        if (multiSelectToggle.checked) {
            multiSelectActions.classList.remove('hidden');
        } else {
            multiSelectActions.classList.add('hidden');
        }

        if (!lists.block.classList.contains('hidden')) {
            handleInputFocus('block');
        }
    });

    selectAllBtn.addEventListener('click', () => {
        // Recalculate filtered items to ensure we select exactly what matches current filters
        const sourceData = Object.keys(blockMapping).map(name => ({ name }));
        const val = inputs.block.value.toLowerCase();

        const showSpecial = showSpecialToggle.checked;
        const showNoTexture = showNoTextureToggle.checked;

        let itemsToSelect = sourceData.filter(item => {
            const name = item.name;
            const isSpecial = name.includes('|') || isNonFullBlock(name);

            // Priority: Special Check
            if (isSpecial) return showSpecial;

            // No Texture Check
            const mapping = blockMapping[name];
            let hasNoTexture = false;
            if (mapping) {
                const info = mapping.info;
                const texNames = Array.isArray(info) ? info : [info];
                const hasMissing = texNames.some(tn =>
                    typeof tn === 'string' && !textures.find(t => t.name.toLowerCase() === tn.toLowerCase())
                );
                const allNumbers = texNames.every(tn => typeof tn === 'number');
                if (hasMissing || allNumbers) hasNoTexture = true;
            }

            if (hasNoTexture) return showNoTexture;

            return true;
        });

        // Apply search filter
        if (val) {
            itemsToSelect = itemsToSelect.filter(item => item.name.toLowerCase().includes(val));
        }

        // Update global filtered items just in case
        currentFilteredBlockItems = itemsToSelect;

        if (itemsToSelect.length === 0) return;

        const allSelected = itemsToSelect.every(item => selectedBlocks.has(item.name));
        if (allSelected) {
            itemsToSelect.forEach(item => selectedBlocks.delete(item.name));
        } else {
            itemsToSelect.forEach(item => selectedBlocks.add(item.name));
        }
        updateSelectedCount();

        // Refresh list if visible
        if (!lists.block.classList.contains('hidden')) {
            populateList('block', itemsToSelect);
        }
    });

    // Input Listeners
    ['block', 'top', 'left', 'right'].forEach(key => {
        const input = inputs[key];
        const list = lists[key];

        if (!input) return;

        input.addEventListener('focus', () => {
            handleInputFocus(key);
        });

        input.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            const sourceData = key === 'block' ? Object.keys(blockMapping).map(name => ({ name })) : textures;

            // Clear texture if input is empty
            if (val === '') {
                if (key !== 'block') clearTexture(key);
                populateList(key, sourceData);
                openList(key);
                return;
            }

            // Apply toggle filters first for blocks
            let filteredData = sourceData;
            if (key === 'block') {
                const showSpecial = showSpecialToggle.checked;
                const showNoTexture = showNoTextureToggle.checked;

                filteredData = sourceData.filter(item => {
                    const name = item.name;
                    const isSpecial = name.includes('|') || isNonFullBlock(name);

                    // Priority: Special Check
                    if (isSpecial) return showSpecial;

                    // No Texture Check
                    const mapping = blockMapping[name];
                    let hasNoTexture = false;
                    if (mapping) {
                        const info = mapping.info;
                        const texNames = Array.isArray(info) ? info : [info];
                        const hasMissing = texNames.some(tn =>
                            typeof tn === 'string' && !textures.find(t => t.name.toLowerCase() === tn.toLowerCase())
                        );
                        const allNumbers = texNames.every(tn => typeof tn === 'number');
                        if (hasMissing || allNumbers) hasNoTexture = true;
                    }

                    if (hasNoTexture) return showNoTexture;

                    return true;
                });
            }

            // Check if input exactly matches a name
            const exactMatch = filteredData.find(t => t.name.toLowerCase() === val);
            const searchFiltered = filteredData.filter(t => t.name.toLowerCase().includes(val));

            // Only apply if there's an exact match
            if (exactMatch) {
                if (key === 'block') {
                    selectBlock(exactMatch.name);
                } else {
                    selectTexture(key, exactMatch);
                }
            } else {
                if (key !== 'block') {
                    clearTexture(key);
                }
            }

            populateList(key, searchFiltered);
            openList(key);
            updateClearBtnVisibility(key);
        });

        const clearBtn = clearBtns[key];
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                inputs[key].value = '';
                if (key !== 'block') clearTexture(key);

                const sourceData = key === 'block' ? Object.keys(blockMapping).map(name => ({ name })) : textures;
                populateList(key, sourceData);
                updateClearBtnVisibility(key);
                inputs[key].focus();
            });
        }
    });

    // Global click listener to close dropdowns
    document.addEventListener('click', (e) => {
        ['block', 'top', 'left', 'right'].forEach(key => {
            const wrapper = inputs[key]?.closest('.search-container');
            if (wrapper && !wrapper.contains(e.target)) {
                closeList(key);
            }
        });
    });
}

function updateHalfBlock() {
    const isHalf = halfBlockToggle.checked;
    const root = document.documentElement;

    // Set CSS variables
    if (isHalf) {
        root.style.setProperty('--height', '50%');
        root.style.setProperty('--top', '15px');
    } else {
        root.style.setProperty('--height', '100%');
        root.style.setProperty('--top', '-22.5px');
    }
}

function updateAllFacesSame() {
    const isSame = allFacesSameToggle.checked;

    // Update label
    if (isSame) {
        topLabel.textContent = 'テクスチャ';
    } else {
        topLabel.textContent = '上面';
    }

    // Show/Hide side inputs
    sideInputs.forEach(el => {
        if (isSame) {
            el.classList.add('hidden');
        } else {
            el.classList.remove('hidden');
        }
    });

    // If switching TO same, apply top texture to sides immediately
    if (isSame) {
        const topUrl = faces.top.style.backgroundImage;
        if (topUrl) {
            applyTextureToFace('left', topUrl);
            applyTextureToFace('right', topUrl);

            inputs.left.value = inputs.top.value;
            inputs.right.value = inputs.top.value;
        }
    }
}

// CORS Proxy Helper
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

            // Check if we got an HTML error page instead of expected content
            // We can't clone the response easily if we want to return it, so we check headers or text later
            // For now, assume OK. The caller should verify content.

            return response;
        } catch (e) {
            console.warn(`Proxy failed:`, e);
            lastError = e;
        }
    }

    throw new Error('All CORS proxies failed. Please try using a browser extension like "Allow CORS" or run a local proxy.');
}

// Data Fetching
async function init() {
    try {
        loadingIndicator.classList.remove('hidden');
        loadingIndicator.textContent = 'テクスチャを読み込み中...';
        // Disable all inputs during loading
        inputs.block.disabled = true;
        inputs.top.disabled = true;
        inputs.left.disabled = true;
        inputs.right.disabled = true;

        // Fetch both texture base64 and block mapping in parallel
        await Promise.all([
            fetchTextureBase64(),
            fetchBlockMapping()
        ]);

        console.log('✅ All data loaded successfully');
        console.log('--------------------------------------------------');
        console.log(`Summary:`);
        console.log(`- Textures Loaded: ${textures.length}`);
        console.log(`- Blocks Mapped: ${Object.keys(blockMapping).length}`);
        console.log('--------------------------------------------------');

    } catch (error) {
        console.error('Init Failed:', error);
        alert(`テクスチャの読み込みに失敗しました。\n\n詳細: ${error.message}\n\n解決しない場合は、ブラウザ拡張機能「Allow CORS」などを試してみてください。`);
    } finally {
        loadingIndicator.classList.add('hidden');
        // Re-enable all inputs after loading
        inputs.block.disabled = false;
        inputs.top.disabled = false;
        inputs.left.disabled = false;
        inputs.right.disabled = false;
    }
}

async function fetchTextureBase64() {
    try {
        console.log('Fetching texture base64 from bloxd.io...');

        const manifestUrl = 'https://bloxd.io/asset-manifest.json';
        const manifestRes = await fetchWithProxy(manifestUrl);
        const manifest = await manifestRes.json();
        console.log('Fetched manifest:', manifest);

        // Find chunk 2 URL (contains texture assets)
        const chunkKey = Object.keys(manifest.files).find(key => /^static\/js\/.*\.2\.[a-f0-9]+\.chunk\.js$/.test(key));
        if (!chunkKey) throw new Error('Chunk 2 not found in manifest');

        const chunkUrl = `https://bloxd.io${manifest.files[chunkKey]}`;
        console.log('Fetching texture chunk:', chunkUrl);

        const chunkRes = await fetchWithProxy(chunkUrl);
        const chunkText = await chunkRes.text();
        console.log(`Fetched chunk size: ${chunkText.length} bytes`);

        console.log('Parsing texture mappings...');

        // Find the texture path-to-module-ID mapping by looking for the characteristic pattern
        // This object contains mappings like "./dirt.png": 2917
        const pathMapMatch = chunkText.match(/var\s+[a-zA-Z0-9_$]+\s*=\s*\{("\.\/[^"]+\.png":\d+,?[\s\S]{5000,50000})\}/);
        if (!pathMapMatch) throw new Error('Texture path mapping not found');

        const pathToModuleId = {};
        const pathIdRegex = /"(\.\/[^"]+\.png)"\s*:\s*(\d+)/g;
        let match;
        while ((match = pathIdRegex.exec(pathMapMatch[1])) !== null) {
            pathToModuleId[match[1]] = parseInt(match[2]);
        }

        console.log(`Found ${Object.keys(pathToModuleId).length} texture path mappings`);

        // Extract base64 data for each texture
        textureBase64Data = {};
        let extractedCount = 0;

        for (const [texPath, moduleId] of Object.entries(pathToModuleId)) {
            const nameMatch = texPath.match(/\.\/(.+)\.png$/);
            if (!nameMatch) continue;
            const name = nameMatch[1];

            // Find module by ID and extract base64
            const moduleRegex = new RegExp(`${moduleId}\\s*:\\s*[a-zA-Z0-9_$]+\\s*=>\\s*\\{[^}]*[a-zA-Z0-9_$]+\\.exports\\s*=\\s*"(data:image/png;base64,[^"]+)"`);
            const moduleMatch = chunkText.match(moduleRegex);

            if (moduleMatch) {
                textureBase64Data[name] = moduleMatch[1];
                extractedCount++;
            }
        }

        // Convert to texture array
        textures = Object.entries(textureBase64Data).map(([name, base64]) => ({
            name,
            base64
        }));

        console.log(`Loaded ${textures.length} textures with base64 data`);

    } catch (err) {
        console.error('Failed to fetch texture base64:', err);
        throw err;
    }
}

async function fetchBlockMapping() {
    try {
        console.log('Fetching block mapping from bloxd.io...');

        const manifestUrl = 'https://bloxd.io/asset-manifest.json';
        const manifestRes = await fetchWithProxy(manifestUrl);
        const manifest = await manifestRes.json();

        // Find chunk 3 URL
        const chunkKey = Object.keys(manifest.files).find(key => /^static\/js\/.*\.3\.[a-f0-9]+\.chunk\.js$/.test(key));
        if (!chunkKey) throw new Error('Chunk 3 not found in manifest');

        const chunkUrl = `https://bloxd.io${manifest.files[chunkKey]}`;
        console.log('Fetching chunk:', chunkUrl);

        const chunkRes = await fetchWithProxy(chunkUrl);
        const chunkText = await chunkRes.text();


        const tempMapping = {};

        // Use the refined lookback parsing logic
        const textureInfoRegex = /textureInfo:(\[.*?\]|"[^"]+"|[a-zA-Z0-9_$]+(?:\.[a-zA-Z0-9_$]+)?)/g;
        let match;

        while ((match = textureInfoRegex.exec(chunkText)) !== null) {
            let infoStr = match[1].trim();
            const infoPos = match.index;

            let info;
            if (infoStr.startsWith('"')) {
                info = infoStr.replace(/"/g, '');
            } else if (infoStr.startsWith('[')) {
                try {
                    const cleaned = infoStr.replace(/'/g, '"').replace(/([a-zA-Z0-9_$]+)(?=\s*[,\]])/g, '"$1"');
                    info = JSON.parse(cleaned);
                } catch (e) {
                    info = infoStr.replace(/[\[\]"]/g, '').split(',').map(s => s.trim());
                }
            } else {
                info = infoStr;
            }

            // Lookback for name AND texturePerSide
            const scanLimit = 1500;
            const startScan = Math.max(0, infoPos - scanLimit);
            const lookbackText = chunkText.substring(startScan, infoPos);

            // Texture mapping check (texturePerSide or 3rd argument of De/ye)
            let perSide = null;

            // 1. Check for explicit texturePerSide label
            const perSideMatch = /texturePerSide:(\[+[^\]]+\]+)/.exec(chunkText.substring(infoPos, infoPos + 500));
            if (perSideMatch) {
                try {
                    const parsed = JSON.parse(perSideMatch[1].replace(/'/g, '"'));
                    perSide = Array.isArray(parsed[0]) ? parsed[0] : parsed;
                } catch (e) { }
            }

            // 2. If not found, check if it's a De/ye call with a 3rd argument
            if (!perSide) {
                const deMatch = /De\s*\(\s*"[^"]+"\s*,\s*\{[^}]*textureInfo:[^}]*\}\s*,\s*(\[+[^\]]+\]+)/.exec(chunkText.substring(startScan, infoPos + 500));
                if (deMatch) {
                    try {
                        const parsed = JSON.parse(deMatch[1].replace(/'/g, '"'));
                        perSide = Array.isArray(parsed[0]) ? parsed[0] : parsed;
                    } catch (e) { }
                }
            }

            const candidates = [];
            const wrapperRegex = /(?:[a-zA-Z0-9_$]{1,3})\(\s*"([^"]+)"\s*,/g;
            let wMatch;
            while ((wMatch = wrapperRegex.exec(lookbackText)) !== null) {
                candidates.push({ name: wMatch[1], pos: wMatch.index });
            }

            const objRegex = /(?:"([^"]+)"|([a-zA-Z0-9_$]+))\s*:\s*\{/g;
            let oMatch;
            while ((oMatch = objRegex.exec(lookbackText)) !== null) {
                candidates.push({ name: oMatch[1] || oMatch[2], pos: oMatch.index });
            }

            if (candidates.length > 0) {
                candidates.sort((a, b) => b.pos - a.pos);
                let bestName = null;
                const keywords = ['displayName', 'translationKey', 'ttb', 'textureInfo', 'harvestType', 'soundType', 'description', 'specialToolDrop', 'onMinedAura', 'specialToolBonusDrops', 'soundGroup'];

                for (const cand of candidates) {
                    if (!keywords.includes(cand.name)) {
                        bestName = cand.name;
                        break;
                    }
                }

                if (bestName && !tempMapping[bestName]) {
                    tempMapping[bestName] = { info, perSide };
                }
            }
        }

        blockMapping = tempMapping;
        const blockNames = Object.keys(blockMapping);
        console.log(`Loaded ${blockNames.length} block mappings`);
        if (blockNames.length > 0) {
            console.log('Sample blocks:', blockNames.slice(0, 5));
        } else {
            console.warn('No block mappings were parsed! Check regex or chunk content.');
        }
    } catch (err) {
        console.error('Failed to fetch block mapping:', err);
    }
}

function populateList(key, items) {
    if (key === 'block') currentFilteredBlockItems = items;

    const list = lists[key];
    if (!list) return;

    list.innerHTML = '';

    if (items.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No results';
        li.classList.add('no-result');
        list.appendChild(li);
        return;
    }

    items.forEach(item => {
        const li = document.createElement('li');

        if (key === 'block' && multiSelectToggle && multiSelectToggle.checked) {
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = selectedBlocks.has(item.name);
            checkbox.style.marginRight = '8px';
            // Stop propagation to avoid triggering li click immediately if user meant just to check
            // But actually li click toggles too, so maybe let it propagate? 
            // Better to handle in li click.
            checkbox.addEventListener('click', (e) => {
                e.stopPropagation();
                if (checkbox.checked) selectedBlocks.add(item.name);
                else selectedBlocks.delete(item.name);
                updateSelectedCount();
                // Preview on check, keep list open
                selectBlock(item.name, true);
            });
            li.appendChild(checkbox);
        }

        let label = item.name;

        // Check for missing textures if this is the block list
        if (key === 'block') {
            const mapping = blockMapping[item.name];
            if (mapping) {
                const info = mapping.info;
                const texNames = Array.isArray(info) ? info : [info];
                const hasMissing = texNames.some(tn =>
                    typeof tn === 'string' && !textures.find(t => t.name.toLowerCase() === tn.toLowerCase())
                );

                const allNumbers = texNames.every(tn => typeof tn === 'number');

                if (hasMissing || allNumbers) {
                    label += ' <span style="opacity: 0.6; font-size: 0.85em; margin-left: 8px; font-weight: normal; color: #ff8888;">(テクスチャなし)</span>';
                } else if (isHalfHeightBlock(item.name)) {
                    label += ' <span style="opacity: 0.6; font-size: 0.85em; margin-left: 8px; font-weight: normal; color: #88ccff;">(ハーフブロック)</span>';
                }
            }
        }

        const textSpan = document.createElement('span');
        textSpan.innerHTML = label;
        li.appendChild(textSpan);

        li.addEventListener('click', () => {
            if (key === 'block') {
                if (multiSelectToggle && multiSelectToggle.checked) {
                    const isSelected = selectedBlocks.has(item.name);
                    if (isSelected) selectedBlocks.delete(item.name);
                    else selectedBlocks.add(item.name);

                    const cb = li.querySelector('input[type="checkbox"]');
                    if (cb) cb.checked = !isSelected;

                    updateSelectedCount();
                    // Preview on click, keep list open
                    selectBlock(item.name, true);
                } else {
                    selectBlock(item.name);
                }
            } else {
                selectTexture(key, item);
            }
        });
        list.appendChild(li);
    });
}

function selectBlock(name, keepOpen = false) {
    const mapping = blockMapping[name];
    if (!mapping) return;

    inputs.block.value = name;

    // Auto-toggle half-block based on name pattern
    const shouldBeHalf = isHalfHeightBlock(name);
    if (shouldBeHalf !== halfBlockToggle.checked) {
        halfBlockToggle.checked = shouldBeHalf;
        updateHalfBlock();
    }

    updateClearBtnVisibility('block');
    if (!keepOpen) {
        closeList('block');
    }

    const info = mapping.info;
    const perSide = mapping.perSide;

    let texturesToApply = { top: null, left: null, right: null };
    let missingTextures = [];

    // bloxd.io face index mapping: 0:right, 1:left, 2:top, 3:bottom, 4:front, 5:back
    // For isometric view, user requested:
    // Our Left Face -> Bloxd Front (4)
    // Our Right Face -> Bloxd Right (0)
    // Our Top Face -> Bloxd Top (2)
    if (Array.isArray(info)) {
        if (perSide && Array.isArray(perSide)) {
            // Use perSide mapping if available
            texturesToApply.left = info[perSide[4] !== undefined ? perSide[4] : perSide[1]];
            texturesToApply.right = info[perSide[0] !== undefined ? perSide[0] : perSide[1]];
            texturesToApply.top = info[perSide[2] !== undefined ? perSide[2] : (info.length > 2 ? 2 : 0)];
        } else {
            // Fallback for array info
            // For chest-like blocks, prefer index 3 (chest_top_2) if available
            if (info.length >= 4 && name.toLowerCase().includes('chest')) {
                texturesToApply.top = info[3]; // chest_top_2
                texturesToApply.left = info[0]; // chest_front
                texturesToApply.right = info[1]; // chest_side
            } else if (info.length >= 3) {
                texturesToApply.top = info[2];
                texturesToApply.left = info[0];
                texturesToApply.right = info[1];
            } else if (info.length === 2) {
                texturesToApply.top = info[1];
                texturesToApply.left = info[0];
                texturesToApply.right = info[0];
            } else {
                texturesToApply.top = info[0];
                texturesToApply.left = info[0];
                texturesToApply.right = info[0];
            }
        }
    } else {
        // Single texture
        texturesToApply.top = info;
        texturesToApply.left = info;
        texturesToApply.right = info;
    }

    // Apply textures
    Object.keys(texturesToApply).forEach(face => {
        const texName = texturesToApply[face];
        if (texName) {
            selectTexture(face, { name: texName }, true); // Pass true to indicate auto-selection

            // Check if texture is missing
            if (typeof texName === 'string' && !textures.find(t => t.name.toLowerCase() === texName.toLowerCase())) {
                missingTextures.push(`${face}: ${texName}`);
            }
        }
    });

    // Alert if textures are missing
    if (missingTextures.length > 0) {
        // Optional: show a toast or small logging instead of alert
        console.warn('Missing textures:', missingTextures.join(', '));
    }
}

function selectTexture(type, item, isAuto = false) {
    const input = inputs[type];
    if (input) input.value = item.name;

    applyTextureToFace(type, item.name, isAuto);
    closeList(type);
    updateClearBtnVisibility(type);

    if (allFacesSameToggle.checked && type === 'top' && !isAuto) {
        updateAllFacesSame();
    }
}

function applyTextureToFace(type, textureNameOrUrl, isAuto = false) {
    const face = faces[type];
    if (!face) return;

    let url = textureNameOrUrl;

    // If it's a name, find the base64 data
    if (!textureNameOrUrl.startsWith('data:') && !textureNameOrUrl.startsWith('http')) {
        const textureData = textures.find(t => t.name.toLowerCase() === textureNameOrUrl.toLowerCase());
        if (textureData) {
            url = textureData.base64;
        } else {
            // If not found in known textures, it might be missing
            // We can't generate a URL if we don't have it
            // But we can try setting a color or placebo
            face.style.backgroundImage = 'none';
            face.style.backgroundColor = '#ffcccc'; // Light red for error
            return;
        }
    }

    face.style.backgroundImage = `url('${url}')`;
    face.style.backgroundColor = 'white'; // Reset
    face.style.backgroundSize = 'cover';
    face.style.imageRendering = 'pixelated'; // Keep pixel art sharp
}

function clearTexture(key) {
    if (inputs[key]) inputs[key].value = '';

    if (key === 'block') {
        // Clear all faces
        ['top', 'left', 'right'].forEach(face => {
            if (faces[face]) {
                faces[face].style.backgroundImage = 'none';
                faces[face].style.backgroundColor = '#f0f0f0';
            }
            if (inputs[face]) inputs[face].value = '';
        });
        halfBlockToggle.checked = false;
        updateHalfBlock();
    } else {
        if (faces[key]) {
            faces[key].style.backgroundImage = 'none';
            faces[key].style.backgroundColor = '#f0f0f0';
        }
    }
}

function handleInputFocus(key) {
    const input = inputs[key];
    if (!input) return;

    // Determine data source
    const sourceData = key === 'block' ? Object.keys(blockMapping).map(name => ({ name })) : textures;

    // Filter if there's text
    const val = input.value.toLowerCase();
    let filtered = sourceData;

    if (key === 'block') {
        // Apply toggle filters first
        const showSpecial = showSpecialToggle.checked;
        const showNoTexture = showNoTextureToggle.checked;

        filtered = sourceData.filter(item => {
            const name = item.name;
            const isSpecial = name.includes('|') || isNonFullBlock(name);

            // Priority: Special Check
            if (isSpecial) return showSpecial;

            // No Texture Check
            const mapping = blockMapping[name];
            let hasNoTexture = false;
            if (mapping) {
                const info = mapping.info;
                const texNames = Array.isArray(info) ? info : [info];
                const hasMissing = texNames.some(tn =>
                    typeof tn === 'string' && !textures.find(t => t.name.toLowerCase() === tn.toLowerCase())
                );
                const allNumbers = texNames.every(tn => typeof tn === 'number');
                if (hasMissing || allNumbers) hasNoTexture = true;
            }

            if (hasNoTexture) return showNoTexture;

            return true;
        });

        // Then apply search filter
        if (val) {
            filtered = filtered.filter(item => item.name.toLowerCase().includes(val));
        }
    } else {
        if (val) {
            filtered = sourceData.filter(item => item.name.toLowerCase().includes(val));
        }
    }

    populateList(key, filtered);
    openList(key);
}

function openList(key) {
    Object.keys(lists).forEach(k => {
        if (k !== key) closeList(k);
    });

    const list = lists[key];
    if (list) {
        list.classList.remove('hidden');
    }
}

function closeList(key) {
    const list = lists[key];
    if (list) {
        list.classList.add('hidden');
    }
}

function updateClearBtnVisibility(key) {
    const input = inputs[key];
    const btn = clearBtns[key];
    if (input && btn) {
        if (input.value) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    }
}

// Checkbox Logic
function updateSelectedCount() {
    if (selectedCountSpan) selectedCountSpan.textContent = `${selectedBlocks.size}個選択中`;
}

// Generate ZIP
function saveImage() {
    if (multiSelectToggle.checked && selectedBlocks.size > 0) {
        saveMultipleBlocks();
    } else {
        saveSingleBlock();
    }
}

function saveSingleBlock() {
    const container = document.querySelector('.BlockRoot');

    // Ensure background is transparent
    // html2canvas supports backgroundColor: null

    html2canvas(container, {
        backgroundColor: null,
        scale: 2 // Higher resolution
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'block_texture.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
}

async function saveMultipleBlocks() {
    if (selectedBlocks.size === 0) return;

    const zip = new JSZip();
    const container = document.querySelector('.BlockRoot');
    const folder = zip.folder("block_textures");

    // Store current state to restore later
    const originalBlock = inputs.block.value;
    const originalHalf = halfBlockToggle.checked;

    // Reset cancel state
    isExportCanceling = false;
    if (cancelBtn) {
        cancelBtn.classList.remove('hidden');
        cancelBtn.textContent = 'キャンセル';
        cancelBtn.disabled = false;
    }

    let processedCount = 0;
    const total = selectedBlocks.size;

    // Configure higher scale for better quality
    const scale = 2; // 2x resolution

    // Helper to sleep
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    try {
        for (const blockName of selectedBlocks) {
            // Check cancellation
            if (isExportCanceling) {
                break;
            }

            // Select block and wait for UI update
            selectBlock(blockName);
            await sleep(100); // Wait for styles/images to apply

            // Capture
            const canvas = await html2canvas(container, {
                backgroundColor: null,
                scale: scale
            });

            // Setup file name
            // Remove invalid characters for filenames
            const safeName = blockName.replace(/[^a-zA-Z0-9_\- ]/g, '_').trim();
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

            folder.file(`${safeName}.png`, blob);

            processedCount++;
            saveBtn.textContent = `生成中... (${processedCount}/${total})`;

            // Small pause to keep UI responsive
            await sleep(50);
        }

        // Finalize if not canceled
        if (!isExportCanceling) {
            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, "bloxd_textures.zip");
            alert('ダウンロードが完了しました！');
        } else {
            alert('エクスポートをキャンセルしました。');
        }

    } catch (err) {
        console.error('Export failed:', err);
        alert('エラーが発生しました: ' + err.message);
    } finally {
        // Restore
        inputs.block.value = originalBlock;
        if (originalBlock) selectBlock(originalBlock);
        halfBlockToggle.checked = originalHalf;
        updateHalfBlock();

        saveBtn.textContent = '画像を保存';
        if (cancelBtn) cancelBtn.classList.add('hidden');
        isExportCanceling = false;
    }
}