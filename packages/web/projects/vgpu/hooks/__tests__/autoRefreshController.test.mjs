// Run with: pnpm --filter hami-webui-web run test:hooks
// (plain `node --test`, no extra dependencies; the controller has no Vue import).
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  createAutoRefresh,
  DEFAULT_AUTO_REFRESH_INTERVAL_MS,
} from '../autoRefreshController.mjs';

// Deterministic replacement for setTimeout/clearTimeout.
const createFakeTimers = () => {
  let now = 0;
  let nextId = 1;
  const pending = new Map();
  return {
    setTimeoutFn: (fn, ms) => {
      const id = nextId++;
      pending.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeoutFn: (id) => {
      pending.delete(id);
    },
    pendingCount: () => pending.size,
    nextDelay: () => {
      const ats = [...pending.values()].map((t) => t.at - now);
      return ats.length ? Math.min(...ats) : undefined;
    },
    async advance(ms) {
      const target = now + ms;
      // Fire timers in order, flushing microtasks between them so chained
      // scheduling inside callbacks is observed.
      for (;;) {
        const due = [...pending.entries()]
          .filter(([, t]) => t.at <= target)
          .sort((a, b) => a[1].at - b[1].at);
        if (!due.length) break;
        const [id, timer] = due[0];
        pending.delete(id);
        now = timer.at;
        timer.fn();
        await flush();
      }
      now = target;
    },
  };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

const createFakeDocument = (visibilityState = 'visible') => {
  const listeners = new Set();
  return {
    visibilityState,
    addEventListener(type, fn) {
      if (type === 'visibilitychange') listeners.add(fn);
    },
    removeEventListener(type, fn) {
      if (type === 'visibilitychange') listeners.delete(fn);
    },
    listenerCount: () => listeners.size,
    setVisibility(state) {
      this.visibilityState = state;
      [...listeners].forEach((fn) => fn());
    },
  };
};

// A task whose completion the test controls.
const createControlledTask = () => {
  const calls = [];
  const task = (ctx) => {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    calls.push({ ctx, resolve, reject });
    return promise;
  };
  return { task, calls };
};

describe('createAutoRefresh', () => {
  let timers;
  let doc;

  beforeEach(() => {
    timers = createFakeTimers();
    doc = createFakeDocument();
  });

  const build = (task, extra = {}) =>
    createAutoRefresh(task, {
      intervalMs: 5000,
      doc,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
      ...extra,
    });

  test('default cadence is 5 seconds', () => {
    assert.equal(DEFAULT_AUTO_REFRESH_INTERVAL_MS, 5000);
  });

  test('rejects a non-function task', () => {
    assert.throws(() => createAutoRefresh(undefined), TypeError);
  });

  test('does not fire before start, then ticks every interval with background=true', async () => {
    const { task, calls } = createControlledTask();
    const ctl = build(task);
    assert.equal(timers.pendingCount(), 0);

    ctl.start();
    assert.equal(calls.length, 0, 'start() must not fetch immediately (views load on mount)');
    assert.equal(timers.nextDelay(), 5000);

    await timers.advance(5000);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].ctx, { background: true });

    calls[0].resolve();
    await flush();
    assert.equal(timers.nextDelay(), 5000);

    await timers.advance(5000);
    assert.equal(calls.length, 2);
  });

  test('never overlaps automatic requests while one is in flight', async () => {
    const { task, calls } = createControlledTask();
    const ctl = build(task);
    ctl.start();

    await timers.advance(5000);
    assert.equal(calls.length, 1);
    assert.equal(ctl.isInFlight(), true);

    // Slow response: several intervals pass without the task settling.
    await timers.advance(20000);
    assert.equal(calls.length, 1, 'no second request while the first is pending');
    assert.equal(timers.pendingCount(), 0);

    calls[0].resolve();
    await flush();
    assert.equal(ctl.isInFlight(), false);
    assert.equal(timers.nextDelay(), 5000, 'next tick is scheduled after completion');
  });

  test('stop() clears the pending timer and removes the visibility listener', async () => {
    const { task, calls } = createControlledTask();
    const ctl = build(task);
    ctl.start();
    assert.equal(doc.listenerCount(), 1);
    assert.equal(timers.pendingCount(), 1);

    ctl.stop();
    assert.equal(ctl.isActive(), false);
    assert.equal(timers.pendingCount(), 0);
    assert.equal(doc.listenerCount(), 0);

    await timers.advance(60000);
    assert.equal(calls.length, 0);
  });

  test('a request that settles after stop() does not reschedule', async () => {
    const { task, calls } = createControlledTask();
    const ctl = build(task);
    ctl.start();
    await timers.advance(5000);
    assert.equal(calls.length, 1);

    ctl.stop();
    calls[0].resolve();
    await flush();
    assert.equal(timers.pendingCount(), 0);
  });

  test('start()/stop() are idempotent', () => {
    const { task } = createControlledTask();
    const ctl = build(task);
    ctl.start();
    ctl.start();
    assert.equal(doc.listenerCount(), 1);
    assert.equal(timers.pendingCount(), 1);
    ctl.stop();
    ctl.stop();
    assert.equal(doc.listenerCount(), 0);
    assert.equal(timers.pendingCount(), 0);
  });

  test('pauses while hidden and resumes with an immediate background refresh', async () => {
    const { task, calls } = createControlledTask();
    const ctl = build(task);
    ctl.start();

    doc.setVisibility('hidden');
    assert.equal(timers.pendingCount(), 0, 'timer cleared when tab hidden');
    await timers.advance(60000);
    assert.equal(calls.length, 0, 'no polling while hidden');

    doc.setVisibility('visible');
    assert.equal(calls.length, 1, 'immediate refresh on becoming visible');
    assert.deepEqual(calls[0].ctx, { background: true });

    calls[0].resolve();
    await flush();
    assert.equal(timers.nextDelay(), 5000, 'regular cadence resumes');
  });

  test('starting while hidden waits for visibility', async () => {
    doc = createFakeDocument('hidden');
    const { task, calls } = createControlledTask();
    const ctl = build(task);
    ctl.start();
    assert.equal(timers.pendingCount(), 0);

    doc.setVisibility('visible');
    assert.equal(calls.length, 1);
  });

  test('becoming visible during an in-flight request does not start a second one', async () => {
    const { task, calls } = createControlledTask();
    const ctl = build(task);
    ctl.start();
    await timers.advance(5000);
    assert.equal(calls.length, 1);

    doc.setVisibility('hidden');
    doc.setVisibility('visible');
    assert.equal(calls.length, 1);

    calls[0].resolve();
    await flush();
    assert.equal(timers.nextDelay(), 5000);
  });

  test('visibility changes after stop() are ignored', () => {
    const { task, calls } = createControlledTask();
    const ctl = build(task);
    ctl.start();
    ctl.stop();
    doc.setVisibility('hidden');
    doc.setVisibility('visible');
    assert.equal(calls.length, 0);
  });

  test('refreshNow() runs immediately with background=false and resets the cadence', async () => {
    const { task, calls } = createControlledTask();
    const ctl = build(task);
    ctl.start();
    await timers.advance(3000);

    const p = ctl.refreshNow();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].ctx, { background: false });
    assert.equal(timers.pendingCount(), 0, 'automatic tick cancelled while manual runs');

    calls[0].resolve('ok');
    assert.equal(await p, undefined);
    assert.equal(timers.nextDelay(), 5000, 'full interval after the manual refresh');
  });

  test('refreshNow() works before start() (initial load in setup) and does not schedule', async () => {
    const { task, calls } = createControlledTask();
    const ctl = build(task);

    const p = ctl.refreshNow();
    assert.equal(calls.length, 1);
    calls[0].resolve();
    await p;
    assert.equal(timers.pendingCount(), 0, 'inactive controller never schedules');

    ctl.start();
    assert.equal(timers.nextDelay(), 5000);
  });

  test('start() while an initial manual request is in flight schedules once it settles', async () => {
    const { task, calls } = createControlledTask();
    const ctl = build(task);

    const p = ctl.refreshNow();
    ctl.start();
    assert.equal(timers.pendingCount(), 0, 'no timer while the request is pending');

    calls[0].resolve();
    await p;
    assert.equal(timers.nextDelay(), 5000);
  });

  test('refreshNow() during an in-flight request queues one run instead of overlapping', async () => {
    const { task, calls } = createControlledTask();
    const ctl = build(task);
    ctl.start();
    await timers.advance(5000);
    assert.equal(calls.length, 1);

    const p1 = ctl.refreshNow();
    const p2 = ctl.refreshNow();
    assert.equal(calls.length, 1, 'still only the in-flight request');
    assert.equal(p1, p2, 'repeated manual requests coalesce into a single queued run');

    calls[0].resolve();
    await flush();
    assert.equal(calls.length, 2, 'queued manual run starts after the first settles');
    assert.deepEqual(calls[1].ctx, { background: false });
    assert.equal(timers.pendingCount(), 0);

    calls[1].resolve();
    await p1;
    assert.equal(timers.nextDelay(), 5000);
  });

  test('manual refresh rejection propagates to the caller and keeps polling', async () => {
    const { task, calls } = createControlledTask();
    const errors = [];
    const ctl = build(task, { onError: (e) => errors.push(e) });
    ctl.start();

    const p = ctl.refreshNow();
    const boom = new Error('boom');
    calls[0].reject(boom);
    await assert.rejects(p, boom);
    assert.deepEqual(errors, [boom]);
    assert.equal(ctl.isActive(), true);
    assert.ok(timers.pendingCount() === 1);
  });

  test('background failures are swallowed and back off up to maxIntervalMs', async () => {
    const { task, calls } = createControlledTask();
    const errors = [];
    const ctl = build(task, { maxIntervalMs: 30000, onError: (e) => errors.push(e) });
    ctl.start();

    const failOnce = async () => {
      const delay = timers.nextDelay();
      await timers.advance(delay);
      calls[calls.length - 1].reject(new Error('down'));
      await flush();
      return delay;
    };

    assert.equal(await failOnce(), 5000);
    assert.equal(timers.nextDelay(), 10000);
    assert.equal(await failOnce(), 10000);
    assert.equal(timers.nextDelay(), 20000);
    assert.equal(await failOnce(), 20000);
    assert.equal(timers.nextDelay(), 30000, 'capped at maxIntervalMs');
    assert.equal(await failOnce(), 30000);
    assert.equal(timers.nextDelay(), 30000);
    assert.equal(errors.length, 4);

    // A successful run restores the base cadence.
    await timers.advance(30000);
    calls[calls.length - 1].resolve();
    await flush();
    assert.equal(timers.nextDelay(), 5000);
  });

  test('a task that throws synchronously is treated like a rejection', async () => {
    let count = 0;
    const ctl = build(() => {
      count += 1;
      throw new Error('sync');
    });
    ctl.start();
    await timers.advance(5000);
    assert.equal(count, 1);
    assert.equal(ctl.isInFlight(), false);
    assert.equal(timers.nextDelay(), 10000, 'backoff applied');
  });

  test('a synchronous (non-promise) task is supported', async () => {
    let count = 0;
    const ctl = build(() => {
      count += 1;
    });
    ctl.start();
    await timers.advance(5000);
    assert.equal(count, 1);
    assert.equal(timers.nextDelay(), 5000);
  });

  test('works without a document (SSR / non-browser) by treating the page as visible', async () => {
    const { task, calls } = createControlledTask();
    const ctl = createAutoRefresh(task, {
      intervalMs: 5000,
      doc: undefined,
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
    });
    ctl.start();
    await timers.advance(5000);
    assert.equal(calls.length, 1);
    ctl.stop();
  });
});
