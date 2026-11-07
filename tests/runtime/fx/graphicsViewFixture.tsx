import React, { type PropsWithChildren } from "react";
import { render, type RenderOptions } from "@testing-library/react";
import type { GFXDisplayList } from "../../../src/FX/GraphicsFX/graphicsTypes";
import { createOwnedGFXIdentifierIssuer } from "../../../src/FX/GraphicsFX/identifierAuthority";
import type { NSEViewProps } from "../../../src/NSE/Views/NSEView";
import { NSEViewDrawingEnvironmentContext } from "../../../src/NSE/Views/NSEViewDrawingEnvironment";

let sequence = 0;
const environment = {
  createGraphicsIdentifierIssuer: () => createOwnedGFXIdentifierIssuer(() => () => `figure${++sequence}`),
  geometry: { measure: () => ({ width: 200, height: 100 }), observe: () => () => {} },
};
function DrawingEnvironment({ children }: PropsWithChildren) {
  return <NSEViewDrawingEnvironmentContext.Provider value={environment}>{children}</NSEViewDrawingEnvironmentContext.Provider>;
}

/** Exercise cached figure replay through NSEView.draw, at the figure's original size. */
export function drawFigure(list: GFXDisplayList): NonNullable<NSEViewProps["draw"]> {
  return (_rect, context) => context.drawDisplayList(list, { x: 0, y: 0, ...list.size });
}

export function renderGraphics(element: React.ReactNode, options?: RenderOptions) {
  return render(element, { wrapper: DrawingEnvironment, ...options });
}
