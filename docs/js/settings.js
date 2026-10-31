// ワーク時間・休憩時間・ラウンド数・マナーモードでも鳴らすかの設定（spec.md 3.2）と、その保存（3.6）

export const DEFAULT_SETTINGS = Object.freeze({
  workSeconds: 20, restSeconds: 10, rounds: 8, ringInSilentMode: true,
});

export const SECONDS_MIN = 5;
export const SECONDS_MAX = 300;
export const SECONDS_STEP = 5;
export const ROUNDS_MIN = 1;
export const ROUNDS_MAX = 30;

const STORAGE_KEY = 'hiit-timer.settings';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function normalizeSeconds(value, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return clamp(Math.round(value / SECONDS_STEP) * SECONDS_STEP, SECONDS_MIN, SECONDS_MAX);
}

/** 範囲外の値・刻みに合わない値・数値でない値（スイッチは真偽値でない値）を、設定可能な値に直す。 */
export function normalizeSettings(settings) {
  const rounds = Number.isFinite(settings?.rounds)
    ? clamp(Math.round(settings.rounds), ROUNDS_MIN, ROUNDS_MAX)
    : DEFAULT_SETTINGS.rounds;
  return {
    workSeconds: normalizeSeconds(settings?.workSeconds, DEFAULT_SETTINGS.workSeconds),
    restSeconds: normalizeSeconds(settings?.restSeconds, DEFAULT_SETTINGS.restSeconds),
    rounds,
    ringInSilentMode: typeof settings?.ringInSilentMode === 'boolean'
      ? settings.ringInSilentMode
      : DEFAULT_SETTINGS.ringInSilentMode,
  };
}

/** 保存された設定がない・読めないとき（storage が null のときも）は初期値を返す。 */
export function loadSettings(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY) ?? null;
    if (raw === null) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage, settings) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch {
    // プライベートブラウズなどで保存できなくても、タイマー自体は使えるようにする
  }
}
