# Démo haute disponibilité / High-availability demo.
# Arrête le serveur (nœud kind) qui porte la base PRIMAIRE et montre que MedLink continue de
# fonctionner : la copie de secours devient primaire, les pods du serveur arrêté sont recréés
# ailleurs. Puis redémarre le serveur.
# Usage :  .\scripts\k8s-failover-demo.ps1            (français, par défaut)
#          .\scripts\k8s-failover-demo.ps1 -Lang en   (English)
param([ValidateSet("fr", "en")] [string]$Lang = "fr")
$ErrorActionPreference = "Continue"

# Message in the chosen language.
function T([string]$fr, [string]$en) { if ($Lang -eq "en") { $en } else { $fr } }

# Site address chosen by k8s-up.ps1 (port 8080, or another one if Windows reserves it).
$PublicUrl = kubectl -n medlink get configmap medlink-config -o jsonpath='{.data.PUBLIC_URL}'

function Show($title) {
  Write-Host "`n--- $title ($(Get-Date -Format HH:mm:ss))" -ForegroundColor Cyan
  kubectl get nodes
  kubectl -n medlink get cluster medlink-db
  kubectl -n medlink get pods -o wide -L cnpg.io/instanceRole
}

function Probe {
  try {
    $r = Invoke-WebRequest -Uri "$PublicUrl/api/ready" -UseBasicParsing -TimeoutSec 3
    return $r.StatusCode
  } catch { return (T "PANNE" "DOWN") }
}

Show (T "Avant" "Before")
$primary = kubectl -n medlink get cluster medlink-db -o jsonpath='{.status.currentPrimary}'
$node = kubectl -n medlink get pod $primary -o jsonpath='{.spec.nodeName}'
Write-Host ("`n" + (T "Base primaire : $primary, sur le serveur $node" "Database primary: $primary, on server $node")) -ForegroundColor Yellow
Read-Host (T "Appuyez sur Entrée pour ARRÊTER le serveur $node (panne simulée)" "Press Enter to STOP server $node (simulated crash)")

docker stop $node | Out-Null
Write-Host (T "Serveur $node arrêté à $(Get-Date -Format HH:mm:ss). Vérification du site toutes les 2 s pendant 2 minutes :" `
  "Server $node stopped at $(Get-Date -Format HH:mm:ss). Checking the site every 2 s for 2 minutes:")
$end = (Get-Date).AddMinutes(2)
while ((Get-Date) -lt $end) {
  $p = kubectl -n medlink get cluster medlink-db -o jsonpath='{.status.currentPrimary}'
  Write-Host ("{0}  site: {1,-6}  {2}: {3}" -f (Get-Date -Format HH:mm:ss), (Probe), (T "base primaire" "database primary"), $p)
  Start-Sleep -Seconds 2
}
Show (T "Après la panne" "After the failure")

Read-Host ("`n" + (T "Appuyez sur Entrée pour REDÉMARRER le serveur $node" "Press Enter to RESTART server $node"))
docker start $node | Out-Null
Write-Host (T "Attente du retour de l'ancienne primaire comme copie de secours..." "Waiting for the old primary to rejoin as standby...")
kubectl -n medlink wait --for=condition=Ready cluster/medlink-db --timeout=300s | Out-Null
Show (T "Après le retour du serveur" "After recovery")
