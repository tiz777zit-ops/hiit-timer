import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { DEFAULT_SETTINGS, loadSettings, normalizeSettings, saveSettings } from '../docs/js/settings.js';

class FakeStorage {
  #items = new Map();
  getItem(key) { return this.#items.has(key) ? this.#items.get(key) : null; }
  setItem(key, value) { this.#items.set(key, String(value)); }
}

describe('normalizeSettings', () => {
  test('初期値は仕様どおり', () => {
    assert.deepEqual(DEFAULT_SETTINGS, { workSeconds: 20, restSeconds: 10, rounds: 8, ringInSilentMode: true });
  });

  test('範囲外の値は範囲内に収める', () => {
    assert.deepEqual(
      normalizeSettings({ workSeconds: 0, restSeconds: 1000, rounds: 99 }),
      { workSeconds: 5, restSeconds: 300, rounds: 30, ringInSilentMode: true },
    );
  });

  test('秒数は 5 秒刻みに丸める', () => {
    assert.deepEqual(
      normalizeSettings({ workSeconds: 22, restSeconds: 13, rounds: 0 }),
      { workSeconds: 20, restSeconds: 15, rounds: 1, ringInSilentMode: true },
    );
  });

  test('数値でない値は初期値にする', () => {
    assert.deepEqual(normalizeSettings({ workSeconds: '30', restSeconds: null }), DEFAULT_SETTINGS);
    assert.deepEqual(normalizeSettings(null), DEFAULT_SETTINGS);
  });

  test('マナーモードでも鳴らすかは、真偽値でなければ初期値（オン）にする', () => {
    assert.equal(normalizeSettings({ ringInSilentMode: false }).ringInSilentMode, false);
    assert.equal(normalizeSettings({ ringInSilentMode: 'false' }).ringInSilentMode, true);
    assert.equal(normalizeSettings({ ringInSilentMode: 0 }).ringInSilentMode, true);
  });
});

describe('loadSettings / saveSettings', () => {
  test('保存がなければ初期値', () => {
    assert.deepEqual(loadSettings(new FakeStorage()), DEFAULT_SETTINGS);
  });

  test('保存した設定を読み込める', () => {
    const storage = new FakeStorage();
    const settings = { workSeconds: 45, restSeconds: 15, rounds: 12, ringInSilentMode: false };
    saveSettings(storage, settings);
    assert.deepEqual(loadSettings(storage), settings);
  });

  test('壊れた保存データは初期値にする', () => {
    const storage = new FakeStorage();
    storage.setItem('hiit-timer.settings', '{broken');
    assert.deepEqual(loadSettings(storage), DEFAULT_SETTINGS);
  });

  test('範囲外の保存データは直して読み込む', () => {
    const storage = new FakeStorage();
    storage.setItem('hiit-timer.settings', JSON.stringify({ workSeconds: 3, restSeconds: 301, rounds: 0 }));
    assert.deepEqual(loadSettings(storage), { workSeconds: 5, restSeconds: 300, rounds: 1, ringInSilentMode: true });
  });

  test('スイッチ追加前の保存データは、マナーモードでも鳴らす（オン）として読み込む', () => {
    const storage = new FakeStorage();
    storage.setItem('hiit-timer.settings', JSON.stringify({ workSeconds: 30, restSeconds: 10, rounds: 5 }));
    assert.deepEqual(loadSettings(storage), { workSeconds: 30, restSeconds: 10, rounds: 5, ringInSilentMode: true });
  });

  test('ストレージが使えなくても例外にしない', () => {
    const broken = {
      getItem() { throw new Error('denied'); },
      setItem() { throw new Error('denied'); },
    };
    assert.deepEqual(loadSettings(broken), DEFAULT_SETTINGS);
    assert.doesNotThrow(() => saveSettings(broken, DEFAULT_SETTINGS));
  });

  test('ストレージを取得できなかった（null）ときも初期値で動く', () => {
    assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
    assert.doesNotThrow(() => saveSettings(null, DEFAULT_SETTINGS));
  });
});
