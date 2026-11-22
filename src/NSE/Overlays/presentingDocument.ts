/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createContext } from "react";

/** Host-private document projection; runtime and application authority remain unchanged. */
export const PresentingDocumentContext = createContext<Document | null>(null);
