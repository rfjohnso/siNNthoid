// Tests for state.js — validates constants, initial state shape, and data integrity.

import { suite, test, assert, assertEqual, assertDeepEqual } from './test-runner.js';
import { setupGlobalMocks } from './mocks.js';
setupGlobalMocks();

import {
  NOTE_TO_MIDI, SCALES, GLOBAL_KNOBS, FX_KNOBS,
  VCO_CONFIG, KEYBOARD_MAP, state
} from '../js/state.js';

suite('state.js — NOTE_TO_MIDI');

test('contains all 8 notes C3 through C4', () => {
  const expected = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4'];
  expected.forEach((note) => {
    assert(note in NOTE_TO_MIDI, `Missing note: ${note}`);
  });
});

test('MIDI values are in ascending order', () => {
  const vals = Object.values(NOTE_TO_MIDI);
  for (let i = 1; i < vals.length; i++) {
    assert(vals[i] > vals[i - 1], `Value at index ${i} not ascending: ${vals[i]} <= ${vals[i - 1]}`);
  }
});

test('C4 is MIDI 60 (middle C)', () => {
  assertEqual(NOTE_TO_MIDI.C4, 60);
});

test('A3 is MIDI 57', () => {
  assertEqual(NOTE_TO_MIDI.A3, 57);
});

suite('state.js — SCALES');

test('contains Minor, Dorian, Major, Pentatonic', () => {
  ['Minor', 'Dorian', 'Major', 'Pentatonic'].forEach((s) => {
    assert(s in SCALES, `Missing scale: ${s}`);
  });
});

test('all scales start at 0 (root)', () => {
  Object.entries(SCALES).forEach(([name, intervals]) => {
    assertEqual(intervals[0], 0, `Scale ${name} should start at 0`);
  });
});

test('all scale intervals are 0..11', () => {
  Object.entries(SCALES).forEach(([name, intervals]) => {
    intervals.forEach((val) => {
      assert(val >= 0 && val <= 11, `Scale ${name} has out-of-range interval: ${val}`);
    });
  });
});

test('Minor has 7 intervals', () => {
  assertEqual(SCALES.Minor.length, 7);
});

test('Pentatonic has 5 intervals', () => {
  assertEqual(SCALES.Pentatonic.length, 5);
});

test('Major scale matches expected intervals', () => {
  assertDeepEqual(SCALES.Major, [0, 2, 4, 5, 7, 9, 11]);
});

suite('state.js — GLOBAL_KNOBS');

test('has BPM knob', () => {
  const bpm = GLOBAL_KNOBS.find((k) => k.id === 'bpm');
  assert(bpm, 'BPM knob not found');
  assertEqual(bpm.min, 40, 'BPM min');
  assertEqual(bpm.max, 220, 'BPM max');
  assertEqual(bpm.value, 112, 'BPM default');
});

test('has masterGain knob', () => {
  const mg = GLOBAL_KNOBS.find((k) => k.id === 'masterGain');
  assert(mg, 'masterGain knob not found');
  assert(mg.min >= 0, 'masterGain min >= 0');
  assert(mg.max <= 2, 'masterGain max reasonable');
});

test('all knobs have required properties', () => {
  GLOBAL_KNOBS.forEach((k) => {
    ['id', 'label', 'min', 'max', 'step', 'value'].forEach((prop) => {
      assert(prop in k, `Global knob ${k.id || '?'} missing ${prop}`);
    });
    assert(k.value >= k.min && k.value <= k.max,
      `Global knob ${k.id} default (${k.value}) out of range [${k.min}, ${k.max}]`);
  });
});

suite('state.js — FX_KNOBS');

test('all FX knobs have valid defaults in range', () => {
  FX_KNOBS.forEach((k) => {
    assert(k.value >= k.min && k.value <= k.max,
      `FX knob ${k.id} default (${k.value}) out of range [${k.min}, ${k.max}]`);
  });
});

test('attack knob minimum > 0 (prevent clicks)', () => {
  const attack = FX_KNOBS.find((k) => k.id === 'attack');
  assert(attack.min > 0, `Attack min should be > 0, got ${attack.min}`);
});

test('delay feedback max < 1 (prevent infinite feedback)', () => {
  const fb = FX_KNOBS.find((k) => k.id === 'delayFeedback');
  assert(fb.max < 1, `Delay feedback max should be < 1, got ${fb.max}`);
});

suite('state.js — VCO_CONFIG');

test('has exactly 4 VCOs', () => {
  assertEqual(VCO_CONFIG.length, 4);
});

test('VCOs have sequential indices', () => {
  VCO_CONFIG.forEach((vco, i) => {
    assertEqual(vco.idx, i, `VCO ${i} index`);
  });
});

test('all VCOs have required properties', () => {
  VCO_CONFIG.forEach((vco) => {
    ['idx', 'waveform', 'level', 'octave', 'detune', 'pan', 'phaseMs', 'delayMs', 'driftMs']
      .forEach((prop) => {
        assert(prop in vco, `VCO ${vco.idx} missing ${prop}`);
      });
  });
});

test('VCO pan values span left-to-right', () => {
  assert(VCO_CONFIG[0].pan < 0, 'VCO 0 should pan left');
  assert(VCO_CONFIG[3].pan > 0, 'VCO 3 should pan right');
});

test('VCO 0 has no drift (reference oscillator)', () => {
  assertEqual(VCO_CONFIG[0].driftMs, 0);
});

suite('state.js — KEYBOARD_MAP');

test('maps lowercase keys to MIDI values', () => {
  assert('z' in KEYBOARD_MAP, 'z should be mapped');
  assert('m' in KEYBOARD_MAP, 'm should be mapped');
});

test('MIDI values are in playable range (24-96)', () => {
  Object.entries(KEYBOARD_MAP).forEach(([key, midi]) => {
    assert(midi >= 24 && midi <= 96, `Key ${key} -> ${midi} out of range`);
  });
});

test('no duplicate MIDI values', () => {
  const values = Object.values(KEYBOARD_MAP);
  const unique = new Set(values);
  assertEqual(values.length, unique.size, 'MIDI values should be unique');
});

suite('state.js — initial state object');

test('audioReady starts false', () => {
  assertEqual(state.audioReady, false);
});

test('state.knobs has global and fx objects', () => {
  assert('global' in state.knobs, 'state.knobs.global');
  assert('fx' in state.knobs, 'state.knobs.fx');
});

test('state.vcos is a deep copy of VCO_CONFIG', () => {
  assertEqual(state.vcos.length, VCO_CONFIG.length);
  // Verify it's a copy, not a reference
  state.vcos[0].level = 999;
  assert(VCO_CONFIG[0].level !== 999, 'state.vcos should be a deep copy');
  state.vcos[0].level = VCO_CONFIG[0].level; // restore
});

test('parsedCell has 8 elements', () => {
  assertEqual(state.parsedCell.length, 8);
});

test('keyboardPressed starts empty', () => {
  assertEqual(state.keyboardPressed.size, 0);
});
