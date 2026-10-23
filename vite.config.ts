import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig(({ command, mode }) => {
  // Make server-side code (server functions) see the same .env values in dev.
  const env = loadEnv(mode, process.cwd(), "");
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;

  return {
    server: { host: "::", port: 8080 },
    resolve: {
      alias: { "@": path.resolve(process.cwd(), "src") },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        // Use src/server.ts (our SSR error wrapper) as the server entry.
        server: { entry: "server" },
        importProtection: { behavior: "error", client: { files: ["**/server/**"], specifiers: ["server-only"] } },
      }),
      // Production server bundle: a standalone Node server, suited to a VPS (US-57).
      ...(command === "build" ? [nitro({ preset: "node-server" })] : []),
      viteReact(),
    ],
  };
});
