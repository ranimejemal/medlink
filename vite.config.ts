import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

const SECURITY_HEADERS = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  // US-61 (ZAP finding "CSP header not set"): forbids framing, plugins, <base> hijacking and
  // form posts to other sites. script-src is not restricted yet: the SSR pages use inline scripts.
  "Content-Security-Policy":
    "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export default defineConfig(({ command, mode }) => {
  // Make server-side code (server functions) see the same .env values in dev.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

  return {
    server: { host: "::", port: 8080 },
    // The SPA build pre-renders the page shell on a local preview server (IPv4: works in Docker).
    preview: { host: "127.0.0.1" },
    resolve: {
      alias: { "@": path.resolve(process.cwd(), "src") },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Use src/server.ts (our SSR error wrapper) as the server entry.
        server: { entry: "server" },
        // Kubernetes (MEDLINK_SPA=1): the pages are built as static files served by the frontend
        // image (nginx); the backend image only runs the server functions and /api.
        ...(process.env["MEDLINK_SPA"] === "1" ? { spa: { enabled: true } } : {}),
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
      // Production server bundle (US-57): a standalone Node server for Docker / a VPS, or the
      // Vercel format when the build runs on Vercel (Vercel sets VERCEL=1 during its builds).
      // Not in the SPA build: the frontend image is static files only (no Node server).
      ...(command === "build" && process.env["MEDLINK_SPA"] !== "1"
        ? [
            nitro({
              preset:
                process.env["NITRO_PRESET"] ?? (process.env["VERCEL"] ? "vercel" : "node-server"),
              // US-44 security headers, also sent where Caddy is not in front (e.g. Vercel).
              routeRules: {
                "/**": { headers: SECURITY_HEADERS },
                // US-61 (ZAP 10021): Vercel stops at the /assets route, so repeat the headers there.
                "/assets/**": { headers: SECURITY_HEADERS },
              },
            }),
          ]
        : []),
      viteReact(),
    ],
  };
});
