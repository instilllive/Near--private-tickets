import { defineConfig, mergeConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import base from "./vite.config.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

export default mergeConfig(
  base,
  defineConfig({
    resolve: {
      alias: {
        [path.resolve(dir, "src/wallet.js")]: path.resolve(dir, "../demo/recording-wallet.js"),
      },
    },
    server: { host: true, port: 5174, strictPort: true },
  })
);
