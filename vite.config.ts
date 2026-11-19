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
};

export default defineConfig(({ command, mode }) => {
  // Make server-side code (server functions) see the same .env values in dev.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

  return {
    server: { host: "::", port: 8080 },
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
        importProtection: {
          behavior: "error",
          client: { files: ["**/server/**"], specifiers: ["server-only"] },
        },
      }),
      // Production server bundle (US-57): a standalone Node server for Docker / a VPS, or the
      // Vercel format when the build runs on Vercel (Vercel sets VERCEL=1 during its builds).
      ...(command === "build"
        ? [
            nitro({
              preset:
                process.env["NITRO_PRESET"] ?? (process.env["VERCEL"] ? "vercel" : "node-server"),
              // US-44 security headers, also sent where Caddy is not in front (e.g. Vercel).
              routeRules: { "/**": { headers: SECURITY_HEADERS } },
            }),
          ]
        : []),
      viteReact(),
    ],
  };
});
