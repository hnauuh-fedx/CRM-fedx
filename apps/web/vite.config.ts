import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { releaseVersionPlugin } from "./build/release-version";

export default defineConfig({
  plugins: [react(), tailwindcss(), releaseVersionPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
