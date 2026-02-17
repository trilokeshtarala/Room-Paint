
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

// Compare
let isCompareMode = false;
let referenceImageData = null;
let activeRecoloredData = null;

// Zoom
let zoomLevel = 1.0;
let interactionMode = "DRAW";

// Categories (Expanded)
const CATEGORIES = {
    "Bedroom": [
        ["Light Blue", "#add8e6"], ["Slate Blue", "#6a5acd"], ["Navy Blue", "#000080"],
        ["Sage Green", "#8fbc8f"], ["Silver", "#c0c0c0"], ["Lavender", "#e6e6fa"],
        ["Warm Gray", "#a9a9a9"], ["Charcoal", "#36454f"], ["Crisp White", "#ffffff"],
        ["Terracotta", "#e2725b"], ["Rust", "#b7410e"], ["Cream", "#fffdd0"]
    ],
    "Kitchen": [
        ["White", "#ffffff"], ["Warm Yellow", "#ffdb58"],
        ["Red Accent", "#dc143c"], ["Orange", "#ffa500"]
    ],
    "Hall / Living": [
        ["Warm Beige", "#f5f5dc"], ["Greige", "#cdcdd0"],
        ["Soft Terracotta", "#cc4e5c"], ["Earthy Ochre", "#cc7722"],
        ["Green", "#228b22"], ["Charcoal", "#333333"]
    ],
    "Bathroom": [
        ["Crisp White", "#fafafa"], ["Aqua", "#00ffff"],
        ["Light Teal", "#64b5a0"], ["Charcoal", "#464646"],
        ["Black", "#0a0a0a"]
    ],
    "Dining": [
        ["Warm Red", "#b22222"], ["Aubergine", "#4b0082"]
    ],
    "Office": [
        ["Green", "#008000"], ["Deep Blue", "#00008b"], ["Yellow", "#ffff00"]
    ],
    "Gaming": [
        ["Neutral Gray", "#808080"], ["Matte Black", "#1a1a1a"], ["White", "#f8f8f8"]
    ]
};
let currentCatIdx = 0;
const catNames = Object.keys(CATEGORIES);

// ─────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────
fileInput.addEventListener('change', handleImageUpload);
btnUpload.addEventListener('click', () => fileInput.click());

function handleImageUpload(e) {
    if (!e.target.files.length) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        img = new Image();
        img.onload = () => { initCanvas(); resetSelection(); };
        img.src = ev.target.result;
    };
    reader.readAsDataURL(e.target.files[0]);
}

function initCanvas() {
    zoomLevel = 1.0;
    updateZoom();

    const maxW = wrapper.clientWidth * 0.95;
    const maxH = wrapper.clientHeight * 0.92;
    const scaleW = maxW / img.width;
    const scaleH = maxH / img.height;
    scale = Math.min(scaleW, scaleH, 1);

    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    referenceImageData = originalImageData;
}

// ─────────────────────────────────────────────────────────────
// Zoom & Pan
// ─────────────────────────────────────────────────────────────
function updateZoom() {
    canvas.style.transformOrigin = "0 0";
    canvas.style.transform = `scale(${zoomLevel})`;
}

btnZoomIn.addEventListener('click', () => {
    zoomLevel = Math.min(zoomLevel * 1.25, 5);
    updateZoom();
});
btnZoomOut.addEventListener('click', () => {
    zoomLevel = Math.max(zoomLevel / 1.25, 1);
    updateZoom();
});
btnZoomReset.addEventListener('click', () => {
    zoomLevel = 1.0;
    updateZoom();
    wrapper.scrollLeft = 0;
    wrapper.scrollTop = 0;
});

modeToggle.addEventListener('click', () => {
    setInteractionMode(interactionMode === "DRAW" ? "PAN" : "DRAW");
});

function setInteractionMode(mode) {
    interactionMode = mode;
    if (mode === "PAN") {
        modeText.textContent = "Pan";
        modeIcon.textContent = "✋";
        modeToggle.classList.add('pan-active');
        canvas.style.touchAction = "auto";
        wrapper.style.touchAction = "auto";
        canvas.style.cursor = "grab";
    } else {
        modeText.textContent = "Draw";
        modeIcon.textContent = "✎";
        modeToggle.classList.remove('pan-active');
        canvas.style.touchAction = "none";
        wrapper.style.touchAction = "none";
        canvas.style.cursor = "crosshair";
    }
}
setInteractionMode("DRAW");

// ─────────────────────────────────────────────────────────────
// Selection Logic
// ─────────────────────────────────────────────────────────────
canvas.addEventListener('mousedown', handleInput);
canvas.addEventListener('touchstart', handleInput, { passive: false });

function handleInput(e) {
    if (interactionMode === "PAN" || isRecolorPhase) return;
    if (e.cancelable) e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const cx = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const cy = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    const x = (cx - rect.left) * (canvas.width / rect.width);
    const y = (cy - rect.top) * (canvas.height / rect.height);
    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) return;

    currentPoints.push({ x, y });
    renderSelection();
}

// ── Smooth Canvas Rendering ──────────────────────────────
function renderSelection() {
    ctx.putImageData(originalImageData, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Completed polygons — semi-transparent teal fill
    for (const poly of completedPolygons) {
        if (poly.length < 3) continue;
        drawPolygon(poly, 'rgba(0,209,255,0.18)', 'rgba(0,209,255,0.7)', true);
    }

    // Active polygon — bright green outline
    if (currentPoints.length > 0) {
        drawPolygon(currentPoints, null, 'rgba(0,255,120,0.9)', false);

        // Close-hint line (dashed)
        if (currentPoints.length > 2) {
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = 'rgba(255,255,0,0.5)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(currentPoints[currentPoints.length - 1].x, currentPoints[currentPoints.length - 1].y);
            ctx.lineTo(currentPoints[0].x, currentPoints[0].y);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // Draw points with glow
        for (const p of currentPoints) {
            // Glow
            ctx.beginPath();
            ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 80, 80, 0.25)';
            ctx.fill();
            // Dot
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ff4444';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
    }
}

function drawPolygon(pts, fillColor, strokeColor, close) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (close) ctx.closePath();

    if (fillColor) { ctx.fillStyle = fillColor; ctx.fill(); }
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.stroke();
}

// ── Button Handlers ──────────────────────────────────────
document.getElementById('btn-undo').addEventListener('click', () => {
    if (currentPoints.length > 0) currentPoints.pop();
    else if (completedPolygons.length > 0) currentPoints = completedPolygons.pop();
    renderSelection();
});

document.getElementById('btn-add-poly').addEventListener('click', () => {
    if (currentPoints.length < 3) return;
    completedPolygons.push([...currentPoints]);
    currentPoints = [];
    renderSelection();
});

document.getElementById('btn-finish').addEventListener('click', () => {
    if (currentPoints.length >= 3) {
        completedPolygons.push([...currentPoints]);
        currentPoints = [];
    }
    if (!completedPolygons.length) return alert("Select at least one wall!");
    createMask();
    enterRecolorPhase();
});

function createMask() {
    const mc = document.createElement('canvas');
    mc.width = canvas.width;
    mc.height = canvas.height;
    const m = mc.getContext('2d', { willReadFrequently: true });
    m.fillStyle = '#FFF';
    for (const poly of completedPolygons) {
        m.beginPath();
        m.moveTo(poly[0].x, poly[0].y);
        for (let i = 1; i < poly.length; i++) m.lineTo(poly[i].x, poly[i].y);
        m.closePath();
        m.fill();
    }
    const d = m.getImageData(0, 0, mc.width, mc.height).data;
    maskData = new Uint8Array(mc.width * mc.height);
    for (let i = 0; i < maskData.length; i++) if (d[i * 4] > 128) maskData[i] = 1;
}

// ─────────────────────────────────────────────────────────────
// Recolor Phase
// ─────────────────────────────────────────────────────────────
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
    document.getElementById('btn-compare-toggle').textContent = "Compare";
    setInteractionMode("DRAW");
}

document.getElementById('btn-save').addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'wall_design.jpg';
    a.href = canvas.toDataURL('image/jpeg', 0.92);
    a.click();
});

// ── Compare Mode ─────────────────────────────────────────
document.getElementById('btn-compare-toggle').addEventListener('click', () => {
    isCompareMode = !isCompareMode;
    const btn = document.getElementById('btn-compare-toggle');
    if (isCompareMode) {
        btn.textContent = "Exit Compare";
        panels.compare.classList.remove('hidden');
        zoomLevel = 1.0; updateZoom();
        setInteractionMode("PAN");
        renderCompareView();
    } else {
        btn.textContent = "Compare";
        panels.compare.classList.add('hidden');
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
    const w = originalImageData.width, h = originalImageData.height;
    canvas.width = w * 2;
    canvas.height = h;

    ctx.putImageData(referenceImageData, 0, 0);
    ctx.putImageData(activeRecoloredData, w, 0);

    // Separator
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w, h); ctx.stroke();
    ctx.setLineDash([]);

    // Labels
    ctx.font = "600 20px 'Inter', sans-serif";
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#fff';
    ctx.fillText("Reference", 16, 36);
    ctx.fillText("Active", w + 16, 36);
    ctx.shadowBlur = 0;
}

// ── Palette ──────────────────────────────────────────────
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
    const c = document.getElementById('color-container');
    c.innerHTML = '';
    CATEGORIES[name].forEach(([colorName, hex]) => {
        const d = document.createElement('div');
        d.className = 'swatch';
        d.style.backgroundColor = hex;
        d.title = colorName;
        d.setAttribute('aria-label', colorName);
        d.onclick = () => {
            document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
            d.classList.add('selected');
            applyColor(hex);
        };
        c.appendChild(d);
    });
}

document.getElementById('custom-color').addEventListener('input', e => applyColor(e.target.value));

// ─────────────────────────────────────────────────────────────
// Recolor Engine (HSV)
// ─────────────────────────────────────────────────────────────
function applyColor(hex) {
    if (!maskData) return;
    const tr = parseInt(hex.slice(1, 3), 16);
    const tg = parseInt(hex.slice(3, 5), 16);
    const tb = parseInt(hex.slice(5, 7), 16);
    const [tH, tS, tV] = rgbToHsv(tr, tg, tb);

    const out = new ImageData(
        new Uint8ClampedArray(originalImageData.data),
        originalImageData.width, originalImageData.height
    );
    const d = out.data;

    for (let i = 0; i < maskData.length; i++) {
        if (maskData[i] !== 1) continue;
        const idx = i * 4;
        let [h, s, v] = rgbToHsv(d[idx], d[idx + 1], d[idx + 2]);
        h = tH; s = tS;
        if (tS < 0.1) { v = v * 0.3 + tV * 0.7; if (v > 1) v = 1; }
        const [nr, ng, nb] = hsvToRgb(h, s, v);
        d[idx] = nr; d[idx + 1] = ng; d[idx + 2] = nb;
    }

    activeRecoloredData = out;
    if (isCompareMode) { renderCompareView(); return; }
    if (canvas.width !== originalImageData.width) {
        canvas.width = originalImageData.width;
        canvas.height = originalImageData.height;
    }
    ctx.putImageData(out, 0, 0);
}

// ── Color Space Utils ────────────────────────────────────
function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h, s = mx === 0 ? 0 : d / mx, v = mx;
    if (mx === mn) h = 0;
    else { switch (mx) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; } h /= 6; }
    return [h, s, v];
}

function hsvToRgb(h, s, v) {
    let r, g, b; const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) { case 0: r = v; g = t; b = p; break; case 1: r = q; g = v; b = p; break; case 2: r = p; g = v; b = t; break; case 3: r = p; g = q; b = v; break; case 4: r = t; g = p; b = v; break; case 5: r = v; g = p; b = q; break; }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}
