import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  CalendarPlus,
  FlaskConical,
  FileText,
  User,
  ShieldCheck,
  Users,
  ClipboardList,
  Bell,
  Building2,
  BarChart3,
  ScrollText,
  Stethoscope,
  LogOut,
  Menu,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";
import { logSecurityEvent } from "@/lib/auth.functions";
import type { AppRole } from "@/lib/access";

type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV: Record<AppRole, NavItem[]> = {
  patient: [
    { to: "/patient/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { to: "/patient/appointments/new", label: "Prendre rendez-vous", icon: CalendarPlus },
    { to: "/patient/appointments", label: "Mes rendez-vous", icon: CalendarDays },
    { to: "/patient/results", label: "Mes résultats", icon: FlaskConical },
    { to: "/patient/documents", label: "Mes documents", icon: FileText },
    { to: "/patient/profile", label: "Mon profil", icon: User },
    { to: "/patient/security", label: "Sécurité", icon: ShieldCheck },
  ],
  practitioner: [
    { to: "/practitioner/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { to: "/practitioner/agenda", label: "Agenda", icon: CalendarDays },
    { to: "/practitioner/patients", label: "Mes patients", icon: Users },
    { to: "/practitioner/reports", label: "Comptes rendus", icon: ClipboardList },
    { to: "/practitioner/notifications", label: "Notifications", icon: Bell },
    { to: "/practitioner/profile", label: "Profil & sécurité", icon: User },
  ],
  admin: [
    { to: "/admin/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { to: "/admin/users", label: "Utilisateurs", icon: Users },
    { to: "/admin/practitioners", label: "Praticiens", icon: Stethoscope },
    { to: "/admin/clinics", label: "Cliniques", icon: Building2 },
    { to: "/admin/statistics", label: "Statistiques", icon: BarChart3 },
    { to: "/admin/audit", label: "Journal d'audit", icon: ScrollText },
    { to: "/admin/security", label: "Sécurité", icon: ShieldCheck },
  ],
  staff: [
    { to: "/staff/dashboard", label: "Rendez-vous", icon: CalendarDays },
    { to: "/staff/users", label: "Comptes", icon: Users },
    { to: "/staff/security", label: "Sécurité", icon: ShieldCheck },
  ],
};

const ROLE_LABEL: Record<AppRole, string> = {
  patient: "Patient",
  practitioner: "Praticien",
  admin: "Administrateur",
  staff: "Personnel administratif",
};

function SidebarContent({
  role,
  onNavigate,
  name,
}: {
  role: AppRole;
  onNavigate?: () => void;
  name: string;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const logEvent = logSecurityEvent;
  const signOut = async () => {
    try {
      await logEvent({ data: { action: "auth.logout" } });
    } catch {
      /* best effort */
    }
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-5 py-6">
        <Logo inverted />
      </div>
      <nav className="flex-1 space-y-1 px-3" aria-label="Navigation principale">
        {NAV[role].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            activeOptions={{ exact: true }}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground" }}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <p className="truncate text-sm font-semibold text-sidebar-accent-foreground">{name}</p>
        <p className="text-xs text-sidebar-foreground/70">{ROLE_LABEL[role]}</p>
        <button
          onClick={signOut}
          className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" /> Se déconnecter
        </button>
      </div>
    </div>
  );
}

export function AppShell({ role, children }: { role: AppRole; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("profiles")
        .select("first_name,last_name,email")
        .eq("id", u.user!.id)
        .maybeSingle();
      return data;
    },
  });
  const { data: unread } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);
      return count ?? 0;
    },
    refetchInterval: 60_000,
  });
  const name = me ? `${me.first_name} ${me.last_name}`.trim() || me.email : "";
  const notifPath =
    role === "practitioner"
      ? "/practitioner/notifications"
      : role === "patient"
        ? "/patient/dashboard"
        : null;

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="sticky top-0 hidden h-screen lg:block">
        <SidebarContent role={role} name={name} />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-72 border-0 p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarContent role={role} name={name} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-card/90 px-4 backdrop-blur sm:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <Logo className="lg:hidden" subtitle={false} />
          </div>
          <div className="flex items-center gap-3">
            {notifPath && (
              <a
                href={notifPath}
                className="relative rounded-lg p-2 hover:bg-muted"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5 text-muted-foreground" />
                {!!unread && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                    {unread}
                  </span>
                )}
              </a>
            )}
            <div className="hidden items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground sm:flex">
              <ShieldCheck className="h-3.5 w-3.5 text-success" /> Session sécurisée
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
