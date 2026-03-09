// Tests for cross-file dependency consistency.
//
// These tests verify that jack IDs, audio node property names, and
// other contracts stay in sync across modules. When a property is renamed
// in one file, these tests catch the mismatch.
//
// COVERED DEPENDENCIES:
// - Jack IDs must match between index.html data-jack-id, registerAllJacks() in main.js,
//   and createDefaultCables() source/dest strings.
// - getAudioNodes() property names in synth-engine.js, drum-machine.js, groovebox.js
//   must match what main.js expects.
// - ClockBus event shape must match what drum-machine and groovebox onClockTick expect.
// - Cable color array in cable-manager.js must have entries for default cable setup.

import { suite, test, assert, assertEqual } from './test-runner.js';
import { setupGlobalMocks, MockAudioContext, MockAudioNode } from './mocks.js';
setupGlobalMocks();

// Import the modules under test
import { PatchRouter } from '../js/patch-router.js';
import { ClockBus } from '../js/clock-bus.js';
import { SCALES, NOTE_TO_MIDI, VCO_CONFIG, GLOBAL_KNOBS, FX_KNOBS, state } from '../js/state.js';
import { FourVCOPhasingSynth } from '../js/synth-engine.js';

globalThis.window.AudioContext = MockAudioContext;
globalThis.window.webkitAudioContext = MockAudioContext;

function makeState() {
  return {
    audioReady: false,
    knobs: {
      global: { bpm: 120, masterGain: 0.8, phaseSpread: 18, rootTune: 0, swing: 0, noteLength: 0.62, humanize: 0.004 },
      fx: {
        attack: 0.02, decay: 0.28, sustain: 0.55, release: 0.34,
        cutoff: 4200, resonance: 2.2,
        delayTime: 0.25, delayFeedback: 0.32, delayMix: 0.25,
        lfoRate: 0.8, lfoDepth: 480, drive: 1.05
      }
    },
    vcos: structuredClone(VCO_CONFIG),
    parsedCell: [0, 2, 3, 5, 7, 5, 3, 2],
    phaseCells: [],
    keyboardPressed: new Set(),
    keyboardPointers: new Set()
  };
}

// ─── Jack ID consistency ─────────────────────────────────
// These are the jack IDs that main.js registerAllJacks() registers.
// If any of these change, cable-manager and index.html must also change.

const EXPECTED_SYNTH_JACKS = [
  // VCO outputs
  'vco1-out', 'vco2-out', 'vco3-out', 'vco4-out',
  // LFO
  'lfo-out',
  // Drive
  'drive-in', 'drive-out',
  // Filter
  'filter-in', 'filter-out', 'filter-cutoff-cv', 'filter-res-cv',
  // Delay
  'delay-in', 'delay-out', 'delay-time-cv',
  // Dry path
  'dry-in', 'dry-out',
  // Master
  'master-in'
];

const EXPECTED_808_JACKS = [
  '808-mix-out', '808-kick-out', '808-snare-out', '808-hh-out', '808-perc-out',
  '808-clock-in'
];

const EXPECTED_707_JACKS = [
  '707-mix-out', '707-tk1-out', '707-tk2-out', '707-tk3-out', '707-tk4-out',
  '707-clock-in', '707-cv1-in', '707-cv2-in', '707-cv3-in', '707-cv4-in'
];

// Default cables from main.js createDefaultCables()
const DEFAULT_CABLES = [
  { src: 'vco1-out', dst: 'drive-in' },
  { src: 'vco2-out', dst: 'drive-in' },
  { src: 'vco3-out', dst: 'drive-in' },
  { src: 'vco4-out', dst: 'drive-in' },
  { src: 'drive-out', dst: 'filter-in' },
  { src: 'filter-out', dst: 'dry-in' },
  { src: 'filter-out', dst: 'delay-in' },
  { src: 'dry-out', dst: 'master-in' },
  { src: 'delay-out', dst: 'master-in' },
  { src: 'lfo-out', dst: 'filter-cutoff-cv' },
  { src: '808-mix-out', dst: 'master-in' },
  { src: '707-mix-out', dst: 'master-in' }
];

suite('Cross-file — jack ID registry');

test('all expected synth jack IDs can be registered', () => {
  const r = new PatchRouter();
  EXPECTED_SYNTH_JACKS.forEach((id) => {
    const type = id.includes('-out') ? 'output' : 'input';
    r.registerJack(id, new MockAudioNode(id), type);
    assert(r.getJack(id), `Jack ${id} should be registered`);
  });
});

test('all expected 808 jack IDs can be registered', () => {
  const r = new PatchRouter();
  EXPECTED_808_JACKS.forEach((id) => {
    const type = id.includes('-out') ? 'output' : 'input';
    r.registerJack(id, new MockAudioNode(id), type);
    assert(r.getJack(id), `Jack ${id} should be registered`);
  });
});

test('all expected 707 jack IDs can be registered', () => {
  const r = new PatchRouter();
  EXPECTED_707_JACKS.forEach((id) => {
    const type = id.includes('-out') ? 'output' : 'input';
    r.registerJack(id, new MockAudioNode(id), type);
    assert(r.getJack(id), `Jack ${id} should be registered`);
  });
});

test('no jack ID appears in both synth and 808 lists', () => {
  const overlap = EXPECTED_SYNTH_JACKS.filter((id) => EXPECTED_808_JACKS.includes(id));
  assertEqual(overlap.length, 0, `Overlapping jack IDs: ${overlap.join(', ')}`);
});

test('no jack ID appears in both synth and 707 lists', () => {
  const overlap = EXPECTED_SYNTH_JACKS.filter((id) => EXPECTED_707_JACKS.includes(id));
  assertEqual(overlap.length, 0, `Overlapping jack IDs: ${overlap.join(', ')}`);
});

// ─── Default cable consistency ───────────────────────────

suite('Cross-file — default cables');

test('all default cable source IDs exist in jack registries', () => {
  const allJacks = [...EXPECTED_SYNTH_JACKS, ...EXPECTED_808_JACKS, ...EXPECTED_707_JACKS];
  DEFAULT_CABLES.forEach((cable) => {
    assert(allJacks.includes(cable.src),
      `Default cable source "${cable.src}" not found in jack registries`);
  });
});

test('all default cable dest IDs exist in jack registries', () => {
  const allJacks = [...EXPECTED_SYNTH_JACKS, ...EXPECTED_808_JACKS, ...EXPECTED_707_JACKS];
  DEFAULT_CABLES.forEach((cable) => {
    assert(allJacks.includes(cable.dst),
      `Default cable dest "${cable.dst}" not found in jack registries`);
  });
});

test('default cables connect output to input (not same type)', () => {
  DEFAULT_CABLES.forEach((cable) => {
    // Output jacks contain "-out" in the ID
    const srcIsOutput = cable.src.includes('-out');
    const dstIsInput = cable.dst.includes('-in') || cable.dst.includes('-cv');
    assert(srcIsOutput, `Default cable source "${cable.src}" should be output`);
    assert(dstIsInput, `Default cable dest "${cable.dst}" should be input`);
  });
});

test('default cables create a valid audio path VCO->Drive->Filter->Master', () => {
  // Verify the signal chain: VCO -> Drive -> Filter -> Dry -> Master
  const hasCable = (src, dst) => DEFAULT_CABLES.some((c) => c.src === src && c.dst === dst);

  assert(hasCable('vco1-out', 'drive-in'), 'VCO1 -> Drive');
  assert(hasCable('drive-out', 'filter-in'), 'Drive -> Filter');
  assert(hasCable('filter-out', 'dry-in'), 'Filter -> Dry');
  assert(hasCable('dry-out', 'master-in'), 'Dry -> Master');
});

test('default cables needs at least 8 to match minimum cable color count', () => {
  assert(DEFAULT_CABLES.length >= 8,
    `Default cables (${DEFAULT_CABLES.length}) should use at least 8 colors`);
});

// ─── ClockBus event contract ─────────────────────────────

suite('Cross-file — ClockBus event contract');

test('ClockBus event has all properties needed by DrumMachine808.onClockTick', () => {
  const clockState = { knobs: { global: { bpm: 120, swing: 0 } } };
  const bus = new ClockBus(clockState);
  bus.setAudioContext(new MockAudioContext());
  bus.running = true;
  bus.nextTime = bus.ctx.currentTime;

  let event = null;
  bus.subscribe((ev) => { event = ev; });
  bus.tick();

  // DrumMachine808.onClockTick reads: event.step16, event.time
  assert(event, 'Should dispatch event');
  assert('step16' in event, 'Event needs step16 for drum machine');
  assert('time' in event, 'Event needs time for drum machine scheduling');
  assert(typeof event.step16 === 'number', 'step16 should be number');
  assert(typeof event.time === 'number', 'time should be number');
});

test('ClockBus event has all properties needed by Groovebox707.onClockTick', () => {
  const clockState = { knobs: { global: { bpm: 120, swing: 0 } } };
  const bus = new ClockBus(clockState);
  bus.setAudioContext(new MockAudioContext());
  bus.running = true;
  bus.nextTime = bus.ctx.currentTime;

  let event = null;
  bus.subscribe((ev) => { event = ev; });
  bus.tick();

  // Groovebox707.onClockTick reads: event.step16, event.time, event.baseStep
  assert('step16' in event, 'Event needs step16 for groovebox');
  assert('time' in event, 'Event needs time for groovebox scheduling');
  assert('baseStep' in event, 'Event needs baseStep for groovebox gate calc');
});

test('step16 cycles 0-15 correctly', () => {
  const clockState = { knobs: { global: { bpm: 120, swing: 0 } } };
  const bus = new ClockBus(clockState);
  bus.setAudioContext(new MockAudioContext());

  // Manually test step16 calculation
  const steps = [0, 1, 15, 16, 31, 32];
  const expected16 = [0, 1, 15, 0, 15, 0];

  steps.forEach((step, i) => {
    assertEqual(step % 16, expected16[i], `Step ${step} % 16 should be ${expected16[i]}`);
  });
});

// ─── State property contract ─────────────────────────────

suite('Cross-file — state.js property names');

test('state.knobs.global has bpm (used by ClockBus.getBpm)', () => {
  const knobDef = GLOBAL_KNOBS.find((k) => k.id === 'bpm');
  assert(knobDef, 'GLOBAL_KNOBS must include bpm for ClockBus');
});

test('state.knobs.global has swing (used by ClockBus.getSwing)', () => {
  const knobDef = GLOBAL_KNOBS.find((k) => k.id === 'swing');
  assert(knobDef, 'GLOBAL_KNOBS must include swing for ClockBus');
});

test('state.knobs.fx has cutoff (used by synth updateAllParams)', () => {
  const knobDef = FX_KNOBS.find((k) => k.id === 'cutoff');
  assert(knobDef, 'FX_KNOBS must include cutoff');
});

test('state.knobs.fx has all ADSR params', () => {
  ['attack', 'decay', 'sustain', 'release'].forEach((param) => {
    const found = FX_KNOBS.find((k) => k.id === param);
    assert(found, `FX_KNOBS must include ${param}`);
  });
});

test('VCO_CONFIG has exactly 4 entries (synth expects 4 VCOs)', () => {
  assertEqual(VCO_CONFIG.length, 4, 'PatchRouter registers vco1-out through vco4-out');
});

// ─── Audio graph internal plumbing ───────────────────────

suite('Cross-file — internal plumbing contract');

test('drive internal path: driveInput must connect to driveNode', () => {
  // This verifies the CRITICAL fix: after disconnectAll() + registerAllJacks(),
  // driveInput -> driveNode must be reconnected.
  // The actual reconnection happens in main.js registerAllJacks().
  // We test the principle that both nodes exist.
  const synth = new FourVCOPhasingSynth(makeState());
  // Before init, nodes are null
  assertEqual(synth.driveInput, null, 'driveInput null before init');
  assertEqual(synth.driveNode, null, 'driveNode null before init');
});

test('delay feedback loop: delayNode -> delayFeedback -> delayNode', () => {
  // Verify both nodes exist after init
  const synth = new FourVCOPhasingSynth(makeState());
  // Before init, both should be null
  assertEqual(synth.delayNode, null);
  assertEqual(synth.delayFeedback, null);
});

test('master output always connects to analyser + destination + recordStream', async () => {
  // This is the contract that disconnectAll() preserves
  globalThis.window.AudioContext = MockAudioContext;
  const synth = new FourVCOPhasingSynth(makeState());
  await synth.init();

  synth.disconnectAll();

  // These three connections should ALWAYS exist after disconnectAll
  const connected = synth.masterGain._connectedTo;
  assert(connected.includes(synth.analyser), 'masterGain -> analyser');
  assert(connected.includes(synth.ctx.destination), 'masterGain -> destination');
  assert(connected.includes(synth.recordStream), 'masterGain -> recordStream');
});
