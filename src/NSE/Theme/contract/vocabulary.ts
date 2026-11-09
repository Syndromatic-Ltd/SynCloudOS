/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

/** AppKit control identities, with neutral names for SynCloudOS-only surfaces. */
export const nseThemeControls = Object.freeze([
  "button", "switch", "pop-up-button", "segmented-control", "slider", "stepper", "level-indicator",
  "progress-indicator", "text-field", "secure-text-field", "search-field", "combo-box", "token-field", "text-view",
  "box", "matrix", "image-view", "stack-view", "split-view", "drawer", "grid-view", "scroll-view", "clip-view", "scroller",
  "table-view", "table-cell-view", "outline-view", "collection-view", "browser", "rule-editor", "predicate-editor",
  "date-picker",
  "menu", "menu-item", "menu-bar", "toolbar", "toolbar-item", "toolbar-customisation-palette", "path-control",
  "tab-view", "page-controller", "ruler-view", "window", "panel", "sheet", "popover", "alert", "tooltip",
  "colour-panel", "colour-well", "colour-sliders", "colour-swatches", "colour-wheel", "font-panel", "open-panel",
  "save-panel", "web-view", "route-picker-view", "virtual-viewport", "view", "login-window", "notification-banner", "notification-centre",
  "system-alert", "board", "app-icon", "folder-tile", "folder-presentation", "app-view-chrome", "quick-switch", "status-bar",
] as const);

/** Parts name drawable structure, independently of any theme's artwork. */
export const nseThemeParts = Object.freeze([
  "path-item", "action-menu", "alignment-glyph", "ampm-segment", "calendar-sheet", "centre", "channel-key", "channel-name", "clock", "clock-affix", "clock-sheet", "colour-chip", "colour-list", "colour-list-chip", "colour-list-empty", "colour-list-name", "colour-list-row", "colour-list-scroll", "colour-sample", "colour-value", "column-caption", "columns", "content-message", "crayon-art", "crayon-box", "crayon-box-front", "crayons-mode", "current-colour", "date-entry", "date-time-editor", "effect-colour", "effect-colour-face", "effect-glyph", "event-indicator", "eyedropper", "eyedropper-status", "font-file-input", "font-list", "font-list-label", "grey-presets", "hex-entry", "hex-row", "hour-field", "hour-segment", "image-marker", "image-mode", "image-palette", "minute-field", "minute-segment", "next-month", "next-year", "numeric", "opacity-row", "opacity-value", "palettes-mode", "paragraph", "popover-arrow-fill", "popover-frame", "popover-outline", "preview-description", "preview-sample", "previous-month", "previous-year", "range-fields", "row-label", "sample-row", "second-field", "second-segment", "segments", "shadow-angle", "size-column", "size-list", "sliders-mode", "suggested-name", "swatch-grip", "swatch-strip", "today", "wheel-mode", "wheel-surface", "window-fitting-content",
  "back-indicator", "configured-item", "custom", "drag-handle", "flexible-space", "icon-column", "overflow", "overflow-glyph", "shortcut-column", "space", "state-column", "submenu-arrow", "surface", "tab-accessories", "tab-caption", "tab-icon", "tab-item", "title-measurement", "validation-status",
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
  "pulls-down", "title-position", "border-type", "image-scaling", "text-role", "text-colour", "background-style", "editable", "date-picker-style", "picker-mode", "navigation-placement", "navigation-flow",
] as const);

export type NSEThemeControlName = typeof nseThemeControls[number];
export type NSEThemePartName = typeof nseThemeParts[number];
