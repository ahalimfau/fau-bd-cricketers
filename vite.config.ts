/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /<repo-name>/
const base = '/fau-bd-cricketers/';

// Content Security Policy for the published site. GitHub Pages can't send
// custom HTTP headers, so it goes in a <meta> tag. It only allows:
//  - scripts, styles, fonts, the manifest and the service worker from this site
//  - images from this site and data:/blob: URLs (player photos, share images)
//  - network calls to the three Google endpoints Firestore and Auth use
// Everything else (third-party scripts, iframes, plugins, form posts to other
// sites, pointing <base> at another site) is blocked. Added at build time only, because the
// dev server needs inline scripts for hot reload.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  // 'self' (not 'none'): the share-as-picture feature resolves the app's own
  // font files against a same-site <base>. Other sites still can't be used.
  "base-uri 'self'",
  "form-action 'none'",
  'upgrade-insecure-requests',
].join('; ');

function securityHeaders(): Plugin {
  return {
    name: 'fau-security-meta',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
      );
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    securityHeaders(),
    VitePWA({
      registerType: 'autoUpdate',
      // Register the service worker from a separate file, not an inline script,
      // so the CSP can forbid inline scripts entirely.
      injectRegister: 'script',
      manifest: {
        name: 'FAU BD Cricketers',
        short_name: 'FAU BD Cricket',
        description: 'Live cricket scoring and the Hall of Shame for FAU BD Cricketers.',
        theme_color: '#0E7A3E',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
  build: {
    // No source maps in production: keeps the published bundle lean.
    sourcemap: false,
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
