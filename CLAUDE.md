# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

自分専用の iOS 向け HIIT タイマーアプリ（Swift / SwiftUI、iOS 27 以上、外部依存なし）。仕様は `spec.md` にまとめてあり、実装はこれに従う。仕様を変更するときは、先に `spec.md` を更新してユーザーの合意を得る。

## 開発ルール

- 日本語で回答する。
- 実装前に必ず仕様を確認する。仕様が決まっていない部分は、実装を始める前にユーザーと合意する。
- 勝手に機能を追加しない。依頼された範囲だけを実装する。改善案があれば、実装せずに提案にとどめる。
- 不明点は推測で進めず、質問する。
- コード変更後はテストする。テストコマンドが未整備の場合はその旨を報告し、テストの用意を提案する。

## コマンド

```bash
# ビルド
xcodebuild -project HIITTimer.xcodeproj -scheme HIITTimer -destination 'generic/platform=iOS Simulator' build

# テスト（Swift Testing。シミュレータ名は `xcrun simctl list devices available` で確認）
xcodebuild -project HIITTimer.xcodeproj -scheme HIITTimer -destination 'platform=iOS Simulator,name=iPhone 17' test

# 単一のテストスイート / テストだけ実行
xcodebuild ... test -only-testing:HIITTimerTests/WorkoutPlanTests
xcodebuild ... test -only-testing:HIITTimerTests/WorkoutPlanTests/lastRestIsSkipped()
```

## プロジェクト構成の注意

- `HIITTimer.xcodeproj` はフォルダ同期グループ（objectVersion 77）を使っている。`HIITTimer/` と `HIITTimerTests/` にファイルを置けば自動でターゲットに含まれ、pbxproj の編集は不要。
- `Info.plist` は自動生成と `Config/Info.plist`（`UIBackgroundModes: audio`）をマージしている。同期フォルダの中に Info.plist を置くとリソースとしてコピーされて衝突するので、`Config/` に置く。
- Swift 6 で、デフォルトのアクター分離は `MainActor`（`SWIFT_DEFAULT_ACTOR_ISOLATION`）。テストターゲットも同じ設定。
- iOS 27 で非推奨になった AVFAudio の API（`connect(_:to:format:)`、`AVAudioPlayerNode.play()`、割り込み通知）は使わない。代わりに `connectNode`、`playAudio()`、`resumptionRecommendationNotification` を使う。

## アーキテクチャ

- `Model/WorkoutPlan`：設定から区間（ワーク / 休憩）の並びと、合図のタイムラインを作る純粋なロジック。最終ラウンドの休憩は省く。開始直後（0 秒）のワーク開始音はタイムラインに含めず、`WorkoutTimer.start` が鳴らす。
- `Model/WorkoutTimer`：`@Observable`。経過時間は「一時停止までの累計 + (現在時刻 − 再開時刻)」で計算し、tick の間隔に依存しない。時計は `ContinuousClock` を使い、端末の時刻変更の影響を受けないようにしている（`Date()` は使わない）。tick ごとに `(前回, 今回]` の合図のうち最新の 1 つだけを `CuePlaying` に渡す。ただし、丸める前の経過時間とその合図の予定時刻との差が `maxCueCatchUp` を超えたら、鳴らさずに捨てる（tick の間隔ではなく、合図そのものの遅れで判定する）。時計と `CuePlaying` を注入できるので、テストでは `autoTick: false` にして `tick()` を手動で呼ぶ。
- `Audio/AudioCuePlayer`：`CuePlaying` の実装。`AVAudioEngine` で無音をループ再生してバックグラウンドでも動き続ける。セッションは `.playback` + `.mixWithOthers` で、合図の間だけ `.duckOthers` に切り替える。切り替えにはセッションの無効化と再有効化が必要。音は `ToneFactory` がサイン波で生成し、音声ファイルは使わない。
- `Views/ContentView`：`WorkoutTimer.status` で設定・実行・完了の画面を切り替える。設定はスタート時に `SettingsStore`（UserDefaults）へ保存する。
- バックグラウンド動作とダッキングは、シミュレータでは確認できない。変更したら実機で確認する。
