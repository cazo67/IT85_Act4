# Restores the owned baseline checkpoint, clears owned export outputs, then runs all twelve chapters in order. Never touches unowned data.
param([Parameter(Mandatory)][string]$Tag, [string]$Checkpoint = '02-baseline', [string]$Chapters = '01,02,03,04,05,06,07,08,09,10,11,12')
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\Ops.ps1"
Restore-DemoCheckpoint $Checkpoint
Get-CimInstance Win32_Process -Filter "Name='WindowsTerminal.exe'" | Where-Object { $_.CommandLine -like '*bcisdemo*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Remove-Item "$script:RunDir\reports\*.pdf", "$script:RunDir\reports\*.xlsx" -ErrorAction SilentlyContinue
Remove-Item "$script:RunDir\reports\backups\*" -Recurse -Force -ErrorAction SilentlyContinue
$resultsFile = "$script:RunDir\manifests\chapters-$Tag.json"; if (Test-Path $resultsFile) { Remove-Item $resultsFile }
Set-Location "$script:Root\tools\demo"
$ErrorActionPreference = 'Continue'
node run.mjs --chapters $Chapters --tag $Tag 2>&1 | Tee-Object -FilePath "$script:RunDir\logs\$Tag.out.txt"
