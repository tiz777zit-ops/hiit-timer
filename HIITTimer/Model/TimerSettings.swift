import Foundation

/// ワーク時間・休憩時間・ラウンド数の設定（spec.md 3.2）
struct TimerSettings: Equatable {
    var workSeconds: Int
    var restSeconds: Int
    var rounds: Int

    static let `default` = TimerSettings(workSeconds: 20, restSeconds: 10, rounds: 8)

    static let secondsRange = 5...300
    static let secondsStep = 5
    static let roundsRange = 1...30

    /// 範囲外の値や刻みに合わない値を、設定可能な値に丸める。
    func normalized() -> TimerSettings {
        TimerSettings(
            workSeconds: Self.normalizeSeconds(workSeconds),
            restSeconds: Self.normalizeSeconds(restSeconds),
            rounds: rounds.clamped(to: Self.roundsRange)
        )
    }

    private static func normalizeSeconds(_ value: Int) -> Int {
        let snapped = Int((Double(value) / Double(secondsStep)).rounded()) * secondsStep
        return snapped.clamped(to: secondsRange)
    }
}

extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
