import { state, KEYBOARD_MAP } from './state.js';
import { FourVCOPhasingSynth } from './synth-engine.js';
import { ClockBus } from './clock-bus.js';
import { PatchRouter } from './patch-router.js';
import { DrumMachine808 } from './drum-machine.js';
import { Groovebox707 } from './groovebox.js';
import { initKnobs, initVcoBank, initPhaseGrid, initScope, buildKeyboard, parseCell } from './ui-builder.js';
import { initPanelManager, resetLayout, showPanel, getHiddenPanels } from './panel-manager.js';
import { initCableManager } from './cable-manager.js';

// ─── DOM refs ──────────────────────────────────────────

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
const resetLayoutBtn = document.getElementById('resetLayout');
const panelMenuBtn = document.getElementById('panelMenuBtn');
const cableOverlay = document.getElementById('cableOverlay');
const drum808Container = document.getElementById('drum808Content');
const gb707Container = document.getElementById('gb707Content');

// ─── Instances ─────────────────────────────────────────

const synth = new FourVCOPhasingSynth(state);
const clockBus = new ClockBus(state);
const patchRouter = new PatchRouter();
const drum808 = new DrumMachine808(clockBus);
const gb707 = new Groovebox707(clockBus);

function setStatus(text) {
  statusText.textContent = text;
}

// ─── Audio init ────────────────────────────────────────

async function ensureAudioReady() {
  if (!state.audioReady) {
    try {
      await synth.init();
      if (synth.ctx.state === 'suspended') {
        await synth.ctx.resume();
      }

      clockBus.setAudioContext(synth.ctx);

      // Initialize 808 and 707 with shared audio context
      drum808.init(synth.ctx);
      gb707.init(synth.ctx);

      // Disconnect default hardwired chain — we'll use patch cables
      // But first connect the internal plumbing that always stays:
      // masterGain → analyser, destination, recordStream (done inside synth)
      // delayNode → delayFeedback → delayNode (internal feedback loop)
      synth.disconnectAll();

      // Register all jacks with the patch router
      registerAllJacks();

      // Create default patch cables (or load saved)
      const cableApi = initCableManager(cableOverlay, patchRouter);
      const loaded = cableApi.loadSavedCables();
      if (!loaded) {
        createDefaultCables(cableApi);
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
}

// ─── Patch routing registration ────────────────────────

function registerAllJacks() {
  const nodes = synth.getAudioNodes();

  // VCO outputs
  for (let i = 0; i < 4; i++) {
    patchRouter.registerJack(`vco${i + 1}-out`, nodes.vcoBus[i], 'output', { label: `VCO ${i + 1} Out` });
  }

  // LFO output
  patchRouter.registerJack('lfo-out', nodes.lfoDepth, 'output', { label: 'LFO Out' });

  // Drive
  patchRouter.registerJack('drive-in', nodes.driveInput, 'input', { label: 'Drive In' });
  patchRouter.registerJack('drive-out', nodes.driveNode, 'output', { label: 'Drive Out' });

  // Filter
  patchRouter.registerJack('filter-in', nodes.masterFilter, 'input', { label: 'Filter In' });
  patchRouter.registerJack('filter-out', nodes.masterFilter, 'output', { label: 'Filter Out' });
  patchRouter.registerJack('filter-cutoff-cv', null, 'input', {
    label: 'Cutoff CV',
    param: nodes.masterFilter.frequency
  });
  patchRouter.registerJack('filter-res-cv', null, 'input', {
    label: 'Res CV',
    param: nodes.masterFilter.Q
  });

  // Delay
  patchRouter.registerJack('delay-in', nodes.delayNode, 'input', { label: 'Delay In' });
  patchRouter.registerJack('delay-out', nodes.delayWet, 'output', { label: 'Delay Out' });
  patchRouter.registerJack('delay-time-cv', null, 'input', {
    label: 'Time CV',
    param: nodes.delayNode.delayTime
  });

  // Dry path
  patchRouter.registerJack('dry-in', nodes.dryGain, 'input', { label: 'Dry In' });
  patchRouter.registerJack('dry-out', nodes.dryGain, 'output', { label: 'Dry Out' });

  // Master
  patchRouter.registerJack('master-in', nodes.masterGain, 'input', { label: 'Master In' });

  // Internal: keep delay feedback loop always connected
  nodes.delayNode.connect(nodes.delayFeedback);
  nodes.delayFeedback.connect(nodes.delayNode);
  nodes.delayNode.connect(nodes.delayWet);

  // 808 jacks
  const dm = drum808.getAudioNodes();
  patchRouter.registerJack('808-mix-out', dm.masterGain, 'output', { label: '808 Mix' });
  patchRouter.registerJack('808-kick-out', dm.kickGain, 'output', { label: '808 Kick' });
  patchRouter.registerJack('808-snare-out', dm.snareGain, 'output', { label: '808 Snare' });
  patchRouter.registerJack('808-hh-out', dm.hhGain, 'output', { label: '808 HH' });
  patchRouter.registerJack('808-perc-out', dm.percGain, 'output', { label: '808 Perc' });
  // 808 clock input (conceptual — for future clock routing)
  patchRouter.registerJack('808-clock-in', dm.masterGain, 'input', { label: '808 Clock In' });

  // 707 jacks
  const gb = gb707.getAudioNodes();
  patchRouter.registerJack('707-mix-out', gb.masterGain, 'output', { label: '707 Mix' });
  for (let i = 0; i < 4; i++) {
    patchRouter.registerJack(`707-tk${i + 1}-out`, gb.trackGains[i], 'output', { label: `707 Tk${i + 1}` });
  }
  // 707 inputs
  patchRouter.registerJack('707-clock-in', gb.masterGain, 'input', { label: '707 Clock In' });
  for (let i = 0; i < 4; i++) {
    patchRouter.registerJack(`707-cv${i + 1}-in`, gb.trackGains[i], 'input', { label: `707 CV${i + 1}` });
  }
}

function createDefaultCables(cableApi) {
  const colors = cableApi.CABLE_COLORS;
  const defaults = [
    // VCOs → Drive
    { src: 'vco1-out', dst: 'drive-in', color: colors[0] },  // red
    { src: 'vco2-out', dst: 'drive-in', color: colors[1] },  // yellow
    { src: 'vco3-out', dst: 'drive-in', color: colors[2] },  // blue
    { src: 'vco4-out', dst: 'drive-in', color: colors[3] },  // green
    // Drive → Filter
    { src: 'drive-out', dst: 'filter-in', color: colors[6] }, // white
    // Filter → Dry + Delay
    { src: 'filter-out', dst: 'dry-in', color: colors[5] },   // purple
    { src: 'filter-out', dst: 'delay-in', color: colors[4] }, // orange
    // Dry + Delay → Master
    { src: 'dry-out', dst: 'master-in', color: colors[5] },    // purple
    { src: 'delay-out', dst: 'master-in', color: colors[4] },  // orange
    // LFO → Filter cutoff
    { src: 'lfo-out', dst: 'filter-cutoff-cv', color: colors[0] }, // red
    // 808 → Master
    { src: '808-mix-out', dst: 'master-in', color: colors[1] }, // yellow
    // 707 → Master
    { src: '707-mix-out', dst: 'master-in', color: colors[2] }  // blue
  ];

  defaults.forEach((d) => {
    const srcEl = document.querySelector(`[data-jack-id="${d.src}"]`);
    const dstEl = document.querySelector(`[data-jack-id="${d.dst}"]`);
    if (srcEl && dstEl) {
      cableApi.createConnection(srcEl, dstEl, d.color);
    }
  });
}

// ─── Events ────────────────────────────────────────────

function initEvents() {
  initAudioBtn.addEventListener('click', async () => {
    await ensureAudioReady();
  });

  startPhaseBtn.addEventListener('click', async () => {
    const ready = await ensureAudioReady();
    if (!ready) return;

    const isCellValid = parseCell(melodyCellInput, setStatus);
    if (!isCellValid) return;

    // Start clock bus (syncs 808 + 707 if they're running)
    clockBus.start();
    synth.startPhrase(clockBus);
    setStatus('Phase loop running');
  });

  stopPhaseBtn.addEventListener('click', () => {
    synth.stopPhrase();
    clockBus.stop();
    drum808.stop();
    gb707.stop();
    setStatus('Transport stopped');
  });

  panicBtn.addEventListener('click', () => {
    synth.stopPhrase();
    synth.allNotesOff();
    clockBus.stop();
    drum808.stop();
    gb707.stop();
    setStatus('All notes off');
  });

  melodyCellInput.addEventListener('change', () => parseCell(melodyCellInput, setStatus));

  rootNoteSelect.addEventListener('change', () => {
    setStatus(`Root changed to ${rootNoteSelect.value}`);
  });

  scaleTypeSelect.addEventListener('change', () => {
    setStatus(`Scale set to ${scaleTypeSelect.value}`);
  });

  recordStartBtn.addEventListener('click', async () => {
    const ready = await ensureAudioReady();
    if (!ready) return;
    synth.startRecording(recordingsList);
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

  // Override synth scheduleLoop to pass DOM values
  const origSchedule = synth.scheduleLoop.bind(synth);
  synth.scheduleLoop = () => origSchedule(rootNoteSelect.value, scaleTypeSelect.value);

  // Keyboard events
  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (event.repeat || !(key in KEYBOARD_MAP)) return;
    if (!state.audioReady) return;

    const midi = KEYBOARD_MAP[key];
    if (!state.keyboardPressed.has(midi)) {
      state.keyboardPressed.add(midi);
      synth.noteOn(midi, rootNoteSelect.value, scaleTypeSelect.value);
      const keyEl = keyboardWrap.querySelector(`.key[data-midi="${midi}"]`);
      keyEl?.classList.add('active');
    }
  });

  window.addEventListener('keyup', (event) => {
    const key = event.key.toLowerCase();
    if (!(key in KEYBOARD_MAP)) return;

    const midi = KEYBOARD_MAP[key];
    state.keyboardPressed.delete(midi);
    synth.noteOff(midi);
    const keyEl = keyboardWrap.querySelector(`.key[data-midi="${midi}"]`);
    keyEl?.classList.remove('active');
  });

  window.addEventListener('blur', () => {
    state.keyboardPressed.forEach((midi) => {
      synth.noteOff(midi);
      const keyEl = keyboardWrap.querySelector(`.key[data-midi="${midi}"]`);
      keyEl?.classList.remove('active');
    });
    state.keyboardPressed.clear();
  });

  // Layout buttons
  resetLayoutBtn?.addEventListener('click', resetLayout);

  panelMenuBtn?.addEventListener('click', () => {
    const hidden = getHiddenPanels();
    if (hidden.length === 0) {
      setStatus('All panels visible');
      return;
    }
    // Simple: show all hidden panels
    hidden.forEach((p) => showPanel(p.id));
    setStatus(`Restored ${hidden.length} panel(s)`);
  });
}

// ─── Init ──────────────────────────────────────────────

function init() {
  initKnobs(globalKnobsWrap, fxKnobsWrap, synth);
  initVcoBank(vcoBank, synth);
  initPhaseGrid(phaseGrid);
  initScope(scopeCanvas, synth);
  buildKeyboard(keyboardWrap, synth);

  // Build 808 + 707 UIs
  drum808.buildUI(drum808Container);
  gb707.buildUI(gb707Container);

  // Setup draggable panels
  initPanelManager();

  initEvents();
  parseCell(melodyCellInput, setStatus);
  setStatus('Ready. Initialize audio to begin.');

  recordStartBtn.disabled = true;
  recordStopBtn.disabled = true;
}

init();
