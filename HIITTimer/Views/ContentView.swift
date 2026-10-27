import SwiftUI

/// タイマーの状態に応じて、設定・実行・完了の画面を切り替える（spec.md 3.7）
struct ContentView: View {
    private let store = SettingsStore()
    @State private var settings: TimerSettings
    @State private var timer = WorkoutTimer(cuePlayer: AudioCuePlayer())

    init() {
        _settings = State(initialValue: SettingsStore().load())
    }

    var body: some View {
        switch timer.status {
        case .idle:
            SetupView(settings: $settings) {
                store.save(settings)
                timer.start(settings: settings)
            }
        case .running, .paused:
            RunView(timer: timer)
        case .finished:
            FinishedView {
                timer.reset()
            }
        }
    }
}

#Preview {
    ContentView()
}
