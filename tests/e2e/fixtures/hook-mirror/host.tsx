import { createRoot } from "react-dom/client";
import { useLayoutEffect, useRef } from "react";
import { NSEAppearanceProvider } from "../../../../src/NSE/Appearance/NSEAppearanceProvider";
import { atmoTheme } from "../../../../src/NSE/Appearance/atmo";
import { NSEButton } from "../../../../src/NSE/Controls/Buttons/NSEButton";
import { NSEStandaloneControlHost } from "../../../../src/NSE/Overlays";
import { createStaticPresentationPort } from "../../../fixtures/presentationTraits";
import { setNSEHook } from "../../../../src/NSE/Theme/contract/hookMirrorDOM";
import "../../../../src/NSE/public/styles.css";

// The spec builds elements by hand and needs the helper the framework itself uses.
Object.assign(window, { setNSEHook });

/** Copies the rendered button without its mirror classes, as a non-React renderer would write it. */
function HandBuilt() {
  const slot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const copy = document.getElementById("rendered")!.cloneNode(true) as HTMLElement;
    copy.id = "hand-built";
    for (const node of [copy, ...copy.querySelectorAll("*")]) node.classList.remove(...[...node.classList].filter(token => token.startsWith("nse:")));
    slot.current!.append(copy);
  }, []);
  return <div ref={slot} />;
}

const presentation = createStaticPresentationPort({ width: 1000, height: 800, reducedMotion: true });
createRoot(document.getElementById("root")!).render(
  <NSEStandaloneControlHost document={document} window={window} presentation={presentation}>
    <NSEAppearanceProvider theme={atmoTheme} colourScheme="light">
      <NSEButton id="rendered">Save</NSEButton>
      <HandBuilt />
    </NSEAppearanceProvider>
  </NSEStandaloneControlHost>,
);
