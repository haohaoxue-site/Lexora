#Requires -Version 7
#Requires -RunAsAdministrator

param(
  [Parameter(Mandatory)][string]$HelperPath,
  [Parameter(Mandatory)][string]$ResultPath
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$helper = (Resolve-Path -LiteralPath $HelperPath).Path
$serviceName = 'BuddyNativeContract_' + [guid]::NewGuid().ToString('N')
$displayName = "Native contract 测试 $serviceName"
$fixtureDirectory = Join-Path $env:ProgramData $serviceName
$fixture = Join-Path $fixtureDirectory 'service-fixture.exe'
$created = $false
$checks = [Collections.Generic.List[string]]::new()
$sc = Join-Path $env:SystemRoot 'System32\sc.exe'

function Assert-Contract([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw $Message }
}

function Invoke-Helper([hashtable]$Request, [string]$ExpectedError = '') {
  $start = [Diagnostics.ProcessStartInfo]::new($helper)
  $start.UseShellExecute = $false
  $start.RedirectStandardInput = $true
  $start.RedirectStandardOutput = $true
  $start.RedirectStandardError = $true
  $start.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
  $start.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
  $start.StandardErrorEncoding = [Text.UTF8Encoding]::new($false)
  $start.Environment['PATH'] = ''
  $start.Environment['PSModulePath'] = ''
  $process = [Diagnostics.Process]::Start($start)
  try {
    $process.StandardInput.Write(($Request | ConvertTo-Json -Compress))
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    if (-not $process.WaitForExit(30000)) {
      $process.Kill($true)
      $process.WaitForExit()
      throw 'Service helper timed out'
    }
    $outputText = $stdout.GetAwaiter().GetResult()
    $errorText = $stderr.GetAwaiter().GetResult().Trim()
    if ($ExpectedError) {
      Assert-Contract ($process.ExitCode -eq 1 -and $errorText -ceq $ExpectedError -and $outputText -eq '') "Unexpected error response: $errorText / $outputText"
      return
    }
    Assert-Contract ($process.ExitCode -eq 0 -and $errorText -eq '') "Service helper failed: $errorText"
    Assert-Contract ($outputText.StartsWith('[')) "Expected target array: $outputText"
    return ,($outputText | ConvertFrom-Json -NoEnumerate)
  }
  finally {
    $process.Dispose()
  }
}

function Assert-Target($Targets, [string]$State, [string[]]$Actions) {
  Assert-Contract ($Targets.Count -eq 1) 'Expected exactly one service'
  $target = $Targets[0]
  Assert-Contract ($target.serviceId -ceq $serviceName -and $target.displayId -ceq $serviceName -and $target.displayName -ceq $displayName) 'Canonical service identity changed'
  Assert-Contract ($target.kind -eq 'service' -and $target.scope -eq 'system' -and $target.interruption -eq 'service') 'Unexpected service target contract'
  Assert-Contract ($target.activeState -eq $State -and ($target.allowedActions -join ',') -eq ($Actions -join ',')) "Unexpected service state/actions: $($target | ConvertTo-Json -Compress)"
}

function Read-Fixture {
  return Get-CimInstance Win32_Service -Filter "Name='$serviceName'"
}

try {
  New-Item -ItemType Directory -Path $fixtureDirectory | Out-Null
  $compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
  & $compiler /nologo /target:winexe "/out:$fixture" /reference:System.ServiceProcess.dll (Join-Path $PSScriptRoot 'service_fixture.cs')
  Assert-Contract ($LASTEXITCODE -eq 0) 'Could not compile service fixture'
  & $sc create $serviceName binPath= "`"$fixture`" $serviceName" start= demand obj= 'NT AUTHORITY\LocalService' DisplayName= $displayName | Out-Null
  Assert-Contract ($LASTEXITCODE -eq 0) 'Could not create isolated service'
  $created = $true

  Assert-Target (Invoke-Helper @{ operation = 'resolve'; serviceId = $serviceName.ToLowerInvariant() }) 'inactive' @('start-service')
  $checks.Add('canonical Unicode identity and stopped actions')

  Assert-Target (Invoke-Helper @{ operation = 'execute'; serviceId = $serviceName; action = 'start-service' }) 'inactive' @('start-service')
  Assert-Target (Invoke-Helper @{ operation = 'read'; serviceId = $serviceName }) 'active' @('stop-service', 'restart-service')
  $started = Read-Fixture
  Assert-Contract ($started.State -eq 'Running' -and $started.ProcessId -gt 0 -and $started.StartName -eq 'NT AUTHORITY\LocalService') 'SCM did not observe the isolated running service'
  $checks.Add('start reaches running and returns pre-action target')

  Invoke-Helper @{ operation = 'execute'; serviceId = $serviceName; action = 'start-service' } 'SYSTEM_ACTION_NOT_ALLOWED'
  $checks.Add('running service rejects repeated start')

  Assert-Target (Invoke-Helper @{ operation = 'execute'; serviceId = $serviceName; action = 'restart-service' }) 'active' @('stop-service', 'restart-service')
  $restarted = Read-Fixture
  Assert-Contract ($restarted.State -eq 'Running' -and $restarted.ProcessId -gt 0 -and $restarted.ProcessId -ne $started.ProcessId) 'Restart did not create a new running service process'
  $checks.Add('restart replaces the service process')

  Assert-Target (Invoke-Helper @{ operation = 'execute'; serviceId = $serviceName; action = 'stop-service' }) 'active' @('stop-service', 'restart-service')
  Assert-Target (Invoke-Helper @{ operation = 'read'; serviceId = $serviceName }) 'inactive' @('start-service')
  Assert-Contract ((Read-Fixture).State -eq 'Stopped') 'SCM did not observe stopped state'
  Invoke-Helper @{ operation = 'execute'; serviceId = $serviceName; action = 'restart-service' } 'SYSTEM_ACTION_NOT_ALLOWED'
  $checks.Add('stop reaches stopped and forbids stopped restart')

  Invoke-Helper @{ operation = 'execute'; serviceId = 'RpcSs'; action = 'stop-service' } 'SYSTEM_ACTION_NOT_ALLOWED'
  Invoke-Helper @{ operation = 'read'; serviceId = $serviceName; command = 'whoami' } 'SYSTEM_ACTION_INVALID'
  $checks.Add('protected service and unknown request fields rejected')
}
finally {
  if ($created) {
    $service = Get-Service -Name $serviceName
    try {
      if ($service.Status -ne 'Stopped') {
        $service.Stop()
        $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(15))
      }
    }
    finally {
      $service.Dispose()
    }
    & $sc delete $serviceName | Out-Null
    Assert-Contract ($LASTEXITCODE -eq 0) 'Could not delete isolated service'
    Assert-Contract ($null -eq (Read-Fixture)) 'Isolated service remains registered'
  }
  if (Test-Path -LiteralPath $fixtureDirectory) {
    Remove-Item -LiteralPath $fixtureDirectory -Recurse -Force
  }
}

Assert-Contract ((Invoke-Helper @{ operation = 'read'; serviceId = $serviceName }).Count -eq 0) 'Deleted service still resolves'
Invoke-Helper @{ operation = 'execute'; serviceId = $serviceName; action = 'start-service' } 'SYSTEM_TARGET_CHANGED'
$checks.Add('deleted target returns empty read and target-changed action')
$result = [ordered]@{
  passed = $true
  helperSha256 = (Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash.ToLowerInvariant()
  powershell = $PSVersionTable.PSVersion.ToString()
  serviceName = $serviceName
  serviceRemoved = $true
  helperPathEmpty = $true
  checks = $checks.ToArray()
}
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ResultPath -Encoding utf8
$result | ConvertTo-Json -Depth 5
