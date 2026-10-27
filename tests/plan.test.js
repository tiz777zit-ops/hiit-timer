import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createPlan, cuesBetween, formatRemaining, positionAt } from '../docs/js/plan.js';
import { DEFAULT_SETTINGS } from '../docs/js/settings.js';

const plan = createPlan(DEFAULT_SETTINGS);
const cueNames = (from, through) => cuesBetween(plan, from, through).map((entry) => entry.cue);

describe('createPlan', () => {
  test('最終ラウンドの休憩は省略する', () => {
    // 20 秒 × 8 + 10 秒 × 7 = 230 秒（spec.md 3.1 の例）
    assert.equal(plan.totalDuration, 230);
    assert.equal(plan.segments.length, 15);
    assert.equal(plan.segments.at(-1).phase, 'work');
    assert.equal(plan.segments.at(-1).round, 8);
  });

  test('1 ラウンドならワークだけ', () => {
    const single = createPlan({ workSeconds: 30, restSeconds: 10, rounds: 1 });
    assert.deepEqual(single.segments.map((s) => s.phase), ['work']);
    assert.equal(single.totalDuration, 30);
  });

  test('開始直後のワーク開始音はタイムラインに含めない', () => {
    assert.equal(plan.cueTimeline[0].time, 17);
  });
});

describe('positionAt', () => {
  test('区間と残り時間', () => {
    assert.deepEqual(positionAt(plan, 0), { phase: 'work', round: 1, remaining: 20 });
    assert.deepEqual(positionAt(plan, 19.5), { phase: 'work', round: 1, remaining: 0.5 });
    assert.deepEqual(positionAt(plan, 20), { phase: 'rest', round: 1, remaining: 10 });
    assert.deepEqual(positionAt(plan, 30), { phase: 'work', round: 2, remaining: 20 });
    assert.deepEqual(positionAt(plan, 229), { phase: 'work', round: 8, remaining: 1 });
    assert.equal(positionAt(plan, 230), null);
  });
});

describe('cuesBetween', () => {
  test('ワーク中は残り 3・2・1 秒のカウントのあと休憩開始', () => {
    assert.deepEqual(cueNames(0, 20), ['count', 'count', 'count', 'restStart']);
    assert.deepEqual(cueNames(16.9, 17), ['count']);
    assert.deepEqual(cueNames(17, 17.9), []);
  });

  test('休憩中はカウントのあとワーク開始', () => {
    assert.deepEqual(cueNames(20, 30), ['count', 'count', 'count', 'workStart']);
  });

  test('最後のワークは休憩ではなく完了音で終わる', () => {
    assert.deepEqual(cueNames(225, 230), ['count', 'count', 'count', 'finish']);
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
