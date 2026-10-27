# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

自分専用の HIIT タイマーの Web アプリ（素の HTML / CSS / JavaScript、ES Modules、外部依存・ビルド工程なし）。iPhone の Safari でホーム画面に追加して使う。仕様は `spec.md` にまとめてあり、実装はこれに従う。仕様を変更するときは、先に `spec.md` を更新してユーザーの合意を得る。

以前は SwiftUI の iOS アプリだった。無料の Apple ID では 7 日で起動できなくなるため、Web アプリに切り替えた。iOS 版はコミット `0d5fb53` に残っている。

## 開発ルール

- 日本語で回答する。
- 実装前に必ず仕様を確認する。仕様が決まっていない部分は、実装を始める前にユーザーと合意する。
- 勝手に機能を追加しない。依頼された範囲だけを実装する。改善案があれば、実装せずに提案にとどめる。
- 不明点は推測で進めず、質問する。
- コード変更後はテストする。テストコマンドが未整備の場合はその旨を報告し、テストの用意を提案する。

## コマンド

```bash
npm test                                  # 全テスト（Node.js 組み込みのテストランナー。依存パッケージなし）
node --test tests/timer.test.js           # 1 ファイルだけ
node --test --test-name-pattern="完了音"   # 名前で絞り込む
npm run serve                             # http://localhost:8000 でローカル確認（ES Modules のため file:// では動かない）
```

## 構成

- `docs/` が公開するアプリ本体。GitHub Pages は「main ブランチの `/docs`」から配信する設定のため、フォルダ名を変えると公開が止まる。
- `tests/` は `docs/js/` のモジュールを Node から直接 import してテストする。`audio.js` と `wake-lock.js` はブラウザ API（AudioContext、表示状態、Wake Lock）をコンストラクタで差し替えられるようにしてあり、テストでは偽物を渡す。`app.js`（画面）だけは自動テストがないので、ブラウザと iPhone 実機で確認する。実際の音の鳴り方と画面点灯も実機でしか確認できない。

## アーキテクチャ

- `plan.js`：設定から区間（ワーク / 休憩）の並びと合図のタイムラインを作る純粋なロジック。最終ラウンドの休憩は省く。開始直後（0 秒）のワーク開始音はタイムラインに含めず、`WorkoutTimer.start` が鳴らす。
- `timer.js`（`WorkoutTimer`）：経過時間は「一時停止までの累計 + (現在時刻 − 再開時刻)」で計算し、tick の間隔に依存しない。tick ごとに `(前回, 今回]` の合図のうち最新の 1 つだけを鳴らす。ただし、丸める前の経過時間とその合図の予定時刻との差が `MAX_CUE_CATCH_UP` を超えたら捨てる（tick の間隔ではなく、合図そのものの遅れで判定する）。
  - 時計は `Date.now()` を使う。`performance.now()` は端末のスリープ中に止まることがあり、画面ロック中もタイマーを進める仕様（spec.md 3.4）に合わないため。時刻が戻された場合は、経過時間を減らさないことで合図のくり返しを防いでいる。
  - 時計・`CuePlayer`・`onChange` を注入できる。テストでは `autoTick: false` にして `tick()` を手動で呼ぶ。
- `audio.js`（`AudioCuePlayer`）：Web Audio API のサイン波で 4 種類の合図を鳴らす。iOS ではユーザーの操作の中でないと音声を有効にできないため、`begin()` はスタート・再開ボタンのクリック処理の中から同期的に呼ぶ必要がある。`navigator.audioSession.type = 'ambient'` で曲と重ねて鳴らす（その代わり、マナーモードでは鳴らない）。
  - 非表示中の合図は捨てる。AudioContext が止まっているときは `resume()` の完了を待ち、その時点で遅れが小さく、`stop()` されていなければ鳴らす。
  - `stop()` は一時停止・中止時だけ `WorkoutTimer` から呼ばれる。完了時は完了音を最後まで鳴らすため呼ばれない。
- `wake-lock.js`：実行中だけ Screen Wake Lock を取る。非表示になると OS が解除するので、表示に戻ったら取り直す。取得中の要求は重ねず、完了時に不要になっていれば手放す（一時停止→再開を素早く行っても点灯が残らないようにするため）。再試行するのは「表示中に OS に解除されたとき（1 回）」「取得中に来た要求があったとき（取得完了後に 1 回）」「表示に戻ったとき」だけで、失敗のたびに要求し続けることはしない。
- `app.js`：`WorkoutTimer` の `onChange` で画面を描き直す。表示する画面は `status` で決まる（`idle` → 設定、`running` / `paused` → 実行、`finished` → 完了）。設定はスタート時に localStorage へ保存する。
