import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, Lock, Activity } from "lucide-react";
import { Logo } from "./Logo";

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col lg:justify-between">
        <Link to="/">
          <Logo inverted />
        </Link>
        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight text-sidebar-accent-foreground">
            Vos données médicales, protégées à chaque étape.
          </h2>
          <ul className="mt-8 space-y-4 text-sm">
            <li className="flex gap-3">
              <Lock className="h-5 w-5 shrink-0 text-sidebar-primary" /> Connexion chiffrée et
              sessions limitées dans le temps
            </li>
            <li className="flex gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-sidebar-primary" /> Double
              authentification pour les praticiens et administrateurs
            </li>
            <li className="flex gap-3">
              <Activity className="h-5 w-5 shrink-0 text-sidebar-primary" /> Chaque accès aux
              dossiers est journalisé
            </li>
          </ul>
        </div>
        <p className="text-xs text-sidebar-foreground/60">Réseau MedLink · Sousse · Sfax · Tunis</p>
      </div>
      <div className="flex flex-col justify-center px-5 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <Link to="/" className="mb-8 inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
