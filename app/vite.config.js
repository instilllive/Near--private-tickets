import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: { global: "globalThis" },
  resolve: { alias: { buffer: "buffer" } },
  optimizeDeps: {
    include: [
      "@near-wallet-selector/core",
      "@near-wallet-selector/modal-ui",
      "@near-wallet-selector/my-near-wallet",
      "@near-wallet-selector/meteor-wallet",
    ],
  },
  server: { port: 5174 },
});
