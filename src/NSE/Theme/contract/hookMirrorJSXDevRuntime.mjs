/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
/** The development twin of hookMirrorJSXRuntime.mjs, for `react/jsx-dev-runtime`. */
import * as runtime from "react/jsx-dev-runtime";
import { mirrorProps } from "./hookMirror.mjs";

const react = runtime.jsxDEV ? runtime : runtime.default;

export const Fragment = react.Fragment;
export function jsxDEV(type, props, key, isStaticChildren, source, self) {
  return react.jsxDEV(type, typeof type === "string" ? mirrorProps(props) : props, key, isStaticChildren, source, self);
}
