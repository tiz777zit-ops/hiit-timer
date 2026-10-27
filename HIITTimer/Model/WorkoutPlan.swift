import Foundation

enum Phase: Equatable {
    case work
    case rest
}

/// 合図の種類（spec.md 3.3）
enum Cue: Equatable {
    case workStart
    case restStart
    case count
    case finish
}

/// 設定から組み立てた区間の並びと、経過時間ごとの状態・合図を計算する。
/// 時刻はすべてワークアウト開始からの経過秒数。
struct WorkoutPlan {
    struct Segment: Equatable {
        let phase: Phase
        /// 1 始まり
        let round: Int
        let start: TimeInterval
        let duration: TimeInterval

        var end: TimeInterval { start + duration }
    }

    enum Position: Equatable {
        case running(phase: Phase, round: Int, remaining: TimeInterval)
        case finished
    }

    static let countdownSeconds = 3

    let rounds: Int
    let segments: [Segment]
    /// 時刻順に並んだ合図。開始直後（0 秒）のワーク開始音は含まない。
    let cueTimeline: [(time: TimeInterval, cue: Cue)]

    var totalDuration: TimeInterval { segments.last?.end ?? 0 }

    init(settings: TimerSettings) {
        let settings = settings.normalized()
        var segments: [Segment] = []
        var time: TimeInterval = 0
        for round in 1...settings.rounds {
            let work = TimeInterval(settings.workSeconds)
            segments.append(Segment(phase: .work, round: round, start: time, duration: work))
            time += work
            // 最終ラウンドの休憩は省略する（spec.md 3.1）
            if round < settings.rounds {
                let rest = TimeInterval(settings.restSeconds)
                segments.append(Segment(phase: .rest, round: round, start: time, duration: rest))
                time += rest
            }
        }
        self.rounds = settings.rounds
        self.segments = segments
        self.cueTimeline = Self.makeCueTimeline(segments)
    }

    func position(at elapsed: TimeInterval) -> Position {
        guard let segment = segments.first(where: { elapsed < $0.end }) else {
            return .finished
        }
        return .running(phase: segment.phase, round: segment.round, remaining: segment.end - elapsed)
    }

    /// `from` より後、`through` 以前に鳴らす合図を、予定時刻とともに時刻順に返す。
    func cues(from: TimeInterval, through: TimeInterval) -> [(time: TimeInterval, cue: Cue)] {
        cueTimeline.filter { $0.time > from && $0.time <= through }
    }

    private static func makeCueTimeline(_ segments: [Segment]) -> [(time: TimeInterval, cue: Cue)] {
        var timeline: [(time: TimeInterval, cue: Cue)] = []
        for segment in segments {
            if segment.start > 0 {
                timeline.append((segment.start, segment.phase == .work ? .workStart : .restStart))
            }
            for second in stride(from: countdownSeconds, through: 1, by: -1) {
                let time = segment.end - TimeInterval(second)
                if time > segment.start {
                    timeline.append((time, .count))
                }
            }
        }
        if let last = segments.last {
            timeline.append((last.end, .finish))
        }
        return timeline
    }
}
