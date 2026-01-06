const REPO_OWNER = 'Bloxdy';
const REPO_NAME = 'texture-packs';
const PATH = 'default/textures';
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${PATH}`;

let textures = []; // Store fetched texture data
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
        top: document.getElementById('texture-search-top'),
        left: document.getElementById('texture-search-side-l'),
        right: document.getElementById('texture-search-side-r')
    };

    clearBtns = {
        top: document.getElementById('clear-texture-top'),
        left: document.getElementById('clear-texture-side-l'),
        right: document.getElementById('clear-texture-side-r')
    };

    lists = {
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
    ['top', 'left', 'right'].forEach(key => {
        const input = inputs[key];
        const list = lists[key];

        if (!input) return;

        input.addEventListener('focus', () => {
            handleInputFocus(key);
        });

        input.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();

            // Clear texture if input is empty
            if (val === '') {
                clearTexture(key);
                const filtered = textures.filter(t => t.name.toLowerCase().includes(val));
                populateList(key, filtered);
                openList(key);
                return;
            }

            // Check if input exactly matches a texture name
            const exactMatch = textures.find(t => t.name.toLowerCase() === val);
            const filtered = textures.filter(t => t.name.toLowerCase().includes(val));

            // Only apply texture if there's an exact match
            if (exactMatch) {
                // Apply the texture immediately on exact match
                selectTexture(key, exactMatch);
            } else {
                // Clear texture if no exact match (even if there are partial matches)
                clearTexture(key);
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
                clearTexture(key);
                populateList(key, textures);
                updateClearBtnVisibility(key);
                inputs[key].focus();
            });
        }
    });

    // Global click listener to close dropdowns
    document.addEventListener('click', (e) => {
        ['top', 'left', 'right'].forEach(key => {
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
        topLabel.textContent = 'Texture';
    } else {
        topLabel.textContent = 'Top';
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

        // No default texture selection - start with empty cube

    } catch (error) {
        console.error('Init Failed:', error);
        alert(`テクスチャの読み込みに失敗しました: ${error.message}`);
    } finally {
        loadingIndicator.classList.add('hidden');
        // Re-enable all inputs after loading
        inputs.top.disabled = false;
        inputs.left.disabled = false;
        inputs.right.disabled = false;
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

    items.forEach(tex => {
        const li = document.createElement('li');
        li.textContent = tex.name;
        li.addEventListener('click', () => {
            selectTexture(key, tex);
        });
        list.appendChild(li);
    });
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
    if (!val) {
        populateList(key, textures);
    } else {
        const filtered = textures.filter(t => t.name.toLowerCase().includes(val));
        populateList(key, filtered);
    }
    openList(key);
    updateClearBtnVisibility(key);
}

function openList(key) {
    if (!lists[key]) return;

    // Close others
    ['top', 'left', 'right'].forEach(k => {
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