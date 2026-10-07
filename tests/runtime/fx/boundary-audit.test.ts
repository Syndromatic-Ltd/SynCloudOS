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

import { describe, expect, it } from "vitest";
import { inspectFxBoundary } from "../../../scripts/fx/boundary-audit.mjs";

describe("FX production cutover audit", () => {
  it("detects retired imports, reexports and dynamic imports, including aliases", () => {
    for (const source of [
      'import { NSEBezierPath as Path } from "../../NSE/Graphics";',
      'export { NSEGradient as Gradient } from "../../NSE/Graphics/NSEGradient";',
      'const p = import("@syndromatic/syncloudos/nse/animation");',
    ]) expect(inspectFxBoundary("src/consumer.ts", source).length).toBeGreaterThan(0);
  });
  it("does not treat historical evidence, comments or stored data as executable aliases", () => {
    expect(inspectFxBoundary("docs/history.ts", 'import "../NSE/Graphics"')).toEqual([]);
    expect(inspectFxBoundary("src/settings.ts", '// import { GFXGradient } from "../../../src/FX/GraphicsFX/public";\nconst persisted = "GFXGradient";')).toEqual([]);
    expect(inspectFxBoundary("src/consumer.ts", 'import { GFXPath } from "../../../src/FX/GraphicsFX/public";')).toEqual([]);
  });
  it("detects an old public declaration and respects actual NSE control names", () => {
    expect(inspectFxBoundary("src/bridge.ts", "export const NSEBezierPath = GFXPath;")).toHaveLength(1);
    expect(inspectFxBoundary("src/control.ts", "export class NSEPushButton {}" )).toEqual([]);
  });
});
