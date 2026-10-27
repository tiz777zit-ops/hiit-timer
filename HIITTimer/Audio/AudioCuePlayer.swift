import AVFoundation

/// 合図の音を鳴らす（spec.md 3.3, 3.4）。
///
/// - 実行中は無音をループ再生し続け、バックグラウンドや画面ロック中もアプリが止まらないようにする。
/// - オーディオセッションは `.mixWithOthers` にして、音楽アプリの曲を止めずに音を重ねる。
/// - 合図を鳴らす間だけ `.duckOthers` に切り替えて曲の音量を下げる。
///   ダッキングはセッションを有効にし直したときに反映されるため、切り替えのたびにセッションを無効化→有効化する。
final class AudioCuePlayer: CuePlaying {
    /// 合図が鳴り終わってから曲の音量を戻すまでの余裕。続けて鳴る合図（カウント音など）の間で音量が上下しないようにする。
    private static let duckRelease: Duration = .milliseconds(300)

    private let session = AVAudioSession.sharedInstance()
    private let engine = AVAudioEngine()
    private let keepAliveNode = AVAudioPlayerNode()
    private let cueNode = AVAudioPlayerNode()
    private let buffers: [Cue: AVAudioPCMBuffer]
    private let silence: AVAudioPCMBuffer

    private var isActive = false
    private var isDucking = false
    private var cueEndsAt: ContinuousClock.Instant = .now
    private var releaseTask: Task<Void, Never>?

    init() {
        let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 1)!
        buffers = Dictionary(uniqueKeysWithValues: [Cue.workStart, .restStart, .count, .finish].map {
            ($0, ToneFactory.buffer(for: $0, format: format))
        })
        silence = ToneFactory.silence(format: format, duration: 1)

        engine.attach(keepAliveNode)
        engine.attach(cueNode)
        do {
            try engine.connectNode(keepAliveNode, to: engine.mainMixerNode, format: format)
            try engine.connectNode(cueNode, to: engine.mainMixerNode, format: format)
        } catch {
            print("AudioCuePlayer: ノードの接続に失敗しました: \(error)")
        }

        observeSystemEvents()
    }

    func begin() {
        releaseTask?.cancel()
        releaseTask = nil
        isActive = true
        if engine.isRunning {
            // 一時停止の直後に再開した場合も、鳴っていた合図が終わったら曲の音量を戻す
            if isDucking {
                releaseTask = after(cueEndsAt + Self.duckRelease) { [weak self] in
                    self?.stopDucking()
                }
            }
        } else {
            isDucking = false
            activateSession()
        }
        startEngine()
    }

    func play(_ cue: Cue) {
        guard isActive, let buffer = buffers[cue] else { return }
        releaseTask?.cancel()
        if !isDucking {
            isDucking = true
            reactivateSession()
        }
        cueNode.scheduleBuffer(buffer, at: nil, options: .interrupts)
        do {
            try cueNode.playAudio()
        } catch {
            print("AudioCuePlayer: 合図の再生に失敗しました: \(error)")
        }
        cueEndsAt = .now + .seconds(ToneFactory.duration(of: buffer))
        releaseTask = after(cueEndsAt + Self.duckRelease) { [weak self] in
            self?.stopDucking()
        }
    }

    func end() {
        guard isActive else { return }
        isActive = false
        releaseTask?.cancel()
        // 鳴っている合図は最後まで鳴らしてから止める
        releaseTask = after(cueEndsAt + Self.duckRelease) { [weak self] in
            self?.tearDown()
        }
    }

    // MARK: - Session / Engine

    private func stopDucking() {
        guard isDucking else { return }
        isDucking = false
        reactivateSession()
    }

    private func activateSession() {
        var options: AVAudioSession.CategoryOptions = [.mixWithOthers]
        if isDucking {
            options.insert(.duckOthers)
        }
        do {
            try session.setCategory(.playback, mode: .default, options: options)
            try session.setActive(true)
        } catch {
            print("AudioCuePlayer: セッションの有効化に失敗しました: \(error)")
        }
    }

    /// ダッキングの切り替えを反映するため、セッションを無効化して有効にし直す。
    private func reactivateSession() {
        engine.pause()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        activateSession()
        startEngine()
    }

    private func startEngine() {
        if !engine.isRunning {
            do {
                try engine.start()
            } catch {
                print("AudioCuePlayer: エンジンの開始に失敗しました: \(error)")
                return
            }
        }
        if !keepAliveNode.isPlaying {
            keepAliveNode.scheduleBuffer(silence, at: nil, options: .loops)
            do {
                try keepAliveNode.playAudio()
            } catch {
                print("AudioCuePlayer: 無音の再生に失敗しました: \(error)")
            }
        }
    }

    private func tearDown() {
        releaseTask = nil
        isDucking = false
        keepAliveNode.stop()
        cueNode.stop()
        engine.stop()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// 電話などの割り込みや、イヤホンの抜き差しでエンジンが止まったときに再開する。
    private func restartAfterSystemStop() {
        guard isActive else { return }
        keepAliveNode.stop()
        activateSession()
        startEngine()
    }

    private func observeSystemEvents() {
        let center = NotificationCenter.default
        // 割り込みが終わったら、再開の推奨にかかわらず再開する（タイマー自体は割り込み中も進んでいるため）
        center.addObserver(forName: AVAudioSession.resumptionRecommendationNotification, object: session, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.restartAfterSystemStop()
            }
        }
        center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                self?.restartAfterSystemStop()
            }
        }
    }

    private func after(_ deadline: ContinuousClock.Instant, _ action: @escaping () -> Void) -> Task<Void, Never> {
        Task {
            try? await Task.sleep(until: deadline, clock: .continuous)
            guard !Task.isCancelled else { return }
            action()
        }
    }
}
