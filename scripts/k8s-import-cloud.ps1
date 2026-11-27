# Copie les VRAIES données de Supabase cloud dans la base du cluster Kubernetes :
# comptes (mêmes mots de passe), toutes les tables de l'application, clé de chiffrement des
# données médicales, et documents des patients. Les données de démo du cluster sont REMPLACÉES.
# Copies the REAL data from Supabase cloud into the cluster's database (demo data replaced).
#
# Usage :  .\scripts\k8s-import-cloud.ps1     (cluster lancé avec .\scripts\k8s-up.ps1)
# Il vous demande :
#   1. l'adresse de connexion de la base Supabase cloud : Supabase > Connect > Session pooler,
#      avec le mot de passe de la base à la place de [YOUR-PASSWORD] (la même que le secret
#      GitHub SUPABASE_DB_URL) ;
#   2. (facultatif) la clé secrète Supabase (sb_secret_..., Supabase > Settings > API Keys),
#      seulement pour copier aussi les fichiers des patients.
# Rien n'est écrit sur le disque : ces valeurs vont dans un Secret Kubernetes temporaire, supprimé
# à la fin.
$ErrorActionPreference = "Continue"

function Plain($secure) {
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

Write-Host "Copie des VRAIES données de Supabase cloud dans le cluster Kubernetes" -ForegroundColor Cyan
Write-Host " - Les données de démo du cluster (comptes @medlink.test, rendez-vous de test) seront supprimées."
Write-Host " - Les utilisateurs gardent leur mot de passe ; praticiens et admins refont le MFA à la prochaine connexion."
Write-Host " - Les e-mails restent captés par Mailpit : aucun vrai patient ne reçoit d'e-mail."
Write-Host " - Ce sont des données de santé réelles : ne filmez pas d'écran qui les montre sans accord." -ForegroundColor Yellow
if ((Read-Host "Tapez OUI pour continuer") -ne "OUI") { Write-Host "Annulé."; exit 1 }

$db = Plain (Read-Host "Adresse de la base Supabase cloud (postgresql://postgres.xxx:MOTDEPASSE@...pooler.supabase.com:5432/postgres)" -AsSecureString)
if ($db -notmatch "^postgres(ql)?://") { Write-Host "Adresse invalide (elle doit commencer par postgresql://)." -ForegroundColor Red; exit 1 }
if ($db -match "\[YOUR-PASSWORD\]") { Write-Host "Remplacez [YOUR-PASSWORD] par le mot de passe de la base." -ForegroundColor Red; exit 1 }
$key = Plain (Read-Host "Clé secrète Supabase sb_secret_... pour copier les fichiers (Entrée pour passer)" -AsSecureString)

# Temporary Secret (via a temp file deleted right after: no value on the command line).
$tmp = Join-Path $env:TEMP "medlink-cloud-$([guid]::NewGuid()).env"
$lines = @("CLOUD_DB_URL=$db")
if ($key) { $lines += "CLOUD_SERVICE_KEY=$key" }
[IO.File]::WriteAllLines($tmp, $lines, (New-Object Text.UTF8Encoding $false))
try {
  kubectl -n medlink delete secret medlink-cloud --ignore-not-found | Out-Null
  kubectl -n medlink create secret generic medlink-cloud --from-env-file=$tmp | Out-Null
} finally { Remove-Item $tmp -Force }
$db = $null; $key = $null

kubectl -n medlink delete job medlink-import-cloud --ignore-not-found | Out-Null
kubectl apply -f k8s/database/import-job.yaml | Out-Null
Write-Host "Copie en cours (1 à 5 minutes)..."
$ok = $false
$end = (Get-Date).AddMinutes(15)
while ((Get-Date) -lt $end) {
  Start-Sleep -Seconds 5
  if ((kubectl -n medlink get job medlink-import-cloud -o jsonpath='{.status.succeeded}') -eq "1") { $ok = $true; break }
  if ((kubectl -n medlink get job medlink-import-cloud -o jsonpath='{.status.failed}') -ge "1") { break }
}
kubectl -n medlink logs job/medlink-import-cloud
kubectl -n medlink delete secret medlink-cloud --ignore-not-found | Out-Null

if ($ok) {
  Write-Host "`nTerminé : connectez-vous sur MedLink avec un vrai compte." -ForegroundColor Green
} else {
  Write-Host "`nLa copie a échoué (voir les messages ci-dessus). Les données de démo ont pu être effacées :" -ForegroundColor Red
  Write-Host "corrigez le problème puis relancez ce script."
  exit 1
}
