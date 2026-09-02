// Framework-agnostic "last explicitly applied filters" holder used by the
// auto-refreshing list views together with `useAutoRefresh`.
//
// Problem: automatic ticks used to read the reactive filter state directly, so
// a user still typing in the search box saw the table re-query with a
// half-typed value every few seconds. Manual actions (Enter/blur/select
// change/prop changes) are the only moments the user expects the filters to
// take effect.
//
// `compute` must return a fresh plain value (e.g. a new object built from the
// reactive state); the snapshot is whatever it returned at the last manual
// apply, so background runs never observe in-progress edits.

export function createFilterSnapshot(compute) {
  if (typeof compute !== 'function') {
    throw new TypeError('createFilterSnapshot: compute must be a function');
  }

  let applied;
  let hasApplied = false;

  // Re-read the live state and remember it as the applied snapshot.
  const apply = () => {
    applied = compute();
    hasApplied = true;
    return applied;
  };

  // Filters to use for a run: manual runs re-read and commit; background runs
  // reuse the last applied snapshot (falling back to a fresh read only when
  // nothing has been applied yet).
  const forRun = ({ background = false } = {}) => {
    if (background && hasApplied) return applied;
    return apply();
  };

  return {
    apply,
    forRun,
    current: () => applied,
    hasApplied: () => hasApplied,
  };
}

export default createFilterSnapshot;
