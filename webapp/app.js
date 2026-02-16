
// DOM Elements
const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const wrapper = document.getElementById('canvas-wrapper');
const fileInput = document.getElementById('file-input');
const btnUpload = document.getElementById('btn-upload');
const steps = {
    select: document.getElementById('phase-select'),
    recolor: document.getElementById('phase-recolor')
};
const panels = {
    select: document.getElementById('select-actions'),
    recolor: document.getElementById('recolor-actions'),
    nav: document.getElementById('category-nav'),
    palette: document.getElementById('palette-scroll'),
    custom: document.getElementById('custom-picker-container'),
    instruction: document.getElementById('instruction-overlay'),
    compare: document.getElementById('compare-controls')
};

// Zoom Elements
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnZoomReset = document.getElementById('btn-zoom-reset');
const modeToggle = document.getElementById('mode-toggle');
const modeText = document.getElementById('mode-text');
const modeIcon = document.getElementById('mode-icon');

// State
let img = new Image();
let originalImageData = null;
let currentPoints = [];
let completedPolygons = [];
let maskData = null;
let scale = 1;
let isRecolorPhase = false;

// Compare Mode State
let isCompareMode = false;
let referenceImageData = null;
let activeRecoloredData = null;

// Zoom State
let zoomLevel = 1.0;
let interactionMode = "DRAW"; // "DRAW" or "PAN"

// Categories
const CATEGORIES = {
    "Bedroom": [
        ["Light Blue", "#add8e6"], ["Slate Blue", "#6a5acd"], ["Navy Blue", "#000080"],
        ["Sage Green", "#8fbc8f"], ["Silver", "#c0c0c0"], ["Lavender", "#e6e6fa"],
        ["Warm Gray", "#a9a9a9"], ["Charcoal", "#36454f"], ["Crisp White", "#ffffff"],
        ["Terracotta", "#e2725b"], ["Rust", "#b7410e"], ["Cream", "#fffdd0"]
    ],
    "Kitchen": [
        ["White", "#ffffff"], ["Warm Yellow", "#ffdb58"],
        ["Red Accent", "#dc143c"], ["Orange Accent", "#ffa500"]
    ],
    "Hall/Living": [
        ["Warm Beige", "#f5f5dc"], ["Greige", "#cdcdd0"],
        ["Soft Terracotta", "#cc4e5c"], ["Earthy Ochre", "#cc7722"],
        ["Green", "#228b22"], ["Charcoal", "#333333"]
    ],
    "Dining": [["Warm Red", "#b22222"], ["Aubergine", "#4b0082"]],
    "Office": [["Green", "#008000"], ["Deep Blue", "#00008b"], ["Yellow", "#ffff00"]],
    "Gaming": [["Neutral Gray", "#808080"], ["Matte Black", "#1a1a1a"], ["White", "#f8f8f8"]]
};
let currentCatIdx = 0;
const catNames = Object.keys(CATEGORIES);

// ---------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------
fileInput.addEventListener('change', handleImageUpload);
btnUpload.addEventListener('click', () => fileInput.click());

// ---------------------------------------------------------------------
// Image Handling
// ---------------------------------------------------------------------
function handleImageUpload(e) {
    if (!e.target.files.length) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        img = new Image();
        img.onload = () => {
            initCanvas();
            resetSelection();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
}

function initCanvas() {
    const maxWidth = wrapper.clientWidth;
    const maxHeight = wrapper.clientHeight;

    // Reset Zoom
    zoomLevel = 1.0;
    updateZoom();

    // Fit to screen
    const scaleW = maxWidth / img.width;
    const scaleH = maxHeight / img.height;
    scale = Math.min(scaleW, scaleH, 1);

    canvas.width = img.width * scale;
    canvas.height = img.height * scale;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    referenceImageData = originalImageData;
}


// ---------------------------------------------------------------------
// ZOOM & PAN LOGIC
// ---------------------------------------------------------------------
function updateZoom() {
    canvas.style.transformOrigin = "0 0";
    canvas.style.transform = `scale(${zoomLevel})`;

    // Adjust wrapper scroll to keep center if possible? 
    // Browser handles scrollbars automatically with overflow: auto
}

btnZoomIn.addEventListener('click', () => {
    zoomLevel *= 1.2;
    if (zoomLevel > 5) zoomLevel = 5;
    updateZoom();
});

btnZoomOut.addEventListener('click', () => {
    zoomLevel /= 1.2;
    if (zoomLevel < 1) zoomLevel = 1;
    updateZoom();
});

btnZoomReset.addEventListener('click', () => {
    zoomLevel = 1.0;
    updateZoom();
    wrapper.scrollLeft = 0;
    wrapper.scrollTop = 0;
});

modeToggle.addEventListener('click', () => {
    if (interactionMode === "DRAW") {
        setInteractionMode("PAN");
    } else {
        setInteractionMode("DRAW");
    }
});

function setInteractionMode(mode) {
    interactionMode = mode;
    if (mode === "PAN") {
        modeText.textContent = "Pan/Zoom";
        modeIcon.textContent = "✋";
        modeToggle.classList.add('pan-active');
        // Enable browser scrolling
        canvas.style.touchAction = "auto";
        wrapper.style.touchAction = "auto";
        canvas.style.cursor = "grab";
    } else {
        modeText.textContent = "Draw";
        modeIcon.textContent = "✎";
        modeToggle.classList.remove('pan-active');
        // Disable browser scrolling so we can draw without dragging page
        canvas.style.touchAction = "none";
        wrapper.style.touchAction = "none";
        canvas.style.cursor = "crosshair";
    }
}
// Init default
setInteractionMode("DRAW");


// ---------------------------------------------------------------------
// Selection Logic
// ---------------------------------------------------------------------
canvas.addEventListener('mousedown', handleInputStart);
canvas.addEventListener('touchstart', handleInputStart, { passive: false });

function handleInputStart(e) {
    // If PAN mode, let browser handle scroll (for touch)
    // For Mouse, we might want to support drag-scroll? 
    // Browser handles mouse wheel scroll, but drag scroll needs manual code if overflow:auto
    if (interactionMode === "PAN") return;

    if (isRecolorPhase) return;

    // Prevent default to stop scrolling/refreshing details on mobile
    if (e.cancelable) e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    let clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    let clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    // BoundingClientRect rect.width is (canvas.width * zoomLevel)
    // So ratio (canvas.width / rect.width) compensates for zoom automatically!

    let x = (clientX - rect.left) * (canvas.width / rect.width);
    let y = (clientY - rect.top) * (canvas.height / rect.height);

    // Ensure within bounds
    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) return;

    currentPoints.push({ x, y });
    renderSelectionOverlay();
}

function renderSelectionOverlay() {
    ctx.putImageData(originalImageData, 0, 0);
    ctx.lineWidth = 3; // Doesn't scale with zoom (pixel width), so lines look thinner when zoomed in. This is good for precision.

    ctx.strokeStyle = '#00d1ff';
    ctx.fillStyle = 'rgba(0, 209, 255, 0.2)';
    for (const poly of completedPolygons) {
        if (poly.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
    }

    ctx.strokeStyle = '#00ff00';
    ctx.fillStyle = '#ff0000';
    if (currentPoints.length > 0) {
        ctx.beginPath();
        ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
        for (let i = 1; i < currentPoints.length; i++) {
            ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
        }
        ctx.stroke();
        for (const p of currentPoints) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

document.getElementById('btn-undo').addEventListener('click', () => {
    if (currentPoints.length > 0) {
        currentPoints.pop();
    } else if (completedPolygons.length > 0) {
        currentPoints = completedPolygons.pop();
    }
    renderSelectionOverlay();
});

document.getElementById('btn-add-poly').addEventListener('click', () => {
    if (currentPoints.length < 3) return;
    completedPolygons.push([...currentPoints]);
    currentPoints = [];
    renderSelectionOverlay();
});

document.getElementById('btn-finish').addEventListener('click', () => {
    if (currentPoints.length >= 3) {
        completedPolygons.push([...currentPoints]);
        currentPoints = [];
    }
    if (completedPolygons.length === 0) {
        alert("Please define at least one wall area!");
        return;
    }
    createMask();
    enterRecolorPhase();
});

function createMask() {
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const mCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

    mCtx.fillStyle = '#FFFFFF';
    for (const poly of completedPolygons) {
        mCtx.beginPath();
        mCtx.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) mCtx.lineTo(poly[i].x, poly[i].y);
        mCtx.closePath();
        mCtx.fill();
    }

    const mData = mCtx.getImageData(0, 0, canvas.width, canvas.height).data;
    maskData = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < maskData.length; i++) {
        if (mData[i * 4] > 128) maskData[i] = 1;
    }
}

// ---------------------------------------------------------------------
// Recolor Phase
// ---------------------------------------------------------------------
function enterRecolorPhase() {
    isRecolorPhase = true;
    steps.select.classList.remove('active');
    steps.recolor.classList.add('active');

    panels.select.classList.add('hidden');
    panels.instruction.classList.add('hidden');

    panels.recolor.classList.remove('hidden');
    panels.nav.classList.remove('hidden');
    panels.palette.classList.remove('hidden');
    panels.custom.classList.remove('hidden');

    // Switch to PAN mode by default for recoloring viewing? No, better keep user choice via toggle
    // setInteractionMode("PAN"); 

    renderPalette();
    activeRecoloredData = originalImageData;
}

document.getElementById('btn-reset').addEventListener('click', resetSelection);

function resetSelection() {
    isRecolorPhase = false;
    isCompareMode = false;
    currentPoints = [];
    completedPolygons = [];
    maskData = null;
    originalImageData = null;

    initCanvas();

    steps.recolor.classList.remove('active');
    steps.select.classList.add('active');

    panels.select.classList.remove('hidden');
    panels.instruction.classList.remove('hidden');
    panels.recolor.classList.add('hidden');
    panels.nav.classList.add('hidden');
    panels.palette.classList.add('hidden');
    panels.custom.classList.add('hidden');
    panels.compare.classList.add('hidden');
    document.getElementById('btn-compare-toggle').textContent = "Compare Mode";

    setInteractionMode("DRAW"); // Reset to draw mode
}

document.getElementById('btn-save').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'wall_design.jpg';
    link.href = canvas.toDataURL('image/jpeg', 0.9);
    link.click();
});

// Compare Mode Logic
document.getElementById('btn-compare-toggle').addEventListener('click', () => {
    isCompareMode = !isCompareMode;
    const btn = document.getElementById('btn-compare-toggle');
    const controls = document.getElementById('compare-controls');

    if (isCompareMode) {
        btn.textContent = "Exit Compare";
        controls.classList.remove('hidden');
        renderCompareView();

        // Reset zoom for safe viewing
        zoomLevel = 1.0;
        updateZoom();
        setInteractionMode("PAN"); // Auto-switch to Pan for comparison viewing

    } else {
        btn.textContent = "Compare Mode";
        controls.classList.add('hidden');

        canvas.width = originalImageData.width;
        canvas.height = originalImageData.height;
        ctx.putImageData(activeRecoloredData, 0, 0);
    }
});

document.getElementById('btn-snapshot').addEventListener('click', () => {
    if (!isCompareMode) return;
    referenceImageData = activeRecoloredData;
    renderCompareView();
});

document.getElementById('btn-reset-ref').addEventListener('click', () => {
    if (!isCompareMode) return;
    referenceImageData = originalImageData;
    renderCompareView();
});

function renderCompareView() {
    if (!isCompareMode) return;
    const w = originalImageData.width;
    const h = originalImageData.height;
    canvas.width = w * 2;
    canvas.height = h;

    ctx.putImageData(referenceImageData, 0, 0);
    ctx.putImageData(activeRecoloredData, w, 0);

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(w, 0);
    ctx.lineTo(w, h);
    ctx.stroke();

    ctx.font = "bold 24px Arial";
    ctx.fillStyle = "white";
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    const drawLabel = (text, x, y) => {
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
    }
    drawLabel("Reference", 20, 40);
    drawLabel("Active", w + 20, 40);
}


// Color Logic
document.getElementById('btn-prev-cat').addEventListener('click', () => {
    currentCatIdx = (currentCatIdx - 1 + catNames.length) % catNames.length;
    renderPalette();
});
document.getElementById('btn-next-cat').addEventListener('click', () => {
    currentCatIdx = (currentCatIdx + 1) % catNames.length;
    renderPalette();
});

function renderPalette() {
    const name = catNames[currentCatIdx];
    document.getElementById('current-category').textContent = name;
    const container = document.getElementById('color-container');
    container.innerHTML = '';
    CATEGORIES[name].forEach(([colorName, hex]) => {
        const div = document.createElement('div');
        div.className = 'swatch';
        div.style.backgroundColor = hex;
        div.onclick = () => {
            document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
            div.classList.add('selected');
            applyColor(hex);
        };
        container.appendChild(div);
    });
}

document.getElementById('custom-color').addEventListener('input', (e) => {
    applyColor(e.target.value);
});


function applyColor(hex) {
    if (!maskData) return;
    const tr = parseInt(hex.slice(1, 3), 16);
    const tg = parseInt(hex.slice(3, 5), 16);
    const tb = parseInt(hex.slice(5, 7), 16);
    const [tH, tS, tV] = rgbToHsv(tr, tg, tb);

    const output = new ImageData(
        new Uint8ClampedArray(originalImageData.data),
        originalImageData.width,
        originalImageData.height
    );
    const data = output.data;

    for (let i = 0; i < maskData.length; i++) {
        if (maskData[i] === 1) {
            const idx = i * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            let [h, s, v] = rgbToHsv(r, g, b);
            h = tH;
            s = tS;
            if (tS < 0.1) {
                v = v * 0.3 + tV * 0.7;
                if (v > 1) v = 1;
            }
            const [newR, newG, newB] = hsvToRgb(h, s, v);
            data[idx] = newR;
            data[idx + 1] = newG;
            data[idx + 2] = newB;
        }
    }

    activeRecoloredData = output;

    if (isCompareMode) {
        renderCompareView();
    } else {
        if (canvas.width !== originalImageData.width) {
            canvas.width = originalImageData.width;
            canvas.height = originalImageData.height;
        }
        ctx.putImageData(output, 0, 0);
    }
}

function rgbToHsv(r, g, b) {
    r /= 255, g /= 255, b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) h = 0;
    else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h, s, v];
}

function hsvToRgb(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
