/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Load a compiled per-app DispatchFX worker chunk URL at runtime inside the pool worker. */
export function loadWorkerChunk(chunkURL) {
  return import(/* @vite-ignore */ chunkURL);
}
