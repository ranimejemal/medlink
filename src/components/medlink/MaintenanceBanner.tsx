import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { getMaintenanceDemo, type MaintenanceAnnouncement } from "@/lib/maintenance-demo";

export function MaintenanceBanner() {
  const [announcement, setAnnouncement] = useState<MaintenanceAnnouncement | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const refresh = () => {
      setAnnouncement(getMaintenanceDemo());
    };

    refresh();

    window.addEventListener("maintenance-demo-updated", refresh);
    window.addEventListener("storage", refresh);

    return () => {
      window.removeEventListener("maintenance-demo-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  if (!import.meta.env.DEV || !announcement) {
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
            Du {new Date(announcement.startsAt).toLocaleString("fr-FR")}
            {" au "}
            {new Date(announcement.endsAt).toLocaleString("fr-FR")}
          </p>

          <p className="mt-2 text-xs">Démonstration locale uniquement — annonce non publiée.</p>
        </div>
      </div>
    </div>
  );
}
