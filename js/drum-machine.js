import { makeKnob } from './knob.js';

const INSTRUMENTS = [
  { id: 'bd', label: 'BD', color: '#e8364f' },
  { id: 'sd', label: 'SD', color: '#f0c830' },
  { id: 'ch', label: 'CH', color: '#3a9fff' },
  { id: 'oh', label: 'OH', color: '#3a9fff' },
  { id: 'cp', label: 'CP', color: '#f58a2e' },
  { id: 'lt', label: 'LT', color: '#3dd87a' },
  { id: 'mt', label: 'MT', color: '#3dd87a' },
  { id: 'ht', label: 'HT', color: '#3dd87a' },
  { id: 'rs', label: 'RS', color: '#b366f5' },
  { id: 'cb', label: 'CB', color: '#b366f5' },
  { id: 'cy', label: 'CY', color: '#e8e8f0' },
  { id: 'ma', label: 'MA', color: '#e8e8f0' }
];

function createNoiseBuffer(ctx, duration = 1) {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

export class DrumMachine808 {
  constructor(clockBus) {
    this.clockBus = clockBus;
    this.ctx = null;
    this.noiseBuffer = null;

    this.masterGain = null;
    this.kickGain = null;
    this.snareGain = null;
    this.hhGain = null;
    this.percGain = null;

    this.state = {
      patterns: {
        A: {},
        B: {}
      },
      currentPattern: 'A',
      instruments: {},
      accent: new Array(16).fill(0),
      accentLevel: 0.3,
      step: 0,
      running: false
    };

    // Initialize empty patterns for each instrument
    INSTRUMENTS.forEach((inst) => {
      this.state.patterns.A[inst.id] = new Array(16).fill(0);
      this.state.patterns.B[inst.id] = new Array(16).fill(0);
      this.state.instruments[inst.id] = { level: 0.75, tune: 0 };
    });

    // Default patterns
    this.state.patterns.A.bd = [1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0];
    this.state.patterns.A.sd = [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0];
    this.state.patterns.A.ch = [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0];

    this.stepElements = {};
    this.accentElements = [];
    this.stepIndicator = -1;
    this.unsubscribe = null;
    this.panelEl = null;
  }

  init(audioContext) {
    this.ctx = audioContext;
    this.noiseBuffer = createNoiseBuffer(this.ctx, 2);

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;

    this.kickGain = this.ctx.createGain();
    this.kickGain.gain.value = 1;
    this.kickGain.connect(this.masterGain);

    this.snareGain = this.ctx.createGain();
    this.snareGain.gain.value = 1;
    this.snareGain.connect(this.masterGain);

    this.hhGain = this.ctx.createGain();
    this.hhGain.gain.value = 1;
    this.hhGain.connect(this.masterGain);

    this.percGain = this.ctx.createGain();
    this.percGain.gain.value = 1;
    this.percGain.connect(this.masterGain);
  }

  getAudioNodes() {
    return {
      masterGain: this.masterGain,
      kickGain: this.kickGain,
      snareGain: this.snareGain,
      hhGain: this.hhGain,
      percGain: this.percGain
    };
  }

  getOutputForInstrument(id) {
    if (id === 'bd') return this.kickGain;
    if (id === 'sd') return this.snareGain;
    if (id === 'ch' || id === 'oh' || id === 'cy') return this.hhGain;
    return this.percGain;
  }

  // ─── Synthesis ───────────────────────────────────────────

  triggerKick(time, accent) {
    const inst = this.state.instruments.bd;
    const vol = inst.level * (accent ? 1 + this.state.accentLevel : 1);
    const tuneOffset = inst.tune * 20;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const amp = this.ctx.createGain();

    osc.frequency.setValueAtTime(150 + tuneOffset, time);
    osc.frequency.exponentialRampToValueAtTime(50 + tuneOffset * 0.3, time + 0.08);

    amp.gain.setValueAtTime(vol, time);
    amp.gain.exponentialRampToValueAtTime(0.001, time + 0.3);

    osc.connect(amp);
    amp.connect(this.kickGain);

    osc.start(time);
    osc.stop(time + 0.35);
    osc.onended = () => amp.disconnect(); // prevent memory leak
  }

  triggerSnare(time, accent) {
    const inst = this.state.instruments.sd;
    const vol = inst.level * (accent ? 1 + this.state.accentLevel : 1);
    const tuneOffset = inst.tune * 30;

    // Body
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180 + tuneOffset, time);
    const bodyAmp = this.ctx.createGain();
    bodyAmp.gain.setValueAtTime(vol * 0.7, time);
    bodyAmp.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    osc.connect(bodyAmp);
    bodyAmp.connect(this.snareGain);
    osc.start(time);
    osc.stop(time + 0.12);
    osc.onended = () => bodyAmp.disconnect();

    // Noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const noiseBp = this.ctx.createBiquadFilter();
    noiseBp.type = 'bandpass';
    noiseBp.frequency.value = 3000 + tuneOffset * 10;
    noiseBp.Q.value = 1.2;
    const noiseAmp = this.ctx.createGain();
    noiseAmp.gain.setValueAtTime(vol * 0.6, time);
    noiseAmp.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    noise.connect(noiseBp);
    noiseBp.connect(noiseAmp);
    noiseAmp.connect(this.snareGain);
    noise.start(time);
    noise.stop(time + 0.2);
    noise.onended = () => { noiseBp.disconnect(); noiseAmp.disconnect(); };
  }

  triggerClap(time, accent) {
    const inst = this.state.instruments.cp;
    const vol = inst.level * (accent ? 1 + this.state.accentLevel : 1);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200 + inst.tune * 200;
    bp.Q.value = 0.8;
    const amp = this.ctx.createGain();

    // Multi-burst envelope
    amp.gain.setValueAtTime(0, time);
    for (let i = 0; i < 3; i++) {
      const t = time + i * 0.012;
      amp.gain.setValueAtTime(vol * 0.7, t);
      amp.gain.setValueAtTime(0, t + 0.006);
    }
    amp.gain.setValueAtTime(vol, time + 0.036);
    amp.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

    noise.connect(bp);
    bp.connect(amp);
    amp.connect(this.percGain);
    noise.start(time);
    noise.stop(time + 0.2);
    noise.onended = () => { bp.disconnect(); amp.disconnect(); };
  }

  triggerHiHat(time, accent, open = false) {
    const inst = open ? this.state.instruments.oh : this.state.instruments.ch;
    const vol = inst.level * (accent ? 1 + this.state.accentLevel : 1);
    const freqs = [800, 1047, 1186, 1413, 1665, 1893];
    const decay = open ? 0.35 : 0.03;
    const tuneRatio = 1 + inst.tune * 0.1;

    const merger = this.ctx.createGain();
    merger.gain.value = 0.3;

    let lastOsc = null;
    freqs.forEach((f) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f * tuneRatio;
      osc.connect(merger);
      osc.start(time);
      osc.stop(time + decay + 0.05);
      lastOsc = osc;
    });

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(vol, time);
    amp.gain.exponentialRampToValueAtTime(0.001, time + decay);

    merger.connect(hp);
    hp.connect(amp);
    amp.connect(this.hhGain);

    // Clean up intermediate nodes after all oscillators finish
    if (lastOsc) {
      lastOsc.onended = () => { merger.disconnect(); hp.disconnect(); amp.disconnect(); };
    }
  }

  triggerTom(time, accent, type) {
    const config = { lt: [120, 80], mt: [160, 110], ht: [220, 150] };
    const [startFreq, endFreq] = config[type] || config.mt;
    const inst = this.state.instruments[type];
    const vol = inst.level * (accent ? 1 + this.state.accentLevel : 1);
    const tuneOffset = inst.tune * 20;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq + tuneOffset, time);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq + tuneOffset * 0.5), time + 0.06);

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(vol, time);
    amp.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

    osc.connect(amp);
    amp.connect(this.percGain);
    osc.start(time);
    osc.stop(time + 0.25);
    osc.onended = () => amp.disconnect();
  }

  triggerCowbell(time, accent) {
    const inst = this.state.instruments.cb;
    const vol = inst.level * (accent ? 1 + this.state.accentLevel : 1);
    const tuneRatio = 1 + inst.tune * 0.1;

    const osc1 = this.ctx.createOscillator();
    osc1.type = 'square';
    osc1.frequency.value = 587 * tuneRatio;

    const osc2 = this.ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 845 * tuneRatio;

    const merge = this.ctx.createGain();
    merge.gain.value = 0.4;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700 * tuneRatio;
    bp.Q.value = 3;

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(vol, time);
    amp.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

    osc1.connect(merge);
    osc2.connect(merge);
    merge.connect(bp);
    bp.connect(amp);
    amp.connect(this.percGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.12);
    osc2.stop(time + 0.12);
    osc2.onended = () => { merge.disconnect(); bp.disconnect(); amp.disconnect(); };
  }

  triggerRimshot(time, accent) {
    const inst = this.state.instruments.rs;
    const vol = inst.level * (accent ? 1 + this.state.accentLevel : 1);

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(500 + inst.tune * 50, time);
    osc.frequency.exponentialRampToValueAtTime(300 + inst.tune * 30, time + 0.01);

    const oscAmp = this.ctx.createGain();
    oscAmp.gain.setValueAtTime(vol, time);
    oscAmp.gain.exponentialRampToValueAtTime(0.001, time + 0.015);

    osc.connect(oscAmp);
    oscAmp.connect(this.percGain);
    osc.start(time);
    osc.stop(time + 0.03);
    osc.onended = () => oscAmp.disconnect();

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 1;
    const nAmp = this.ctx.createGain();
    nAmp.gain.setValueAtTime(vol * 0.5, time);
    nAmp.gain.exponentialRampToValueAtTime(0.001, time + 0.015);
    noise.connect(bp);
    bp.connect(nAmp);
    nAmp.connect(this.percGain);
    noise.start(time);
    noise.stop(time + 0.03);
    noise.onended = () => { bp.disconnect(); nAmp.disconnect(); };
  }

  triggerCymbal(time, accent) {
    const inst = this.state.instruments.cy;
    const vol = inst.level * (accent ? 1 + this.state.accentLevel : 1);
    const freqs = [800, 1047, 1186, 1413, 1665, 1893];
    const tuneRatio = 1 + inst.tune * 0.1;

    const merger = this.ctx.createGain();
    merger.gain.value = 0.25;

    let lastOsc = null;
    freqs.forEach((f) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f * tuneRatio;
      osc.connect(merger);
      osc.start(time);
      osc.stop(time + 0.9);
      lastOsc = osc;
    });

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 4000;

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(vol, time);
    amp.gain.exponentialRampToValueAtTime(0.001, time + 0.8);

    merger.connect(hp);
    hp.connect(amp);
    amp.connect(this.hhGain);

    if (lastOsc) {
      lastOsc.onended = () => { merger.disconnect(); hp.disconnect(); amp.disconnect(); };
    }
  }

  triggerMaracas(time, accent) {
    const inst = this.state.instruments.ma;
    const vol = inst.level * (accent ? 1 + this.state.accentLevel : 1);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 8000 + inst.tune * 500;

    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(vol * 0.4, time);
    amp.gain.exponentialRampToValueAtTime(0.001, time + 0.02);

    noise.connect(hp);
    hp.connect(amp);
    amp.connect(this.percGain);
    noise.start(time);
    noise.stop(time + 0.04);
    noise.onended = () => { hp.disconnect(); amp.disconnect(); };
  }

  triggerInstrument(id, time, accent) {
    switch (id) {
      case 'bd': this.triggerKick(time, accent); break;
      case 'sd': this.triggerSnare(time, accent); break;
      case 'cp': this.triggerClap(time, accent); break;
      case 'ch': this.triggerHiHat(time, accent, false); break;
      case 'oh': this.triggerHiHat(time, accent, true); break;
      case 'lt': this.triggerTom(time, accent, 'lt'); break;
      case 'mt': this.triggerTom(time, accent, 'mt'); break;
      case 'ht': this.triggerTom(time, accent, 'ht'); break;
      case 'rs': this.triggerRimshot(time, accent); break;
      case 'cb': this.triggerCowbell(time, accent); break;
      case 'cy': this.triggerCymbal(time, accent); break;
      case 'ma': this.triggerMaracas(time, accent); break;
    }
  }

  // ─── Clock subscriber ───────────────────────────────────

  onClockTick(event) {
    if (!this.state.running || !this.ctx) {
      return;
    }

    const step = event.step16;
    const pattern = this.state.patterns[this.state.currentPattern];
    const accent = this.state.accent[step];

    INSTRUMENTS.forEach((inst) => {
      if (pattern[inst.id][step]) {
        this.triggerInstrument(inst.id, event.time, accent);
      }
    });

    this.stepIndicator = step;
    this.updateStepHighlight();
  }

  start() {
    this.state.running = true;
    if (this.unsubscribe) {
      return;
    }
    this.unsubscribe = this.clockBus.subscribe((event) => this.onClockTick(event));
  }

  stop() {
    this.state.running = false;
    this.stepIndicator = -1;
    this.updateStepHighlight();
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  // ─── UI ─────────────────────────────────────────────────

  buildUI(container) {
    this.panelEl = container;

    // Top controls row
    const topRow = document.createElement('div');
    topRow.className = 'drum-top-row';

    const patternBtns = document.createElement('div');
    patternBtns.className = 'drum-pattern-btns';
    ['A', 'B'].forEach((p) => {
      const btn = document.createElement('button');
      btn.className = `drum-pattern-btn${p === this.state.currentPattern ? ' active' : ''}`;
      btn.textContent = p;
      btn.addEventListener('click', () => {
        this.state.currentPattern = p;
        patternBtns.querySelectorAll('.drum-pattern-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.refreshGrid();
      });
      patternBtns.appendChild(btn);
    });
    topRow.appendChild(patternBtns);

    const transportBtn = document.createElement('button');
    transportBtn.className = 'drum-transport-btn accent';
    transportBtn.textContent = 'Start';
    transportBtn.addEventListener('click', () => {
      if (this.state.running) {
        this.stop();
        transportBtn.textContent = 'Start';
        transportBtn.classList.add('accent');
      } else {
        this.start();
        transportBtn.textContent = 'Stop';
        transportBtn.classList.remove('accent');
      }
    });
    topRow.appendChild(transportBtn);

    const accentKnobWrap = document.createElement('div');
    accentKnobWrap.className = 'drum-knob-inline';
    makeKnob(accentKnobWrap, {
      id: 'accentLevel', label: 'Accent', min: 0, max: 1, step: 0.01, value: 0.3, unit: ''
    }, (v) => { this.state.accentLevel = v; });
    topRow.appendChild(accentKnobWrap);

    container.appendChild(topRow);

    // Step grid
    const grid = document.createElement('div');
    grid.className = 'drum-grid';

    INSTRUMENTS.forEach((inst) => {
      const row = document.createElement('div');
      row.className = 'drum-row';

      const label = document.createElement('span');
      label.className = 'drum-inst-label';
      label.textContent = inst.label;
      label.style.color = inst.color;
      row.appendChild(label);

      // Mini knobs for level and tune
      const knobArea = document.createElement('div');
      knobArea.className = 'drum-row-knobs';

      makeKnob(knobArea, {
        id: `${inst.id}-lvl`, label: 'Lvl', min: 0, max: 1, step: 0.01,
        value: this.state.instruments[inst.id].level, unit: ''
      }, (v) => { this.state.instruments[inst.id].level = v; });

      makeKnob(knobArea, {
        id: `${inst.id}-tune`, label: 'Tune', min: -1, max: 1, step: 0.01,
        value: this.state.instruments[inst.id].tune, unit: ''
      }, (v) => { this.state.instruments[inst.id].tune = v; });

      row.appendChild(knobArea);

      // Step buttons
      const steps = document.createElement('div');
      steps.className = 'drum-steps';
      this.stepElements[inst.id] = [];

      for (let s = 0; s < 16; s++) {
        const stepBtn = document.createElement('button');
        stepBtn.className = 'drum-step-btn';
        stepBtn.dataset.step = s;
        const pattern = this.state.patterns[this.state.currentPattern];
        if (pattern[inst.id][s]) {
          stepBtn.classList.add('on');
        }

        // Color-code groups of 4
        if (s >= 0 && s < 4) stepBtn.classList.add('group-1');
        else if (s >= 4 && s < 8) stepBtn.classList.add('group-2');
        else if (s >= 8 && s < 12) stepBtn.classList.add('group-3');
        else stepBtn.classList.add('group-4');

        stepBtn.addEventListener('click', () => {
          const pat = this.state.patterns[this.state.currentPattern];
          pat[inst.id][s] = pat[inst.id][s] ? 0 : 1;
          stepBtn.classList.toggle('on');
        });

        steps.appendChild(stepBtn);
        this.stepElements[inst.id].push(stepBtn);
      }

      row.appendChild(steps);
      grid.appendChild(row);
    });

    // Accent row
    const accentRow = document.createElement('div');
    accentRow.className = 'drum-row drum-accent-row';
    const accentLabel = document.createElement('span');
    accentLabel.className = 'drum-inst-label';
    accentLabel.textContent = 'ACC';
    accentLabel.style.color = '#f0c830';
    accentRow.appendChild(accentLabel);

    const accentSpacer = document.createElement('div');
    accentSpacer.className = 'drum-row-knobs';
    accentRow.appendChild(accentSpacer);

    const accentSteps = document.createElement('div');
    accentSteps.className = 'drum-steps';
    for (let s = 0; s < 16; s++) {
      const stepBtn = document.createElement('button');
      stepBtn.className = 'drum-step-btn accent-step';
      if (this.state.accent[s]) {
        stepBtn.classList.add('on');
      }
      stepBtn.addEventListener('click', () => {
        this.state.accent[s] = this.state.accent[s] ? 0 : 1;
        stepBtn.classList.toggle('on');
      });
      accentSteps.appendChild(stepBtn);
      this.accentElements.push(stepBtn);
    }
    accentRow.appendChild(accentSteps);
    grid.appendChild(accentRow);

    container.appendChild(grid);

    // Jacks
    const jacks = document.createElement('div');
    jacks.className = 'jack-row';

    const outputJacks = [
      { id: '808-mix-out', label: 'Mix Out', type: 'output' },
      { id: '808-kick-out', label: 'Kick', type: 'output' },
      { id: '808-snare-out', label: 'Snare', type: 'output' },
      { id: '808-hh-out', label: 'HH', type: 'output' },
      { id: '808-perc-out', label: 'Perc', type: 'output' }
    ];

    const inputJacks = [
      { id: '808-clock-in', label: 'Clock In', type: 'input' }
    ];

    [...outputJacks, ...inputJacks].forEach((j) => {
      const jackEl = document.createElement('div');
      jackEl.className = `jack jack-${j.type}`;
      jackEl.dataset.jackId = j.id;
      jackEl.title = j.label;
      const jackLabel = document.createElement('span');
      jackLabel.className = 'jack-label';
      jackLabel.textContent = j.label;
      jackEl.appendChild(jackLabel);
      jacks.appendChild(jackEl);
    });

    container.appendChild(jacks);
  }

  refreshGrid() {
    const pattern = this.state.patterns[this.state.currentPattern];
    INSTRUMENTS.forEach((inst) => {
      this.stepElements[inst.id]?.forEach((btn, s) => {
        btn.classList.toggle('on', !!pattern[inst.id][s]);
      });
    });
  }

  updateStepHighlight() {
    INSTRUMENTS.forEach((inst) => {
      this.stepElements[inst.id]?.forEach((btn, s) => {
        btn.classList.toggle('playing', s === this.stepIndicator);
      });
    });
    this.accentElements.forEach((btn, s) => {
      btn.classList.toggle('playing', s === this.stepIndicator);
    });
  }
}
