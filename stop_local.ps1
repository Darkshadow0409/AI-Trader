$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root
python scripts/dev.py --stop
