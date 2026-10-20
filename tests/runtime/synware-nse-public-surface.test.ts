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
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

function publicExports(path = resolve("src/NSE/sdkPackageEntry.ts")) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const declarations = source.statements.filter(ts.isExportDeclaration);
  return {
    declarations,
    names: declarations.flatMap((declaration) => declaration.exportClause && ts.isNamedExports(declaration.exportClause)
      ? declaration.exportClause.elements.map((element) => element.name.text)
      : []),
  };
}

describe("SynWare NSE public framework boundary", () => {
  it("exports complete controller, model and control authoring contracts", () => {
    expect(publicExports().names).toEqual(expect.arrayContaining([
      "NSEObjectController", "NSEDictionaryController", "ObjectControllerOptions",
      "DictionaryControllerOptions", "ControllerEditTransaction", "ControllerCommitResult",
      "IndexPath", "IndexSet", "Predicate", "ChangeSet", "SortDescriptor", "TreeNode",
      "NSEControlValidation", "Formatter", "FormatterContext", "FormatterResult",
      "NSEDataViewCellContent", "NSEDataViewCellContentProps",
    ]));
    expect(publicExports(resolve("src/NSE/public/controls.ts")).names).toEqual(expect.arrayContaining([
      "NSEControlValidation", "Formatter", "FormatterContext", "FormatterResult",
    ]));
  });

  it("exports managed controller lifetimes and the lifecycle error contract without its internal record", () => {
    const { names } = publicExports();
    expect(names).toEqual(expect.arrayContaining([
      "useNSEArrayController", "useNSETreeController", "NSEControllerOwnership", "NSEControllerDisposalReason",
      "SynCloudOSLifecycleError", "SynCloudOSLifecycleErrorOptions", "SynCloudOSLifecycleResource",
      "SynCloudOSLifecycleDisposal", "SynCloudOSLifecycleDisposalReason",
    ]));
    for (const internal of ["SynCloudOSLifecycleRecord", "declareSynCloudOSLifecycleSignal", "synCloudOSLifecycleSignalReason", "nseDeferredDisposalMicrotaskScheduler"]) {
      expect(names).not.toContain(internal);
    }
  });

  it("supports Portfolio navigation and popup imports through the public framework entry", () => {
    const { names } = publicExports();
    expect(names).toEqual(expect.arrayContaining([
      "NSEPopup",
      "NSEPopupProps",
      "NSEAdaptiveNavigationController",
      "NSEAdaptiveNavigationControllerOptions",
      "NSENavigationStackController",
      "NSETabBarController",
      "useNSEDeferredDisposal",
      "NSEDisposalScheduler",
      "NSEAnimationDefaults",
      "NSEAnimationEnvironment",
      "NSEAnimationEnvironmentProvider",
      "NSEAnimationEnvironmentProviderProps",
      "useNSEAnimationEnvironment",
    ]));
  });

  it("removes the obsolete animation facade from every NSE public boundary", () => {
    const publicEntry = publicExports();
    const appearanceEntry = publicExports(resolve("src/NSE/public/appearance.ts"));
    for (const forbidden of ["AnimationFX", "useAnimationFX"]) {
      expect(publicEntry.names).not.toContain(forbidden);
      expect(appearanceEntry.names).not.toContain(forbidden);
    }
    expect(readFileSync(resolve("src/NSE/NSE.ts"), "utf8")).not.toMatch(/\bAnimationFX\b/u);
    expect(readFileSync(resolve("src/NSE/public/appearance.ts"), "utf8")).not.toMatch(/\bAnimationFX\b/u);
  });

  it("keeps host machinery and the internal namespace outside the public export contract", () => {
    const { declarations, names } = publicExports();
    expect(declarations.every((declaration) => declaration.exportClause && ts.isNamedExports(declaration.exportClause))).toBe(true);
    for (const forbidden of ["NSE", "WindowManager", "WindowController", "SynWareProvider", "SynWareRuntimeMount", "nseRegistry", "NSEStandardWindowSpecimen", "NSEStandardWindowSpecimenProps", "nseControlVariantCount", "useOptionalNSEWindowSurfaceBridge"]) {
      expect(names).not.toContain(forbidden);
    }
    const controls = publicExports(resolve("src/NSE/public/controls.ts"));
    for (const forbidden of ["SourceListFrameProvider", "SourceListFrameContextValue", "useSourceListFrame"]) {
      expect(controls.names).not.toContain(forbidden);
    }
  });
});
