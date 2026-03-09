// Mock implementations for Web Audio API and DOM objects.
// These provide enough surface area to test PatchRouter, ClockBus,
// DrumMachine808, Groovebox707, and synth-engine logic without a browser.

// ─── Web Audio Mocks ─────────────────────────────────────

export class MockAudioParam {
  constructor(defaultValue = 0) {
    this.value = defaultValue;
    this._connections = [];
  }
  setValueAtTime(v, t) { this.value = v; }
  linearRampToValueAtTime(v, t) { this.value = v; }
  exponentialRampToValueAtTime(v, t) { this.value = v; }
  setTargetAtTime(v, t, c) { this.value = v; }
  cancelScheduledValues(t) {}
}

export class MockAudioNode {
  constructor(label = 'node') {
    this.label = label;
    this._connectedTo = [];
    this._disconnected = false;
    this.gain = new MockAudioParam(1);
    this.frequency = new MockAudioParam(440);
    this.Q = new MockAudioParam(1);
    this.delayTime = new MockAudioParam(0);
    this.pan = new MockAudioParam(0);
    this.detune = new MockAudioParam(0);
    this.type = 'lowpass';
    this.curve = null;
    this.oversample = 'none';
    this.fftSize = 2048;
    this.onended = null;
  }

  connect(dest) {
    this._connectedTo.push(dest);
    return dest;
  }

  disconnect(dest) {
    if (dest) {
      const idx = this._connectedTo.indexOf(dest);
      if (idx >= 0) {
        this._connectedTo.splice(idx, 1);
      }
    } else {
      this._connectedTo = [];
    }
    this._disconnected = true;
  }

  start(t) {}
  stop(t) {}

  isConnectedTo(dest) {
    return this._connectedTo.includes(dest);
  }
}

export class MockAudioContext {
  constructor() {
    this.currentTime = 0.1;
    this.sampleRate = 44100;
    this.state = 'running';
    this.destination = new MockAudioNode('destination');
  }

  createGain() { return new MockAudioNode('gain'); }
  createOscillator() { return new MockAudioNode('oscillator'); }
  createBiquadFilter() { return new MockAudioNode('biquadFilter'); }
  createDelay(max) { return new MockAudioNode('delay'); }
  createWaveShaper() { return new MockAudioNode('waveShaper'); }
  createAnalyser() { return new MockAudioNode('analyser'); }
  createStereoPanner() { return new MockAudioNode('stereoPanner'); }
  createMediaStreamDestination() { return { stream: {} }; }
  createBufferSource() { return new MockAudioNode('bufferSource'); }
  createBuffer(channels, length, sampleRate) {
    return {
      getChannelData: () => new Float32Array(length)
    };
  }
  async resume() { this.state = 'running'; }
}

// ─── DOM Mocks ───────────────────────────────────────────

export class MockElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.className = '';
    this.textContent = '';
    this.title = '';
    this.dataset = {};
    this.style = {};
    this.children = [];
    this.parentElement = null;
    this.offsetParent = {}; // non-null = visible
    this._classList = new Set();
    this._listeners = {};
  }

  get classList() {
    const self = this;
    return {
      add(cls) { self._classList.add(cls); },
      remove(cls) { self._classList.delete(cls); },
      toggle(cls, force) {
        if (force !== undefined) {
          if (force) self._classList.add(cls);
          else self._classList.delete(cls);
          return force;
        }
        if (self._classList.has(cls)) {
          self._classList.delete(cls);
          return false;
        }
        self._classList.add(cls);
        return true;
      },
      contains(cls) { return self._classList.has(cls); }
    };
  }

  appendChild(child) {
    this.children.push(child);
    child.parentElement = this;
    return child;
  }

  prepend(child) {
    this.children.unshift(child);
    child.parentElement = this;
  }

  remove() {
    if (this.parentElement) {
      const idx = this.parentElement.children.indexOf(this);
      if (idx >= 0) this.parentElement.children.splice(idx, 1);
    }
  }

  querySelector(sel) { return null; }
  querySelectorAll(sel) { return []; }

  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  removeEventListener(type, fn) {
    if (this._listeners[type]) {
      this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
    }
  }

  closest(sel) { return null; }

  getBoundingClientRect() {
    return { left: 100, top: 100, width: 16, height: 16, right: 116, bottom: 116 };
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  getAttribute(name) {
    return this[name] || null;
  }
}

// ─── Minimal global mock setup ──────────────────────────

export function setupGlobalMocks() {
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
      setInterval: setInterval,
      clearInterval: clearInterval,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {}
    };
  }
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      createElement: (tag) => new MockElement(tag),
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
      createElementNS: (ns, tag) => new MockElement(tag),
      body: new MockElement('body'),
      elementFromPoint: () => null
    };
  }
  if (typeof globalThis.localStorage === 'undefined') {
    const store = {};
    globalThis.localStorage = {
      getItem: (k) => store[k] || null,
      setItem: (k, v) => { store[k] = v; },
      removeItem: (k) => { delete store[k]; },
      clear: () => { Object.keys(store).forEach((k) => delete store[k]); }
    };
  }
  if (typeof globalThis.MediaRecorder === 'undefined') {
    globalThis.MediaRecorder = class {
      static isTypeSupported() { return false; }
      constructor() { this.state = 'inactive'; }
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; }
    };
  }
}
