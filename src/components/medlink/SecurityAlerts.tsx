import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SecurityAnalytics } from "./SecurityAnalytics";

type AlertDetails = {
  failed_attempts?: number;
  window_minutes?: number;
  events?: number;
};

type AppAlert = {
  id: string;
  created_at: string;
  action: string;
  severity: string;
  user_email: string | null;
  ip_address: string | null;
  details: AlertDetails | null;
};

type WazuhAlert = {
  id: string;
  wazuh_alert_id: string;
  rule_id: string;
  rule_level: number;
  description: string;
  event_type: string | null;
  ip_address: string | null;
  attempts: number | null;
  detected_at: string;
  created_at: string;
};

type Severity = "Critique" | "Élevée" | "Moyenne" | "Faible";
type SeverityFilter = "all" | "high" | "medium" | "low";

type CorrelationEvent = {
  id: string;
  ip: string;
  date: number;
  source: "Wazuh" | "MedLink";
  description: string;
  severity: Severity;
  severityScore: number;
  attempts: number;
};

type SecurityIncident = {
  id: string;
  ip: string;
  events: CorrelationEvent[];
  score: number;
  severity: Severity;
  sources: string[];
  firstSeen: number;
  lastSeen: number;
};

const CORRELATION_WINDOW = 15 * 60 * 1000;

const LABELS: Record<string, string> = {
  "security.bruteforce": "Échecs de connexion répétés",
  "security.brute_force": "Attaque par force brute",
  "security.suspicious_access": "Accès refusés répétés",
  "security.mass_access": "Consultation massive de dossiers",
  "auth.login_failed": "Tentative de connexion échouée",
  "auth.login_blocked": "Compte bloqué après plusieurs tentatives",
  "auth.login_inactive": "Connexion à un compte désactivé",
};

const fmt = (date: string | number) =>
  new Date(date).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Tunis",
  });

function normalize(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function matchesSearch(values: (string | null | undefined)[], query: string): boolean {
  const normalizedQuery = normalize(query.trim());

  if (!normalizedQuery) return true;

  return values.some((value) => normalize(value).includes(normalizedQuery));
}

function levelLabel(level: number): Severity {
  if (level >= 12) return "Critique";
  if (level >= 10) return "Élevée";
  if (level >= 7) return "Moyenne";
  return "Faible";
}

function getAppSeverity(severity: string): Severity {
  const value = normalize(severity);

  if (["critical", "critique"].includes(value)) {
    return "Critique";
  }

  if (["high", "elevee", "error"].includes(value)) {
    return "Élevée";
  }

  if (["medium", "moderate", "moyenne", "warning"].includes(value)) {
    return "Moyenne";
  }

  return "Faible";
}

function getSeverityScore(severity: Severity): number {
  switch (severity) {
    case "Critique":
      return 90;
    case "Élevée":
      return 75;
    case "Moyenne":
      return 55;
    default:
      return 30;
  }
}

function getIncidentSeverity(score: number): Severity {
  if (score >= 85) return "Critique";
  if (score >= 70) return "Élevée";
  if (score >= 45) return "Moyenne";
  return "Faible";
}

function matchesAppSeverity(severity: string, filter: SeverityFilter): boolean {
  if (filter === "all") return true;

  const value = getAppSeverity(severity);

  if (filter === "high") {
    return value === "Critique" || value === "Élevée";
  }

  if (filter === "medium") return value === "Moyenne";

  return value === "Faible";
}

function matchesWazuhSeverity(level: number, filter: SeverityFilter): boolean {
  if (filter === "all") return true;
  if (filter === "high") return level >= 10;
  if (filter === "medium") return level >= 7 && level < 10;
  return level < 7;
}

function matchesIncidentSeverity(severity: Severity, filter: SeverityFilter): boolean {
  if (filter === "all") return true;

  if (filter === "high") {
    return severity === "Critique" || severity === "Élevée";
  }

  if (filter === "medium") return severity === "Moyenne";

  return severity === "Faible";
}

// Normaliser les IP pour regrouper les mêmes adresses.
function normalizeIp(raw: string): string {
  const ip = raw.trim().toLowerCase();

  if (ip.startsWith("::ffff:")) {
    return ip.slice(7);
  }

  return ip;
}

// Exclure les adresses locales ou réservées à la documentation.
// Les adresses privées d'entreprise restent autorisées.
function isExcludedCorrelationIP(raw: string): boolean {
  const ip = normalizeIp(raw);

  if (!ip || ip === "::" || ip === "::1" || ip === "0.0.0.0" || ip === "unknown") {
    return true;
  }

  if (ip.includes(":")) {
    return ip.startsWith("fe80:") || ip.startsWith("ff") || ip.startsWith("2001:db8:");
  }

  const parts = ip.split(".");

  if (parts.length !== 4) return true;

  const numbers = parts.map(Number);

  if (numbers.some((number) => !Number.isInteger(number) || number < 0 || number > 255)) {
    return true;
  }

  const [a, b, c] = numbers;

  return (
    a === 0 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    (a !== undefined && a >= 224)
  );
}

function safeAttempts(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }

  return Math.max(0, value);
}

function buildCorrelationEvents(
  appAlerts: AppAlert[],
  wazuhAlerts: WazuhAlert[],
): CorrelationEvent[] {
  const events: CorrelationEvent[] = [];

  for (const alert of appAlerts) {
    if (!alert.ip_address || isExcludedCorrelationIP(alert.ip_address)) {
      continue;
    }

    const date = new Date(alert.created_at).getTime();

    if (!Number.isFinite(date)) continue;

    const severity = getAppSeverity(alert.severity);

    events.push({
      id: `app-${alert.id}`,
      ip: normalizeIp(alert.ip_address),
      date,
      source: "MedLink",
      description: LABELS[alert.action] ?? alert.action,
      severity,
      severityScore: getSeverityScore(severity),
      attempts: safeAttempts(alert.details?.failed_attempts ?? alert.details?.events ?? 1),
    });
  }

  for (const alert of wazuhAlerts) {
    if (!alert.ip_address || isExcludedCorrelationIP(alert.ip_address)) {
      continue;
    }

    const date = new Date(alert.detected_at).getTime();

    if (!Number.isFinite(date)) continue;

    const severity = levelLabel(alert.rule_level);

    events.push({
      id: `wazuh-${alert.id}`,
      ip: normalizeIp(alert.ip_address),
      date,
      source: "Wazuh",
      description: alert.description,
      severity,
      severityScore: getSeverityScore(severity),
      attempts: safeAttempts(alert.attempts ?? 1),
    });
  }

  return events;
}

function buildIncidents(appAlerts: AppAlert[], wazuhAlerts: WazuhAlert[]): SecurityIncident[] {
  const events = buildCorrelationEvents(appAlerts, wazuhAlerts);

  const ipGroups = new Map<string, CorrelationEvent[]>();

  for (const event of events) {
    const group = ipGroups.get(event.ip) ?? [];
    group.push(event);
    ipGroups.set(event.ip, group);
  }

  const incidents: SecurityIncident[] = [];

  for (const [ip, group] of ipGroups) {
    group.sort((a, b) => a.date - b.date);

    let currentGroup: CorrelationEvent[] = [];

    const saveIncident = () => {
      if (currentGroup.length < 2) return;

      const firstEvent = currentGroup[0];
      const lastEvent = currentGroup[currentGroup.length - 1];

      if (!firstEvent || !lastEvent) return;

      const sources = Array.from(new Set(currentGroup.map((event) => event.source)));

      const maxSeverity = Math.max(...currentGroup.map((event) => event.severityScore));

      const attempts = currentGroup.reduce((total, event) => total + event.attempts, 0);

      const repetitionBonus = Math.min(20, (currentGroup.length - 1) * 5);

      const sourceBonus = sources.length > 1 ? 10 : 0;

      const attemptsBonus = Math.min(10, Math.max(0, attempts - currentGroup.length) * 2);

      const score = Math.min(100, maxSeverity + repetitionBonus + sourceBonus + attemptsBonus);

      incidents.push({
        id: `${ip}-${firstEvent.id}`,
        ip,
        events: [...currentGroup],
        score,
        severity: getIncidentSeverity(score),
        sources,
        firstSeen: firstEvent.date,
        lastSeen: lastEvent.date,
      });
    };

    for (const event of group) {
      if (currentGroup.length === 0) {
        currentGroup.push(event);
        continue;
      }

      const firstEvent = currentGroup[0];

      if (firstEvent && event.date - firstEvent.date <= CORRELATION_WINDOW) {
        currentGroup.push(event);
      } else {
        saveIncident();
        currentGroup = [event];
      }
    }

    saveIncident();
  }

  return incidents.sort((a, b) => b.score - a.score || b.lastSeen - a.lastSeen);
}

function severityStyle(severity: Severity): string {
  switch (severity) {
    case "Critique":
      return "bg-red-100 text-red-800 border-red-200";
    case "Élevée":
      return "bg-orange-100 text-orange-800 border-orange-200";
    case "Moyenne":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    default:
      return "bg-green-100 text-green-800 border-green-200";
  }
}

function AppAlertCard({ alert }: { alert: AppAlert }) {
  const details = alert.details ?? {};

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap justify-between gap-2">
        <strong className="text-red-700">{LABELS[alert.action] ?? alert.action}</strong>

        <span className="text-xs text-slate-500">{fmt(alert.created_at)}</span>
      </div>

      <p className="mt-2 text-sm text-slate-700">
        {details.failed_attempts ?? details.events ?? 1} événement(s)
        {alert.user_email ? ` · ${alert.user_email}` : ""}
        {alert.ip_address ? ` · IP ${alert.ip_address}` : ""}
      </p>

      {details.window_minutes !== undefined && (
        <p className="mt-1 text-xs text-slate-500">Fenêtre : {details.window_minutes} minutes</p>
      )}
    </li>
  );
}

function WazuhAlertCard({ alert }: { alert: WazuhAlert }) {
  const severity = levelLabel(alert.rule_level);

  return (
    <li className="rounded-xl border border-red-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-red-700">{alert.description}</strong>

        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${severityStyle(severity)}`}
        >
          {severity} · Niveau {alert.rule_level}
        </span>
      </div>

      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
        <p>Règle Wazuh : {alert.rule_id}</p>
        <p>Événement : {alert.event_type ?? "Non renseigné"}</p>
        <p>Adresse IP : {alert.ip_address ?? "Non renseignée"}</p>
        <p>Tentatives : {alert.attempts ?? "Non renseignées"}</p>
        <p>Date : {fmt(alert.detected_at)}</p>
      </div>

      <p className="mt-2 break-all text-xs text-slate-400">ID Wazuh : {alert.wazuh_alert_id}</p>
    </li>
  );
}

function IncidentCard({ incident }: { incident: SecurityIncident }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-[#0b1f3a]">Incident détecté · {incident.ip}</h3>

          <p className="mt-1 text-sm text-slate-500">
            {incident.events.length} événements corrélés
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${severityStyle(incident.severity)}`}
          >
            {incident.severity}
          </span>

          <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-[#0b1f3a]">
            {incident.score}/100
          </span>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex justify-between text-xs text-slate-500">
          <span>Score de risque</span>
          <span>{incident.score}%</span>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${
              incident.score >= 85
                ? "bg-red-600"
                : incident.score >= 70
                  ? "bg-orange-500"
                  : incident.score >= 45
                    ? "bg-yellow-500"
                    : "bg-green-500"
            }`}
            style={{ width: `${incident.score}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {incident.sources.map((source) => (
          <span
            key={source}
            className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800"
          >
            {source}
          </span>
        ))}
      </div>

      <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
        {incident.events.map((event) => (
          <div key={event.id} className="flex flex-wrap items-start justify-between gap-2 text-sm">
            <div>
              <p className="font-medium text-slate-700">{event.description}</p>

              <p className="text-xs text-slate-500">
                Source : {event.source} · {event.severity}
              </p>
            </div>

            <span className="text-xs text-slate-500">{fmt(event.date)}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Première détection : {fmt(incident.firstSeen)}
        {" · "}
        Dernière détection : {fmt(incident.lastSeen)}
      </p>
    </article>
  );
}

export function SecurityAlerts() {
  const [appAlerts, setAppAlerts] = useState<AppAlert[]>([]);
  const [wazuhAlerts, setWazuhAlerts] = useState<WazuhAlert[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  const [demoMode, setDemoMode] = useState(false);

  const demoAlerts = useMemo(() => {
    const now = Date.now();

    const app: AppAlert = {
      id: "demo-app-001",
      created_at: new Date(now - 2 * 60_000).toISOString(),
      action: "security.bruteforce",
      severity: "critical",
      user_email: "demo@medlink.test",
      ip_address: "10.0.0.25",
      details: {
        failed_attempts: 5,
        window_minutes: 15,
      },
    };

    const wazuh: WazuhAlert = {
      id: "demo-wazuh-001",
      wazuh_alert_id: "DEMO-100105",
      rule_id: "100105",
      rule_level: 10,
      description: "Attaque Brute Force détectée (simulation)",
      event_type: "security.brute_force",
      ip_address: "10.0.0.25",
      attempts: 5,
      detected_at: new Date(now - 60_000).toISOString(),
      created_at: new Date(now - 60_000).toISOString(),
    };

    return { app, wazuh };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const [appResult, wazuhResult] = await Promise.all([
        supabase
          .from("audit_logs")
          .select("id, created_at, action, severity, user_email, ip_address, details")
          .or(
            "action.like.security.%,action.in.(auth.login_failed,auth.login_blocked,auth.login_inactive)",
          )
          .order("created_at", { ascending: false })
          .limit(50),

        supabase
          .from("wazuh_alerts")
          .select(
            "id, wazuh_alert_id, rule_id, rule_level, description, event_type, ip_address, attempts, detected_at, created_at",
          )
          .order("detected_at", { ascending: false })
          .limit(50),
      ]);

      if (appResult.error) {
        throw new Error(`Alertes applicatives : ${appResult.error.message}`);
      }

      if (wazuhResult.error) {
        throw new Error(`Alertes Wazuh : ${wazuhResult.error.message}`);
      }

      const normalizedAppAlerts: AppAlert[] = (appResult.data ?? []).map((item) => ({
        ...item,
        details: (item.details ?? null) as AlertDetails | null,
      }));

      setAppAlerts(normalizedAppAlerts);
      setWazuhAlerts(wazuhResult.data ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const interval = setInterval(() => {
      void load();
    }, 60_000);

    return () => clearInterval(interval);
  }, [load]);

  const last24h = useMemo(() => {
    const dates = [
      ...appAlerts.map((alert) => alert.created_at),
      ...wazuhAlerts.map((alert) => alert.detected_at),
    ];

    return dates.filter((date) => {
      const elapsed = Date.now() - new Date(date).getTime();

      return elapsed >= 0 && elapsed < 86_400_000;
    }).length;
  }, [appAlerts, wazuhAlerts]);

  const filteredWazuhAlerts = useMemo(
    () =>
      wazuhAlerts.filter((alert) => {
        const searchMatch = matchesSearch(
          [
            alert.description,
            alert.rule_id,
            alert.event_type,
            alert.ip_address,
            alert.wazuh_alert_id,
          ],
          search,
        );

        return searchMatch && matchesWazuhSeverity(alert.rule_level, severityFilter);
      }),
    [wazuhAlerts, search, severityFilter],
  );

  const filteredAppAlerts = useMemo(
    () =>
      appAlerts.filter((alert) => {
        const searchMatch = matchesSearch(
          [
            alert.action,
            LABELS[alert.action] ?? alert.action,
            alert.user_email,
            alert.ip_address,
            alert.severity,
          ],
          search,
        );

        return searchMatch && matchesAppSeverity(alert.severity, severityFilter);
      }),
    [appAlerts, search, severityFilter],
  );

  const totalFiltered = filteredWazuhAlerts.length + filteredAppAlerts.length;

  // La corrélation utilise toutes les alertes,
  // puis applique les filtres sur les incidents obtenus.
  const allIncidents = useMemo(
    () =>
      buildIncidents(
        demoMode ? [...appAlerts, demoAlerts.app] : appAlerts,
        demoMode ? [...wazuhAlerts, demoAlerts.wazuh] : wazuhAlerts,
      ),
    [appAlerts, wazuhAlerts, demoMode, demoAlerts],
  );

  const incidents = useMemo(
    () =>
      allIncidents.filter((incident) => {
        const searchMatch = matchesSearch(
          [
            incident.ip,
            incident.severity,
            ...incident.events.map((event) => event.description),
            ...incident.sources,
          ],
          search,
        );

        return searchMatch && matchesIncidentSeverity(incident.severity, severityFilter);
      }),
    [allIncidents, search, severityFilter],
  );

  const criticalIncidents = incidents.filter((incident) => incident.severity === "Critique").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0b1f3a]">Centre de sécurité MedLink</h1>

        <p className="mt-1 text-sm text-slate-500">
          Supervision des événements de sécurité et des alertes SIEM. Actualisation automatique
          toutes les minutes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-500">Alertes applicatives</p>

          <p className="mt-1 text-2xl font-bold text-[#0b1f3a]">{appAlerts.length}</p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-500">Alertes Wazuh</p>

          <p className="mt-1 text-2xl font-bold text-red-600">{wazuhAlerts.length}</p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <p className="text-sm text-slate-500">Alertes sur 24 heures</p>

          <p className="mt-1 text-2xl font-bold text-[#0b1f3a]">{last24h}</p>
        </div>
      </div>

      <SecurityAnalytics appAlerts={appAlerts} wazuhAlerts={wazuhAlerts} />

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-bold text-[#0b1f3a]">Recherche et filtrage des alertes</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Rechercher par IP, événement, règle..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none focus:border-cyan-600"
          />

          <select
            value={severityFilter}
            onChange={(event) => setSeverityFilter(event.target.value as SeverityFilter)}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none focus:border-cyan-600"
          >
            <option value="all">Toutes les gravités</option>
            <option value="high">Élevée et critique</option>
            <option value="medium">Moyenne</option>
            <option value="low">Faible</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <span>{totalFiltered} résultat(s)</span>

          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSeverityFilter("all");
            }}
            className="font-semibold text-cyan-700 hover:underline"
          >
            Réinitialiser les filtres
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-[#0b1f3a]">
              Corrélation des incidents de sécurité
            </h2>

            <p className="text-sm text-slate-500">
              Regroupement des événements par adresse IP dans une fenêtre de 15 minutes.
            </p>

            <div className="mt-3">
              <button
                type="button"
                aria-pressed={demoMode}
                onClick={() => setDemoMode((previous) => !previous)}
                className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-800"
              >
                {demoMode ? "Désactiver la démonstration" : "Lancer une simulation"}
              </button>

              {demoMode && (
                <p className="mt-2 text-sm font-medium text-cyan-700">
                  Mode démonstration actif : données locales non enregistrées dans Supabase.
                </p>
              )}
            </div>
          </div>

          <span className="rounded-full bg-cyan-50 px-3 py-1 text-sm font-semibold text-cyan-800">
            {incidents.length} incident(s)
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm text-slate-500">Incidents corrélés</p>

            <p className="mt-1 text-2xl font-bold text-[#0b1f3a]">{incidents.length}</p>
          </div>

          <div className="rounded-xl border bg-white p-4">
            <p className="text-sm text-slate-500">Incidents critiques</p>

            <p className="mt-1 text-2xl font-bold text-red-600">{criticalIncidents}</p>
          </div>
        </div>

        {incidents.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
            Aucun incident corrélé trouvé. Il faut au moins deux événements associés à la même
            adresse IP dans une fenêtre de 15 minutes.
          </div>
        ) : (
          <div className="space-y-3">
            {incidents.map((incident) => (
              <IncidentCard key={incident.id} incident={incident} />
            ))}
          </div>
        )}

        <p className="text-xs text-slate-400">
          Le score est calculé par une méthode heuristique basée sur la gravité, le nombre
          d'événements, les tentatives et la diversité des sources. Il ne constitue pas encore une
          prédiction ML.
        </p>
      </section>

      {loading && <p className="text-sm text-slate-500">Chargement des alertes...</p>}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Erreur : {error}
          <button
            type="button"
            onClick={() => void load()}
            className="ml-3 font-semibold underline"
          >
            Réessayer
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-bold text-[#0b1f3a]">Alertes SIEM — Wazuh</h2>

              <p className="text-sm text-slate-500">
                Alertes détectées et transmises par le collecteur SIEM.
              </p>
            </div>

            {filteredWazuhAlerts.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aucune alerte Wazuh correspondant aux critères.
              </p>
            ) : (
              <ul className="space-y-3">
                {filteredWazuhAlerts.map((alert) => (
                  <WazuhAlertCard key={alert.id} alert={alert} />
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-[#0b1f3a]">Alertes applicatives — MedLink</h2>

            {filteredAppAlerts.length === 0 ? (
              <p className="text-sm text-slate-500">
                Aucune alerte applicative correspondant aux critères.
              </p>
            ) : (
              <ul className="space-y-3">
                {filteredAppAlerts.map((alert) => (
                  <AppAlertCard key={alert.id} alert={alert} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
