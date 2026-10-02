[CmdletBinding()]
param(
  [switch]$RequireFinalArtifacts
)

$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path

function Assert-GitSuccess([string]$Message) {
  if ($LASTEXITCODE -ne 0) { throw $Message }
}

function Assert-Tracked([string]$RelativePath) {
  git -C $repositoryRoot ls-files --error-unmatch -- $RelativePath 2>$null | Out-Null
  Assert-GitSuccess "Required repository file is not tracked: $RelativePath"
}

function Assert-NotIgnored([string]$RelativePath) {
  git -C $repositoryRoot check-ignore -q -- $RelativePath
  if ($LASTEXITCODE -eq 0) { throw "Required source file is ignored: $RelativePath" }
}

$requiredTracked = @(
  "README.md",
  "BCIS_COMPLETION_PLAN.md",
  "BCIS_PROGRESS_AND_DOCUMENTATION.md",
  "source/package.json",
  "source/apps/api/src/modules/backups/backup-service.ts",
  "source/apps/desktop/src/renderer/src/features/backups/BackupPanel.tsx",
  "database/migrations/meta/_journal.json",
  "tests/Run-StaticAcceptance.ps1",
  "tests/acceptance/AT-01-AT-12.md",
  "reports-samples/monthly-collections-sample.pdf",
  "reports-samples/monthly-collections-sample.xlsx"
)

foreach ($path in $requiredTracked) { Assert-Tracked $path }
Assert-NotIgnored "source/apps/api/src/modules/backups/backup-service.ts"
Assert-NotIgnored "source/apps/desktop/src/renderer/src/features/backups/BackupPanel.tsx"

$tracked = @(git -C $repositoryRoot ls-files)
Assert-GitSuccess "Could not enumerate tracked files."
$prohibited = @($tracked | Where-Object {
  ($_ -match '(^|/)(runtime|attachments)/') -or
  ($_ -match '\.(dump|backup|bak|log)$') -or
  (($_ -match '(^|/)\.env($|\.)') -and ($_ -notmatch '\.env\.example$'))
})
if ($prohibited.Count -gt 0) {
  throw "Prohibited runtime or secret-shaped files are tracked: $($prohibited -join ', ')"
}

$migrations = @($tracked | Where-Object { $_ -match '^database/migrations/\d{4}_.+\.sql$' })
if ($migrations.Count -lt 12) { throw "Expected at least 12 reviewed SQL migrations; found $($migrations.Count)." }

if ($RequireFinalArtifacts) {
  $finalChecks = @(
    @{ Label = "NSIS installer"; Pattern = "release/*.exe" },
    @{ Label = "UI screenshots"; Pattern = "tests/screenshots/*.png" },
    @{ Label = "technical documentation PDF"; Pattern = "docs/generated/technical-documentation.pdf" },
    @{ Label = "user manual PDF"; Pattern = "docs/generated/user-manual.pdf" },
    @{ Label = "acceptance report"; Pattern = "tests/acceptance/acceptance-test-report.md" }
  )
  foreach ($check in $finalChecks) {
    if (-not (Get-ChildItem -Path (Join-Path $repositoryRoot $check.Pattern) -File -ErrorAction SilentlyContinue)) {
      throw "Final artifact is missing: $($check.Label) ($($check.Pattern))."
    }
  }
}

Write-Host "Submission source-integrity checks passed." -ForegroundColor Green
