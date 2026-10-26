import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/medlink/ui";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/staff/users")({
  head: () => ({
    meta: [
      { title: "Comptes — MedLink" },
      { name: "description", content: "Créer les comptes des praticiens et des agents." },
    ],
  }),
  component: StaffUsersPage,
});

type Role = "practitioner" | "staff";
const LABEL: Record<string, string> = {
  practitioner: "Praticien",
  staff: "Agent administratif",
  admin: "Administrateur",
  patient: "Patient",
};
const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const emailSchema = z.string().trim().toLowerCase().email().max(255);

function StaffUsersPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("practitioner");
  const [practitioner, setPractitioner] = useState("");

  const users = useQuery({
    queryKey: ["staff", "users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("staff_list_users");
      if (error) throw error;
      return data;
    },
  });
  const invites = useQuery({
    queryKey: ["staff", "invitations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_invitations")
        .select("id,email,role,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const pracs = useQuery({
    queryKey: ["staff", "unlinked"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practitioners")
        .select("id,title,first_name,last_name")
        .is("user_id", null)
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });
  const refresh = () =>
    Promise.all(
      ["users", "invitations", "unlinked"].map((k) =>
        qc.invalidateQueries({ queryKey: ["staff", k] }),
      ),
    );

  const invite = useMutation({
    mutationFn: async () => {
      const parsed = emailSchema.safeParse(email);
      if (!parsed.success) throw new Error("INVALID_EMAIL");
      const { error } = await supabase.rpc("admin_invite_user", {
        _email: parsed.data,
        _role: role,
        ...(role === "practitioner" && practitioner ? { _practitioner: practitioner } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setEmail("");
      setPractitioner("");
      void refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("account_invitations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const err = users.error ?? invite.error ?? revoke.error;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comptes"
        description="Créez le compte d'un praticien ou d'un agent : le rôle est attribué quand la personne s'inscrit avec l'e-mail invité."
      />
      {err && (
        <Alert variant="destructive">
          <AlertDescription>{friendlyError(err)}</AlertDescription>
        </Alert>
      )}
      <Panel title="Inviter un utilisateur">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="se">Adresse e-mail</Label>
            <Input
              id="se"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sr">Rôle</Label>
            <select
              id="sr"
              className={selectCls}
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="practitioner">Praticien</option>
              <option value="staff">Agent administratif</option>
            </select>
          </div>
          {role === "practitioner" && (
            <div className="space-y-1.5">
              <Label htmlFor="sp">Fiche praticien</Label>
              <select
                id="sp"
                className={selectCls}
                value={practitioner}
                onChange={(e) => setPractitioner(e.target.value)}
              >
                <option value="">—</option>
                {pracs.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} {p.first_name} {p.last_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <Button className="mt-4" onClick={() => invite.mutate()} disabled={invite.isPending}>
          {invite.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Créer l'invitation
        </Button>
      </Panel>
      <Panel title="Invitations en attente">
        {invites.isLoading ? (
          <ListSkeleton rows={2} />
        ) : !invites.data?.length ? (
          <EmptyState title="Aucune invitation en attente" />
        ) : (
          <ul className="divide-y">
            {invites.data.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {i.email} · {LABEL[i.role] ?? i.role}
                </span>
                {i.role !== "admin" && (
                  <Button size="sm" variant="outline" onClick={() => revoke.mutate(i.id)}>
                    Révoquer
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Praticiens et agents">
        {users.isLoading ? (
          <ListSkeleton />
        ) : !users.data?.length ? (
          <EmptyState title="Aucun compte" />
        ) : (
          <ul className="divide-y">
            {users.data.map((u) => (
              <li key={u.id} className="py-3">
                <p className="font-medium">
                  {`${u.first_name} ${u.last_name}`.trim() || u.email}
                  {!u.is_active && <span className="ml-2 text-xs text-destructive">désactivé</span>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {u.email} · {u.roles.map((r) => LABEL[r] ?? r).join(", ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
