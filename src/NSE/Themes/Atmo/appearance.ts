/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { freezeNSETheme } from "../../Theme/NSETheme";
import colours from "./colours.json";
export const atmoTheme = freezeNSETheme({
  bundleIdentifier: "com.syndromatic.atmo", displayName: "Atmo", version: "1.0.0",
  colours,
  navigation: { compact: { placement: "block-end", flow: "overlay" }, regular: { placement: "source-list", flow: "in-flow" } },
  presentation: { login: "ornamented", notifications: "sliced-3d", materialLighting: "on" },
  images: {},
});
