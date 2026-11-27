# Starts the whole MedLink stack on a local Kubernetes cluster (kind), from Windows.
# Requires: Docker Desktop running (8 GB of RAM for Docker recommended), and kind + kubectl:
#   winget install Kubernetes.kind Kubernetes.kubectl
# Usage (from the project folder):  .\scripts\k8s-up.ps1            (messages en français)
#                                   .\scripts\k8s-up.ps1 -Lang en   (messages in English)
# Safe to run again: existing parts are kept. First run: about 10-15 minutes (image builds).
# Then: MedLink  http://127.0.0.1:8080   e-mails (Mailpit)  http://127.0.0.1:8025
# (if Windows reserves 8080 / 8025, the script picks other free ports and prints them at the end).
# "Continue": kind/kubectl/docker print progress on stderr; failures are caught by exit codes (Run).
param([ValidateSet("fr", "en")] [string]$Lang = "fr")
$ErrorActionPreference = "Continue"
# Message in the chosen language.
function T([string]$fr, [string]$en) { if ($Lang -eq "en") { $en } else { $fr } }
$Cluster = "medlink"
$CnpgVersion = "1.26.0"
$MetricsVersion = "v0.7.2"

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
# Runs a command and stops the script if it fails (simple function: flags such as -f or -o are
# passed to the command as they are).
function Run {
  $exe = $args[0]
  $rest = @($args | Select-Object -Skip 1)
  & $exe @rest
  if ($LASTEXITCODE -ne 0) { throw ((T "Échec : " "Failed: ") + ($args -join ' ')) }
}

foreach ($tool in "docker", "kind", "kubectl", "node") {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    throw (T "$tool manque. Installez-le (winget install Kubernetes.kind Kubernetes.kubectl), puis ouvrez un nouveau terminal." "$tool is missing. Install it (winget install Kubernetes.kind Kubernetes.kubectl), then open a new terminal.")
  }
}
docker info | Out-Null
if ($LASTEXITCODE -ne 0) { throw (T "Docker Desktop n'est pas lancé." "Docker Desktop is not running.") }

# Windows (Hyper-V / WSL) reserves ranges of ports, often including 8080: pick the first free one.
# Reserved ranges:  netsh interface ipv4 show excludedportrange protocol=tcp
function Test-PortFree([int]$port) {
  try {
    $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)
    $l.Start(); $l.Stop(); return $true
  } catch { return $false }
}
function Get-FreePort([int[]]$candidates) {
  foreach ($p in $candidates) { if (Test-PortFree $p) { return $p } }
  throw (T "Aucun port libre parmi $($candidates -join ', '). Fermez le programme qui les utilise, ou redémarrez." "No free port among $($candidates -join ', '). Close the program using them, or reboot.")
}

Step (T "1/7 Cluster : 1 nœud de contrôle + 3 serveurs" "1/7 Cluster: 1 control-plane + 3 worker servers")
$existing = kind get clusters
if ($existing -notcontains $Cluster) {
  $SitePort = Get-FreePort @(8080, 8088, 8090, 8888, 9080, 3080, 18080, 28080)
  $MailPort = Get-FreePort @(8025, 8026, 9025, 3025, 18025, 28025)
  $kindConfig = (Get-Content k8s/kind/cluster.yaml -Raw) `
    -replace "hostPort: 8080", "hostPort: $SitePort" -replace "hostPort: 8025", "hostPort: $MailPort"
  $kindFile = Join-Path $env:TEMP "medlink-kind.yaml"
  [IO.File]::WriteAllText($kindFile, $kindConfig, (New-Object Text.UTF8Encoding $false))
  Run kind create cluster --name $Cluster --config $kindFile --wait 120s
} else { Write-Host (T "Le cluster '$Cluster' existe déjà." "Cluster '$Cluster' already exists.") }
# Ports actually used by the cluster (also when it already existed).
$SitePort = ((docker port "$Cluster-control-plane" 30080/tcp) | Select-Object -First 1).Split(":")[-1]
$MailPort = ((docker port "$Cluster-control-plane" 30025/tcp) | Select-Object -First 1).Split(":")[-1]
# 127.0.0.1, not "localhost": browsers may turn localhost into IPv6 (::1), which Docker Desktop
# does not forward to kind (the page then fails with ERR_CONNECTION_RESET).
$PublicUrl = "http://127.0.0.1:$SitePort"
Write-Host (T "Port du site : $SitePort   Port de Mailpit : $MailPort" "Site port: $SitePort   Mailpit port: $MailPort")
Run kubectl config use-context "kind-$Cluster"
Run kubectl get nodes

Step (T "2/7 Opérateur de base de données (CloudNativePG $CnpgVersion) et metrics-server (autoscaling)" "2/7 Database operator (CloudNativePG $CnpgVersion) and metrics-server (autoscaling)")
Run kubectl apply --server-side -f "https://github.com/cloudnative-pg/cloudnative-pg/releases/download/v$CnpgVersion/cnpg-$CnpgVersion.yaml"
Run kubectl apply -f "https://github.com/kubernetes-sigs/metrics-server/releases/download/$MetricsVersion/components.yaml"
# kind's kubelets use self-signed certificates (patch file: no JSON quoting issues in PowerShell).
$args0 = kubectl -n kube-system get deployment metrics-server -o jsonpath='{.spec.template.spec.containers[0].args}'
if ($args0 -notmatch "kubelet-insecure-tls") {
  Run kubectl -n kube-system patch deployment metrics-server --type=json --patch-file k8s/kind/metrics-server-patch.json
}
# The operator and the DNS stay on the control-plane: the failover demo stops a worker, and the
# operator must survive it to promote the standby (see k8s/kind/system-on-control-plane.yaml).
Run kubectl -n cnpg-system patch deployment cnpg-controller-manager --patch-file k8s/kind/system-on-control-plane.yaml
Run kubectl -n kube-system patch deployment coredns --patch-file k8s/kind/system-on-control-plane.yaml
Run kubectl -n cnpg-system rollout status deployment/cnpg-controller-manager --timeout=180s
Run kubectl -n kube-system rollout status deployment/coredns --timeout=180s

Step (T "3/7 Construction des 3 images MedLink (frontend, backend, db-init)" "3/7 Building the 3 MedLink images (frontend, backend, db-init)")
Run docker build -f docker/frontend/Dockerfile -t ghcr.io/ranimejemal/medlink-frontend:latest .
Run docker build -f docker/backend/Dockerfile -t ghcr.io/ranimejemal/medlink-backend:latest .
Run docker build -f docker/db-init/Dockerfile -t ghcr.io/ranimejemal/medlink-db-init:latest .

Step (T "4/7 Chargement des images dans les serveurs du cluster" "4/7 Loading the images into the cluster's servers")
foreach ($img in "medlink-frontend", "medlink-backend", "medlink-db-init") {
  Run kind load docker-image "ghcr.io/ranimejemal/${img}:latest" --name $Cluster
}

Step (T "5/7 Secrets (générés sur ce PC, jamais dans Git)" "5/7 Secrets (generated on this PC, never in Git)")
Run kubectl apply -f k8s/base/config.yaml
if (-not (Test-Path k8s/secrets.local.yaml)) {
  $yaml = node scripts/k8s-secrets.mjs | Out-String
  if ($LASTEXITCODE -ne 0) { throw (T "Échec de la génération des secrets" "Secret generation failed") }
  # UTF-8 without BOM.
  [IO.File]::WriteAllText((Join-Path (Get-Location) "k8s/secrets.local.yaml"), $yaml, (New-Object Text.UTF8Encoding $false))
  Write-Host (T "k8s/secrets.local.yaml créé (gardez-le : il contient les clés de ce cluster)." "Created k8s/secrets.local.yaml (keep it: it holds this cluster's keys).")
}
Run kubectl apply -f k8s/secrets.local.yaml

Step (T "6/7 Déploiement de MedLink (kubectl apply -k k8s)" "6/7 Deploying MedLink (kubectl apply -k k8s)")
Run kubectl apply -k k8s
# Address of the site in e-mails and redirects (auth, backend): the port chosen above.
$patchFile = Join-Path $env:TEMP "medlink-config-patch.json"
[IO.File]::WriteAllText($patchFile, "{""data"":{""PUBLIC_URL"":""$PublicUrl""}}", (New-Object Text.UTF8Encoding $false))
Run kubectl -n medlink patch configmap medlink-config --type=merge --patch-file $patchFile

Step (T "7/7 Attente du démarrage de tous les services (première fois : 3 à 5 minutes)" "7/7 Waiting for everything to start (first time: 3-5 minutes)")
Run kubectl -n medlink wait --for=condition=Ready cluster/medlink-db --timeout=600s
Run kubectl -n medlink wait --for=condition=complete job/medlink-db-init --timeout=600s
foreach ($d in "auth", "rest", "storage", "gateway", "backend", "frontend") {
  Run kubectl -n medlink rollout status "deployment/$d" --timeout=300s
}
# Restart: a rebuilt image ("latest") and the PUBLIC_URL above are picked up.
Run kubectl -n medlink rollout restart deployment/frontend deployment/backend deployment/auth
foreach ($d in "frontend", "backend", "auth") {
  Run kubectl -n medlink rollout status "deployment/$d" --timeout=300s
}

Write-Host ""
kubectl -n medlink get pods -o wide
Write-Host ""
if ($Lang -eq "en") {
  Write-Host "MedLink is running:  $PublicUrl" -ForegroundColor Green
  Write-Host "E-mails (Mailpit):   http://127.0.0.1:$MailPort   (sign-up codes, confirmations, reminders)"
  Write-Host "Demo accounts:       patient.demo / doctor.demo / admin.demo / staff.demo @medlink.test"
  Write-Host "Password:            MedLink-Demo-2026!   (doctor and admin: MFA set-up at first login)"
  Write-Host "Failover demo:       .\scripts\k8s-failover-demo.ps1 -Lang en"
} else {
  Write-Host "MedLink fonctionne :   $PublicUrl" -ForegroundColor Green
  Write-Host "E-mails (Mailpit) :    http://127.0.0.1:$MailPort   (codes d'inscription, confirmations, rappels)"
  Write-Host "Comptes de démo :      patient.demo / doctor.demo / admin.demo / staff.demo @medlink.test"
  Write-Host "Mot de passe :         MedLink-Demo-2026!   (praticien et admin : configuration du MFA à la 1re connexion)"
  Write-Host "Démo de panne :        .\scripts\k8s-failover-demo.ps1"
}
