import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AuditEvent = {
  id: string;
  created_at: string;
  action: string;
  severity: string | null;
  user_email: string | null;
  ip_address: string | null;
};

export function AuditJournal() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data, error: fetchError } = await supabase
        .from("audit_logs")
        .select("id, created_at, action, severity, user_email, ip_address")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!active) return;

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setEvents(data ?? []);
        setError(null);
      }

      setLoading(false);
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0b1f3a]">
          Journal d'audit
        </h1>
        <p className="text-sm text-slate-500">
          Historique des événements de sécurité MedLink.
        </p>
      </div>

      {loading && <p>Chargement des événements...</p>}

      {error && (
        <p className="text-red-600">Erreur : {error}</p>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="text-slate-500">Aucun événement trouvé.</p>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Action</th>
                <th className="p-3">Gravité</th>
                <th className="p-3">Utilisateur</th>
                <th className="p-3">Adresse IP</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-t">
                  <td className="p-3">
                    {new Date(event.created_at).toLocaleString("fr-FR")}
                  </td>
                  <td className="p-3">{event.action}</td>
                  <td className="p-3">{event.severity ?? "—"}</td>
                  <td className="p-3">{event.user_email ?? "—"}</td>
                  <td className="p-3">{event.ip_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
