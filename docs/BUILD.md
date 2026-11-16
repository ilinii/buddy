# Build Buddy

Use Node 24+, npm and Rust 1.90+. Start with `npm ci`, then `npm run dev` for browser development. No provider key is needed for local notes and source search.

Windows native builds need MSVC C++ Build Tools/Windows SDK, WebView2, CMake/Ninja and libclang. macOS needs Xcode Command Line Tools, CMake and libclang. Follow https://v2.tauri.app/start/prerequisites/ . `scripts/native-env.ps1` discovers a local Windows toolchain without changing system settings. iPhone builds need a Mac with Xcode.

`npm run desktop` runs Tauri. `npm run desktop:package` prepares the pinned speech model and builds platform packages. The model download is about 148 MB and is checksum-verified. Model weights and generated installers stay ignored. The Windows outer setup wraps an NSIS payload; signing and clean-machine acceptance are separate tasks.

Run shared checks and native tests before packaging. The project does not ship developer API keys, signing certificates, a prepopulated workspace or a cloud subscription.
