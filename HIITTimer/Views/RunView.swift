import SwiftUI

struct RunView: View {
    let timer: WorkoutTimer

    var body: some View {
        VStack(spacing: 32) {
            Spacer()
            if case let .running(phase, round, remaining) = timer.position, let plan = timer.plan {
                Text(phase == .work ? "ワーク" : "休憩")
                    .font(.largeTitle.bold())
                    .foregroundStyle(phase == .work ? Color.orange : Color.green)
                Text(Self.format(remaining: remaining))
                    .font(.system(size: 96, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                Text("ラウンド \(round) / \(plan.rounds)")
                    .font(.title2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            HStack(spacing: 16) {
                Button("リセット", role: .destructive) {
                    timer.reset()
                }
                .buttonStyle(.bordered)
                if timer.status == .paused {
                    Button("再開") {
                        timer.resume()
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    Button("一時停止") {
                        timer.pause()
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .controlSize(.large)
            .padding(.bottom, 32)
        }
        .padding()
    }

    /// 残り時間を「分:秒」で表示する。小数点以下は切り上げる（残り 0.3 秒なら 0:01）。
    static func format(remaining: TimeInterval) -> String {
        let seconds = Int(remaining.rounded(.up))
        return String(format: "%d:%02d", seconds / 60, seconds % 60)
    }
}
