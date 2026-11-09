/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

/** AppKit control identities, with neutral names for SynCloudOS-only surfaces. */
export const nseThemeControls = Object.freeze([
  "button", "switch", "pop-up-button", "segmented-control", "slider", "stepper", "level-indicator",
  "progress-indicator", "text-field", "secure-text-field", "search-field", "combo-box", "token-field", "text-view",
  "box", "matrix", "image-view", "stack-view", "split-view", "drawer", "grid-view", "scroll-view", "clip-view", "scroller",
  "table-view", "table-cell-view", "outline-view", "collection-view", "browser", "rule-editor", "predicate-editor",
  "date-picker", "date-range-picker", "date-time-picker", "time-picker", "calendar", "clock",
  "menu", "menu-item", "menu-bar", "toolbar", "toolbar-item", "toolbar-customisation-palette", "path-control",
  "tab-view", "page-controller", "ruler-view", "window", "panel", "sheet", "popover", "alert", "tooltip",
  "colour-panel", "colour-well", "colour-sliders", "colour-swatches", "colour-wheel", "font-panel", "open-panel", "file-panel",
  "route-picker-view", "virtual-viewport", "view", "login-window", "notification-banner", "notification-centre",
  "system-alert", "board", "app-icon", "folder-tile", "folder-presentation", "app-view-chrome", "quick-switch", "status-bar",
] as const);

/** Parts name drawable structure, independently of any theme's artwork. */
export const nseThemeParts = Object.freeze([
  "button", "body", "cell-content", "column-resize-handle", "group-row", "page-compact-chrome", "primary-text", "scroller-corner", "secondary-text", "sidebar", "sort-glyph", "split-compact-chrome", "split-divider", "split-pane", "split-pane-slot", "subtitle", "text-content",
  "bezel", "title", "image", "track", "fill", "knob", "indicator", "separator", "cell", "header", "content",
  "border", "background", "arrow", "badge", "label", "accessory", "shadow", "scroller", "thumb",
  "row", "column", "item", "group", "segment", "token", "disclosure", "divider", "handle", "viewport",
  "leading", "trailing", "footer", "field", "value", "prefix", "suffix", "status", "error", "loading",
  "preview", "sample", "channel", "day", "tick", "hour-hand", "minute-hand", "second-hand", "face",
  "reveal", "reveal-glyph", "token-label", "token-disclosure", "indent", "tab-stop", "tab-stops",
  "circular-body", "linear-alternative", "segment-image",
  "increment", "decrement", "next", "previous", "cancel", "choose", "prompt", "recovery", "notice",
  "actions", "effects", "swatch", "palette", "wheel", "crayon", "opacity", "brightness", "focus-indicator",
] as const);

export const nseThemeStates = Object.freeze(["state", "highlighted", "enabled", "selected", "hovered", "focused", "key-window"] as const);
export const nseThemeVariants = Object.freeze([
  "bezel-style", "control-size", "segment-style", "box-type", "toolbar-style", "chrome", "button-type", "slider-type",
  "orientation", "alignment", "position", "placement", "flow", "style", "role", "type", "edge", "level",
  "title-position", "border-type", "image-scaling", "text-role", "text-colour", "background-style", "editable", "picker-mode", "navigation-placement", "navigation-flow",
] as const);

export type NSEThemeControlName = typeof nseThemeControls[number];
export type NSEThemePartName = typeof nseThemeParts[number];
