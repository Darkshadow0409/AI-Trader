$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$interpreterFile = Join-Path $repoRoot ".graphify_python"

function Test-GraphifyInterpreter {
  param([string]$PythonPath)
  if (-not $PythonPath) {
    return $false
  }
  if (-not (Test-Path $PythonPath)) {
    return $false
  }
  & $PythonPath -c "import graphify" *> $null
  return $LASTEXITCODE -eq 0
}

function Find-GraphifyInterpreter {
  $candidates = @()
  if (Test-Path $interpreterFile) {
    $configured = (Get-Content $interpreterFile -Raw).Trim()
    if ($configured) {
      $candidates += $configured
    }
  }

  foreach ($command in @("python", "python3", "py")) {
    $resolved = Get-Command $command -ErrorAction SilentlyContinue
    if ($resolved) {
      $previousErrorActionPreference = $ErrorActionPreference
      $ErrorActionPreference = "Continue"
      try {
        if ($command -eq "py") {
          $probe = & py -3 -c "import sys, graphify; print(sys.executable)" 2>$null
        } else {
          $probe = & $command -c "import sys, graphify; print(sys.executable)" 2>$null
        }
      } catch {
        $probe = $null
      } finally {
        $ErrorActionPreference = $previousErrorActionPreference
      }
      if ($LASTEXITCODE -eq 0 -and $probe) {
        $candidates += (($probe | Out-String).Trim())
      }
    }
  }

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (Test-GraphifyInterpreter $candidate) {
      Set-Content -Path $interpreterFile -Value $candidate -NoNewline -Encoding ascii
      return $candidate
    }
  }

  throw "Could not find a Python interpreter with the graphify package. Install graphify or write the interpreter path to .graphify_python."
}

$python = Find-GraphifyInterpreter
Write-Host "[graphify rebuild] interpreter=$python"
& $python -X utf8 (Join-Path $repoRoot "scripts\graphify_rebuild.py") @args
exit $LASTEXITCODE
