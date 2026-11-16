param([switch]$Build)
$projectRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "native-env.ps1")
Push-Location -LiteralPath $projectRoot
try {
    if ($Build) { npm run desktop:package } else { npm run desktop }
    exit $LASTEXITCODE
} finally { Pop-Location }
