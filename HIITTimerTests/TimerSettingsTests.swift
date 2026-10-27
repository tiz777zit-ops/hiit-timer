import Foundation
import Testing
@testable import HIITTimer

struct TimerSettingsTests {
    @Test func defaultValuesMatchSpec() {
        #expect(TimerSettings.default == TimerSettings(workSeconds: 20, restSeconds: 10, rounds: 8))
    }

    @Test func normalizedClampsToRange() {
        let settings = TimerSettings(workSeconds: 0, restSeconds: 1000, rounds: 99).normalized()
        #expect(settings == TimerSettings(workSeconds: 5, restSeconds: 300, rounds: 30))
    }

    @Test func normalizedSnapsSecondsToStep() {
        let settings = TimerSettings(workSeconds: 22, restSeconds: 13, rounds: 0).normalized()
        #expect(settings == TimerSettings(workSeconds: 20, restSeconds: 15, rounds: 1))
    }
}

struct SettingsStoreTests {
    private func makeStore() -> SettingsStore {
        let suite = "SettingsStoreTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return SettingsStore(defaults: defaults)
    }

    @Test func loadReturnsDefaultWhenNothingSaved() {
        #expect(makeStore().load() == .default)
    }

    @Test func savedSettingsAreLoaded() {
        let store = makeStore()
        let settings = TimerSettings(workSeconds: 45, restSeconds: 15, rounds: 12)
        store.save(settings)
        #expect(store.load() == settings)
    }

    @Test func invalidStoredValuesAreNormalized() {
        let store = makeStore()
        store.defaults.set(3, forKey: "workSeconds")
        store.defaults.set(301, forKey: "restSeconds")
        store.defaults.set(0, forKey: "rounds")
        #expect(store.load() == TimerSettings(workSeconds: 5, restSeconds: 300, rounds: 1))
    }
}
