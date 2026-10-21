/*
 * SynCloudOS
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but with ABSOLUTELY NO WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

export interface NSEThemeInfo {
  readonly bundleIdentifier: string; readonly displayName: string; readonly version: string;
  readonly themeContractVersion: 1; readonly definition: "Theme.json"; readonly stylesheet: "styles.css";
  readonly description?: string; readonly author?: string;
}
export interface NSEThemeRecipeDefinition { readonly slot: string; readonly recipeId: string; }
export type NSEThemeTokenMap = Readonly<Record<`--nse-${string}`, string | number>>;
export interface NSEThemeTokens { readonly common?: NSEThemeTokenMap; readonly light: NSEThemeTokenMap; readonly dark: NSEThemeTokenMap; }
export interface NSEPeerNavigationPresentation {
  readonly kind: "tab-strip" | "source-list" | "panorama";
  readonly placement: "block-start" | "block-end" | "inline-start";
  readonly flow: "in-flow" | "overlay";
  readonly content: "icon-and-label" | "label";
  /** Scroll only the header viewport. Start alignment is a bounded strip, not a circular carousel. */
  readonly selectedHeaderAlignment?: "nearest" | "start";
  readonly overflow: { readonly kind: "more"; readonly maximumVisibleItems: number } | { readonly kind: "scroll" };
}
export type NSEThemeMotionEasing = "linear" | "ease-out" | "ease-in-out" | "decelerate";
export interface NSEThemePeerTransition { readonly kind: "none" | "slide" | "fade"; readonly durationMs: number; readonly easing: NSEThemeMotionEasing; }
export interface NSEThemePresentation {
  readonly peerNavigation: { readonly compact: NSEPeerNavigationPresentation; readonly regular: NSEPeerNavigationPresentation };
  readonly chrome: "continuous" | "rail-aligned"; readonly login: "plain" | "ornamented"; readonly tabStyle: "plain" | "layered";
  readonly metrics: { readonly navigation: { readonly barBlockSize: number; readonly edgeGap: number } };
  readonly motion?: {
    readonly peerNavigation?: NSEThemePeerTransition;
    readonly login?: { readonly kind: "none" | "fade" | "slide" | "swing"; readonly durationMs: number; readonly easing: NSEThemeMotionEasing };
    readonly shell?: { readonly kind: "none" | "fade" | "slide" | "depth"; readonly durationMs: number; readonly easing: NSEThemeMotionEasing };
    readonly overlay?: { readonly kind: "none" | "fade" | "slide" | "bounce"; readonly durationMs: number; readonly easing: NSEThemeMotionEasing };
  };
}
export interface NSEThemeMetadata {
  readonly version: string; readonly themeContractVersion: 1; readonly supportedAppearances: readonly ("light" | "dark")[];
  readonly description?: string; readonly author?: string;
}
export interface NSEThemeDefinition {
  readonly id: string; readonly displayName: string; readonly recipes: readonly NSEThemeRecipeDefinition[];
  readonly tokens: NSEThemeTokens; readonly presentation: NSEThemePresentation; readonly metadata?: NSEThemeMetadata;
  /** CSS declaration inventory compiled from entry-reachable styles and font roles. */
  readonly styleTokenNames: readonly string[];
}
export interface NSEThemeDefinitionInput {
  readonly id: string; readonly displayName: string; readonly recipes?: readonly NSEThemeRecipeDefinition[];
  readonly tokens?: NSEThemeTokens; readonly presentation?: NSEThemePresentation; readonly metadata?: NSEThemeMetadata;
  readonly styleTokenNames?: readonly string[];
}
export { defineNSETheme, neutralNSETheme } from "./themeDefinition.mjs";
