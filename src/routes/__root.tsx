import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { ErrorScreen } from "@/components/medlink/ErrorScreen";

import appCss from "../styles.css?url";

import { logSecurityEvent } from "@/lib/auth.functions";
import { clearActivity, idleExpired, markActivity } from "@/lib/session";

function NotFoundComponent() {
  return (
    <ErrorScreen
      code="404"
      title="Page introuvable"
      message="La page demandée n'existe pas ou a été déplacée."
    />
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <ErrorScreen
      code="500"
      title="Erreur du serveur"
      message="Un problème est survenu de notre côté. Veuillez réessayer."
      onRetry={() => {
        router.invalidate();
        reset();
      }}
    />
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MedLink — Portail médical sécurisé" },
      {
        name: "description",
        content: "Portail médical sécurisé du réseau de cliniques MedLink (Sousse, Sfax, Tunis).",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (
        event !== "SIGNED_IN" &&
        event !== "SIGNED_OUT" &&
        event !== "USER_UPDATED" &&
        event !== "MFA_CHALLENGE_VERIFIED"
      )
        return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  // Inactivity timeout (US-40): sign out after 15 minutes without interaction, in any tab.
  useEffect(() => {
    let lastWrite = 0;
    const onActivity = () => {
      if (Date.now() - lastWrite < 5_000) return;
      lastWrite = Date.now();
      markActivity();
    };
    const check = async () => {
      if (!idleExpired()) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      try {
        await logSecurityEvent({ data: { action: "auth.session_expired" } });
      } catch {
        /* best effort */
      }
      clearActivity();
      queryClient.clear();
      await supabase.auth.signOut();
      router.navigate({ to: "/session-expired", replace: true });
    };
    void check(); // the session may have gone idle while the tab was closed
    const interval = setInterval(check, 30_000);
    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      clearInterval(interval);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  );
}
