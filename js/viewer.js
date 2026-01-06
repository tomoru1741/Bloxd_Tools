const REPO_OWNER = 'Bloxdy';
const REPO_NAME = 'texture-packs';
const PATH = 'default/textures';
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${PATH}`;

let textures = []; // Store fetched texture data
let blockMapping = {}; // Store block -> texture info
let faces = {}; // Store face elements
let inputs = {}; // Store input elements
let clearBtns = {}; // Store clear button elements
let lists = {}; // Store list elements

// Elements
let halfBlockToggle;
let allFacesSameToggle;
let loadingIndicator;
let sideInputs;
let topLabel;

document.addEventListener('DOMContentLoaded', () => {
    // Get Elements
    halfBlockToggle = document.getElementById('half-block-toggle');
    allFacesSameToggle = document.getElementById('all-faces-same-toggle');
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

// Data Fetching
async function init() {
    try {
        loadingIndicator.classList.remove('hidden');
        // Disable all inputs during loading
        inputs.top.disabled = true;
        inputs.left.disabled = true;
        inputs.right.disabled = true;

        const response = await fetch(`${API_URL}?t=${Date.now()}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API Error ${response.status}: ${response.statusText}. ${errorText}`);
        }

        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Invalid data format');

        textures = data
            .filter(item => item.name && item.name.match(/\.(png|jpg|jpeg)$/i))
            .map(item => ({
                name: item.name.replace(/\.(png|jpg|jpeg)$/i, ''),
                url: item.download_url
            }));

        console.log(`Loaded ${textures.length} textures`);

        // Fetch Block Mapping from bloxd.io
        await fetchBlockMapping();

        // No default texture selection - start with empty cube

    } catch (error) {
        console.error('Init Failed:', error);
        alert(`テクスチャの読み込みに失敗しました: ${error.message}`);
    } finally {
        loadingIndicator.classList.add('hidden');
        // Re-enable all inputs after loading
        inputs.block.disabled = false;
        inputs.top.disabled = false;
        inputs.left.disabled = false;
        inputs.right.disabled = false;
    }
}

async function fetchBlockMapping() {
    try {
        console.log('Fetching block mapping from bloxd.io...');
        const manifestRes = await fetch('https://bloxd.io/asset-manifest.json');
        const manifest = await manifestRes.json();

        // Find chunk 3 URL
        const chunkKey = Object.keys(manifest.files).find(key => /^static\/js\/.*\.3\.[a-f0-9]+\.chunk\.js$/.test(key));
        if (!chunkKey) throw new Error('Chunk 3 not found in manifest');

        const chunkUrl = `https://bloxd.io${manifest.files[chunkKey]}`;
        const chunkRes = await fetch(chunkUrl);
        const chunkText = await chunkRes.text();

        // Regex to extract block definitions
        // Pattern: "Block Name":{displayName:{translationKey:...},ttb:...,textureInfo:...}
        const regex = /"([^"]+)":\{displayName:\{translationKey:"[^"]+"\},ttb:[0-9]+,textureInfo:([^,}]*)(?:,texturePerSide:(\[[^\]]+\]))?/g;
        let match;
        const tempMapping = {};

        while ((match = regex.exec(chunkText)) !== null) {
            const name = match[1];
            let textureInfo = match[2];
            const texturePerSide = match[3] ? JSON.parse(match[3]) : null;

            // Clean up textureInfo (remove quotes)
            textureInfo = textureInfo.replace(/"/g, '');

            // Only add if it has valid-looking textureInfo
            if (textureInfo && textureInfo !== 'null' && textureInfo !== 'undefined') {
                tempMapping[name] = {
                    info: textureInfo.startsWith('[') ? JSON.parse(textureInfo.replace(/'/g, '"')) : textureInfo,
                    perSide: texturePerSide
                };
            }
        }

        blockMapping = tempMapping;
        console.log(`Loaded ${Object.keys(blockMapping).length} block mappings`);

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
        li.textContent = item.name;
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

    if (Array.isArray(info)) {
        // Multi-texture block
        // bloxd.io order: [right, left, top, bottom, front, back]
        // Our viewer keys: top (index 2), left (index 1), right (index 0)
        // Wait, let's check the texturePerSide mapping
        if (perSide) {
            texturesToApply.right = info[perSide[0]]; // Index 0 is right
            texturesToApply.left = info[perSide[1]];  // Index 1 is left
            texturesToApply.top = info[perSide[2]];   // Index 2 is top
        } else {
            // Fallback: use first few
            texturesToApply.right = info[0];
            texturesToApply.left = info[1] || info[0];
            texturesToApply.top = info[2] || info[0];
        }
    } else {
        // Single texture block
        texturesToApply.top = info;
        texturesToApply.left = info;
        texturesToApply.right = info;
    }

    // Apply the textures if found in our texture list
    ['top', 'left', 'right'].forEach(faceKey => {
        const texName = texturesToApply[faceKey];
        if (texName) {
            const texture = textures.find(t => t.name === texName);
            if (texture) {
                selectTexture(faceKey, texture);
            } else {
                // Try fuzzy match or append .png if needed? 
                // Usually the names match exactly.
                console.warn(`Texture not found for block ${name}: ${texName}`);
            }
        }
    });

    // If "All Faces Same" is on, it will be handled by selectTexture('top', ...)
}

function selectTexture(key, texture) {
    // 1. Update Input Value
    inputs[key].value = texture.name;
    const url = `url('${texture.url}')`;

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
    const sourceData = key === 'block' ? Object.keys(blockMapping).map(name => ({ name })) : textures;

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