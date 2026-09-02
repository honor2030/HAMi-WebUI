// Framework-agnostic polling controller used by `useAutoRefresh`.
//
// Kept free of Vue imports so it can be unit-tested with the Node test runner
// alone, and so the timing/visibility rules live in one place.
//
// Guarantees:
// - Ticks are chained with setTimeout after the previous run settles, so two
//   automatic requests never overlap.
// - A user-initiated `refreshNow()` always runs the task (with the caller's
//   latest filters). If a run is in flight it is queued behind it instead of
//   overlapping, and the automatic cadence is restarted afterwards.
// - Polling pauses while `document.visibilityState === 'hidden'` and resumes
//   with an immediate background refresh when the page becomes visible again.
// - A failing task never stops the loop; consecutive failures back off
//   (interval doubles up to `maxIntervalMs`) so a broken backend is not
//   hammered every tick.

export const DEFAULT_AUTO_REFRESH_INTERVAL_MS = 5000;

const resolveDocument = () => (typeof document !== 'undefined' ? document : undefined);

export function createAutoRefresh(task, options = {}) {
  if (typeof task !== 'function') {
    throw new TypeError('createAutoRefresh: task must be a function');
  }

  const {
    intervalMs = DEFAULT_AUTO_REFRESH_INTERVAL_MS,
    maxIntervalMs = intervalMs * 6,
    doc = resolveDocument(),
    setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
    clearTimeoutFn = (id) => clearTimeout(id),
    onError,
  } = options;

  let active = false;
  let timerId;
  let inFlight = null;
  let queuedManual = null;
  let consecutiveErrors = 0;

  const isVisible = () => !doc || doc.visibilityState !== 'hidden';

  const clearTimer = () => {
    if (timerId !== undefined) {
      clearTimeoutFn(timerId);
      timerId = undefined;
    }
  };

  const nextDelay = () => {
    if (consecutiveErrors === 0) return intervalMs;
    const backoff = intervalMs * 2 ** Math.min(consecutiveErrors, 10);
    return Math.min(backoff, Math.max(intervalMs, maxIntervalMs));
  };

  const schedule = () => {
    clearTimer();
    if (!active || !isVisible() || inFlight) return;
    timerId = setTimeoutFn(() => {
      timerId = undefined;
      run({ background: true });
    }, nextDelay());
  };

  const run = ({ background }) => {
    if (inFlight) return inFlight;

    clearTimer();
    let settled;
    try {
      settled = Promise.resolve(task({ background }));
    } catch (error) {
      settled = Promise.reject(error);
    }

    inFlight = settled
      .then(
        () => {
          consecutiveErrors = 0;
        },
        (error) => {
          consecutiveErrors += 1;
          if (typeof onError === 'function') {
            try {
              onError(error);
            } catch {
              // never let an error handler break the loop
            }
          }
          if (!background) throw error;
        },
      )
      .finally(() => {
        inFlight = null;
        if (queuedManual) {
          const { resolve, reject } = queuedManual;
          queuedManual = null;
          run({ background: false }).then(resolve, reject);
        } else {
          schedule();
        }
      });

    return inFlight;
  };

  const refreshNow = () => {
    if (!inFlight) return run({ background: false });
    if (!queuedManual) {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      queuedManual = { promise, resolve, reject };
    }
    return queuedManual.promise;
  };

  const onVisibilityChange = () => {
    if (!active) return;
    if (isVisible()) {
      if (!inFlight) run({ background: true });
    } else {
      clearTimer();
    }
  };

  const start = () => {
    if (active) return;
    active = true;
    consecutiveErrors = 0;
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('visibilitychange', onVisibilityChange);
    }
    schedule();
  };

  const stop = () => {
    if (!active) return;
    active = false;
    clearTimer();
    if (doc && typeof doc.removeEventListener === 'function') {
      doc.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };

  return {
    start,
    stop,
    refreshNow,
    isActive: () => active,
    isInFlight: () => inFlight !== null,
  };
}

export default createAutoRefresh;
