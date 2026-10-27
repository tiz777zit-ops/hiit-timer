import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createPlan, cuesBetween, formatRemaining, positionAt } from '../docs/js/plan.js';
import { DEFAULT_SETTINGS } from '../docs/js/settings.js';

const plan = createPlan(DEFAULT_SETTINGS);
const cueNames = (from, through) => cuesBetween(plan, from, through).map((entry) => entry.cue);

describe('createPlan', () => {
  test('準備時間のあとにワークが始まる', () => {
    assert.deepEqual(plan.segments[0], { phase: 'prepare', round: 1, start: 0, end: 5 });
    assert.deepEqual(plan.segments[1], { phase: 'work', round: 1, start: 5, end: 25 });
  });

  test('最終ラウンドの休憩は省略する', () => {
    // 5 秒 + 20 秒 × 8 + 10 秒 × 7 = 235 秒（spec.md 3.1 の例）
    assert.equal(plan.totalDuration, 235);
    assert.equal(plan.segments.length, 16);
    assert.equal(plan.segments.filter((s) => s.phase === 'prepare').length, 1);
    assert.equal(plan.segments.at(-1).phase, 'work');
    assert.equal(plan.segments.at(-1).round, 8);
  });

  test('1 ラウンドなら準備のあとワークだけ', () => {
    const single = createPlan({ workSeconds: 30, restSeconds: 10, rounds: 1 });
    assert.deepEqual(single.segments.map((s) => s.phase), ['prepare', 'work']);
    assert.equal(single.totalDuration, 35);
  });

  test('開始直後の合図はタイムラインに含めない', () => {
    assert.equal(plan.cueTimeline[0].time, 2);
  });
});

describe('positionAt', () => {
  test('区間と残り時間', () => {
    assert.deepEqual(positionAt(plan, 0), { phase: 'prepare', round: 1, remaining: 5 });
    assert.deepEqual(positionAt(plan, 5), { phase: 'work', round: 1, remaining: 20 });
    assert.deepEqual(positionAt(plan, 24.5), { phase: 'work', round: 1, remaining: 0.5 });
    assert.deepEqual(positionAt(plan, 25), { phase: 'rest', round: 1, remaining: 10 });
    assert.deepEqual(positionAt(plan, 35), { phase: 'work', round: 2, remaining: 20 });
    assert.deepEqual(positionAt(plan, 234), { phase: 'work', round: 8, remaining: 1 });
    assert.equal(positionAt(plan, 235), null);
  });
});

describe('cuesBetween', () => {
  test('準備時間中はカウントのあとワーク開始', () => {
    assert.deepEqual(cueNames(0, 5), ['count', 'count', 'count', 'workStart']);
  });

  test('ワーク中は残り 3・2・1 秒のカウントのあと休憩開始', () => {
    assert.deepEqual(cueNames(5, 25), ['count', 'count', 'count', 'restStart']);
    assert.deepEqual(cueNames(21.9, 22), ['count']);
    assert.deepEqual(cueNames(22, 22.9), []);
  });

  test('休憩中はカウントのあとワーク開始', () => {
    assert.deepEqual(cueNames(25, 35), ['count', 'count', 'count', 'workStart']);
  });

  test('最後のワークは休憩ではなく完了音で終わる', () => {
    assert.deepEqual(cueNames(230, 235), ['count', 'count', 'count', 'finish']);
  });
});

describe('formatRemaining', () => {
  test('分:秒で、小数点以下は切り上げる', () => {
    assert.equal(formatRemaining(20), '0:20');
    assert.equal(formatRemaining(0.3), '0:01');
    assert.equal(formatRemaining(65), '1:05');
    assert.equal(formatRemaining(300), '5:00');
  });
});
