// 合図の音を Web Audio API のサイン波で鳴らす（spec.md 3.3）。音声ファイルは使わない。

/** 4 種類の合図はそれぞれ別の音にする。[周波数 Hz, 長さ 秒] の並び。 */
const TONES = {
  workStart: [[880, 0.45]],
  restStart: [[440, 0.45]],
  count: [[660, 0.12]],
  finish: [[660, 0.18], [880, 0.18], [1320, 0.4]],
};

const VOLUME = 0.6;
/** 音の始まりと終わりのプチッというノイズを防ぐフェード時間 */
const FADE = 0.01;
/** AudioContext の再開を待つ間に、これ以上遅れた合図は鳴らさない */
export const MAX_RESUME_DELAY_MS = 500;

export class AudioCuePlayer {
  #createContext;
  #isVisible;
  #now;
  #getAudioSession;
  #context = null;
  /** stop() のたびに増やし、再開待ちの合図を無効にする */
  #generation = 0;

  /**
   * @param {object} [options] テスト用。省略時はブラウザの API を使う。
   * @param {() => AudioContext} [options.createContext]
   * @param {() => boolean} [options.isVisible]
   * @param {() => number} [options.now] ミリ秒を返す時計
   * @param {() => ({ type: string } | undefined)} [options.getAudioSession] Audio Session API（未対応なら undefined）
   */
  constructor({
    createContext = () => new AudioContext(),
    isVisible = () => globalThis.document?.visibilityState === 'visible',
    now = () => performance.now(),
    getAudioSession = () => globalThis.navigator?.audioSession,
  } = {}) {
    this.#createContext = createContext;
    this.#isVisible = isVisible;
    this.#now = now;
    this.#getAudioSession = getAudioSession;
  }

  /** マナーモード中でも鳴らすか（spec.md 3.3）。次の begin() から反映する。 */
  ringInSilentMode = true;

  /**
   * スタート・再開ボタンの操作の中で呼ぶ。
   * iOS ではユーザーの操作の中でないと、音声を有効にできないため。
   */
  begin() {
    // 対応ブラウザのみ。playback はマナーモード中でも鳴るが、再生中の曲は止まる。
    // ambient は曲に重ねて鳴るが、マナーモード中は鳴らない
    const audioSession = this.#getAudioSession();
    if (audioSession) audioSession.type = this.ringInSilentMode ? 'playback' : 'ambient';
    this.#context ??= this.#createContext();
    if (this.#context.state !== 'running') this.#context.resume().catch(() => {});
  }

  play(cue) {
    const context = this.#context;
    const notes = TONES[cue];
    if (!context || !notes) return;
    // 画面ロック中などは鳴らない。止まった AudioContext に予約すると、戻ったときに古い合図がまとめて鳴るので捨てる
    if (!this.#isVisible()) return;
    if (context.state !== 'running') {
      // 止まっていれば再開を試み、再開できた時点で一時停止・中止されておらず、遅れも小さければ鳴らす
      const requestedAt = this.#now();
      const generation = this.#generation;
      context.resume().then(() => {
        const fresh = this.#now() - requestedAt <= MAX_RESUME_DELAY_MS;
        if (fresh && generation === this.#generation && this.#isVisible()) this.#schedule(context, notes);
      }).catch(() => {});
      return;
    }
    this.#schedule(context, notes);
  }

  /** 一時停止・中止時に呼ぶ。再開待ちの合図を鳴らさないようにする。 */
  stop() {
    this.#generation++;
  }

  #schedule(context, notes) {
    let start = context.currentTime;
    for (const [frequency, duration] of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(VOLUME, start + FADE);
      gain.gain.setValueAtTime(VOLUME, start + duration - FADE);
      gain.gain.linearRampToValueAtTime(0, start + duration);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + duration);
      start += duration;
    }
  }
}
