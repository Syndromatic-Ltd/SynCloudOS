import { freezeNSETheme } from "../../src/NSE/Theme/NSETheme";
import { atmoTheme } from "../../src/NSE/Themes/Atmo/appearance";
/** Complete static data for selection tests; no recipe or factory compatibility API. */
export function createTestTheme(bundleIdentifier: string, displayName: string) {
  return freezeNSETheme({ ...atmoTheme, bundleIdentifier, displayName });
}
