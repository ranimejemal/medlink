import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Panel } from "@/components/medlink/ui";
import { friendlyError } from "@/lib/errors";
import { DEFAULT_HOURS, closedMessage, isPortalOpen, type PortalHours } from "@/lib/portal-hours";
import { usePortalHours } from "@/hooks/use-portal-hours";

// US-49: banner shown outside opening hours. Re-checked every minute.
export function PortalHoursBanner() {
  const { data: hours } = usePortalHours();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!hours || isPortalOpen(now, hours)) return null;
  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm"
    >
      <Clock className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{closedMessage(hours)}</p>
    </div>
  );
}

// US-49: the administrator sets the hours or switches the rule off (e.g. for a demo).
export function PortalHoursSettings() {
  const qc = useQueryClient();
  const { data } = usePortalHours();
  const [draft, setDraft] = useState<PortalHours | null>(null);
  const [saving, setSaving] = useState(false);
  const h = draft ?? data ?? DEFAULT_HOURS;

  async function save() {
    if (h.close_hour <= h.open_hour) {
      toast.error("L'heure de fermeture doit être après l'heure d'ouverture.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("portal_hours")
      .update({ open_hour: h.open_hour, close_hour: h.close_hour, enabled: h.enabled })
      .eq("id", true);
    setSaving(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    toast.success("Horaires enregistrés.");
    setDraft(null);
    await qc.invalidateQueries({ queryKey: ["portal-hours"] });
  }

  return (
    <Panel title="Horaires du portail (US-49)">
      <p className="mb-4 text-sm text-muted-foreground">
        En dehors de ces horaires (heure de Tunis), aucun rendez-vous ne peut être pris en ligne et
        un message l'explique. La consultation reste possible.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor="open-hour">Ouverture (h)</Label>
          <Input
            id="open-hour"
            type="number"
            min={0}
            max={23}
            className="w-24"
            value={h.open_hour}
            onChange={(e) => setDraft({ ...h, open_hour: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="close-hour">Fermeture (h)</Label>
          <Input
            id="close-hour"
            type="number"
            min={1}
            max={24}
            className="w-24"
            value={h.close_hour}
            onChange={(e) => setDraft({ ...h, close_hour: Number(e.target.value) })}
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch
            id="hours-enabled"
            checked={h.enabled}
            onCheckedChange={(v) => setDraft({ ...h, enabled: v })}
          />
          <Label htmlFor="hours-enabled">Appliquer les horaires</Label>
        </div>
        <Button onClick={save} disabled={saving || !draft}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
    </Panel>
  );
}
