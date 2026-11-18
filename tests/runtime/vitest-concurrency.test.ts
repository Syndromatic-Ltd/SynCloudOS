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

import { expect, it } from "vitest";
import config, { heavyTests, packagingTests } from "../../vitest.config";

type Project = { test: { name: string; include: string[]; exclude: string[]; maxWorkers: number; sequence: { groupOrder: number } } };
const projects = config.test?.projects as unknown as Project[];

it("runs the CPU-bound suites first, alone and on few workers, so their deadlines hold", () => {
  const [heavy, unit] = projects.map(project => project.test);
  expect(heavy).toMatchObject({ name: "heavy", include: heavyTests, sequence: { groupOrder: 0 } });
  expect(heavy.maxWorkers).toBeLessThanOrEqual(8);
  expect(unit).toMatchObject({ name: "unit", sequence: { groupOrder: 1 } });
  expect(unit.exclude).toEqual(expect.arrayContaining(heavyTests));
});

it("leaves packed-SDK consumers to the packaging run", () => {
  for (const project of projects) expect(project.test.exclude).toEqual(expect.arrayContaining(packagingTests));
});
