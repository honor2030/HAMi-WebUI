// Run with: pnpm --filter hami-webui-web run test:hooks
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SILENT_REQUEST_KEY,
  isSilentRequest,
  withBackgroundSilence,
} from '../requestNotify.mjs';

describe('isSilentRequest', () => {
  test('is false for missing or default configs (manual requests keep toasts)', () => {
    assert.equal(isSilentRequest(undefined), false);
    assert.equal(isSilentRequest(null), false);
    assert.equal(isSilentRequest({}), false);
    assert.equal(isSilentRequest({ url: '/api/vgpu/v1/gpus', method: 'POST' }), false);
  });

  test('is true only for an explicit `silent: true`', () => {
    assert.equal(isSilentRequest({ [SILENT_REQUEST_KEY]: true }), true);
    assert.equal(isSilentRequest({ silent: false }), false);
    assert.equal(isSilentRequest({ silent: 'true' }), false);
    assert.equal(isSilentRequest({ silent: 1 }), false);
  });

  test('reads the flag off the config axios attaches to errors/responses', () => {
    const error = { message: 'timeout', config: { silent: true } };
    assert.equal(isSilentRequest(error.config), true);
    const networkErrorWithoutConfig = { message: 'Network Error' };
    assert.equal(isSilentRequest(networkErrorWithoutConfig.config), false);
  });
});

describe('withBackgroundSilence', () => {
  const base = { url: '/api/vgpu/v1/containers', method: 'POST', data: { filters: {} } };

  test('marks background requests silent without mutating the input', () => {
    const out = withBackgroundSilence(base, true);
    assert.deepEqual(out, { ...base, silent: true });
    assert.equal('silent' in base, false);
    assert.notEqual(out, base);
  });

  test('leaves manual requests non-silent', () => {
    assert.deepEqual(withBackgroundSilence(base, false), base);
    assert.deepEqual(withBackgroundSilence(base, undefined), base);
    assert.equal(isSilentRequest(withBackgroundSilence(base, false)), false);
  });
});
