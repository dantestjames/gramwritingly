// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "GWHelper",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "gw-helper", targets: ["GWHelper"]),
    ],
    targets: [
        // Pure logic with no AppKit or Accessibility calls, so it can be unit tested.
        .target(name: "GWHelperCore"),
        // The background process: watches the focused text field, draws underlines, applies fixes.
        .executableTarget(name: "GWHelper", dependencies: ["GWHelperCore"]),
        .testTarget(name: "GWHelperCoreTests", dependencies: ["GWHelperCore"]),
    ]
)
