// Minimal test runner — no external dependencies.
// Runs all test suites, reports pass/fail, and exits with appropriate code.

let passed = 0;
let failed = 0;
let currentSuite = '';
const failures = [];

export function suite(name) {
  currentSuite = name;
  console.log(`\n\x1b[1m  ${name}\x1b[0m`);
}

export function test(description, fn) {
  try {
    fn();
    passed += 1;
    console.log(`    \x1b[32m\u2713\x1b[0m ${description}`);
  } catch (e) {
    failed += 1;
    const msg = e.message || String(e);
    console.log(`    \x1b[31m\u2717\x1b[0m ${description}`);
    console.log(`      \x1b[31m${msg}\x1b[0m`);
    failures.push({ suite: currentSuite, test: description, error: msg });
  }
}

export function assert(condition, message = 'Assertion failed') {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEqual(actual, expected, label = '') {
  if (actual !== expected) {
    throw new Error(
      `${label ? label + ': ' : ''}Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

export function assertDeepEqual(actual, expected, label = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(
      `${label ? label + ': ' : ''}Expected ${b}, got ${a}`
    );
  }
}

export function assertThrows(fn, label = '') {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = true;
  }
  if (!threw) {
    throw new Error(`${label ? label + ': ' : ''}Expected function to throw`);
  }
}

export function assertApprox(actual, expected, tolerance = 0.001, label = '') {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `${label ? label + ': ' : ''}Expected ~${expected} (\u00b1${tolerance}), got ${actual}`
    );
  }
}

export function report() {
  console.log('\n' + '\u2500'.repeat(50));
  console.log(`  \x1b[32m${passed} passing\x1b[0m`);
  if (failed > 0) {
    console.log(`  \x1b[31m${failed} failing\x1b[0m\n`);
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}) ${f.suite} > ${f.test}`);
      console.log(`     \x1b[31m${f.error}\x1b[0m\n`);
    });
  } else {
    console.log('');
  }
  return failed === 0;
}
