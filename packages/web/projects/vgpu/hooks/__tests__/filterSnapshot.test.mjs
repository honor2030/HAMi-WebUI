// Run with: pnpm --filter hami-webui-web run test:hooks
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { createFilterSnapshot } from '../filterSnapshot.mjs';

// Simulates the reactive filter state of a list view.
const createLiveState = (initial) => {
  const state = { ...initial };
  return {
    state,
    compute: () => ({ ...state }),
  };
};

describe('createFilterSnapshot', () => {
  test('rejects a non-function compute', () => {
    assert.throws(() => createFilterSnapshot(), TypeError);
  });

  test('manual runs re-read the live state and commit it', () => {
    const { state, compute } = createLiveState({ name: '' });
    const snap = createFilterSnapshot(compute);
    assert.equal(snap.hasApplied(), false);

    state.name = 'train';
    assert.deepEqual(snap.forRun({ background: false }), { name: 'train' });
    assert.equal(snap.hasApplied(), true);
    assert.deepEqual(snap.current(), { name: 'train' });
  });

  test('background runs use the last applied snapshot, not in-progress edits', () => {
    const { state, compute } = createLiveState({ name: '' });
    const snap = createFilterSnapshot(compute);
    snap.apply();

    // The user types without pressing Enter / blurring.
    state.name = 'tra';
    assert.deepEqual(snap.forRun({ background: true }), { name: '' });
    state.name = 'train';
    assert.deepEqual(snap.forRun({ background: true }), { name: '' });

    // Explicit apply (Enter/blur/select change) commits the typed value…
    assert.deepEqual(snap.forRun({ background: false }), { name: 'train' });
    // …and later background ticks pick it up.
    assert.deepEqual(snap.forRun({ background: true }), { name: 'train' });
  });

  test('the snapshot is a copy: mutating live state afterwards does not leak', () => {
    const { state, compute } = createLiveState({ status: 'success', nodeName: 'node-a' });
    const snap = createFilterSnapshot(compute);
    const applied = snap.apply();
    state.status = 'failed';
    assert.deepEqual(applied, { status: 'success', nodeName: 'node-a' });
    assert.deepEqual(snap.forRun({ background: true }), { status: 'success', nodeName: 'node-a' });
  });

  test('a background run before any apply falls back to a fresh read and commits it', () => {
    const { state, compute } = createLiveState({ uid: 'gpu-1' });
    const snap = createFilterSnapshot(compute);
    assert.deepEqual(snap.forRun({ background: true }), { uid: 'gpu-1' });
    assert.equal(snap.hasApplied(), true);
    state.uid = 'gpu-2';
    assert.deepEqual(snap.forRun({ background: true }), { uid: 'gpu-1' });
  });

  test('forRun() without arguments behaves like a manual run', () => {
    const { state, compute } = createLiveState({ uid: '' });
    const snap = createFilterSnapshot(compute);
    snap.apply();
    state.uid = 'x';
    assert.deepEqual(snap.forRun(), { uid: 'x' });
  });
});
