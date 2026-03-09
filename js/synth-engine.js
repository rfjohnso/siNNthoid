import { SCALES, NOTE_TO_MIDI } from './state.js';

export class FourVCOPhasingSynth {
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

    this.vcoBus = new Array(4).fill(null).map(() => {
      const vcoGain = ctx.createGain();
      return vcoGain;
    });

    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfoDepth = ctx.createGain();
    this.lfo.connect(this.lfoDepth);
    this.lfo.start();

    this.updateAllParams();
  }

  // IMPORTANT: The property names in this return object are the API contract used by
  // main.js registerAllJacks(). Renaming any property here requires updating main.js too.
  // The patch router and cable system depend on these exact node references.
  getAudioNodes() {
    return {
      vcoBus: this.vcoBus,
      driveInput: this.driveInput,
      driveNode: this.driveNode,
      masterFilter: this.masterFilter,
      delayNode: this.delayNode,
      delayFeedback: this.delayFeedback,
      delayWet: this.delayWet,
      dryGain: this.dryGain,
      masterGain: this.masterGain,
      analyser: this.analyser,
      lfo: this.lfo,
      lfoDepth: this.lfoDepth,
      recordStream: this.recordStream
    };
  }

  connectDefaultChain() {
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
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.connect(this.recordStream);

    this.vcoBus.forEach((bus) => bus.connect(this.driveInput));
    this.lfoDepth.connect(this.masterFilter.frequency);
  }

  // Called by main.js before registering jacks with the PatchRouter.
  // After this, main.js registerAllJacks() re-establishes internal plumbing
  // (driveInput→driveNode, delay feedback). If you add internal routing,
  // make sure registerAllJacks() reconnects it.
  disconnectAll() {
    // Disconnect each node individually so one failure doesn't skip the rest.
    // Nodes may throw if not connected, which is safe to ignore per-node.
    const nodesToDisconnect = [
      this.driveInput, this.driveNode, this.masterFilter,
      this.delayNode, this.delayFeedback, this.dryGain,
      this.delayWet, this.masterGain, this.lfoDepth,
      ...this.vcoBus
    ];
    for (const node of nodesToDisconnect) {
      try { node.disconnect(); } catch (e) { /* node may not be connected */ }
    }
    // Always keep destination + analyser + recordStream on masterGain
    this.masterGain.connect(this.analyser);
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.connect(this.recordStream);
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

    // Clean up intermediate nodes when the oscillator finishes to prevent memory leaks.
    // Without this, amp and pan GainNodes remain connected to vcoBus indefinitely.
    osc.onended = () => {
      amp.disconnect();
      pan.disconnect();
    };

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

    return { release: releaseVoice };
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

  startPhrase(clockBus) {
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

  scheduleLoop(rootNoteValue, scaleValue) {
    if (!this.running || !this.ctx) {
      return;
    }

    const now = this.ctx.currentTime;
    const lookAhead = 0.16;
    const global = this.state.knobs.global;
    const baseStep = 60 / Math.max(30, global.bpm) / 2;
    const rootMidi = NOTE_TO_MIDI[rootNoteValue || 'D3'] + global.rootTune;
    const cell = this.state.parsedCell;

    this.vcoSequencers.forEach((seq, idx) => {
      while (seq.nextTime <= now + lookAhead) {
        const step = seq.step;
        const localIdx = step % cell.length;
        const semitoneOffset = cell[localIdx];
        const rawMidi = rootMidi + semitoneOffset;
        const qMidi = this.quantizeToScale(rawMidi, rootMidi, scaleValue || 'Minor');
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

  noteOn(midi, rootNoteValue, scaleValue) {
    if (!this.ctx || this.heldNotes.has(midi)) {
      return;
    }

    const rootMidi = NOTE_TO_MIDI[rootNoteValue || 'D3'] + this.state.knobs.global.rootTune;
    const qMidi = this.quantizeToScale(midi, rootMidi, scaleValue || 'Minor');
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

  startRecording(recordingsList) {
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
