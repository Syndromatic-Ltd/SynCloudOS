import type { NSEPeerNavigationPresentation } from "../Appearance/NSEThemeDefinition";
export type { NSEPeerNavigationPresentation } from "../Appearance/NSEThemeDefinition";

/** Framework-supported arrangements. Theme identities never select behaviour. */
export const neutralPeerNavigation: NSEPeerNavigationPresentation = Object.freeze({
  kind: "tab-strip", placement: "block-start", flow: "in-flow", content: "label",
  overflow: Object.freeze({ kind: "scroll" }),
});
/** An explicit application request outranks theme defaults. */
export const bottomPeerNavigation: NSEPeerNavigationPresentation = Object.freeze({
  kind: "tab-strip", placement: "block-end", flow: "overlay", content: "icon-and-label",
  overflow: Object.freeze({ kind: "more", maximumVisibleItems: 5 }),
});
