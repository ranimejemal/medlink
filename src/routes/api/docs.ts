import { createFileRoute } from "@tanstack/react-router";

// Swagger UI for the MedLink API. The specification is the static file /openapi.yaml.
// Swagger UI itself is served by our own server (/api/docs-assets/...), not by a CDN:
// no third-party script runs on the site (OWASP A08, software supply chain).
const PAGE = `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>MedLink — Documentation de l'API</title>
  <link rel="icon" href="/favicon.svg" />
  <link rel="stylesheet" href="/api/docs-assets/swagger-ui.css" />
  <style>body{margin:0;background:#fff}.topbar{display:none}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="/api/docs-assets/swagger-ui-bundle.js"></script>
  <script src="/api/docs-assets/init.js"></script>
</body>
</html>`;

export const Route = createFileRoute("/api/docs")({
  server: {
    handlers: {
      GET: () =>
        new Response(PAGE, {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" },
        }),
    },
  },
});
