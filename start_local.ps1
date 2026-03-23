param(
  [switch]$NoOpen
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Get-Command python.exe -ErrorAction Stop
$launcher = $python.Source

$args = @()
if ($NoOpen) {
  $args += "--no-open"
}
else {
  $args += "--open"
}
$args += "--detach"
$args = @("scripts/dev.py") + $args

$startParams = @{
  FilePath = $launcher
  ArgumentList = $args
  WorkingDirectory = $root
  WindowStyle = "Hidden"
}

Start-Process @startParams | Out-Null
