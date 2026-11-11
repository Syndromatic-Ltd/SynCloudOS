/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import type { DFXSource } from "../../DFXSource";
import type { DFXQueue } from "../../DFXQueue";
import type { DFXSourceUserDataReplace } from "../../DFXSourceUserDataReplace";
import { configureSource, mergeSourceData } from "./sourceState";
export function userDataReplaceSourceClass(Base: typeof DFXSource) {
  return class UserDataReplaceSource extends Base implements DFXSourceUserDataReplace {
    constructor(queue?: DFXQueue | null) { super(); configureSource(this, queue); }
    override get data(): number { return super.data as number; }
    override get mask(): number { return 0; }
    replace(data: number): void { mergeSourceData(this, data, "replace"); }
  };
}
