/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

/** The identity of an app-bundled chrome drawing. */
export interface NSEAppTheme {
  readonly kind: "app";
  readonly bundleIdentifier: string;
  readonly displayName: string;
  readonly version: string;
}
