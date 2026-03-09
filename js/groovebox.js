import { makeKnob } from './knob.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiNoteName(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function makeDefaultClip() {
  const steps = [];
  for (let i = 0; i < 16; i++) {
    steps.push({ note: 60, vel: 100, on: false });
  }
  return { steps };
}

function makeDefaultTrack(index) {
  const waveforms = ['sawtooth', 'square', 'triangle', 'sine'];
  const baseNotes = [48, 55, 60, 67];
  return {
    waveform: waveforms[index % 4],
    cutoff: 4000,
    resonance: 1,
    volume: 0.7,
    pan: (index - 1.5) * 0.3,
    attack: 0.01,
    decay: 0.3,
    muted: false,
    solo: false,
    activeClip: 0,
    clips: [
      makeDefaultClip(),
      makeDefaultClip(),
      makeDefaultClip(),
      makeDefaultClip()
    ]
  };
}

export class Groovebox707 {
  constructor(clockBus) {
    this.clockBus = clockBus;
    this.ctx = null;

    this.masterGain = null;
    this.trackGains = [];
    this.trackPanners = [];

    this.state = {
      tracks: [0, 1, 2, 3].map(makeDefaultTrack),
      scenes: [0, 1, 2, 3],
      selectedTrack: 0,
      selectedClip: 0,
      step: 0,
      running: false
    };

    // Set some default clip content for demo
    const t0 = this.state.tracks[0];
    [0, 4, 8, 12].forEach((s) => { t0.clips[0].steps[s] = { note: 48, vel: 100, on: true }; });
    const t1 = this.state.tracks[1];
    [0, 2, 4, 6, 8, 10, 12, 14].forEach((s) => { t1.clips[0].steps[s] = { note: 55, vel: 80, on: true }; });

    this.stepIndicator = -1;
    this.unsubscribe = null;
    this.panelEl = null;
    this.clipGridBtns = [];
    this.stepEditorBtns = [];
    this.stepNoteLabels = [];
  }

  init(audioContext) {
    this.ctx = audioContext;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.75;

    for (let i = 0; i < 4; i++) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = this.state.tracks[i].pan;

      const gain = this.ctx.createGain();
      gain.gain.value = this.state.tracks[i].volume;

      gain.connect(panner);
      panner.connect(this.masterGain);

      this.trackGains.push(gain);
      this.trackPanners.push(panner);
    }
  }

  getAudioNodes() {
    return {
      masterGain: this.masterGain,
      trackGains: this.trackGains
    };
  }

  // ─── Synthesis ──────────────────────────────────────────

  triggerNote(trackIdx, midi, time, duration) {
    const track = this.state.tracks[trackIdx];
    if (track.muted) {
      return;
    }

    // Check solo: if any track has solo, only play solo'd tracks
    const anySolo = this.state.tracks.some((t) => t.solo);
    if (anySolo && !track.solo) {
      return;
    }

    const freq = midiToFreq(midi);

    const osc = this.ctx.createOscillator();
    osc.type = track.waveform;
    osc.frequency.setValueAtTime(freq, time);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(track.cutoff, time);
    filter.Q.setValueAtTime(track.resonance, time);

    const amp = this.ctx.createGain();
    const attack = Math.max(0.001, track.attack);
    const decay = Math.max(0.01, track.decay);

    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(0.8, time + attack);
    amp.gain.exponentialRampToValueAtTime(0.001, time + attack + decay);

    osc.connect(filter);
    filter.connect(amp);
    amp.connect(this.trackGains[trackIdx]);

    osc.start(time);
    osc.stop(time + attack + decay + 0.05);
    // Clean up intermediate nodes to prevent memory leaks
    osc.onended = () => { filter.disconnect(); amp.disconnect(); };
  }

  // ─── Clock subscriber ──────────────────────────────────

  onClockTick(event) {
    if (!this.state.running || !this.ctx) {
      return;
    }

    const step = event.step16;
    const gate = event.baseStep * 0.8;

    this.state.tracks.forEach((track, trackIdx) => {
      const clip = track.clips[track.activeClip];
      if (!clip) {
        return;
      }
      const stepData = clip.steps[step];
      if (stepData && stepData.on) {
        this.triggerNote(trackIdx, stepData.note, event.time, gate);
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

  launchScene(sceneIdx) {
    this.state.tracks.forEach((track) => {
      track.activeClip = sceneIdx;
    });
    this.refreshClipGrid();
    this.refreshStepEditor();
  }

  // ─── UI ────────────────────────────────────────────────

  buildUI(container) {
    this.panelEl = container;

    // Scene buttons
    const sceneRow = document.createElement('div');
    sceneRow.className = 'gb-scene-row';
    for (let s = 0; s < 4; s++) {
      const btn = document.createElement('button');
      btn.className = 'gb-scene-btn';
      btn.textContent = `Scene ${s + 1}`;
      btn.addEventListener('click', () => this.launchScene(s));
      sceneRow.appendChild(btn);
    }

    const transportBtn = document.createElement('button');
    transportBtn.className = 'gb-transport-btn accent';
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
    sceneRow.appendChild(transportBtn);
    container.appendChild(sceneRow);

    // Track rows: clip grid + controls
    const trackArea = document.createElement('div');
    trackArea.className = 'gb-track-area';

    this.clipGridBtns = [];

    for (let t = 0; t < 4; t++) {
      const track = this.state.tracks[t];
      const row = document.createElement('div');
      row.className = 'gb-track-row';

      const label = document.createElement('span');
      label.className = 'gb-track-label';
      label.textContent = `Tk ${t + 1}`;
      row.appendChild(label);

      // Clip buttons
      const clipBtns = [];
      const clipGrid = document.createElement('div');
      clipGrid.className = 'gb-clip-grid';
      for (let c = 0; c < 4; c++) {
        const btn = document.createElement('button');
        btn.className = 'gb-clip-btn';
        if (c === track.activeClip) {
          btn.classList.add('active');
        }
        btn.textContent = `${String.fromCharCode(65 + t)}${c + 1}`;
        btn.addEventListener('click', () => {
          track.activeClip = c;
          this.state.selectedTrack = t;
          this.state.selectedClip = c;
          this.refreshClipGrid();
          this.refreshStepEditor();
        });
        clipGrid.appendChild(btn);
        clipBtns.push(btn);
      }
      row.appendChild(clipGrid);
      this.clipGridBtns.push(clipBtns);

      // Track controls
      const controls = document.createElement('div');
      controls.className = 'gb-track-controls';

      const waveSelect = document.createElement('select');
      waveSelect.className = 'gb-wave-select';
      ['sine', 'triangle', 'sawtooth', 'square'].forEach((w) => {
        const opt = document.createElement('option');
        opt.value = w;
        opt.textContent = w.slice(0, 3);
        if (w === track.waveform) opt.selected = true;
        waveSelect.appendChild(opt);
      });
      waveSelect.addEventListener('change', () => { track.waveform = waveSelect.value; });
      controls.appendChild(waveSelect);

      const knobContainer = document.createElement('div');
      knobContainer.className = 'gb-knob-row';

      makeKnob(knobContainer, {
        id: `t${t}-cut`, label: 'Cut', min: 100, max: 14000, step: 10,
        value: track.cutoff, unit: ''
      }, (v) => { track.cutoff = v; });

      makeKnob(knobContainer, {
        id: `t${t}-vol`, label: 'Vol', min: 0, max: 1, step: 0.01,
        value: track.volume, unit: ''
      }, (v) => {
        track.volume = v;
        if (this.trackGains[t]) {
          this.trackGains[t].gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
        }
      });

      controls.appendChild(knobContainer);

      // Mute/Solo
      const muteBtn = document.createElement('button');
      muteBtn.className = 'gb-mute-btn';
      muteBtn.textContent = 'M';
      muteBtn.addEventListener('click', () => {
        track.muted = !track.muted;
        muteBtn.classList.toggle('active', track.muted);
      });
      controls.appendChild(muteBtn);

      const soloBtn = document.createElement('button');
      soloBtn.className = 'gb-solo-btn';
      soloBtn.textContent = 'S';
      soloBtn.addEventListener('click', () => {
        track.solo = !track.solo;
        soloBtn.classList.toggle('active', track.solo);
      });
      controls.appendChild(soloBtn);

      row.appendChild(controls);
      trackArea.appendChild(row);
    }

    container.appendChild(trackArea);

    // Step editor
    const editorLabel = document.createElement('div');
    editorLabel.className = 'gb-editor-label';
    editorLabel.textContent = 'Step Editor';
    container.appendChild(editorLabel);

    const editor = document.createElement('div');
    editor.className = 'gb-step-editor';

    this.stepEditorBtns = [];
    this.stepNoteLabels = [];

    for (let s = 0; s < 16; s++) {
      const col = document.createElement('div');
      col.className = 'gb-step-col';

      const btn = document.createElement('button');
      btn.className = 'gb-step-btn';
      btn.addEventListener('click', () => {
        const clip = this.getSelectedClip();
        if (!clip) return;
        clip.steps[s].on = !clip.steps[s].on;
        this.refreshStepEditor();
      });

      // Scroll to change note
      btn.addEventListener('wheel', (e) => {
        e.preventDefault();
        const clip = this.getSelectedClip();
        if (!clip) return;
        const dir = e.deltaY > 0 ? -1 : 1;
        clip.steps[s].note = Math.max(24, Math.min(96, clip.steps[s].note + dir));
        this.refreshStepEditor();
      });

      col.appendChild(btn);

      const noteLabel = document.createElement('span');
      noteLabel.className = 'gb-note-label';
      col.appendChild(noteLabel);

      editor.appendChild(col);
      this.stepEditorBtns.push(btn);
      this.stepNoteLabels.push(noteLabel);
    }

    container.appendChild(editor);

    // Jacks
    const jacks = document.createElement('div');
    jacks.className = 'jack-row';

    const jackDefs = [
      { id: '707-mix-out', label: 'Mix Out', type: 'output' },
      { id: '707-tk1-out', label: 'Tk1', type: 'output' },
      { id: '707-tk2-out', label: 'Tk2', type: 'output' },
      { id: '707-tk3-out', label: 'Tk3', type: 'output' },
      { id: '707-tk4-out', label: 'Tk4', type: 'output' },
      { id: '707-clock-in', label: 'Clock In', type: 'input' },
      { id: '707-cv1-in', label: 'CV1', type: 'input' },
      { id: '707-cv2-in', label: 'CV2', type: 'input' },
      { id: '707-cv3-in', label: 'CV3', type: 'input' },
      { id: '707-cv4-in', label: 'CV4', type: 'input' }
    ];

    jackDefs.forEach((j) => {
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

    this.refreshStepEditor();
  }

  getSelectedClip() {
    const track = this.state.tracks[this.state.selectedTrack];
    return track?.clips[this.state.selectedClip] || null;
  }

  refreshClipGrid() {
    for (let t = 0; t < 4; t++) {
      const track = this.state.tracks[t];
      this.clipGridBtns[t]?.forEach((btn, c) => {
        btn.classList.toggle('active', c === track.activeClip);
        btn.classList.toggle('selected',
          t === this.state.selectedTrack && c === this.state.selectedClip);
      });
    }
  }

  refreshStepEditor() {
    const clip = this.getSelectedClip();
    if (!clip) return;

    this.stepEditorBtns.forEach((btn, s) => {
      const step = clip.steps[s];
      btn.classList.toggle('on', step.on);
      this.stepNoteLabels[s].textContent = step.on ? midiNoteName(step.note) : '-';
    });
  }

  updateStepHighlight() {
    this.stepEditorBtns.forEach((btn, s) => {
      btn.classList.toggle('playing', s === this.stepIndicator);
    });
  }
}
