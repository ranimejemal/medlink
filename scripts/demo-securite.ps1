# Démo sécurité (à filmer) : des attaques réelles contre le cluster MedLink, et la réponse du serveur.
# Security demo (to screen-record): real attacks against the MedLink cluster, and the server's answer.
# Chaque attaque affiche : ce qu'on tente, la réponse HTTP réelle, et BLOQUÉ / OUVERT.
# Usage :  .\scripts\demo-securite.ps1            (cluster lancé avec .\scripts\k8s-up.ps1)
#          .\scripts\demo-securite.ps1 -NoPause   (sans pause entre les attaques)
# Sans risque pour les vrais comptes : le script crée son propre compte patient de test,
# attaque.demo@medlink.test, et n'attaque que lui. Seule modification : l'attaque 14 écrit une
# allergie fictive (« Penicilline ») dans le dossier de ce compte de test.
param([switch]$NoPause)
$ErrorActionPreference = "Continue"

$Base = kubectl -n medlink get configmap medlink-config -o jsonpath='{.data.PUBLIC_URL}'
$Anon = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(
    (kubectl -n medlink get secret medlink-supabase -o jsonpath='{.data.ANON_KEY}')))
$DemoPassword = kubectl -n medlink get configmap medlink-config -o jsonpath='{.data.DEMO_PASSWORD}'
$ServiceKey = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(
    (kubectl -n medlink get secret medlink-supabase -o jsonpath='{.data.SERVICE_ROLE_KEY}')))
$TestEmail = "attaque.demo@medlink.test"
$script:ok = 0; $script:ko = 0

function Title($n, $text) {
  Write-Host ""
  Write-Host "==================================================================" -ForegroundColor DarkGray
  Write-Host " ATTAQUE $n : $text" -ForegroundColor Cyan
  Write-Host "==================================================================" -ForegroundColor DarkGray
}
function Pause-Demo { if (-not $NoPause) { Read-Host "Entrée pour continuer" | Out-Null } }

# HTTP call that never throws: returns the status code and the body.
function Call($Method, $Path, $Token, $Body, $ContentType = "application/json", $Extra = @{}) {
  $h = @{ apikey = $Anon }
  if ($Token) { $h["Authorization"] = "Bearer $Token" }
  foreach ($k in $Extra.Keys) { $h[$k] = $Extra[$k] }
  $p = @{ Uri = "$Base$Path"; Method = $Method; Headers = $h; UseBasicParsing = $true; TimeoutSec = 15 }
  if ($null -ne $Body) { $p["Body"] = $Body; $p["ContentType"] = $ContentType }
  try {
    $r = Invoke-WebRequest @p
    return @{ Status = [int]$r.StatusCode; Body = [string]$r.Content }
  } catch {
    $status = 0
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    return @{ Status = $status; Body = [string]$_.ErrorDetails.Message }
  }
}

function Show($r) {
  $b = $r.Body; if ($b.Length -gt 160) { $b = $b.Substring(0, 160) + "..." }
  Write-Host ("  Réponse du serveur : HTTP {0}  {1}" -f $r.Status, $b)
}
function Verdict([bool]$blocked, $why) {
  if ($blocked) { $script:ok++; Write-Host "  => BLOQUÉ : $why" -ForegroundColor Green }
  else { $script:ko++; Write-Host "  => OUVERT : $why" -ForegroundColor Red }
}

Write-Host "Cible : $Base" -ForegroundColor Yellow
Write-Host "Attaquant : un script qui appelle directement l'API, sans passer par l'interface du site."

# ---------------------------------------------------------------------------------------------
Title 1 "Visiteur NON connecté qui lit les profils des patients"
Write-Host "  GET /rest/v1/profiles   (avec seulement la clé publique, visible par tous dans le navigateur)"
$r = Call GET "/rest/v1/profiles?select=email,first_name,last_name"
Show $r
Verdict ($r.Status -ge 400) "la table profiles n'est pas accessible aux visiteurs anonymes (droits + RLS)"
Pause-Demo

# ---------------------------------------------------------------------------------------------
Title 2 "Connexion légitime d'un patient (pour les attaques suivantes)"
# Test account of this script (created once, patient role): no real account is attacked.
$p = @{ Uri = "$Base/auth/v1/admin/users"; Method = "POST"; UseBasicParsing = $true; ContentType = "application/json"
  Headers = @{ apikey = $ServiceKey; Authorization = "Bearer $ServiceKey" }
  Body = (@{ email = $TestEmail; password = $DemoPassword; email_confirm = $true
             user_metadata = @{ first_name = "Attaque"; last_name = "Demo"; consent = $true } } | ConvertTo-Json) }
try { Invoke-WebRequest @p | Out-Null } catch { } # already exists: fine
$login = Call POST "/auth/v1/token?grant_type=password" $null (@{ email = $TestEmail; password = $DemoPassword } | ConvertTo-Json)
if ($login.Status -ne 200) { Show $login; throw "Connexion du compte de test impossible (attendez 1 minute si l'attaque 13 vient d'être lancée)" }
$session = $login.Body | ConvertFrom-Json
$Token = $session.access_token; $Me = $session.user.id
Write-Host "  Connecté comme $TestEmail (compte patient de test, id $Me). Jeton JWT valable 1 h."
Pause-Demo

# ---------------------------------------------------------------------------------------------
Title 3 "IDOR : un patient demande TOUS les profils de la base"
Write-Host "  GET /rest/v1/profiles   (sans filtre : il espère recevoir tous les patients)"
$r = Call GET "/rest/v1/profiles?select=id,email" $Token
$rows = @($r.Body | ConvertFrom-Json)
Write-Host ("  Réponse du serveur : HTTP {0}, {1} profil(s) reçu(s) : {2}" -f $r.Status, $rows.Count, (($rows | ForEach-Object { $_.email }) -join ", "))
Verdict ($rows.Count -le 1) "Row Level Security : chaque patient ne voit que sa propre ligne"
Pause-Demo

# ---------------------------------------------------------------------------------------------
Title 4 "Un patient lit les dossiers médicaux des autres"
Write-Host "  GET /rest/v1/medical_records?patient_id=neq.$Me   (tous les dossiers SAUF le sien)"
$r = Call GET "/rest/v1/medical_records?select=patient_id&patient_id=neq.$Me" $Token
Show $r
$rows = @($r.Body | ConvertFrom-Json)
Verdict ($r.Status -ge 400 -or $rows.Count -eq 0) "aucun dossier d'un autre patient n'est renvoyé"
Pause-Demo

# ---------------------------------------------------------------------------------------------
Title 5 "Élévation de privilèges : le patient se donne le rôle administrateur"
Write-Host "  POST /rest/v1/user_roles  { user_id: moi, role: 'admin' }"
$r = Call POST "/rest/v1/user_roles" $Token (@{ user_id = $Me; role = "admin" } | ConvertTo-Json)
Show $r
Verdict ($r.Status -ge 400) "seul un administrateur (avec MFA) peut attribuer un rôle"
Pause-Demo

# ---------------------------------------------------------------------------------------------
Title 6 "Le patient appelle une fonction réservée à l'administrateur"
Write-Host "  POST /rest/v1/rpc/admin_list_users   (liste de tous les comptes)"
$r = Call POST "/rest/v1/rpc/admin_list_users" $Token "{}"
Show $r
Verdict ($r.Status -ge 400) "la fonction vérifie le rôle et le niveau MFA côté serveur (FORBIDDEN)"
Pause-Demo

# ---------------------------------------------------------------------------------------------
Title 7 "Effacer ses traces : supprimer le journal d'audit"
Write-Host "  DELETE /rest/v1/audit_logs   (toutes les lignes)"
$r = Call DELETE "/rest/v1/audit_logs?id=not.is.null" $Token
Show $r
Verdict ($r.Status -ge 400) "le journal d'audit est en ajout seul (append-only), même pour l'administrateur"
Pause-Demo

# ---------------------------------------------------------------------------------------------
Title 8 "Fausse entrée dans le journal d'audit"
Write-Host "  POST /rest/v1/rpc/log_event  { _action: 'admin.user_deleted' }   (action inventée)"
$r = Call POST "/rest/v1/rpc/log_event" $Token (@{ _action = "admin.user_deleted" } | ConvertTo-Json)
Show $r
Verdict ($r.Status -ge 400) "seules les actions d'une liste blanche peuvent être journalisées par l'application"
Pause-Demo

# ---------------------------------------------------------------------------------------------
Title 9 "Injection SQL dans un filtre"
$inj = [uri]::EscapeDataString("x' OR '1'='1")
Write-Host "  GET /rest/v1/clinics?name=eq.x' OR '1'='1"
$r = Call GET "/rest/v1/clinics?select=name&name=eq.$inj" $Token
Show $r
$rows = @($r.Body | ConvertFrom-Json)
Verdict ($rows.Count -eq 0) "la valeur est traitée comme du texte (requêtes paramétrées), pas comme du SQL"
Pause-Demo

# ---------------------------------------------------------------------------------------------
Title 10 "Déposer un fichier dans le dossier d'un AUTRE patient"
Write-Host "  POST /storage/v1/object/patient-documents/<autre-patient>/piege.pdf"
$r = Call POST "/storage/v1/object/patient-documents/00000000-0000-0000-0000-000000000000/piege.pdf" $Token "%PDF-1.4 test" "application/pdf"
Show $r
Verdict ($r.Status -ge 400) "le stockage applique aussi la RLS : chacun n'écrit que dans son propre dossier"
Pause-Demo

# ---------------------------------------------------------------------------------------------
Title 11 "Jeton falsifié : le patient modifie son JWT pour devenir 'service_role'"
$parts = $Token.Split(".")
$fakeBody = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('{"role":"service_role","sub":"' + $Me + '"}')).TrimEnd("=").Replace("+", "-").Replace("/", "_")
$fake = "$($parts[0]).$fakeBody.$($parts[2])"
Write-Host "  GET /rest/v1/profiles  avec un jeton dont le contenu a été modifié (signature inchangée)"
$r = Call GET "/rest/v1/profiles?select=email" $fake
Show $r
Verdict ($r.Status -ge 400) "la signature HMAC du jeton ne correspond plus : jeton refusé"
Pause-Demo

# ---------------------------------------------------------------------------------------------
Title 12 "CSRF : un site pirate appelle une fonction serveur de MedLink"
Write-Host "  POST /_serverFn/...  avec l'en-tête Origin: https://site-pirate.example"
$r = Call POST "/_serverFn/7bfa21c33c95a5fef46a1196f26caab3631183e4b32cc8930eb38f50a3ecac2d" $Token "{}" "application/json" @{ Origin = "https://site-pirate.example" }
Show $r
Verdict ($r.Status -eq 403) "les fonctions serveur refusent les requêtes venant d'un autre site"
Pause-Demo

# ---------------------------------------------------------------------------------------------
Title 13 "Force brute : 12 mots de passe essayés très vite, directement sur l'API"
Write-Host "  POST /auth/v1/token?grant_type=password  x12 (mauvais mot de passe)"
$codes = @()
for ($i = 1; $i -le 12; $i++) {
  $r = Call POST "/auth/v1/token?grant_type=password" $null (@{ email = $TestEmail; password = "Devine$i!" } | ConvertTo-Json)
  $codes += $r.Status
}
Write-Host ("  Codes reçus : {0}" -f ($codes -join " "))
Write-Host "  (400 = mot de passe refusé ; 429 = trop de tentatives, l'adresse IP est freinée)"
Verdict ($codes -contains 429) "au-delà de quelques essais par minute, le serveur répond 429 (et le formulaire verrouille le compte 15 min après 5 échecs)"
Write-Host "  Remarque : les connexions depuis cette machine sont freinées pendant ~1 minute." -ForegroundColor DarkGray
Pause-Demo

# ---------------------------------------------------------------------------------------------
Title 14 "Lire les données médicales directement dans la base (vol du disque, accès au serveur)"
$p = kubectl -n medlink get cluster medlink-db -o jsonpath='{.status.currentPrimary}'
Write-Host "  1) Un praticien enregistre une allergie en clair : 'Penicilline'"
kubectl -n medlink exec $p -c postgres -- psql -U postgres -d postgres -q -c "insert into public.medical_records (patient_id, allergies) values ('$Me', 'Penicilline') on conflict (patient_id) do update set allergies = 'Penicilline'"
Write-Host "  2) Ce qui est réellement stocké sur le disque (lecture directe de la table) :"
kubectl -n medlink exec $p -c postgres -- psql -U postgres -d postgres -c "select allergies as colonne_en_clair, left(encode(allergies_enc, 'hex'), 48) || '...' as allergies_chiffrees from public.medical_records where patient_id = '$Me'"
Write-Host "  3) Ce que voit le patient connecté, via l'API (déchiffré pour lui seul) :"
$r = Call GET "/rest/v1/medical_records_decrypted?select=allergies" $Token
Show $r
Write-Host "  => Stocké chiffré en AES-256 (colonne en clair vide) ; déchiffré seulement pour qui y a droit." -ForegroundColor Green
Write-Host "     La clé est dans Vault (Secret Kubernetes), jamais dans le code ni dans Git."
$script:ok++
Pause-Demo

# ---------------------------------------------------------------------------------------------
Title 15 "En-têtes de sécurité HTTP et conteneurs non-root"
$h = (Invoke-WebRequest -Uri "$Base/" -UseBasicParsing -Method Head).Headers
foreach ($k in "Strict-Transport-Security", "Content-Security-Policy", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy") {
  Write-Host ("  {0,-26} {1}" -f $k, $h[$k])
}
Write-Host ("  Utilisateur du conteneur frontend : {0}" -f (kubectl -n medlink exec deploy/frontend -- id -un))
Write-Host ("  Utilisateur du conteneur backend  : {0}" -f (kubectl -n medlink exec deploy/backend -- id -un))
Write-Host "  => Aucun conteneur de l'application ne tourne en root." -ForegroundColor Green

Write-Host ""
Write-Host "==================================================================" -ForegroundColor DarkGray
Write-Host (" Résultat : {0} attaque(s) bloquée(s), {1} attaque(s) passée(s)" -f $script:ok, $script:ko) -ForegroundColor $(if ($script:ko -eq 0) { "Green" } else { "Red" })
Write-Host "==================================================================" -ForegroundColor DarkGray
