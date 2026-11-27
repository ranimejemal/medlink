import type { ReactNode } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";

type AppAlert = {
  id: string;
  created_at: string;
  action: string;
  severity: string;
  user_email: string | null;
  ip_address: string | null;
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

type Props = {
  appAlerts: AppAlert[];
  wazuhAlerts: WazuhAlert[];
};

const COLORS = {
  red: "#dc2626",
  orange: "#f97316",
  yellow: "#eab308",
  blue: "#0e7490",
  navy: "#0b1f3a",
  green: "#16a34a",
};

const severityColors: Record<string, string> = {
  Critique: "#991b1b",
  Élevée: COLORS.red,
  Moyenne: COLORS.orange,
  Faible: COLORS.yellow,
};

const TIME_ZONE = "Africa/Tunis";

// Format de date tunisien
function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: TIME_ZONE,
  }).format(date);
}

// Clé de date basée sur le fuseau tunisien
function getDayKey(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Normalisation des types d'attaques
function normalizeAttackType(type: string): string {
  const value = type
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, ".")
    .replace(/\.+/g, ".");

  if (value.includes("brute.force") || value.includes("bruteforce")) {
    return "Brute Force";
  }

  if (value.includes("suspicious") || value.includes("access.denied")) {
    return "Accès suspect";
  }

  if (value.includes("mass.access") || value.includes("mass.accessed")) {
    return "Accès massif aux dossiers";
  }

  if (value.includes("login.failed")) {
    return "Échec de connexion";
  }

  if (value.includes("login.blocked")) {
    return "Connexion bloquée";
  }

  if (value.includes("mfa.failed")) {
    return "Échec MFA";
  }

  return type.trim() || "Autre événement";
}

// Classification de la gravité Wazuh
function getSeverity(level: number): string {
  if (level >= 12) return "Critique";
  if (level >= 10) return "Élevée";
  if (level >= 7) return "Moyenne";
  return "Faible";
}

// Classification de la gravité MedLink
function getAppSeverity(severity: string): string {
  const value = severity.trim().toLowerCase();

  if (["critical", "critique"].includes(value)) {
    return "Critique";
  }

  if (["high", "élevée", "elevee", "error"].includes(value)) {
    return "Élevée";
  }

  if (["medium", "moderate", "moyenne", "warning"].includes(value)) {
    return "Moyenne";
  }

  return "Faible";
}

// Vérification des adresses IPv4 publiques
function isPublicIPv4(ip: string): boolean {
  const parts = ip.split(".");

  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
    return false;
  }

  const [a, b, c] = parts.map(Number);

  if (a === undefined || b === undefined || c === undefined) {
    return false;
  }

  if (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  ) {
    return false;
  }

  return true;
}

// Exclusion des adresses IPv4/IPv6 non publiques
function isPublicIP(value: string | null): boolean {
  if (!value) return false;

  const ip = value.trim().toLowerCase();

  if (!ip) return false;

  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return isPublicIPv4(ip);
  }

  // IPv4 avec port ou format IPv6 non reconnu
  if (!ip.includes(":")) return false;

  // Adresses locales et réservées IPv6
  if (
    ip === "::" ||
    ip === "::1" ||
    ip.startsWith("fe80:") ||
    ip.startsWith("fc") ||
    ip.startsWith("fd") ||
    ip.startsWith("ff") ||
    ip.startsWith("2001:db8:")
  ) {
    return false;
  }

  // IPv4 mappée en IPv6
  if (ip.startsWith("::ffff:")) {
    const mappedIPv4 = ip.slice(7);
    return isPublicIPv4(mappedIPv4);
  }

  return true;
}

// Carte de statistiques
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-5 font-bold text-[#0b1f3a]">{title}</h3>
      {children}
    </section>
  );
}

// Composant principal
export function SecurityAnalytics({ appAlerts, wazuhAlerts }: Props) {
  // 1. Attaques par type
  const typeMap = new Map<string, number>();

  wazuhAlerts.forEach((alert) => {
    const type = normalizeAttackType(alert.event_type || "Autre événement");

    typeMap.set(type, (typeMap.get(type) ?? 0) + 1);
  });

  appAlerts.forEach((alert) => {
    const type = normalizeAttackType(alert.action || "Autre événement");

    typeMap.set(type, (typeMap.get(type) ?? 0) + 1);
  });

  const typeData = Array.from(typeMap, ([name, total]) => ({
    name,
    total,
  })).sort((a, b) => b.total - a.total);

  // 2. Évolution des alertes sur les 7 derniers jours
  const now = new Date();

  const dailyMap = new Map<
    string,
    {
      day: string;
      wazuh: number;
      medlink: number;
    }
  >();

  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);

    const key = getDayKey(date.toISOString());

    dailyMap.set(key, {
      day: formatDay(date),
      wazuh: 0,
      medlink: 0,
    });
  }

  wazuhAlerts.forEach((alert) => {
    const key = getDayKey(alert.detected_at);
    const item = dailyMap.get(key);

    if (item) item.wazuh++;
  });

  appAlerts.forEach((alert) => {
    const key = getDayKey(alert.created_at);
    const item = dailyMap.get(key);

    if (item) item.medlink++;
  });

  const dailyData = Array.from(dailyMap.values());

  // 3. Répartition des niveaux de gravité
  const severityMap: Record<string, number> = {
    Critique: 0,
    Élevée: 0,
    Moyenne: 0,
    Faible: 0,
  };

  wazuhAlerts.forEach((alert) => {
    const severity = getSeverity(alert.rule_level);

    severityMap[severity] = (severityMap[severity] ?? 0) + 1;
  });

  appAlerts.forEach((alert) => {
    const severity = getAppSeverity(alert.severity);

    severityMap[severity] = (severityMap[severity] ?? 0) + 1;
  });

  const severityData = Object.entries(severityMap).map(([name, value]) => ({
    name,
    value,
  }));

  const filteredSeverityData = severityData.filter((item) => item.value > 0);

  // 4. Top 5 des adresses IP publiques suspectes
  const ipMap = new Map<string, number>();

  [...wazuhAlerts, ...appAlerts].forEach((alert) => {
    const ip = alert.ip_address?.trim();

    if (ip && isPublicIP(ip)) {
      ipMap.set(ip, (ipMap.get(ip) ?? 0) + 1);
    }
  });

  const topIPs = Array.from(ipMap, ([ip, total]) => ({
    ip,
    total,
  }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div>
        <h2 className="text-xl font-bold text-[#0b1f3a]">Analyse et statistiques SIEM</h2>

        <p className="mt-1 text-sm text-slate-500">
          Analyse des événements Wazuh et MedLink à partir des alertes chargées.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 1. Attaques par type */}
        <Panel title="Attaques par type">
          {typeData.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune donnée disponible.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={typeData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis type="number" allowDecimals={false} />

                <YAxis type="category" dataKey="name" width={145} tick={{ fontSize: 11 }} />

                <Tooltip />

                <Bar dataKey="total" name="Alertes" fill={COLORS.red} radius={[0, 5, 5, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* 2. Évolution temporelle */}
        <Panel title="Évolution des alertes — 7 jours">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={dailyData} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />

              <XAxis dataKey="day" tick={{ fontSize: 11 }} />

              <YAxis allowDecimals={false} />

              <Tooltip />

              <Legend />

              <Line
                type="monotone"
                dataKey="wazuh"
                name="Wazuh"
                stroke={COLORS.red}
                strokeWidth={3}
                dot={{ r: 4 }}
                connectNulls
              />

              <Line
                type="monotone"
                dataKey="medlink"
                name="MedLink"
                stroke={COLORS.blue}
                strokeWidth={3}
                dot={{ r: 4 }}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        {/* 3. Répartition des gravités */}
        <Panel title="Répartition par niveau de gravité">
          {filteredSeverityData.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune donnée disponible.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={filteredSeverityData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {filteredSeverityData.map((item) => (
                    <Cell key={item.name} fill={severityColors[item.name]} />
                  ))}
                </Pie>

                <Tooltip />

                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Panel>

        {/* 4. Top 5 des IP */}
        <Panel title="Top 5 des adresses IP publiques suspectes">
          {topIPs.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune adresse IP publique disponible.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={topIPs} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis dataKey="ip" tick={{ fontSize: 10 }} />

                <YAxis allowDecimals={false} />

                <Tooltip />

                <Bar dataKey="total" name="Alertes" fill={COLORS.blue} radius={[5, 5, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>

      {/* Note */}
      <p className="text-xs text-slate-400">
        Statistiques calculées sur les alertes récupérées par l'application. Les adresses IPv4
        privées, locales et réservées aux tests sont exclues du classement IP. Les adresses IPv6
        locales et de documentation sont également exclues.
      </p>
    </div>
  );
}
