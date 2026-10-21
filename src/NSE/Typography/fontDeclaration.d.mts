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

import type { NSEFontFamily } from "../Text/fontDescriptors.js";
export interface FontFaceDefinition {
  readonly id: string; readonly label: string; readonly resource: string; readonly browserFamily: string;
  readonly fallback?: readonly string[]; readonly weight: number; readonly style: "normal" | "italic";
  readonly display?: "auto" | "block" | "swap" | "fallback" | "optional";
}
export interface FontFamilyDefinition {
  readonly id: string; readonly label: string; readonly defaultFaceId: string;
  readonly fallback?: readonly string[]; readonly faces: readonly FontFaceDefinition[];
}
export interface FontRoleDefinition {
  readonly face?: string; readonly family?: string; readonly fallback?: readonly string[]; readonly preload?: readonly string[];
}
export interface FontDeclarationDefinition {
  readonly resources: Readonly<Record<string, string>>; readonly families: readonly FontFamilyDefinition[];
  readonly aliases?: readonly { readonly family: string; readonly faces: readonly string[] }[];
  readonly roles?: Readonly<Record<string, FontRoleDefinition>>;
}
export interface FontDeclaration {
  readonly resources: Readonly<Record<string, string>>; readonly families: readonly NSEFontFamily[];
  readonly faces: readonly (FontFaceDefinition & { readonly familyId: string; readonly fallback: readonly string[]; readonly display: string })[];
  readonly aliases: readonly { readonly family: string; readonly faces: readonly string[] }[];
  readonly roles: Readonly<Record<string, FontRoleDefinition>>; readonly preloadResources: readonly string[];
}
export function defineFontDeclaration(input: FontDeclarationDefinition): FontDeclaration;
export interface FontDeclarationCSSOptions { readonly scope?: string; readonly rolePrefix?: string; }
export function fontDeclarationCSS(declaration: FontDeclaration, urls: Readonly<Record<string, string>>, options?: FontDeclarationCSSOptions): string;
/** Framework-private capture at the host/compiler boundary. */
export function captureFontDeclaration(input: FontDeclaration): FontDeclaration;
