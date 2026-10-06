import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vite.dev/config/
// Port 5180 so this runs side by side with LedgerAlpha (5173) during rehearsals.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5180,
  },
  test: {
    // every test file generates the whole demo world: run the files one at a time so the timing guards measure the code, not machine load
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
