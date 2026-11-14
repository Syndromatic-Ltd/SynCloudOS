/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */
// Task 14 parity specimens: surfaces the frozen Task 1 catalogue does not draw.
// They are compared by computed style before and after each Atmo port slice;
// they have no reference images.
import { useEffect, useState, type ReactNode } from "react";
import { createSynCloudOS } from "../../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createBrowserRuntimeEnvironment } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { SynCloudOSProvider } from "../../../../src/SynCloudOSReact";
import { createApplicationMenuStore } from "../../../../src/SynCloudOSReact/ApplicationMenuTrigger";
import { ApplicationHostTitlebar } from "../../../../src/SynCloudOSReact/ApplicationHostTitlebar";
import { NSEMenu } from "../../../../src/NSE/Menus/NSEMenu";
import { NSEMenuBar } from "../../../../src/NSE/Menus/NSEMenuBar";
import { NSEApplicationMenu } from "../../../../src/NSE/Menus/NSEApplicationMenu";
import { NSEPopUpButton } from "../../../../src/NSE/Menus/NSEPopUpButton";
import { nseUnowned } from "../../../../src/NSE/Controllers/ownership";
import { NSEDialogSurface } from "../../../../src/NSE/Overlays/NSEDialogSurface";
import { NSEDivider } from "../../../../src/NSE/Controls/Selection/NSEDivider";
import { TopBar } from "../../../../src/NSE/Windows/Chrome/TopBar";
import { NSEMediaCollectionPresenter } from "../../../../src/NSE/MediaPanels/NSEMediaCollectionPresenter";
import { supplementalThemeCatalogue } from "../theme-additional/supplemental";
import { additionalThemeCatalogue } from "../theme-additional/catalogue";

export interface ThemePortParitySurface {
  readonly id: string;
  readonly render: (scheme: "light" | "dark") => ReactNode;
  readonly ready?: string;
  readonly clickSelector?: string;
  readonly hoverSelector?: string;
  readonly viewport?: { readonly width: number; readonly height: number };
}
const noop = () => undefined;

function useRuntime(id: string) {
  const [runtime] = useState(() => createSynCloudOS({ id, environment: createBrowserRuntimeEnvironment(), authenticationPolicy: "disabled" }));
  useEffect(() => () => { void runtime.dispose("parity unmounted"); }, [runtime]);
  return runtime;
}
function useMenu(runtime: ReturnType<typeof useRuntime>, items: readonly unknown[]) {
  const [menu] = useState(() => new NSEMenu({ owner: nseUnowned, title: "Main", runtime: { signal: runtime.signal, commands: {
    getPresentationGeneration: () => ({ registryGeneration: runtime.commands.inspect().generation, responderGeneration: runtime.responders.generation }),
    validateMany: runtime.commands.validateMany.bind(runtime.commands), prepareDispatch: runtime.commands.prepareDispatch.bind(runtime.commands), dispatch: runtime.commands.dispatch.bind(runtime.commands),
  } }, items: items as never }));
  useEffect(() => () => menu.dispose(), [menu]);
  return menu;
}
const fileItems = [
  { title: "File", submenu: [
    { title: "New document", view: () => <span>New document</span> },
    { title: "Recent", submenu: [{ title: "Report", view: () => <span>Report</span> }, { title: "Notes", view: () => <span>Notes</span> }] },
    { isSeparatorItem: true as const },
    { title: "Open…", view: () => <span>Open…</span> },
  ] },
  { title: "Edit", submenu: [{ title: "Undo", view: () => <span>Undo</span> }] },
];

function MenuBarOpen() {
  const runtime = useRuntime("parity-menu-bar");
  const menu = useMenu(runtime, fileItems);
  return <SynCloudOSProvider runtime={runtime}><NSEMenuBar menu={menu} /></SynCloudOSProvider>;
}
function ApplicationMenu({ open }: { open: boolean }) {
  const runtime = useRuntime("parity-app-menu");
  const menu = useMenu(runtime, fileItems[0]!.submenu as never);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return <SynCloudOSProvider runtime={runtime}>
    <button ref={setAnchor} type="button">Parity</button>
    <NSEApplicationMenu model={menu.model} controller={menu} overlay={{ id: "parity-app-menu", parentResponderId: "parity", placement: "block-end-inline-end" } as never} open={open && anchor !== null} anchor={anchor} title="Parity" onOpenChange={noop} />
  </SynCloudOSProvider>;
}
function HostTitlebar({ material, scheme }: { material: "metal" | "cumulus"; scheme: "light" | "dark" }) {
  const runtime = useRuntime(`parity-titlebar-${material}`);
  const [store] = useState(() => createApplicationMenuStore());
  return <SynCloudOSProvider runtime={runtime}><ApplicationHostTitlebar title="Documents" iconSrc={null} material={material} scheme={scheme} menuStore={store} menuLabel="Documents"><p>Body</p></ApplicationHostTitlebar></SynCloudOSProvider>;
}
const media = ["Beach", "Forest", "City"].map((name, index) => ({ id: `m${index}`, providerId: "local", name, kind: "image", mimeType: "image/png", thumbnailUrl: "/assets/webspring/Panel.png" }));

const own: ThemePortParitySurface[] = [
  { id: "menu-bar-file-open", render: () => <MenuBarOpen />, clickSelector: '[role="menubar"] [role="menuitem"]' },
  { id: "menu-bar-submenu-open", render: () => <MenuBarOpen />, clickSelector: '[role="menubar"] [role="menuitem"]', hoverSelector: '[role="menu"] [aria-haspopup]' },
  { id: "application-menu-open", render: () => <ApplicationMenu open />, ready: '[data-nse-application-menu]' },
  { id: "application-menu-submenu", render: () => <ApplicationMenu open />, ready: '[data-nse-application-menu]', hoverSelector: '[data-nse-application-menu] [aria-haspopup]' },
  ...(["metal", "cumulus"] as const).map(material => ({ id: `host-titlebar-${material}`, render: (scheme: "light" | "dark") => <HostTitlebar material={material} scheme={scheme} /> })),
  { id: "topbar-metal-centre", render: () => <TopBar variant="atmoMetal" title="Library" center={<span>Centre</span>} {...({} as Record<string, never>)} /> },
  { id: "dialog-surface", render: () => <NSEDialogSurface title="Dialog"><p>Dialog body</p></NSEDialogSurface> },
  ...(["plain", "soft", "grey", "alpha", "arrow"] as const).map(variant => ({ id: `divider-toggle-${variant}`, render: () => <NSEDivider variant={variant} expanded={false} onToggle={noop} {...({} as Record<string, never>)} /> })),
  { id: "divider-toggle-arrow-expanded", render: () => <NSEDivider variant="arrow" expanded onToggle={noop} {...({} as Record<string, never>)} /> },
  { id: "pop-up-images-open", render: () => <NSEPopUpButton aria-label="Format" items={[{ title: "Picture", value: "p", image: <img alt="" src="/assets/webspring/Panel.png" width={16} height={16} /> }, { title: "Movie", value: "m", image: <span>M</span> }]} defaultValue="p" />, clickSelector: '[data-nse-control="pop-up-button"] button' },
  { id: "media-grid", render: () => <NSEMediaCollectionPresenter items={media as never} selectedIds={new Set(["5:local2:m1"])} selection="multiple" direction="ltr" onSelectionChange={noop} onActivate={noop} /> },
];

export const themePortParityCatalogue: readonly ThemePortParitySurface[] = [
  ...own,
  ...supplementalThemeCatalogue.map(entry => ({ id: `supplemental-${entry.id}`, render: entry.render, ready: entry.ready, clickSelector: entry.activate })),
  ...additionalThemeCatalogue.map(entry => ({ id: `additional-${entry.id}`, render: entry.render })),
];
