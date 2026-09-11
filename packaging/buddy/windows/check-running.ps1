param([Parameter(Mandatory)][string]$ExecutablePath)

$ErrorActionPreference = 'Stop'

try {
  if (-not [IO.Path]::IsPathRooted($ExecutablePath)) {
    throw 'The executable path must be absolute'
  }
  $target = [IO.Path]::GetFullPath($ExecutablePath)
  $name = [IO.Path]::GetFileName($target)
  $processName = [IO.Path]::GetFileNameWithoutExtension($name)
  $processes = Get-Process -Name $processName -ErrorAction SilentlyContinue

  foreach ($process in $processes) {
    if ([string]::IsNullOrWhiteSpace($process.Path)) {
      throw 'Cannot determine the executable path of a matching process'
    }
    if ([string]::Equals($process.Path, $target, [StringComparison]::OrdinalIgnoreCase)) {
      exit 32
    }
  }
  exit 0
}
catch {
  [Console]::Error.WriteLine('Unable to verify whether this installation is running.')
  exit 1603
}
