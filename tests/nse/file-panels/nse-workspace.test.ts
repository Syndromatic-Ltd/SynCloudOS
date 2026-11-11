/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
import { describe, expect, it } from "vitest";
import { NSEWorkspace } from "../../../src/NSE/Application/NSEWorkspace";

describe("NSWorkspace icon lookup", () => {
  it("returns shared Atmo image sources for types and filename metadata", () => {
    expect(NSEWorkspace.shared).toBe(NSEWorkspace.shared);
    expect(NSEWorkspace.shared.icon("public.folder")).toContain("folder-ordinary");
    expect(NSEWorkspace.shared.icon("image/png")).toContain("document-generic");
    expect(NSEWorkspace.shared.iconForFile({ name: "Documents", kind: "directory" })).toContain("folder-documents");
    expect(NSEWorkspace.shared.iconForFile({ name: "Downloads", kind: "directory" })).toContain("folder-downloads");
    expect(NSEWorkspace.shared.iconForFile({ name: "Music", kind: "directory" })).toContain("folder-music");
    expect(NSEWorkspace.shared.iconForFile({ name: "Application Support", kind: "directory" })).toContain("folder-documents");
    expect(NSEWorkspace.shared.iconForFile({ name: "Projects", kind: "directory" })).toContain("folder-ordinary");
    expect(NSEWorkspace.shared.iconForFile("/example/report.txt")).toContain("document-generic");
    expect(NSEWorkspace.shared.iconForFile("/example/Downloads/", 24, 1)).toContain("folder-downloads-24.png");
  });
});
