// companion-stt --model-folder <dir> --tokenizer-folder <dir>
// stdin:  one line {"id":n,"pcm16":"<base64 Int16 LE mono 16 kHz>"} per request
// stdout: {"event":"ready",...} once, then one line {"id","text","lang","ms"} or {"id","ms","error"} per request
// stderr: timings only. Never downloads (download: false), never writes audio to disk.
import Foundation
import WhisperKit

struct Request: Decodable { let id: Int; let pcm16: String }
struct Reply: Encodable { let id: Int; let text: String?; let lang: String?; let ms: Int; let error: String? }
struct ReadyEvent: Encodable { let event = "ready"; let load_ms: Int; let warm_ms: Int }

func emit<T: Encodable>(_ value: T) {
    guard var data = try? JSONEncoder().encode(value) else {
        FileHandle.standardError.write(Data("companion-stt: encode failed\n".utf8))
        return
    }
    data.append(0x0A)
    FileHandle.standardOutput.write(data)  // unbuffered: one write per line
}

func logTiming(_ line: String) {
    FileHandle.standardError.write(Data((line + "\n").utf8))
}

func elapsedMs(since start: Date) -> Int { Int(Date().timeIntervalSince(start) * 1000) }

func argument(_ name: String) -> String? {
    let args = CommandLine.arguments
    guard let i = args.firstIndex(of: name), i + 1 < args.count else { return nil }
    return args[i + 1]
}

/// Int16 little-endian PCM → Float in [-1, 1). nil when the base64 is invalid.
func samples(fromBase64 b64: String) -> [Float]? {
    guard let data = Data(base64Encoded: b64) else { return nil }
    let count = data.count / 2
    var out = [Float](repeating: 0, count: count)
    data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
        for i in 0..<count {
            let lo = UInt16(raw[2 * i]), hi = UInt16(raw[2 * i + 1])
            out[i] = Float(Int16(bitPattern: lo | (hi << 8))) / 32768
        }
    }
    return out
}

/// Energy gate (WhisperKit 1.1.1 hard-codes noSpeechProb = 0): ≥ 3 frames of 0.1 s with RMS > 0.02.
let vad = EnergyVAD(frameLength: 0.1, energyThreshold: 0.02)
func hasSpeech(_ s: [Float]) -> Bool {
    vad.voiceActivity(in: s).filter { $0 }.count >= 3
}

/// fellBack: WhisperKit rejected every segment's temperature-0 decode (logProbThreshold / compressionRatioThreshold) and sampled a fallback.
func transcribe(_ kit: WhisperKit, _ s: [Float], language: String) async throws -> (text: String, avgLogprob: Float, fellBack: Bool) {
    let options = DecodingOptions(
        task: .transcribe, language: language, temperature: 0, usePrefillPrompt: true, detectLanguage: false,
        skipSpecialTokens: true, withoutTimestamps: true, chunkingStrategy: .vad
    )
    let segments = try await kit.transcribe(audioArray: s, decodeOptions: options).flatMap(\.segments)
    let joined = segments.map(\.text).joined(separator: language == "zh" ? "" : " ")
    let text = joined.trimmingCharacters(in: .whitespacesAndNewlines)
    let avg = segments.isEmpty ? -Float.infinity : segments.map(\.avgLogprob).reduce(0, +) / Float(segments.count)
    let fellBack = !segments.isEmpty && segments.allSatisfy { $0.temperature > 0 }
    return (text, avg, fellBack)
}

/// Noise that passed the energy gate (FND-002): an unsure language AND a fallback decode. Both must agree (03 DES-011).
func isNoise(langLogprob: Float, fellBack: Bool) -> Bool {
    langLogprob < -0.5 && fellBack
}

func simplified(_ s: String) -> String {
    s.applyingTransform(StringTransform("Hant-Hans"), reverse: false) ?? s
}

func hasWordCharacters(_ s: String) -> Bool {
    s.unicodeScalars.contains { CharacterSet.alphanumerics.contains($0) }
}

func handle(_ kit: WhisperKit, _ line: String) async -> Reply {
    let start = Date()
    guard let request = try? JSONDecoder().decode(Request.self, from: Data(line.utf8)) else {
        return Reply(id: -1, text: nil, lang: nil, ms: elapsedMs(since: start), error: "bad_request")
    }
    guard let audio = samples(fromBase64: request.pcm16) else {
        return Reply(id: request.id, text: nil, lang: nil, ms: elapsedMs(since: start), error: "bad_audio")
    }
    guard hasSpeech(audio) else {
        return Reply(id: request.id, text: "", lang: nil, ms: elapsedMs(since: start), error: nil)
    }
    do {
        let det = try await kit.detectLangauge(audioArray: audio)
        let detected = det.language
        let langLogprob = det.langProbs[detected] ?? 0
        var language = detected
        var text: String
        var fellBack: Bool
        if detected == "zh" || detected == "en" {
            (text, _, fellBack) = try await transcribe(kit, audio, language: detected)
        } else {
            let zh = try await transcribe(kit, audio, language: "zh")
            let en = try await transcribe(kit, audio, language: "en")
            (language, text, fellBack) = zh.avgLogprob >= en.avgLogprob ? ("zh", zh.text, zh.fellBack) : ("en", en.text, en.fellBack)
        }
        if language == "zh" { text = simplified(text) }
        if !hasWordCharacters(text) { text = "" }
        if isNoise(langLogprob: langLogprob, fellBack: fellBack) {
            return Reply(id: request.id, text: "", lang: nil, ms: elapsedMs(since: start), error: nil)
        }
        return Reply(id: request.id, text: text, lang: language, ms: elapsedMs(since: start), error: nil)
    } catch {
        logTiming("companion-stt: whisperkit error \(type(of: error))")
        return Reply(id: request.id, text: nil, lang: nil, ms: elapsedMs(since: start), error: "whisperkit")
    }
}

guard let modelFolder = argument("--model-folder"), let tokenizerFolder = argument("--tokenizer-folder") else {
    logTiming("usage: companion-stt --model-folder <dir> --tokenizer-folder <dir>")
    exit(2)
}

let loadStart = Date()
let kit = try await WhisperKit(WhisperKitConfig(
    modelFolder: modelFolder, tokenizerFolder: URL(fileURLWithPath: tokenizerFolder),
    verbose: false, logLevel: .error, prewarm: false, load: true, download: false
))
let loadMs = elapsedMs(since: loadStart)

let warmStart = Date()
let silence = [Float](repeating: 0, count: WhisperKit.sampleRate)
_ = try await transcribe(kit, silence, language: "en")
_ = try await kit.detectLangauge(audioArray: silence)
let warmMs = elapsedMs(since: warmStart)
emit(ReadyEvent(load_ms: loadMs, warm_ms: warmMs))
logTiming("companion-stt: load_ms=\(loadMs) warm_ms=\(warmMs)")

while let line = readLine(strippingNewline: true) {
    if line.isEmpty { continue }
    let reply = await handle(kit, line)
    emit(reply)
    logTiming("companion-stt: id=\(reply.id) ms=\(reply.ms)")
}
