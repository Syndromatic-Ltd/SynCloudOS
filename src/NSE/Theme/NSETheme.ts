/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import type { NSEThemeColourName } from "./contract/colours";
export interface NSEThemeNavigation {
  readonly compact: { readonly placement: "block-start" | "block-end"; readonly flow: "in-flow" | "overlay" };
  readonly regular: { readonly placement: "source-list" | "block-start"; readonly flow: "in-flow" | "overlay" };
}
export interface NSEThemePresentation {
  readonly login: "plain" | "ornamented";
  readonly notifications: "plain" | "sliced-3d";
  readonly materialLighting: "off" | "on";
}
export interface NSEThemeImage {
  readonly files: { readonly "1x": string; readonly "2x"?: string; readonly "3x"?: string };
  readonly pointSize: { readonly width: number; readonly height: number };
  readonly template?: boolean;
}
export interface NSETheme {
  readonly bundleIdentifier: string;
  readonly displayName: string;
  readonly version: string;
  readonly colours: {
    readonly light: Readonly<Record<NSEThemeColourName, string>>;
    readonly dark: Readonly<Record<NSEThemeColourName, string>>;
    readonly highContrastLight?: Readonly<Partial<Record<NSEThemeColourName, string>>>;
    readonly highContrastDark?: Readonly<Partial<Record<NSEThemeColourName, string>>>;
  };
  readonly navigation: NSEThemeNavigation;
  readonly presentation: NSEThemePresentation;
  readonly images: Readonly<Record<string, NSEThemeImage>>;
}
/** @internal Copy generated static data; no mutable caller-owned object is retained. */
export function freezeNSETheme(input: NSETheme): NSETheme {
  const copy = (value: unknown): unknown => {
    if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return Object.freeze(value.map(copy));
    if (value && typeof value === "object" && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, child]) => [key, copy(child)])));
    throw new TypeError("NSETheme contains static data only.");
  };
  return copy(input) as NSETheme;
}
