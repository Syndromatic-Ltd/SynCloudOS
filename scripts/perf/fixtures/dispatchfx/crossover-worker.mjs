/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
self.onmessage = event => {
  const { mode, buffer, view } = event.data;
  if (mode === "clone") {
    self.postMessage({ bytes: buffer.byteLength, buffer });
  } else if (mode === "transfer") {
    self.postMessage({ bytes: buffer.byteLength, buffer }, [buffer]);
  } else if (mode === "sab") {
    const sabView = new Int32Array(view);
    Atomics.add(sabView, 0, 1);
    self.postMessage({ bytes: sabView.byteLength });
  }
};
