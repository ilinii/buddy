import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const [mode = 'dev', ...args] = process.argv.slice(2);
if (!['setup', 'dev', 'build', 'check'].includes(mode)) throw new Error('Use ios.mjs setup|dev|build|check');
if (process.platform !== 'darwin') {
  console.error('iPhone builds require macOS and full Xcode. Preview the shared phone UI with npm run dev on Windows. See docs/IPHONE.md.');
  process.exit(1);
}
function run(command, argv, options = {}) {
  const result = spawnSync(command, argv, { stdio: 'inherit', ...options });
  if (result.error) throw new Error(`Install ${command} on this Mac before continuing: ${result.error.message}`);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const simulator = process.arch === 'arm64' ? 'aarch64-apple-ios-sim' : 'x86_64-apple-ios';
run('xcodebuild', ['-version']);
run('xcrun', ['--sdk', 'iphoneos', '--show-sdk-path']);
run('cmake', ['--version']);
if (mode === 'setup') {
  run('rustup', ['target', 'add', 'aarch64-apple-ios', simulator]);
  if (existsSync('src-tauri/gen/apple/project.yml')) {
    console.log('iOS project already exists; leaving your Xcode/signing edits intact.');
  } else {
    run('npx', ['--no-install', 'tauri', 'ios', 'init']);
  }
} else if (mode === 'check') {
  const sdkResult = spawnSync('xcrun', ['--sdk', 'iphonesimulator', '--show-sdk-path'], { encoding: 'utf8' });
  if (sdkResult.status !== 0) throw new Error('Install the iOS Simulator SDK in Xcode first.');
  const sdk = sdkResult.stdout.trim();
  run('cargo', ['check', '--manifest-path', 'src-tauri/Cargo.toml', '--lib', '--target', simulator], {
    env: { ...process.env, IPHONEOS_DEPLOYMENT_TARGET: '17.0',
      BINDGEN_EXTRA_CLANG_ARGS: `-isysroot "${sdk}"`,
      CMAKE_OSX_SYSROOT: sdk, GGML_NATIVE: 'OFF', GGML_OPENMP: 'OFF' },
  });
} else {
  if (!existsSync('src-tauri/gen/apple/project.yml')) throw new Error('Run npm run ios:setup on your Mac first.');
  run('npx', ['--no-install', 'tauri', 'ios', mode, ...args]);
}
