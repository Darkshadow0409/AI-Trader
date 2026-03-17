param(
  [switch]$NoOpen
)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$args = @()
if ($NoOpen) {
  $args += "--no-open"
}
else {
  $args += "--open"
}

python scripts/dev.py @args
