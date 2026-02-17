
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
let walls = []; // Array of { points: [], color: null, mask: Uint8Array, id: number }
let activeWallIndex = -1; // Index of wall being colored
let scale = 1;
let isRecolorPhase = false;

// Compare
let isCompareMode = false;
let referenceImageData = null;
let currentCompositeData = null; // The result of all colored walls combined

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
    currentCompositeData = originalImageData;
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
// Selection Logic (Phase 1)
// ─────────────────────────────────────────────────────────────
canvas.addEventListener('mousedown', handleInput);
canvas.addEventListener('touchstart', handleInput, { passive: false });

function handleInput(e) {
    if (interactionMode === "PAN") return;
    if (e.cancelable) e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const cx = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const cy = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;

    const x = (cx - rect.left) * (canvas.width / rect.width);
    const y = (cy - rect.top) * (canvas.height / rect.height);
    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) return;

    // Phase 1: Creating Walls
    if (!isRecolorPhase) {
        currentPoints.push({ x, y });
        renderSelectionOverlay();
        return;
    }

    // Phase 2: Selecting Walls for Coloring
    // Hit test walls
    let clickedWallIndex = -1;
    // Iterate backwards to select top-most if overlapping (though user ideally shouldn't overlap much)
    for (let i = walls.length - 1; i >= 0; i--) {
        if (isPointInPolygon({ x, y }, walls[i].points)) {
            clickedWallIndex = i;
            break;
        }
    }

    if (clickedWallIndex !== -1) {
        activeWallIndex = clickedWallIndex;
        renderRecolorComposite(); // Re-render to show selection glow
    } else {
        // Deselect if clicked outside? Maybe keep selected to avoid accidental deselects.
        // Or strictly strictly only select if clicked on wall.
    }
}

// Point in Polygon (Ray casting alg)
function isPointInPolygon(p, polygon) {
    let isInside = false;
    let minX = polygon[0].x, maxX = polygon[0].x;
    let minY = polygon[0].y, maxY = polygon[0].y;
    for (const n of polygon) {
        minX = Math.min(n.x, minX);
        maxX = Math.max(n.x, maxX);
        minY = Math.min(n.y, minY);
        maxY = Math.max(n.y, maxY);
    }
    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
        return false;
    }
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        if (((polygon[i].y > p.y) !== (polygon[j].y > p.y)) &&
            (p.x < (polygon[j].x - polygon[i].x) * (p.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x)) {
            isInside = !isInside;
        }
    }
    return isInside;
}

// ── Render Selection Phase ──────────────────────────────
function renderSelectionOverlay() {
    ctx.putImageData(originalImageData, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Completed walls
    for (const wall of walls) {
        drawPolygon(wall.points, 'rgba(0,209,255,0.15)', 'rgba(0,209,255,0.5)', true);
    }

    // Active polygon being drawn
    if (currentPoints.length > 0) {
        drawPolygon(currentPoints, null, 'rgba(0,255,120,0.9)', false);
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
        for (const p of currentPoints) {
            ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#ff4444'; ctx.fill();
        }
    }
}

function drawPolygon(pts, fillColor, strokeColor, close) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (close) ctx.closePath();
    if (fillColor) { ctx.fillStyle = fillColor; ctx.fill(); }
    if (strokeColor) { ctx.strokeStyle = strokeColor; ctx.lineWidth = 2; ctx.stroke(); }
}

// ── Button Handlers ──────────────────────────────────────
document.getElementById('btn-undo').addEventListener('click', () => {
    if (currentPoints.length > 0) currentPoints.pop();
    else if (walls.length > 0) {
        walls.pop();
        if (activeWallIndex >= walls.length) activeWallIndex = -1;
    }
    renderSelectionOverlay();
});

document.getElementById('btn-add-poly').addEventListener('click', () => {
    if (currentPoints.length < 3) return;
    addWallFromPoints(currentPoints);
    currentPoints = [];
    renderSelectionOverlay();
});

document.getElementById('btn-finish').addEventListener('click', () => {
    if (currentPoints.length >= 3) {
        addWallFromPoints(currentPoints);
        currentPoints = [];
    }
    if (!walls.length) return alert("Select at least one wall!");

    // Generate masks
    walls.forEach(w => w.mask = createMaskForPolygon(w.points));

    // Select first wall by default
    activeWallIndex = 0;

    enterRecolorPhase();
});

function addWallFromPoints(pts) {
    walls.push({
        id: Date.now() + Math.random(),
        points: [...pts],
        color: null, // hex string
        mask: null // generated later
    });
}

function createMaskForPolygon(points) {
    const mc = document.createElement('canvas');
    mc.width = canvas.width;
    mc.height = canvas.height;
    const m = mc.getContext('2d', { willReadFrequently: true });

    m.fillStyle = '#000'; // logical 1 (we check for value > 0)
    m.beginPath();
    m.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) m.lineTo(points[i].x, points[i].y);
    m.closePath();
    m.fill();

    const d = m.getImageData(0, 0, mc.width, mc.height).data;
    const mask = new Uint8Array(mc.width * mc.height);
    // Alpha channel is d[i*4+3] (255 if filled). Or we used fillStyle black which is r=0,g=0,b=0,a=255
    // Wait, canvas is transparent by default. Filled pixels have alpha=255.

    for (let i = 0; i < mask.length; i++) {
        if (d[i * 4 + 3] > 128) mask[i] = 1;
    }
    return mask;
}


// ─────────────────────────────────────────────────────────────
// Recolor Phase Logic
// ─────────────────────────────────────────────────────────────
function enterRecolorPhase() {
    isRecolorPhase = true;
    steps.select.classList.remove('active');
    steps.recolor.classList.add('active');
    panels.select.classList.add('hidden');
    panels.instruction.classList.remove('hidden');
    panels.instruction.innerHTML = "<p>Tap a wall to select it (glowing), then pick a color.<br>Each wall can be a different color!</p>";
    panels.recolor.classList.remove('hidden');
    panels.nav.classList.remove('hidden');
    panels.palette.classList.remove('hidden');
    panels.custom.classList.remove('hidden');
    panels.compare.classList.add('hidden'); // Ensure hidden initially

    // Make sure we are in pan mode for ease? Or keep user preference.
    // Let's force Pan initially to avoid accidental wall selection? 
    // No, Draw/Select mode is needed to click walls.
    setInteractionMode("DRAW");

    renderPalette();
    renderRecolorComposite();
}

document.getElementById('btn-reset').addEventListener('click', resetSelection);

function resetSelection() {
    isRecolorPhase = false;
    isCompareMode = false;
    currentPoints = [];
    walls = [];
    activeWallIndex = -1;
    originalImageData = null;
    currentCompositeData = null;

    initCanvas();
    steps.recolor.classList.remove('active');
    steps.select.classList.add('active');
    panels.select.classList.remove('hidden');
    panels.instruction.classList.remove('hidden');
    panels.instruction.innerHTML = '<p>Upload an image, then tap to outline walls.<br>Use <strong>Close Shape</strong> to finish each section.</p>';
    panels.recolor.classList.add('hidden');
    panels.nav.classList.add('hidden');
    panels.palette.classList.add('hidden');
    panels.custom.classList.add('hidden');
    panels.compare.classList.add('hidden');
    document.getElementById('btn-compare-toggle').textContent = "Compare";
    setInteractionMode("DRAW");
}

document.getElementById('btn-save').addEventListener('click', () => {
    // Render clean without selection glow
    renderRecolorComposite(false);
    const a = document.createElement('a');
    a.download = 'multi_wall_design.jpg';
    a.href = canvas.toDataURL('image/jpeg', 0.92);
    a.click();
    // Restore selection glow
    renderRecolorComposite(true);
});

// ── Compare ──────────────────────────────────────────────
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
        renderRecolorComposite();
    }
});

document.getElementById('btn-snapshot').addEventListener('click', () => {
    if (!isCompareMode) return;
    referenceImageData = currentCompositeData;
    renderCompareView();
});

document.getElementById('btn-reset-ref').addEventListener('click', () => {
    if (!isCompareMode) return;
    if (originalImageData) referenceImageData = originalImageData;
    renderCompareView();
});

function renderCompareView() {
    if (!isCompareMode) return;
    const w = originalImageData.width, h = originalImageData.height;
    canvas.width = w * 2;
    canvas.height = h;

    ctx.putImageData(referenceImageData, 0, 0);
    ctx.putImageData(currentCompositeData, w, 0);

    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w, h); ctx.stroke();

    ctx.font = "600 20px 'Inter', sans-serif";
    ctx.shadowColor = 'rgba(0,0,0,0.7)'; ctx.shadowBlur = 6; ctx.fillStyle = '#fff';
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
        d.onclick = () => {
            applyColorToActiveWall(hex);
        };
        c.appendChild(d);
    });
}
document.getElementById('custom-color').addEventListener('input', e => applyColorToActiveWall(e.target.value));

// ─────────────────────────────────────────────────────────────
// Multi-Wall Coloring Logic
// ─────────────────────────────────────────────────────────────
function applyColorToActiveWall(hex) {
    if (activeWallIndex === -1 || !walls[activeWallIndex]) {
        // Maybe alert user: "Please select a wall first"
        // But for UX, if there's only 1 wall, we auto-selected it.
        return;
    }

    walls[activeWallIndex].color = hex;
    renderRecolorComposite();
}


function renderRecolorComposite(showSelection = true) {
    // 1. Start with original
    const out = new ImageData(
        new Uint8ClampedArray(originalImageData.data),
        originalImageData.width, originalImageData.height
    );
    const d = out.data;

    // 2. Iterate walls and apply color
    // Optimization: We could merge masks where colors are same, but simple loop is robust.
    for (const wall of walls) {
        if (!wall.color || !wall.mask) continue;

        const tr = parseInt(wall.color.slice(1, 3), 16);
        const tg = parseInt(wall.color.slice(3, 5), 16);
        const tb = parseInt(wall.color.slice(5, 7), 16);
        const [tH, tS, tV] = rgbToHsv(tr, tg, tb);

        for (let i = 0; i < wall.mask.length; i++) {
            if (wall.mask[i] !== 1) continue;

            const idx = i * 4;
            // Get pixel from *original* image (or acumulatively? Original is better to avoid degradation)
            // But if walls overlap? Last one wins.

            let [h, s, v] = rgbToHsv(d[idx], d[idx + 1], d[idx + 2]);
            h = tH;
            s = tS;
            // Preserving brightness/texture logic
            if (tS < 0.1) { v = v * 0.3 + tV * 0.7; if (v > 1) v = 1; }

            const [nr, ng, nb] = hsvToRgb(h, s, v);
            d[idx] = nr; d[idx + 1] = ng; d[idx + 2] = nb;
        }
    }

    currentCompositeData = out;

    if (isCompareMode) {
        renderCompareView();
        return;
    }

    // 3. Draw to canvas
    if (canvas.width !== originalImageData.width) {
        canvas.width = originalImageData.width;
        canvas.height = originalImageData.height;
    }
    ctx.putImageData(out, 0, 0);

    // 4. Draw Active Wall outline/glow
    if (showSelection && isRecolorPhase && activeWallIndex !== -1 && walls[activeWallIndex]) {
        const wall = walls[activeWallIndex];

        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Glow
        ctx.shadowColor = '#00ffea';
        ctx.shadowBlur = 15;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 3;

        ctx.beginPath();
        ctx.moveTo(wall.points[0].x, wall.points[0].y);
        for (let i = 1; i < wall.points.length; i++) ctx.lineTo(wall.points[i].x, wall.points[i].y);
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
    }
}


// ── Utils ────────────────────────────────────────────────
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
