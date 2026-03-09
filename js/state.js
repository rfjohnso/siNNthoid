export const NOTE_TO_MIDI = {
  C3: 48,
  D3: 50,
  E3: 52,
  F3: 53,
  G3: 55,
  A3: 57,
  B3: 59,
  C4: 60
};

export const SCALES = {
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Major: [0, 2, 4, 5, 7, 9, 11],
  Pentatonic: [0, 2, 4, 7, 9]
};

export const GLOBAL_KNOBS = [
  { id: 'bpm', label: 'BPM', min: 40, max: 220, step: 1, value: 112, unit: '' },
  { id: 'swing', label: 'Swing', min: 0, max: 0.45, step: 0.01, value: 0.08, unit: '' },
  { id: 'masterGain', label: 'Master', min: 0, max: 1.2, step: 0.01, value: 0.8, unit: '' },
  { id: 'noteLength', label: 'Gate', min: 0.08, max: 1, step: 0.01, value: 0.62, unit: '' },
  { id: 'humanize', label: 'Humanize', min: 0, max: 0.03, step: 0.001, value: 0.004, unit: 's' },
  { id: 'phaseSpread', label: 'Spread', min: 0, max: 150, step: 1, value: 18, unit: 'ms' },
  { id: 'rootTune', label: 'Transpose', min: -12, max: 12, step: 1, value: 0, unit: 'st' }
];

export const FX_KNOBS = [
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

export const VCO_CONFIG = [0, 1, 2, 3].map((idx) => ({
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

export const KEYBOARD_MAP = {
  z: 48, s: 49, x: 50, d: 51, c: 52, v: 53, g: 54,
  b: 55, h: 56, n: 57, j: 58, m: 59, ',': 60, l: 61,
  '.': 62, ';': 63, '/': 64
};

export const state = {
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
