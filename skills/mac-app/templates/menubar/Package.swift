// swift-tools-version:5.10
import PackageDescription

let package = Package(
    name: "App",
    platforms: [.macOS(.v14)],
    targets: [.executableTarget(name: "App", path: "Sources/App")]
)
