# Managed fonts

The host owns its font resources and named faces. `@syndromatic/syncloudos/typography` is a pure, Node-safe declaration entry: it imports no React, browser enumeration, font parser or site catalogue. Vite generates `@font-face`, semantic role variables and critical head preloads from this declaration, before the application module runs. Preloading and `font-display` reduce loading delays; they do not guarantee a flash-free display.

A minimal website declares Inter once beside its `Resources` directory:

```ts
// src/Typography.ts
import { defineFontDeclaration } from "@syndromatic/syncloudos/typography";

export default defineFontDeclaration({
  resources: { regular: "Resources/Inter-Regular.woff2" },
  families: [{
    id: "inter", label: "Inter", defaultFaceId: "inter.regular",
    fallback: ["system-ui", "sans-serif"],
    faces: [{
      id: "inter.regular", label: "Regular", resource: "regular",
      browserFamily: "Inter", weight: 400, style: "normal",
    }],
  }],
  roles: { ui: { face: "inter.regular", preload: ["inter.regular"] } },
});
```

```ts
// vite.config.ts
synCloudOS({ typography: "src/Typography.ts" });
```

This alone generates early website CSS. The `ui` role sets `--font-ui` and the root `font-family`; descendants inherit it. Other role names produce `--font-<name>` for explicit use in CSS. Resources resolve relative to the declaration module. Absolute nested bases and relative `./` bases in nested HTML are supported. Development changes to declarations, their dependencies and font bytes invalidate the virtual typography module and reload its owning host.

The declaration's filename is your choice: `Typography.ts`, `fonts.ts`, or any other module passed to `synCloudOS({ typography })`. No product-specific name or location is required. Do not maintain a second list of CSS faces or handwritten preloads in HTML.

For an OS host, pass that same declaration and Vite's URLs to the browser composition:

```ts
import { fontDeclaration, fontResourceUrls } from "virtual:syncloudos/typography";

await mountSynCloudOS({
  element, shell,
  fonts: { declaration: fontDeclaration, resourceUrls: fontResourceUrls },
});
```

Declare the virtual module in the site's Vite environment types:

```ts
declare module "virtual:syncloudos/typography" {
  export const fontDeclaration: import("@syndromatic/syncloudos/typography").FontDeclaration;
  export const fontResourceUrls: Readonly<Record<string, string>>;
}
```

Mounted apps obtain the host's manager through AppSDK, without importing shell-private configuration:

```tsx
import { useSynWareFonts } from "@syndromatic/syncloudos/sdk";
import { NSEFontPanel, type NSEFontPanelProps } from "@syndromatic/syncloudos/nse";

function FontPicker(props: Omit<NSEFontPanelProps, "manager">) {
  const { manager } = useSynWareFonts();
  return <NSEFontPanel {...props} manager={manager} />;
}
```

Ordinary module helpers receive the manager explicitly; they cannot call React hooks. Use `getPreset(savedFaceId)` or `getFamily(savedFamilyId)` when resolving document selections. Changing a UI role does not rewrite saved document face IDs.

Every face has a stable ID and a display name. Faces with identical weight/style still require distinct `browserFamily` selectors when their bytes differ. Browser aliases reference face IDs instead of duplicating resource sources:

```ts
aliases: [{ family: "Product UI", faces: ["family.light", "family.medium", "family.bold"] }],
roles: { ui: { family: "Product UI", fallback: ["system-ui", "sans-serif"], preload: ["family.medium"] } },
```

This lets a UI alias cap its strongest face at Bold while the document catalogue still offers Black. Alias collisions at the same weight/style are rejected. Declaration capture rejects duplicate IDs, missing resource/default/role references, unsafe paths/names and accessor data. It freezes an independent copy of its inputs.

Catalogue availability is metadata, not ready glyph data. For byte-backed document layout or output, use the active mount's supported font access:

```ts
import { TFXFontDescriptor, useSynWareFonts } from "@syndromatic/syncloudos/sdk";
const fonts = useSynWareFonts();
const registration = await fonts.loadFace(savedFaceId, new TFXFontDescriptor({ size: 18 }), signal);
// Use registration.font through the existing TextFX/NSE layout contracts.
registration.dispose();
```

Declared bytes load only from URLs registered by the host. Imported faces restore through the host's font library; installed bytes are captured and returned as owned copies. Both paths register through the app's TextFX client, preserving its parser, quotas, readiness reporting and independent registration lifetimes. Caller cancellation cannot revoke peer registrations; unmount cancels pending work and releases mount-owned registrations. Each document consumer remains responsible for disposing the registration it no longer uses.
