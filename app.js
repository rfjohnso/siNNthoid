const statusText = document.getElementById('statusText');
const initAudioBtn = document.getElementById('initAudio');
const startPhaseBtn = document.getElementById('startPhase');
const stopPhaseBtn = document.getElementById('stopPhase');
const panicBtn = document.getElementById('panic');
const globalKnobsWrap = document.getElementById('globalKnobs');
const fxKnobsWrap = document.getElementById('fxKnobs');
const vcoBank = document.getElementById('vcoBank');
const rootNoteSelect = document.getElementById('rootNote');
const scaleTypeSelect = document.getElementById('scaleType');
const melodyCellInput = document.getElementById('melodyCell');
const phaseGrid = document.getElementById('phaseGrid');
const scopeCanvas = document.getElementById('scope');
const recordStartBtn = document.getElementById('recordStart');
const recordStopBtn = document.getElementById('recordStop');
const recordingsList = document.getElementById('recordings');
const keyboardWrap = document.getElementById('keyboard');
const knobTemplate = document.getElementById('knobTemplate');

const NOTE_TO_MIDI = {
  C3: 48,
  D3: 50,
  E3: 52,
  F3: 53,
  G3: 55,
  A3: 57,
  B3: 59,
  C4: 60
};

const SCALES = {
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Major: [0, 2, 4, 5, 7, 9, 11],
  Pentatonic: [0, 2, 4, 7, 9]
};

const GLOBAL_KNOBS = [
  { id: 'bpm', label: 'BPM', min: 40, max: 220, step: 1, value: 112, unit: '' },
  { id: 'swing', label: 'Swing', min: 0, max: 0.45, step: 0.01, value: 0.08, unit: '' },
  { id: 'masterGain', label: 'Master', min: 0, max: 1.2, step: 0.01, value: 0.8, unit: '' },
  { id: 'noteLength', label: 'Gate', min: 0.08, max: 1, step: 0.01, value: 0.62, unit: '' },
  { id: 'humanize', label: 'Humanize', min: 0, max: 0.03, step: 0.001, value: 0.004, unit: 's' },
  { id: 'phaseSpread', label: 'Spread', min: 0, max: 150, step: 1, value: 18, unit: 'ms' },
  { id: 'rootTune', label: 'Transpose', min: -12, max: 12, step: 1, value: 0, unit: 'st' }
];

const FX_KNOBS = [
  { id: 'attack', label: 'Attack', min: 0.001, max: 2, step: 0.001, value: 0.02, unit: 's' },
  { id: 'decay', label: 'Decay', min: 0.02, max: 2.5, step: 0.01, value: 0.28, unit: 's' },
  { id: 'sustain', label: 'Sustain', min: 0, max: 1, step: 0.01, value: 0.55, unit: '' },
  { id: 'release', label: 'Release', min: 0.01, max: 3.5, step: 0.01, value: 0.34, unit: 's' },
  { id: 'cutoff', label: 'Cutoff', min: 100, max: 14000, step: 1, value: 4200, unit: 'Hz' },
  { id: 'resonance', label: 'Resonance', min: 0.3, max: 18, step: 0.1, value: 2.2, unit: '' },
  { id: 'delayTime', label: 'Delay Time', min: 0, max: 0.75, step: 0.001, value: 0.25, unit: 's' },
  { id: 'delayFeedback', label: 'Feedback', min: 0, max: 0.9, step: 0.01, value: 0.32, unit: '' },
  { id: 'delayMix', label: 'Delay Mix', min: 0, max: 0.95, step: 0.01, value: 0.25, unit: '' },
  { id: 'lfoRate', label: 'LFO Rate', min: 0, max: 12, step: 0.01, value: 0.8, unit: 'Hz' },
  { id: 'lfoDepth', label: 'LFO Depth', min: 0, max: 2200, step: 1, value: 480, unit: 'Hz' },
  { id: 'drive', label: 'Drive', min: 0.4, max: 2.2, step: 0.01, value: 1.05, unit: '' }
];

const VCO_CONFIG = [0, 1, 2, 3].map((idx) => ({
  idx,
  waveform: 'sawtooth',
  level: 0.52,
  octave: idx % 2 === 0 ? 0 : -1,
  detune: idx * 3,
  pan: -0.66 + idx * 0.44,
  phaseMs: idx * 9,
  delayMs: idx * 42,
  driftMs: idx === 0 ? 0 : idx * 0.12
}));

const KEYBOARD_MAP = {
  z: 48,
  s: 49,
  x: 50,
  d: 51,
  c: 52,
  v: 53,
  g: 54,
  b: 55,
  h: 56,
  n: 57,
  j: 58,
  m: 59,
  ',': 60,
  l: 61,
  '.': 62,
  ';': 63,
  '/': 64
};

const state = {
  audioReady: false,
  knobs: {
    global: {},
    fx: {}
  },
  vcos: structuredClone(VCO_CONFIG),
  parsedCell: [0, 2, 3, 5, 7, 5, 3, 2],
  phaseCells: [],
  keyboardPressed: new Set(),
  keyboardPointers: new Set()
};

class FourVCOPhasingSynth {
  constructor(sharedState) {
    this.state = sharedState;
    this.ctx = null;
    this.masterGain = null;
    this.masterFilter = null;
    this.delayNode = null;
    this.delayFeedback = null;
    this.delayWet = null;
    this.dryGain = null;
    this.analyser = null;
    this.driveNode = null;
    this.driveInput = null;
    this.vcoBus = [];
    this.scheduler = null;
    this.lfo = null;
    this.lfoDepth = null;
    this.running = false;
    this.vcoSequencers = [];
    this.heldNotes = new Map();
    this.recordStream = null;
    this.recorder = null;
    this.recordedChunks = [];
    this.recordingCount = 0;
  }

  async init() {
    if (this.ctx) {
      return;
    }

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    const ctx = this.ctx;

    this.driveInput = ctx.createGain();
    this.driveNode = ctx.createWaveShaper();
    this.masterFilter = ctx.createBiquadFilter();
    this.masterFilter.type = 'lowpass';
    this.delayNode = ctx.createDelay(1.5);
    this.delayFeedback = ctx.createGain();
    this.delayWet = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.masterGain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    this.recordStream = ctx.createMediaStreamDestination();

    this.driveInput.connect(this.driveNode);
    this.driveNode.connect(this.masterFilter);
    this.masterFilter.connect(this.dryGain);
    this.masterFilter.connect(this.delayNode);
    this.delayNode.connect(this.delayWet);
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);

    this.dryGain.connect(this.masterGain);
    this.delayWet.connect(this.masterGain);
    this.masterGain.connect(this.analyser);
    this.masterGain.connect(ctx.destination);
    this.masterGain.connect(this.recordStream);

    this.vcoBus = new Array(4).fill(null).map(() => {
      const vcoGain = ctx.createGain();
      vcoGain.connect(this.driveInput);
      return vcoGain;
    });

    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfoDepth = ctx.createGain();
    this.lfo.connect(this.lfoDepth);
    this.lfoDepth.connect(this.masterFilter.frequency);
    this.lfo.start();

    this.updateAllParams();
  }

  midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  quantizeToScale(midi, rootMidi, scaleName) {
    const scale = SCALES[scaleName] || SCALES.Minor;
    const diff = midi - rootMidi;
    const octave = Math.floor(diff / 12);
    const local = ((diff % 12) + 12) % 12;

    let nearest = scale[0];
    let nearestDist = Infinity;
    for (const note of scale) {
      const dist = Math.abs(note - local);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = note;
      }
    }

    return rootMidi + octave * 12 + nearest;
  }

  makeDriveCurve(amount = 1) {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const x = (i * 2) / n - 1;
      curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  updateAllParams() {
    if (!this.ctx) {
      return;
    }

    const fx = this.state.knobs.fx;
    const global = this.state.knobs.global;

    this.masterGain.gain.setTargetAtTime(global.masterGain, this.ctx.currentTime, 0.02);
    this.masterFilter.frequency.setTargetAtTime(fx.cutoff, this.ctx.currentTime, 0.03);
    this.masterFilter.Q.setTargetAtTime(fx.resonance, this.ctx.currentTime, 0.03);
    this.delayNode.delayTime.setTargetAtTime(fx.delayTime, this.ctx.currentTime, 0.03);
    this.delayFeedback.gain.setTargetAtTime(fx.delayFeedback, this.ctx.currentTime, 0.03);
    this.delayWet.gain.setTargetAtTime(fx.delayMix, this.ctx.currentTime, 0.03);
    this.dryGain.gain.setTargetAtTime(1 - fx.delayMix * 0.72, this.ctx.currentTime, 0.03);

    this.driveNode.curve = this.makeDriveCurve(Math.max(0.4, fx.drive) * 4);
    this.driveNode.oversample = '2x';

    this.lfo.frequency.setTargetAtTime(fx.lfoRate, this.ctx.currentTime, 0.06);
    this.lfoDepth.gain.setTargetAtTime(fx.lfoDepth, this.ctx.currentTime, 0.06);

    this.state.vcos.forEach((vco, idx) => {
      this.vcoBus[idx].gain.setTargetAtTime(vco.level, this.ctx.currentTime, 0.03);
    });
  }

  createVoice(vcoIndex, freq, startTime, noteDuration, held = false) {
    const ctx = this.ctx;
    const fx = this.state.knobs.fx;
    const vco = this.state.vcos[vcoIndex];

    const osc = ctx.createOscillator();
    osc.type = vco.waveform;
    osc.frequency.setValueAtTime(freq, startTime);
    osc.detune.setValueAtTime(vco.detune, startTime);

    const amp = ctx.createGain();
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(vco.pan, startTime);

    osc.connect(amp);
    amp.connect(pan);
    pan.connect(this.vcoBus[vcoIndex]);

    const attack = Math.max(0.001, fx.attack);
    const decay = Math.max(0.01, fx.decay);
    const sustain = this.clamp(fx.sustain, 0, 1);
    const release = Math.max(0.01, fx.release);

    amp.gain.cancelScheduledValues(startTime);
    amp.gain.setValueAtTime(0.0001, startTime);
    amp.gain.linearRampToValueAtTime(1, startTime + attack);
    amp.gain.linearRampToValueAtTime(sustain, startTime + attack + decay);

    osc.start(startTime);

    const releaseVoice = (releaseTime = ctx.currentTime) => {
      const rStart = Math.max(releaseTime, startTime + attack + decay);
      amp.gain.cancelScheduledValues(rStart);
      amp.gain.setValueAtTime(amp.gain.value || sustain, rStart);
      amp.gain.exponentialRampToValueAtTime(0.0001, rStart + release);
      osc.stop(rStart + release + 0.05);
    };

    if (!held) {
      releaseVoice(startTime + noteDuration);
    }

    return {
      release: releaseVoice
    };
  }

  triggerStackedVoice(freq, duration, startTime = this.ctx.currentTime, held = false) {
    const voiceHandles = [];

    this.state.vcos.forEach((vco, idx) => {
      const ratio = Math.pow(2, vco.octave);
      const voiceFreq = freq * ratio;
      const handle = this.createVoice(idx, voiceFreq, startTime, duration, held);
      voiceHandles.push(handle);
    });

    return voiceHandles;
  }

  startPhrase() {
    if (!this.ctx || this.running) {
      return;
    }

    const now = this.ctx.currentTime;
    const spreadMs = this.state.knobs.global.phaseSpread;
    this.vcoSequencers = this.state.vcos.map((vco) => ({
      nextTime: now + 0.05 + (spreadMs * vco.idx + vco.phaseMs + vco.delayMs) / 1000,
      step: 0,
      marker: -1
    }));

    this.running = true;
    this.scheduler = window.setInterval(() => this.scheduleLoop(), 20);
  }

  stopPhrase() {
    this.running = false;
    if (this.scheduler) {
      clearInterval(this.scheduler);
      this.scheduler = null;
    }
  }

  scheduleLoop() {
    if (!this.running || !this.ctx) {
      return;
    }

    const now = this.ctx.currentTime;
    const lookAhead = 0.16;
    const global = this.state.knobs.global;
    const baseStep = 60 / Math.max(30, global.bpm) / 2;
    const rootMidi = NOTE_TO_MIDI[rootNoteSelect.value] + global.rootTune;
    const cell = this.state.parsedCell;

    this.vcoSequencers.forEach((seq, idx) => {
      while (seq.nextTime <= now + lookAhead) {
        const step = seq.step;
        const localIdx = step % cell.length;
        const semitoneOffset = cell[localIdx];
        const rawMidi = rootMidi + semitoneOffset;
        const qMidi = this.quantizeToScale(rawMidi, rootMidi, scaleTypeSelect.value);
        const freq = this.midiToFreq(qMidi);

        const human = (Math.random() * 2 - 1) * global.humanize;
        const noteTime = Math.max(seq.nextTime + human, now);
        const gate = Math.max(0.03, baseStep * global.noteLength);
        this.createVoice(idx, freq * Math.pow(2, this.state.vcos[idx].octave), noteTime, gate, false);

        seq.marker = localIdx % 16;

        const swingOffset = step % 2 === 1 ? baseStep * global.swing : 0;
        const drift = this.state.vcos[idx].driftMs / 1000;
        seq.nextTime += baseStep + swingOffset + drift;
        seq.step += 1;
      }
    });
  }

  noteOn(midi) {
    if (!this.ctx || this.heldNotes.has(midi)) {
      return;
    }

    const rootMidi = NOTE_TO_MIDI[rootNoteSelect.value] + this.state.knobs.global.rootTune;
    const qMidi = this.quantizeToScale(midi, rootMidi, scaleTypeSelect.value);
    const freq = this.midiToFreq(qMidi);
    const handles = this.triggerStackedVoice(freq, 0.2, this.ctx.currentTime, true);
    this.heldNotes.set(midi, handles);
  }

  noteOff(midi) {
    if (!this.ctx) {
      return;
    }

    const handles = this.heldNotes.get(midi);
    if (!handles) {
      return;
    }

    handles.forEach((handle) => handle.release(this.ctx.currentTime));
    this.heldNotes.delete(midi);
  }

  allNotesOff() {
    for (const midi of this.heldNotes.keys()) {
      this.noteOff(midi);
    }
  }

  startRecording() {
    if (!this.recordStream || this.recorder?.state === 'recording') {
      return;
    }

    const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'];
    const pickedType = mimeTypes.find((item) => MediaRecorder.isTypeSupported(item));

    this.recordedChunks = [];
    this.recorder = pickedType
      ? new MediaRecorder(this.recordStream.stream, { mimeType: pickedType })
      : new MediaRecorder(this.recordStream.stream);

    this.recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    this.recorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, { type: this.recorder.mimeType || 'audio/webm' });
      const url = URL.createObjectURL(blob);
      this.recordingCount += 1;

      const item = document.createElement('li');
      item.textContent = `Take ${this.recordingCount}`;

      const player = document.createElement('audio');
      player.controls = true;
      player.src = url;

      const download = document.createElement('a');
      download.href = url;
      download.download = `sinnthoid-take-${this.recordingCount}.webm`;
      download.textContent = 'Download';
      download.style.marginLeft = '8px';
      download.style.color = '#8ae8ff';

      item.appendChild(player);
      item.appendChild(download);
      recordingsList.prepend(item);
    };

    this.recorder.start();
  }

  stopRecording() {
    if (this.recorder?.state === 'recording') {
      this.recorder.stop();
    }
  }
}

const synth = new FourVCOPhasingSynth(state);

function setStatus(text) {
  statusText.textContent = text;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function quantize(value, step) {
  if (!step) {
    return value;
  }
  return Math.round(value / step) * step;
}

function formatValue(value, cfg) {
  const absStep = Math.abs(cfg.step);
  let digits = 0;
  if (absStep > 0 && absStep < 1) {
    digits = String(absStep).split('.')[1]?.length ?? 0;
  }
  const rounded = Number(value.toFixed(Math.min(digits, 3)));
  return `${rounded}${cfg.unit || ''}`;
}

function makeKnob(container, cfg, onChange) {
  const node = knobTemplate.content.firstElementChild.cloneNode(true);
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
  return {
    setValue
  };
}

function parseCell() {
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

function initKnobs() {
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

function buildVcoStrip(vco) {
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

function initVcoBank() {
  state.vcos.forEach((vco) => {
    vcoBank.appendChild(buildVcoStrip(vco));
  });
}

function initPhaseGrid() {
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

function drawPhaseGrid() {
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

function initScope() {
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

    drawPhaseGrid();
    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
}

function buildKeyboard() {
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
      synth.noteOn(midi);
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

function findKeyByMidi(midi) {
  return keyboardWrap.querySelector(`.key[data-midi="${midi}"]`);
}

function initEvents() {
  const ensureAudioReady = async () => {
    if (!state.audioReady) {
      try {
        await synth.init();
        if (synth.ctx.state === 'suspended') {
          await synth.ctx.resume();
        }
        state.audioReady = true;
        synth.updateAllParams();
        recordStartBtn.disabled = false;
        setStatus(`Audio ready on ${window.sinnthoid?.platform || 'desktop'}`);
      } catch (error) {
        setStatus(`Audio init failed: ${error.message}`);
        return false;
      }
    }
    return true;
  };

  initAudioBtn.addEventListener('click', async () => {
    await ensureAudioReady();
  });

  startPhaseBtn.addEventListener('click', async () => {
    const ready = await ensureAudioReady();
    if (!ready) {
      return;
    }

    const isCellValid = parseCell();
    if (!isCellValid) {
      return;
    }
    synth.startPhrase();
    setStatus('Phase loop running');
  });

  stopPhaseBtn.addEventListener('click', () => {
    synth.stopPhrase();
    setStatus('Transport stopped');
  });

  panicBtn.addEventListener('click', () => {
    synth.stopPhrase();
    synth.allNotesOff();
    setStatus('All notes off');
  });

  melodyCellInput.addEventListener('change', parseCell);

  rootNoteSelect.addEventListener('change', () => {
    setStatus(`Root changed to ${rootNoteSelect.value}`);
  });

  scaleTypeSelect.addEventListener('change', () => {
    setStatus(`Scale set to ${scaleTypeSelect.value}`);
  });

  recordStartBtn.addEventListener('click', async () => {
    const ready = await ensureAudioReady();
    if (!ready) {
      return;
    }
    synth.startRecording();
    recordStartBtn.disabled = true;
    recordStopBtn.disabled = false;
    setStatus('Recording...');
  });

  recordStopBtn.addEventListener('click', () => {
    synth.stopRecording();
    recordStartBtn.disabled = false;
    recordStopBtn.disabled = true;
    setStatus('Recording stopped');
  });

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (event.repeat || !(key in KEYBOARD_MAP)) {
      return;
    }

    if (!state.audioReady) {
      return;
    }

    const midi = KEYBOARD_MAP[key];
    if (!state.keyboardPressed.has(midi)) {
      state.keyboardPressed.add(midi);
      synth.noteOn(midi);
      findKeyByMidi(midi)?.classList.add('active');
    }
  });

  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (!(key in KEYBOARD_MAP)) {
      return;
    }

    const midi = KEYBOARD_MAP[key];
    state.keyboardPressed.delete(midi);
    synth.noteOff(midi);
    findKeyByMidi(midi)?.classList.remove('active');
  });

  window.addEventListener('blur', () => {
    state.keyboardPressed.forEach((midi) => {
      synth.noteOff(midi);
      findKeyByMidi(midi)?.classList.remove('active');
    });
    state.keyboardPressed.clear();
  });
}

function init() {
  initKnobs();
  initVcoBank();
  initPhaseGrid();
  initScope();
  buildKeyboard();
  initEvents();
  parseCell();
  setStatus('Ready. Initialize audio to begin.');

  recordStartBtn.disabled = true;
  recordStopBtn.disabled = true;
}

init();
