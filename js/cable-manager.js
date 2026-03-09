// Cable Manager: SVG patch cable rendering and interaction.
//
// CROSS-FILE DEPENDENCIES:
// - Calls patchRouter.connect() / .disconnect() (patch-router.js) using jack IDs
//   read from DOM element data-jack-id attributes.
// - Listens for 'panel-moved' and 'panel-visibility-changed' custom events dispatched
//   by panel-manager.js. If those event names change, cables stop updating.
// - initCableManager() is called by main.js, which passes the SVG overlay element
//   and PatchRouter instance. Must only be called ONCE (no re-init guard).
// - createConnection() and loadSavedCables() are called by main.js to set up default
//   or saved cables. The CABLE_COLORS array is also exposed for default cable setup.
// - saveCables()/loadSavedCables() persist to localStorage key 'sinnthoid-cables'.
//   The format is [{source: jackId, dest: jackId, color: hexString}, ...].
//   If jack IDs change, saved cables silently fail to restore.

const CABLE_COLORS = [
  { name: 'red', hex: '#e8364f' },
  { name: 'yellow', hex: '#f0c830' },
  { name: 'blue', hex: '#3a9fff' },
  { name: 'green', hex: '#3dd87a' },
  { name: 'orange', hex: '#f58a2e' },
  { name: 'purple', hex: '#b366f5' },
  { name: 'white', hex: '#e8e8f0' },
  { name: 'black', hex: '#2a2a3a' }
];

const STORAGE_KEY = 'sinnthoid-cables';

let cables = [];
let selectedCable = null;
let currentColor = CABLE_COLORS[0];
let draggingCable = null;
let svgOverlay = null;
let colorPicker = null;
let patchRouter = null;

function getJackCenter(jackEl) {
  const rect = jackEl.getBoundingClientRect();
  const svgRect = svgOverlay.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2 - svgRect.left,
    y: rect.top + rect.height / 2 - svgRect.top
  };
}

function makeCablePath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const dist = Math.sqrt(dx * dx + dy * dy);
  const droop = Math.min(dist * 0.35, 180);

  const midX = (x1 + x2) / 2;
  const midY = Math.max(y1, y2) + droop;

  const cp1x = x1 + (midX - x1) * 0.4;
  const cp1y = y1 + droop * 0.7;
  const cp2x = x2 - (x2 - midX) * 0.4;
  const cp2y = y2 + droop * 0.7;

  return `M ${x1} ${y1} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`;
}

function createSvgPath(color, id) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '4');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('class', 'cable');
  if (id) {
    path.dataset.cableId = id;
  }

  // Shadow path behind the main cable
  const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shadow.setAttribute('fill', 'none');
  shadow.setAttribute('stroke', 'rgba(0,0,0,0.3)');
  shadow.setAttribute('stroke-width', '7');
  shadow.setAttribute('stroke-linecap', 'round');
  shadow.setAttribute('class', 'cable-shadow');
  if (id) {
    shadow.dataset.cableId = id;
  }

  return { path, shadow };
}

function updateCablePath(cable) {
  // Skip cables whose jacks are in hidden/collapsed panels (offsetParent is null
  // for display:none elements). Without this check, getBoundingClientRect() returns
  // all zeros, snapping cables to the top-left corner.
  if (!cable.sourceEl.offsetParent || !cable.destEl.offsetParent) {
    cable.svgPath.style.display = 'none';
    cable.svgShadow.style.display = 'none';
    return;
  }
  cable.svgPath.style.display = '';
  cable.svgShadow.style.display = '';

  const p1 = getJackCenter(cable.sourceEl);
  const p2 = getJackCenter(cable.destEl);
  const d = makeCablePath(p1.x, p1.y, p2.x, p2.y);
  cable.svgPath.setAttribute('d', d);
  cable.svgShadow.setAttribute('d', d);
}

function updateAllCables() {
  cables.forEach(updateCablePath);
}

function selectCable(cable) {
  if (selectedCable) {
    selectedCable.svgPath.classList.remove('cable-selected');
  }
  selectedCable = cable;
  if (cable) {
    cable.svgPath.classList.add('cable-selected');
  }
}

function removeCable(cable) {
  cable.svgPath.remove();
  cable.svgShadow.remove();
  cables = cables.filter((c) => c !== cable);

  if (selectedCable === cable) {
    selectedCable = null;
  }

  // Only remove jack-connected if no other cables use that jack
  const sourceStillConnected = cables.some((c) => c.sourceEl === cable.sourceEl);
  const destStillConnected = cables.some((c) => c.destEl === cable.destEl);
  if (!sourceStillConnected) {
    cable.sourceEl.classList.remove('jack-connected');
  }
  if (!destStillConnected) {
    cable.destEl.classList.remove('jack-connected');
  }

  if (patchRouter) {
    patchRouter.disconnect(cable.sourceEl.dataset.jackId, cable.destEl.dataset.jackId);
  }

  saveCables();
}

function showColorPicker(x, y, onSelect) {
  if (colorPicker) {
    colorPicker.remove();
  }

  colorPicker = document.createElement('div');
  colorPicker.className = 'cable-color-picker';
  colorPicker.style.left = `${x}px`;
  colorPicker.style.top = `${y}px`;

  CABLE_COLORS.forEach((color) => {
    const swatch = document.createElement('button');
    swatch.className = 'color-swatch';
    swatch.style.background = color.hex;
    swatch.title = color.name;
    if (color === currentColor) {
      swatch.classList.add('active');
    }
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      currentColor = color;
      onSelect(color);
      colorPicker.remove();
      colorPicker = null;
    });
    colorPicker.appendChild(swatch);
  });

  document.body.appendChild(colorPicker);

  const dismiss = (e) => {
    if (colorPicker && !colorPicker.contains(e.target)) {
      colorPicker.remove();
      colorPicker = null;
      document.removeEventListener('pointerdown', dismiss);
    }
  };
  setTimeout(() => document.addEventListener('pointerdown', dismiss), 10);
}

function saveCables() {
  const data = cables.map((c) => ({
    source: c.sourceEl.dataset.jackId,
    dest: c.destEl.dataset.jackId,
    color: c.color.hex
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function findJackById(id) {
  return document.querySelector(`[data-jack-id="${id}"]`);
}

export function initCableManager(svg, router) {
  svgOverlay = svg;
  patchRouter = router;

  // Update cables when panels move, resize, scroll, or change visibility.
  // IMPORTANT: If you add new panel events (e.g. panel-resized), add a
  // listener here too or cables will go stale.
  window.addEventListener('panel-moved', updateAllCables);
  window.addEventListener('panel-visibility-changed', updateAllCables);
  window.addEventListener('resize', updateAllCables);
  const workspace = document.getElementById('workspace');
  if (workspace) {
    workspace.addEventListener('scroll', updateAllCables);
  }

  // Delete selected cable on key press
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCable) {
      // Don't delete if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }
      removeCable(selectedCable);
    }
  });

  // Click on cable to select, click elsewhere to deselect
  svgOverlay.addEventListener('click', (e) => {
    const cablePath = e.target.closest('.cable');
    if (cablePath && cablePath.dataset.cableId) {
      const cable = cables.find((c) => c.id === cablePath.dataset.cableId);
      if (cable) {
        selectCable(cable);
        return;
      }
    }
    selectCable(null);
  });

  // Right-click on cable for context menu
  svgOverlay.addEventListener('contextmenu', (e) => {
    const cablePath = e.target.closest('.cable');
    if (cablePath && cablePath.dataset.cableId) {
      e.preventDefault();
      const cable = cables.find((c) => c.id === cablePath.dataset.cableId);
      if (cable) {
        showColorPicker(e.clientX, e.clientY, (newColor) => {
          cable.color = newColor;
          cable.svgPath.setAttribute('stroke', newColor.hex);
          saveCables();
        });
      }
    }
  });

  // Setup jack interactions
  setupJackDrag();

  return {
    updateAllCables,
    createConnection,
    removeCableById,
    getCables: () => cables,
    loadSavedCables,
    CABLE_COLORS
  };
}

function setupJackDrag() {
  document.addEventListener('pointerdown', (e) => {
    const jack = e.target.closest('.jack');
    if (!jack) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const isOutput = jack.classList.contains('jack-output');
    const isInput = jack.classList.contains('jack-input');
    if (!isOutput && !isInput) {
      return;
    }

    // Show color picker briefly, then start drag
    const jackRect = jack.getBoundingClientRect();

    const startDrag = (color) => {
      currentColor = color;
      const startPos = getJackCenter(jack);
      const id = `cable-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const { path, shadow } = createSvgPath(color.hex, id);

      svgOverlay.appendChild(shadow);
      svgOverlay.appendChild(path);

      draggingCable = {
        id,
        startJack: jack,
        isFromOutput: isOutput,
        svgPath: path,
        svgShadow: shadow,
        startPos
      };

      const onMove = (moveEvent) => {
        const svgRect = svgOverlay.getBoundingClientRect();
        const endX = moveEvent.clientX - svgRect.left;
        const endY = moveEvent.clientY - svgRect.top;
        const d = makeCablePath(startPos.x, startPos.y, endX, endY);
        path.setAttribute('d', d);
        shadow.setAttribute('d', d);
      };

      const onUp = (upEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);

        // Find target jack under pointer
        const targetEl = document.elementFromPoint(upEvent.clientX, upEvent.clientY);
        const targetJack = targetEl?.closest('.jack');

        let valid = false;
        if (targetJack && targetJack !== jack) {
          const targetIsOutput = targetJack.classList.contains('jack-output');
          const targetIsInput = targetJack.classList.contains('jack-input');

          // Must be opposite type
          if ((isOutput && targetIsInput) || (isInput && targetIsOutput)) {
            const sourceEl = isOutput ? jack : targetJack;
            const destEl = isInput ? jack : targetJack;

            // Check no duplicate connection
            const duplicate = cables.some(
              (c) => c.sourceEl === sourceEl && c.destEl === destEl
            );

            if (!duplicate) {
              valid = true;
              createConnection(sourceEl, destEl, currentColor, id, path, shadow);
            }
          }
        }

        if (!valid) {
          path.remove();
          shadow.remove();
        }

        draggingCable = null;
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    };

    // Quick start with current color (show picker on right-click)
    startDrag(currentColor);
  });

  // Right-click jack to pick color before dragging
  document.addEventListener('contextmenu', (e) => {
    const jack = e.target.closest('.jack');
    if (jack) {
      e.preventDefault();
      showColorPicker(e.clientX, e.clientY, (color) => {
        currentColor = color;
      });
    }
  });
}

function createConnection(sourceEl, destEl, color, id, existingPath, existingShadow) {
  const cableId = id || `cable-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  let svgPath, svgShadow;
  if (existingPath && existingShadow) {
    svgPath = existingPath;
    svgShadow = existingShadow;
  } else {
    const created = createSvgPath(color.hex, cableId);
    svgPath = created.path;
    svgShadow = created.shadow;
    svgOverlay.appendChild(svgShadow);
    svgOverlay.appendChild(svgPath);
  }

  svgPath.style.pointerEvents = 'stroke';
  svgShadow.style.pointerEvents = 'none';

  const cable = {
    id: cableId,
    sourceEl,
    destEl,
    color,
    svgPath,
    svgShadow
  };

  cables.push(cable);
  updateCablePath(cable);

  sourceEl.classList.add('jack-connected');
  destEl.classList.add('jack-connected');

  if (patchRouter) {
    patchRouter.connect(sourceEl.dataset.jackId, destEl.dataset.jackId);
  }

  saveCables();
  return cable;
}

function removeCableById(id) {
  const cable = cables.find((c) => c.id === id);
  if (cable) {
    removeCable(cable);
  }
}

function loadSavedCables() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return false;
    }
    const data = JSON.parse(stored);
    data.forEach((entry) => {
      const sourceEl = findJackById(entry.source);
      const destEl = findJackById(entry.dest);
      if (sourceEl && destEl) {
        const color = CABLE_COLORS.find((c) => c.hex === entry.color) || CABLE_COLORS[0];
        createConnection(sourceEl, destEl, color);
      }
    });
    return true;
  } catch (e) {
    return false;
  }
}
