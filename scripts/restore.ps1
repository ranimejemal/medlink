# US-37: restores a backup made by backup.ps1 into an EMPTY Supabase project
# (official Supabase procedure: roles, then schema, then data).
# Restore drill: create a second free project "medlink-restore-test", copy its connection string
# (Project Settings > Database > Connection string > Session pooler), then:
#   .\scripts\restore.ps1 -Backup backups\medlink-20261125-2100.zip -DbUrl "postgresql://postgres.<ref>:<pwd>@<host>:5432/postgres"
# Requires Docker Desktop (psql runs in the official postgres:17 image).
param(
  [Parameter(Mandatory = $true)][string]$Backup,
  [Parameter(Mandatory = $true)][string]$DbUrl
)
$ErrorActionPreference = "Stop"
if ($DbUrl -match "lmocoknimijxqegbxbyg") {
  throw "Refused: this is the production project. Restore into a local stack or a new project."
}
$work = Join-Path $env:TEMP ("medlink-restore-" + [guid]::NewGuid())
Expand-Archive -Path $Backup -DestinationPath $work

# Integrity check before touching the database.
foreach ($line in Get-Content "$work\SHA256SUMS.txt") {
  $hash, $name = $line -split "  ", 2
  if ((Get-FileHash "$work\$name" -Algorithm SHA256).Hash -ne $hash) { throw "Corrupted file: $name" }
}
Write-Host "Integrity OK"

# One transaction: either everything is restored, or nothing is.
# session_replication_role = replica disables triggers while the data is loaded.
docker run --rm -v "${work}:/backup:ro" postgres:17 psql $DbUrl `
  --single-transaction --variable ON_ERROR_STOP=1 `
  --file /backup/roles.sql --file /backup/schema.sql `
  --command "SET session_replication_role = replica" `
  --file /backup/data.sql
if ($LASTEXITCODE -ne 0) { throw "Restore failed: nothing was changed (transaction rolled back)." }
Remove-Item -Recurse -Force $work
Write-Host "Restore OK into $($DbUrl -replace ':[^:@/]+@', ':****@')"
