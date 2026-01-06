---
description: Build the GLB to PNG Converter Tool (Web-based)
---

This workflow recreates the GLB to PNG converter tool which allows users to load 3D models, adjust the camera, and save transparent PNGs with smart cropping.

1. Create the project directory
// turbo
```bash
mkdir glb_to_png
```

2. Create `index.html`
```html
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GLB to PNG 変換ツール</title>
    <!-- Google Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <!-- Model Viewer -->
    <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js"></script>
    <link rel="stylesheet" href="styles.css">
</head>
<body>

    <div class="app-container">
        <header class="header">
            <h1>GLB to PNG 変換</h1>
            <p>3Dモデルをドラッグ＆ドロップし、角度を調整してPNG保存できます。</p>
        </header>

        <main class="viewer-container" id="drop-zone">
            <div class="empty-state" id="empty-state">
                <div class="icon">📦</div>
                <p>ここに .glb ファイルをドラッグ＆ドロップ</p>
                <button class="btn secondary" onclick="document.getElementById('file-input').click()">ファイルを選択</button>
                <input type="file" id="file-input" accept=".glb,.gltf" hidden>
            </div>
            
            <model-viewer 
                id="viewer" 
                shadow-intensity="1" 
                environment-image="neutral"
                interaction-prompt="none"
                min-camera-orbit="auto auto 5%"
                max-camera-orbit="auto auto 100%"
                hidden>
            </model-viewer>

            <div class="controls" id="controls" hidden>
                <div class="control-group">
                    <label class="checkbox-label">
                        <input type="checkbox" id="camera-toggle"> 回転を許可する
                    </label>
                </div>
                <div class="control-group">
                    <label>サイズ</label>
                    <input type="range" id="scale-slider" min="0.1" max="2" step="0.1" value="1">
                </div>
                <button class="btn primary" id="save-btn">PNG保存</button>
                <button class="btn secondary" id="reset-btn">リセット</button>
            </div>
        </main>

        <footer class="footer">
            <p>Powered by model-viewer</p>
        </footer>
    </div>

    <script src="script.js"></script>
</body>
</html>
```

3. Create `styles.css`
```css
:root {
    --bg-color: #0f1115;
    --surface-color: #1a1d24;
    --primary-color: #3b82f6;
    --primary-hover: #2563eb;
    --text-color: #ffffff;
    --text-secondary: #9ca3af;
    --border-radius: 12px;
    --spacing: 24px;
}

body {
    margin: 0;
    font-family: 'Inter', sans-serif;
    background-color: var(--bg-color);
    color: var(--text-color);
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    overflow: hidden;
}

.app-container {
    width: 100%;
    max-width: 1200px;
    height: 95vh;
    display: flex;
    flex-direction: column;
    padding: 0 var(--spacing);
    box-sizing: border-box;
}

.header {
    text-align: center;
    margin-bottom: var(--spacing);
}

.header h1 {
    font-size: 2rem;
    font-weight: 600;
    margin: 0 0 8px 0;
    background: linear-gradient(to right, #60a5fa, #a78bfa);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.header p {
    color: var(--text-secondary);
    margin: 0;
}

.viewer-container {
    flex: 1;
    background-color: var(--surface-color);
    border-radius: var(--border-radius);
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    transition: border-color 0.2s;
}

.viewer-container.drag-over {
    border-color: var(--primary-color);
    background-color: rgba(59, 130, 246, 0.05);
}

model-viewer {
    width: 100%;
    height: 100%;
    --poster-color: transparent;
}

.empty-state {
    text-align: center;
}

.empty-state .icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
}

.empty-state p {
    color: var(--text-secondary);
    margin-bottom: 24px;
}

.controls {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 17, 21, 0.8);
    backdrop-filter: blur(12px);
    padding: 12px 24px;
    border-radius: 100px;
    display: flex;
    gap: 16px;
    align-items: center;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    z-index: 100;
}

.btn {
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 14px;
}

.btn.primary {
    background-color: var(--primary-color);
    color: white;
}

.btn.primary:hover {
    background-color: var(--primary-hover);
    transform: translateY(-1px);
}

.btn.secondary {
    background-color: rgba(255, 255, 255, 0.1);
    color: white;
}

.btn.secondary:hover {
    background-color: rgba(255, 255, 255, 0.15);
}

.footer {
    text-align: center;
    padding: 16px;
    color: var(--text-secondary);
    font-size: 12px;
}

/* Range input styling */
input[type=range] {
    -webkit-appearance: none;
    background: transparent;
    width: 100px;
}

input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: var(--primary-color);
    cursor: pointer;
    margin-top: -6px;
}

input[type=range]::-webkit-slider-runnable-track {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
}

.checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    cursor: pointer;
    user-select: none;
}

.checkbox-label input {
    cursor: pointer;
}
```

4. Create `script.js`
```javascript
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const viewer = document.getElementById('viewer');
const emptyState = document.getElementById('empty-state');
const controls = document.getElementById('controls');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');

const cameraToggle = document.getElementById('camera-toggle');

// Drag & Drop Handlers
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadModel(file);
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadModel(file);
});

function loadModel(file) {
    if (!file.name.match(/\.(glb|gltf)$/i)) {
        alert('Please upload a .glb or .gltf file');
        return;
    }

    const url = URL.createObjectURL(file);
    viewer.src = url;
    
    // Show viewer, hide empty state
    viewer.hidden = false;
    controls.hidden = false;
    emptyState.style.display = 'none';

    // Set Default Angle
    setCameraDefault();
    
    // Ensure lock state matches checkbox (defaut unchecked = locked)
    updateCameraLock();
}

function setCameraDefault() {
    // "A" (Top-Left) from diagonal left-front-up
    // -45deg azimuth, 55deg polar
    viewer.cameraOrbit = '-45deg 55deg auto';
    viewer.jumpCameraToGoal(); // Instant jump
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

// Reset Functionality
resetBtn.addEventListener('click', () => {
    viewer.src = '';
    viewer.hidden = true;
    controls.hidden = true;
    emptyState.style.display = 'block';
    fileInput.value = ''; // Reset input
    
    // Reset toggle
    cameraToggle.checked = false;
    updateCameraLock();
});

// Helper: Trim Transparent Pixels and Resize to 300x300
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

    // Scan for non-transparent pixels
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

    if (!found) return blob; // Return original if empty

    const cropWidth = maxX - minX + 1;
    const cropHeight = maxY - minY + 1;

    // Create 300x300 canvas
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = 300;
    finalCanvas.height = 300;
    const finalCtx = finalCanvas.getContext('2d');

    // Maintain aspect ratio while fitting into 300x300
    const scale = Math.min(300 / cropWidth, 300 / cropHeight);
    const scaledWidth = cropWidth * scale;
    const scaledHeight = cropHeight * scale;
    const dx = (300 - scaledWidth) / 2;
    const dy = (300 - scaledHeight) / 2;

    finalCtx.drawImage(
        canvas,
        minX, minY, cropWidth, cropHeight, // Source crop
        dx, dy, scaledWidth, scaledHeight  // Dest placement (centered)
    );

    URL.revokeObjectURL(url);

    return new Promise(resolve => {
        finalCanvas.toBlob(resolve, 'image/png');
    });
}

// Save PNG
saveBtn.addEventListener('click', async () => {
    try {
        saveBtn.textContent = '処理中...';
        saveBtn.disabled = true;

        // Capture high res first for better quality downscaling
        const blob = await viewer.toBlob({
            mimeType: 'image/png',
            qualityArgument: 1
        });

        const processedBlob = await processImage(blob);
        
        const url = URL.createObjectURL(processedBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `model-snapshot-300px-${Date.now()}.png`;
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
```

5. Open the tool
// turbo
```bash
explorer index.html
```
