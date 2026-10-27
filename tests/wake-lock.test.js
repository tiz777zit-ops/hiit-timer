import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { ScreenWakeLock } from '../docs/js/wake-lock.js';

class FakeSentinel extends EventTarget {
  released = false;
  /** 自分で解除したときも、OS に解除されたときも 'release' イベントが届く */
  release() {
    if (!this.released) {
      this.released = true;
      this.dispatchEvent(new Event('release'));
    }
    return Promise.resolve();
  }
}

/** request() の完了をテストから操作できる Wake Lock API の代わり */
class FakeWakeLockApi {
  requests = [];
  #waiting = [];
  request() {
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject, sentinel: new FakeSentinel() };
      this.requests.push(entry);
      this.#waiting.push(entry);
    });
  }
  /** 待っている request() をすべて完了させる */
  async grantAll() {
    for (const entry of this.#waiting.splice(0)) {
      entry.granted = true;
      entry.resolve(entry.sentinel);
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  /** 待っている request() をすべて失敗させる */
  async rejectAll() {
    for (const { reject } of this.#waiting.splice(0)) reject(new Error('NotAllowedError'));
    await new Promise((resolve) => setImmediate(resolve));
  }
  get held() {
    return this.requests.filter((r) => r.granted && !r.sentinel.released).length;
  }
}

class FakeDocument extends EventTarget {
  visibilityState = 'visible';
  setVisible(visible) {
    this.visibilityState = visible ? 'visible' : 'hidden';
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

describe('ScreenWakeLock', () => {
  let api;
  let document;
  let wakeLock;

  beforeEach(() => {
    api = new FakeWakeLockApi();
    document = new FakeDocument();
    wakeLock = new ScreenWakeLock({ api, document });
  });

  test('取得して、解除できる', async () => {
    wakeLock.acquire();
    await api.grantAll();
    assert.equal(api.held, 1);
    wakeLock.release();
    assert.equal(api.held, 0);
  });

  test('取得の完了前に解除したら、取得できた時点で手放す', async () => {
    wakeLock.acquire();
    wakeLock.release();
    await api.grantAll();
    assert.equal(api.held, 0);
  });

  test('取得中に一時停止→再開しても要求を重ねず、そのあと解除できる', async () => {
    wakeLock.acquire();
    wakeLock.release();
    wakeLock.acquire();
    await api.grantAll();
    assert.equal(api.requests.length, 1);
    assert.equal(api.held, 1);
    wakeLock.release();
    assert.equal(api.held, 0);
  });

  test('非表示で OS に解除されたら、表示に戻ったときに取り直す', async () => {
    wakeLock.acquire();
    await api.grantAll();
    api.requests[0].sentinel.released = true;
    document.setVisible(false);
    document.setVisible(true);
    await api.grantAll();
    assert.equal(api.requests.length, 2);
    assert.equal(api.held, 1);
  });

  test('解除したあとは、表示に戻っても取り直さない', async () => {
    wakeLock.acquire();
    await api.grantAll();
    wakeLock.release();
    document.setVisible(false);
    document.setVisible(true);
    assert.equal(api.requests.length, 1);
  });

  test('表示中に OS が解除したら、一度だけ取り直す', async () => {
    wakeLock.acquire();
    await api.grantAll();
    api.requests[0].sentinel.release();
    await api.grantAll();
    assert.equal(api.requests.length, 2);
    assert.equal(api.held, 1);
  });

  test('取得に失敗したら要求し続けず、表示に戻ったときに再試行する', async () => {
    wakeLock.acquire();
    await api.rejectAll();
    wakeLock.acquire();
    assert.equal(api.requests.length, 1);
    document.setVisible(false);
    document.setVisible(true);
    await api.grantAll();
    assert.equal(api.requests.length, 2);
    assert.equal(api.held, 1);
  });

  test('取得中に非表示→表示になり、その取得が失敗したら、もう一度試す', async () => {
    wakeLock.acquire();
    document.setVisible(false);
    document.setVisible(true);
    await api.rejectAll();
    assert.equal(api.requests.length, 2);
    await api.grantAll();
    assert.equal(api.held, 1);
  });

  test('API がなくても例外にしない', () => {
    const unsupported = new ScreenWakeLock({ api: undefined, document });
    assert.doesNotThrow(() => {
      unsupported.acquire();
      unsupported.release();
    });
  });
});
