<#
.SYNOPSIS
  Mirror the current repository to a remote FTP/FTPS host without committing.

.DESCRIPTION
  Uses the WinSCP .NET assembly to synchronize the current working directory
  to the remote FTP target. This script does not make any git commits or alter
  your repository. It excludes dev/test folders and `api/config.local.php` by
  default.

.NOTES
  Requires WinSCP to be installed so WinSCPnet.dll is available. Run as:
    pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\deploy-local.ps1 -FTPS

#>

param(
    [switch]$FTPS,
    [string]$WinSCPExePath,
    [string]$WinSCPDllPath
)

function Fail([string]$msg) { Write-Error $msg; exit 1 }

# Locate WinSCP .NET assembly
# Build candidate DLL paths. If a path was provided use it; otherwise search common locations.
$possible = @()
if ($WinSCPDllPath) { $possible += $WinSCPDllPath }
if ($WinSCPExePath) {
    try { $exeDir = Split-Path -Path $WinSCPExePath -Parent; $possible += Join-Path $exeDir 'WinSCPnet.dll' } catch {}
}
$possible += @(
    "$env:ProgramFiles(x86)\WinSCP\WinSCPnet.dll",
    "$env:ProgramFiles\WinSCP\WinSCPnet.dll",
    "C:\Program Files (x86)\WinSCP\WinSCPnet.dll",
    "C:\Program Files\WinSCP\WinSCPnet.dll"
)

$dll = $possible | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $dll) {
    Fail "WinSCP .NET assembly not found. If WinSCP is installed, pass -WinSCPExePath 'C:\Program Files (x86)\WinSCP\WinSCP.exe' or download/copy WinSCPnet.dll into the WinSCP installation folder."
}

[Reflection.Assembly]::LoadFrom($dll) | Out-Null

function PromptIfEmpty([string]$envName, [string]$prompt) {
    if ($env:$envName) { return $env:$envName }
    Write-Host -NoNewline "$prompt: "
    $val = Read-Host
    return $val
}

$host = PromptIfEmpty 'FTP_HOST' 'FTP host (example: party.derrickthewhite.com)'
$user = PromptIfEmpty 'FTP_USER' 'FTP username'
$pass = $env:FTP_PASS
if (-not $pass) {
    $pass = Read-Host -AsSecureString 'FTP password (will not be stored)'
    $pass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($pass))
}
$remotePath = $env:FTP_TARGET
if (-not $remotePath) { $remotePath = Read-Host 'Remote target folder (example: public_html/staging)'
}

Write-Host "Using host: $host -> $remotePath (user: $user)"

$sessionOptions = New-Object WinSCP.SessionOptions
$sessionOptions.Protocol = [WinSCP.Protocol]::Ftp
$sessionOptions.HostName = $host
$sessionOptions.UserName = $user
$sessionOptions.Password = $pass

if ($FTPS) {
    $sessionOptions.FtpSecure = [WinSCP.FtpSecure]::Explicit
    # Accept server certificate even if CN mismatches when using IPs; prefer hostname.
    $sessionOptions.TlsHostCertificateFingerprint = $null
}

$transferOptions = New-Object WinSCP.TransferOptions
$transferOptions.TransferMode = [WinSCP.TransferMode]::Binary

# FileMask: exclude dev/test folders and local config
$excludes = @(
    'server/*', 'e2e/*', 'sql/*', 'data/*', 'node_modules/*', 'playwright-report/*', 'test-results/*', 'api/config.local.php'
)
$fileMask = ($excludes | ForEach-Object { "-" + $_ }) -join "; "
$transferOptions.FileMask = $fileMask

$session = New-Object WinSCP.Session
try {
    $session.Open($sessionOptions)

    $localPath = (Get-Location).Path
    Write-Host "Synchronizing local:$localPath -> remote:$remotePath (this will mirror and delete remote files not present locally)"

    $synchronizationMode = [WinSCP.SynchronizationMode]::Remote
    $session.SynchronizeDirectories($synchronizationMode, $localPath, $remotePath, $true, $transferOptions) | Out-Null

    $transferResult = $session.Close()
    Write-Host "Deploy complete."
}
catch {
    Write-Error "Deploy failed: $($_.Exception.Message)"
    exit 2
}
finally {
    if ($session -and $session.Opened) { $session.Dispose() }
}
