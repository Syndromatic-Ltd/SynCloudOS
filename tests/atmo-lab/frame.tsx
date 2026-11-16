/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import { createRoot } from "react-dom/client";
import { NSEAppearanceProvider } from "../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../src/NSE/Appearance/atmo";
import * as metalThumb from "../../src/NSE/Appearance/MetalThumb";
import { staticNSEMaterialLight, type MaterialLight, type MaterialLightingPort } from "../../src/NSE/Appearance/NSEMaterialLighting";
import { MetalSurface } from "../../src/NSE/Material/MetalSurface";
import { StandaloneControlHost } from "../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../fixtures/presentationTraits";
import { catalogueIds, catalogueSurface, renderSection } from "./specimens";
import "../../src/NSE/public/styles.css";
import "../../src/SynCloudOS/styles/runtime.css";
import "./frame.css";

// One side of the lab. The shell drives it through the URL and postMessage.
const parameters = new URLSearchParams(location.search);
const scheme = parameters.get("scheme") === "dark" ? "dark" : "light";
const backdrop = parameters.get("backdrop") === "window" ? "window" : "metal";
const section = parameters.get("section") ?? "switches";
document.documentElement.dataset.appearance = scheme;
document.documentElement.style.colorScheme = scheme;

// The shell turns the knob, so both sides show the same angle at once.
let light: MaterialLight = { ...staticNSEMaterialLight, angle: Number(parameters.get("angle") ?? 0), active: true };
const lightListeners = new Set<() => void>();
// The frozen baseline predates the prefix drop, so take whichever name its source exports.
const MaterialLightingProvider = (metalThumb as Record<string, unknown>).MaterialLightingProvider as typeof metalThumb.MaterialLightingProvider
  ?? (metalThumb as Record<string, unknown>).NSEMaterialLightingProvider as typeof metalThumb.MaterialLightingProvider;
const lighting: MaterialLightingPort = {
  getSnapshot: () => light,
  subscribe: listener => { lightListeners.add(listener); return () => lightListeners.delete(listener); },
};
addEventListener("message", event => {
  if (event.source !== parent || event.data?.type !== "atmo-lab:angle") return;
  light = { ...light, angle: Number(event.data.angle) };
  lightListeners.forEach(listener => listener());
});

const presentation = createStaticPresentationPort({ width: innerWidth, height: innerHeight, reducedMotion: false, primaryPointer: "fine", hover: true });
const content = <main className="lab-frame" data-section={section} data-embed={parameters.get("embed") === "1" || undefined}>{renderSection(section)}</main>;

createRoot(document.getElementById("root")!).render(
  <NSEAppearanceProvider theme={atmoTheme} colourScheme={scheme}>
    <MaterialLightingProvider value={lighting}>
      <StandaloneControlHost document={document} window={window} presentation={presentation}>
        {backdrop === "metal"
          ? <MetalSurface mode={scheme} className="lab-backdrop">{content}</MetalSurface>
          : <div className="lab-backdrop" data-backdrop="window">{content}</div>}
      </StandaloneControlHost>
    </MaterialLightingProvider>
  </NSEAppearanceProvider>,
);

// A catalogue surface is put in the state the baseline captures it in: its tab chosen, its menu or folder opened.
async function driveSurface() {
  const surface = section === "catalogue" ? catalogueSurface(parameters.get("surface")) : undefined;
  if (!surface) return;
  const appear = async (find: () => Element | null | undefined) => { for (let tries = 0; tries < 100; tries++) { const found = find(); if (found) return found; await new Promise(resolve => setTimeout(resolve, 100)); } return null; };
  if (surface.ready) await appear(() => document.querySelector(surface.ready!));
  if (surface.chooseTab) (await appear(() => [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find(tab => tab.textContent?.trim() === surface.chooseTab)) as HTMLElement | null)?.click();
  if (surface.interaction === "open") (await appear(() => document.querySelector('.lab-catalogue :is(button:not([disabled]), input:not([disabled]):not([type="hidden"]), [role="slider"][tabindex="0"])')) as HTMLElement | null)?.click();
  if (surface.interaction === "folder") (await appear(() => document.querySelector('[aria-label="Open folder Tools"]')) as HTMLElement | null)?.click();
}
void driveSurface();

parent.postMessage({ type: "atmo-lab:ready", side: parameters.get("side"), catalogue: section === "catalogue" ? catalogueIds() : undefined }, location.origin);
