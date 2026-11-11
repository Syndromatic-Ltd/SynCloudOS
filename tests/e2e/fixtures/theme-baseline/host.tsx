import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { NSEAppearanceProvider } from "../../../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../../../src/NSE/Appearance/atmo";
import { NSEStandaloneControlHost } from "../../../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../../../fixtures/presentationTraits";
import { themeBaselineCatalogue } from "./catalogue";
import "../../../../src/NSE/public/styles.css";
import "../../../../src/SynCloudOS/styles/runtime.css";
import "./host.css";

const parameters = new URLSearchParams(location.search);
const surface = parameters.has("surface") ? themeBaselineCatalogue.find(candidate => candidate.id === parameters.get("surface")) : themeBaselineCatalogue[0];
const scheme = parameters.get("scheme") === "dark" ? "dark" : "light";
document.documentElement.dataset.appearance = scheme;
document.documentElement.style.colorScheme = scheme;
document.documentElement.style.background = scheme === "dark" ? "#20252c" : "#e7ebef";
if (!surface) throw new Error(`Unknown theme baseline surface: ${parameters.get("surface")}`);
Object.assign(window, { themeBaselineCatalogue: themeBaselineCatalogue.map(({ render: _render, ...entry }) => entry) });
const presentation = createStaticPresentationPort({ width: innerWidth, height: innerHeight, reducedMotion: true });
const root = createRoot(document.getElementById("root")!);
function renderSurface(id: string) {
  const surface = themeBaselineCatalogue.find(candidate => candidate.id === id);
  if (!surface) throw new Error(`Unknown theme baseline surface: ${id}`);
  flushSync(() => root.render(
  <div key={id}>
  <NSEAppearanceProvider theme={atmoTheme} colourScheme={scheme}>
    <NSEStandaloneControlHost document={document} window={window} presentation={presentation}>
      <main id="theme-baseline-surface" data-baseline-surface={surface.id}>{surface.render()}</main>
    </NSEStandaloneControlHost>
  </NSEAppearanceProvider></div>,
  ));
}
Object.assign(window, { renderThemeBaselineSurface: renderSurface });
renderSurface(surface.id);
