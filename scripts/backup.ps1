# US-37: full backup of the MedLink database (roles, schema, data) from Windows.
# Requires: Docker Desktop running, and the project linked once with
#   npx supabase link --project-ref lmocoknimijxqegbxbyg
# Usage (from the project folder):  .\scripts\backup.ps1
# Result: backups\medlink-YYYYMMDD-HHMM.zip (the folder is git-ignored). The 14 most recent are kept.
$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$dir = Join-Path "backups" "medlink-$stamp"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

Write-Host "1/3 Roles..."
npx supabase db dump --remote --role-only -f "$dir\roles.sql"
if ($LASTEXITCODE -ne 0) { throw "Roles dump failed" }
Write-Host "2/3 Schema..."
npx supabase db dump --remote -f "$dir\schema.sql"
if ($LASTEXITCODE -ne 0) { throw "Schema dump failed" }
Write-Host "3/3 Data..."
npx supabase db dump --remote --data-only --use-copy -f "$dir\data.sql"
if ($LASTEXITCODE -ne 0) { throw "Data dump failed" }

# Integrity: SHA-256 of each file, checked again by restore.ps1.
Get-ChildItem $dir -Filter *.sql | ForEach-Object {
  "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)  $($_.Name)"
} | Set-Content "$dir\SHA256SUMS.txt"

Compress-Archive -Path "$dir\*" -DestinationPath "$dir.zip" -Force
Remove-Item -Recurse -Force $dir

# Retention: keep the 14 most recent backups.
Get-ChildItem "backups" -Filter "medlink-*.zip" | Sort-Object Name -Descending |
  Select-Object -Skip 14 | Remove-Item -Force

$size = [math]::Round((Get-Item "$dir.zip").Length / 1KB)
Write-Host "Backup OK: $dir.zip ($size KB)"
Write-Host "Copy it to an encrypted place (BitLocker drive, private cloud folder). It contains personal data."
