import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import type { AppRole } from "@/lib/access";
import { useServerFn } from "@tanstack/react-start";
import { inviteUser } from "@/lib/users.functions";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Utilisateurs — MedLink" },
      { name: "description", content: "Créer des comptes et gérer les rôles." },
    ],
  }),
  component: UsersPage,
});

const ROLES: { v: AppRole; label: string }[] = [
  { v: "practitioner", label: "Praticien" },
  { v: "staff", label: "Personnel administratif" },
  { v: "admin", label: "Administrateur" },
  { v: "patient", label: "Patient" },
];
const label = (r: string) => ROLES.find((x) => x.v === r)?.label ?? r;
const selectCls = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Africa/Tunis",
  });
const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Tunis",
  });
const emailSchema = z.string().trim().toLowerCase().email().max(255);

function UsersPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("staff");
  const [practitioner, setPractitioner] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const sendInvite = useServerFn(inviteUser);

  const users = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw error;
      return data;
    },
  });
  const invites = useQuery({
    queryKey: ["admin", "invitations"],
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
    queryKey: ["admin", "practitioners-unlinked"],
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
      ["users", "invitations", "practitioners-unlinked"].map((k) =>
        qc.invalidateQueries({ queryKey: ["admin", k] }),
      ),
    );

  const invite = useMutation({
    mutationFn: async () => {
      const parsed = emailSchema.safeParse(email);
      if (!parsed.success) throw new Error("INVALID_EMAIL");
      const res = await sendInvite({
        data: {
          email: parsed.data,
          role,
          ...(role === "practitioner" && practitioner ? { practitionerId: practitioner } : {}),
        },
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      setEmail("");
      setPractitioner("");
      setFormError(null);
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
  const toggle = useMutation({
    mutationFn: async (v: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc("admin_set_active", { _user: v.id, _active: v.active });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_delete_user", { _user: id });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  const err = users.error ?? invite.error ?? revoke.error ?? toggle.error ?? del.error;
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const shown = useMemo(() => {
    const n = search.trim().toLowerCase();
    return (users.data ?? []).filter(
      (u) =>
        (roleFilter === "all" || u.roles.includes(roleFilter as AppRole)) &&
        (!n || `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(n)),
    );
  }, [users.data, search, roleFilter]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Utilisateurs"
        description="Invitez le personnel de la clinique : le rôle est attribué à l'inscription avec l'e-mail invité."
      />
      {err && (
        <Alert variant="destructive">
          <AlertDescription>{friendlyError(err)}</AlertDescription>
        </Alert>
      )}
      <Panel title="Inviter un utilisateur">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="ie">Adresse e-mail</Label>
            <Input
              id="ie"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ir">Rôle</Label>
            <select
              id="ir"
              className={selectCls}
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
            >
              {ROLES.filter((r) => r.v !== "patient").map((r) => (
                <option key={r.v} value={r.v}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {role === "practitioner" && (
            <div className="space-y-1.5">
              <Label htmlFor="ip">Fiche praticien</Label>
              <select
                id="ip"
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
        {formError && <p className="mt-2 text-sm text-destructive">{formError}</p>}
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
                  {i.email} · {label(i.role)}
                </span>
                <Button size="sm" variant="outline" onClick={() => revoke.mutate(i.id)}>
                  Révoquer
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={`Comptes (${shown.length})`}>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Input
            aria-label="Rechercher"
            placeholder="Rechercher un nom ou un e-mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            className="sm:col-span-2"
          />
          <select
            aria-label="Filtrer par rôle"
            className={selectCls}
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">Tous les rôles</option>
            {ROLES.map((r) => (
              <option key={r.v} value={r.v}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        {users.isLoading ? (
          <ListSkeleton />
        ) : !shown.length ? (
          <EmptyState title="Aucun compte" />
        ) : (
          <ul className="divide-y">
            {shown.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    {`${u.first_name} ${u.last_name}`.trim() || u.email}
                    {!u.is_active && (
                      <span className="ml-2 text-xs text-destructive">désactivé</span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {u.email}
                    {u.phone ? ` · ${u.phone}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Inscrit le {fmtDate(u.created_at)} · Dernière connexion :{" "}
                    {u.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : "jamais"}
                    {u.last_session_at
                      ? ` · Dernière session : ${fmtDateTime(u.last_session_at)}`
                      : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <span key={r} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                        {label(r)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggle.mutate({ id: u.id, active: !u.is_active })}
                  >
                    {u.is_active ? "Désactiver" : "Réactiver"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={del.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `Supprimer définitivement le compte ${u.email} ? Cette action est irréversible.`,
                        )
                      )
                        del.mutate(u.id);
                    }}
                  >
                    Supprimer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
