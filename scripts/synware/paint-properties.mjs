/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

const maskProperties = [
  "mask",
  "mask-clip",
  "mask-composite",
  "mask-image",
  "mask-mode",
  "mask-origin",
  "mask-position",
  "mask-repeat",
  "mask-size",
];

export const paintProperties = Object.freeze([
  "background",
  "background-attachment",
  "background-blend-mode",
  "background-clip",
  "background-color",
  "background-image",
  "background-origin",
  "background-position",
  "background-position-x",
  "background-position-y",
  "background-repeat",
  "background-size",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border-block-color",
  "border-block-start-color",
  "border-block-end-color",
  "border-inline-color",
  "border-inline-start-color",
  "border-inline-end-color",
  "border-image",
  "border-image-outset",
  "border-image-repeat",
  "border-image-slice",
  "border-image-source",
  "border-image-width",
  "box-shadow",
  "outline-color",
  ...maskProperties,
  ...maskProperties.map(property => `-webkit-${property}`),
  "-webkit-mask-attachment",
  "-webkit-mask-position-x",
  "-webkit-mask-position-y",
  "-webkit-mask-repeat-x",
  "-webkit-mask-repeat-y",
  "filter",
  "backdrop-filter",
  "-webkit-backdrop-filter",
  "fill",
  "stroke",
  "text-shadow",
  "opacity",
  "color",
]);

export const userAgentResetValues = Object.freeze(["none", "transparent", "initial", "unset"]);

const paintPropertyNames = new Set(paintProperties);

export function isPaintProperty(name) {
  const property = name.toLowerCase();
  return paintPropertyNames.has(property) ||
    (property.startsWith("-webkit-") && paintPropertyNames.has(property.slice("-webkit-".length)) &&
      !property.startsWith("-webkit--webkit-"));
}
