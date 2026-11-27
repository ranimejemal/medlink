# Supprime le cluster Kubernetes local et tout ce qu'il contient (base de données comprise).
# Deletes the local Kubernetes cluster and everything in it (database included).
# Usage :  .\scripts\k8s-down.ps1
# k8s/secrets.local.yaml est conservé ; supprimez-le aussi pour de nouvelles clés au prochain k8s-up.ps1.
# k8s/secrets.local.yaml is kept; delete it too for brand-new keys at the next k8s-up.ps1.
kind delete cluster --name medlink
