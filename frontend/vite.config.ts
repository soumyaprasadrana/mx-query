import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // History API fallback is on by default so /wizard, /builder, /library
  // reload in dev. Production uses the same fallback in app.py _mount_frontend.
  server: {
    // Dev-time only: the built app is served by the backend itself
    // (app.py's _mount_frontend), so /api is same-origin in production.
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
  build: {
    outDir: "dist",
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
  },
});
