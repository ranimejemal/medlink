import { useEffect, useState } from "react";
import {
  downloadCsv, fetchAnonymizedStats, fetchClinicSupervision, fetchDirectionSummary, toCsv,
  type AnonymizedStats,
} from "@/lib/supervision";

type Tab = "cliniques" | "direction" | "export";

const card = "rounded-xl border border-slate-200 bg-white p-4 shadow-sm";
const muted = "text-sm text-slate-500";
const BRAND = "#0b1f3a";
const ACCENT = "#0e7490";

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null, error: null, loading: true,
  });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    load()
      .then((data) => { if (!cancelled) setState({ data, error: null, loading: false }); })
      .catch((e: Error) => { if (!cancelled) setState({ data: null, error: e.message, loading: false }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((100 * part) / total) : 0);

function delta(cur: number, prev: number) {
  if (prev === 0) return cur === 0 ? "stable" : "nouveau";
  const d = Math.round((100 * (cur - prev)) / prev);
  return `${d > 0 ? "+" : ""}${d} %`;
}

function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className={card}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold" style={{ color: BRAND }}>{value}</p>
      {hint ? <p className={muted}>{hint}</p> : null}
    </div>
  );
}

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-slate-500">
        <span>{label}</span>
        <span>{value} %</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full" style={{ width: `${Math.min(100, value)}%`, background: ACCENT }} />
      </div>
    </div>
  );
}

function Status({ loading, error }: { loading: boolean; error: string | null }) {
  if (loading) return <p className={muted}>Chargement…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  return null;
}

function ClinicsTab({ days }: { days: number }) {
  const { data, error, loading } = useLoad(() => fetchClinicSupervision(days), [days]);
  if (loading || error) return <Status loading={loading} error={error} />;
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {(data ?? []).map((c) => (
        <div key={c.clinic_id} className={`${card} space-y-3`}>
          <div>
            <h3 className="font-semibold" style={{ color: BRAND }}>{c.name}</h3>
            <p className={muted}>{c.city} · {c.practitioners} praticien(s)</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">Rendez-vous ({days} j)</dt><dd className="text-right font-medium">{c.total}</dd>
            <dt className="text-slate-500">Terminés</dt><dd className="text-right font-medium">{c.completed}</dd>
            <dt className="text-slate-500">Annulés</dt><dd className="text-right font-medium">{c.cancelled}</dd>
            <dt className="text-slate-500">Absents</dt><dd className="text-right font-medium">{c.no_show}</dd>
            <dt className="text-slate-500">À venir</dt><dd className="text-right font-medium">{c.upcoming}</dd>
          </dl>
          <Meter label="Occupation des 14 prochains jours" value={pct(c.booked_14d, c.slots_14d)} />
          <Meter label="Taux d'annulation" value={pct(c.cancelled, c.total)} />
        </div>
      ))}
      {(data ?? []).length === 0 ? <p className={muted}>Aucune clinique active.</p> : null}
    </div>
  );
}

function DirectionTab({ days }: { days: number }) {
  const { data, error, loading } = useLoad(() => fetchDirectionSummary(days), [days]);
  if (loading || error || !data) return <Status loading={loading} error={error ?? (data ? null : "Aucune donnée.")} />;
  const c = data.current;
  const p = data.previous;
  const maxWeek = Math.max(1, ...data.weekly.map((w) => w.online + w.by_staff));
  const staffTrend = p.by_staff === 0 ? "pas de période de référence" : `${delta(c.by_staff, p.by_staff)} par rapport à la période précédente`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Réservations" value={c.booked} hint={`${delta(c.booked, p.booked)} vs période précédente`} />
        <Kpi label="Part en ligne" value={`${pct(c.online, c.booked)} %`} hint={`${pct(p.online, p.booked)} % avant`} />
        <Kpi label="Annulations" value={`${pct(c.cancelled, c.booked)} %`} hint={`${c.cancelled} rendez-vous`} />
        <Kpi label="Absences" value={c.no_show} hint={`${p.no_show} avant`} />
        <Kpi label="Nouveaux patients" value={data.new_patients.current} hint={`${data.new_patients.previous} avant`} />
      </div>

      <div className={`${card} space-y-3`}>
        <div>
          <h3 className="font-semibold" style={{ color: BRAND }}>Suivi de la baisse des appels</h3>
          <p className={muted}>
            Réservations prises par le personnel (assimilées à des appels) : <strong>{c.by_staff}</strong>, {staffTrend}.
          </p>
        </div>
        <div className="space-y-2">
          {data.weekly.map((w) => (
            <div key={w.week} className="flex items-center gap-3 text-xs">
              <span className="w-24 shrink-0 text-slate-500">Sem. {w.week.slice(5)}</span>
              <div className="flex h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div style={{ width: `${(100 * w.online) / maxWeek}%`, background: ACCENT }} />
                <div style={{ width: `${(100 * w.by_staff) / maxWeek}%`, background: BRAND }} />
              </div>
              <span className="w-16 text-right text-slate-600">{w.online} / {w.by_staff}</span>
            </div>
          ))}
          {data.weekly.length === 0 ? <p className={muted}>Aucune réservation sur les 12 dernières semaines.</p> : null}
        </div>
        <p className="flex gap-4 text-xs text-slate-500">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: ACCENT }} />en ligne</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: BRAND }} />par le personnel</span>
        </p>
      </div>
    </div>
  );
}

function ExportTab() {
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(yearAgo);
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnonymizedStats | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      setResult(await fetchAnonymizedStats(from, to));
    } catch (e) {
      setResult(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-md border border-slate-300 px-3 py-2 text-sm";
  return (
    <div className={`${card} space-y-4`}>
      <div>
        <h3 className="font-semibold" style={{ color: BRAND }}>Export de statistiques anonymisées</h3>
        <p className={muted}>
          Effectifs par mois, ville et spécialité. Aucun nom, aucun identifiant. Les groupes de moins de 5 rendez-vous
          sont regroupés sous « Autres » (anonymat k = 5).
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">Du<br /><input type="date" className={input} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">Au<br /><input type="date" className={input} value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} /></label>
        <button onClick={generate} disabled={busy} className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: BRAND }}>
          {busy ? "Calcul…" : "Générer"}
        </button>
        {result && result.rows.length > 0 ? (
          <button
            onClick={() => downloadCsv(`statistiques-anonymisees-${from}_${to}.csv`, toCsv(result.rows))}
            className="rounded-md border px-4 py-2 text-sm font-semibold"
            style={{ borderColor: ACCENT, color: ACCENT }}
          >
            Télécharger le CSV
          </button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {result ? (
        result.rows.length === 0 ? (
          <p className={muted}>Aucune donnée publiable sur cette période (effectifs trop faibles).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Mois</th><th className="pr-4">Ville</th><th className="pr-4">Spécialité</th>
                  <th className="pr-4 text-right">Rendez-vous</th><th className="pr-4 text-right">Terminés</th>
                  <th className="pr-4 text-right">Annulés</th><th className="text-right">Absents</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-2 pr-4">{r.month}</td><td className="pr-4">{r.city}</td><td className="pr-4">{r.specialty}</td>
                    <td className="pr-4 text-right">{r.appointments}</td><td className="pr-4 text-right">{r.completed}</td>
                    <td className="pr-4 text-right">{r.cancelled}</td><td className="text-right">{r.no_show}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}

export function SupervisionPanel({ role }: { role: "admin" | "staff" }) {
  const [tab, setTab] = useState<Tab>("cliniques");
  const [days, setDays] = useState(30);
  const tabs: [Tab, string][] = [["cliniques", "Cliniques"]];
  if (role === "admin") tabs.push(["direction", "Direction"]);
  tabs.push(["export", "Export anonymisé"]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: BRAND }}>Supervision</h1>
          <p className={muted}>Activité des trois cliniques et indicateurs de pilotage.</p>
        </div>
        {tab !== "export" ? (
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
            <option value={7}>7 derniers jours</option>
            <option value={30}>30 derniers jours</option>
            <option value={90}>90 derniers jours</option>
          </select>
        ) : null}
      </div>

      <div className="flex gap-2 border-b border-slate-200">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === id ? "" : "border-transparent text-slate-500"}`}
            style={tab === id ? { borderColor: ACCENT, color: ACCENT } : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "cliniques" ? <ClinicsTab days={days} /> : null}
      {tab === "direction" && role === "admin" ? <DirectionTab days={days} /> : null}
      {tab === "export" ? <ExportTab /> : null}
    </div>
  );
}