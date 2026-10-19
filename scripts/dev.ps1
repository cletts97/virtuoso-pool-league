# Uses an installed Node.js, or the project-local runtime prepared for this workspace.
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    $portableRuntime = Join-Path $projectRoot '.tools/node-v22.16.0-win-x64'
    if (-not (Test-Path -LiteralPath (Join-Path $portableRuntime 'node.exe'))) {
        throw 'Install Node.js 22.12 or newer, reopen your terminal, then run npm install and npm run dev.'
    }
    $env:PATH = "$portableRuntime;$env:PATH"
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
    throw 'Dependencies are missing. Run npm install before starting the development server.'
}
& npm.cmd run dev
exit $LASTEXITCODE
