// Tests for ClockBus — validates shared transport, subscriber dispatch, and timing.
//
// CROSS-FILE DEPENDENCY COVERAGE:
// - ClockBus reads state.knobs.global.bpm and state.knobs.global.swing
//   If those property names change in state.js, ClockBus silently uses fallback defaults.
// - DrumMachine808 and Groovebox707 subscribe via clockBus.subscribe(callback).
//   Tests verify the callback contract: { step, step16, time, baseStep, swing, bpm }.

import { suite, test, assert, assertEqual, assertApprox } from './test-runner.js';
import { setupGlobalMocks, MockAudioContext } from './mocks.js';
setupGlobalMocks();

import { ClockBus } from '../js/clock-bus.js';

function makeState(bpm = 120, swing = 0) {
  return {
    knobs: {
      global: { bpm, swing }
    }
  };
}

function makeBus(bpm = 120, swing = 0) {
  const state = makeState(bpm, swing);
  const bus = new ClockBus(state);
  bus.setAudioContext(new MockAudioContext());
  return { bus, state };
}

// ─── Construction & setup ────────────────────────────────

suite('ClockBus — construction');

test('starts in stopped state', () => {
  const { bus } = makeBus();
  assertEqual(bus.running, false);
  assertEqual(bus.step, 0);
});

test('setAudioContext stores context', () => {
  const bus = new ClockBus(makeState());
  const ctx = new MockAudioContext();
  bus.setAudioContext(ctx);
  assertEqual(bus.ctx, ctx);
});

// ─── BPM and timing ─────────────────────────────────────

suite('ClockBus — BPM and step duration');

test('getBpm reads from state', () => {
  const { bus } = makeBus(140);
  assertEqual(bus.getBpm(), 140);
});

test('getBpm clamps to minimum 30', () => {
  const state = makeState(10);
  const bus = new ClockBus(state);
  assertEqual(bus.getBpm(), 30);
});

test('getBpm uses fallback 112 if bpm is falsy', () => {
  const state = { knobs: { global: {} } };
  const bus = new ClockBus(state);
  assertEqual(bus.getBpm(), 112);
});

test('getStepDuration is correct for 120 BPM', () => {
  const { bus } = makeBus(120);
  // 60 / 120 / 2 = 0.25 seconds per step
  assertApprox(bus.getStepDuration(), 0.25, 0.001);
});

test('getStepDuration is correct for 60 BPM', () => {
  const { bus } = makeBus(60);
  // 60 / 60 / 2 = 0.5 seconds per step
  assertApprox(bus.getStepDuration(), 0.5, 0.001);
});

test('getSwing reads from state', () => {
  const { bus } = makeBus(120, 0.15);
  assertApprox(bus.getSwing(), 0.15, 0.001);
});

test('getSwing returns 0 if swing is undefined', () => {
  const state = { knobs: { global: { bpm: 120 } } };
  const bus = new ClockBus(state);
  assertEqual(bus.getSwing(), 0);
});

// ─── Subscriber system ──────────────────────────────────

suite('ClockBus — subscriber management');

test('subscribe adds callback', () => {
  const { bus } = makeBus();
  let called = false;
  bus.subscribe(() => { called = true; });
  assertEqual(bus.subscribers.length, 1);
});

test('subscribe returns unsubscribe function', () => {
  const { bus } = makeBus();
  const unsub = bus.subscribe(() => {});
  assertEqual(typeof unsub, 'function');
  assertEqual(bus.subscribers.length, 1);

  unsub();
  assertEqual(bus.subscribers.length, 0);
});

test('multiple subscribers are all stored', () => {
  const { bus } = makeBus();
  bus.subscribe(() => {});
  bus.subscribe(() => {});
  bus.subscribe(() => {});
  assertEqual(bus.subscribers.length, 3);
});

test('unsubscribe only removes the specific callback', () => {
  const { bus } = makeBus();
  const fn1 = () => {};
  const fn2 = () => {};
  bus.subscribe(fn1);
  const unsub2 = bus.subscribe(fn2);

  unsub2();
  assertEqual(bus.subscribers.length, 1);
  assertEqual(bus.subscribers[0], fn1);
});

// ─── Tick and event dispatch ─────────────────────────────

suite('ClockBus — tick dispatch');

test('tick dispatches event to subscribers', () => {
  const { bus } = makeBus(120, 0);
  bus.running = true;
  bus.nextTime = bus.ctx.currentTime; // ensure tick fires

  const events = [];
  bus.subscribe((ev) => events.push(ev));

  bus.tick();

  assert(events.length > 0, 'Should dispatch at least one event');
});

test('tick event has required properties', () => {
  const { bus } = makeBus(120, 0);
  bus.running = true;
  bus.nextTime = bus.ctx.currentTime;

  let event = null;
  bus.subscribe((ev) => { event = ev; });
  bus.tick();

  assert(event, 'Event should be dispatched');
  assert('step' in event, 'Event needs step');
  assert('step16' in event, 'Event needs step16');
  assert('time' in event, 'Event needs time');
  assert('baseStep' in event, 'Event needs baseStep');
  assert('swing' in event, 'Event needs swing');
  assert('bpm' in event, 'Event needs bpm');
});

test('step16 wraps around at 16', () => {
  const { bus } = makeBus(120, 0);
  bus.running = true;
  bus.step = 17;
  bus.nextTime = bus.ctx.currentTime;

  let event = null;
  bus.subscribe((ev) => { event = ev; });
  bus.tick();

  assertEqual(event.step16, 17 % 16, 'step16 should be step % 16');
});

test('swing applies to odd steps only', () => {
  const { bus } = makeBus(120, 0.2);
  bus.running = true;

  const events = [];
  bus.subscribe((ev) => events.push(ev));

  // Fire multiple steps by advancing time far ahead
  bus.nextTime = bus.ctx.currentTime - 1; // way in the past
  bus.ctx.currentTime = 10; // way in the future
  bus.tick();

  // Check that even steps have 0 swing, odd steps have swing
  const evenEvents = events.filter((e) => e.step % 2 === 0);
  const oddEvents = events.filter((e) => e.step % 2 === 1);

  evenEvents.forEach((e) => {
    assertApprox(e.swing, 0, 0.001, `Even step ${e.step} swing`);
  });
  oddEvents.forEach((e) => {
    assert(e.swing > 0, `Odd step ${e.step} should have swing > 0`);
  });
});

test('tick does nothing when not running', () => {
  const { bus } = makeBus();
  bus.running = false;
  bus.nextTime = bus.ctx.currentTime;

  let called = false;
  bus.subscribe(() => { called = true; });
  bus.tick();

  assertEqual(called, false, 'Should not dispatch when stopped');
});

test('tick does nothing without audio context', () => {
  const state = makeState();
  const bus = new ClockBus(state);
  bus.running = true;
  bus.nextTime = 0;

  let called = false;
  bus.subscribe(() => { called = true; });
  bus.tick();

  assertEqual(called, false, 'Should not dispatch without ctx');
});

test('subscriber error does not stop other subscribers', () => {
  const { bus } = makeBus(120, 0);
  bus.running = true;
  bus.nextTime = bus.ctx.currentTime;

  let secondCalled = false;
  bus.subscribe(() => { throw new Error('boom'); });
  bus.subscribe(() => { secondCalled = true; });

  // Suppress console.error for this test
  const origError = console.error;
  console.error = () => {};
  bus.tick();
  console.error = origError;

  assert(secondCalled, 'Second subscriber should still be called');
});

// ─── Start / Stop ────────────────────────────────────────

suite('ClockBus — start/stop');

test('start sets running to true', () => {
  const { bus } = makeBus();
  bus.start();
  assertEqual(bus.running, true);
});

test('start resets step to 0', () => {
  const { bus } = makeBus();
  bus.step = 42;
  bus.start();
  assertEqual(bus.step, 0);
});

test('start does nothing without audio context', () => {
  const state = makeState();
  const bus = new ClockBus(state);
  bus.start();
  assertEqual(bus.running, false, 'Should not start without ctx');
});

test('start is idempotent when already running', () => {
  const { bus } = makeBus();
  bus.start();
  const firstScheduler = bus.scheduler;
  bus.start(); // should not create another interval
  // Should still be running (just a no-op)
  assertEqual(bus.running, true);
});

test('stop sets running to false', () => {
  const { bus } = makeBus();
  bus.start();
  bus.stop();
  assertEqual(bus.running, false);
});

test('stop resets step to 0', () => {
  const { bus } = makeBus();
  bus.start();
  bus.step = 42;
  bus.stop();
  assertEqual(bus.step, 0);
});

test('stop clears scheduler', () => {
  const { bus } = makeBus();
  bus.start();
  assert(bus.scheduler !== null, 'Should have scheduler after start');
  bus.stop();
  assertEqual(bus.scheduler, null, 'Scheduler should be null after stop');
});
