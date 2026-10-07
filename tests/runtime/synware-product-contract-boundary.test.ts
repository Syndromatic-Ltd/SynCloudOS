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

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const sdkEntries = [
  "src/SynCloudOS/AppSDK/index.ts",
  "src/SynCloudOS/AppSDK/sdkPackageEntry.ts",
] as const;
const portfolioContractExports = new Set([
  "portfolioCollectionsContractVersion",
  "portfolioCollectionsPermission",
  "portfolioCollectionsServiceId",
  "portfolioCollectionsServiceToken",
  "portfolioCollectionsServiceVersion",
  "PortfolioCollectionSnapshot",
  "PortfolioCollectionsAccessSnapshot",
  "PortfolioCollectionsClient",
  "PortfolioCollectionsSnapshot",
]);

describe("SynWare product contract ownership", () => {
  const program = ts.createProgram(sdkEntries.map((entry) => resolve(entry)), {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.ReactJSX,
    skipLibCheck: true,
    noEmit: true,
  });
  const checker = program.getTypeChecker();

  it.each(sdkEntries)("keeps Portfolio contracts out of %s, including aliased and transitive exports", (entry) => {
    const source = program.getSourceFile(resolve(entry))!;
    const module = checker.getSymbolAtLocation(source)!;
    const exposed = checker.getExportsOfModule(module).filter((symbol) => {
      const origin = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
      return portfolioContractExports.has(symbol.name) || portfolioContractExports.has(origin.name);
    });

    expect(exposed.map((symbol) => symbol.name).sort()).toEqual([]);
  });

  it("leaves the Portfolio collections contract with its product owner", () => {
    expect(existsSync(resolve("src/SynCloudOS/AppSDK/portfolioCollectionsClientTypes.ts"))).toBe(false);
  });
});
