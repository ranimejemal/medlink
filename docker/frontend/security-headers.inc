# US-44 / US-61 security headers (same values as vite.config.ts and deploy/Caddyfile).
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Content-Security-Policy "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
