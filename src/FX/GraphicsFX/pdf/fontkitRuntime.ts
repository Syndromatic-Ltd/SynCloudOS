/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Initialize fontkit's bundled generator runtime within the private font backend.
// Public PDF declarations must not require this implementation-only side effect.
import "regenerator-runtime/runtime";
export { default } from "@pdf-lib/fontkit";
