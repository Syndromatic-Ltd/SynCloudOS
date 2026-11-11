/* SynCloudOS - Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { SPFXSpeechRecognitionTaskState } from "./SPFXSpeechRecognitionTaskState";
import type { SPFXError } from "./SPFXError";
import { speechTasks } from "./internal/speechTasks";
/** A task issued by recognitionTask. Cancellation is terminal; finish preserves final delivery. */
export class SPFXSpeechRecognitionTask {
  private constructor() {}
  get state(): SPFXSpeechRecognitionTaskState { return speechTasks.get(this)!.state; }
  get isFinishing(): boolean { return speechTasks.get(this)!.finishing; }
  get isCancelled(): boolean { return speechTasks.get(this)!.cancelled; }
  get error(): SPFXError | null { return speechTasks.get(this)!.error; }
  finish(): void { speechTasks.get(this)!.finish(); }
  cancel(): void { speechTasks.get(this)!.cancel(); }
}
