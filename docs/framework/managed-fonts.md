# Managed fonts

This page explains how a host declares its fonts once and how applications use them. The host owns its font files and named faces. You declare them with `@syndromatic/syncloudos/typography`, a Node-safe entry that imports no React, font parser or browser code. From the declaration, Vite generates the `@font-face` rules, a CSS variable for each role and the preloads in the page head, all before your application module runs. Preloading and `font-display` shorten loading delays, but can't guarantee the text never flashes.

A minimal website declares Inter once, next to its `Resources` directory:

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

That's enough to generate the site's font CSS. The `ui` role sets `--font-ui` and the root `font-family`, which everything inherits. Any other role name produces `--font-<name>` for you to use in CSS. Resource paths are relative to the declaration module, and pages served from nested paths work with both absolute and relative `./` bases. During development, editing the declaration, anything it imports or a font file reloads the host that uses it.

Without a declaration, SynCloudOS ships no font file and the interface uses the platform font (`system-ui`, such as Segoe UI on Windows or San Francisco on Apple systems). The interface never asks for a weight above 700, so a UI role needs faces up to Bold and no heavier. If your UI family has no 700 face, the browser substitutes the nearest heavier one.

You can call the declaration file whatever you like, such as `Typography.ts` or `fonts.ts`, as long as you pass it to `synCloudOS({ typography })`. Don't keep a second list of `@font-face` rules or write preloads into your HTML by hand.

In an OS host, pass the same declaration and Vite's URLs to `mountSynCloudOS`:

```ts
import { fontDeclaration, fontResourceUrls } from "virtual:syncloudos/typography";

await mountSynCloudOS({
  element, shell,
  fonts: fontDeclaration && { declaration: fontDeclaration, resourceUrls: fontResourceUrls },
});
```

Declare the virtual module in your site's Vite environment types. When the plugin has no `typography` option, `fontDeclaration` is `undefined`:

```ts
declare module "virtual:syncloudos/typography" {
  export const fontDeclaration: import("@syndromatic/syncloudos/typography").FontDeclaration | undefined;
  export const fontResourceUrls: Readonly<Record<string, string>>;
}
```

A mounted application gets the host's font manager from the SDK, without importing any host configuration:

```tsx
import { useFonts } from "@syndromatic/syncloudos/sdk";
import { NSEFontPanel, type NSEFontPanelProps } from "@syndromatic/syncloudos/nse";

function FontPicker(props: Omit<NSEFontPanelProps, "manager">) {
  const { manager } = useFonts();
  return <NSEFontPanel {...props} manager={manager} />;
}
```

Plain helper functions can't call React hooks, so pass them the manager. To resolve a font saved in a document, use `manager.getPreset(savedFaceId)` or `manager.getFamily(savedFamilyId)`. Changing a UI role never rewrites the face IDs saved in documents.

Every face has a stable ID and a display name. Two faces with the same weight and style still need different `browserFamily` names if their files differ. An alias groups faces by ID under one CSS family name, without repeating their sources:

```ts
aliases: [{ family: "Product UI", faces: ["family.light", "family.medium", "family.bold"] }],
roles: { ui: { family: "Product UI", fallback: ["system-ui", "sans-serif"], preload: ["family.medium"] } },
```

Here the UI alias stops at Bold while the document catalogue can still offer Black. An alias can't contain two faces with the same weight and style. The declaration is also rejected for duplicate IDs, references to a resource, default face or role that doesn't exist, unsafe paths or names, and getter properties. It keeps a frozen copy of what you pass, so later changes to your objects have no effect.

A face being in the catalogue doesn't mean its glyphs are loaded. When document layout or output needs the font itself, load the face through `loadFace` inside a component:

```ts
import { TFXFontDescriptor, useFonts } from "@syndromatic/syncloudos/sdk";

const fonts = useFonts(); // in a component
const registration = await fonts.loadFace(savedFaceId, new TFXFontDescriptor({ size: 18 }), signal);
// Lay out text with registration.font through TextFX or NSE.
registration.dispose();
```

Declared fonts load only from URLs the host registered. Fonts the user imported come from the host's font library, and you receive your own copy of their bytes. Either way, the face is registered through your application's TextFX client, with its parser, quotas and readiness reporting, and each registration has its own lifetime. Cancelling your request never revokes someone else's registration. Unmounting cancels pending loads and releases the registrations the mount owns, but each document is responsible for disposing the registrations it no longer needs.
