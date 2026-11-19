import { useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { LogoMark } from "@/components/medlink/LogoMark";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MedLink — Portail médical sécurisé" },
      {
        name: "description",
        content:
          "Prenez rendez-vous en ligne dans les cliniques MedLink de Sousse, Sfax et Tunis, recevez vos rappels et consultez vos résultats en toute sécurité.",
      },
      { property: "og:title", content: "MedLink — Portail médical sécurisé" },
      {
        property: "og:description",
        content: "Accès sécurisé aux cliniques MedLink de Sousse, Sfax et Tunis.",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300&family=Inter:wght@300;400;500;600&display=swap",
      },
    ],
  }),
  component: HomePage,
});

const VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260618_174853_aac61aa2-0f3f-4cf1-bc78-7f657dd11164.mp4";

const display = { fontFamily: '"Fraunces", Georgia, serif', fontWeight: 300 } as const;
const body = { fontFamily: '"Inter", "Manrope", system-ui, sans-serif' } as const;

const FEATURES = ["Rendez-vous en ligne", "Rappels automatiques", "Données médicales chiffrées"];
const glass = "bg-black/30 backdrop-blur-md border border-white/10";

function FeaturePill({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span className={`${glass} rounded-full text-white ${className}`} style={body}>
      {label}
    </span>
  );
}

// Public home page: full-screen looping video, MedLink content in glass pills on top.
function HomePage() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [email, setEmail] = useState("");

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim().slice(0, 255);
    void navigate({ to: "/register", search: value ? { email: value } : {} });
  };

  return (
    <section
      className="relative h-dvh min-h-[560px] w-full overflow-hidden bg-[#0b1f3a]"
      style={body}
    >
      <video
        className="absolute inset-0 h-full w-full object-cover object-[80%_center] md:object-right lg:object-center"
        src={VIDEO_URL}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        aria-hidden
      />

      <div className="absolute inset-0 z-10 flex flex-col px-4 py-4 sm:px-10 sm:py-8 lg:px-12">
        <nav className="flex items-center justify-between" aria-label="Navigation principale">
          <div
            className={`flex items-center rounded-2xl border border-white/10 bg-black/20 px-4 py-2.5 backdrop-blur-md sm:px-6 sm:py-4`}
          >
            <Link to="/" className="flex items-center gap-2 text-white">
              <LogoMark className="h-6 w-6 sm:h-8 sm:w-8" />
              <span className="text-base tracking-wide sm:text-xl" style={display}>
                MedLink
              </span>
            </Link>
            <button
              type="button"
              className="ml-4 text-white sm:ml-32 md:ml-64 lg:ml-96"
              aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
          <Link
            to="/login"
            className="hidden rounded-full bg-white px-6 py-3 text-sm font-medium text-gray-900 transition hover:bg-white/90 sm:block"
          >
            Se connecter
          </Link>
        </nav>

        {menuOpen && (
          <div className="absolute left-4 right-4 top-[4.5rem] z-20 rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl sm:left-10 sm:right-auto sm:top-28 sm:w-80 lg:left-12">
            <ul className="space-y-3 text-white">
              <li>
                <Link to="/login" onClick={() => setMenuOpen(false)}>
                  Espace patient
                </Link>
              </li>
              <li>
                <Link to="/login" onClick={() => setMenuOpen(false)}>
                  Espace professionnel
                </Link>
              </li>
              <li>
                <Link to="/forgot-password" onClick={() => setMenuOpen(false)}>
                  Mot de passe oublié
                </Link>
              </li>
            </ul>
            <Link
              to="/register"
              className="mt-5 block w-full rounded-full bg-white py-3 text-center text-sm font-medium text-gray-900"
              onClick={() => setMenuOpen(false)}
            >
              Créer mon compte
            </Link>
          </div>
        )}

        <div className="flex-1 sm:hidden" />

        <div className="flex flex-col pb-4 sm:mt-auto sm:flex-1 sm:flex-row sm:items-end sm:pb-12 lg:pb-16">
          <div className="flex flex-col gap-4 sm:gap-6">
            <h1
              className="max-w-[700px] text-[2rem] leading-[1.05] tracking-tight text-white sm:text-[3.5rem] md:text-[4.5rem] lg:text-[5.5rem]"
              style={display}
            >
              Vos soins, toujours à portée de main.
            </h1>
            <p className="max-w-[520px] text-xs leading-relaxed text-white/70 sm:text-base md:text-lg">
              MedLink réunit les cliniques de Sousse, Sfax et Tunis : prenez rendez-vous en ligne,
              recevez vos rappels et retrouvez vos résultats, en toute sécurité.
            </p>
            <form onSubmit={onSubmit} className={`relative max-w-[460px] rounded-full ${glass}`}>
              <label htmlFor="hero-email" className="sr-only">
                Votre adresse e-mail
              </label>
              <input
                id="hero-email"
                type="email"
                autoComplete="email"
                maxLength={255}
                placeholder="Votre adresse e-mail"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-full bg-transparent py-3 pl-4 pr-36 text-sm text-white outline-none placeholder:text-white/60 sm:py-4 sm:pl-6 sm:pr-44"
              />
              <button
                type="submit"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-white px-3 py-2 text-xs font-medium text-gray-900 transition hover:bg-white/90 sm:px-6 sm:py-3 sm:text-sm"
              >
                Créer mon compte
              </button>
            </form>
            <div className="mt-2 flex flex-wrap gap-2 sm:hidden">
              {FEATURES.map((f) => (
                <FeaturePill key={f} label={f} className="px-3 py-1.5 text-xs" />
              ))}
            </div>
          </div>
          <div className="ml-auto hidden flex-col items-end gap-2 self-end sm:flex">
            {FEATURES.map((f) => (
              <FeaturePill key={f} label={f} className="px-4 py-2 text-xs sm:text-sm" />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
