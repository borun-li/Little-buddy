import Foundation
import WhisperKit

// Usage: swift run ArgmaxSpike <audio-file>
let path = CommandLine.arguments.dropFirst().first ?? "../../test_audio/hello.wav"
let start = Date()
let pipe = try await WhisperKit(WhisperKitConfig(model: "large-v3-v20240930_626MB"))
print("model loaded in \(String(format: "%.1f", Date().timeIntervalSince(start)))s")

let t = Date()
let results = try await pipe.transcribe(audioPath: path)
print("transcribed in \(String(format: "%.1f", Date().timeIntervalSince(t)))s")
print("TEXT:", results.map(\.text).joined(separator: " "))
