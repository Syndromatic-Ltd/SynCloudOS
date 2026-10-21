// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ options: null as any }));
vi.mock("@floating-ui/dom", () => ({
  offset: (options: unknown) => ({ name: "offset", options }),
  flip: (options: unknown) => ({ name: "flip", options }),
  shift: (options: unknown) => ({ name: "shift", options }),
  size: (options: unknown) => ({ name: "size", options }),
  arrow: (options: unknown) => ({ name: "arrow", options }),
  autoUpdate: (_anchor: unknown, _floating: unknown, update: () => void) => { update(); return () => undefined; },
  computePosition: async (_anchor: unknown, _floating: unknown, options: unknown) => { mocks.options=options; return {x:0,y:0,placement:"top-start",middlewareData:{}}; },
}));
import { computeNSEOverlayPosition } from "../../src/NSE/Overlays/computeNSEOverlayPosition";
afterEach(() => { document.body.innerHTML=""; mocks.options=null; });
it("uses identical safe-area/keyboard collision padding for flipping, shifting and sizing", async () => {
 const anchor=document.createElement("button"), floating=document.createElement("div");
 document.body.append(anchor,floating);
 const padding={top:8,right:8,bottom:150,left:8};
 const dispose=computeNSEOverlayPosition({anchor,floating,collisionPadding:padding});
 await Promise.resolve();
 for(const name of ["flip","shift","size"]) expect(mocks.options.middleware.find((m:any)=>m.name===name).options.padding).toEqual(padding);
 mocks.options.middleware.find((m:any)=>m.name==="size").options.apply({availableWidth:-2,availableHeight:-72,elements:{floating}});
 expect(floating.style.getPropertyValue("--nse-overlay-available-block-size")).toBe("0px");
 expect(floating.style.getPropertyValue("--nse-overlay-available-inline-size")).toBe("0px");
 dispose();
});
