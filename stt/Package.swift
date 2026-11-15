// swift-tools-version: 5.10
// companion-stt: resident WhisperKit transcriber, one JSON line in, one JSON line out (03 DES-011).
// companion-tts: resident TTSKit reader (Qwen3-TTS), one JSON line in, one WAV line out (03 DES-016).
import PackageDescription

let package = Package(
    name: "companion-stt",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/argmaxinc/argmax-oss-swift", exact: "1.1.1"),
    ],
    targets: [
        .executableTarget(
            name: "companion-stt",
            dependencies: [.product(name: "WhisperKit", package: "argmax-oss-swift")],
            path: "Sources/CompanionSTT"
        ),
        .executableTarget(
            name: "companion-tts",
            dependencies: [.product(name: "TTSKit", package: "argmax-oss-swift")],
            path: "Sources/CompanionTTS"
        ),
    ]
)
