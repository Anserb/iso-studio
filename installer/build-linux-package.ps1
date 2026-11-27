$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$output = Join-Path $root 'docs/linux-studio-linux.tar.gz'
$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("linux-studio-" + [guid]::NewGuid())
$stage = Join-Path $temp 'LinuxStudio'
$archive = Join-Path $temp 'linux-studio-linux.tar.gz'
$files = @(
    'app.mjs', 'catalog.mjs', 'index.html', 'other-builders.mjs', 'recipe.mjs',
    'server.mjs', 'style.css', 'updates.mjs', 'wsl-build.mjs', 'desktop-appearance.mjs', 'linux-apps.mjs', 'app-library.mjs', 'app-installer.mjs', 'Linux/install.mjs', 'Linux/launch.mjs', 'README.md', 'LICENSE'
)

try {
    foreach ($file in $files) {
        $destination = Join-Path $stage $file
        [void][System.IO.Directory]::CreateDirectory((Split-Path -Parent $destination))
        Copy-Item -LiteralPath (Join-Path $root $file) -Destination $destination
    }
    & tar -czf $archive -C $temp LinuxStudio
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create the Linux archive.' }
    Copy-Item -LiteralPath $archive -Destination $output -Force
    Write-Output $output
}
finally {
    # The staging directory was generated for this invocation under the system temp directory.
    if (Test-Path -LiteralPath $temp) {
        $resolved = (Resolve-Path -LiteralPath $temp).Path
        if ($resolved -eq [System.IO.Path]::GetFullPath($temp)) {
            Remove-Item -LiteralPath $resolved -Recurse -Force
        }
    }
}
