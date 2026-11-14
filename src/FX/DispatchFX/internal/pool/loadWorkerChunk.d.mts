/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
export function loadWorkerChunk(chunkURL: string): Promise<{
  readonly __dfxClosures?: Record<string, (...args: unknown[]) => unknown>;
  readonly closures?: Record<string, (...args: unknown[]) => unknown>;
}>;
