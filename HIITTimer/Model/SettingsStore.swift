import Foundation

/// 前回使った設定を端末に保存する（spec.md 3.6）
struct SettingsStore {
    private enum Key {
        static let workSeconds = "workSeconds"
        static let restSeconds = "restSeconds"
        static let rounds = "rounds"
    }

    let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// 保存された設定がなければ初期値を返す。
    func load() -> TimerSettings {
        guard defaults.object(forKey: Key.workSeconds) != nil,
              defaults.object(forKey: Key.restSeconds) != nil,
              defaults.object(forKey: Key.rounds) != nil else {
            return .default
        }
        return TimerSettings(
            workSeconds: defaults.integer(forKey: Key.workSeconds),
            restSeconds: defaults.integer(forKey: Key.restSeconds),
            rounds: defaults.integer(forKey: Key.rounds)
        ).normalized()
    }

    func save(_ settings: TimerSettings) {
        let settings = settings.normalized()
        defaults.set(settings.workSeconds, forKey: Key.workSeconds)
        defaults.set(settings.restSeconds, forKey: Key.restSeconds)
        defaults.set(settings.rounds, forKey: Key.rounds)
    }
}
