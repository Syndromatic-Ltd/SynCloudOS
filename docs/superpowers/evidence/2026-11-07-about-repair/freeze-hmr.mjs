// Freeze only this evidence page's loaded module graph. The shared Vite server
// and other agents' tabs continue receiving their normal development updates.
export async function freezeHMR(page) {
  await page.routeWebSocket(url => url.host === "127.0.0.1:5199", route => {
    const server = route.connectToServer();
    let connected = true;
    server.onClose(() => { connected = false; });
    route.onMessage(message => { if (connected) server.send(message); });
    server.onMessage(message => {
      let type;
      try { type = JSON.parse(String(message)).type; } catch {}
      if (type !== "update" && type !== "full-reload") route.send(message);
    });
  });
}
