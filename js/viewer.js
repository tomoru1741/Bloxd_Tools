let textures = []; // Store fetched texture data
let blockMapping = {}; // Store block -> texture info
let textureBase64Data = {}; // Store texture name -> base64 mapping
let faces = {}; // Store face elements
let inputs = {}; // Store input elements
let clearBtns = {}; // Store clear button elements
let lists = {}; // Store list elements

// Elements
// Elements
let halfBlockToggle;
let allFacesSameToggle;
let showSpecialToggle;
let showNoTextureToggle;
let saveBtn;
let loadingIndicator;
let sideInputs;
let topLabel;

document.addEventListener('DOMContentLoaded', () => {
    // Get Elements
    halfBlockToggle = document.getElementById('half-block-toggle');
    allFacesSameToggle = document.getElementById('all-faces-same-toggle');
    showSpecialToggle = document.getElementById('show-special-toggle');
    showNoTextureToggle = document.getElementById('show-no-texture-toggle');
    saveBtn = document.getElementById('save-btn');
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

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    const savedTheme = localStorage.getItem('theme') || 'light'; // Default to light
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        themeToggle.textContent = '☀️';
    } else {
        themeToggle.textContent = '🌙';
    }

    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        themeToggle.textContent = isLight ? '☀️' : '🌙';
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
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

            // Check if input exactly matches a name
            const exactMatch = sourceData.find(t => t.name.toLowerCase() === val);
            const filtered = sourceData.filter(t => t.name.toLowerCase().includes(val));

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

            populateList(key, filtered);
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

        let label = item.name;

        // Check for missing textures if this is the block list
        if (key === 'block') {
            const mapping = blockMapping[item.name];
            if (mapping) {
                const info = mapping.info;
                const texNames = Array.isArray(info) ? info : [info];
                // Check if any referenced texture is missing
                // Note: info can contain numbers or other non-string data which are naturally "missing"
                const hasMissing = texNames.some(tn =>
                    typeof tn === 'string' && !textures.find(t => t.name.toLowerCase() === tn.toLowerCase())
                );

                // Also check if all are numbers (like Water: [0.5, 0.8...]) -> definitely missing texture assets
                const allNumbers = texNames.every(tn => typeof tn === 'number');

                if (hasMissing || allNumbers) {
                    label += ' <span style="opacity: 0.6; font-size: 0.85em; margin-left: 8px; font-weight: normal; color: #ff8888;">(テクスチャなし)</span>';
                }
            }
        }

        li.innerHTML = label;
        li.addEventListener('click', () => {
            if (key === 'block') {
                selectBlock(item.name);
            } else {
                selectTexture(key, item);
            }
        });
        list.appendChild(li);
    });
}

function selectBlock(name) {
    const mapping = blockMapping[name];
    if (!mapping) return;

    inputs.block.value = name;
    updateClearBtnVisibility('block');
    closeList('block');

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
        texturesToApply.top = info;
        texturesToApply.left = info;
        texturesToApply.right = info;
    }

    // Apply the textures
    ['top', 'left', 'right'].forEach(faceKey => {
        let texName = texturesToApply[faceKey];
        if (texName) {
            const texture = textures.find(t => t.name.toLowerCase() === texName.toLowerCase());
            if (texture) {
                selectTexture(faceKey, texture);
            } else {
                console.warn(`Texture not found: ${texName}`);
                missingTextures.push(texName);
            }
        }
    });

    // Show warning if textures are missing
    if (missingTextures.length > 0) {
        const list = lists.block;
        if (list) {
            list.innerHTML = '';
            const warningLi = document.createElement('li');
            warningLi.classList.add('no-result');
            warningLi.style.color = '#ff6b6b';
            warningLi.textContent = `⚠️ テクスチャが見つかりません: ${missingTextures.join(', ')}`;
            list.appendChild(warningLi);
            list.classList.remove('hidden');
            setTimeout(() => list.classList.add('hidden'), 3000);
        }
    }
}

function selectTexture(key, texture) {
    // 1. Update Input Value
    inputs[key].value = texture.name;
    const url = `url('${texture.base64}')`;

    // 2. Apply Texture
    if (allFacesSameToggle.checked && key === 'top') {
        // Apply to ALL faces
        applyTextureToFace('top', url);
        applyTextureToFace('left', url);
        applyTextureToFace('right', url);
        // Sync values
        inputs.left.value = texture.name;
        inputs.right.value = texture.name;
    } else {
        // Apply to specific face
        applyTextureToFace(key, url);
    }

    // 3. Close List
    closeList(key);
    updateClearBtnVisibility(key);
}

function applyTextureToFace(key, urlString) {
    if (faces[key]) {
        faces[key].style.backgroundImage = urlString;
    }
}

function clearTexture(key) {
    // Clear the background image
    if (allFacesSameToggle.checked && key === 'top') {
        // Clear all faces
        applyTextureToFace('top', 'none');
        applyTextureToFace('left', 'none');
        applyTextureToFace('right', 'none');
    } else {
        // Clear specific face
        applyTextureToFace(key, 'none');
    }
}

function handleInputFocus(key) {
    const val = inputs[key].value.toLowerCase();
    let sourceData = key === 'block' ? Object.keys(blockMapping).map(name => ({ name })) : textures;

    // Filter Logic for Blocks
    if (key === 'block') {
        const showSpecial = showSpecialToggle.checked;
        const showNoTexture = showNoTextureToggle.checked;

        sourceData = sourceData.filter(item => {
            const name = item.name;
            const isSpecial = name.includes('|');

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

    if (!val) {
        populateList(key, sourceData);
    } else {
        const filtered = sourceData.filter(t => t.name.toLowerCase().includes(val));
        populateList(key, filtered);
    }
    openList(key);
    updateClearBtnVisibility(key);
}

function openList(key) {
    if (!lists[key]) return;

    // Close others
    ['block', 'top', 'left', 'right'].forEach(k => {
        if (k !== key && lists[k]) {
            lists[k].classList.add('hidden');
        }
    });
    lists[key].classList.remove('hidden');
}

function closeList(key) {
    if (!lists[key]) return;
    // Timeout to allow click event to register
    setTimeout(() => {
        lists[key].classList.add('hidden');
    }, 150);
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

function saveImage() {
    const element = document.getElementById('block-root');
    if (!element) return;

    let filename = 'bloxd-block';
    if (inputs.block && inputs.block.value) {
        filename = inputs.block.value.replace(/[\\/:*?"<>|]/g, '_');
    }

    // dom-to-image capture with scaling for quality
    const scale = 2; // Capture at 2x resolution to ensure crisp downscaling

    domtoimage.toPng(element, {
        width: element.offsetWidth * scale,
        height: element.offsetHeight * scale,
        style: {
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            width: element.offsetWidth + 'px',
            height: element.offsetHeight + 'px',
            margin: 0 // Prevent margin issues
        }
    })
        .then(function (dataUrl) {
            const img = new Image();
            img.src = dataUrl;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 300;
                canvas.height = 300;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';

                // Draw resized to 300x300
                ctx.drawImage(img, 0, 0, 300, 300);

                const link = document.createElement('a');
                link.download = `${filename}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            };
        })
        .catch(function (error) {
            console.error('Save failed:', error);
            alert('画像の保存に失敗しました: ' + error.message);
        });
}