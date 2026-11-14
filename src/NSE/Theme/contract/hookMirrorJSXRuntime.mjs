/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
/**
 * React's JSX runtime with mirror classes: a host element that publishes a contract hook gets the
 * hook's class tokens in the same commit. The SynWare Vite plugin resolves `react/jsx-runtime` here.
 */
import * as runtime from "react/jsx-runtime";
import { mirrorProps } from "./hookMirror.mjs";

// React's runtime is CommonJS; a bundler may hand it over whole or as a default export.
const react = runtime.jsx ? runtime : runtime.default;

export const Fragment = react.Fragment;
export function jsx(type, props, key) {
  return react.jsx(type, typeof type === "string" ? mirrorProps(props) : props, key);
}
export function jsxs(type, props, key) {
  return react.jsxs(type, typeof type === "string" ? mirrorProps(props) : props, key);
}
