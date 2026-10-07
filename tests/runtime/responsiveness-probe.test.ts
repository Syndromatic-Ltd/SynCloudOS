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
import { createResponsivenessProbe } from "../../src/SynCloudOS/PlatformAdapters/responsivenessProbe";

describe("independent responsiveness probe", () => {
  it("reports one missed deadline per outstanding probe and resumes after a real acknowledgement", () => {
    const probe = createResponsivenessProbe(3000, 1000);
    probe.reset(true, 1, 0);
    expect(probe.tick(0)).toEqual([{ kind: "ping", epoch: 1, id: 1 }]);
    expect(probe.tick(1000)).toEqual([]);
    expect(probe.tick(2000)).toEqual([]);
    expect(probe.tick(3000)).toEqual([{ kind: "stalled", epoch: 1, id: 1, durationMs: 3000 }]);
    expect(probe.tick(4000)).toEqual([]);
    probe.acknowledge(1, 1, 4500);
    expect(probe.tick(5000)).toEqual([{ kind: "ping", epoch: 1, id: 2 }]);
  });

  it("pauses hidden pages and fences old acknowledgements on resume", () => {
    const probe = createResponsivenessProbe();
    probe.reset(true, 1, 0);
    probe.tick(0);
    probe.reset(false, 2, 1000);
    expect(probe.tick(30000)).toEqual([]);
    probe.reset(true, 3, 30000);
    const ping = probe.tick(30000)[0];
    probe.acknowledge(1, 1, 31000);
    for (let now = 31000; now < 40000; now += 1000) expect(probe.tick(now)).toEqual([]);
    expect(probe.tick(40000)).toEqual([{ kind: "stalled", epoch: 3, id: ping.id, durationMs: 10000 }]);
  });

  it("treats a suspended worker or sleeping device as a new probe rather than a page hang", () => {
    const probe = createResponsivenessProbe();
    probe.reset(true, 1, 0);
    probe.tick(0);
    expect(probe.tick(60000)).toEqual([{ kind: "ping", epoch: 1, id: 2 }]);
  });
});
