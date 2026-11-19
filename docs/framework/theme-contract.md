# Theme contract reference

Generated from `tooling/nse-theme-contract.json` by `scripts/synware/build-theme-contract.mjs`. Do not edit by hand.

A theme draws controls through these hooks only: `[data-nse-control]`, `[data-nse-part]`, the state and variant attributes listed here, and the appearance attributes on the theme boundary. [Themes](themes.md) explains how to use them.

Each hook is also mirrored on its element as a class token beginning `nse:`, and the build rewrites hook selectors to those classes so the browser can index them. The classes are private and may change without notice: write the attributes, and never select on the classes.

Contract version 1: 73 controls, 48 colours.

## Controls

### `app-icon`

- Parts: `bezel`, `cell`, `content`, `image`, `title`
- States: `enabled=false`, `selected`
- Variants:
  - `data-nse-role`: `anchor`, `backdrop`
  - `data-nse-type`: `application`, `folder`

### `app-view-chrome`

- Parts: `background`, `border`, `content`, `content-border`, `content-view`, `decoration`
- States: `key-window=false`
- Variants:
  - `data-nse-background-style`: `none`, `system`
  - `data-nse-content-border`: `large`, `small`
  - `data-nse-edge`: `minY`
  - `data-nse-material`: `metal`
  - `data-nse-style`: `custom`, `standard`
  - `data-nse-type`: `incoming`, `outgoing`

### `badge`

- Parts: `badge`
- States: none

### `board`

- Parts: `accessory`, `background`, `button`, `content`, `group`, `header`
- States: `selected`, `state=ready`
- Variants:
  - `data-nse-presentation`: `idle`
  - `data-nse-role`: `launcher`, `page-controls`

### `box`

- Parts: `actions`, `background`, `bezel`, `border`, `content`, `header`, `label`, `separator`, `subtitle`, `title`
- States: none
- Variants:
  - `data-nse-border-colour`: `true`
  - `data-nse-border-type`: `bezelBorder`, `grooveBorder`
  - `data-nse-box-type`: `custom`, `primary`, `secondary`, `separator`
  - `data-nse-custom-border`: `true`
  - `data-nse-custom-fill`: `true`
  - `data-nse-expanded`: `true`
  - `data-nse-role`: `disclosure`, `legend`, `note`
  - `data-nse-shadow`: `true`
  - `data-nse-shadow-suppressed`: `true`
  - `data-nse-style`: `alpha`, `arrow`, `floating`, `grey`, `grouped`, `inspector`, `plain`, `sidebar`, `soft`, `surface`
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
  - `data-nse-chrome`: `hud`
  - `data-nse-content-tint`: `true`
  - `data-nse-control-size`: `large`, `regular`, `small`
  - `data-nse-custom-bezel`: `true`
  - `data-nse-expanded`: `false`, `true`
  - `data-nse-has-destructive-action`: `true`
  - `data-nse-image-position`: `imageLeading`, `imageOnly`, `imageTrailing`, `noImage`
  - `data-nse-key-equivalent`: ``, ``
  - `data-nse-position`: `leading`, `trailing`
  - `data-nse-role`: `archive-action`, `back`, `close`, `current`, `default`, `ground`, `ink`, `minimise`, `sign-in`, `zoom`
  - `data-nse-style`: `edited`

### `chronosphere`

- Parts: `accessory`, `actions`, `backdrop`, `background`, `badge`, `bezel`, `body`, `button`, `cell`, `content`, `decoration`, `face`, `footer`, `header`, `indicator`, `label`, `status`, `subtitle`, `surface`, `tick`, `title`, `track`, `viewport`
- States: `selected`, `state=loading`, `state=open`
- Variants:
  - `data-nse-material`: `paper`
  - `data-nse-position`: `past`, `present`
  - `data-nse-revealed`: `true`
  - `data-nse-role`: `archive`, `caption`, `current-version`, `details`, `grid`, `preparation`, `signal`, `stack`, `time-navigation`, `timeline`
  - `data-nse-style`: `grid`, `preparation`, `stack`

### `clip-view`

- Parts: `colour-list`, `colour-list-chip`, `colour-list-empty`, `colour-list-name`, `colour-list-row`, `colour-list-scroll`, `content`, `viewport`
- States: none

### `collection-view`

- Parts: `background`, `content`, `image`, `item`, `label`, `media-item`, `primary-text`, `row`, `subtitle`, `title`, `viewport`
- States: `enabled=false`, `focused`, `selected`
- Variants:
  - `data-nse-style`: `cover-flow`

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

- Parts: `actions`, `ampm-segment`, `bezel`, `body`, `button`, `cell`, `centre`, `clock`, `clock-affix`, `column-caption`, `date-entry`, `date-time-editor`, `day`, `event-indicator`, `face`, `field`, `header`, `hour-hand`, `hour-segment`, `minute-hand`, `minute-segment`, `next-month`, `next-year`, `numeric`, `period-gap`, `previous-month`, `previous-year`, `row`, `second-hand`, `segments`, `separator`, `title`, `today`, `value`
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
- Variants:
  - `data-nse-position`: `bottom`, `top`
  - `data-nse-presentation`: `closed`, `closing`, `open`
  - `data-nse-style`: `fade`, `split`

### `folder-tile`

- Parts: `background`, `bezel`, `border`, `highlight`, `image`, `indicator`, `shadow`
- States: `highlighted`
- Variants:
  - `data-nse-style`: `circle`, `roundedRect`
  - `data-nse-type`: `inset`, `texture`

### `font-panel`

- Parts: `background`, `column-caption`, `columns`, `effects`, `font-file-input`, `footer`, `notice`, `paragraph`, `preview`, `preview-description`, `preview-sample`, `shadow-angle`, `size-column`, `size-list`
- States: none
- Variants:
  - `data-nse-flow`: `ltr`

### `grid-view`

- Parts: `background`, `cell`, `content`, `row`
- States: none

### `icon-well`

- Parts: `background`, `image`, `shadow`
- States: `selected`
- Variants:
  - `data-nse-role`: `artwork`

### `image-view`

- Parts: `accessory`, `background`, `button`, `decoration`, `image`
- States: none
- Variants:
  - `data-nse-image-scaling`: `none`, `proportionallyUpOrDown`
  - `data-nse-role`: `crop`
  - `data-nse-style`: `editor`, `thumbnail`

### `level-indicator`

- Parts: `segment`, `track`
- States: `enabled=false`, `selected`
- Variants:
  - `data-nse-level`: `critical`, `normal`, `warning`
  - `data-nse-type`: `capacity`, `continuous`, `discrete`, `rating`

### `login-window`

- Parts: `actions`, `attachment`, `backdrop`, `background`, `badge`, `bezel`, `button`, `content`, `decoration`, `effects`, `error`, `field`, `image`, `indicator`, `leading`, `shadow`, `suspension`, `title`, `trailing`
- States: `enabled=false`, `state=off`, `state=on`
- Variants:
  - `data-nse-login-presentation`: `ornamented`, `plain`
  - `data-nse-role`: `fastener`, `plate`
  - `data-nse-validation`: `invalid`

### `matrix`

- Parts: `cell`, `content`, `field`, `title`
- States: `enabled=false`, `selected`, `state=off`, `state=on`
- Variants:
  - `data-nse-button-type`: `radio`
  - `data-nse-position`: `first`, `last`

### `menu`

- Parts: `background`, `bezel`, `body`, `content`, `decoration`, `separator`, `surface`, `title`, `viewport`
- States: none
- Variants:
  - `data-nse-chrome`: `standard`
  - `data-nse-control-size`: `regular`, `small`
  - `data-nse-edge`: `both`, `maxY`, `minY`
  - `data-nse-menu-chosen`: ``
  - `data-nse-overlay-state`: `closing`, `open`
  - `data-nse-placement`: `block-end-inline-start`, `bottom-start`, `viewport-block-start-inline-end`
  - `data-nse-presentation`: `anchored`, `viewport-block-start-inline-end`
  - `data-nse-role`: `application-menu`, `command-menu`, `overlay`
  - `data-nse-style`: `application-menu`, `context-menu`, `listbox`, `menu`, `popup`

### `menu-bar`

- Parts: `background`, `item`
- States: none

### `menu-item`

- Parts: `back-indicator`, `cell`, `icon-column`, `shortcut-column`, `state-column`, `submenu-arrow`, `title`
- States: `enabled=false`, `focused`, `highlighted`, `selected`, `state=off`
- Variants:
  - `data-nse-menu-flash`: `off`, `on`

### `notification-banner`

- Parts: `accessory`, `actions`, `background`, `bezel`, `cancel`, `cell`, `content`, `effects`, `face`, `image`, `label`, `paragraph`, `shadow`, `title`
- States: none
- Variants:
  - `data-nse-has-destructive-action`: `true`
  - `data-nse-level`: `standard`, `timeSensitive`
  - `data-nse-notification-presentation`: `plain`, `sliced-3d`
  - `data-nse-role`: `action`, `application`, `dismiss`, `screen`, `shade`, `underside`, `void`
  - `data-nse-style`: `primary`

### `notification-centre`

- Parts: `accessory`, `actions`, `background`, `button`, `cancel`, `cell`, `content`, `disclosure`, `group`, `header`, `label`, `paragraph`, `row`, `status`, `title`, `value`
- States: `selected`
- Variants:
  - `data-nse-role`: `action`, `application`, `clear`, `clear-all`, `close`, `groups`, `history`, `message`, `metadata`
  - `data-nse-type`: `displayed`

### `open-panel`

- Parts: `actions`, `background`, `content-message`, `footer`, `header`, `sheet`, `sidebar`, `status`
- States: none
- Variants:
  - `data-nse-role`: `toolbar`
  - `data-nse-style`: `compact`

### `outline-view`

- Parts: `background`, `disclosure`, `group`, `group-row`, `label`, `loading`, `row`, `separator`, `sidebar`
- States: `enabled=false`, `selected`
- Variants:
  - `data-nse-expanded`: `false`, `true`
  - `data-nse-role`: `children`
  - `data-nse-selection-highlight-style`: `regular`, `sourceList`
  - `data-nse-type`: `branch`

### `page-controller`

- Parts: `attachment`, `backdrop`, `border`, `button`, `content`, `decoration`, `face`, `separator`, `shadow`, `sheet`, `surface`
- States: `state=idle`, `tracking=`
- Variants:
  - `data-nse-edge`: `bottom`, `right`, `top`
  - `data-nse-flow`: `book`
  - `data-nse-orientation`: `horizontal`, `vertical`
  - `data-nse-position`: `back`, `front`
  - `data-nse-presentation`: `book`
  - `data-nse-role`: `bookCurl`, `bookTurn`, `cardFlip`, `nseSheet`, `page-fold`, `page-ghost`, `page-leaf`, `page-strip`, `page-tear`, `settingsPeel`, `tearAway`
  - `data-nse-style`: `curl`, `flip`, `fold`, `peel`, `tear`, `turn`
  - `data-nse-type`: `css`

### `panel`

- Parts: `actions`, `backdrop`, `background`, `content`, `group`, `image`, `label`, `status`, `surface`, `title`, `value`
- States: `state=off`
- Variants:
  - `data-nse-appearance-name`: `aqua`, `darkAqua`
  - `data-nse-chrome`: `standard`
  - `data-nse-role`: `copyright`, `empty`, `lead-note`, `note`, `notifications`, `preference-body`, `preference-list`, `preference-pane`, `tagline`, `trademark`
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
  - `data-nse-content-tint`: `true`
  - `data-nse-control-size`: `regular`, `small`
  - `data-nse-custom-bezel`: `true`
  - `data-nse-height`: `24`
  - `data-nse-pulls-down`: `false`, `true`
  - `data-nse-type`: `native`

### `popover`

- Parts: `actions`, `arrow`, `calendar-sheet`, `centre`, `clock`, `clock-sheet`, `content`, `face`, `hour-hand`, `minute-hand`, `numeric`, `popover-arrow-fill`, `popover-frame`, `popover-outline`, `range-fields`, `surface`, `title`
- States: none
- Variants:
  - `data-nse-chrome`: `standard`
  - `data-nse-overlay-state`: `closing`, `open`
  - `data-nse-placement`: `block-end-inline-start`, `bottom-start`
  - `data-nse-presentation`: `anchored`
  - `data-nse-role`: `overlay`
  - `data-nse-style`: `popover`
  - `data-nse-transparent`: `false`, `true`

### `predicate-editor`

- Parts: `background`, `error`
- States: none

### `progress-indicator`

- Parts: `content`, `fill`, `image`, `status`, `track`
- States: none
- Variants:
  - `data-nse-appearance-name`: `aqua`
  - `data-nse-background-style`: `emphasised`, `normal`
  - `data-nse-control-size`: `large`, `regular`, `small`
  - `data-nse-indeterminate`: `false`, `true`
  - `data-nse-motion`: `animated`, `static`
  - `data-nse-role`: `status`
  - `data-nse-style`: `bar`, `spinning`
  - `data-nse-suspended`: `false`, `true`

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

- Parts: `background`, `error`, `group`, `row`
- States: none
- Variants:
  - `data-nse-style`: `alternating`

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
  - `data-nse-overlay-state`: `open`
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
  - `data-nse-custom-bezel`: `true`
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
  - `data-nse-overlay-state`: `open`
  - `data-nse-placement`: `block-end-inline-start`
  - `data-nse-presentation`: `sheet`
  - `data-nse-role`: `overlay`
  - `data-nse-style`: `action-sheet`

### `slider`

- Parts: `accessory`, `bezel`, `border`, `circular-body`, `content`, `decoration`, `field`, `fill`, `highlight`, `image`, `knob`, `linear-alternative`, `title`, `track`
- States: `enabled=false`, `focused`, `tracking=false`
- Variants:
  - `data-nse-control-size`: `mini`, `regular`, `small`
  - `data-nse-material`: `metal`
  - `data-nse-orientation`: `horizontal`, `vertical`
  - `data-nse-slider-type`: `circular`, `linear`

### `split-view`

- Parts: `background`, `content`, `divider`, `handle`, `sidebar`, `split-divider`, `split-pane`, `split-pane-slot`
- States: none
- Variants:
  - `data-nse-orientation`: `horizontal`, `vertical`
  - `data-nse-position`: `leading`
  - `data-nse-role`: `tabpanel`

### `stack-view`

- Parts: `button`, `content`, `item`, `menu`, `overflow`
- States: `enabled=false`
- Variants:
  - `data-nse-alignment`: `centre`
  - `data-nse-orientation`: `horizontal`

### `stepper`

- Parts: `bezel`, `content`, `decrement`, `increment`
- States: `enabled=false`, `focused`
- Variants:
  - `data-nse-control-size`: `regular`, `small`

### `switch`

- Parts: `background`, `bezel`, `border`, `decoration`, `fill`, `highlight`, `image`, `knob`, `label`, `title`, `track`
- States: `enabled=false`, `state=off`, `state=on`, `tracking=false`
- Variants:
  - `data-nse-material`: `metal`
  - `data-nse-position`: `leading`, `trailing`

### `system-alert`

- Parts: `actions`, `backdrop`, `background`, `badge`, `content`, `decoration`, `disclosure`, `image`, `label`, `title`
- States: none
- Variants:
  - `data-nse-appearance-name`: `aqua`
  - `data-nse-chrome`: `standard`
  - `data-nse-presentation`: `sheet`
  - `data-nse-role`: `details`
  - `data-nse-type`: `content-view`

### `tab-view`

- Parts: `background`, `bezel`, `cell`, `content`, `crayon`, `crayon-art`, `crayon-box`, `crayon-box-front`, `crayons-mode`, `grey-presets`, `header`, `image`, `image-marker`, `image-mode`, `image-palette`, `indicator`, `overflow`, `palettes-mode`, `sliders-mode`, `swatch`, `tab-item`, `title`, `viewport`, `wheel-mode`
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

- Parts: `accessory`, `badge`, `cell`, `cell-content`, `disclosure`, `image`, `leading`, `notice`, `primary-text`, `row`, `secondary-text`, `text-content`, `trailing`
- States: `selected`
- Variants:
  - `data-nse-expanded`: `false`
  - `data-nse-highlight-style`: `none`, `regular`
  - `data-nse-position`: `first`, `last`
  - `data-nse-role`: `preference-link`
  - `data-nse-style`: `list`
  - `data-nse-type`: `template`

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

- Parts: `attachment`, `content`, `field`, `handle`, `shadow`
- States: `selected`
- Variants:
  - `data-nse-editable`: `false`, `true`
  - `data-nse-shadow`: `contact`, `curved`

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
  - `data-nse-presentation`: `keyboard`
  - `data-nse-style`: `bevel`, `gloss`, `grouped`, `inner-shadow`, `separator`, `surface`
  - `data-nse-toolbar-size-mode`: `regular`, `small`
  - `data-nse-type`: `tool-button-group`

### `toolbar-customisation-palette`

- Parts: `configured-item`, `content`, `drag-handle`, `surface`, `title`
- States: none
- Variants:
  - `data-nse-chrome`: `standard`
  - `data-nse-overlay-state`: `open`
  - `data-nse-placement`: `block-end-inline-start`
  - `data-nse-presentation`: `sheet`
  - `data-nse-role`: `overlay`
  - `data-nse-style`: `action-sheet`

### `toolbar-item`

- Parts: `background`, `border`, `content`, `custom`, `highlight`, `image`, `item`, `overflow`, `overflow-glyph`, `separator`, `shadow`, `title`
- States: `enabled=false`, `selected`, `state=off`, `state=on`
- Variants:
  - `data-nse-background-tint`: `true`
  - `data-nse-style`: `bevel`, `borderless`, `cap`, `gloss`, `inner-shadow`, `labelled`, `splice`, `surface`
  - `data-nse-toolbar-bordered`: `false`

### `tooltip`

- Parts: `arrow`, `content`, `surface`
- States: none
- Variants:
  - `data-nse-chrome`: `standard`
  - `data-nse-overlay-state`: `open`
  - `data-nse-placement`: `bottom-start`
  - `data-nse-role`: `overlay`

### `view`

- Parts: `background`, `content`, `decoration`, `group`, `header`, `image`, `item`, `label`, `loading`, `paragraph`, `preview`, `status`, `title`, `value`
- States: none
- Variants:
  - `data-nse-chrome`: `standard`
  - `data-nse-corner-curve`: `circular`, `continuous`
  - `data-nse-role`: `capabilities`, `description`, `drag-proxy`, `material`, `note`, `runtime`, `startup`, `startup-material`, `startup-spinner`, `startup-spotlight`, `storage`, `updates`, `widget-shelf`
  - `data-nse-surface-ink`: `light`
  - `data-nse-view-layer`: ``

### `virtual-viewport`

- Parts: `content`, `viewport`
- States: none

### `visual-effect-view`

- Parts: `background`, `image`, `surface`
- States: none
- Variants:
  - `data-nse-chrome`: `standard`
  - `data-nse-focus-style`: `inset`, `within`
  - `data-nse-material`: `atmo`, `glass`, `linen`, `metal`
  - `data-nse-role`: `vortex`
  - `data-nse-style`: `panel`, `vortex`

### `web-view`

- Parts: `content`
- States: none

### `window`

- Parts: `accessory`, `backdrop`, `background`, `bezel`, `body`, `border`, `button`, `cell`, `content`, `content-border`, `content-view`, `decoration`, `document`, `fill`, `floating-titlebar`, `handle`, `header`, `image`, `indicator`, `leading`, `menu`, `shadow`, `sheet`, `sidebar`, `subtitle`, `surface`, `title`, `titlebar-accessories`, `toolbar`, `toolbar-row`, `trailing`, `window-fitting-content`
- States: `key-window=false`, `selected`
- Variants:
  - `data-nse-alignment`: `center`, `end`, `start`
  - `data-nse-chrome`: `hud`, `metal`, `standard`
  - `data-nse-content-border`: `large`, `small`
  - `data-nse-edge`: `block-end`, `block-end-inline-end`, `block-end-inline-start`, `block-start`, `block-start-inline-end`, `block-start-inline-start`, `inline-end`, `inline-start`, `minY`
  - `data-nse-focus-style`: `ring`
  - `data-nse-material`: `cumulus`, `metal`
  - `data-nse-presentation`: `attached`, `floating`
  - `data-nse-role`: `borderless`, `hud`, `modal`, `panel`, `popover`, `sheet`, `standard`, `titlebar`, `transfer`
  - `data-nse-style`: `hud`, `panel`, `standard`, `titlebar`
  - `data-nse-toolbar-style`: `automatic`, `expanded`, `preference`, `unified`, `unifiedCompact`
  - `data-nse-transparent`: `true`
  - `data-nse-type`: `custom`, `frameless`, `system`
- Mark a document region in custom window content with `data-nse-part="document"` so its titles can be distinguished from window chrome.

## Colours

Each name is a key of `colours.light` and `colours.dark` in `Theme.json`.

`labelColour`, `secondaryLabelColour`, `tertiaryLabelColour`, `quaternaryLabelColour`, `textColour`, `placeholderTextColour`, `selectedTextColour`, `textBackgroundColour`, `selectedTextBackgroundColour`, `unemphasisedSelectedTextColour`, `unemphasisedSelectedTextBackgroundColour`, `keyboardFocusIndicatorColour`, `linkColour`, `separatorColour`, `gridColour`, `headerTextColour`, `findHighlightColour`, `highlightColour`, `shadowColour`, `selectedContentBackgroundColour`, `unemphasisedSelectedContentBackgroundColour`, `alternatingContentBackground1`, `alternatingContentBackground2`, `selectedMenuItemTextColour`, `controlAccentColour`, `controlColour`, `controlBackgroundColour`, `controlTextColour`, `disabledControlTextColour`, `selectedControlColour`, `selectedControlTextColour`, `alternateSelectedControlTextColour`, `windowBackgroundColour`, `windowFrameTextColour`, `underPageBackgroundColour`, `systemRed`, `systemOrange`, `systemYellow`, `systemGreen`, `systemMint`, `systemTeal`, `systemCyan`, `systemBlue`, `systemIndigo`, `systemPurple`, `systemPink`, `systemBrown`, `systemGrey`

## Control custom properties

Themes can read these properties when an instance supplies a colour.

- `--nse-bezel-colour` applies to `button`, `pop-up-button`
- `--nse-content-tint-colour` applies to `button`, `pop-up-button`
- `--nse-background-tint-colour` applies to `toolbar-item`
- `--nse-selected-segment-bezel-colour` applies to `segmented-control`
- `--nse-box-fill` applies to `box`
- `--nse-box-border-colour` applies to `box`

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

## Typography

Themes can set `font`, `font-*`, `line-height`, `letter-spacing`, `word-spacing`, `text-transform`. Drawing a part resets its underlying paint and typography for that state. Omitted inherited typography properties take their values from the parent.

Use `@font-face` with `woff2` files under `Resources/` and a package-local `url()`.

## Motion

Each role in `motion` of `Theme.json` is a spring, `{ "duration", "bounce" }`, or a curve, `{ "duration", "timingFunction": [x1, y1, x2, y2] }`. A role the theme omits takes Atmo's timing.

Roles: `standard`, `control`, `selection`, `presentation`, `dismissal`, `scrollBoundary`.

Transitions use only `var(--nse-motion-<role>-duration)` and `var(--nse-motion-<role>-easing)` for their timing, with roles in kebab case such as `scroll-boundary`. Literal durations, delays and easings are rejected. Reduced motion makes every duration zero.

## App theme controls

`window`, `app-view-chrome`, `toolbar`, `toolbar-item`, `tab-view`, `segmented-control`, `split-view`, `menu`, `menu-item`, `popover`

## Limits

- `minimumHitTarget`: regular 24, large 24
- `visibleFocusIndicator`: true
- `reducedMotion`: true
- `semanticProperties`: `display`, `visibility`, `content`
- `forbiddenProperties`: `animation`

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
