import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { synCloudOS } from "@syndromatic/syncloudos/vite";
import { writeFileSync } from "node:fs";
import { createServer as createPortReservation } from "node:net";
const reservation = createPortReservation();
await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
if ([5173, 5210, 5387, 5199].includes(port)) throw new Error("Reserved a protected port");
const server = await createServer({
  root: process.cwd(), configFile: false, logLevel: "warn",
  plugins: [react(), synCloudOS({ webspringEntry: false })],
  server: { host: "127.0.0.1", port, strictPort: true },
  optimizeDeps: { entries: ["index.html"], include: ["react", "react-dom/client", "react/jsx-runtime"] },
});
await server.listen();
const address = server.httpServer.address();
writeFileSync("dev-server.json", JSON.stringify({ url: `http://127.0.0.1:${address.port}/`, cacheDir: server.config.cacheDir, exclude: server.config.optimizeDeps.exclude, noDiscovery: server.config.optimizeDeps.noDiscovery }));
process.on("message", async message => { if (message === "close") { await server.close(); process.exit(0); } });
