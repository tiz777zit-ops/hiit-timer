import Foundation
import Observation

/// 合図を鳴らす側のインターフェース。テストでは差し替える。
protocol CuePlaying: AnyObject {
    /// 実行開始・再開時に呼ぶ。バックグラウンドでも動き続けるための準備をする。
    func begin()
    func play(_ cue: Cue)
    /// 一時停止・中止・完了時に呼ぶ。鳴っている合図は最後まで鳴らす。
    func end()
}

/// タイマーの進行を管理する。残り時間は開始時刻からの経過時間で計算するので、
/// 一時停止やバックグラウンドを挟んでもずれない（spec.md 5）。
@Observable
final class WorkoutTimer {
    enum Status: Equatable {
        case idle
        case running
        case paused
        case finished
    }

    /// 合図の予定時刻からこれ以上遅れたら鳴らさずに捨てる。
    /// アプリが一時的に止まっていた場合などに、古い合図が遅れて鳴るのを防ぐ。
    static let maxCueCatchUp: TimeInterval = 1.0
    static let tickInterval: TimeInterval = 0.05

    private(set) var status: Status = .idle
    private(set) var plan: WorkoutPlan?
    private(set) var elapsed: TimeInterval = 0

    var position: WorkoutPlan.Position? { plan?.position(at: elapsed) }

    @ObservationIgnored private let clock: () -> TimeInterval
    @ObservationIgnored private let cuePlayer: CuePlaying
    @ObservationIgnored private let autoTick: Bool
    @ObservationIgnored private var accumulated: TimeInterval = 0
    @ObservationIgnored private var resumedAt: TimeInterval = 0
    @ObservationIgnored private var lastCueCheck: TimeInterval = 0
    @ObservationIgnored private var ticker: Timer?

    /// - Parameter autoTick: false のときは内部タイマーを動かさない（テストで `tick()` を直接呼ぶため）
    init(
        cuePlayer: CuePlaying,
        clock: @escaping () -> TimeInterval = WorkoutTimer.continuousSeconds,
        autoTick: Bool = true
    ) {
        self.cuePlayer = cuePlayer
        self.clock = clock
        self.autoTick = autoTick
    }

    private nonisolated static let clockOrigin = ContinuousClock.now

    /// 端末の時刻変更の影響を受けず、スリープ中も進む時計（秒）
    nonisolated static func continuousSeconds() -> TimeInterval {
        let duration = ContinuousClock.now - clockOrigin
        return Double(duration.components.seconds) + Double(duration.components.attoseconds) * 1e-18
    }

    func start(settings: TimerSettings) {
        plan = WorkoutPlan(settings: settings)
        accumulated = 0
        elapsed = 0
        lastCueCheck = 0
        resumedAt = clock()
        status = .running
        cuePlayer.begin()
        cuePlayer.play(.workStart)
        startTicking()
    }

    func pause() {
        guard status == .running else { return }
        tick()
        guard status == .running else { return }
        accumulated = elapsed
        status = .paused
        stopTicking()
        cuePlayer.end()
    }

    func resume() {
        guard status == .paused else { return }
        resumedAt = clock()
        status = .running
        cuePlayer.begin()
        startTicking()
    }

    func reset() {
        let wasActive = status == .running || status == .paused
        stopTicking()
        status = .idle
        plan = nil
        elapsed = 0
        accumulated = 0
        lastCueCheck = 0
        if wasActive {
            cuePlayer.end()
        }
    }

    /// 経過時間を更新し、前回から今回までに来た合図を鳴らす。
    func tick() {
        guard status == .running, let plan else { return }
        // 遅れの判定には、終了時刻で丸める前の経過時間を使う
        let rawNow = accumulated + (clock() - resumedAt)
        let now = min(rawNow, plan.totalDuration)
        // 同時に複数たまっていたら最後の 1 つだけ鳴らす
        if let latest = plan.cues(from: lastCueCheck, through: now).last,
           rawNow - latest.time <= Self.maxCueCatchUp {
            cuePlayer.play(latest.cue)
        }
        lastCueCheck = now
        elapsed = now

        if now >= plan.totalDuration {
            status = .finished
            stopTicking()
            cuePlayer.end()
        }
    }

    private func startTicking() {
        guard autoTick else { return }
        stopTicking()
        let timer = Timer(timeInterval: Self.tickInterval, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.tick()
            }
        }
        RunLoop.main.add(timer, forMode: .common)
        ticker = timer
    }

    private func stopTicking() {
        ticker?.invalidate()
        ticker = nil
    }
}
