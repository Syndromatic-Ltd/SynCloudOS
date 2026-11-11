import { createSynCloudOSHostContribution } from "@syndromatic/syncloudos/browser";
import { createDeterministicRuntimeEnvironment } from "@syndromatic/syncloudos/sdk/testing";
import { SCOS as RootSCOS } from "@syndromatic/syncloudos";
import { SCOS, useNFC, useSCOS, type SynWareContextValue } from "@syndromatic/syncloudos/sdk";
import { NFXReaderSession, NFXNDEFReaderSession, NFXNDEFMessage, NFXNDEFPayload, NFXTypeNameFormat, NFXNDEFStatus, NFXReaderError, type NFXNDEFReaderSessionDelegate, type NFXNDEFTag } from "@syndromatic/syncloudos/fx/nfc";
import { NSEData } from "@syndromatic/syncloudos/foundation";
import { DFXQueue } from "@syndromatic/syncloudos/fx/dispatch";
const delegate: NFXNDEFReaderSessionDelegate = { readerSessionDidInvalidateWithError(sender, error) { const typed: NFXNDEFReaderSession = sender; const code: NFXReaderError["code"] = error.code; void [typed, code]; }, readerSessionDidDetectNDEFs(sender, messages) { void [sender, messages]; }, readerSessionDidDetectTags(sender, tags) { const tag: NFXNDEFTag = tags[0]!; sender.connect(tag, error => { void error; }); tag.queryNDEFStatus((status, capacity, error) => { const typed: NFXNDEFStatus = status; void [typed, capacity, error]; }); tag.readNDEF((message, error) => { void [message, error]; }); tag.writeNDEF(new NFXNDEFMessage([]), error => { void error; }); tag.writeLock(error => { void error; }); } };
const session: NFXReaderSession = new NFXNDEFReaderSession(delegate, DFXQueue.main, false); session.begin(); session.invalidate(); const hook: NFXNDEFReaderSession = useNFC(delegate, null, false); void hook;
const empty = NSEData.from(new Uint8Array()); const record = new NFXNDEFPayload(NFXTypeNameFormat.unknown, empty, empty, empty); const message = new NFXNDEFMessage([record]); const size: number = message.length; void size;
const uri: URL | null = NFXNDEFPayload.wellKnownTypeURIPayload(new URL("https://example.com"))!.wellKnownTypeURIPayload(); const text: [string | null, Intl.Locale | null] = NFXNDEFPayload.wellKnownTypeTextPayload("hello", new Intl.Locale("en"))!.wellKnownTypeTextPayload(); void [uri, text];
// @ts-expect-error No browser client survives through SCOS.
useSCOS().nfc;
createSynCloudOSHostContribution("nfc-boundary", "installed-test", environment => {
  // @ts-expect-error No adapter survives through public runtime environments.
  environment.nfc;
  // @ts-expect-error No indexed private transport extraction.
  type Native = typeof environment["nfc"];
  return {};
});
// @ts-expect-error No private adapter survives the public testing graph.
createDeterministicRuntimeEnvironment().environment.nfc;
// @ts-expect-error No public browser descriptor.
new NFXNDEFPayload({ recordType: "text", data: "hello" });
// @ts-expect-error No browser factories.
hook.createReaderSession();
// @ts-expect-error CoreNFC has no authorization API.
hook.getAuthorizationStatus();
// @ts-expect-error No recordType property.
record.recordType;
// @ts-expect-error Delegate is required and queue occupies the Apple positional slot.
new NFXNDEFReaderSession(delegate, false);
// @ts-expect-error Old client export was removed.
import type { NFXNFCClient } from "@syndromatic/syncloudos/fx/nfc";
// @ts-expect-error Old capability object was removed.
import type { NFXCapabilities } from "@syndromatic/syncloudos/fx/nfc";

// @ts-expect-error No SCOS client.
SCOS.nfc;
// @ts-expect-error No root SCOS client.
RootSCOS.nfc;
// @ts-expect-error No indexed context factory extraction.
type ContextNFC = SynWareContextValue["nfc"];
// @ts-expect-error Test controls cannot open native sessions.
createDeterministicRuntimeEnvironment().adapters.nfc.open();
