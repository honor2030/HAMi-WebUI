import { onMounted, onBeforeUnmount, getCurrentInstance } from 'vue';
import { createAutoRefresh, DEFAULT_AUTO_REFRESH_INTERVAL_MS } from './autoRefreshController.mjs';

export { DEFAULT_AUTO_REFRESH_INTERVAL_MS };

// Lifecycle-safe automatic refresh for active resource views (lists that must
// notice short-lived Pods without a manual click).
//
//   const fetchTableData = async ({ background = false } = {}) => { ... };
//   const { refreshNow } = useAutoRefresh(fetchTableData);
//
// - Polling starts on mount and stops before unmount.
// - The task receives `{ background: true }` on automatic ticks so callers can
//   skip loading spinners, and `{ background: false }` for `refreshNow()`.
// - Route manual refresh / filter application through `refreshNow()` so user
//   requests never overlap an automatic one and reset the cadence.
export default function useAutoRefresh(task, options = {}) {
  const controller = createAutoRefresh(task, options);

  if (getCurrentInstance()) {
    onMounted(controller.start);
    onBeforeUnmount(controller.stop);
  }

  return controller;
}
