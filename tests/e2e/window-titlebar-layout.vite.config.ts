import { mergeConfig } from "vite";
import base from "./vite.config";

export default mergeConfig(base, {
  cacheDir: ".artifacts/window-titlebar-layout-vite",
  optimizeDeps: { noDiscovery: true, include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "linebreak"] },
  server: { hmr: false },
});
