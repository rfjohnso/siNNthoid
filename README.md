# siNNthoid Phase VCO

A cross-platform desktop 4 VCO synthesizer (Electron + Web Audio) focused on phase relationships, micro-timing drift, and emergent rhythmic interference inspired by *Piano Phase* reinterpretation techniques.

## Features

- 4 independent VCO lanes with:
  - `waveform` (`sine`, `triangle`, `sawtooth`, `square`)
  - `level`, `octave`, `detune`, `pan`
  - `phase offset (ms)`, `start delay (ms)`, `drift per step (ms)`
- Reich-style phasing sequencer:
  - shared melodic cell across all oscillators
  - per-VCO temporal offsets for evolving desynchronization
  - global `BPM`, `swing`, `gate`, `humanize`, `phase spread`, `transpose`
- Synth shaping:
  - ADSR envelope
  - low-pass filter + resonance
  - drive, delay, LFO (filter modulation)
- Performance tools:
  - on-screen keyboard + computer keyboard input
  - root note and scale quantization
  - phase monitor grid + oscilloscope
  - panic/all-notes-off
- Recording:
  - capture synth output in-app
  - playback and download each take

## Run

```bash
npm install
npm start
```

## Build Desktop Packages

```bash
npm run package:win
npm run package:mac
npm run package:linux
```

Built with `electron-builder` targets for Windows, macOS, and Linux.

## Performance Keyboard

Computer keys:

`Z S X D C V G B H N J M , L . ; /`

## Phrase Cell

Edit the `Melodic Cell` box with comma-separated semitone offsets, for example:

```text
0,2,3,5,7,5,3,2
```

Each VCO runs the same cell with controllable time displacement to create phasing and emergent harmony.

MIT license
