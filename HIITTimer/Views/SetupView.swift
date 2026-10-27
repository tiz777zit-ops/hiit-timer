import SwiftUI

struct SetupView: View {
    @Binding var settings: TimerSettings
    let onStart: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Stepper(value: $settings.workSeconds, in: TimerSettings.secondsRange, step: TimerSettings.secondsStep) {
                        LabeledContent("ワーク", value: "\(settings.workSeconds) 秒")
                    }
                    Stepper(value: $settings.restSeconds, in: TimerSettings.secondsRange, step: TimerSettings.secondsStep) {
                        LabeledContent("休憩", value: "\(settings.restSeconds) 秒")
                    }
                    Stepper(value: $settings.rounds, in: TimerSettings.roundsRange) {
                        LabeledContent("ラウンド", value: "\(settings.rounds) 回")
                    }
                }
                Section {
                    Button("スタート", action: onStart)
                        .frame(maxWidth: .infinity)
                        .font(.headline)
                }
            }
            .navigationTitle("HIIT タイマー")
        }
    }
}

#Preview {
    SetupView(settings: .constant(.default)) {}
}
