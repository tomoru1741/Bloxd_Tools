const viewer = document.getElementById('viewer');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');
const cameraToggle = document.getElementById('camera-toggle');
const modelSearchInput = document.getElementById('model-search');
const clearModelBtn = document.getElementById('clear-model-search');
const customModelList = document.getElementById('custom-model-list');
const loadingIndicator = document.getElementById('loading-indicator');

// GitHub API config
const REPO_OWNER = 'Bloxdy';
const REPO_NAME = 'texture-packs';
const PATH = 'default/models';
const API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${PATH}`;

let models = []; // Store model data

// Debug Helper
function logError(msg) {
    const el = document.getElementById('error-log');
    el.textContent += msg + '\n';
    el.classList.add('visible');
    console.error(msg);
}

// Initialize
async function init() {
    try {
        loadingIndicator.classList.remove('hidden');
        modelSearchInput.disabled = true; // Disable input during loading

        // Add timestamp to prevent caching
        const response = await fetch(`${API_URL}?t=${Date.now()}`);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GitHub API Error ${response.status}: ${response.statusText}. ${errorText}`);
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
            console.error('API response is not an array:', data);
            alert(`API Error: Expected array but got ${typeof data}.`);
            return;
        }

        // Filter for GLB/GLTF and map to useful structure
        models = data
            .filter(item => item.name && item.name.match(/\.(glb|gltf)$/i))
            .map(item => ({
                name: item.name.replace(/\.(glb|gltf)$/i, ''),
                url: item.download_url
            }));

        if (models.length === 0) {
            console.warn('No models found after filtering.');
            alert(`Fetched ${data.length} items but found 0 models after filtering.`);
        }

        populateCustomList(models);

        if (models.length > 0) {
            modelSearchInput.placeholder = `${models.length}個のモデルを検索または選択...`;
            // Optional: Auto-load first model?
            // loadModel(models[0].url);
            // modelSearchInput.value = models[0].name;
        }

    } catch (error) {
        console.error('Init Failed:', error);
        alert(`モデルリストの取得に失敗しました: ${error.message}`);
    } finally {
        loadingIndicator.classList.add('hidden');
        modelSearchInput.disabled = false; // Re-enable input after loading
    }
}

function populateCustomList(items) {
    customModelList.innerHTML = '';
    if (items.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No models found';
        li.classList.add('no-result');
        customModelList.appendChild(li);
        return;
    }

    items.forEach(model => {
        const li = document.createElement('li');
        li.textContent = model.name;
        li.dataset.url = model.url;
        li.addEventListener('click', () => {
            selectModel(model);
        });
        customModelList.appendChild(li);
    });
}

function selectModel(model) {
    modelSearchInput.value = model.name;
    clearModelBtn.classList.remove('hidden');
    loadModel(model.url);
    closeDropdown();
}

// Custom Dropdown Logic
// Custom Dropdown Logic
function handleInputFocus() {
    // If input is empty, show all. If has text, filter.
    const val = modelSearchInput.value.toLowerCase();
    if (!val) {
        populateCustomList(models);
        clearModelBtn.classList.add('hidden');
    } else {
        const filtered = models.filter(m => m.name.toLowerCase().includes(val));
        populateCustomList(filtered);
        clearModelBtn.classList.remove('hidden');
    }
    openDropdown();
}

modelSearchInput.addEventListener('focus', handleInputFocus);
modelSearchInput.addEventListener('click', handleInputFocus); // Also open on click

modelSearchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    const filtered = models.filter(m => m.name.toLowerCase().includes(val));
    populateCustomList(filtered);
    openDropdown();

    if (val) {
        clearModelBtn.classList.remove('hidden');
    } else {
        clearModelBtn.classList.add('hidden');
    }
});

// Clear Button logic
clearModelBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent closing dropdown if we just want to clear
    modelSearchInput.value = '';
    clearModelBtn.classList.add('hidden');
    viewer.src = ''; // Clear model
    populateCustomList(models);
    modelSearchInput.focus();
});

// Click outside to close
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        closeDropdown();
    }
});

function openDropdown() {
    customModelList.classList.remove('hidden');
}

function closeDropdown() {
    // Small delay to allow item click to register before hiding
    setTimeout(() => {
        customModelList.classList.add('hidden');
    }, 150);
}


function loadModel(url) {
    if (viewer.src === url) return;
    viewer.src = url;
}

// Camera Helper
function setCamera(orbit) {
    viewer.cameraOrbit = orbit;
    if (typeof viewer.jumpCameraToGoal === 'function') {
        try {
            viewer.jumpCameraToGoal();
        } catch (e) {
            console.warn('jumpCameraToGoal failed:', e);
        }
    }
}

function setCameraDefault() {
    setCamera('45deg 55deg auto');
}

function updateCameraLock() {
    if (cameraToggle.checked) {
        viewer.cameraControls = true;
    } else {
        viewer.cameraControls = false;
        setCameraDefault(); // Snap back to default when locking
    }
}

// Camera Toggle Listener
cameraToggle.addEventListener('change', updateCameraLock);

// Reset Camera Button (Default / Diagonal)
resetBtn.addEventListener('click', setCameraDefault);

// Camera Shortcuts - 4 Top Corners
// FR: Front-Right (+45), FL: Front-Left (-45), BR: Back-Right (+135), BL: Back-Left (-135)
// Using 55deg phi for top-down isometric feel
document.getElementById('cam-fr-btn').addEventListener('click', () => setCamera('45deg 55deg auto'));
document.getElementById('cam-fl-btn').addEventListener('click', () => setCamera('-45deg 55deg auto'));
document.getElementById('cam-br-btn').addEventListener('click', () => setCamera('135deg 55deg auto'));
document.getElementById('cam-bl-btn').addEventListener('click', () => setCamera('-135deg 55deg auto'));

// Initial Setup
// Run init first to ensure data fetching starts
init();

// Attempt camera setup, but don't block if it fails (e.g. model-viewer not ready)
try {
    updateCameraLock();
} catch (e) {
    console.warn('Initial camera lock update failed:', e);
}

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


// --- Image Processing ---
async function processImage(blob) {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
    let found = false;

    for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const alpha = data[(y * canvas.width + x) * 4 + 3];
            if (alpha > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                found = true;
            }
        }
    }

    if (!found) return blob;

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = 300;
    finalCanvas.height = 300;
    const finalCtx = finalCanvas.getContext('2d');

    const scale = Math.min(300 / cropWidth, 300 / cropHeight);
    const scaledWidth = cropWidth * scale;
    const scaledHeight = cropHeight * scale;
    const dx = (300 - scaledWidth) / 2;
    const dy = (300 - scaledHeight) / 2;

    finalCtx.drawImage(
        canvas,
        minX, minY, cropWidth, cropHeight,
        dx, dy, scaledWidth, scaledHeight
    );

    URL.revokeObjectURL(url);

    return new Promise(resolve => {
        finalCanvas.toBlob(resolve, 'image/png');
    });
}

saveBtn.addEventListener('click', async () => {
    try {
        saveBtn.textContent = '処理中...';
        saveBtn.disabled = true;

        if (!viewer.src) {
            alert('モデルが選択されていません。');
            return;
        }

        const blob = await viewer.toBlob({
            mimeType: 'image/png',
            qualityArgument: 1
        });

        const processedBlob = await processImage(blob);

        const url = URL.createObjectURL(processedBlob);
        const a = document.createElement('a');
        a.href = url;
        const currentModelName = modelSearchInput.value || 'model';
        const cleanName = currentModelName.replace(/\.(glb|gltf)$/i, '');
        a.download = `${cleanName}-${Date.now()}.png`;
        a.click();

        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error saving image:', error);
        alert('画像の保存に失敗しました。コンソールを確認してください。');
    } finally {
        saveBtn.textContent = 'PNG保存';
        saveBtn.disabled = false;
    }
});
