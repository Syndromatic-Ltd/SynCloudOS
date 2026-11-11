import { useEffect, useState } from "react";
import * as NSE from "../../../../src/NSE/sdkPackageEntry";
import { ContainerPane } from "../../../../src/NSE/Containers/NSEContainers";
import { NSEInputBox } from "../../../../src/NSE/Controls/Fields/NSEFields";
import { NSERoutePickerView } from "../../../../src/NSE/Controls/Media/NSERoutePickerView";
import type { VFXRouteDetector } from "../../../../src/FX/VideoFX/VFXRouteDetector";
import { NSEPageController } from "../../../../src/NSE/Page/NSEPageController";
import { createRuntimeWebContentSessionManager } from "../../../../src/SynCloudOS/WebContent/WebContentSessionManager";
import { createBrowserRuntimeEnvironment } from "../../../../src/SynCloudOS/PlatformAdapters/BrowserRuntimeEnvironment";
import type { RuntimeWebContentSession } from "../../../../src/SynCloudOS/WebContent/webContentTypes";
import type { ThemeBaselineSurface } from "./catalogue";

const noop = () => undefined;
const detector: VFXRouteDetector = { capabilities: { remotePlayback: false }, areRoutesAvailable: false, connectionState: "disconnected", authorizationStatus: () => "unavailable", requestAuthorization: () => "unavailable", startDiscovery: async () => undefined, stopDiscovery: noop, prompt: async () => undefined, subscribe: () => noop, dispose: noop };
class PrintedPage extends NSE.NSEViewController { static override view = () => <NSE.NSETextField isEditable={false}>Printed document content</NSE.NSETextField>; }
class Pages extends NSEPageController<string> { override viewControllerForIdentifier(identifier: string) { return this.addChild(PrintedPage, { title: identifier }); } }
function PageSurface({ transitionStyle }: { transitionStyle: "stackHistory" | "horizontalStrip" | "pageCurl" }) {
  const [controller] = useState(() => { const pages = new Pages({ owner: NSE.nseUnowned, transitionStyle }); pages.arrangedObjects = ["First page", "Second page"]; return pages; });
  useEffect(() => () => controller.dispose(), [controller]);
  return <div style={{ height: 300 }}><controller.view /></div>;
}
function InputSurface() {
  const [owner] = useState(() => NSE.createUndoableNSETextOwner({ flowId: "baseline-input", content: NSE.attributedContent([NSE.paragraph([NSE.textRun("Input document")])]) }));
  const [session] = useState(() => new NSE.TextEditingSession({ id: "baseline-input", textOwner: owner, history: owner.history }));
  const [client] = useState(() => new NSE.NSETextInputClient({ session }));
  useEffect(() => () => { client.dispose(); session.dispose(); owner.dispose(); }, [client, session, owner]);
  return <NSE.NSETextInputHost client={client} label="Custom text input"><p>Input document</p></NSE.NSETextInputHost>;
}
function WebSurface() {
  const [session, setSession] = useState<RuntimeWebContentSession | null>(null);
  useEffect(() => {
    const owner = new AbortController();
    const environment = createBrowserRuntimeEnvironment();
    const manager = createRuntimeWebContentSessionManager({ runtimeId: "baseline-web", signal: owner.signal, baseURL: location.href,
      randomUUID: () => crypto.randomUUID(), adapterLease: environment.webContent!.acquire("baseline-web", owner.signal), authorisation: { authorise: () => true } });
    void manager.createSession({ appId: "com.example.baseline", applicationSessionId: "baseline", ownerId: "baseline", title: "Embedded document", source: { kind: "html", html: "<p>Embedded document content</p>" }, decodeMessage: value => ({ ok: true, value }) }).then(value => { if (!owner.signal.aborted) setSession(value); });
    return () => { owner.abort(); manager.dispose(); };
  }, []);
  return session ? <NSE.NSEWebView session={session} /> : null;
}
export function remainingThemeBaselineCatalogue(): ThemeBaselineSurface[] {
  return [
    { id: "route-picker", render: () => <NSERoutePickerView routeDetector={detector} /> },
    { id: "table-cell-view", render: () => <NSE.NSETableCellView primary="Report" secondary="Today" badge="3" accessory={<span>Details</span>} /> },
    { id: "text-input-host", render: () => <InputSurface /> },
    { id: "web-view", render: () => <WebSurface />, ready: '[data-nse-web-content-state="ready"]' },
    ...["stackHistory", "horizontalStrip", "pageCurl"].map(transitionStyle => ({ id: `page-controller-${transitionStyle}`, render: () => <PageSurface transitionStyle={transitionStyle as "stackHistory" | "horizontalStrip" | "pageCurl"} /> })),
    ...["plain", "surface", "sidebar", "inspector", "floating"].map(variant => ({ id: `container-pane-${variant}`, render: () => <ContainerPane title="Options" variant={variant as "plain" | "surface" | "sidebar" | "inspector" | "floating"}><p>Pane content</p></ContainerPane> })),
    { id: "input-box", render: () => <NSEInputBox label="Export"><input aria-label="Export text" defaultValue="SynCloudOS" /></NSEInputBox> },
    { id: "stack-item", render: () => <NSE.NSEStackView><NSE.NSEStackItem id="baseline-item"><NSE.NSEButton title="Stack item" /></NSE.NSEStackItem></NSE.NSEStackView> },
  ];
}

