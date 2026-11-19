import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoMark } from "./LogoMark";

// Same calm footage as the home page, so the site reads as one product.
const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260618_174853_aac61aa2-0f3f-4cf1-bc78-7f657dd11164.mp4";

const PITCHES = [
  {
    lines: ["Vos rendez-vous.", "Vos résultats.", "Au même endroit."],
    sub: "Prenez rendez-vous dans les cliniques de Sousse, Sfax et Tunis, et retrouvez vos comptes rendus en toute sécurité.",
  },
  {
    lines: ["Vos données", "protégées à chaque", "étape."],
    sub: "Connexion chiffrée, double authentification pour les praticiens et accès aux dossiers journalisés.",
  },
  {
    lines: ["Un rappel", "avant chaque", "rendez-vous."],
    sub: "Confirmation par e-mail dès la réservation, puis un rappel automatique 24 h avant.",
  },
] as const;

// Staggered entrance (tw-animate-css); disabled for people who ask for reduced motion.
const rise =
  "animate-in fade-in slide-in-from-bottom-3 duration-700 fill-mode-backwards motion-reduce:animate-none";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return reduced;
}

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
  const reduced = usePrefersReducedMotion();
  const [videoReady, setVideoReady] = useState(false);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const t = window.setInterval(() => setSlide((s) => (s + 1) % PITCHES.length), 7000);
    return () => window.clearInterval(t);
  }, [reduced]);

  const pitch = PITCHES[slide] ?? PITCHES[0];

  return (
    <div className="relative min-h-dvh overflow-hidden bg-[#0b1f3a] lg:flex lg:h-dvh lg:min-h-[640px]">
      {/* Photo layer: video over a navy base, plus soft shades for readable white type. */}
      <div className="absolute inset-0 lg:fixed" aria-hidden>
        {!reduced && (
          <video
            className={cn(
              "absolute inset-0 h-full w-full object-cover object-[70%_center] transition-opacity duration-[800ms] lg:object-center",
              videoReady ? "opacity-100" : "opacity-0",
            )}
            src={VIDEO_URL}
            autoPlay
            loop
            muted
            playsInline
            preload="metadata"
            onLoadedData={() => setVideoReady(true)}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[rgba(5,12,28,0.45)] to-transparent" />
      </div>

      {/* Hero (left on desktop, top on phones) */}
      <section className="relative z-10 flex min-h-[46dvh] flex-col justify-between px-5 pb-8 pt-6 text-white sm:px-10 lg:min-h-0 lg:flex-1 lg:px-[clamp(40px,5.5vw,92px)] lg:pb-[clamp(40px,7vh,80px)] lg:pt-[clamp(28px,6vh,57px)]">
        <header className={cn("flex items-center justify-between gap-4", rise)}>
          <Link to="/" className="flex items-center gap-3" aria-label="MedLink — accueil">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-lg lg:h-12 lg:w-12">
              <LogoMark className="h-7 w-7 lg:h-8 lg:w-8" />
            </span>
            <span className="font-display text-2xl font-bold tracking-tight lg:text-[2.2rem]">
              MedLink
            </span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#67DBFF] hover:text-white lg:text-base"
          >
            <ArrowLeft className="h-4 w-4" /> Retour à l'accueil
          </Link>
        </header>

        <div className="mt-10 lg:mt-0">
          <h2
            key={slide}
            className="font-display text-[clamp(30px,8vw,40px)] font-semibold leading-[1.12] tracking-tight lg:text-[clamp(40px,3.7vw,62px)]"
          >
            {pitch.lines.map((line, i) => (
              <span key={line} className="block overflow-hidden pb-1">
                <span
                  className="block animate-in slide-in-from-bottom-full fade-in duration-700 fill-mode-backwards motion-reduce:animate-none"
                  style={{ animationDelay: `${150 + i * 110}ms` }}
                >
                  {line}
                </span>
              </span>
            ))}
          </h2>
          <p
            key={`sub-${slide}`}
            className={cn(
              "mt-4 hidden max-w-[560px] text-base leading-relaxed text-white/85 [@media(min-height:700px)]:block lg:block lg:text-lg",
              rise,
            )}
            style={{ animationDelay: "500ms" }}
          >
            {pitch.sub}
          </p>
          <div
            className={cn("mt-6 flex items-center gap-2.5", rise)}
            style={{ animationDelay: "600ms" }}
          >
            {PITCHES.map((p, i) => (
              <button
                key={p.lines[0]}
                type="button"
                aria-label={`Message ${i + 1}`}
                aria-current={i === slide}
                onClick={() => setSlide(i)}
                className={cn(
                  "h-2.5 rounded-full transition-all duration-300",
                  i === slide ? "w-9 bg-[#67DBFF]" : "w-2.5 bg-white/55 hover:bg-white/80",
                )}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Card (right on desktop, bottom on phones) */}
      <main
        className={cn(
          "relative z-10 rounded-t-3xl bg-[#FEFEFE] px-5 py-8 sm:px-10 lg:my-[18px] lg:mr-[18px] lg:mb-[22px] lg:w-[min(742px,46vw)] lg:shrink-0 lg:flex lg:flex-col lg:overflow-y-auto lg:rounded-[20px] lg:px-[clamp(32px,4.5vw,96px)] lg:py-10",
          "animate-in fade-in zoom-in-[0.99] slide-in-from-bottom-4 duration-700 fill-mode-backwards motion-reduce:animate-none",
        )}
        style={{ animationDelay: "120ms" }}
      >
        <div className="mx-auto w-full max-w-[559px] lg:my-auto">
          <h1
            className={cn(
              "font-display text-[clamp(28px,3vw,50px)] font-semibold leading-tight tracking-tight text-black",
              rise,
            )}
            style={{ animationDelay: "350ms" }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={cn("mt-2 text-base text-[#5F636B] lg:text-lg", rise)}
              style={{ animationDelay: "430ms" }}
            >
              {subtitle}
            </p>
          )}
          <div
            className={cn(
              "mt-8",
              // Form look from the design: tall inputs with a hairline border, pill submit button.
              "[&_input:not([type=checkbox])]:h-12 [&_input:not([type=checkbox])]:rounded-[10px] [&_input:not([type=checkbox])]:border-[#E2E4E7] [&_input:not([type=checkbox])]:bg-white lg:[&_input:not([type=checkbox])]:h-14",
              "[&_label]:font-medium [&_label]:text-black",
              "[&_button[type=submit]]:h-12 [&_button[type=submit]]:rounded-full [&_button[type=submit]]:bg-[#161515] [&_button[type=submit]]:text-[#67DBFF] [&_button[type=submit]]:transition-shadow [&_button[type=submit]:hover]:bg-black [&_button[type=submit]:hover]:shadow-lg lg:[&_button[type=submit]]:h-14",
              rise,
            )}
            style={{ animationDelay: "520ms" }}
          >
            {children}
          </div>
          {footer && (
            <div
              className={cn(
                "mt-6 text-center text-sm text-[#5F636B] [&_a]:font-semibold [&_a]:text-[#2723FF]",
                rise,
              )}
              style={{ animationDelay: "650ms" }}
            >
              {footer}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
