# siNNthoid Phase VCO

A cross-platform desktop modular synthesizer (Electron + Web Audio) featuring four phasing VCOs, a TR-808 drum machine, an MC-707 groovebox, and a virtual patch cable routing system — all in a draggable, resizable panel workspace.

Inspired by *Piano Phase* reinterpretation techniques and the hands-on workflow of Eurorack modular synthesis.

## Features

### Modular Workspace
- **Draggable, resizable panels** — freely arrange 8 module panels on a freeform workspace
- **Virtual patch cables** — SVG cables with realistic catenary droop connect output jacks to input jacks
- **8 cable colors** — red, yellow, blue, green, orange, purple, white, black
- **Fully modular routing** — no hidden connections; what you see patched is what you hear
- **Layout persistence** — panel positions and cable connections saved to localStorage

### 4 VCO Phase Synthesizer
- 4 independent VCO lanes with waveform, level, octave, detune, pan
- Per-VCO phase offset, start delay, and drift per step (ms)
- Reich-style phasing sequencer with shared melodic cell
- Global BPM, swing, gate, humanize, phase spread, transpose
- ADSR envelope, low-pass filter + resonance, drive, delay, LFO

### TR-808 Drum Machine
- **12 instruments** synthesized entirely via Web Audio (no samples):
  kick, snare, clap, closed hi-hat, open hi-hat, low/mid/high tom, rimshot, cowbell, cymbal, maracas
- **16-step sequencer** with A/B pattern switching
- Per-instrument level and tune knobs
- Accent row with adjustable accent level
- Individual output jacks (kick, snare, hi-hat, percussion) for modular routing

### MC-707 Groovebox
- **4 tracks** with independent oscillator + filter + amp envelope
- **4 clips per track** (16 clip slots) with click-to-launch
- **Scene launcher** — trigger all 4 clips simultaneously
- **16-step note editor** — click to toggle steps, scroll to change pitch
- Per-track waveform, cutoff, volume, mute/solo controls
- Individual track output jacks for modular routing

### Patch Cable Routing
- Click an output jack and drag to an input jack to create a connection
- Cables render as SVG cubic bezier curves with gravity droop
- Right-click jacks to pick cable color before patching
- Right-click cables to change color or remove
- Click a cable to select, then press Delete to remove
- Default pre-patched cables recreate the classic signal chain on first launch:
  VCOs → Drive → Filter → Delay/Dry → Master, plus 808 and 707 into Master

### Performance & Recording
- On-screen keyboard + computer keyboard input
- Root note and scale quantization (Minor, Dorian, Major, Pentatonic)
- Phase monitor grid + oscilloscope
- In-app recording with playback and download

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

Built with `electron-builder` for Windows (NSIS + portable), macOS (DMG), and Linux (AppImage + deb).

## Quick Start

1. Launch the app — panels appear in a grid-like default layout
2. Click **Initialize Audio** to activate the audio engine and patch cables
3. Click **Start Phase Loop** to hear the 4 VCO phasing synthesizer
4. Click **Start** on the TR-808 panel to layer in drum patterns
5. Click **Start** on the MC-707 panel to add groovebox sequences
6. **Drag panel headers** to rearrange modules on the workspace
7. **Drag panel edges/corners** to resize
8. **Click output jacks → drag to input jacks** to create patch cables
9. **Right-click jacks** to pick cable colors
10. **Remove cables** to silence paths, re-route to experiment

## Keyboard Mapping

```
Z S X D C V G B H N J M , L . ; /
C C# D D# E F F# G G# A A# B C ...
```

## Phrase Cell

Edit the **Melodic Cell** textarea with comma-separated semitone offsets:

```
0,2,3,5,7,5,3,2
```

Each VCO runs the same cell with controllable time displacement to create phasing and emergent harmony.

## Architecture

The app is built as vanilla JavaScript ES modules with no framework dependencies:

```
js/
  main.js            App entry point, audio init, event wiring
  synth-engine.js    FourVCOPhasingSynth class (Web Audio)
  state.js           Shared state and configuration constants
  knob.js            Rotary knob UI component
  ui-builder.js      Panel content builders
  panel-manager.js   Draggable/resizable panel system
  cable-manager.js   SVG patch cable rendering and interaction
  patch-router.js    Web Audio graph routing engine
  clock-bus.js       Shared BPM clock for all sequencers
  drum-machine.js    TR-808 drum machine module
  groovebox.js       MC-707 groovebox module
```

## License

MIT
