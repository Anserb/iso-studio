param(
    [string]$NodeArchive,
    [string]$NuGetSource,
    [string]$Compiler
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root 'Windows/ISOStudio.Windows.csproj'
$version = ([xml](Get-Content -LiteralPath $project -Raw)).Project.PropertyGroup.Version
$release = Join-Path $root 'release'
$nodeVersion = '26.13.1'
$archiveName = "node-v$nodeVersion-win-x64.zip"
$nodeHash = 'E2EDDA75BFB089654705CF65A13B58933BFD5F57148E8EBDA916F58A2474F1F7'

if (-not $Compiler) {
    $Compiler = (Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source
}
if (-not $Compiler) {
    $Compiler = @(
        (Join-Path $env:LOCALAPPDATA 'Programs/Inno Setup 6/ISCC.exe')
        (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6/ISCC.exe')
        (Join-Path $env:ProgramFiles 'Inno Setup 6/ISCC.exe')
    ) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}
if (-not $Compiler -or -not (Test-Path -LiteralPath $Compiler -PathType Leaf)) {
    throw 'Install Inno Setup 6 or pass the path to ISCC.exe with -Compiler.'
}

New-Item -ItemType Directory -Force -Path $release | Out-Null
if (-not $NodeArchive) {
    $NodeArchive = Join-Path $release $archiveName
    if (-not (Test-Path -LiteralPath $NodeArchive)) {
        $download = $NodeArchive + '.part'
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v$nodeVersion/$archiveName" -OutFile $download
        if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne $nodeHash) {
            throw 'The downloaded Node.js archive SHA-256 does not match.'
        }
        Move-Item -LiteralPath $download -Destination $NodeArchive
    }
}
if ((Get-FileHash -LiteralPath $NodeArchive -Algorithm SHA256).Hash -ne $nodeHash) {
    throw 'The Node.js archive SHA-256 does not match.'
}
$archivePath = (Resolve-Path -LiteralPath $NodeArchive).Path

$stage = Join-Path $release ([guid]::NewGuid().ToString('N'))
$payload = Join-Path $stage 'payload'
$runtime = Join-Path $payload 'runtime'
New-Item -ItemType Directory -Path $stage | Out-Null
try {
    $publish = @('publish', $project, '-c', 'Release', '-r', 'win-x64', '--self-contained', 'true',
        '-o', $payload, '-p:DebugType=None', '-p:DebugSymbols=false', '--nologo')
    if ($NuGetSource) { $publish += @('--source', $NuGetSource) }
    & dotnet @publish
    if ($LASTEXITCODE -ne 0) { throw 'Desktop application publish failed.' }

    New-Item -ItemType Directory -Path $runtime | Out-Null
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($archivePath)
    try {
        foreach ($name in 'node.exe', 'LICENSE') {
            $entry = $zip.GetEntry("node-v$nodeVersion-win-x64/$name")
            if (-not $entry) { throw "Missing file in Node.js archive: $name" }
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $runtime $name))
        }
    } finally {
        $zip.Dispose()
    }
    Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination $payload
    Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination $payload

    & $Compiler '/Q' "/DAppVersion=$version" "/DPayloadDir=$payload" "/O$stage" (Join-Path $PSScriptRoot 'iso-studio.iss')
    if ($LASTEXITCODE -ne 0) { throw 'Inno Setup compilation failed.' }
    $setup = Join-Path $release 'LinuxStudioSetup.exe'
    Move-Item -LiteralPath (Join-Path $stage 'LinuxStudioSetup.exe') -Destination $setup -Force
    Write-Host "Installer: $setup"
    Get-FileHash -LiteralPath $setup -Algorithm SHA256
} finally {
    $resolved = (Resolve-Path -LiteralPath $stage).Path
    if ((Split-Path -Parent $resolved) -eq (Resolve-Path -LiteralPath $release).Path) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
