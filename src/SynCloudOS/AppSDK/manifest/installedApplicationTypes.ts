/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** Explicit install declaration; omission never installs an application. */
export interface SynWareWebAppManifest {
  readonly scope: string;
  readonly startURL: string;
  readonly shortName?: string;
  readonly description?: string;
  readonly themeColour?: string;
  readonly backgroundColour?: string;
  readonly icons: readonly { readonly src: string; readonly sizes: string; readonly type: string; readonly purpose?: "any" | "maskable" | "monochrome" }[];
}
export interface SynWareURLTypeManifest {
  readonly name: string;
  readonly schemes: readonly string[];
}
export interface SynWareLinkCaptureManifest {
  readonly paths: readonly string[];
  readonly clientMode?: "navigate-existing" | "focus-existing" | "navigate-new";
}
export interface SynWareShortcutItemManifest {
  readonly type: string;
  readonly title: string;
  readonly url: string;
  readonly subtitle?: string;
}
export interface SynWareShareTargetManifest {
  readonly action: string;
  readonly method: "GET" | "POST";
  readonly enctype?: "application/x-www-form-urlencoded" | "multipart/form-data";
  readonly params: {
    readonly title?: string;
    readonly text?: string;
    readonly url?: string;
    readonly files?: readonly { readonly name: string; readonly accept: readonly string[] }[];
  };
}
