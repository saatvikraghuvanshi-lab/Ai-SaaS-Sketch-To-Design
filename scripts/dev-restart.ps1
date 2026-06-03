$ErrorActionPreference = "Stop"

$project = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$port = 3000
$out = Join-Path $project "next-dev.out.log"
$err = Join-Path $project "next-dev.err.log"

Write-Host "Restarting S2C dev server in $project"

function Test-PortOpen {
  param([int]$Port)
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $open = $async.AsyncWaitHandle.WaitOne(250, $false)
    if ($open) { $client.EndConnect($async) }
    $client.Close()
    return $open
  } catch {
    return $false
  }
}

function Stop-ProjectDevProcesses {
  $currentPid = $PID
  $escapedProject = [Regex]::Escape($project)

  $processes = Get-CimInstance Win32_Process | Where-Object {
    $_.ProcessId -ne $currentPid -and
    $_.CommandLine -and
    ($_.CommandLine -match $escapedProject) -and
    ($_.Name -ne "ngrok.exe") -and
    (
      $_.Name -in @("node.exe", "npm.cmd", "npm.exe", "cmd.exe") -or
      $_.CommandLine -match "next" -or
      $_.CommandLine -match "\.next"
    )
  }

  foreach ($proc in ($processes | Sort-Object ProcessId -Descending)) {
    try {
      Write-Host "Stopping PID $($proc.ProcessId): $($proc.Name)"
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    } catch {}
  }
}

Stop-ProjectDevProcesses

for ($i = 0; $i -lt 30; $i++) {
  if (-not (Test-PortOpen -Port $port)) { break }
  Write-Host "Waiting for port $port to free..."
  Start-Sleep -Milliseconds 500
}

if (Test-PortOpen -Port $port) {
  Write-Host "Port $port is still in use. Find it with: netstat -ano | findstr :$port"
  exit 1
}

$nextPath = Join-Path $project ".next"
$resolvedNext = Resolve-Path -LiteralPath $nextPath -ErrorAction SilentlyContinue
if ($resolvedNext -and $resolvedNext.Path.StartsWith($project, [StringComparison]::OrdinalIgnoreCase)) {
  Write-Host "Clearing stale .next cache"
  Remove-Item -LiteralPath $resolvedNext.Path -Recurse -Force
}

foreach ($log in @($out, $err)) {
  if (Test-Path -LiteralPath $log) { Remove-Item -LiteralPath $log -Force }
}

$server = Start-Process -WindowStyle Hidden -FilePath "npm.cmd" -ArgumentList @("run", "dev") -WorkingDirectory $project -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
Write-Host "Started npm run dev as PID $($server.Id)"

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  try {
    $response = Invoke-WebRequest -UseBasicParsing "http://localhost:$port/sign-in" -TimeoutSec 5
    Write-Host "Ready: http://localhost:$port/sign-in returned $($response.StatusCode)"
    $ready = $true
    break
  } catch {}
}

if (-not $ready) {
  Write-Host "Dev server did not answer within 60 seconds. Last logs:"
  if (Test-Path -LiteralPath $out) { Get-Content -LiteralPath $out -Tail 60 }
  if (Test-Path -LiteralPath $err) { Get-Content -LiteralPath $err -Tail 60 }
  exit 1
}

Write-Host "Logs:"
Write-Host "  $out"
Write-Host "  $err"