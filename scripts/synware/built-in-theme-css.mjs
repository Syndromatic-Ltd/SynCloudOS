/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
/** Source builds compile the static built-in bundle into the fallback layer.
 * Published SDK styles already contain this wrapper and need no host plugin. */
export function builtInThemeCSS() {
  return {
    postcssPlugin: "syncloudos-built-in-theme",
    OnceExit(root) {
      const nodes = [...root.nodes];
      let scope = null;
      for (const node of nodes) {
        const file = node.source?.input.file?.replaceAll("\\", "/") ?? "";
        if (!file.includes("/Atmo.scostheme/Contents/Resources/")) { scope = null; continue; }
        if (!scope) {
          root.insertBefore(node, { name: "layer", params: "nse.atmo", nodes: [] });
          const layer = root.nodes[root.nodes.indexOf(node) - 1];
          layer.append({ name: "scope", params: "([data-nse-theme]) to ([data-nse-theme])", nodes: [] });
          scope = layer.last;
        }
        node.remove();
        scope.append(node);
      }
    },
  };
}
