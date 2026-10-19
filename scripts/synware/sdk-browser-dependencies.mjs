/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export function sdkBrowserDependencies() {
  return {
    // TextFX imports native HarfBuzz in Node through a computed specifier, so
    // bundles contain only the browser wrapper. Keep its WASM URL import
    // external so the consumer emits its own asset URL.
    external: [/^harfbuzzjs\//u, "oauth4webapi", "woff2-encoder/decompress", "react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
  };
}
