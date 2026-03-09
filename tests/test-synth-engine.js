// Tests for synth-engine.js — validates pure math functions and audio node wiring.
//
// CROSS-FILE DEPENDENCY COVERAGE:
// - getAudioNodes() return shape must match what main.js registerAllJacks() expects.
//   Tests verify all expected properties exist.
// - disconnectAll() must leave masterGain connected to analyser, destination, and recordStream.
//   Tests verify these reconnections happen.
// - MIDI/frequency conversion and scale quantization are used by both the sequencer
//   and keyboard input. Incorrect values cause wrong pitches.

import { suite, test, assert, assertEqual, assertApprox, assertDeepEqual } from './test-runner.js';
import { setupGlobalMocks, MockAudioContext } from './mocks.js';
setupGlobalMocks();

// We need to set up the AudioContext constructor mock before importing synth
globalThis.window.AudioContext = MockAudioContext;
globalThis.window.webkitAudioContext = MockAudioContext;

import { FourVCOPhasingSynth } from '../js/synth-engine.js';
import { VCO_CONFIG, SCALES } from '../js/state.js';

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

// ─── MIDI to frequency ──────────────────────────────────

suite('SynthEngine — midiToFreq');

test('A4 (MIDI 69) = 440 Hz', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  assertApprox(synth.midiToFreq(69), 440, 0.01);
});

test('A3 (MIDI 57) = 220 Hz', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  assertApprox(synth.midiToFreq(57), 220, 0.01);
});

test('C4 (MIDI 60) = ~261.63 Hz', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  assertApprox(synth.midiToFreq(60), 261.63, 0.1);
});

test('octave above doubles frequency', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  const freq60 = synth.midiToFreq(60);
  const freq72 = synth.midiToFreq(72);
  assertApprox(freq72 / freq60, 2.0, 0.001);
});

test('semitone ratio is 2^(1/12)', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  const f1 = synth.midiToFreq(60);
  const f2 = synth.midiToFreq(61);
  assertApprox(f2 / f1, Math.pow(2, 1 / 12), 0.0001);
});

// ─── Clamp ──────────────────────────────────────────────

suite('SynthEngine — clamp');

test('clamp returns value within range', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  assertEqual(synth.clamp(0.5, 0, 1), 0.5);
});

test('clamp pins to min', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  assertEqual(synth.clamp(-5, 0, 1), 0);
});

test('clamp pins to max', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  assertEqual(synth.clamp(10, 0, 1), 1);
});

test('clamp at boundary returns boundary', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  assertEqual(synth.clamp(0, 0, 1), 0);
  assertEqual(synth.clamp(1, 0, 1), 1);
});

// ─── Scale quantization ─────────────────────────────────

suite('SynthEngine — quantizeToScale');

test('root note quantizes to itself (Minor)', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  const result = synth.quantizeToScale(60, 60, 'Minor');
  assertEqual(result, 60);
});

test('one semitone above root snaps to root in Minor', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  // Minor = [0, 2, 3, 5, 7, 8, 10], so 61 (1 semitone) should snap to 60 (0) or 62 (2)
  const result = synth.quantizeToScale(61, 60, 'Minor');
  assert(result === 60 || result === 62, `Should snap to 60 or 62, got ${result}`);
});

test('quantization stays in same octave for root interval', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  // D (MIDI 62 = root+2) should be in Minor scale
  const result = synth.quantizeToScale(62, 60, 'Minor');
  assertEqual(result, 62, 'D is in C Minor');
});

test('quantization works across octaves', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  // MIDI 72 = C5, one octave above root C4 (60)
  const result = synth.quantizeToScale(72, 60, 'Minor');
  assertEqual(result, 72, 'Root note in higher octave should quantize to itself');
});

test('quantization works with Major scale', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  // Major = [0, 2, 4, 5, 7, 9, 11]
  // MIDI 61 (C#) should snap to 60 (C) or 62 (D) in C Major
  const result = synth.quantizeToScale(61, 60, 'Major');
  assert(result === 60 || result === 62, `C# should snap to C or D in Major, got ${result}`);
});

test('Pentatonic has only 5 notes per octave', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  // Test that all 12 semitones snap to one of the 5 pentatonic notes
  const pentatonicNotes = new Set();
  for (let i = 0; i < 12; i++) {
    const q = synth.quantizeToScale(60 + i, 60, 'Pentatonic');
    pentatonicNotes.add(q - 60);
  }
  assertEqual(pentatonicNotes.size, 5, 'Pentatonic should produce exactly 5 unique notes');
});

test('falls back to Minor when scale name is unknown', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  // Should not throw, should use Minor
  const result = synth.quantizeToScale(60, 60, 'NonexistentScale');
  assertEqual(result, 60, 'Should still quantize root to itself');
});

// ─── Drive curve ─────────────────────────────────────────

suite('SynthEngine — makeDriveCurve');

test('returns Float32Array of length 1024', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  const curve = synth.makeDriveCurve(1);
  assert(curve instanceof Float32Array, 'Should be Float32Array');
  assertEqual(curve.length, 1024);
});

test('curve is antisymmetric (odd function)', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  const curve = synth.makeDriveCurve(1);
  // curve[0] should be roughly -curve[1023]
  assertApprox(curve[0], -curve[1023], 0.01, 'Drive curve should be antisymmetric');
});

test('midpoint of curve is near zero', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  const curve = synth.makeDriveCurve(1);
  assertApprox(curve[512], 0, 0.1, 'Midpoint should be near zero');
});

test('higher drive amount produces more saturation', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  const curveL = synth.makeDriveCurve(0.5);
  const curveH = synth.makeDriveCurve(2);
  // With more drive, the curve reaches saturation faster
  // At 3/4 point, higher drive should have higher absolute value
  const idx = 768;
  assert(Math.abs(curveH[idx]) >= Math.abs(curveL[idx]) * 0.8,
    'Higher drive should produce more saturation');
});

// ─── Audio node API contract ─────────────────────────────

suite('SynthEngine — getAudioNodes() contract');

test('getAudioNodes returns all expected properties after init', async () => {
  const synth = new FourVCOPhasingSynth(makeState());
  await synth.init();

  const nodes = synth.getAudioNodes();
  const expected = [
    'vcoBus', 'driveInput', 'driveNode', 'masterFilter',
    'delayNode', 'delayFeedback', 'delayWet', 'dryGain',
    'masterGain', 'analyser', 'lfo', 'lfoDepth', 'recordStream'
  ];

  expected.forEach((prop) => {
    assert(prop in nodes, `getAudioNodes() missing property: ${prop}`);
    assert(nodes[prop] !== null && nodes[prop] !== undefined,
      `getAudioNodes().${prop} should not be null/undefined`);
  });
});

test('vcoBus has exactly 4 gain nodes', async () => {
  const synth = new FourVCOPhasingSynth(makeState());
  await synth.init();

  const nodes = synth.getAudioNodes();
  assertEqual(nodes.vcoBus.length, 4, 'vcoBus should have 4 elements');
});

// ─── disconnectAll ──────────────────────────────────────

suite('SynthEngine — disconnectAll');

test('disconnectAll reconnects masterGain to analyser', async () => {
  const synth = new FourVCOPhasingSynth(makeState());
  await synth.init();

  synth.disconnectAll();

  // After disconnectAll, masterGain should still be connected to analyser
  assert(
    synth.masterGain._connectedTo.includes(synth.analyser),
    'masterGain should reconnect to analyser after disconnectAll'
  );
});

test('disconnectAll reconnects masterGain to destination', async () => {
  const synth = new FourVCOPhasingSynth(makeState());
  await synth.init();

  synth.disconnectAll();

  assert(
    synth.masterGain._connectedTo.includes(synth.ctx.destination),
    'masterGain should reconnect to destination after disconnectAll'
  );
});

test('disconnectAll reconnects masterGain to recordStream', async () => {
  const synth = new FourVCOPhasingSynth(makeState());
  await synth.init();

  synth.disconnectAll();

  assert(
    synth.masterGain._connectedTo.includes(synth.recordStream),
    'masterGain should reconnect to recordStream after disconnectAll'
  );
});

test('disconnectAll handles per-node errors without skipping others', async () => {
  const synth = new FourVCOPhasingSynth(makeState());
  await synth.init();

  // Make one node throw on disconnect
  const origDisconnect = synth.driveInput.disconnect;
  synth.driveInput.disconnect = () => { throw new Error('mock error'); };

  // Should not throw
  synth.disconnectAll();

  // masterFilter should still have been disconnected (per-node try/catch)
  assert(synth.masterFilter._disconnected, 'Other nodes should still be disconnected');

  synth.driveInput.disconnect = origDisconnect;
});

// ─── Init idempotency ───────────────────────────────────

suite('SynthEngine — init');

test('init is idempotent (second call is no-op)', async () => {
  const synth = new FourVCOPhasingSynth(makeState());
  await synth.init();
  const ctx1 = synth.ctx;
  await synth.init();
  assertEqual(synth.ctx, ctx1, 'Should not create a new context');
});

// ─── Note on/off ────────────────────────────────────────

suite('SynthEngine — noteOn / noteOff');

test('noteOn before init does nothing', () => {
  const synth = new FourVCOPhasingSynth(makeState());
  // Should not throw
  synth.noteOn(60, 'C4', 'Minor');
});

test('noteOn registers held note', async () => {
  const synth = new FourVCOPhasingSynth(makeState());
  await synth.init();
  synth.connectDefaultChain();

  synth.noteOn(60, 'C4', 'Minor');
  assert(synth.heldNotes.has(60), 'Note 60 should be held');
});

test('noteOn is idempotent for same MIDI note', async () => {
  const synth = new FourVCOPhasingSynth(makeState());
  await synth.init();
  synth.connectDefaultChain();

  synth.noteOn(60, 'C4', 'Minor');
  const handles1 = synth.heldNotes.get(60);
  synth.noteOn(60, 'C4', 'Minor');
  const handles2 = synth.heldNotes.get(60);
  assertEqual(handles1, handles2, 'Should not recreate voice for same note');
});

test('noteOff removes held note', async () => {
  const synth = new FourVCOPhasingSynth(makeState());
  await synth.init();
  synth.connectDefaultChain();

  synth.noteOn(60, 'C4', 'Minor');
  synth.noteOff(60);
  assert(!synth.heldNotes.has(60), 'Note 60 should be released');
});

test('allNotesOff clears all held notes', async () => {
  const synth = new FourVCOPhasingSynth(makeState());
  await synth.init();
  synth.connectDefaultChain();

  synth.noteOn(60, 'C4', 'Minor');
  synth.noteOn(64, 'C4', 'Minor');
  synth.noteOn(67, 'C4', 'Minor');
  assertEqual(synth.heldNotes.size, 3);

  synth.allNotesOff();
  assertEqual(synth.heldNotes.size, 0, 'All notes should be released');
});
