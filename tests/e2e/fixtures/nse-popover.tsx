import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { NSEPopover } from "../../../src/NSE/Overlays/NSEPopover";
import { NSEOverlayProvider } from "../../../src/NSE/Overlays/NSEOverlayProvider";
import { NSEAppearanceProvider } from "../../../src/NSE/Appearance/NSEAppearanceProvider";
import { defineNSEAppearance } from "../../../src/NSE/Appearance/NSEAppearanceDefinition";
import { NSEAnimationEnvironmentProvider } from "../../../src/NSE/Animation/NSEAnimationEnvironment";
import { createStaticPresentationTraits } from "../../fixtures/presentationTraits";
import type { NSELogicalPlacement } from "../../../src/NSE/Overlays/overlayTypes";

const appearance = defineNSEAppearance({ id: "atmo", displayName: "Atmo" });
type Options = { open: boolean; mounted: boolean; dark: boolean; paper: boolean; reducedMotion: boolean; tall: boolean; placement: NSELogicalPlacement; x: number; y: number; region?: { x: number; y: number; width: number; height: number } };
const initial: Options = { open: true, mounted: true, dark: false, paper: false, reducedMotion: false, tall: false, placement: "block-end", x: 440, y: 160 };

function Fixture() {
  const [options, setOptions] = useState(initial);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  Object.assign(window, { popoverFixture: { set: (patch: Partial<Options>) => setOptions(current => ({ ...current, ...patch })) } });
  const runtimePort = useMemo(() => {
    const traits = createStaticPresentationTraits({ width: innerWidth, height: innerHeight });
    const snapshot = options.region ? { ...traits, viewportFeatures: { posture: "folded" as const, segments: [options.region, { ...options.region, x: options.region.x + options.region.width + 20 }] } } : traits;
    const workArea = { width: innerWidth, height: innerHeight, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } };
    return {
      runtimeId: "popover-browser", signal: new AbortController().signal,
      environment: {
        browser: { getDocument: () => document, getWindow: () => window },
        workArea: { getSnapshot: () => workArea, subscribe: () => () => undefined },
        visualViewport: { getSnapshot: () => null, subscribe: () => () => undefined },
        presentation: { getSnapshot: () => snapshot, subscribe: () => () => undefined },
        setTimeout: (callback: () => void, delay: number) => window.setTimeout(callback, delay), clearTimeout: (handle: unknown) => window.clearTimeout(handle as number),
      },
      restoreFocus: () => anchor?.focus(), reportPlacementFailure: () => { throw new Error("Popover placement failed"); },
      wrapFocusScope: (_options: unknown, node: React.ReactNode) => node,
    };
  }, [options.region]);
  return <NSEAppearanceProvider appearance={appearance} colourScheme={options.dark ? "dark" : "light"}>
    <NSEAnimationEnvironmentProvider reducedMotion={options.reducedMotion}><NSEOverlayProvider runtimePort={runtimePort}>
      <button ref={setAnchor} id="anchor" style={{ position: "fixed", left: options.x, top: options.y, width: 80, height: 32 }}>Options</button>
      {options.mounted ? <NSEPopover id="browser-popover" open={options.open} anchor={anchor} surface="overlay" parentWindowControllerId={null} parentResponderId="fixture" title="Publish options" drawsBackground={!options.paper}
        presentation={{ mode: "automatic", placement: options.placement }} onOpenChange={() => undefined}>
        <div className={options.paper ? "paper" : "aqua-content"} style={options.paper ? { "--nse-popover-content-fill": "#efe2c6" } as React.CSSProperties : undefined}>
          <h2>{options.paper ? "A collection of stories" : "Publish options"}</h2><p>{options.paper ? "A content-painted paper surface." : "Choose how this story is shared."}</p>
          {options.tall ? Array.from({ length: 50 }, (_, index) => <p key={index}>Setting {index + 1}</p>) : null}
          <label>Title <input aria-label="Title" defaultValue="A walk through Manchester" /></label><button className="done">Done</button>
        </div>
      </NSEPopover> : null}
    </NSEOverlayProvider></NSEAnimationEnvironmentProvider>
  </NSEAppearanceProvider>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
