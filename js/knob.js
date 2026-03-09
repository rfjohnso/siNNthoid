export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function quantize(value, step) {
  if (!step) {
    return value;
  }
  return Math.round(value / step) * step;
}

export function formatValue(value, cfg) {
  const absStep = Math.abs(cfg.step);
  let digits = 0;
  if (absStep > 0 && absStep < 1) {
    digits = String(absStep).split('.')[1]?.length ?? 0;
  }
  const rounded = Number(value.toFixed(Math.min(digits, 3)));
  return `${rounded}${cfg.unit || ''}`;
}

export function makeKnob(container, cfg, onChange, knobTemplate) {
  const tmpl = knobTemplate || document.getElementById('knobTemplate');
  const node = tmpl.content.firstElementChild.cloneNode(true);
  const knobBtn = node.querySelector('.knob');
  const indicator = node.querySelector('.knob-indicator');
  const label = node.querySelector('.knob-label');
  const valueText = node.querySelector('.knob-value');

  label.textContent = cfg.label;

  let value = cfg.value;

  const updateVisual = () => {
    const norm = (value - cfg.min) / (cfg.max - cfg.min);
    const angle = -130 + norm * 260;
    indicator.style.transform = `translateX(-50%) rotate(${angle}deg)`;
    valueText.textContent = formatValue(value, cfg);
  };

  const setValue = (next, emit = true) => {
    const clamped = clamp(quantize(next, cfg.step), cfg.min, cfg.max);
    value = Number(clamped.toFixed(5));
    updateVisual();
    if (emit) {
      onChange(value);
    }
  };

  knobBtn.addEventListener('wheel', (event) => {
    event.preventDefault();
    const direction = event.deltaY > 0 ? -1 : 1;
    const coarse = cfg.step * (event.shiftKey ? 6 : 1);
    setValue(value + coarse * direction);
  });

  knobBtn.addEventListener('dblclick', () => {
    setValue(cfg.value);
  });

  knobBtn.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const startY = event.clientY;
    const startValue = value;
    const sensitivity = (cfg.max - cfg.min) / 190;

    const onMove = (moveEvent) => {
      const delta = startY - moveEvent.clientY;
      setValue(startValue + delta * sensitivity);
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  updateVisual();
  container.appendChild(node);
  return { setValue };
}
