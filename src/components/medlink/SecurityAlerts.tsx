
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AlertDetails = {
  failed_attempts?: number;
  window_minutes?: number;
  events?: number;
};

type Alert = {
  id: string;
  created_at: string;
  action: string;
  severity: string;
  user_email: string | null;
  ip_address: string | null;
  details: AlertDetails | null;
};

const LABELS: Record<string, string> = {
  "security.bruteforce": "Échecs de connexion répétés",
  "security.suspicious_access": "Accès refusés répétés à des dossiers",
  "security.mass_access": "Consultation massive de dossiers",
};

const fmt = (date: string): string =>
  new Date(date).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Tunis",
  });

function detailText(a: Alert): string {
  const d = a.details ?? {};

  if (a.action === "security.bruteforce") {
    return `${d.failed_attempts ?? 0} échecs en ${d.window_minutes ?? 0} min`;
  }

  return `${d.events ?? 0} événements en ${d.window_minutes ?? 0} min`;
}

export function SecurityAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from("audit_logs")
        .select(
          "id, created_at, action, severity, user_email, ip_address, details"
        )
        .like("action", "security.%")
        .order("created_at", { ascending: false })
        .limit(50);

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      setError(null);

      // Normalisation des données reçues
      const normalized: Alert[] = (data ?? []).map((item) => ({
        id: item.id,
        created_at: item.created_at,
        action: item.action,
        severity: item.severity,
        user_email: item.user_email,
        ip_address: item.ip_address,
        details: (item.details ?? null) as AlertDetails | null,
      }));

      setAlerts(normalized);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Une erreur est survenue."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();

    const interval = setInterval(load, 60_000);

    return () => clearInterval(interval);
  }, [load]);

  const last24h = alerts.filter((a) => {
    const elapsed = Date.now() - new Date(a.created_at).getTime();
    return elapsed >= 0 && elapsed < 86_400_000;
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0b1f3a]">
            Alertes de sécurité
          </h1>

          <p className="text-sm text-slate-500">
            Détection automatique d'accès suspects. Mise à jour toutes les minutes.
          </p>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            last24h > 0
              ? "bg-red-100 text-red-700"
              : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {last24h > 0
            ? `${last24h} alerte(s) sur 24 h`
            : "Aucune alerte sur 24 h"}
        </span>
      </div>

      {loading && (
        <p className="text-sm text-slate-500">Chargement…</p>
      )}

      {error && (
        <p className="text-sm text-red-600">
          Erreur : {error}
        </p>
      )}

      {!loading && !error && alerts.length === 0 && (
        <p className="text-sm text-slate-500">
          Aucune alerte enregistrée.
        </p>
      )}

      <ul className="space-y-3">
        {alerts.map((a) => (
          <li
            key={a.id}
            className="rounded-xl border border-red-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-red-700">
                {LABELS[a.action] ?? a.action}
              </p>

              <span className="text-xs text-slate-500">
                {fmt(a.created_at)}
              </span>
            </div>

            <p className="mt-1 text-sm text-slate-700">
              {detailText(a)}
              {a.user_email ? ` · ${a.user_email}` : ""}
              {a.ip_address ? ` · IP ${a.ip_address}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
