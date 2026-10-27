import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { AudioCuePlayer, MAX_RESUME_DELAY_MS } from '../docs/js/audio.js';

/** 再生予約された音の周波数を記録する AudioContext の代わり。resume() の完了はテストから操作する。 */
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {};
  scheduled = [];
  #pendingResumes = [];

  resume() {
    return new Promise((resolve) => this.#pendingResumes.push(resolve));
  }

  /** 待っている resume() をすべて完了させる */
  async finishResume() {
    this.state = 'running';
    for (const resolve of this.#pendingResumes.splice(0)) resolve();
    await new Promise((resolve) => setImmediate(resolve));
  }

  createOscillator() {
    const oscillator = {
      frequency: { value: 0 },
      connect: (node) => node,
      start: () => this.scheduled.push(oscillator.frequency.value),
      stop: () => {},
    };
    return oscillator;
  }

  createGain() {
    const param = { setValueAtTime() {}, linearRampToValueAtTime() {} };
    return { gain: param, connect: (node) => node };
  }
}

describe('AudioCuePlayer', () => {
  let context;
  let visible;
  let now;
  let player;

  beforeEach(() => {
    context = new FakeAudioContext();
    visible = true;
    now = 0;
    player = new AudioCuePlayer({ createContext: () => context, isVisible: () => visible, now: () => now });
  });

  test('合図ごとに違う音を鳴らす', () => {
    player.begin();
    player.play('workStart');
    player.play('restStart');
    player.play('count');
    player.play('finish');
    assert.deepEqual(context.scheduled, [880, 440, 660, 660, 880, 1320]);
  });

  test('begin() の前は鳴らさない', () => {
    player.play('workStart');
    assert.deepEqual(context.scheduled, []);
  });

  test('画面が非表示の間の合図は捨てる', () => {
    player.begin();
    visible = false;
    player.play('count');
    assert.deepEqual(context.scheduled, []);
  });

  test('AudioContext が止まっていたら、再開後に鳴らす', async () => {
    player.begin();
    context.state = 'suspended';
    player.play('workStart');
    assert.deepEqual(context.scheduled, []);
    await context.finishResume();
    assert.deepEqual(context.scheduled, [880]);
  });

  test('再開に時間がかかって遅れた合図は鳴らさない', async () => {
    player.begin();
    context.state = 'suspended';
    player.play('workStart');
    now += MAX_RESUME_DELAY_MS + 1;
    await context.finishResume();
    assert.deepEqual(context.scheduled, []);
  });

  test('再開待ちの間に一時停止・中止したら鳴らさない', async () => {
    player.begin();
    context.state = 'suspended';
    player.play('workStart');
    player.stop();
    await context.finishResume();
    assert.deepEqual(context.scheduled, []);
  });

  test('stop() のあとに新しく鳴らした合図は鳴る', async () => {
    player.begin();
    player.stop();
    context.state = 'suspended';
    player.play('restStart');
    await context.finishResume();
    assert.deepEqual(context.scheduled, [440]);
  });
});
