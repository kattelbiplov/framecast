// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "FramecastCapture",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "framecast-capture", targets: ["FramecastCapture"])],
    targets: [
        .executableTarget(
            name: "FramecastCapture",
            path: "Sources/FramecastCapture",
            linkerSettings: [
                .linkedFramework("ScreenCaptureKit"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("CoreMedia"),
                .linkedFramework("CoreGraphics"),
            ]
        ),
    ]
)
