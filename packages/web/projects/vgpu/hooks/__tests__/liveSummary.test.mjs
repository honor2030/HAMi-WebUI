// Run with: pnpm --filter hami-webui-web run test:hooks
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { settleAll, sameNameValueSeries } from '../liveSummary.mjs';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('settleAll', () => {
  test('resolves with every value once all tasks succeed', async () => {
    const values = await settleAll([() => 1, () => Promise.resolve(2), 3]);
    assert.deepEqual(values, [1, 2, 3]);
  });

  test('handles an empty / missing task list', async () => {
    assert.deepEqual(await settleAll([]), []);
    assert.deepEqual(await settleAll(), []);
  });

  test('waits for the slow task even when another one already failed', async () => {
    const slow = deferred();
    let settled = false;
    const run = settleAll([
      () => Promise.reject(new Error('fast failure')),
      () => slow.promise,
    ]).then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await flush();
    // Promise.all would already have rejected here; we must still be waiting.
    assert.equal(settled, false);

    slow.resolve('done');
    await run;
    assert.equal(settled, true);
  });

  test('rejects with the first rejection reason in task order', async () => {
    const first = new Error('first');
    const second = new Error('second');
    await assert.rejects(
      settleAll([() => 'ok', () => Promise.reject(first), () => Promise.reject(second)]),
      (error) => error === first,
    );
  });

  test('a synchronously throwing task is reported like a rejection', async () => {
    const boom = new Error('sync');
    await assert.rejects(
      settleAll([
        () => {
          throw boom;
        },
      ]),
      (error) => error === boom,
    );
  });
});

describe('sameNameValueSeries', () => {
  test('equal series compare equal regardless of value type', () => {
    assert.equal(
      sameNameValueSeries(
        [{ name: 'A100', value: '2' }, { name: 'H100', value: 1 }],
        [{ name: 'A100', value: 2 }, { name: 'H100', value: '1' }],
      ),
      true,
    );
    assert.equal(sameNameValueSeries([], []), true);
  });

  test('detects changed values, names, length and order', () => {
    const base = [{ name: 'A100', value: 2 }, { name: 'H100', value: 1 }];
    assert.equal(sameNameValueSeries(base, [{ name: 'A100', value: 3 }, { name: 'H100', value: 1 }]), false);
    assert.equal(sameNameValueSeries(base, [{ name: 'A100', value: 2 }, { name: 'L40', value: 1 }]), false);
    assert.equal(sameNameValueSeries(base, [{ name: 'A100', value: 2 }]), false);
    assert.equal(sameNameValueSeries(base, [{ name: 'H100', value: 1 }, { name: 'A100', value: 2 }]), false);
  });

  test('non-array inputs are never equal (except identical reference)', () => {
    assert.equal(sameNameValueSeries(undefined, []), false);
    assert.equal(sameNameValueSeries([], null), false);
    const same = [{ name: 'x', value: 1 }];
    assert.equal(sameNameValueSeries(same, same), true);
  });
});
