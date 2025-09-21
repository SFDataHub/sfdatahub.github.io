// vite.config.ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Eine Config für alle Ziele:
 * - Build für TEST:  vite build --mode test  -> base "/test/"
 * - Build für BETA:  vite build --mode beta  -> base "/beta/"
 * - Build für MAIN:  vite build --mode main  -> base "/"
 *
 * Optional kannst du eine .env.<mode> mit VITE_BASE setzen.
 * Hat Vorrang vor dem internen Mapping unten.
 *   z.B. .env.test  -> VITE_BASE=/test/
 *        .env.beta  -> VITE_BASE=/beta/
 *        .env.main  -> VITE_BASE=/
 */
export default defineConfig(({ mode }) => {
  // .env-Variablen laden (z. B. VITE_BASE aus .env.test/.env.beta/.env.main)
  const env = loadEnv(mode, process.cwd(), "");

  // Fallback-Mapping, falls keine VITE_BASE gesetzt ist:
  const baseByMode: Record<string, string> = {
    test: "/test/",
    beta: "/beta/",
    main: "/",
    development: "/", // npm run dev
    production: "/",  // Standard
  };

  const base = env.VITE_BASE || baseByMode[mode] || "/";

  return {
    plugins: [react()],
    base,
    publicDir: "public",
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      open: false,
    },
    preview: {
      port: 4173,
    },
  };
});
