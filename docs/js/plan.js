// 設定から区間（ワーク / 休憩）の並びと合図のタイムラインを作り、経過時間ごとの状態を計算する。
// 時刻はすべてワークアウト開始からの経過秒数。

import { normalizeSettings } from './settings.js';

export const COUNTDOWN_SECONDS = 3;

/**
 * @typedef {'work' | 'rest'} Phase
 * @typedef {'workStart' | 'restStart' | 'count' | 'finish'} Cue
 */

export function createPlan(settings) {
  const { workSeconds, restSeconds, rounds } = normalizeSettings(settings);
  const segments = [];
  let time = 0;
  for (let round = 1; round <= rounds; round++) {
    segments.push({ phase: 'work', round, start: time, end: time + workSeconds });
    time += workSeconds;
    // 最終ラウンドの休憩は省略する（spec.md 3.1）
    if (round < rounds) {
      segments.push({ phase: 'rest', round, start: time, end: time + restSeconds });
      time += restSeconds;
    }
  }
  return { rounds, segments, totalDuration: time, cueTimeline: makeCueTimeline(segments) };
}

/** 開始直後（0 秒）のワーク開始音は含まない。WorkoutTimer.start が鳴らす。 */
function makeCueTimeline(segments) {
  const timeline = [];
  for (const segment of segments) {
    if (segment.start > 0) {
      timeline.push({ time: segment.start, cue: segment.phase === 'work' ? 'workStart' : 'restStart' });
    }
    for (let second = COUNTDOWN_SECONDS; second >= 1; second--) {
      const time = segment.end - second;
      if (time > segment.start) timeline.push({ time, cue: 'count' });
    }
  }
  const last = segments.at(-1);
  if (last) timeline.push({ time: last.end, cue: 'finish' });
  return timeline;
}

/** 経過時間の時点の区間と残り時間。全ラウンドが終わっていれば null。 */
export function positionAt(plan, elapsed) {
  const segment = plan.segments.find((s) => elapsed < s.end);
  if (!segment) return null;
  return { phase: segment.phase, round: segment.round, remaining: segment.end - elapsed };
}

/** `from` より後、`through` 以前に鳴らす合図を、予定時刻とともに時刻順に返す。 */
export function cuesBetween(plan, from, through) {
  return plan.cueTimeline.filter((entry) => entry.time > from && entry.time <= through);
}

/** 残り時間を「分:秒」にする。小数点以下は切り上げる（残り 0.3 秒なら 0:01）。 */
export function formatRemaining(remaining) {
  const seconds = Math.ceil(remaining);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
