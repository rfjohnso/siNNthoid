const STORAGE_KEY = 'sinnthoid-panel-layout';

let zCounter = 100;

const DEFAULT_LAYOUTS = {
  'panel-header-bar': { x: 0, y: 0, w: -1, h: 68, pinned: true },
  'panel-global':     { x: 14, y: 82, w: 340, h: 420 },
  'panel-vco':        { x: 366, y: 82, w: 580, h: 420 },
  'panel-fx':         { x: 958, y: 82, w: 340, h: 420 },
  'panel-808':        { x: 14, y: 514, w: 640, h: 520 },
  'panel-707':        { x: 666, y: 514, w: 632, h: 520 },
  'panel-phase':      { x: 14, y: 1046, w: 640, h: 280 },
  'panel-record':     { x: 666, y: 1046, w: 310, h: 280 },
  'panel-keyboard':   { x: 988, y: 1046, w: 310, h: 280 }
};

const MIN_SIZES = {
  'panel-global': { w: 280, h: 300 },
  'panel-vco': { w: 400, h: 300 },
  'panel-fx': { w: 280, h: 300 },
  'panel-808': { w: 500, h: 380 },
  'panel-707': { w: 480, h: 380 },
  'panel-phase': { w: 400, h: 200 },
  'panel-record': { w: 240, h: 180 },
  'panel-keyboard': { w: 280, h: 180 }
};

function loadLayout() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function saveLayout(panels) {
  const layout = {};
  panels.forEach((panel) => {
    const id = panel.dataset.panelId;
    if (id && !panel.dataset.pinned) {
      layout[id] = {
        x: parseInt(panel.style.left) || 0,
        y: parseInt(panel.style.top) || 0,
        w: parseInt(panel.style.width) || 300,
        h: parseInt(panel.style.height) || 300,
        collapsed: panel.classList.contains('collapsed'),
        hidden: panel.classList.contains('panel-hidden')
      };
    }
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}

function bringToFront(panel) {
  zCounter += 1;
  panel.style.zIndex = zCounter;
}

function addResizeHandles(panel, panels) {
  const directions = ['n', 'e', 's', 'w', 'ne', 'nw', 'se', 'sw'];

  directions.forEach((dir) => {
    const handle = document.createElement('div');
    handle.className = `resize-handle resize-${dir}`;
    handle.dataset.direction = dir;
    panel.appendChild(handle);

    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      bringToFront(panel);

      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = parseInt(panel.style.left) || 0;
      const startTop = parseInt(panel.style.top) || 0;
      const startWidth = parseInt(panel.style.width) || 300;
      const startHeight = parseInt(panel.style.height) || 300;
      const minSize = MIN_SIZES[panel.dataset.panelId] || { w: 200, h: 150 };

      const onMove = (moveEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        let newLeft = startLeft;
        let newTop = startTop;
        let newWidth = startWidth;
        let newHeight = startHeight;

        if (dir.includes('e')) {
          newWidth = Math.max(minSize.w, startWidth + dx);
        }
        if (dir.includes('w')) {
          const proposedWidth = startWidth - dx;
          if (proposedWidth >= minSize.w) {
            newWidth = proposedWidth;
            newLeft = startLeft + dx;
          }
        }
        if (dir.includes('s')) {
          newHeight = Math.max(minSize.h, startHeight + dy);
        }
        if (dir.includes('n')) {
          const proposedHeight = startHeight - dy;
          if (proposedHeight >= minSize.h) {
            newHeight = proposedHeight;
            newTop = startTop + dy;
          }
        }

        panel.style.left = `${newLeft}px`;
        panel.style.top = `${newTop}px`;
        panel.style.width = `${newWidth}px`;
        panel.style.height = `${newHeight}px`;

        window.dispatchEvent(new CustomEvent('panel-moved'));
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        saveLayout(panels);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });
}

function makeHeader(panel, title, panels) {
  const header = document.createElement('div');
  header.className = 'panel-header';

  const titleEl = document.createElement('span');
  titleEl.className = 'panel-title';
  titleEl.textContent = title;
  header.appendChild(titleEl);

  const controls = document.createElement('div');
  controls.className = 'panel-controls';

  const collapseBtn = document.createElement('button');
  collapseBtn.className = 'panel-btn panel-collapse-btn';
  collapseBtn.textContent = '\u2013';
  collapseBtn.title = 'Collapse';
  collapseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('collapsed');
    collapseBtn.textContent = panel.classList.contains('collapsed') ? '+' : '\u2013';
    saveLayout(panels);
    window.dispatchEvent(new CustomEvent('panel-moved'));
  });
  controls.appendChild(collapseBtn);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'panel-btn panel-close-btn';
  closeBtn.textContent = '\u00d7';
  closeBtn.title = 'Hide panel';
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.add('panel-hidden');
    saveLayout(panels);
    window.dispatchEvent(new CustomEvent('panel-visibility-changed'));
  });
  controls.appendChild(closeBtn);

  header.appendChild(controls);

  // Drag logic
  header.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.panel-btn')) {
      return;
    }
    event.preventDefault();
    bringToFront(panel);

    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = parseInt(panel.style.left) || 0;
    const startTop = parseInt(panel.style.top) || 0;

    panel.classList.add('dragging');

    const onMove = (moveEvent) => {
      panel.style.left = `${startLeft + moveEvent.clientX - startX}px`;
      panel.style.top = `${startTop + moveEvent.clientY - startY}px`;
      window.dispatchEvent(new CustomEvent('panel-moved'));
    };

    const onUp = () => {
      panel.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      saveLayout(panels);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  return header;
}

export function initPanelManager() {
  const workspace = document.getElementById('workspace');
  if (!workspace) {
    return [];
  }

  const panels = Array.from(workspace.querySelectorAll('.module-panel'));
  const savedLayout = loadLayout();

  panels.forEach((panel) => {
    const id = panel.dataset.panelId;
    if (!id) {
      return;
    }

    // Get title from existing h2 or data attribute
    const h2 = panel.querySelector('h2');
    const title = panel.dataset.panelTitle || (h2 ? h2.textContent : 'Module');
    if (h2) {
      h2.remove();
    }

    // Insert header at top
    const header = makeHeader(panel, title, panels);
    panel.prepend(header);

    // Apply layout
    const layout = savedLayout?.[id] || DEFAULT_LAYOUTS[id] || { x: 50, y: 50, w: 340, h: 300 };

    if (layout.w === -1) {
      // full width pinned panel (header bar)
      panel.dataset.pinned = 'true';
      panel.style.position = 'relative';
      panel.style.width = '100%';
      panel.style.height = `${layout.h}px`;
    } else {
      panel.style.position = 'absolute';
      panel.style.left = `${layout.x}px`;
      panel.style.top = `${layout.y}px`;
      panel.style.width = `${layout.w}px`;
      panel.style.height = `${layout.h}px`;

      if (layout.collapsed) {
        panel.classList.add('collapsed');
        // Update collapse button text to match restored state
        const collapseBtn = panel.querySelector('.panel-collapse-btn');
        if (collapseBtn) {
          collapseBtn.textContent = '+';
        }
      }
      if (layout.hidden) {
        panel.classList.add('panel-hidden');
      }

      addResizeHandles(panel, panels);
    }

    // Click to bring to front
    panel.addEventListener('pointerdown', () => {
      bringToFront(panel);
    });
  });

  return panels;
}

export function resetLayout() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

export function showPanel(panelId) {
  const panel = document.querySelector(`[data-panel-id="${panelId}"]`);
  if (panel) {
    panel.classList.remove('panel-hidden');
    bringToFront(panel);
    const workspace = document.getElementById('workspace');
    if (workspace) {
      const panels = Array.from(workspace.querySelectorAll('.module-panel'));
      saveLayout(panels);
    }
    window.dispatchEvent(new CustomEvent('panel-visibility-changed'));
  }
}

export function getHiddenPanels() {
  const workspace = document.getElementById('workspace');
  if (!workspace) {
    return [];
  }
  return Array.from(workspace.querySelectorAll('.module-panel.panel-hidden')).map((p) => ({
    id: p.dataset.panelId,
    title: p.dataset.panelTitle || p.querySelector('.panel-title')?.textContent || 'Module'
  }));
}
