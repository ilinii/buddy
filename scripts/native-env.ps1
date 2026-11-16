# Process-only build environment. Does not modify machine or user settings.
$buddyProjectRoot = Split-Path -Parent $PSScriptRoot
$buddyCargo = Join-Path $buddyProjectRoot '.toolchain/cargo'
if (Test-Path -LiteralPath (Join-Path $buddyCargo 'bin/cargo.exe')) {
    $env:CARGO_HOME = $buddyCargo
    $env:RUSTUP_HOME = Join-Path $buddyProjectRoot '.toolchain/rustup'
    $env:PATH = (Join-Path $buddyCargo 'bin') + ';' + $env:PATH
}
$buddyVsWhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if (Test-Path -LiteralPath $buddyVsWhere) {
    $buddyVs = & $buddyVsWhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($buddyVs) {
        $buddyMsvc = Get-ChildItem -LiteralPath (Join-Path $buddyVs 'VC/Tools/MSVC') -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'lib/x64/msvcrt.lib') } | Sort-Object Name -Descending | Select-Object -First 1
        if ($buddyMsvc) {
            Import-Module (Join-Path $buddyVs 'Common7/Tools/Microsoft.VisualStudio.DevShell.dll')
            Enter-VsDevShell -VsInstallPath $buddyVs -SkipAutomaticLocation -DevCmdArguments "-arch=x64 -host_arch=x64 -vcvars_ver=$($buddyMsvc.Name)" | Out-Null
            $env:CC = Join-Path $buddyMsvc.FullName 'bin/Hostx64/x64/cl.exe'
            $env:CXX = $env:CC
            $env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = Join-Path $buddyMsvc.FullName 'bin/Hostx64/x64/link.exe'
        }
        $buddyCmake = Join-Path $buddyVs 'Common7/IDE/CommonExtensions/Microsoft/CMake'
        if (Test-Path -LiteralPath (Join-Path $buddyCmake 'Ninja/ninja.exe')) {
            $env:PATH = (Join-Path $buddyCmake 'CMake/bin') + ';' + (Join-Path $buddyCmake 'Ninja') + ';' + $env:PATH
            $env:CMAKE_GENERATOR = 'Ninja'
        }
    }
}
Remove-Item Env:WHISPER_DONT_GENERATE_BINDINGS -ErrorAction SilentlyContinue
$buddyClang = Join-Path $buddyProjectRoot '.toolchain/libclang'
if (Test-Path -LiteralPath (Join-Path $buddyClang 'libclang.dll')) { $env:LIBCLANG_PATH = $buddyClang }
