// swift-tools-version: 5.10
// Spike: can we build a Swift program that uses Argmax OSS (WhisperKit) with only Command Line Tools?
import PackageDescription

let package = Package(
    name: "ArgmaxSpike",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(url: "https://github.com/argmaxinc/argmax-oss-swift", from: "1.1.1"),
    ],
    targets: [
        .executableTarget(
            name: "ArgmaxSpike",
            dependencies: [.product(name: "WhisperKit", package: "argmax-oss-swift")]
        ),
    ]
)
