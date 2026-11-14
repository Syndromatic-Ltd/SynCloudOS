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

// Menu specimens shared by the theme contract catalogue and the Atmo parity fixture: a menu bar, an application menu and a context menu.
import { useEffect, useState } from "react";
import { createSynCloudOS } from "../../../../src/SynCloudOS/Runtime/createSynCloudOS";
import { createBrowserRuntimeEnvironment } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import { SynCloudOSProvider } from "../../../../src/SynCloudOSReact";
import { NSEMenu } from "../../../../src/NSE/Menus/NSEMenu";
import { NSEMenuBar } from "../../../../src/NSE/Menus/NSEMenuBar";
import { ApplicationMenu } from "../../../../src/NSE/Menus/ApplicationMenu";
import { NSEView } from "../../../../src/NSE/Views/NSEView";
import { nseUnowned } from "../../../../src/NSE/Controllers/ownership";

const noop = () => undefined;

export function useSpecimenRuntime(id: string) {
  const [runtime] = useState(() => createSynCloudOS({ id, environment: createBrowserRuntimeEnvironment(), authenticationPolicy: "disabled" }));
  useEffect(() => () => { void runtime.dispose("specimen unmounted"); }, [runtime]);
  return runtime;
}
export function useSpecimenMenu(runtime: ReturnType<typeof useSpecimenRuntime>, items: readonly unknown[]) {
  const [menu] = useState(() => new NSEMenu({ owner: nseUnowned, title: "Main", runtime: { signal: runtime.signal, commands: {
    getPresentationGeneration: () => ({ registryGeneration: runtime.commands.inspect().generation, responderGeneration: runtime.responders.generation }),
    validateMany: runtime.commands.validateMany.bind(runtime.commands), prepareDispatch: runtime.commands.prepareDispatch.bind(runtime.commands), dispatch: runtime.commands.dispatch.bind(runtime.commands),
  } }, items: items as never }));
  useEffect(() => () => menu.dispose(), [menu]);
  return menu;
}
export const specimenFileItems = [
  { title: "File", submenu: [
    { title: "New document", view: () => <span>New document</span> },
    { title: "Recent", submenu: [{ title: "Report", view: () => <span>Report</span> }, { title: "Notes", view: () => <span>Notes</span> }] },
    { isSeparatorItem: true as const },
    { title: "Open…", view: () => <span>Open…</span> },
  ] },
  { title: "Edit", submenu: [{ title: "Undo", view: () => <span>Undo</span> }] },
];

export function SpecimenMenuBar() {
  const runtime = useSpecimenRuntime("specimen-menu-bar");
  const menu = useSpecimenMenu(runtime, specimenFileItems);
  return <SynCloudOSProvider runtime={runtime}><NSEMenuBar menu={menu} /></SynCloudOSProvider>;
}
export function SpecimenApplicationMenu({ open, id = "specimen-app-menu" }: { open: boolean; id?: string }) {
  const runtime = useSpecimenRuntime(id);
  const menu = useSpecimenMenu(runtime, specimenFileItems[0]!.submenu as never);
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  return <SynCloudOSProvider runtime={runtime}>
    <button ref={setAnchor} type="button">Specimen</button>
    <ApplicationMenu model={menu.model} controller={menu} overlay={{ id, parentResponderId: "specimen", placement: "block-end-inline-end" } as never} open={open && anchor !== null} anchor={anchor} title="Specimen" onOpenChange={noop} />
  </SynCloudOSProvider>;
}
export function SpecimenContextMenu() {
  const runtime = useSpecimenRuntime("specimen-context-menu");
  const menu = useSpecimenMenu(runtime, specimenFileItems[0]!.submenu as never);
  return <SynCloudOSProvider runtime={runtime}><NSEView menu={menu} menuOverlay={{ id: "specimen-context-menu", parentResponderId: "specimen" } as never} aria-label="Canvas" data-specimen-context="" style={{ width: 200, height: 120 }}><p>Canvas</p></NSEView></SynCloudOSProvider>;
}
