# Theme contract reference

Generated from `tooling/nse-theme-contract.json` by `scripts/synware/build-theme-contract.mjs`. Do not edit by hand.

A theme draws controls through these hooks only: `[data-nse-control]`, `[data-nse-part]`, the state and variant attributes listed here, and the appearance attributes on the theme boundary. [Themes](themes.md) explains how to use them.

Contract version 1: 72 controls, 48 colours.

## Controls

### `app-icon`

- Parts: `bezel`, `cell`, `content`, `image`, `shadow`, `title`
- States: `enabled=false`, `selected`
- Variants:
  - `data-nse-type`: `application`, `folder`

### `app-view-chrome`

- Parts: `background`
- States: `key-window=false`

### `badge`

- Parts: `badge`
- States: none

### `board`

- Parts: `background`, `content`, `group`, `header`
- States: none

### `box`

- Parts: `actions`, `background`, `bezel`, `border`, `content`, `header`, `separator`, `title`
- States: none
- Variants:
  - `data-nse-border-type`: `bezelBorder`, `grooveBorder`
  - `data-nse-box-type`: `custom`, `primary`, `secondary`, `separator`
  - `data-nse-custom-border`: `true`
  - `data-nse-custom-fill`: `true`
  - `data-nse-expanded`: `true`
  - `data-nse-role`: `disclosure`
  - `data-nse-shadow`: `true`
  - `data-nse-shadow-suppressed`: `true`
  - `data-nse-style`: `alpha`, `arrow`, `floating`, `grey`, `inspector`, `plain`, `sidebar`, `soft`, `surface`
  - `data-nse-title-position`: `aboveBottom`, `aboveTop`, `atBottom`, `atTop`, `belowBottom`, `belowTop`, `noTitle`
  - `data-nse-transparent`: `false`, `true`
  - `data-nse-view-layer`: ``

### `browser`

- Parts: `background`, `column`, `columns`, `content`, `disclosure`, `group`, `handle`, `row`, `status`, `title`, `viewport`
- States: `selected`
- Variants:
  - `data-nse-expanded`: `false`
  - `data-nse-type`: `branch`, `leaf`

### `button`

- Parts: `alignment-glyph`, `arrow`, `background`, `bezel`, `cancel`, `cell`, `choose`, `colour-chip`, `content`, `effect-colour`, `effect-colour-face`, `effect-glyph`, `field`, `image`, `indicator`, `label`, `path-item`, `tab-icon`, `title`, `title-measurement`
- States: `enabled=false`, `focused`, `highlighted`, `hovered`, `selected`, `state=mixed`, `state=off`, `state=on`, `tracking=false`, `tracking=true`
- Variants:
  - `data-nse-appearance-name`: `aqua`, `darkAqua`
  - `data-nse-bezel-style`: `disclosure`, `rounded`, `texturedRounded`
  - `data-nse-button-type`: `momentaryPushIn`, `pushOnPushOff`, `switch`, `toggle`
  - `data-nse-control-size`: `large`, `regular`, `small`
  - `data-nse-expanded`: `false`, `true`
  - `data-nse-has-destructive-action`: `true`
  - `data-nse-image-position`: `imageLeading`, `imageOnly`, `imageTrailing`, `noImage`
  - `data-nse-key-equivalent`: ``, ``
  - `data-nse-role`: `close`, `current`, `default`, `ground`, `ink`, `minimise`, `zoom`
  - `data-nse-style`: `edited`

### `clip-view`

- Parts: `colour-list`, `colour-list-chip`, `colour-list-empty`, `colour-list-name`, `colour-list-row`, `colour-list-scroll`, `content`, `viewport`
- States: none

### `collection-view`

- Parts: `background`, `content`, `image`, `item`, `media-item`, `row`, `viewport`
- States: `enabled=false`, `focused`, `selected`

### `colour-panel`

- Parts: `background`, `body`, `content-message`, `current-colour`, `eyedropper`, `eyedropper-status`, `hex-row`, `image`, `opacity-row`, `opacity-value`, `row`, `row-label`, `sample-row`, `swatch`, `swatch-grip`, `swatch-strip`
- States: `state=off`
- Variants:
  - `data-nse-value-state`: `empty`, `populated`

### `colour-sliders`

- Parts: `channel`, `channel-key`, `channel-name`, `content`, `title`
- States: none

### `colour-swatches`

- Parts: `content`, `swatch`
- States: `selected`

### `colour-well`

- Parts: `bezel`, `button`, `colour-sample`, `colour-value`, `status`
- States: `enabled=false`, `state=off`

### `colour-wheel`

- Parts: `bezel`, `wheel`, `wheel-surface`
- States: none
- Variants:
  - `data-nse-brightness-placement`: `beside`

### `combo-box`

- Parts: `bezel`, `field`
- States: `enabled=false`, `focused`
- Variants:
  - `data-nse-editable`: `true`

### `date-picker`

- Parts: `actions`, `ampm-segment`, `bezel`, `body`, `button`, `cell`, `centre`, `clock`, `clock-affix`, `column-caption`, `date-entry`, `date-time-editor`, `day`, `event-indicator`, `face`, `field`, `header`, `hour-hand`, `hour-segment`, `minute-hand`, `minute-segment`, `next-month`, `next-year`, `numeric`, `period-gap`, `previous-month`, `previous-year`, `row`, `segments`, `separator`, `title`, `today`, `value`
- States: `enabled=false`, `selected`
- Variants:
  - `data-nse-date-picker-elements`: `hourMinute`, `yearMonthDay`, `yearMonthDay hourMinute`
  - `data-nse-date-picker-mode`: `range`, `single`
  - `data-nse-date-picker-style`: `clockAndCalendar`, `textField`, `textFieldAndStepper`
  - `data-nse-flow`: `ltr`, `rtl`
  - `data-nse-position`: `end`, `middle`, `start`
  - `data-nse-role`: `calendar`, `field`, `today`
  - `data-nse-type`: `adjacent`, `clock`, `field`

### `drawer`

- Parts: `background`
- States: none
- Variants:
  - `data-nse-placement`: `bottom`, `leading`, `top`, `trailing`

### `folder-presentation`

- Parts: `backdrop`, `background`, `bezel`, `border`, `cell`, `content`, `group`, `image`, `indicator`, `preview`, `title`
- States: none

### `folder-tile`

- Parts: `background`, `bezel`, `image`
- States: none
- Variants:
  - `data-nse-style`: `roundedRect`

### `font-panel`

- Parts: `background`, `column-caption`, `columns`, `effects`, `font-file-input`, `footer`, `notice`, `paragraph`, `preview`, `preview-description`, `preview-sample`, `shadow-angle`, `size-column`, `size-list`
- States: none
- Variants:
  - `data-nse-flow`: `ltr`

### `grid-view`

- Parts: `background`, `cell`, `content`, `row`
- States: none

### `image-view`

- Parts: `accessory`, `background`, `button`, `image`
- States: none
- Variants:
  - `data-nse-image-scaling`: `none`, `proportionallyUpOrDown`

### `level-indicator`

- Parts: `segment`, `track`
- States: `enabled=false`, `selected`
- Variants:
  - `data-nse-level`: `critical`, `normal`, `warning`
  - `data-nse-type`: `capacity`, `continuous`, `discrete`, `rating`

### `login-window`

- Parts: `actions`, `attachment`, `background`, `badge`, `bezel`, `content`, `decoration`, `effects`, `error`, `image`, `leading`, `shadow`, `suspension`, `title`, `trailing`
- States: none
- Variants:
  - `data-nse-login-presentation`: `ornamented`, `plain`

### `matrix`

- Parts: `cell`, `content`, `field`, `title`
- States: `enabled=false`, `selected`, `state=off`, `state=on`
- Variants:
  - `data-nse-button-type`: `radio`
  - `data-nse-position`: `first`, `last`

### `menu`

- Parts: `background`, `bezel`, `body`, `content`, `separator`, `surface`, `title`, `viewport`
- States: none
- Variants:
  - `data-nse-chrome`: `standard`
  - `data-nse-control-size`: `regular`, `small`
  - `data-nse-menu-chosen`: ``
  - `data-nse-placement`: `block-end-inline-start`, `bottom-start`, `viewport-block-start-inline-end`
  - `data-nse-presentation`: `anchored`, `viewport-block-start-inline-end`
  - `data-nse-role`: `application-menu`, `overlay`
  - `data-nse-style`: `application-menu`, `context-menu`, `listbox`, `menu`

### `menu-bar`

- Parts: `background`, `item`
- States: none

### `menu-item`

- Parts: `back-indicator`, `cell`, `icon-column`, `shortcut-column`, `state-column`, `submenu-arrow`, `title`
- States: `enabled=false`, `focused`, `highlighted`, `selected`, `state=off`
- Variants:
  - `data-nse-menu-flash`: `off`, `on`

### `notification-banner`

- Parts: `accessory`, `background`, `bezel`, `cancel`, `content`, `effects`, `image`, `label`, `shadow`
- States: none
- Variants:
  - `data-nse-notification-presentation`: `plain`, `sliced-3d`

### `notification-centre`

- Parts: `accessory`, `actions`, `background`, `cancel`, `cell`, `content`, `disclosure`, `group`, `header`, `label`, `row`, `title`
- States: `selected`

### `open-panel`

- Parts: `background`
- States: none

### `outline-view`

- Parts: `background`, `disclosure`, `label`, `loading`, `row`
- States: `enabled=false`, `selected`
- Variants:
  - `data-nse-expanded`: `false`, `true`
  - `data-nse-selection-highlight-style`: `regular`, `sourceList`
  - `data-nse-type`: `branch`

### `page-controller`

- Parts: `content`
- States: none

### `panel`

- Parts: `actions`, `background`, `content`, `label`, `title`, `value`
- States: none
- Variants:
  - `data-nse-appearance-name`: `aqua`
  - `data-nse-style`: `about`, `preferences`

### `path-control`

- Parts: `background`
- States: none
- Variants:
  - `data-nse-style`: `standard`

### `pop-up-button`

- Parts: `action-menu`, `background`, `bezel`, `field`, `label`
- States: `enabled=false`, `focused`, `highlighted`, `hovered`
- Variants:
  - `data-nse-bezel-style`: `rounded`
  - `data-nse-control-size`: `regular`, `small`
  - `data-nse-height`: `24`
  - `data-nse-pulls-down`: `false`, `true`
  - `data-nse-type`: `native`

### `popover`

- Parts: `actions`, `arrow`, `calendar-sheet`, `centre`, `clock`, `clock-sheet`, `content`, `face`, `hour-hand`, `minute-hand`, `numeric`, `popover-arrow-fill`, `popover-frame`, `popover-outline`, `range-fields`, `surface`, `title`
- States: none
- Variants:
  - `data-nse-chrome`: `standard`
  - `data-nse-placement`: `block-end-inline-start`, `bottom-start`
  - `data-nse-presentation`: `anchored`
  - `data-nse-role`: `overlay`
  - `data-nse-style`: `popover`

### `predicate-editor`

- Parts: `background`
- States: none

### `progress-indicator`

- Parts: `content`, `fill`, `image`, `status`, `track`
- States: none
- Variants:
  - `data-nse-appearance-name`: `aqua`
  - `data-nse-background-style`: `normal`
  - `data-nse-control-size`: `large`, `regular`, `small`
  - `data-nse-indeterminate`: `false`, `true`
  - `data-nse-role`: `status`
  - `data-nse-style`: `bar`, `spinning`

### `quick-switch`

- Parts: `background`, `bezel`, `content`, `leading`, `trailing`
- States: none

### `route-picker-view`

- Parts: `background`, `bezel`, `title`
- States: `enabled=false`, `state=off`, `tracking=false`
- Variants:
  - `data-nse-bezel-style`: `rounded`
  - `data-nse-button-type`: `momentaryPushIn`
  - `data-nse-control-size`: `regular`
  - `data-nse-image-position`: `noImage`

### `rule-editor`

- Parts: `background`
- States: none

### `ruler-view`

- Parts: `content`, `status`, `tab-stop`, `tab-stops`
- States: none
- Variants:
  - `data-nse-editable`: `true`
  - `data-nse-orientation`: `horizontal`

### `save-panel`

- Parts: `content`, `prompt`, `suggested-name`, `surface`, `title`
- States: none
- Variants:
  - `data-nse-chrome`: `standard`
  - `data-nse-placement`: `block-end-inline-start`
  - `data-nse-presentation`: `anchored`, `sheet`
  - `data-nse-role`: `overlay`
  - `data-nse-style`: `action-sheet`, `popover`

### `scroll-view`

- Parts: `background`
- States: none

### `scroller`

- Parts: `track`
- States: `enabled=false`
- Variants:
  - `data-nse-orientation`: `vertical`

### `search-field`

- Parts: `bezel`, `cancel`, `content`, `field`, `image`
- States: `enabled=false`, `focused`, `hovered`
- Variants:
  - `data-nse-control-size`: `regular`, `small`
  - `data-nse-editable`: `true`
  - `data-nse-height`: `24`, `28`
  - `data-nse-value-state`: `empty`, `populated`

### `secure-text-field`

- Parts: `bezel`, `field`, `reveal`, `reveal-glyph`
- States: `enabled=false`, `focused`
- Variants:
  - `data-nse-editable`: `true`
  - `data-nse-revealed`: `false`
  - `data-nse-validation`: `valid`

### `segmented-control`

- Parts: `bezel`, `cell`, `content`, `disclosure`, `field`, `overflow`, `segment`, `title`
- States: `enabled=false`, `focused`, `highlighted`, `hovered`, `selected`, `state=off`, `state=on`
- Variants:
  - `data-nse-button-type`: `radio`
  - `data-nse-control-size`: `regular`, `small`
  - `data-nse-distribution`: `fill-equally`
  - `data-nse-expanded`: `false`, `true`
  - `data-nse-height`: `40`
  - `data-nse-position`: `first`, `inline`, `last`, `middle`
  - `data-nse-segment-style`: `capsule`, `rounded`, `texturedRounded`
  - `data-nse-style`: `grouped`
  - `data-nse-type`: `tool-button-group`

### `sheet`

- Parts: `content`, `surface`, `title`
- States: none
- Variants:
  - `data-nse-chrome`: `standard`
  - `data-nse-placement`: `block-end-inline-start`
  - `data-nse-presentation`: `sheet`
  - `data-nse-role`: `overlay`
  - `data-nse-style`: `action-sheet`

### `slider`

- Parts: `accessory`, `bezel`, `circular-body`, `content`, `field`, `fill`, `knob`, `linear-alternative`, `title`, `track`
- States: `enabled=false`, `focused`, `tracking=false`
- Variants:
  - `data-nse-control-size`: `mini`, `regular`, `small`
  - `data-nse-orientation`: `horizontal`, `vertical`
  - `data-nse-slider-type`: `circular`, `linear`

### `split-view`

- Parts: `background`, `content`, `divider`, `handle`, `sidebar`
- States: none
- Variants:
  - `data-nse-position`: `leading`
  - `data-nse-role`: `tabpanel`

### `stack-view`

- Parts: `content`
- States: none
- Variants:
  - `data-nse-alignment`: `centre`
  - `data-nse-orientation`: `horizontal`

### `status-bar`

- Parts: `background`
- States: none

### `stepper`

- Parts: `bezel`, `content`, `decrement`, `increment`
- States: `enabled=false`, `focused`
- Variants:
  - `data-nse-control-size`: `regular`, `small`

### `switch`

- Parts: `background`, `bezel`, `fill`, `knob`, `label`, `title`, `track`
- States: `enabled=false`, `state=off`, `state=on`, `tracking=false`
- Variants:
  - `data-nse-position`: `leading`, `trailing`

### `system-alert`

- Parts: `actions`, `backdrop`, `background`, `content`, `label`, `title`
- States: none
- Variants:
  - `data-nse-appearance-name`: `aqua`
  - `data-nse-chrome`: `standard`

### `tab-view`

- Parts: `background`, `bezel`, `cell`, `content`, `crayon`, `crayon-art`, `crayon-box`, `crayon-box-front`, `crayons-mode`, `grey-presets`, `header`, `image`, `image-marker`, `image-mode`, `image-palette`, `indicator`, `palettes-mode`, `sliders-mode`, `swatch`, `tab-item`, `title`, `viewport`, `wheel-mode`
- States: `selected`
- Variants:
  - `data-nse-control-size`: `large`
  - `data-nse-navigation-flow`: `in-flow`, `overlay`
  - `data-nse-navigation-placement`: `block-end`, `block-start`, `source-list`
  - `data-nse-orientation`: `horizontal`, `vertical`
  - `data-nse-position`: `first`, `last`, `middle`, `only`
  - `data-nse-role`: `tab`, `tabpanel`
  - `data-nse-style`: `capsule`, `icons`, `navigation`
  - `data-nse-type`: `template`, `vector`

### `table-cell-view`

- Parts: `accessory`, `badge`, `cell`, `cell-content`, `disclosure`, `leading`, `primary-text`, `row`, `secondary-text`, `text-content`, `trailing`
- States: `selected`
- Variants:
  - `data-nse-expanded`: `false`
  - `data-nse-highlight-style`: `none`, `regular`
  - `data-nse-style`: `list`

### `table-view`

- Parts: `background`, `body`, `cell`, `column`, `column-resize-handle`, `font-list-label`, `header`, `row`, `sort-glyph`, `title`
- States: `enabled=false`, `focused`, `selected`
- Variants:
  - `data-nse-alignment`: `start`
  - `data-nse-role`: `sort`
  - `data-nse-sort-direction`: `ascending`, `none`

### `text-field`

- Parts: `bezel`, `content`, `field`, `label`, `prefix`, `suffix`, `title`
- States: `enabled=false`, `focused`, `highlighted`, `hovered`
- Variants:
  - `data-nse-background-style`: `normal`, `raised`
  - `data-nse-control-size`: `mini`, `regular`, `small`
  - `data-nse-editable`: `false`, `true`
  - `data-nse-height`: `24`
  - `data-nse-position`: `single`
  - `data-nse-role`: `group`
  - `data-nse-text-colour`: `labelColour`
  - `data-nse-validation`: `invalid`, `valid`

### `text-view`

- Parts: `content`, `field`
- States: none
- Variants:
  - `data-nse-editable`: `false`, `true`

### `token-field`

- Parts: `bezel`, `field`, `token`, `token-disclosure`, `token-label`
- States: `enabled=false`
- Variants:
  - `data-nse-editable`: `true`

### `toolbar`

- Parts: `background`, `border`, `flexible-space`, `highlight`, `separator`, `shadow`, `space`
- States: none
- Variants:
  - `data-nse-control-size`: `small`
  - `data-nse-position`: `bottom`, `inline`, `top`
  - `data-nse-style`: `bevel`, `gloss`, `grouped`, `inner-shadow`, `separator`, `surface`
  - `data-nse-toolbar-size-mode`: `regular`, `small`
  - `data-nse-type`: `tool-button-group`

### `toolbar-customisation-palette`

- Parts: `configured-item`, `content`, `drag-handle`, `surface`, `title`
- States: none
- Variants:
  - `data-nse-chrome`: `standard`
  - `data-nse-placement`: `block-end-inline-start`
  - `data-nse-presentation`: `sheet`
  - `data-nse-role`: `overlay`
  - `data-nse-style`: `action-sheet`

### `toolbar-item`

- Parts: `background`, `border`, `content`, `custom`, `highlight`, `image`, `item`, `overflow`, `overflow-glyph`, `separator`, `shadow`, `title`
- States: `state=off`
- Variants:
  - `data-nse-style`: `bevel`, `borderless`, `cap`, `gloss`, `inner-shadow`, `labelled`, `splice`, `surface`
  - `data-nse-toolbar-bordered`: `false`

### `tooltip`

- Parts: `arrow`, `content`, `surface`
- States: none
- Variants:
  - `data-nse-chrome`: `standard`
  - `data-nse-placement`: `bottom-start`
  - `data-nse-role`: `overlay`

### `view`

- Parts: `content`
- States: none
- Variants:
  - `data-nse-corner-curve`: `circular`, `continuous`
  - `data-nse-surface-ink`: `light`
  - `data-nse-view-layer`: ``

### `virtual-viewport`

- Parts: `content`, `viewport`
- States: none

### `visual-effect-view`

- Parts: `background`
- States: none
- Variants:
  - `data-nse-chrome`: `standard`
  - `data-nse-material`: `atmo`, `metal`

### `web-view`

- Parts: `content`
- States: none

### `window`

- Parts: `accessory`, `background`, `bezel`, `body`, `centre`, `content`, `content-border`, `content-view`, `document`, `handle`, `header`, `leading`, `shadow`, `sheet`, `subtitle`, `title`, `titlebar-accessories`, `toolbar`, `trailing`, `window-fitting-content`
- States: `key-window=false`
- Variants:
  - `data-nse-alignment`: `center`, `end`, `start`
  - `data-nse-chrome`: `hud`, `metal`, `standard`
  - `data-nse-content-border`: `small`
  - `data-nse-edge`: `block-end`, `block-end-inline-end`, `block-end-inline-start`, `block-start`, `block-start-inline-end`, `block-start-inline-start`, `inline-end`, `inline-start`
  - `data-nse-role`: `borderless`, `document`, `hud`, `modal`, `panel`, `popover`, `sheet`, `standard`
  - `data-nse-style`: `custom`, `panel`, `standard`
  - `data-nse-toolbar-style`: `automatic`, `expanded`, `preference`, `unified`, `unifiedCompact`
  - `data-nse-type`: `custom`, `frameless`, `system`

## Colours

Each name is a key of `colours.light` and `colours.dark` in `Theme.json`.

`labelColour`, `secondaryLabelColour`, `tertiaryLabelColour`, `quaternaryLabelColour`, `textColour`, `placeholderTextColour`, `selectedTextColour`, `textBackgroundColour`, `selectedTextBackgroundColour`, `unemphasisedSelectedTextColour`, `unemphasisedSelectedTextBackgroundColour`, `keyboardFocusIndicatorColour`, `linkColour`, `separatorColour`, `gridColour`, `headerTextColour`, `findHighlightColour`, `highlightColour`, `shadowColour`, `selectedContentBackgroundColour`, `unemphasisedSelectedContentBackgroundColour`, `alternatingContentBackground1`, `alternatingContentBackground2`, `selectedMenuItemTextColour`, `controlAccentColour`, `controlColour`, `controlBackgroundColour`, `controlTextColour`, `disabledControlTextColour`, `selectedControlColour`, `selectedControlTextColour`, `alternateSelectedControlTextColour`, `windowBackgroundColour`, `windowFrameTextColour`, `underPageBackgroundColour`, `systemRed`, `systemOrange`, `systemYellow`, `systemGreen`, `systemMint`, `systemTeal`, `systemCyan`, `systemBlue`, `systemIndigo`, `systemPurple`, `systemPink`, `systemBrown`, `systemGrey`

## Appearance attributes

- `data-nse-colour-scheme-resolved`: `light`, `dark`
- `data-nse-contrast`: `normal`, `high`, `forced`
- `data-nse-transparency`: `normal`, `reduced`

## Navigation and presentation

- `navigation.compact`: placement `block-start`, `block-end`; flow `in-flow`, `overlay`
- `navigation.regular`: placement `source-list`, `block-start`; flow `in-flow`, `overlay`
- `presentation.login`: `plain`, `ornamented`
- `presentation.notifications`: `plain`, `sliced-3d`
- `presentation.materialLighting`: `off`, `on`

## Limits

- `minimumHitTarget`: regular 24, large 24
- `visibleFocusIndicator`: true
- `reducedMotion`: true
- `semanticProperties`: `display`, `visibility`, `content`
- `forbiddenProperties`: `animation`, `transition`, `font`, `font-family`, `font-size`, `font-weight`, `line-height`, `letter-spacing`

## Renamed identities

Earlier names and the hooks that replaced them. None is accepted as an alias.

- `toolbar.root` → `toolbar.background`
- `circular-slider` → `slider[slider-type=circular]`
- `slider-field` → `slider[slider-type=linear]`
- `ruler` → `ruler-view`
- `scroll-view-frame` → `scroll-view`
- `toolbar-configuration-sheet` → `toolbar-customisation-palette`
- `calendar` → `date-picker[date-picker-elements=yearMonthDay]`
- `time-picker` → `date-picker[date-picker-elements=hourMinute]`
- `date-time-picker` → `date-picker[date-picker-elements=yearMonthDay hourMinute]`
- `date-range-picker` → `date-picker[date-picker-mode=range]`
- `route-picker` → `route-picker-view`
- `file-panel` → `save-panel`
