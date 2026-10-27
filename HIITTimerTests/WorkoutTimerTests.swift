import Foundation
import Testing
@testable import HIITTimer

private final class FakeCuePlayer: CuePlaying {
    enum Event: Equatable {
        case begin
        case play(Cue)
        case end
    }

    var events: [Event] = []

    func begin() { events.append(.begin) }
    func play(_ cue: Cue) { events.append(.play(cue)) }
    func end() { events.append(.end) }
}

private final class FakeClock {
    var now: TimeInterval = 1000
}

struct WorkoutTimerTests {
    private let player = FakeCuePlayer()
    private let clock = FakeClock()
    private let timer: WorkoutTimer

    init() {
        let clock = clock
        timer = WorkoutTimer(cuePlayer: player, clock: { clock.now }, autoTick: false)
    }

    /// 時計を進めながら 1/16 秒ごとに tick する（2 進数で誤差なく表せる刻みにして、境界の判定をぶらさない）
    private func advance(by seconds: TimeInterval) {
        let step = 0.0625
        for _ in 0..<Int(seconds / step) {
            clock.now += step
            timer.tick()
        }
    }

    @Test func startPlaysWorkStart() {
        timer.start(settings: .default)
        #expect(timer.status == .running)
        #expect(player.events == [.begin, .play(.workStart)])
        #expect(timer.position == .running(phase: .work, round: 1, remaining: 20))
    }

    @Test func countdownAndRestStart() {
        timer.start(settings: .default)
        player.events = []
        advance(by: 20)
        #expect(player.events == [.play(.count), .play(.count), .play(.count), .play(.restStart)])
        guard case let .running(phase, round, _) = timer.position else {
            Issue.record("running のはず")
            return
        }
        #expect(phase == .rest)
        #expect(round == 1)
    }

    @Test func pauseFreezesTimeAndResumeContinues() {
        timer.start(settings: .default)
        advance(by: 5)
        timer.pause()
        #expect(timer.status == .paused)
        #expect(player.events.last == .end)

        clock.now += 60
        timer.tick()
        #expect(timer.elapsed == 5)

        timer.resume()
        #expect(timer.status == .running)
        #expect(player.events.last == .begin)
        advance(by: 1)
        #expect(timer.elapsed == 6)
    }

    @Test func elapsedFollowsClockEvenWithSparseTicks() {
        // バックグラウンドなどで tick が間引かれても、戻ったときの残り時間は正しい
        timer.start(settings: .default)
        clock.now += 25
        timer.tick()
        #expect(timer.position == .running(phase: .rest, round: 1, remaining: 5))
    }

    @Test func staleCuesAreSkippedAfterLongGap() {
        timer.start(settings: .default)
        player.events = []
        clock.now += 25
        timer.tick()
        #expect(player.events.isEmpty)
    }

    @Test func slightlyLateFinishCueIsPlayedEvenAfterLongTickGap() {
        // 前回の tick から 1 秒以上空いても、完了音自体の遅れが小さければ鳴らす
        timer.start(settings: TimerSettings(workSeconds: 5, restSeconds: 5, rounds: 1))
        clock.now += 3.9
        timer.tick()
        player.events = []
        clock.now += 1.2
        timer.tick()
        #expect(timer.status == .finished)
        #expect(player.events == [.play(.finish), .end])
    }

    @Test func staleFinishCueIsSkipped() {
        // 終了時刻で丸めた経過時間ではなく、実際の遅れで判定する
        timer.start(settings: TimerSettings(workSeconds: 5, restSeconds: 5, rounds: 1))
        clock.now += 4.5
        timer.tick()
        player.events = []
        clock.now += 60.5
        timer.tick()
        #expect(timer.status == .finished)
        #expect(player.events == [.end])
    }

    @Test func finishesWithFinishCue() {
        timer.start(settings: TimerSettings(workSeconds: 5, restSeconds: 5, rounds: 2))
        player.events = []
        advance(by: 15)
        #expect(timer.status == .finished)
        #expect(timer.position == .finished)
        // 最終ラウンドの休憩はなく、カウントのあと完了音
        #expect(player.events == [
            .play(.count), .play(.count), .play(.count), .play(.restStart),
            .play(.count), .play(.count), .play(.count), .play(.workStart),
            .play(.count), .play(.count), .play(.count), .play(.finish),
            .end,
        ])
    }

    @Test func resetReturnsToIdle() {
        timer.start(settings: .default)
        advance(by: 3)
        timer.reset()
        #expect(timer.status == .idle)
        #expect(timer.plan == nil)
        #expect(player.events.last == .end)
    }

    @Test func resetFromFinishedDoesNotEndTwice() {
        timer.start(settings: TimerSettings(workSeconds: 5, restSeconds: 5, rounds: 1))
        advance(by: 5)
        let endCount = player.events.filter { $0 == .end }.count
        timer.reset()
        #expect(player.events.filter { $0 == .end }.count == endCount)
    }
}

struct RunViewFormatTests {
    @Test func remainingIsRoundedUp() {
        #expect(RunView.format(remaining: 20) == "0:20")
        #expect(RunView.format(remaining: 0.3) == "0:01")
        #expect(RunView.format(remaining: 65) == "1:05")
        #expect(RunView.format(remaining: 300) == "5:00")
    }
}
