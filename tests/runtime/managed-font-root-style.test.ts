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

import { readFileSync } from "node:fs";
import { parse } from "postcss";
import { expect, it } from "vitest";
it("keeps the host UI role as the root default when runtime CSS loads after early typography",()=>{
  const stylesheet=parse(readFileSync("src/SynCloudOS/styles/runtime.css","utf8"));
  const rootFonts:string[]=[];
  stylesheet.walkRules(rule=>{if(rule.selector!==":root")return;rule.walkDecls("font-family",declaration=>{rootFonts.push(declaration.value);});});
  expect(rootFonts).toEqual(["var(--font-ui, system-ui, sans-serif)"]);
});
