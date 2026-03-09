// Tests for PatchRouter — validates audio graph routing logic.
//
// CROSS-FILE DEPENDENCY COVERAGE:
// - Tests that connect/disconnect correctly call Web Audio node.connect/disconnect
// - Tests that jack type validation prevents output→output and input→input
// - Tests that duplicate connections are handled gracefully
// - Tests that AudioParam CV connections use .connect(param) not .connect(node)

import { suite, test, assert, assertEqual } from './test-runner.js';
import { setupGlobalMocks, MockAudioNode, MockAudioParam } from './mocks.js';
setupGlobalMocks();

import { PatchRouter } from '../js/patch-router.js';

function freshRouter() {
  return new PatchRouter();
}

function mockOutputJack(id) {
  return { id, node: new MockAudioNode(id), type: 'output' };
}

function mockInputJack(id) {
  return { id, node: new MockAudioNode(id), type: 'input' };
}

function mockCVJack(id) {
  return { id, node: null, type: 'input', param: new MockAudioParam() };
}

// ─── Registration ───────────────────────────────────────

suite('PatchRouter — jack registration');

test('registerJack stores jack data', () => {
  const r = freshRouter();
  const node = new MockAudioNode('vco1');
  r.registerJack('vco1-out', node, 'output', { label: 'VCO 1 Out' });

  const jack = r.getJack('vco1-out');
  assert(jack, 'Jack should be retrievable');
  assertEqual(jack.node, node, 'Node reference');
  assertEqual(jack.type, 'output', 'Jack type');
  assertEqual(jack.label, 'VCO 1 Out', 'Jack label');
});

test('registerJack with param option stores param', () => {
  const r = freshRouter();
  const param = new MockAudioParam(440);
  r.registerJack('filter-cutoff-cv', null, 'input', { param, label: 'Cutoff CV' });

  const jack = r.getJack('filter-cutoff-cv');
  assertEqual(jack.param, param, 'Param reference');
  assertEqual(jack.node, null, 'Node should be null for CV');
});

test('getJack returns undefined for unregistered jack', () => {
  const r = freshRouter();
  assertEqual(r.getJack('nonexistent'), undefined);
});

test('registerJack overwrites existing jack with same ID', () => {
  const r = freshRouter();
  const node1 = new MockAudioNode('old');
  const node2 = new MockAudioNode('new');
  r.registerJack('jack-1', node1, 'output');
  r.registerJack('jack-1', node2, 'output');

  assertEqual(r.getJack('jack-1').node, node2, 'Should use latest node');
});

// ─── Connection ─────────────────────────────────────────

suite('PatchRouter — connect');

test('connect output to input succeeds', () => {
  const r = freshRouter();
  const src = mockOutputJack('src');
  const dst = mockInputJack('dst');
  r.registerJack(src.id, src.node, src.type);
  r.registerJack(dst.id, dst.node, dst.type);

  const result = r.connect(src.id, dst.id);
  assertEqual(result, true, 'Should return true');
  assert(src.node.isConnectedTo(dst.node), 'Source should connect to dest node');
});

test('connect to AudioParam (CV input) uses param', () => {
  const r = freshRouter();
  const src = mockOutputJack('lfo-out');
  const dst = mockCVJack('filter-cutoff-cv');
  r.registerJack(src.id, src.node, src.type);
  r.registerJack(dst.id, dst.node, dst.type, { param: dst.param });

  const result = r.connect(src.id, dst.id);
  assertEqual(result, true);
  assert(src.node.isConnectedTo(dst.param), 'Should connect to param, not node');
});

test('connect fails with missing source jack', () => {
  const r = freshRouter();
  const dst = mockInputJack('dst');
  r.registerJack(dst.id, dst.node, dst.type);

  const result = r.connect('missing', dst.id);
  assertEqual(result, false);
});

test('connect fails with missing dest jack', () => {
  const r = freshRouter();
  const src = mockOutputJack('src');
  r.registerJack(src.id, src.node, src.type);

  const result = r.connect(src.id, 'missing');
  assertEqual(result, false);
});

test('connect rejects output→output', () => {
  const r = freshRouter();
  const a = mockOutputJack('out1');
  const b = mockOutputJack('out2');
  r.registerJack(a.id, a.node, a.type);
  r.registerJack(b.id, b.node, b.type);

  const result = r.connect(a.id, b.id);
  assertEqual(result, false, 'Should reject output→output');
});

test('connect rejects input→input', () => {
  const r = freshRouter();
  const a = mockInputJack('in1');
  const b = mockInputJack('in2');
  r.registerJack(a.id, a.node, a.type);
  r.registerJack(b.id, b.node, b.type);

  const result = r.connect(a.id, b.id);
  assertEqual(result, false, 'Should reject input→input');
});

test('connect rejects input→output (wrong direction)', () => {
  const r = freshRouter();
  const inp = mockInputJack('in');
  const out = mockOutputJack('out');
  r.registerJack(inp.id, inp.node, inp.type);
  r.registerJack(out.id, out.node, out.type);

  const result = r.connect(inp.id, out.id);
  assertEqual(result, false, 'Should reject input→output');
});

test('duplicate connection returns true without double-connecting', () => {
  const r = freshRouter();
  const src = mockOutputJack('src');
  const dst = mockInputJack('dst');
  r.registerJack(src.id, src.node, src.type);
  r.registerJack(dst.id, dst.node, dst.type);

  r.connect(src.id, dst.id);
  const initialConnections = src.node._connectedTo.length;

  const result = r.connect(src.id, dst.id);
  assertEqual(result, true, 'Should return true for existing connection');
  assertEqual(src.node._connectedTo.length, initialConnections, 'Should not add duplicate');
});

test('connections are tracked in getConnections()', () => {
  const r = freshRouter();
  const src = mockOutputJack('src');
  const dst1 = mockInputJack('dst1');
  const dst2 = mockInputJack('dst2');
  r.registerJack(src.id, src.node, src.type);
  r.registerJack(dst1.id, dst1.node, dst1.type);
  r.registerJack(dst2.id, dst2.node, dst2.type);

  r.connect(src.id, dst1.id);
  r.connect(src.id, dst2.id);

  const conns = r.getConnections();
  assertEqual(conns.length, 2, 'Should have 2 connections');
});

// ─── Disconnection ──────────────────────────────────────

suite('PatchRouter — disconnect');

test('disconnect removes audio connection', () => {
  const r = freshRouter();
  const src = mockOutputJack('src');
  const dst = mockInputJack('dst');
  r.registerJack(src.id, src.node, src.type);
  r.registerJack(dst.id, dst.node, dst.type);

  r.connect(src.id, dst.id);
  r.disconnect(src.id, dst.id);

  const conns = r.getConnections();
  assertEqual(conns.length, 0, 'Should have 0 connections');
});

test('disconnect on non-existent connection is safe', () => {
  const r = freshRouter();
  // Should not throw
  r.disconnect('a', 'b');
});

test('disconnectAll removes all connections', () => {
  const r = freshRouter();
  const src = mockOutputJack('src');
  const d1 = mockInputJack('d1');
  const d2 = mockInputJack('d2');
  r.registerJack(src.id, src.node, src.type);
  r.registerJack(d1.id, d1.node, d1.type);
  r.registerJack(d2.id, d2.node, d2.type);

  r.connect(src.id, d1.id);
  r.connect(src.id, d2.id);
  assertEqual(r.getConnections().length, 2);

  r.disconnectAll();
  assertEqual(r.getConnections().length, 0, 'All connections should be removed');
});

test('disconnect CV param connection', () => {
  const r = freshRouter();
  const src = mockOutputJack('lfo');
  const dst = mockCVJack('cutoff-cv');
  r.registerJack(src.id, src.node, src.type);
  r.registerJack(dst.id, dst.node, dst.type, { param: dst.param });

  r.connect(src.id, dst.id);
  r.disconnect(src.id, dst.id);
  assertEqual(r.getConnections().length, 0);
});

// ─── Connection map key format ──────────────────────────

suite('PatchRouter — connection key consistency');

test('connection key uses arrow format src->dst', () => {
  const r = freshRouter();
  const src = mockOutputJack('vco1-out');
  const dst = mockInputJack('drive-in');
  r.registerJack(src.id, src.node, src.type);
  r.registerJack(dst.id, dst.node, dst.type);

  r.connect(src.id, dst.id);

  // Access internal map to verify key format
  const hasKey = r.connections.has('vco1-out->drive-in');
  assert(hasKey, 'Internal key should be "src->dst"');
});

// ─── Jack ID contract (cross-file dependency) ───────────

suite('PatchRouter — jack ID contract');

test('jack IDs must be strings', () => {
  const r = freshRouter();
  const node = new MockAudioNode('test');
  // This should work with string IDs
  r.registerJack('test-out', node, 'output');
  assert(r.getJack('test-out'), 'String jack ID should work');
});

test('multiple outputs can connect to same input (fan-in)', () => {
  const r = freshRouter();
  const src1 = mockOutputJack('vco1-out');
  const src2 = mockOutputJack('vco2-out');
  const dst = mockInputJack('drive-in');
  r.registerJack(src1.id, src1.node, src1.type);
  r.registerJack(src2.id, src2.node, src2.type);
  r.registerJack(dst.id, dst.node, dst.type);

  assertEqual(r.connect(src1.id, dst.id), true, 'First fan-in');
  assertEqual(r.connect(src2.id, dst.id), true, 'Second fan-in');
  assertEqual(r.getConnections().length, 2);
});

test('one output can connect to multiple inputs (fan-out)', () => {
  const r = freshRouter();
  const src = mockOutputJack('filter-out');
  const d1 = mockInputJack('dry-in');
  const d2 = mockInputJack('delay-in');
  r.registerJack(src.id, src.node, src.type);
  r.registerJack(d1.id, d1.node, d1.type);
  r.registerJack(d2.id, d2.node, d2.type);

  assertEqual(r.connect(src.id, d1.id), true);
  assertEqual(r.connect(src.id, d2.id), true);
  assertEqual(r.getConnections().length, 2);
});
