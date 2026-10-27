import Foundation
import Testing
@testable import HIITTimer

struct WorkoutPlanTests {
    private let plan = WorkoutPlan(settings: .default)

    @Test func lastRestIsSkipped() {
        // 20 秒 × 8 + 10 秒 × 7 = 230 秒（spec.md 3.1 の例）
        #expect(plan.totalDuration == 230)
        #expect(plan.segments.count == 15)
        #expect(plan.segments.last?.phase == .work)
        #expect(plan.segments.last?.round == 8)
    }

    @Test func singleRoundHasOnlyWork() {
        let plan = WorkoutPlan(settings: TimerSettings(workSeconds: 30, restSeconds: 10, rounds: 1))
        #expect(plan.segments.map(\.phase) == [.work])
        #expect(plan.totalDuration == 30)
    }

    @Test func positionFollowsSegments() {
        #expect(plan.position(at: 0) == .running(phase: .work, round: 1, remaining: 20))
        #expect(plan.position(at: 19.5) == .running(phase: .work, round: 1, remaining: 0.5))
        #expect(plan.position(at: 20) == .running(phase: .rest, round: 1, remaining: 10))
        #expect(plan.position(at: 30) == .running(phase: .work, round: 2, remaining: 20))
        #expect(plan.position(at: 229) == .running(phase: .work, round: 8, remaining: 1))
        #expect(plan.position(at: 230) == .finished)
    }

    @Test func cuesInFirstWork() {
        // 残り 3・2・1 秒のカウントのあと、休憩開始
        #expect(plan.cues(from: 0, through: 20).map(\.cue) == [.count, .count, .count, .restStart])
        #expect(plan.cues(from: 16.9, through: 17).map(\.cue) == [.count])
        #expect(plan.cues(from: 17, through: 17.9).map(\.cue) == [])
    }

    @Test func cuesInFirstRest() {
        #expect(plan.cues(from: 20, through: 30).map(\.cue) == [.count, .count, .count, .workStart])
    }

    @Test func lastWorkEndsWithFinishInsteadOfRest() {
        #expect(plan.cues(from: 225, through: 230).map(\.cue) == [.count, .count, .count, .finish])
    }

    @Test func startCueIsNotInTimeline() {
        // 開始直後のワーク開始音は WorkoutTimer.start が鳴らす
        #expect(plan.cueTimeline.first?.time == 17)
    }
}
