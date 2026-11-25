import { createFileRoute } from "@tanstack/react-router";

// Files of the Swagger UI page (/api/docs), bundled from the swagger-ui-dist package.
const INIT = `window.ui = SwaggerUIBundle({
  url: "/openapi.yaml",
  dom_id: "#swagger-ui",
  deepLinking: true,
  supportedSubmitMethods: ["get"],
});`;

async function load(file: string): Promise<{ body: string; type: string } | null> {
  switch (file) {
    case "swagger-ui.css":
      return {
        body: (await import("swagger-ui-dist/swagger-ui.css?raw")).default,
        type: "text/css; charset=utf-8",
      };
    case "swagger-ui-bundle.js":
      return {
        body: (await import("swagger-ui-dist/swagger-ui-bundle.js?raw")).default,
        type: "text/javascript; charset=utf-8",
      };
    case "init.js":
      return { body: INIT, type: "text/javascript; charset=utf-8" };
    default:
      return null;
  }
}

export const Route = createFileRoute("/api/docs-assets/$file")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const asset = await load(params.file);
        if (!asset) return new Response("Not found", { status: 404 });
        return new Response(asset.body, {
          headers: { "Content-Type": asset.type, "Cache-Control": "public, max-age=86400" },
        });
      },
    },
  },
});
