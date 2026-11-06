import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ListSkeleton, PageHeader, Panel } from "@/components/medlink/ui";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/patient/profile")({
  head: () => ({
    meta: [
      { title: "Mon profil — MedLink" },
      { name: "description", content: "Vos coordonnées et vos préférences de notification." },
    ],
  }),
  component: ProfilePage,
});

const contactSchema = z.object({
  first_name: z.string().trim().min(2, "Prénom requis").max(60),
  last_name: z.string().trim().min(2, "Nom requis").max(60),
  phone: z
    .string()
    .trim()
    .regex(/^(\+216)?\s?\d{2}\s?\d{3}\s?\d{3}$/, "Numéro tunisien invalide (ex. +216 20 123 456)"),
  date_of_birth: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Date de naissance invalide"),
});
const emailSchema = z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(255);

const fmtDate = (d: string) =>
  new Date(d).toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Tunis",
  });

function ProfilePage() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["patient", "profile"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id,email,first_name,last_name,phone,date_of_birth,notify_email,notify_sms,consent_at,consent_version",
        )
        .eq("id", u.user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({ first_name: "", last_name: "", phone: "", date_of_birth: "" });
  const [newEmail, setNewEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!me.data) return;
    setForm({
      first_name: me.data.first_name,
      last_name: me.data.last_name,
      phone: me.data.phone ?? "",
      date_of_birth: me.data.date_of_birth ?? "",
    });
  }, [me.data]);

  // RLS + column grants: a patient can only update these columns of their own row.
  const saveContact = useMutation({
    mutationFn: async () => {
      const p = contactSchema.safeParse(form);
      if (!p.success) throw new Error(p.error.issues[0]?.message);
      const { error } = await supabase
        .from("profiles")
        .update({
          first_name: p.data.first_name,
          last_name: p.data.last_name,
          phone: p.data.phone.replace(/\s+/g, "").replace(/^(\d{8})$/, "+216$1"),
          date_of_birth: p.data.date_of_birth || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", me.data!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setMsg("Coordonnées enregistrées.");
      qc.invalidateQueries({ queryKey: ["patient", "profile"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const savePrefs = useMutation({
    mutationFn: async (v: { notify_email?: boolean; notify_sms?: boolean }) => {
      const { error } = await supabase.from("profiles").update(v).eq("id", me.data!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["patient", "profile"] }),
  });

  // Supabase sends a confirmation link to the new address; the profile follows once confirmed.
  const changeEmail = useMutation({
    mutationFn: async () => {
      const p = emailSchema.safeParse(newEmail);
      if (!p.success) throw new Error(p.error.issues[0]?.message);
      const { error } = await supabase.auth.updateUser(
        { email: p.data },
        { emailRedirectTo: `${window.location.origin}/patient/profile` },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      setMsg(`Un lien de confirmation a été envoyé à ${newEmail.trim()}.`);
      setNewEmail("");
    },
  });

  const err = saveContact.error ?? savePrefs.error ?? changeEmail.error;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setMsg(null);
    setForm({ ...form, [k]: e.target.value });
  };

  if (me.isLoading)
    return (
      <Panel>
        <ListSkeleton />
      </Panel>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mon profil"
        description="La clinique utilise ces coordonnées pour vous joindre."
      />
      {err && (
        <Alert variant="destructive">
          <AlertDescription>{friendlyError(err, err.message)}</AlertDescription>
        </Alert>
      )}
      {msg && (
        <Alert>
          <AlertDescription>{msg}</AlertDescription>
        </Alert>
      )}

      <Panel title="Coordonnées">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            saveContact.mutate();
          }}
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor="fn">Prénom</Label>
            <Input id="fn" value={form.first_name} onChange={set("first_name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ln">Nom</Label>
            <Input id="ln" value={form.last_name} onChange={set("last_name")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ph">Téléphone</Label>
            <Input
              id="ph"
              value={form.phone}
              onChange={set("phone")}
              placeholder="+216 20 123 456"
              autoComplete="tel"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dob">Date de naissance</Label>
            <Input
              id="dob"
              type="date"
              value={form.date_of_birth}
              onChange={set("date_of_birth")}
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={saveContact.isPending}>
              {saveContact.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Adresse e-mail">
        <p className="text-sm text-muted-foreground">
          Adresse actuelle : <span className="font-medium text-foreground">{me.data?.email}</span>
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setMsg(null);
            changeEmail.mutate();
          }}
          noValidate
        >
          <div className="flex-1 space-y-2">
            <Label htmlFor="em">Nouvelle adresse</Label>
            <Input
              id="em"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoComplete="email"
            />
          </div>
          <Button type="submit" variant="outline" disabled={changeEmail.isPending || !newEmail}>
            {changeEmail.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Changer
            l'adresse
          </Button>
        </form>
      </Panel>

      <Panel title="Préférences de notification">
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium">Par e-mail</span>
              <span className="text-sm text-muted-foreground">
                Confirmations et rappels de rendez-vous.
              </span>
            </span>
            <Switch
              checked={me.data?.notify_email ?? true}
              disabled={savePrefs.isPending}
              onCheckedChange={(v) => savePrefs.mutate({ notify_email: v })}
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-sm font-medium">Par SMS</span>
              <span className="text-sm text-muted-foreground">
                Rappel la veille du rendez-vous, sur le numéro ci-dessus.
              </span>
            </span>
            <Switch
              checked={me.data?.notify_sms ?? false}
              disabled={savePrefs.isPending}
              onCheckedChange={(v) => savePrefs.mutate({ notify_sms: v })}
            />
          </label>
        </div>
      </Panel>

      <Panel title="Protection de vos données">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          {me.data?.consent_at
            ? `Consentement au traitement de vos données de santé donné le ${fmtDate(me.data.consent_at)} (politique ${me.data.consent_version || "initiale"}).`
            : "Aucun consentement enregistré pour ce compte."}
        </p>
      </Panel>
    </div>
  );
}
