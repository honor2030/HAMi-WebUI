// Pure helpers for the auto-refreshing admin pages that drive their top summary
// charts (TabTop / previewBar) from the *same* polling controller as the table.
// Kept free of Vue imports so they can be unit-tested with the Node test runner.

// Runs every task and waits until ALL of them have settled, then rejects with
// the first rejection reason (or resolves with the values).
//
// Why not Promise.all: it rejects as soon as one task fails while the others
// are still in flight. The polling controller would then schedule the next
// tick and the still-running request could overlap the next one. Waiting for
// all of them keeps the "no overlapping automatic requests" guarantee while
// still surfacing the failure so the controller backs off.
export async function settleAll(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const results = await Promise.allSettled(
    list.map((task) => {
      if (typeof task === 'function') {
        try {
          return Promise.resolve(task());
        } catch (error) {
          return Promise.reject(error);
        }
      }
      return Promise.resolve(task);
    }),
  );
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
  return results.map((result) => result.value);
}

// Order-sensitive comparison of `{ name, value }` series. Used so a background
// tick only replaces chart data (and thus re-renders / re-initialises the
// chart) when something actually changed.
export function sameNameValueSeries(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i] || {};
    const right = b[i] || {};
    if (left.name !== right.name) return false;
    if (Number(left.value) !== Number(right.value)) return false;
  }
  return true;
}

export default settleAll;
