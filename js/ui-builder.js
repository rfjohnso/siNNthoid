import { makeKnob } from './knob.js';
import { state, GLOBAL_KNOBS, FX_KNOBS } from './state.js';

export function initKnobs(globalKnobsWrap, fxKnobsWrap, synth) {
  for (const cfg of GLOBAL_KNOBS) {
    state.knobs.global[cfg.id] = cfg.value;
    makeKnob(globalKnobsWrap, cfg, (value) => {
      state.knobs.global[cfg.id] = value;
      synth.updateAllParams();
    });
  }

  for (const cfg of FX_KNOBS) {
    state.knobs.fx[cfg.id] = cfg.value;
    makeKnob(fxKnobsWrap, cfg, (value) => {
      state.knobs.fx[cfg.id] = value;
      synth.updateAllParams();
    });
  }
}

export function buildVcoStrip(vco, synth) {
  const card = document.createElement('article');
  card.className = 'vco-strip';

  const heading = document.createElement('h3');
  heading.textContent = `VCO ${vco.idx + 1}`;
  card.appendChild(heading);

  const miniRow = document.createElement('div');
  miniRow.className = 'mini-row';

  const waveformLabel = document.createElement('label');
  waveformLabel.textContent = 'Wave';
  miniRow.appendChild(waveformLabel);

  const waveformSelect = document.createElement('select');
  ['sine', 'triangle', 'sawtooth', 'square'].forEach((shape) => {
    const option = document.createElement('option');
    option.value = shape;
    option.textContent = shape;
    if (shape === vco.waveform) {
      option.selected = true;
    }
    waveformSelect.appendChild(option);
  });

  waveformSelect.addEventListener('change', () => {
    vco.waveform = waveformSelect.value;
  });

  miniRow.appendChild(waveformSelect);
  card.appendChild(miniRow);

  const stripKnobs = document.createElement('div');
  stripKnobs.className = 'knob-grid';
  card.appendChild(stripKnobs);

  const controls = [
    { id: 'level', label: 'Level', min: 0, max: 1, step: 0.01, value: vco.level, unit: '' },
    { id: 'octave', label: 'Octave', min: -2, max: 2, step: 1, value: vco.octave, unit: '' },
    { id: 'detune', label: 'Detune', min: -50, max: 50, step: 1, value: vco.detune, unit: 'ct' },
    { id: 'pan', label: 'Pan', min: -1, max: 1, step: 0.01, value: vco.pan, unit: '' },
    { id: 'phaseMs', label: 'Phase', min: -120, max: 120, step: 1, value: vco.phaseMs, unit: 'ms' },
    { id: 'delayMs', label: 'Delay', min: 0, max: 550, step: 1, value: vco.delayMs, unit: 'ms' },
    { id: 'driftMs', label: 'Drift', min: -2, max: 2, step: 0.01, value: vco.driftMs, unit: 'ms' }
  ];

  controls.forEach((cfg) => {
    makeKnob(stripKnobs, cfg, (value) => {
      vco[cfg.id] = value;
      synth.updateAllParams();
    });
  });

  return card;
}

export function initVcoBank(vcoBank, synth) {
  state.vcos.forEach((vco) => {
    vcoBank.appendChild(buildVcoStrip(vco, synth));
  });
}

export function initPhaseGrid(phaseGrid) {
  for (let row = 0; row < 4; row += 1) {
    const rowCells = [];
    for (let col = 0; col < 16; col += 1) {
      const cell = document.createElement('div');
      cell.className = 'phase-cell';
      phaseGrid.appendChild(cell);
      rowCells.push(cell);
    }
    state.phaseCells.push(rowCells);
  }
}

export function drawPhaseGrid(synth) {
  state.phaseCells.forEach((rowCells, vcoIdx) => {
    let active = -1;
    if (synth.running && synth.vcoSequencers[vcoIdx]) {
      active = synth.vcoSequencers[vcoIdx].marker;
    }

    rowCells.forEach((cell, idx) => {
      if (idx === active) {
        cell.classList.add('active');
      } else {
        cell.classList.remove('active');
      }
    });
  });
}

export function initScope(scopeCanvas, synth) {
  const ctx = scopeCanvas.getContext('2d');

  const draw = () => {
    const { width, height } = scopeCanvas;
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = '#091227';
    ctx.fillRect(0, 0, width, height);

    if (state.audioReady && synth.analyser) {
      const data = new Uint8Array(synth.analyser.fftSize);
      synth.analyser.getByteTimeDomainData(data);

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3ce7ff';
      ctx.beginPath();

      const slice = width / data.length;
      let x = 0;
      for (let i = 0; i < data.length; i += 1) {
        const y = (data[i] / 128) * (height / 2);
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += slice;
      }
      ctx.stroke();
    }

    drawPhaseGrid(synth);
    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
}

export function buildKeyboard(keyboardWrap, synth) {
  const notes = [];
  for (let midi = 48; midi <= 72; midi += 1) {
    notes.push(midi);
  }

  const blackSet = new Set([1, 3, 6, 8, 10]);

  notes.forEach((midi) => {
    const semitone = midi % 12;
    const key = document.createElement('button');
    key.className = `key${blackSet.has(semitone) ? ' black' : ''}`;
    key.type = 'button';
    key.dataset.midi = String(midi);

    const noteName = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][semitone];
    key.textContent = `${noteName}${Math.floor(midi / 12) - 1}`;

    const press = () => {
      key.classList.add('active');
      synth.noteOn(midi,
        document.getElementById('rootNote')?.value,
        document.getElementById('scaleType')?.value);
    };

    const release = () => {
      key.classList.remove('active');
      synth.noteOff(midi);
    };

    key.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      key.setPointerCapture(event.pointerId);
      state.keyboardPointers.add(event.pointerId);
      press();
    });

    key.addEventListener('pointerup', (event) => {
      state.keyboardPointers.delete(event.pointerId);
      release();
    });

    key.addEventListener('pointerleave', () => {
      release();
    });

    keyboardWrap.appendChild(key);
  });
}

export function parseCell(melodyCellInput, setStatus) {
  const raw = melodyCellInput.value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));

  if (raw.length < 2) {
    setStatus('Melodic cell needs at least 2 numbers');
    return false;
  }

  state.parsedCell = raw;
  setStatus(`Cell loaded (${raw.length} steps)`);
  return true;
}
