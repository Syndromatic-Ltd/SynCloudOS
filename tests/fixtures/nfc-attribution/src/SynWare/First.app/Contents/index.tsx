import { NSEApplication } from "@syndromatic/syncloudos";
import { NFXNDEFReaderSession, NFXNDEFMessage, NFXNDEFPayload, NFXReaderError, type NFXNDEFReaderSessionDelegate } from "@syndromatic/syncloudos/fx/nfc";
export { NFXNDEFReaderSession, NFXNDEFMessage, NFXNDEFPayload, NFXReaderError };
export async function afterAwait(delegate: NFXNDEFReaderSessionDelegate) { await Promise.resolve(); return new NFXNDEFReaderSession(delegate, null, false); }
export function afterTimer(delegate: NFXNDEFReaderSessionDelegate) { return new Promise<NFXNDEFReaderSession>(resolve => setTimeout(() => resolve(new NFXNDEFReaderSession(delegate, null, false)), 0)); }
export function thirdParty(delegate: NFXNDEFReaderSessionDelegate, callback: (create: () => NFXNDEFReaderSession) => void) { callback(() => new NFXNDEFReaderSession(delegate, null, false)); }
export default class NFCApplication extends NSEApplication {}
