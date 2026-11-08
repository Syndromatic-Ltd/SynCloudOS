/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXSource } from "../../DFXSource";
import type { DFXQueue } from "../../DFXQueue";
import type { DFXSourceUserDataAdd } from "../../DFXSourceUserDataAdd";
import { configureSource, mergeSourceData } from "./sourceState";
/** Defer subclass definition until the public base is initialised (no module cycle). */
export function userDataAddSourceClass(Base: typeof DFXSource) {
  return class UserDataAddSource extends Base implements DFXSourceUserDataAdd {
    constructor(queue?: DFXQueue | null) { super(); configureSource(this, queue); }
    override get data(): number { return super.data as number; }
    override get mask(): number { return 0; }
    add(data: number): void { mergeSourceData(this, data, "add"); }
  };
}
