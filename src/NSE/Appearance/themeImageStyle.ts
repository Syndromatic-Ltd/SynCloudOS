/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import type { CSSProperties } from "react";
import type { NSETheme, NSEThemeImage } from "../Theme/NSETheme";
import { atmoTheme } from "./atmoTheme";

const imageSlots = {
  NSRightFacingTriangleTemplate: "--nse-image-disclosure-triangle",
  NSEStepperIncrementTemplate: "--nse-image-stepper-increment",
  NSEStepperDecrementTemplate: "--nse-image-stepper-decrement",
  NSEPopUpButtonChevron: "--nse-image-pop-up-chevron",
  NSTouchBarSearchTemplate: "--nse-image-search-field-magnifier",
  NSESearchFieldCancel: "--nse-image-search-field-cancel",
} as const;

function imageSource(image: NSEThemeImage, fragment = ""): string {
  const files = Object.entries(image.files).map(([scale, url]) => "url(" + JSON.stringify(url + fragment) + ") " + scale);
  return files.length === 1 ? "url(" + JSON.stringify(image.files["1x"] + fragment) + ")" : "image-set(" + files.join(", ") + ")";
}

/** Project the system theme's control images across ordinary and relocated boundaries. */
export function nseThemeImageStyle(theme: NSETheme): CSSProperties {
  const isAtmo = theme.bundleIdentifier === atmoTheme.bundleIdentifier;
  const customDecrement = !isAtmo && theme.images.NSEStepperDecrementTemplate;
  const customChevron = !isAtmo && theme.images.NSEPopUpButtonChevron;
  const imageProperties = Object.fromEntries(Object.entries(imageSlots).map(([name, property]) => {
    const image = theme.images[name] ?? atmoTheme.images[name]!;
    // Atmo uses the reflected SVG view to retain its original mask alignment.
    const fragment = name === "NSEStepperDecrementTemplate" && !customDecrement ? "#svgView(viewBox(0,0,8,5))" : "";
    return [property, imageSource(image, fragment)];
  }));
  return {
    ...imageProperties,
    "--nse-image-stepper-decrement-transform": customDecrement ? "none" : "initial",
    "--nse-image-pop-up-chevron-override": customChevron ? imageProperties[imageSlots.NSEPopUpButtonChevron] : "initial",
  } as CSSProperties;
}
