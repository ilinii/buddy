fn main() {
    println!("cargo:rerun-if-changed=native/macos_audio.m");
    println!("cargo:rerun-if-changed=native/macos_audio.h");
    println!("cargo:rerun-if-changed=native/ios_audio.m");
    println!("cargo:rerun-if-changed=native/ios_audio.h");
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        cc::Build::new()
            .file("native/ios_audio.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .warnings(true)
            .compile("buddy_ios_audio");
        for framework in ["Foundation", "AVFoundation", "AudioToolbox", "UIKit"] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rustc-link-lib=objc");
    }
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        cc::Build::new()
            .file("native/macos_audio.m")
            .flag("-fobjc-arc")
            .flag("-fblocks")
            .flag("-mmacosx-version-min=13.0")
            .warnings(true)
            .compile("buddy_macos_audio");
        for framework in [
            "Foundation",
            "AVFoundation",
            "ScreenCaptureKit",
            "CoreGraphics",
            "CoreMedia",
            "AudioToolbox",
        ] {
            println!("cargo:rustc-link-lib=framework={framework}");
        }
        println!("cargo:rustc-link-lib=objc");
    }
    tauri_build::build();
}
