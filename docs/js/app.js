// 画面の表示と操作をつなぐ（spec.md 3.7）。タイマーの状態に応じて、設定・実行・完了の画面を切り替える。

import { AudioCuePlayer } from './audio.js';
import { formatRemaining } from './plan.js';
import {
  ROUNDS_MAX, ROUNDS_MIN, SECONDS_MAX, SECONDS_MIN, SECONDS_STEP,
  loadSettings, saveSettings,
} from './settings.js';
import { WorkoutTimer } from './timer.js';
import { ScreenWakeLock } from './wake-lock.js';

const FIELDS = {
  workSeconds: { min: SECONDS_MIN, max: SECONDS_MAX, step: SECONDS_STEP },
  restSeconds: { min: SECONDS_MIN, max: SECONDS_MAX, step: SECONDS_STEP },
  rounds: { min: ROUNDS_MIN, max: ROUNDS_MAX, step: 1 },
};

const $ = (selector) => document.querySelector(selector);
const screens = { setup: $('#setup'), run: $('#run'), finished: $('#finished') };

/** 保存が拒否されている設定では、localStorage を参照しただけで例外になる。そのときは保存なしで動かす。 */
function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const storage = getStorage();
let settings = loadSettings(storage);
const wakeLock = new ScreenWakeLock();
const timer = new WorkoutTimer({ cuePlayer: new AudioCuePlayer(), onChange: render });

function render() {
  const screen = timer.status === 'idle' ? 'setup' : timer.status === 'finished' ? 'finished' : 'run';
  for (const [name, element] of Object.entries(screens)) element.hidden = name !== screen;

  if (timer.status === 'running') wakeLock.acquire();
  else wakeLock.release();

  if (screen === 'setup') renderSetup();
  if (screen === 'run') renderRun();
}

function renderSetup() {
  for (const [key, { min, max }] of Object.entries(FIELDS)) {
    const field = document.querySelector(`[data-field="${key}"]`);
    field.querySelector('output').textContent = settings[key];
    field.querySelector('[data-step="-1"]').disabled = settings[key] <= min;
    field.querySelector('[data-step="1"]').disabled = settings[key] >= max;
  }
}

function renderRun() {
  const position = timer.position;
  if (!position) return;
  const phase = $('#phase');
  phase.textContent = position.phase === 'work' ? 'ワーク' : '休憩';
  phase.dataset.phase = position.phase;
  $('#remaining').textContent = formatRemaining(position.remaining);
  $('#round').textContent = `ラウンド ${position.round} / ${timer.plan.rounds}`;
  $('#pause').hidden = timer.status !== 'running';
  $('#resume').hidden = timer.status !== 'paused';
}

for (const [key, { min, max, step }] of Object.entries(FIELDS)) {
  const field = document.querySelector(`[data-field="${key}"]`);
  for (const button of field.querySelectorAll('[data-step]')) {
    button.addEventListener('click', () => {
      const next = settings[key] + Number(button.dataset.step) * step;
      settings = { ...settings, [key]: Math.min(Math.max(next, min), max) };
      renderSetup();
    });
  }
}

$('#start').addEventListener('click', () => {
  saveSettings(storage, settings);
  timer.start(settings);
});
$('#pause').addEventListener('click', () => timer.pause());
$('#resume').addEventListener('click', () => timer.resume());
$('#reset').addEventListener('click', () => timer.reset());
$('#done').addEventListener('click', () => timer.reset());

// バックグラウンドから戻ったら、次の tick を待たずに表示を更新する
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') timer.tick();
});

render();
