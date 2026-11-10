import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type MaintenanceAnnouncement = Tables<"maintenance_announcements">;

export function MaintenanceBanner() {
  const [announcement, setAnnouncement] = useState<MaintenanceAnnouncement | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadAnnouncement() {
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from("maintenance_announcements")
        .select("*")
        .eq("is_active", true)
        .lte("starts_at", now)
        .gte("ends_at", now)
        .order("starts_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        console.error("Erreur chargement maintenance :", error);
        setAnnouncement(null);
        return;
      }

      setAnnouncement(data);
    }

    void loadAnnouncement();

    // Actualiser les annonces toutes les 60 secondes.
    const interval = window.setInterval(() => {
      void loadAnnouncement();
    }, 60_000);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  if (!announcement) {
    return null;
  }

  return (
    <div
      role="status"
      className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />

        <div>
          <p className="font-semibold">{announcement.title}</p>

          <p className="mt-1 whitespace-pre-wrap text-sm">{announcement.message}</p>

          <p className="mt-2 text-xs">
            Du {new Date(announcement.starts_at).toLocaleString("fr-FR")}
            {" au "}
            {new Date(announcement.ends_at).toLocaleString("fr-FR")}
          </p>
        </div>
      </div>
    </div>
  );
}
