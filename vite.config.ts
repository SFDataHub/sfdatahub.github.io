// vite.config.ts
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Modi:
 *  - vite build --mode test  -> base "/test/"
 *  - vite build --mode beta  -> base "/beta/"
 *  - vite build --mode main  -> base "/"
 * Optional per .env.<mode>: VITE_BASE=/irgendwas/ (hat Vorrang)
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const baseByMode: Record<string, string> = {
    test: "/test/",
    beta: "/beta/",
    main: "/",
    development: "/",
    production: "/"
  };
  const base = env.VITE_BASE || baseByMode[mode] || "/";

  return {
    plugins: [react()],
    base,
    publicDir: "public",
    server: {
      port: 5173,
      open: false,
      strictPort: false
    },
    preview: {
      port: 4173,
      open: false
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
      sourcemap: false,
      target: "es2018"
    }
  };
});
