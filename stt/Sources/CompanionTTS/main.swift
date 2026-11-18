// companion-tts --model-folder <dir holding qwen3_tts/> --tokenizer-folder <dir holding tokenizer.json> --voice <speaker>
// stdin:  one line {"id":n,"text":"...","lang":"zh"|"en","voice":"<speaker>"} per request; voice absent = the --voice speaker (R2 DES-040)
// stdout: {"event":"ready",...} once, then one line {"id","wav":"<base64 WAV PCM16 mono>","ms","audio_ms","voice"} or {"id","ms","error"[,"voice"]}
//         per request; "voice" = the speaker actually used (the gateway checks it to spot a stale helper)
// stderr: timings only. Never downloads (download: false, explicit folders), never writes audio to disk (03 DES-016).
import Foundation
import TTSKit

struct Request: Decodable { let id: Int; let text: String; let lang: String; let voice: String? }
struct Reply: Encodable { let id: Int; let wav: String?; let ms: Int; let audio_ms: Int?; let voice: String?; let error: String? }
struct ReadyEvent: Encodable { let event = "ready"; let load_ms: Int; let warm_ms: Int }

/// Qwen3Language raw values for the two reply languages.
let LANGUAGE = ["zh": "chinese", "en": "english"]
/// 120 frames of 80 ms: at most 9.6 s of audio per request. One pass (no chunking), so the cap bounds the whole request
/// (FND-016). The `as` matters: a bare `.none` here is Optional.none (nil), which TTSKit treats as `.sentence`.
let OPTIONS = GenerationOptions(maxNewTokens: 120, chunkingStrategy: .none as TextChunkingStrategy)

func emit<T: Encodable>(_ value: T) {
    guard var data = try? JSONEncoder().encode(value) else {
        FileHandle.standardError.write(Data("companion-tts: encode failed\n".utf8))
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

/// 44-byte RIFF/WAVE header, PCM format 1, mono, 16-bit little-endian; samples clamped to [-1, 1].
func wav16(_ samples: [Float], sampleRate: Int) -> Data {
    var d = Data()
    d.reserveCapacity(44 + samples.count * 2)
    func u32(_ v: UInt32) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
    func u16(_ v: UInt16) { withUnsafeBytes(of: v.littleEndian) { d.append(contentsOf: $0) } }
    let dataBytes = UInt32(samples.count * 2)
    d.append(contentsOf: Array("RIFF".utf8)); u32(36 + dataBytes); d.append(contentsOf: Array("WAVE".utf8))
    d.append(contentsOf: Array("fmt ".utf8)); u32(16); u16(1); u16(1); u32(UInt32(sampleRate)); u32(UInt32(sampleRate * 2)); u16(2); u16(16)
    d.append(contentsOf: Array("data".utf8)); u32(dataBytes)
    for s in samples { u16(UInt16(bitPattern: Int16(max(-1, min(1, s)) * 32767))) }
    return d
}

guard let modelFolder = argument("--model-folder"), let tokenizerFolder = argument("--tokenizer-folder"), let startVoice = argument("--voice"),
      Qwen3Speaker(rawValue: startVoice) != nil else {
    logTiming("usage: companion-tts --model-folder <dir> --tokenizer-folder <dir> --voice <\(Qwen3Speaker.allCases.map(\.rawValue).joined(separator: "|"))>")
    exit(2)
}

let loadStart = Date()
let tts = try await TTSKit(TTSKitConfig(
    modelFolder: URL(fileURLWithPath: modelFolder), tokenizerFolder: URL(fileURLWithPath: tokenizerFolder),
    verbose: false, logLevel: .error, download: false, load: true
))
let loadMs = elapsedMs(since: loadStart)

// Prompt caches of one voice only (cacheVoice), per language. Start: warm both languages of --voice, so alternating languages
// never rebuilds one. A line in another voice drops them and builds that voice's cache per language on first use (DES-040).
final class VoiceCaches {
    var voice: String
    var byLang: [String: TTSPromptCache] = [:]
    init(voice: String) { self.voice = voice }
}
let warmStart = Date()
let caches = VoiceCaches(voice: startVoice)
for (lang, name) in LANGUAGE {
    caches.byLang[lang] = try await tts.buildPromptCache(voice: startVoice, language: name)
    _ = try await tts.generate(text: lang == "zh" ? "你好。" : "Hello.", voice: startVoice, language: name, options: OPTIONS)
}
let warmMs = elapsedMs(since: warmStart)
emit(ReadyEvent(load_ms: loadMs, warm_ms: warmMs))
logTiming("companion-tts: load_ms=\(loadMs) warm_ms=\(warmMs)")

func handle(_ line: String, caches: VoiceCaches) async -> Reply {
    let start = Date()
    guard let req = try? JSONDecoder().decode(Request.self, from: Data(line.utf8)) else {
        return Reply(id: -1, wav: nil, ms: elapsedMs(since: start), audio_ms: nil, voice: nil, error: "bad_request")
    }
    let text = req.text.trimmingCharacters(in: .whitespacesAndNewlines)
    let voice = req.voice ?? startVoice
    // An unknown speaker is refused here: TTSKit would read it silently as ryan.
    guard let name = LANGUAGE[req.lang], !text.isEmpty, Qwen3Speaker(rawValue: voice) != nil else {
        return Reply(id: req.id, wav: nil, ms: elapsedMs(since: start), audio_ms: nil, voice: nil, error: "bad_request")
    }
    do {
        if voice != caches.voice {
            caches.byLang = [:]
            caches.voice = voice
        }
        if caches.byLang[req.lang] == nil {
            let cacheStart = Date()
            caches.byLang[req.lang] = try await tts.buildPromptCache(voice: voice, language: name)
            logTiming("companion-tts: cache voice=\(voice) lang=\(req.lang) ms=\(elapsedMs(since: cacheStart))")
        }
        tts.promptCache = caches.byLang[req.lang]
        let r = try await tts.generate(text: text, voice: voice, language: name, options: OPTIONS)
        let wav = wav16(r.audio, sampleRate: r.sampleRate)
        return Reply(id: req.id, wav: wav.base64EncodedString(), ms: elapsedMs(since: start), audio_ms: Int(r.audioDuration * 1000), voice: voice, error: nil)
    } catch {
        logTiming("companion-tts: ttskit error \(type(of: error))")
        return Reply(id: req.id, wav: nil, ms: elapsedMs(since: start), audio_ms: nil, voice: voice, error: "ttskit")
    }
}

while let line = readLine(strippingNewline: true) {
    if line.isEmpty { continue }
    let reply = await handle(line, caches: caches)
    emit(reply)
    logTiming("companion-tts: id=\(reply.id) ms=\(reply.ms) audio_ms=\(reply.audio_ms ?? -1) voice=\(reply.voice ?? "-")")
}
