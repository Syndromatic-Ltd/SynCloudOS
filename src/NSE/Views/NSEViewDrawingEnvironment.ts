import { createContext } from "react";
import type { GFXIdentifierIssuer } from "../../FX/GraphicsFX/identifierAuthority";
import type { IFXImageGeometryPort } from "../../FX/ImageFX/IFXImageViewport";

/** Private host-to-view drawing authority. Never exported from an SDK entry. */
export interface NSEViewDrawingEnvironment {
  createGraphicsIdentifierIssuer(): GFXIdentifierIssuer;
  readonly geometry: IFXImageGeometryPort | null | undefined;
}

export const NSEViewDrawingEnvironmentContext = createContext<NSEViewDrawingEnvironment | null>(null);
