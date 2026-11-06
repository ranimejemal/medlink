import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarPlus, CalendarX, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/medlink/ui";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/practitioner/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — MedLink" },
      { name: "description", content: "Réservations et annulations de vos patients." },
    ],
  }),
  component: NotificationsPage,
});

const fmt = (d: string) =>
  new Date(d).toLocaleString("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Tunis",
  });

const ICONS = { cancellation: CalendarX, appointment: CalendarPlus } as const;

// US-20: cancel_appointment and book_appointment write these notifications in the database;
// RLS only returns the signed-in practitioner's own.
function NotificationsPage() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id,type,title,message,is_read,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const unread = (list.data ?? []).filter((n) => !n.is_read);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Vous êtes prévenu dès qu'un patient réserve ou annule un rendez-vous."
        actions={
          unread.length > 0 && (
            <Button
              variant="outline"
              disabled={markRead.isPending}
              onClick={() => markRead.mutate(unread.map((n) => n.id))}
            >
              <CheckCheck className="h-4 w-4" /> Tout marquer comme lu
            </Button>
          )
        }
      />
      <Panel>
        {list.isLoading ? (
          <ListSkeleton />
        ) : !list.data?.length ? (
          <EmptyState title="Aucune notification" />
        ) : (
          <ul className="divide-y">
            {list.data.map((n) => {
              const Icon = ICONS[n.type as keyof typeof ICONS] ?? Bell;
              const cancelled = n.type === "cancellation";
              return (
                <li
                  key={n.id}
                  className={cn("flex items-start gap-3 py-3", !n.is_read && "font-medium")}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      cancelled
                        ? "bg-destructive/10 text-destructive"
                        : "bg-accent text-accent-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {n.title}
                      {!n.is_read && (
                        <span className="ml-2 inline-block h-2 w-2 rounded-full bg-info align-middle" />
                      )}
                    </p>
                    <p className="text-sm font-normal text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-xs font-normal text-muted-foreground">
                      {fmt(n.created_at)}
                    </p>
                  </div>
                  {!n.is_read && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={markRead.isPending}
                      onClick={() => markRead.mutate([n.id])}
                    >
                      Marquer comme lu
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
