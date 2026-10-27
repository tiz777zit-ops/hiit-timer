// タイマーの進行を管理する。画面・音声には依存しない。
//
// 経過時間は「一時停止までの累計 + (現在時刻 − 再開時刻)」で計算し、tick の間隔に依存しない。
// そのため、バックグラウンドで tick が止まっても、戻ったときの残り時間は正しい（spec.md 3.4）。

import { createPlan, cuesBetween, positionAt } from './plan.js';

/** 合図の予定時刻からこれ以上遅れたら、鳴らさずに捨てる（バックグラウンドから戻ったときなど）。 */
export const MAX_CUE_CATCH_UP = 1.0;
export const TICK_INTERVAL_MS = 50;

/**
 * 時計の既定値。画面ロック中に端末がスリープしてもタイマーを進めるため、
 * スリープ中に止まることがある performance.now() ではなく Date.now() を使う。
 * 端末の時刻が戻された場合に備え、経過時間は減らないようにしている（tick 参照）。
 */
const wallClockSeconds = () => Date.now() / 1000;

/**
 * @typedef {'idle' | 'running' | 'paused' | 'finished'} Status
 * @typedef {{ begin(): void, play(cue: string): void, stop(): void }} CuePlayer
 * stop() は一時停止・中止時だけ呼ぶ。完了時は完了音を最後まで鳴らすため呼ばない。
 */
export class WorkoutTimer {
  /** @type {Status} */
  status = 'idle';
  plan = null;
  elapsed = 0;

  #cuePlayer;
  #clock;
  #onChange;
  #autoTick;
  #accumulated = 0;
  #resumedAt = 0;
  #lastCueCheck = 0;
  #ticker = null;

  /**
   * @param {object} options
   * @param {CuePlayer} options.cuePlayer
   * @param {() => number} [options.clock] 秒を返す時計
   * @param {() => void} [options.onChange] 状態や経過時間が変わったときに呼ぶ
   * @param {boolean} [options.autoTick] false のときは内部タイマーを動かさない（テストで tick() を直接呼ぶため）
   */
  constructor({ cuePlayer, clock = wallClockSeconds, onChange = () => {}, autoTick = true }) {
    this.#cuePlayer = cuePlayer;
    this.#clock = clock;
    this.#onChange = onChange;
    this.#autoTick = autoTick;
  }

  get position() {
    return this.plan ? positionAt(this.plan, this.elapsed) : null;
  }

  start(settings) {
    this.plan = createPlan(settings);
    this.elapsed = 0;
    this.#accumulated = 0;
    this.#lastCueCheck = 0;
    this.#resumedAt = this.#clock();
    this.status = 'running';
    this.#cuePlayer.begin();
    // 準備時間の開始時は休憩開始音と同じ音にする（spec.md 3.3）
    this.#cuePlayer.play('restStart');
    this.#startTicking();
    this.#onChange();
  }

  pause() {
    if (this.status !== 'running') return;
    this.tick();
    if (this.status !== 'running') return;
    this.#accumulated = this.elapsed;
    this.status = 'paused';
    this.#stopTicking();
    this.#cuePlayer.stop();
    this.#onChange();
  }

  resume() {
    if (this.status !== 'paused') return;
    this.#resumedAt = this.#clock();
    this.status = 'running';
    this.#cuePlayer.begin();
    this.#startTicking();
    this.#onChange();
  }

  reset() {
    const wasActive = this.status === 'running' || this.status === 'paused';
    this.#stopTicking();
    this.status = 'idle';
    this.plan = null;
    this.elapsed = 0;
    this.#accumulated = 0;
    this.#lastCueCheck = 0;
    if (wasActive) this.#cuePlayer.stop();
    this.#onChange();
  }

  /** 経過時間を更新し、前回から今回までに来た合図を鳴らす。 */
  tick() {
    if (this.status !== 'running' || !this.plan) return;
    // 遅れの判定には終了時刻で丸める前の経過時間を使う。時刻が戻されても経過時間は減らさない。
    const rawNow = Math.max(this.elapsed, this.#accumulated + (this.#clock() - this.#resumedAt));
    const now = Math.min(rawNow, this.plan.totalDuration);
    // 同時に複数たまっていたら最後の 1 つだけ鳴らす
    const latest = cuesBetween(this.plan, this.#lastCueCheck, now).at(-1);
    if (latest && rawNow - latest.time <= MAX_CUE_CATCH_UP) {
      this.#cuePlayer.play(latest.cue);
    }
    this.#lastCueCheck = now;
    this.elapsed = now;

    if (now >= this.plan.totalDuration) {
      this.status = 'finished';
      this.#stopTicking();
    }
    this.#onChange();
  }

  #startTicking() {
    if (!this.#autoTick) return;
    this.#stopTicking();
    this.#ticker = setInterval(() => this.tick(), TICK_INTERVAL_MS);
  }

  #stopTicking() {
    if (this.#ticker !== null) clearInterval(this.#ticker);
    this.#ticker = null;
  }
}
