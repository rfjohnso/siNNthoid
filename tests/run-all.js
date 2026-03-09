#!/usr/bin/env node

// Master test entry point. Runs all test suites in sequence and reports results.
// Usage: node tests/run-all.js

console.log('\n\x1b[1msiNNthoid Phase VCO — Test Suite\x1b[0m');
console.log('='.repeat(50));

// Import test suites (each registers tests on import)
await import('./test-state.js');
await import('./test-patch-router.js');
await import('./test-clock-bus.js');
await import('./test-synth-engine.js');
await import('./test-cross-deps.js');

// Report results
const { report } = await import('./test-runner.js');
const allPassed = report();

process.exit(allPassed ? 0 : 1);
