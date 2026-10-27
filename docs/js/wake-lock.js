// 実行中に画面が自動で消えないようにする（spec.md 3.4）。Screen Wake Lock API を使う。
// 画面が非表示になると OS が自動で解除するので、表示に戻ったときに取り直す。

export class ScreenWakeLock {
  #api;
  #isVisible;
  #sentinel = null;
  #pending = false;
  #requestAgain = false;
  #wanted = false;

  /**
   * @param {object} [options] テスト用。省略時はブラウザの API を使う。
   * @param {{ request(type: string): Promise<WakeLockSentinel> }} [options.api]
   * @param {Document} [options.document]
   */
  constructor({ api = globalThis.navigator?.wakeLock, document = globalThis.document } = {}) {
    this.#api = api;
    this.#isVisible = () => document?.visibilityState === 'visible';
    document?.addEventListener('visibilitychange', () => {
      if (this.#isVisible() && this.#wanted) this.#request();
    });
  }

  acquire() {
    if (this.#wanted) return;
    this.#wanted = true;
    this.#request();
  }

  release() {
    this.#wanted = false;
    this.#sentinel?.release().catch(() => {});
    this.#sentinel = null;
  }

  get #held() {
    return this.#sentinel !== null && !this.#sentinel.released;
  }

  async #request() {
    if (!this.#api || this.#held) return;
    // 取得中の要求があれば重ねない。代わりに、その要求が終わってからもう一度試す
    if (this.#pending) {
      this.#requestAgain = true;
      return;
    }
    this.#pending = true;
    this.#requestAgain = false;
    try {
      const sentinel = await this.#api.request('screen');
      if (this.#wanted && !this.#held) {
        this.#sentinel = sentinel;
        // 表示中に OS が解除したら（省電力など）一度だけ取り直す。非表示による解除は visibilitychange で取り直す
        sentinel.addEventListener?.('release', () => {
          if (this.#sentinel === sentinel && this.#wanted && this.#isVisible()) this.#request();
        });
      } else {
        // 取得を待っている間に不要になった
        sentinel.release().catch(() => {});
      }
    } catch {
      // 非対応・省電力モードなどで取得できなくても、タイマー自体は動かす。
      // 失敗のたびに要求し続けないよう、次に表示に戻るまで再試行しない
    } finally {
      this.#pending = false;
      if (this.#requestAgain && this.#wanted && this.#isVisible() && !this.#held) {
        this.#requestAgain = false;
        this.#request();
      }
    }
  }
}
