
export type AppSecurityAlert = {
  id: string;
  created_at: string;
  action: string;
  severity: string;
  user_email: string | null;
  ip_address: string | null;
};

export type WazuhSecurityAlert = {
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

export type CorrelationIncident = {
  id: string;
  ip_address: string;
  title: string;
  event_count: number;
  risk_score: number;
  risk_level: "Faible" | "Moyen" | "Élevé" | "Critique";
  first_seen: string;
  last_seen: string;
  sources: string[];
  events: string[];
};

type SecurityEvent = {
  id: string;
  ip: string;
  source: "Wazuh" | "MedLink";
  action: string;
  timestamp: number;
  date: string;
  baseScore: number;
};

const CORRELATION_WINDOW_MS = 15 * 60 * 1000;

function getAppBaseScore(severity: string): number {
  const value = severity.toLowerCase();

  if (["critical", "critique"].includes(value)) return 90;
  if (["high", "élevée", "elevee", "error"].includes(value)) return 70;
  if (["medium", "moderate", "moyenne", "warning"].includes(value)) return 45;

  return 20;
}

function getWazuhBaseScore(level: number): number {
  return Math.min(100, Math.max(0, level * 8));
}

function normalizeIp(ip: string | null): string | null {
  if (!ip) return null;

  const value = ip.trim().toLowerCase();

  if (
    !value ||
    value === "::1" ||
    value === "127.0.0.1" ||
    value === "::" ||
    value === "unknown"
  ) {
    return null;
  }

  return value;
}

function getRiskLevel(score: number): CorrelationIncident["risk_level"] {
  if (score >= 85) return "Critique";
  if (score >= 65) return "Élevé";
  if (score >= 35) return "Moyen";

  return "Faible";
}

function getIncidentTitle(events: SecurityEvent[]): string {
  const actions = events.map((event) => event.action.toLowerCase());

  if (actions.some((action) => action.includes("brute"))) {
    return "Activité potentielle de Brute Force";
  }

  if (actions.some((action) => action.includes("access"))) {
    return "Activité suspecte liée aux accès";
  }

  if (actions.some((action) => action.includes("login"))) {
    return "Activité suspecte d'authentification";
  }

  return "Activité de sécurité corrélée";
}

export function correlateSecurityAlerts(
  appAlerts: AppSecurityAlert[],
  wazuhAlerts: WazuhSecurityAlert[],
): CorrelationIncident[] {
  const events: SecurityEvent[] = [];

  for (const alert of appAlerts) {
    const ip = normalizeIp(alert.ip_address);
    const timestamp = new Date(alert.created_at).getTime();

    if (!ip || !Number.isFinite(timestamp)) continue;

    events.push({
      id: `medlink-${alert.id}`,
      ip,
      source: "MedLink",
      action: alert.action,
      timestamp,
      date: alert.created_at,
      baseScore: getAppBaseScore(alert.severity),
    });
  }

  for (const alert of wazuhAlerts) {
    const ip = normalizeIp(alert.ip_address);
    const timestamp = new Date(alert.detected_at).getTime();

    if (!ip || !Number.isFinite(timestamp)) continue;

    events.push({
      id: `wazuh-${alert.id}`,
      ip,
      source: "Wazuh",
      action: alert.event_type || alert.description,
      timestamp,
      date: alert.detected_at,
      baseScore: getWazuhBaseScore(alert.rule_level),
    });
  }

  // Regrouper les événements par adresse IP
  const eventsByIp = new Map<string, SecurityEvent[]>();

  for (const event of events) {
    const group = eventsByIp.get(event.ip) ?? [];
    group.push(event);
    eventsByIp.set(event.ip, group);
  }

  const incidents: CorrelationIncident[] = [];

  for (const [ip, ipEvents] of eventsByIp) {
    ipEvents.sort((a, b) => a.timestamp - b.timestamp);

    let cluster: SecurityEvent[] = [];

    const saveCluster = () => {
      if (cluster.length === 0) return;

      // Score basé sur la gravité maximale et la répétition
      const maxScore = Math.max(...cluster.map((e) => e.baseScore));
      const repetitionBonus = Math.min(
        (cluster.length - 1) * 8,
        24,
      );

      const riskScore = Math.min(
        100,
        maxScore + repetitionBonus,
      );

      const sources = [...new Set(cluster.map((e) => e.source))];

      incidents.push({
        id: `incident-${ip}-${cluster[0]!.timestamp}`,
        ip_address: ip,
        title: getIncidentTitle(cluster),
        event_count: cluster.length,
        risk_score: riskScore,
        risk_level: getRiskLevel(riskScore),
        first_seen: cluster[0]!.date,
        last_seen: cluster[cluster.length - 1]!.date,
        sources,
        events: cluster.map((event) => event.action),
      });

      cluster = [];
    };

    for (const event of ipEvents) {
      const previous = cluster[cluster.length - 1];

      if (
        previous &&
        event.timestamp - previous.timestamp > CORRELATION_WINDOW_MS
      ) {
        saveCluster();
      }

      cluster.push(event);
    }

    saveCluster();
  }

  return incidents.sort(
    (a, b) => b.risk_score - a.risk_score,
  );
}
