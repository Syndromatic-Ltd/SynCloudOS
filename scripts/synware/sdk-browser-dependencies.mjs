/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { resolve } from "node:path";
export function sdkBrowserDependencies(repositoryRoot) {
  return {
    // SDK runtime entries target browsers. Resolve the otherwise retained native
    // fallback to the same maintained browser wrapper as TextFX's browser path.
    // Keep the WASM URL import external so the consumer emits its own asset URL.
    aliases: [{ find: /^harfbuzzjs$/u, replacement: resolve(repositoryRoot, "src/FX/TextFX/vendor/harfbuzzRuntime.mjs") }],
    external: [/^harfbuzzjs\//u, "oauth4webapi", "woff2-encoder/decompress", "react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
  };
}
