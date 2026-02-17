/* ═══════════════════════════════════════════════════════════
   RoomPaint – app.js
   Multi-Color Walls · Save/Load Project · Draggable Points
   Pinch-to-Zoom · Guided UX
   ═══════════════════════════════════════════════════════════ */

// ── DOM ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const welcomeScreen = $('welcome-screen');
const appContainer = $('app-container');
const canvas = $('main-canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const wrapper = $('canvas-wrapper');
const fileInput = $('file-input');
const projectInput = $('project-input');
const tipBar = $('tip-bar');
const tipText = $('tip-text');
const tipIcon = $('tip-icon');
const stepBar = $('step-bar');
const modeToggle = $('mode-toggle');
const modeText = $('mode-text');
const modeIcon = $('mode-icon');

const panels = {
    select: $('select-actions'),
    recolor: $('recolor-actions'),
    nav: $('category-nav'),
    palette: $('palette-scroll'),
    custom: $('custom-picker-container'),
    compare: $('compare-controls'),
    chips: $('wall-chips')
};

// ── State ────────────────────────────────────────────────
let img = new Image();
let imgDataURL = null;          // Keep original data URI for save/load
let originalImageData = null;
let currentPoints = [];
let walls = [];                 // { points[], mask, color, id }
let activeWallIndex = -1;
let scale = 1;
let phase = 'SELECT';           // SELECT | RECOLOR
let zoomLevel = 1.0;
let interactionMode = 'DRAW';   // DRAW | PAN | MOVE

// Compare
let isCompareMode = false;
let referenceImageData = null;
let currentCompositeData = null;

// Point dragging
let dragPointInfo = null;        // { wallIdx, pointIdx } or { isCurrentPoly: true, pointIdx }
const DRAG_RADIUS = 14;         // px radius to grab a point

// Pinch zoom
let initialPinchDist = null;
let initialZoom = 1;

// Categories
const CATEGORIES = {
    "Bedroom": [["Light Blue", "#add8e6"], ["Slate Blue", "#6a5acd"], ["Navy", "#000080"], ["Sage Green", "#8fbc8f"], ["Silver", "#c0c0c0"], ["Lavender", "#e6e6fa"], ["Warm Gray", "#a9a9a9"], ["Charcoal", "#36454f"], ["White", "#ffffff"], ["Terracotta", "#e2725b"], ["Rust", "#b7410e"], ["Cream", "#fffdd0"]],
    "Kitchen": [["White", "#ffffff"], ["Warm Yellow", "#ffdb58"], ["Red", "#dc143c"], ["Orange", "#ffa500"]],
    "Hall/Living": [["Warm Beige", "#f5f5dc"], ["Greige", "#cdcdd0"], ["Terracotta", "#cc4e5c"], ["Ochre", "#cc7722"], ["Green", "#228b22"], ["Charcoal", "#333"]],
    "Bathroom": [["White", "#fafafa"], ["Aqua", "#00ffff"], ["Teal", "#64b5a0"], ["Charcoal", "#464646"], ["Black", "#0a0a0a"]],
    "Dining": [["Warm Red", "#b22222"], ["Aubergine", "#4b0082"]],
    "Office": [["Green", "#008000"], ["Deep Blue", "#00008b"], ["Yellow", "#ffff00"]],
    "Gaming": [["Gray", "#808080"], ["Matte Black", "#1a1a1a"], ["White", "#f8f8f8"]]
};
let currentCatIdx = 0;
const catNames = Object.keys(CATEGORIES);


/* ═══════════════════════════════════════════════════════════
   1. WELCOME & IMAGE UPLOAD
   ═══════════════════════════════════════════════════════════ */

$('btn-choose-file').addEventListener('click', () => fileInput.click());
$('btn-new-image').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', e => {
    if (!e.target.files.length) return;
    loadImageFile(e.target.files[0]);
    e.target.value = '';
});

// Drag & Drop
const dropZone = $('drop-zone');
['dragenter', 'dragover'].forEach(ev =>
    dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.add('drag-over'); })
);
['dragleave', 'drop'].forEach(ev =>
    dropZone.addEventListener(ev, e => { e.preventDefault(); dropZone.classList.remove('drag-over'); })
);
dropZone.addEventListener('drop', e => {
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) loadImageFile(file);
});

function loadImageFile(file) {
    const reader = new FileReader();
    reader.onload = ev => {
        imgDataURL = ev.target.result;
        img = new Image();
        img.onload = () => {
            welcomeScreen.classList.add('hidden');
            appContainer.classList.remove('hidden');
            initCanvas();
            enterSelectPhase();
            toast('Image loaded — start outlining walls!');
        };
        img.src = imgDataURL;
    };
    reader.readAsDataURL(file);
}

function initCanvas() {
    zoomLevel = 1.0; updateZoom();
    const maxW = wrapper.clientWidth * 0.95;
    const maxH = wrapper.clientHeight * 0.92;
    scale = Math.min(maxW / img.width, maxH / img.height, 1);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    referenceImageData = originalImageData;
    currentCompositeData = originalImageData;
}


/* ═══════════════════════════════════════════════════════════
   2. STEP BAR & TIP HELPERS
   ═══════════════════════════════════════════════════════════ */

function setStep(n) {
    const pips = stepBar.querySelectorAll('.step-pip');
    const cons = stepBar.querySelectorAll('.step-connector');
    pips.forEach((p, i) => {
        p.classList.remove('active', 'done');
        if (i + 1 < n) p.classList.add('done');
        if (i + 1 === n) p.classList.add('active');
    });
    cons.forEach((c, i) => { c.classList.toggle('done', i + 1 < n); });
}

function setTip(icon, text) {
    tipIcon.textContent = icon;
    tipText.textContent = text;
    tipBar.style.animation = 'none'; tipBar.offsetHeight;
    tipBar.style.animation = 'slideDown .35s var(--ease)';
}


/* ═══════════════════════════════════════════════════════════
   3. ZOOM & PAN + PINCH-TO-ZOOM
   ═══════════════════════════════════════════════════════════ */

function updateZoom() {
    canvas.style.transformOrigin = '0 0';
    canvas.style.transform = `scale(${zoomLevel})`;
}

$('btn-zoom-in').addEventListener('click', () => { zoomLevel = Math.min(zoomLevel * 1.25, 5); updateZoom(); });
$('btn-zoom-out').addEventListener('click', () => { zoomLevel = Math.max(zoomLevel / 1.25, 1); updateZoom(); });
$('btn-zoom-reset').addEventListener('click', () => { zoomLevel = 1; updateZoom(); wrapper.scrollLeft = wrapper.scrollTop = 0; });

modeToggle.addEventListener('click', () => {
    // Cycle: DRAW → MOVE → PAN → DRAW
    if (interactionMode === 'DRAW') setMode('MOVE');
    else if (interactionMode === 'MOVE') setMode('PAN');
    else setMode('DRAW');
});

function setMode(m) {
    interactionMode = m;
    if (m === 'PAN') {
        modeText.textContent = 'Pan'; modeIcon.textContent = '✋';
        modeToggle.classList.add('pan-active'); modeToggle.classList.remove('move-active');
        canvas.style.touchAction = wrapper.style.touchAction = 'auto';
        canvas.style.cursor = 'grab';
    } else if (m === 'MOVE') {
        modeText.textContent = 'Move Pts'; modeIcon.textContent = '✥';
        modeToggle.classList.remove('pan-active'); modeToggle.classList.add('move-active');
        canvas.style.touchAction = wrapper.style.touchAction = 'none';
        canvas.style.cursor = 'move';
    } else {
        modeText.textContent = 'Draw'; modeIcon.textContent = '✏️';
        modeToggle.classList.remove('pan-active', 'move-active');
        canvas.style.touchAction = wrapper.style.touchAction = 'none';
        canvas.style.cursor = 'crosshair';
    }
}
setMode('DRAW');

// ── Pinch-to-zoom (mobile) ──────────────────────────────
wrapper.addEventListener('touchstart', onPinchStart, { passive: false });
wrapper.addEventListener('touchmove', onPinchMove, { passive: false });
wrapper.addEventListener('touchend', onPinchEnd);

function getPinchDist(e) {
    const [a, b] = [e.touches[0], e.touches[1]];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function onPinchStart(e) {
    if (e.touches.length === 2) {
        e.preventDefault();
        initialPinchDist = getPinchDist(e);
        initialZoom = zoomLevel;
    }
}

function onPinchMove(e) {
    if (e.touches.length === 2 && initialPinchDist) {
        e.preventDefault();
        const dist = getPinchDist(e);
        const ratio = dist / initialPinchDist;
        zoomLevel = Math.max(1, Math.min(5, initialZoom * ratio));
        updateZoom();
    }
}

function onPinchEnd(e) {
    if (e.touches.length < 2) { initialPinchDist = null; }
}


/* ═══════════════════════════════════════════════════════════
   4. CANVAS INPUT (Draw + Move Points)
   ═══════════════════════════════════════════════════════════ */

canvas.addEventListener('mousedown', onPointerDown);
canvas.addEventListener('touchstart', onPointerDown, { passive: false });
canvas.addEventListener('mousemove', onPointerMove);
canvas.addEventListener('touchmove', onPointerMove, { passive: false });
canvas.addEventListener('mouseup', onPointerUp);
canvas.addEventListener('touchend', onPointerUp);

function getCanvasXY(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    const cy = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    return {
        x: (cx - rect.left) * (canvas.width / rect.width),
        y: (cy - rect.top) * (canvas.height / rect.height)
    };
}

function getCanvasXYFromEnd(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
    const cy = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
    return {
        x: (cx - rect.left) * (canvas.width / rect.width),
        y: (cy - rect.top) * (canvas.height / rect.height)
    };
}

function onPointerDown(e) {
    if (interactionMode === 'PAN') return;
    // Ignore multi-touch (pinch) — only handle single finger
    if (e.touches && e.touches.length > 1) return;
    if (e.cancelable) e.preventDefault();

    const { x, y } = getCanvasXY(e);
    if (x < 0 || y < 0 || x > canvas.width || y > canvas.height) return;

    // ── MOVE mode: find nearest point to drag ──
    if (interactionMode === 'MOVE') {
        dragPointInfo = findNearestPoint(x, y);
        return;
    }

    // ── DRAW mode ──
    if (phase === 'SELECT') {
        currentPoints.push({ x, y });
        renderSelection();
        if (currentPoints.length === 1) setTip('📍', 'Great! Keep tapping corners around the wall.');
        if (currentPoints.length === 3) setTip('✅', 'You can tap "Close Shape" now, or keep adding points.');
    }

    if (phase === 'RECOLOR') {
        for (let i = walls.length - 1; i >= 0; i--) {
            if (pointInPoly({ x, y }, walls[i].points)) {
                selectWall(i); return;
            }
        }
    }
}

function onPointerMove(e) {
    if (!dragPointInfo || interactionMode !== 'MOVE') return;
    if (e.touches && e.touches.length > 1) return;
    if (e.cancelable) e.preventDefault();
    const { x, y } = getCanvasXY(e);
    applyDrag(x, y);
}

function onPointerUp(e) {
    if (dragPointInfo && interactionMode === 'MOVE') {
        // If in recolor phase, regenerate mask for the moved wall
        if (phase === 'RECOLOR' && dragPointInfo.wallIdx !== undefined) {
            const w = walls[dragPointInfo.wallIdx];
            w.mask = createMask(w.points);
            renderRecolor();
        }
        dragPointInfo = null;
    }
}

function findNearestPoint(x, y) {
    let best = null, bestDist = DRAG_RADIUS;

    // Check currentPoints (active polygon in SELECT phase)
    if (phase === 'SELECT') {
        currentPoints.forEach((p, pi) => {
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < bestDist) { bestDist = d; best = { isCurrentPoly: true, pointIdx: pi }; }
        });
    }

    // Check completed walls
    walls.forEach((w, wi) => {
        w.points.forEach((p, pi) => {
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < bestDist) { bestDist = d; best = { wallIdx: wi, pointIdx: pi }; }
        });
    });

    return best;
}

function applyDrag(x, y) {
    if (!dragPointInfo) return;
    // Clamp to canvas
    x = Math.max(0, Math.min(canvas.width, x));
    y = Math.max(0, Math.min(canvas.height, y));

    if (dragPointInfo.isCurrentPoly) {
        currentPoints[dragPointInfo.pointIdx] = { x, y };
        renderSelection();
    } else {
        walls[dragPointInfo.wallIdx].points[dragPointInfo.pointIdx] = { x, y };
        if (phase === 'SELECT') renderSelection();
        else renderRecolor();
    }
}


/* ═══════════════════════════════════════════════════════════
   5. SELECT PHASE
   ═══════════════════════════════════════════════════════════ */

function enterSelectPhase() {
    phase = 'SELECT';
    walls = [];
    activeWallIndex = -1;
    currentPoints = [];
    isCompareMode = false;

    setStep(1);
    setTip('✏️', 'Tap corners of a wall to outline it. Tap "Close Shape" when done.');

    panels.select.classList.remove('hidden');
    panels.recolor.classList.add('hidden');
    panels.nav.classList.add('hidden');
    panels.palette.classList.add('hidden');
    panels.custom.classList.add('hidden');
    panels.compare.classList.add('hidden');
    panels.chips.classList.add('hidden');
    $('btn-compare-toggle').textContent = '⇔ Compare';
    setMode('DRAW');
    renderSelection();
}

function renderSelection() {
    ctx.putImageData(originalImageData, 0, 0);
    ctx.lineCap = ctx.lineJoin = 'round';

    // Completed walls (blue fill + label)
    walls.forEach((w, i) => {
        fillPoly(w.points, 'rgba(0,209,255,0.12)', 'rgba(0,209,255,0.45)');
        const cxp = w.points.reduce((s, p) => s + p.x, 0) / w.points.length;
        const cyp = w.points.reduce((s, p) => s + p.y, 0) / w.points.length;
        ctx.font = '600 13px Inter, sans-serif';
        ctx.fillStyle = 'rgba(0,209,255,0.8)'; ctx.textAlign = 'center';
        ctx.fillText(`Wall ${i + 1}`, cxp, cyp + 5);
        // Draw draggable points for completed walls
        drawDraggablePoints(w.points, '#00d1ff');
    });

    // Active polygon being drawn (green)
    if (currentPoints.length > 0) {
        drawOutline(currentPoints, 'rgba(0,255,120,0.85)');
        if (currentPoints.length > 2) {
            ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(255,255,0,0.5)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(currentPoints.at(-1).x, currentPoints.at(-1).y);
            ctx.lineTo(currentPoints[0].x, currentPoints[0].y); ctx.stroke(); ctx.setLineDash([]);
        }
        drawDraggablePoints(currentPoints, '#ff4444');
    }
}

function drawDraggablePoints(points, color) {
    points.forEach(p => {
        // Outer glow
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = color.replace(')', ',0.2)').replace('rgb', 'rgba').replace('#', '');
        // Use a simpler approach
        ctx.globalAlpha = 0.2;
        ctx.fillStyle = color; ctx.fill();
        ctx.globalAlpha = 1;
        // Inner dot
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
    });
}

// Undo
$('btn-undo').addEventListener('click', () => {
    if (currentPoints.length > 0) { currentPoints.pop(); }
    else if (walls.length > 0) { walls.pop(); toast(`Wall ${walls.length + 1} removed`); }
    renderSelection();
});

// Close Shape
$('btn-add-poly').addEventListener('click', () => {
    if (currentPoints.length < 3) { toast('Tap at least 3 points!'); return; }
    walls.push({ id: Date.now(), points: [...currentPoints], color: null, mask: null });
    toast(`Wall ${walls.length} added ✓`);
    currentPoints = [];
    setTip('➕', `${walls.length} wall(s) outlined. Outline more or tap "Done →".`);
    renderSelection();
});

// Done
$('btn-finish').addEventListener('click', () => {
    if (currentPoints.length >= 3) {
        walls.push({ id: Date.now(), points: [...currentPoints], color: null, mask: null });
        currentPoints = [];
    }
    if (!walls.length) { toast('Outline at least one wall first!'); return; }
    walls.forEach(w => w.mask = createMask(w.points));
    activeWallIndex = 0;
    enterRecolorPhase();
});


/* ═══════════════════════════════════════════════════════════
   6. RECOLOR PHASE
   ═══════════════════════════════════════════════════════════ */

function enterRecolorPhase() {
    phase = 'RECOLOR';
    setStep(2);
    setTip('🎨', 'Tap a wall (or chip) to select it, then pick a color!');

    panels.select.classList.add('hidden');
    panels.recolor.classList.remove('hidden');
    panels.nav.classList.remove('hidden');
    panels.palette.classList.remove('hidden');
    panels.custom.classList.remove('hidden');
    panels.chips.classList.remove('hidden');

    renderWallChips();
    renderPalette();
    if (activeWallIndex >= 0) selectWall(activeWallIndex);
    else selectWall(0);
}

function selectWall(i) {
    activeWallIndex = i;
    renderWallChips();
    renderRecolor();
    const w = walls[i];
    const label = w.color ? `Wall ${i + 1} — ${w.color}` : `Wall ${i + 1} — no color yet`;
    setTip('👆', label + '. Pick a color below!');
}

function renderWallChips() {
    const c = panels.chips; c.innerHTML = '';
    walls.forEach((w, i) => {
        const chip = document.createElement('button');
        chip.className = 'wall-chip' + (i === activeWallIndex ? ' active' : '');
        chip.innerHTML = `<span class="chip-dot" style="background:${w.color || '#555'}"></span> Wall ${i + 1}`;
        chip.onclick = () => selectWall(i);
        c.appendChild(chip);
    });
}

// Back
$('btn-back').addEventListener('click', () => {
    walls.forEach(w => { w.color = null; w.mask = null; });
    enterSelectPhase();
    initCanvas();
    toast('Selection reset — re-outline your walls.');
});

// Save Image
$('btn-save').addEventListener('click', () => {
    renderRecolor(false);
    setStep(3);
    const a = document.createElement('a');
    a.download = 'roompaint_design.jpg';
    a.href = canvas.toDataURL('image/jpeg', 0.92);
    a.click();
    toast('Image saved! 🎉');
    renderRecolor();
});


/* ═══════════════════════════════════════════════════════════
   7. COMPARE MODE
   ═══════════════════════════════════════════════════════════ */

$('btn-compare-toggle').addEventListener('click', () => {
    isCompareMode = !isCompareMode;
    const btn = $('btn-compare-toggle');
    if (isCompareMode) {
        btn.textContent = '✕ Exit Compare';
        panels.compare.classList.remove('hidden');
        zoomLevel = 1; updateZoom(); setMode('PAN');
        renderCompare();
    } else {
        btn.textContent = '⇔ Compare';
        panels.compare.classList.add('hidden');
        canvas.width = originalImageData.width; canvas.height = originalImageData.height;
        renderRecolor();
    }
});

$('btn-snapshot').addEventListener('click', () => {
    if (!isCompareMode) return;
    referenceImageData = currentCompositeData;
    toast('Snapshot saved to Reference panel');
    renderCompare();
});
$('btn-reset-ref').addEventListener('click', () => {
    if (!isCompareMode) return;
    referenceImageData = originalImageData;
    renderCompare();
});

function renderCompare() {
    const w = originalImageData.width, h = originalImageData.height;
    canvas.width = w * 2; canvas.height = h;
    ctx.putImageData(referenceImageData, 0, 0);
    ctx.putImageData(currentCompositeData, w, 0);
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w, h); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = "600 18px 'Inter',sans-serif"; ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 5;
    ctx.fillText('Reference', 14, 32); ctx.fillText('Active', w + 14, 32); ctx.shadowBlur = 0;
}


/* ═══════════════════════════════════════════════════════════
   8. PALETTE & COLOR PICKING
   ═══════════════════════════════════════════════════════════ */

$('btn-prev-cat').addEventListener('click', () => { currentCatIdx = (currentCatIdx - 1 + catNames.length) % catNames.length; renderPalette(); });
$('btn-next-cat').addEventListener('click', () => { currentCatIdx = (currentCatIdx + 1) % catNames.length; renderPalette(); });

function renderPalette() {
    $('current-category').textContent = catNames[currentCatIdx];
    const c = $('color-container'); c.innerHTML = '';
    CATEGORIES[catNames[currentCatIdx]].forEach(([name, hex]) => {
        const d = document.createElement('div');
        d.className = 'swatch'; d.style.backgroundColor = hex;
        d.setAttribute('data-name', name); d.title = name;
        d.onclick = () => {
            c.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected'));
            d.classList.add('selected');
            applyColorToWall(hex);
        };
        c.appendChild(d);
    });
}

$('custom-color').addEventListener('input', e => applyColorToWall(e.target.value));


/* ═══════════════════════════════════════════════════════════
   9. MULTI-WALL RECOLOR ENGINE
   ═══════════════════════════════════════════════════════════ */

function applyColorToWall(hex) {
    if (activeWallIndex < 0 || !walls[activeWallIndex]) { toast('Select a wall first!'); return; }
    walls[activeWallIndex].color = hex;
    renderWallChips();
    renderRecolor();
}

function renderRecolor(showGlow = true) {
    const out = new ImageData(new Uint8ClampedArray(originalImageData.data), originalImageData.width, originalImageData.height);
    const d = out.data;

    for (const wall of walls) {
        if (!wall.color || !wall.mask) continue;
        const [tH, tS, tV] = hexToHsv(wall.color);
        for (let i = 0; i < wall.mask.length; i++) {
            if (!wall.mask[i]) continue;
            const idx = i * 4;
            let [h, s, v] = rgbToHsv(d[idx], d[idx + 1], d[idx + 2]);
            h = tH; s = tS;
            if (tS < 0.1) { v = v * 0.3 + tV * 0.7; if (v > 1) v = 1; }
            const [nr, ng, nb] = hsvToRgb(h, s, v);
            d[idx] = nr; d[idx + 1] = ng; d[idx + 2] = nb;
        }
    }

    currentCompositeData = out;
    if (isCompareMode) { renderCompare(); return; }
    if (canvas.width !== originalImageData.width) { canvas.width = originalImageData.width; canvas.height = originalImageData.height; }
    ctx.putImageData(out, 0, 0);

    // Active wall glow
    if (showGlow && activeWallIndex >= 0 && walls[activeWallIndex]) {
        const w = walls[activeWallIndex];
        ctx.save(); ctx.lineJoin = ctx.lineCap = 'round';
        ctx.shadowColor = '#00ffea'; ctx.shadowBlur = 14;
        ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(w.points[0].x, w.points[0].y);
        w.points.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath(); ctx.stroke(); ctx.restore();
        // Draw draggable points in recolor phase too (for MOVE mode)
        drawDraggablePoints(w.points, '#00ffea');
    }
}


/* ═══════════════════════════════════════════════════════════
   10. HELPERS
   ═══════════════════════════════════════════════════════════ */

function createMask(points) {
    const mc = document.createElement('canvas');
    mc.width = canvas.width; mc.height = canvas.height;
    const m = mc.getContext('2d', { willReadFrequently: true });
    m.fillStyle = '#000';
    m.beginPath(); m.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) m.lineTo(points[i].x, points[i].y);
    m.closePath(); m.fill();
    const d = m.getImageData(0, 0, mc.width, mc.height).data;
    const mask = new Uint8Array(mc.width * mc.height);
    for (let i = 0; i < mask.length; i++) if (d[i * 4 + 3] > 128) mask[i] = 1;
    return mask;
}

function fillPoly(pts, fill, stroke) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    pts.forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawOutline(pts, color) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
}

function pointInPoly(p, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const yi = poly[i].y, yj = poly[j].y, xi = poly[i].x, xj = poly[j].x;
        if ((yi > p.y) !== (yj > p.y) && p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)
            inside = !inside;
    }
    return inside;
}

function hexToHsv(hex) {
    return rgbToHsv(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h, s = mx ? d / mx : 0, v = mx;
    if (!d) h = 0;
    else { switch (mx) { case r: h = (g - b) / d + (g < b ? 6 : 0); break; case g: h = (b - r) / d + 2; break; case b: h = (r - g) / d + 4; break; } h /= 6; }
    return [h, s, v];
}

function hsvToRgb(h, s, v) {
    let r, g, b; const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    switch (i % 6) { case 0: r = v; g = t; b = p; break; case 1: r = q; g = v; b = p; break; case 2: r = p; g = v; b = t; break; case 3: r = p; g = q; b = v; break; case 4: r = t; g = p; b = v; break; case 5: r = v; g = p; b = q; break; }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

// ── Toast ────────────────────────────────────────────────
function toast(msg, ms = 2500) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    $('toast-container').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}


/* ═══════════════════════════════════════════════════════════
   11. SAVE / LOAD PROJECT (.roompaint)

   FIX: Points are stored as NORMALIZED (0-1) coordinates
   relative to image dimensions so they scale correctly
   regardless of browser window size on load.
   ═══════════════════════════════════════════════════════════ */

// Wire up buttons
$('btn-save-project').addEventListener('click', saveProject);
$('btn-load-project').addEventListener('click', () => projectInput.click());
$('btn-load-project-welcome').addEventListener('click', () => projectInput.click());
$('btn-load-project-select').addEventListener('click', () => projectInput.click());
projectInput.addEventListener('change', e => {
    if (!e.target.files.length) return;
    loadProjectFile(e.target.files[0]);
    e.target.value = '';
});

function saveProject() {
    // Normalize points to 0-1 range relative to canvas dimensions
    const cw = canvas.width, ch = canvas.height;

    const project = {
        version: 2,
        image: imgDataURL,      // original uploaded image data URI
        walls: walls.map(w => ({
            id: w.id,
            // Store normalized points (0–1)
            normPoints: w.points.map(p => ({ nx: p.x / cw, ny: p.y / ch })),
            color: w.color
        }))
    };

    const blob = new Blob([JSON.stringify(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.download = 'my_room.roompaint';
    a.href = url;
    a.click();
    URL.revokeObjectURL(url);
    toast('Project saved! Load it anytime to continue. 📂');
}

function loadProjectFile(file) {
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const project = JSON.parse(ev.target.result);
            if (!project.image || !project.walls) {
                toast('Invalid project file!'); return;
            }
            restoreProject(project);
        } catch (err) {
            toast('Could not read project file.');
            console.error(err);
        }
    };
    reader.readAsText(file);
}

function restoreProject(project) {
    imgDataURL = project.image;
    img = new Image();
    img.onload = () => {
        welcomeScreen.classList.add('hidden');
        appContainer.classList.remove('hidden');
        initCanvas();

        const cw = canvas.width, ch = canvas.height;

        walls = project.walls.map(w => {
            // Convert normalized points back to canvas coordinates
            let pts;
            if (w.normPoints) {
                // Version 2 format (normalized)
                pts = w.normPoints.map(np => ({ x: np.nx * cw, y: np.ny * ch }));
            } else if (w.points) {
                // Version 1 fallback (raw coords) — try to scale if canvas/scale info available
                if (project.canvasWidth && project.canvasHeight) {
                    const sx = cw / project.canvasWidth;
                    const sy = ch / project.canvasHeight;
                    pts = w.points.map(p => ({ x: p.x * sx, y: p.y * sy }));
                } else {
                    pts = w.points;
                }
            }

            return {
                id: w.id || Date.now() + Math.random(),
                points: pts,
                color: w.color,
                mask: createMask(pts)
            };
        });

        activeWallIndex = 0;
        enterRecolorPhase();
        toast(`Project loaded — ${walls.length} wall(s) restored! 🎨`);
    };
    img.src = imgDataURL;
}
