# EROS local-fork installer for Windows
# Usage: .\scripts\install.ps1 [-Source|-Binary]

param(
    [switch]$Source,
    [switch]$Binary,
    [string]$Ref
)

$ErrorActionPreference = "Stop"
$MinimumBunVersion = [version]"1.4.0"
$InstallDir = if ($env:PI_INSTALL_DIR) { $env:PI_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "Eros" }

if ($Source -and $Binary) {
    throw "Choose either -Source or -Binary, not both."
}
if ($Ref) {
    throw "EROS has no public release remote. Check out the desired ref locally, then rerun without -Ref."
}
if (-not $PSScriptRoot) {
    throw "Run scripts\install.ps1 from a complete EROS checkout."
}

$CheckoutRoot = Split-Path -Parent $PSScriptRoot
$PackageDir = Join-Path $CheckoutRoot "packages\coding-agent"
$BuiltBinary = Join-Path $PackageDir "dist\eros-omp.exe"
if (-not (Test-Path $BuiltBinary)) {
    $BuiltBinary = Join-Path $PackageDir "dist\eros-omp"
}

function Assert-Bun {
    $bun = Get-Command bun -ErrorAction SilentlyContinue
    if (-not $bun) {
        Write-Host "Installing Bun $MinimumBunVersion or newer..."
        irm bun.sh/install.ps1 | iex
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "User") + ";" + [Environment]::GetEnvironmentVariable("Path", "Machine")
    }

    $rawVersion = bun --version
    if ($LASTEXITCODE -ne 0 -or -not $rawVersion) {
        throw "Failed to read the Bun version."
    }
    $currentVersion = [version]($rawVersion.Trim().Split("-")[0])
    if ($currentVersion -lt $MinimumBunVersion) {
        throw "Bun $MinimumBunVersion or newer is required. Current version: $currentVersion."
    }
}

function Build-Eros {
    if (-not (Test-Path $PackageDir)) {
        throw "Run this installer from a complete EROS checkout."
    }

    Assert-Bun
    Push-Location $CheckoutRoot
    try {
        bun install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw "bun install failed." }
        bun run build:native
        if ($LASTEXITCODE -ne 0) { throw "Native build failed." }
        bun --cwd=packages/coding-agent run build
        if ($LASTEXITCODE -ne 0) { throw "EROS binary build failed." }
    } finally {
        Pop-Location
    }
}

function Install-ErosBinary {
    if (-not (Test-Path $BuiltBinary)) {
        throw "No built EROS binary was found. Run .\scripts\install.ps1 -Source first."
    }

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    $outPath = Join-Path $InstallDir "eros.exe"
    Copy-Item -Force $BuiltBinary $outPath
    & $outPath --version | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "EROS was copied to $outPath but could not start."
    }

    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $pathEntries = @($userPath -split ";" | Where-Object { $_ })
    if ($pathEntries -notcontains $InstallDir) {
        $newPath = if ($userPath) { "$userPath;$InstallDir" } else { $InstallDir }
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Write-Host "Added $InstallDir to the user PATH; restart the terminal before invoking eros."
    }

    Write-Host "EROS is installed at $outPath" -ForegroundColor Green
}

if ($Source) {
    Build-Eros
} elseif (-not $Binary -and -not (Test-Path $BuiltBinary)) {
    Build-Eros
}

Install-ErosBinary
