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

import type { DocumentOutputPDFArtifact, DocumentOutputPrintHost, DocumentOutputPrintResult } from "./documentOutputTypes";

/** Call from the user's print action after preparing and presenting the artifact. This function never awaits. */
export function requestDocumentOutputPrint(artifact: DocumentOutputPDFArtifact, host: DocumentOutputPrintHost): DocumentOutputPrintResult {
  try {
    if (!host.isUserActivationActive()) return Object.freeze({ status: "prepared", receipt: artifact.receipt, reason: "A fresh user print action is required." });
    const status = host.requestDialog(artifact);
    if (status !== "dialog-requested" && status !== "canceled") throw new TypeError("Print hosts must request the dialog synchronously.");
    return Object.freeze({ status, receipt: artifact.receipt });
  } catch (error) {
    return Object.freeze({ status: "failed", receipt: artifact.receipt, reason: error instanceof Error ? error.message : String(error) });
  }
}

/** The caller must first present this artifact in the supplied window's print surface. No window or popup is opened. */
export function createBrowserDocumentOutputPrintHost(printWindow: Pick<Window, "navigator" | "print">): DocumentOutputPrintHost {
  return Object.freeze({
    isUserActivationActive: () => printWindow.navigator.userActivation?.isActive === true,
    requestDialog: () => {
      // Check again at the actual browser effect; a custom caller cannot skip the activation gate.
      if (printWindow.navigator.userActivation?.isActive !== true) throw new Error("A fresh user print action is required.");
      printWindow.print();
      return "dialog-requested" as const;
    },
  });
}
