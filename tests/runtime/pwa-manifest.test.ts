import { describe, expect, it } from "vitest";
import { createWebAppManifests } from "../../src/SynCloudOS/InstalledApplications/webAppManifest.mjs";
import { createServiceWorkerSource } from "../../src/SynCloudOS/InstalledApplications/serviceWorker.mjs";

const app = (id: string, path: string, extra = {}) => ({ bundleIdentifier: id, displayName: id, routes: [{ path }], ...extra });
const installation = { scope: "/", startURL: "/", icons: [{ src: "/icon.png", sizes: "512x512", type: "image/png" }] };

describe("declared installation scopes", () => {
  it("makes nothing installable by default", () => {
    expect(createWebAppManifests({ apps: [app("notes", "/notes")] })).toEqual([]);
  });
  it("installs the explicitly declared whole Webspring", () => {
    const result = createWebAppManifests({ shell: app("desktop", "/", { webApp: installation }), apps: [app("notes", "/notes")] });
    expect(result).toHaveLength(1);
    expect(result[0].manifest).toMatchObject({ id: "/", scope: "/", start_url: "/", display: "standalone", display_override: ["window-controls-overlay", "standalone"] });
  });
  it("gives chosen apps independent route scopes and works without Webspring", () => {
    const result = createWebAppManifests({ base: "/product/", apps: [app("notes", "/notes", { webApp: { ...installation, scope: "/notes", startURL: "/notes" } }), app("other", "/other")] });
    expect(result).toHaveLength(1);
    expect(result[0].manifest.scope).toBe("/product/notes");
    expect(result[0].manifest.start_url).toBe("/product/notes");
  });
  it("rejects a chosen app escaping its route or a start URL escaping its scope", () => {
    expect(() => createWebAppManifests({ apps: [app("notes", "/notes", { webApp: installation })] })).toThrow(/route/);
    expect(() => createWebAppManifests({ shell: app("desktop", "/", { webApp: { ...installation, scope: "/desktop/", startURL: "/" } }) })).toThrow(/scope/);
  });
  it("versions one runtime worker using the SDK receipt and site assets", () => {
    const source = createServiceWorkerSource({ receipt: "sdk-123", base: "/", assets: ["/index.html", "/app.js"], manifests: [] });
    expect(source).toContain("sdk-123");
    expect(source).toContain('addEventListener("fetch"');
    expect(source).not.toContain("skipWaiting()");
  });
  it("projects document, protocol, link, shortcut and share declarations", () => {
    const notes = app("notes", "/notes", {
      webApp: { ...installation, scope: "/notes", startURL: "/notes" },
      documentTypes: [{ id: "com.example.note", extensions: ["note"], mimeTypes: ["application/x-note"] }],
      urlTypes: [{ name: "Notes", schemes: ["web+note"] }], linkCapture: { paths: ["/notes"], clientMode: "navigate-existing" },
      shortcutItems: [{ type: "new", title: "New note", url: "/notes/new" }],
      shareTarget: { action: "/notes/share", method: "POST", enctype: "multipart/form-data", params: { text: "text", files: [{ name: "files", accept: [".note"] }] } },
    });
    const manifest = createWebAppManifests({ apps: [notes] })[0].manifest;
    expect(manifest.file_handlers[0]).toMatchObject({ action: "/notes", accept: { "application/x-note": [".note"] } });
    expect(manifest.protocol_handlers[0]).toEqual({ protocol: "web+note", url: "/notes?scos-protocol=%s" });
    expect(manifest.launch_handler).toEqual({ client_mode: "navigate-existing" });
    expect(manifest.shortcuts[0]).toMatchObject({ name: "New note", url: "/notes/new?scos-shortcut=new" });
    expect(manifest.share_target).toEqual(notes.shareTarget);
  });
  it("rejects multiple share receivers on a whole-desktop installation", () => {
    const shareTarget = { action: "/share", method: "GET", params: { text: "text" } };
    expect(() => createWebAppManifests({ shell: app("desktop", "/", { webApp: installation }), apps: [app("one", "/one", { shareTarget }), app("two", "/two", { shareTarget })] })).toThrow(/share target/);
  });
});
