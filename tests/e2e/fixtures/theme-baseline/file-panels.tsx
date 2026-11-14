import { useEffect, useState } from "react";
import { NSEOpenPanel, type OpenPanelService, type OpenPanelSession } from "../../../../src/NSE/FilePanels/NSEOpenPanel";
import { OpenPanelContent } from "../../../../src/NSE/FilePanels/NSEOpenPanelContent";
import { NSESavePanel } from "../../../../src/NSE/FilePanels/NSESavePanel";
import type { ThemeBaselineSurface } from "./catalogue";

// Drawing fixtures never invoke the native chooser. Its backend is explicitly cancelled.
const service: OpenPanelService = { open: async () => ({ kind: "cancelled" }), save: async () => ({ kind: "cancelled" }), release() {}, dispose() {} };
const noop = () => undefined;
function OpenPanelSurface({ compact }: { compact: boolean }) {
  const [session] = useState<OpenPanelSession>(() => {
    const signal = new AbortController().signal;
    return { id: "baseline-open", panel: new NSEOpenPanel(), signal, compact, anchor: null,
      canChooseFiles: true, canChooseDirectories: true, allowsMultipleSelection: true, allowedContentTypes: [], directoryURL: null, mediaSources: [], prompt: "Open", message: "Choose a document.",
      accept: async () => undefined, cancel: noop, systemChooser: async () => ({ kind: "cancelled" }),
      host: { service, bridge: { present: async () => "baseline", dismiss: async () => ({ outcome: "closed" }) }, signal, responderId: "baseline",
        isKey: () => true, isSecureContext: () => true, hasTransientUserActivation: () => false, compact: () => compact,
        frame: () => ({ x: 0, y: 0, width: compact ? 362 : 700, height: 560 }), focusedElement: () => null },
    };
  });
  useEffect(() => () => session.panel.dispose(), [session]);
  return <OpenPanelContent session={session} />;
}
export function filePanelThemeBaselineCatalogue(): ThemeBaselineSurface[] {
  return [false, true].flatMap(compact => [
    { id: `open-panel-${compact ? "compact" : "regular"}`, render: () => <OpenPanelSurface compact={compact} /> },
    { id: `save-panel-${compact ? "compact" : "regular"}`, render: () => <NSESavePanel id="baseline-save" open anchor={null} compact={compact} parentResponderId="baseline" parentWindowControllerId={null} service={service} request={{ id: "baseline-save", accepts: [], suggestedName: "Report.txt", destination: "handle-or-download", conflictPolicy: "fail-if-exists" }} onOpenChange={noop} />, fullPage: true, ready: '[role="dialog"]' },
  ]);
}
