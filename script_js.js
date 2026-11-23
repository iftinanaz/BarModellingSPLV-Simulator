const GRID_SIZE = 40; // 1 unit = 40px clean grid
const canvas = document.getElementById('canvas');
const canvasPlaceholder = document.getElementById('canvas-placeholder');
const barToolbar = document.getElementById('bar-toolbar');
const selectedInfo = document.getElementById('selected-info');
const canvasEquation = document.getElementById('canvas-equation');
const balancePill = document.getElementById('balance-pill');
const balanceIcon = document.getElementById('balance-icon');
const balanceStatus = document.getElementById('balance-status');
const editModal = document.getElementById('edit-modal');
const guideLeft = document.getElementById('guide-left');
const guideRight = document.getElementById('guide-right');

let bars = []; 
let selectedBar = null;
let isDragging = false;
let isResizing = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let resizeStartX = 0;
let resizeStartWidth = 0;

let showLabels = true;
let showGuides = true;

const COLOR_MAP = {
    1: '#f0821e',
    2: '#f35b2b',
    3: '#e83441',
    4: '#d91b70',
    5: '#8e38ad',
    6: '#5055d6',
    7: '#0083f6',
    8: '#009fb7',
    9: '#28a745',
    10: '#b5b800',
    'x': '#3f4756',
    'y': '#0d9488',
    'x²': '#3b82f6'
};

function snapToGrid(val) {
    return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

function calculateVariableValue(terms, targetLength) {
    let numSum = 0;
    let varCount = 0;

    terms.forEach(term => {
        const varMatch = term.match(/^(\d*)([a-zA-Z]|\w+\²?)$/);
        const numMatch = term.match(/^(\d+(\.\d+)?)$/);

        if (varMatch) {
            const count = varMatch[1] ? parseInt(varMatch[1]) : 1;
            varCount += count;
        } else if (numMatch) {
            numSum += parseFloat(term);
        }
    });

    if (varCount > 0 && targetLength !== null) {
        const remainingUnits = targetLength - numSum;
        return Math.max(0.5, remainingUnits / varCount);
    }
    return 2;
}

// Clean non-overlapping position finder that aligns bars end-to-end
function findNonOverlappingPosition(targetX, targetY, widthUnits, excludeBarId = null) {
    let x = snapToGrid(targetX);
    let y = snapToGrid(targetY);
    let widthPx = widthUnits * GRID_SIZE;

    function overlaps(checkX, checkY) {
        return bars.some(b => {
            if (b.id === excludeBarId) return false;
            const bWidthPx = b.widthUnits * GRID_SIZE;
            const sameY = Math.abs(b.y - checkY) < (GRID_SIZE / 2);
            const overlapX = !(checkX + widthPx <= b.x || checkX >= b.x + bWidthPx);
            return sameY && overlapX;
        });
    }

    let attempts = 0;
    while (overlaps(x, y) && attempts < 30) {
        const colBar = bars.find(b => b.id !== excludeBarId && Math.abs(b.y - y) < (GRID_SIZE / 2) && !(x + widthPx <= b.x || x >= b.x + (b.widthUnits * GRID_SIZE)));
        if (colBar) {
            x = snapToGrid(colBar.x + (colBar.widthUnits * GRID_SIZE));
        } else {
            x += GRID_SIZE;
        }

        if (x > canvas.clientWidth - widthPx - GRID_SIZE) {
            x = GRID_SIZE;
            y += GRID_SIZE;
        }
        attempts++;
    }

    return { x, y };
}

// Spawn a single bar
function spawnBar(val, customColor = null, customUnits = null, x = null, y = null) {
    canvasPlaceholder.style.display = 'none';

    const barId = 'bar-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    
    let unitLength = 1;
    if (customUnits !== null && !isNaN(customUnits)) {
        unitLength = parseFloat(customUnits);
    } else if (typeof val === 'number') {
        unitLength = Math.max(0.5, Math.abs(val));
    } else if (!isNaN(parseFloat(val))) {
        unitLength = Math.max(0.5, Math.abs(parseFloat(val)));
    } else if (val === 'x' || val === 'y') {
        unitLength = 2;
    } else if (val === 'x²') {
        unitLength = 3;
    }

    const width = unitLength * GRID_SIZE;
    const height = GRID_SIZE;

    const canvasRect = canvas.getBoundingClientRect();
    let rawX = x !== null ? x : (canvasRect.width / 2) - (width / 2);
    let rawY = y !== null ? y : (canvasRect.height / 2) - 20;

    const pos = findNonOverlappingPosition(rawX, rawY, unitLength);
    const posX = pos.x;
    const posY = pos.y;

    const color = customColor || COLOR_MAP[val] || '#f0821e';

    const barObj = {
        id: barId,
        val: val,
        color: color,
        widthUnits: unitLength,
        x: posX,
        y: posY,
        element: null
    };

    const el = document.createElement('div');
    el.id = barId;
    el.className = `absolute flex items-center justify-center font-extrabold text-white cursor-move number-bar select-none`;
    el.style.width = `${width - 3}px`;
    el.style.height = `${height - 3}px`;
    el.style.transform = `translate(${posX}px, ${posY}px)`;
    el.style.backgroundColor = color;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'label-text text-lg font-black select-none text-white tracking-wider pointer-events-none truncate max-w-full px-1';
    labelSpan.innerText = showLabels ? barObj.val : '';
    el.appendChild(labelSpan);

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    resizeHandle.title = 'Tarik untuk memperpanjang/memperpendek';
    resizeHandle.addEventListener('mousedown', (e) => startResize(e, barObj));
    resizeHandle.addEventListener('touchstart', (e) => startResize(e, barObj), { passive: false });
    el.appendChild(resizeHandle);

    el.addEventListener('mousedown', (e) => {
        if (e.target === resizeHandle) return;
        startDrag(e, barObj);
    });
    el.addEventListener('touchstart', (e) => {
        if (e.target === resizeHandle) return;
        startDrag(e, barObj);
    }, { passive: false });

    el.addEventListener('dblclick', () => {
        selectBar(barObj);
        editSelectedBarPrompt();
    });

    canvas.appendChild(el);
    barObj.element = el;
    bars.push(barObj);

    selectBar(barObj);
    updateEquation();
}

function parseSideExpression(exprStr, targetWidthUnits = null) {
    const rawParts = exprStr.split('+').map(p => p.trim()).filter(p => p.length > 0);
    if (rawParts.length === 0) return null;

    const varUnitLength = calculateVariableValue(rawParts, targetWidthUnits);

    return rawParts.map(part => {
        const numericVal = parseFloat(part);
        let color = COLOR_MAP[part] || document.getElementById('custom-color-picker').value || '#f0821e';
        let units = 1;

        if (!isNaN(numericVal)) {
            units = Math.max(0.5, Math.abs(numericVal));
        } else if (part.includes('x') || part.includes('y')) {
            units = varUnitLength;
            color = COLOR_MAP[part] || '#3f4756';
        }

        return {
            val: part,
            units: units,
            color: color
        };
    });
}

// Visualizing Custom Inputs and Equations with Perfect Visual Alignment
function spawnCustomBarFromInput() {
    const rawInput = document.getElementById('custom-val-input').value.trim();
    const inputColor = document.getElementById('custom-color-picker').value;
    if (!rawInput) return;

    const canvasRect = canvas.getBoundingClientRect();

    if (rawInput.includes('=')) {
        // Equation Mode e.g. "x + 5 = 9"
        const parts = rawInput.split('=').map(p => p.trim());
        const leftStr = parts[0];
        const rightStr = parts[1];

        const rightNum = parseFloat(rightStr);
        const targetUnits = !isNaN(rightNum) ? rightNum : null;

        const leftSegments = parseSideExpression(leftStr, targetUnits);
        const rightSegments = parseSideExpression(rightStr, null);

        const totalLeftUnits = leftSegments ? leftSegments.reduce((sum, seg) => sum + seg.units, 0) : 0;
        const totalRightUnits = rightSegments ? rightSegments.reduce((sum, seg) => sum + seg.units, 0) : 0;

        const maxUnits = Math.max(totalLeftUnits, totalRightUnits);
        const startX = snapToGrid((canvasRect.width / 2) - ((maxUnits * GRID_SIZE) / 2));
        const startY = snapToGrid((canvasRect.height / 2) - 50);

        clearCanvas();

        // Row 1: Right Side (placed on top row)
        let currX = startX;
        rightSegments.forEach(seg => {
            spawnBar(seg.val, seg.color, seg.units, currX, startY);
            currX += seg.units * GRID_SIZE;
        });

        // Row 2: Left Side (placed directly on row below, aligned flush left)
        currX = startX;
        leftSegments.forEach(seg => {
            spawnBar(seg.val, seg.color, seg.units, currX, startY + GRID_SIZE + 10);
            currX += seg.units * GRID_SIZE;
        });

        selectBar(null);
    } else {
        // Standalone input
        const parsedSegments = parseSideExpression(rawInput);
        const numericVal = parseFloat(rawInput);

        if (parsedSegments && parsedSegments.length > 1) {
            const totalUnits = parsedSegments.reduce((sum, seg) => sum + seg.units, 0);
            let currentX = snapToGrid((canvasRect.width / 2) - ((totalUnits * GRID_SIZE) / 2));
            const currentY = snapToGrid((canvasRect.height / 2) - 20);

            parsedSegments.forEach(seg => {
                spawnBar(seg.val, seg.color, seg.units, currentX, currentY);
                currentX += seg.units * GRID_SIZE;
            });
        } else {
            const units = !isNaN(numericVal) ? Math.max(0.5, Math.abs(numericVal)) : 2;
            spawnBar(rawInput, inputColor, units);
        }
    }
}

window.onload = function() {
    spawnCustomBarFromInput();
};

function clearCanvas() {
    bars.forEach(b => {
        if (b.element && b.element.parentNode) {
            b.element.parentNode.removeChild(b.element);
        }
    });
    bars = [];
    selectedBar = null;
    barToolbar.classList.add('hidden');
    guideLeft.classList.add('hidden');
    guideRight.classList.add('hidden');
    canvasPlaceholder.style.display = 'flex';
    updateEquation();
}

function selectBar(barObj) {
    bars.forEach(b => {
        b.element.classList.remove('ring-4', 'ring-amber-400', 'z-20', 'selected');
    });

    selectedBar = barObj;
    if (barObj) {
        barObj.element.classList.add('ring-4', 'ring-amber-400', 'z-20', 'selected');
        selectedInfo.innerText = `${barObj.val}`;
        document.getElementById('bar-color-change').value = barObj.color;
        barToolbar.classList.remove('hidden');
        positionToolbar();
    } else {
        barToolbar.classList.add('hidden');
    }
}

function positionToolbar() {
    if (!selectedBar || !selectedBar.element) return;
    const barRect = selectedBar.element.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    let top = barRect.top - canvasRect.top - 50;
    let left = barRect.left - canvasRect.left + (barRect.width / 2);

    if (top < 10) top = barRect.bottom - canvasRect.top + 10;

    barToolbar.style.top = `${top}px`;
    barToolbar.style.left = `${left}px`;
}

// Calculate equivalence balance and render guide lines
function updateEquation() {
    if (bars.length === 0) {
        canvasEquation.innerText = "0 = 0";
        balanceStatus.innerText = "Kosong";
        balanceStatus.className = "text-xs font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded-md";
        balanceIcon.className = "w-6 h-6 rounded-full bg-slate-400 text-white flex items-center justify-center text-xs";
        balancePill.classList.remove('balanced-glow');
        guideLeft.classList.add('hidden');
        guideRight.classList.add('hidden');
        return;
    }

    const rows = {};
    bars.forEach(b => {
        const roundedY = snapToGrid(b.y);
        if (!rows[roundedY]) rows[roundedY] = [];
        rows[roundedY].push(b);
    });

    const sortedY = Object.keys(rows).sort((a, b) => parseFloat(a) - parseFloat(b));

    if (sortedY.length === 1) {
        const rowBars = rows[sortedY[0]].sort((a, b) => a.x - b.x);
        const expr = rowBars.map(b => b.val).join(" + ");
        const totalUnits = rowBars.reduce((sum, b) => sum + b.widthUnits, 0);
        canvasEquation.innerText = `${expr} = ${totalUnits}`;
        
        balanceStatus.innerText = `Panjang: ${totalUnits} unit`;
        balanceStatus.className = "text-xs font-bold text-indigo-700 bg-indigo-100 px-2.5 py-0.5 rounded-md";
        balanceIcon.className = "w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs";
        balancePill.classList.remove('balanced-glow');

        guideLeft.classList.add('hidden');
        guideRight.classList.add('hidden');
    } else if (sortedY.length >= 2) {
        const topRow = rows[sortedY[0]].sort((a, b) => a.x - b.x);
        const bottomRow = rows[sortedY[1]].sort((a, b) => a.x - b.x);

        const topExpr = topRow.map(b => b.val).join(" + ");
        const bottomExpr = bottomRow.map(b => b.val).join(" + ");

        const topLength = topRow.reduce((sum, b) => sum + b.widthUnits, 0);
        const bottomLength = bottomRow.reduce((sum, b) => sum + b.widthUnits, 0);

        canvasEquation.innerText = `${topExpr} = ${bottomExpr}`;

        // Calculate horizontal boundaries for vertical alignment guidelines
        const minX = Math.min(topRow[0].x, bottomRow[0].x);
        const maxTopX = topRow[topRow.length - 1].x + (topRow[topRow.length - 1].widthUnits * GRID_SIZE);
        const maxBottomX = bottomRow[bottomRow.length - 1].x + (bottomRow[bottomRow.length - 1].widthUnits * GRID_SIZE);
        const maxX = Math.max(maxTopX, maxBottomX);

        const topY = parseFloat(sortedY[0]);
        const bottomY = parseFloat(sortedY[1]) + GRID_SIZE;

        if (showGuides) {
            guideLeft.style.left = `${minX}px`;
            guideLeft.style.top = `${topY - 10}px`;
            guideLeft.style.height = `${bottomY - topY + 20}px`;
            guideLeft.classList.remove('hidden');

            guideRight.style.left = `${maxX}px`;
            guideRight.style.top = `${topY - 10}px`;
            guideRight.style.height = `${bottomY - topY + 20}px`;
            guideRight.classList.remove('hidden');
        }

        // Balance state verification
        const isBalanced = Math.abs(topLength - bottomLength) < 0.05 && Math.abs(topRow[0].x - bottomRow[0].x) < 5;

        if (isBalanced) {
            balanceStatus.innerText = "SEJAJAR & SETARA ✓";
            balanceStatus.className = "text-xs font-black text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-md";
            balanceIcon.className = "w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-xs";
            balancePill.classList.add('balanced-glow');
        } else {
            balanceStatus.innerText = `Beda: ${Math.abs(topLength - bottomLength).toFixed(1)} unit`;
            balanceStatus.className = "text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-md";
            balanceIcon.className = "w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs";
            balancePill.classList.remove('balanced-glow');
        }
    }
}

function toggleLabels() {
    showLabels = !showLabels;
    const badge = document.getElementById('badge-labels');
    if (showLabels) {
        badge.innerText = "Aktif";
        badge.className = "bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded font-bold";
    } else {
        badge.innerText = "Sembunyi";
        badge.className = "bg-slate-600 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-bold";
    }

    bars.forEach(b => {
        const labelText = b.element.querySelector('.label-text');
        if (labelText) labelText.innerText = showLabels ? b.val : '';
    });
}

function toggleGuides() {
    showGuides = !showGuides;
    const badge = document.getElementById('badge-guides');
    if (showGuides) {
        badge.innerText = "Aktif";
        badge.className = "bg-indigo-500/20 text-indigo-400 text-[10px] px-1.5 py-0.5 rounded font-bold";
    } else {
        badge.innerText = "Sembunyi";
        badge.className = "bg-slate-600 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-bold";
        guideLeft.classList.add('hidden');
        guideRight.classList.add('hidden');
    }
    updateEquation();
}

function deleteSelectedBar() {
    if (!selectedBar) return;
    const idx = bars.findIndex(b => b.id === selectedBar.id);
    if (idx !== -1) {
        if (selectedBar.element && selectedBar.element.parentNode) {
            selectedBar.element.parentNode.removeChild(selectedBar.element);
        }
        bars.splice(idx, 1);
    }
    selectBar(null);
    if (bars.length === 0) {
        canvasPlaceholder.style.display = 'flex';
    }
    updateEquation();
}

function duplicateSelectedBar() {
    if (!selectedBar) return;
    spawnBar(selectedBar.val, selectedBar.color, selectedBar.widthUnits, selectedBar.x + 20, selectedBar.y + 20);
}

function splitSelectedBar() {
    if (!selectedBar) return;
    const count = Math.round(selectedBar.widthUnits);
    if (count <= 1) return;

    const startX = selectedBar.x;
    const startY = selectedBar.y;
    const color = selectedBar.color;

    deleteSelectedBar();

    for (let i = 0; i < count; i++) {
        spawnBar(1, color, 1, startX + (i * GRID_SIZE), startY);
    }
}

function changeSelectedBarColor(newColor) {
    if (!selectedBar) return;
    selectedBar.color = newColor;
    selectedBar.element.style.backgroundColor = newColor;
}

function editSelectedBarPrompt() {
    if (!selectedBar) return;
    document.getElementById('modal-label-input').value = selectedBar.val;
    document.getElementById('modal-units-input').value = selectedBar.widthUnits;
    editModal.classList.remove('hidden');
}

function closeEditModal() {
    editModal.classList.add('hidden');
}

function applyEditModal() {
    if (!selectedBar) return;
    const newLabel = document.getElementById('modal-label-input').value.trim();
    const newUnits = parseFloat(document.getElementById('modal-units-input').value) || 1;

    selectedBar.val = newLabel;
    selectedBar.widthUnits = newUnits;

    const width = newUnits * GRID_SIZE;
    selectedBar.element.style.width = `${width - 3}px`;

    const labelSpan = selectedBar.element.querySelector('.label-text');
    if (labelSpan) labelSpan.innerText = showLabels ? newLabel : '';

    selectedInfo.innerText = `${newLabel}`;
    closeEditModal();
    positionToolbar();
    updateEquation();
}

// Mouse & Touch Drag Handlers
function startDrag(e, barObj) {
    e.preventDefault();
    selectBar(barObj);
    isDragging = true;
    barObj.element.classList.add('is-dragging');

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    dragOffsetX = clientX - barObj.x;
    dragOffsetY = clientY - barObj.y;

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchend', stopDrag);
}

function onDrag(e) {
    if (!isDragging || !selectedBar) return;
    e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const newX = clientX - dragOffsetX;
    const newY = clientY - dragOffsetY;

    selectedBar.x = newX;
    selectedBar.y = newY;

    selectedBar.element.style.transform = `translate(${newX}px, ${newY}px)`;
    positionToolbar();
    updateEquation();
}

function stopDrag() {
    if (!isDragging || !selectedBar) return;
    isDragging = false;
    selectedBar.element.classList.remove('is-dragging');

    const finalPos = findNonOverlappingPosition(selectedBar.x, selectedBar.y, selectedBar.widthUnits, selectedBar.id);
    selectedBar.x = finalPos.x;
    selectedBar.y = finalPos.y;

    selectedBar.element.style.transform = `translate(${selectedBar.x}px, ${selectedBar.y}px)`;
    positionToolbar();
    updateEquation();

    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('touchmove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchend', stopDrag);
}

// Resize Handlers
function startResize(e, barObj) {
    e.stopPropagation();
    e.preventDefault();
    selectBar(barObj);
    isResizing = true;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    resizeStartX = clientX;
    resizeStartWidth = barObj.widthUnits * GRID_SIZE;

    document.addEventListener('mousemove', onResize);
    document.addEventListener('touchmove', onResize, { passive: false });
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchend', stopResize);
}

function onResize(e) {
    if (!isResizing || !selectedBar) return;
    e.preventDefault();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const deltaX = clientX - resizeStartX;
    const newWidth = Math.max(GRID_SIZE / 2, resizeStartWidth + deltaX);

    selectedBar.element.style.width = `${newWidth - 3}px`;
    selectedBar.widthUnits = newWidth / GRID_SIZE;
    positionToolbar();
    updateEquation();
}

function stopResize() {
    if (!isResizing || !selectedBar) return;
    isResizing = false;

    const snappedUnits = Math.max(0.5, Math.round((selectedBar.widthUnits * GRID_SIZE) / (GRID_SIZE / 2)) * 0.5);
    selectedBar.widthUnits = snappedUnits;
    const finalWidth = snappedUnits * GRID_SIZE;

    selectedBar.element.style.width = `${finalWidth - 3}px`;
    positionToolbar();
    updateEquation();

    document.removeEventListener('mousemove', onResize);
    document.removeEventListener('touchmove', onResize);
    document.removeEventListener('mouseup', stopResize);
    document.removeEventListener('touchend', stopResize);
}