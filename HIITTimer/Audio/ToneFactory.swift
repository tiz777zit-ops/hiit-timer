import AVFoundation

/// 合図の音をサイン波で生成する。音声ファイルは使わない。
enum ToneFactory {
    private struct Note {
        let frequency: Double
        let duration: Double
    }

    /// 4 種類の合図はそれぞれ別の音にする（spec.md 3.3）
    private static func notes(for cue: Cue) -> [Note] {
        switch cue {
        case .workStart:
            [Note(frequency: 880, duration: 0.45)]
        case .restStart:
            [Note(frequency: 440, duration: 0.45)]
        case .count:
            [Note(frequency: 660, duration: 0.12)]
        case .finish:
            [Note(frequency: 660, duration: 0.18),
             Note(frequency: 880, duration: 0.18),
             Note(frequency: 1320, duration: 0.4)]
        }
    }

    private static let amplitude: Float = 0.6
    /// 音の始まりと終わりのプチッというノイズを防ぐフェード時間
    private static let fade: Double = 0.01

    static func buffer(for cue: Cue, format: AVAudioFormat) -> AVAudioPCMBuffer {
        let sampleRate = format.sampleRate
        let notes = notes(for: cue)
        let totalFrames = notes.reduce(0) { $0 + AVAudioFrameCount($1.duration * sampleRate) }
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: totalFrames)!
        buffer.frameLength = totalFrames

        let fadeFrames = Int(fade * sampleRate)
        var offset = 0
        for note in notes {
            let frames = Int(note.duration * sampleRate)
            for i in 0..<frames {
                let envelope = Float(min(1, Double(min(i, frames - 1 - i)) / Double(fadeFrames)))
                let value = amplitude * envelope * Float(sin(2 * .pi * note.frequency * Double(i) / sampleRate))
                for channel in 0..<Int(format.channelCount) {
                    buffer.floatChannelData![channel][offset + i] = value
                }
            }
            offset += frames
        }
        return buffer
    }

    static func silence(format: AVAudioFormat, duration: Double) -> AVAudioPCMBuffer {
        let frames = AVAudioFrameCount(duration * format.sampleRate)
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        buffer.frameLength = frames
        for channel in 0..<Int(format.channelCount) {
            buffer.floatChannelData![channel].update(repeating: 0, count: Int(frames))
        }
        return buffer
    }

    static func duration(of buffer: AVAudioPCMBuffer) -> Double {
        Double(buffer.frameLength) / buffer.format.sampleRate
    }
}
