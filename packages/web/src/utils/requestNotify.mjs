// Pure helper shared by `request.js` and its callers. Kept free of axios /
// element-plus imports so it can be unit-tested with the Node test runner.
//
// A request marked `{ silent: true }` in its axios config opts out of the
// global error toast / notification in `request.js`. The promise still
// rejects, so the caller decides how to react. Intended for automatic
// background polling (see `~/vgpu/hooks/useAutoRefresh`), where a transient
// backend hiccup must not pop a toast every tick; user-initiated requests keep
// the default notification behaviour.

export const SILENT_REQUEST_KEY = 'silent';

// `config` is the axios request config (`response.config` / `error.config`).
// Anything other than an explicit `true` keeps notifications on.
export const isSilentRequest = (config) =>
  Boolean(config) && config[SILENT_REQUEST_KEY] === true;

// Returns a new request config with the silent flag set when `background` is
// truthy; leaves the config untouched otherwise.
export const withBackgroundSilence = (config, background) =>
  background ? { ...config, [SILENT_REQUEST_KEY]: true } : { ...config };
