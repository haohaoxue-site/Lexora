param([Parameter(Mandatory)][string]$ExecutablePath)

$ErrorActionPreference = 'Stop'

try {
  if (-not [IO.Path]::IsPathRooted($ExecutablePath)) {
    throw 'The executable path must be absolute'
  }
  $target = [IO.Path]::GetFullPath($ExecutablePath)
  $name = [IO.Path]::GetFileName($target)
  $processes = Get-CimInstance -ClassName Win32_Process -Property Name, ExecutablePath |
    Where-Object { $_.Name -eq $name }

  foreach ($process in $processes) {
    if ([string]::IsNullOrWhiteSpace($process.ExecutablePath)) {
      throw 'Cannot determine the executable path of a matching process'
    }
    if ([string]::Equals($process.ExecutablePath, $target, [StringComparison]::OrdinalIgnoreCase)) {
      exit 32
    }
  }
  exit 0
}
catch {
  [Console]::Error.WriteLine('Unable to verify whether this installation is running.')
  exit 1603
}
