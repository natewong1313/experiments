import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const DEV_SERVER_PORT = 3000;

const viteConfig = defineConfig({
  server: {
    port: DEV_SERVER_PORT,
    allowedHosts: true,
  },
  resolve: {
    dedupe: ["agents"],
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    cloudflare({ persistState: false, viteEnvironment: { name: "ssr" } }),
    tanstackStart({ srcDirectory: "src/web" }),
    // The React plugin must come after the TanStack Start plugin.
    viteReact(),
  ],
});

export default viteConfig;
