$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Get-Command python.exe -ErrorAction Stop
$launcher = $python.Source

Push-Location $root
try {
  & $launcher "scripts/dev.py" "--stop" 2>$null
  $exitCode = $LASTEXITCODE
}
finally {
  Pop-Location
}

exit $exitCode
