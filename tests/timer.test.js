import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { DEFAULT_SETTINGS } from '../docs/js/settings.js';
import { WorkoutTimer } from '../docs/js/timer.js';

class FakeCuePlayer {
  events = [];
  begin() { this.events.push('begin'); }
  play(cue) { this.events.push(`play:${cue}`); }
  stop() { this.events.push('stop'); }
}

describe('WorkoutTimer', () => {
  let player;
  let now;
  let timer;

  beforeEach(() => {
    player = new FakeCuePlayer();
    now = 1000;
    timer = new WorkoutTimer({ cuePlayer: player, clock: () => now, autoTick: false });
  });

  /** 時計を進めながら 1/16 秒ごとに tick する（2 進数で誤差なく表せる刻みにして、境界の判定をぶらさない） */
  function advance(seconds) {
    const step = 0.0625;
    for (let i = 0; i < seconds / step; i++) {
      now += step;
      timer.tick();
    }
  }

  test('スタートで準備時間に入り、休憩開始音を鳴らす', () => {
    timer.start(DEFAULT_SETTINGS);
    assert.equal(timer.status, 'running');
    assert.deepEqual(player.events, ['begin', 'play:restStart']);
    assert.deepEqual(timer.position, { phase: 'prepare', round: 1, remaining: 5 });
  });

  test('準備時間のカウントのあとワーク開始音を鳴らす', () => {
    timer.start(DEFAULT_SETTINGS);
    player.events = [];
    advance(5);
    assert.deepEqual(player.events, ['play:count', 'play:count', 'play:count', 'play:workStart']);
    assert.deepEqual(timer.position, { phase: 'work', round: 1, remaining: 20 });
  });

  test('カウントのあと休憩開始音を鳴らす', () => {
    timer.start(DEFAULT_SETTINGS);
    advance(5);
    player.events = [];
    advance(20);
    assert.deepEqual(player.events, ['play:count', 'play:count', 'play:count', 'play:restStart']);
    assert.equal(timer.position.phase, 'rest');
    assert.equal(timer.position.round, 1);
  });

  test('一時停止中は時間が止まり、再開すると準備時間を挟まずに続きから進む', () => {
    timer.start(DEFAULT_SETTINGS);
    advance(10);
    timer.pause();
    assert.equal(timer.status, 'paused');
    assert.equal(player.events.at(-1), 'stop');

    now += 60;
    timer.tick();
    assert.equal(timer.elapsed, 10);

    timer.resume();
    assert.equal(timer.status, 'running');
    assert.equal(player.events.at(-1), 'begin');
    advance(1);
    assert.equal(timer.elapsed, 11);
    assert.deepEqual(timer.position, { phase: 'work', round: 1, remaining: 14 });
  });

  test('準備時間中も一時停止・再開できる', () => {
    timer.start(DEFAULT_SETTINGS);
    advance(2);
    timer.pause();
    assert.equal(timer.status, 'paused');
    assert.deepEqual(timer.position, { phase: 'prepare', round: 1, remaining: 3 });
    timer.resume();
    advance(3);
    assert.deepEqual(timer.position, { phase: 'work', round: 1, remaining: 20 });
  });

  test('tick が間引かれても、戻ったときの残り時間は正しい', () => {
    timer.start(DEFAULT_SETTINGS);
    now += 30;
    timer.tick();
    assert.deepEqual(timer.position, { phase: 'rest', round: 1, remaining: 5 });
  });

  test('長く空いたあとは古い合図を鳴らさない', () => {
    timer.start(DEFAULT_SETTINGS);
    player.events = [];
    now += 30;
    timer.tick();
    assert.deepEqual(player.events, []);
  });

  test('tick の間隔が 1 秒以上空いても、遅れの小さい完了音は鳴らす', () => {
    timer.start({ workSeconds: 5, restSeconds: 5, rounds: 1 });
    now += 8.9;
    timer.tick();
    player.events = [];
    now += 1.2;
    timer.tick();
    assert.equal(timer.status, 'finished');
    assert.deepEqual(player.events, ['play:finish']);
  });

  test('古い完了音は、終了時刻で丸めずに実際の遅れで判定して捨てる', () => {
    timer.start({ workSeconds: 5, restSeconds: 5, rounds: 1 });
    now += 9.5;
    timer.tick();
    player.events = [];
    now += 60.5;
    timer.tick();
    assert.equal(timer.status, 'finished');
    assert.deepEqual(player.events, []);
  });

  test('端末の時刻が戻されても経過時間は減らず、合図をくり返さない', () => {
    timer.start(DEFAULT_SETTINGS);
    advance(23);
    const elapsed = timer.elapsed;
    player.events = [];
    now -= 10;
    timer.tick();
    assert.equal(timer.elapsed, elapsed);
    advance(0.5);
    assert.deepEqual(player.events, []);
  });

  test('最後まで進むと、カウントのあと完了音を鳴らして終わる', () => {
    timer.start({ workSeconds: 5, restSeconds: 5, rounds: 2 });
    player.events = [];
    advance(20);
    assert.equal(timer.status, 'finished');
    assert.equal(timer.position, null);
    assert.deepEqual(player.events, [
      'play:count', 'play:count', 'play:count', 'play:workStart',
      'play:count', 'play:count', 'play:count', 'play:restStart',
      'play:count', 'play:count', 'play:count', 'play:workStart',
      'play:count', 'play:count', 'play:count', 'play:finish',
    ]);
  });

  test('リセットで設定画面の状態に戻る', () => {
    timer.start(DEFAULT_SETTINGS);
    advance(3);
    timer.reset();
    assert.equal(timer.status, 'idle');
    assert.equal(timer.plan, null);
    assert.equal(player.events.at(-1), 'stop');
  });

  test('完了時も完了後のリセットでも stop を呼ばない（完了音を途中で止めない）', () => {
    timer.start({ workSeconds: 5, restSeconds: 5, rounds: 1 });
    advance(10);
    timer.reset();
    assert.ok(!player.events.includes('stop'));
  });

  test('状態が変わるたびに onChange を呼ぶ', () => {
    let changes = 0;
    timer = new WorkoutTimer({ cuePlayer: player, clock: () => now, autoTick: false, onChange: () => changes++ });
    timer.start(DEFAULT_SETTINGS);
    timer.pause();
    timer.resume();
    timer.reset();
    assert.equal(changes, 5); // start, pause 内の tick, pause, resume, reset
  });
});
