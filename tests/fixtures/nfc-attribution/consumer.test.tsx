import { expect, it, vi } from "vitest";
import { createSynWareTestHost } from "@syndromatic/syncloudos/sdk/testing";
import { NFXNDEFReaderSession as BaseSession, type NFXNDEFTag } from "@syndromatic/syncloudos/fx/nfc";
import { NSEData } from "@syndromatic/syncloudos/foundation";
import Application, { afterAwait, afterTimer, thirdParty, NFXNDEFReaderSession, NFXNDEFMessage, NFXNDEFPayload, NFXReaderError } from "./src/SynWare/First.app/Contents/index";
import info from "./src/SynWare/First.app/Contents/Info";
const ticks = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
it("compiled NFC app keeps attribution after await/timer/callback and runs its complete reader/tag flow", async () => {
  const jobs: (() => void)[] = []; vi.stubGlobal("scheduler", { postTask: (job: () => void) => { jobs.push(job); return Promise.resolve(); } }); const flush = () => { while (jobs.length) jobs.shift()!(); };
  const host = createSynWareTestHost({ application: Application, manifest: { schemaVersion: 1, ...info }, document });
  try {
    expect(() => new BaseSession({ readerSessionDidInvalidateWithError() {} })).toThrow(/application bundle/); expect(() => new NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {} })).toThrow(NFXReaderError);
    await host.render(); host.adapters.permissions.allow(); host.adapters.policy.allow(); host.adapters.nfc.allow(); expect("nfc" in host.appContext).toBe(false); expect(NFXNDEFReaderSession.readingAvailable).toBe(true);
    const tags: NFXNDEFTag[] = []; const invalidated = vi.fn(); const delegate = { readerSessionDidInvalidateWithError: invalidated, readerSessionDidDetectTags(_sender: NFXNDEFReaderSession, values: readonly NFXNDEFTag[]) { tags.push(...values); } };
    const first = await afterAwait(delegate), second = await afterTimer(delegate); let third!: NFXNDEFReaderSession; await new Promise<void>(done => queueMicrotask(() => thirdParty(delegate, create => { third = create(); done(); })));
    for (const session of [first, second, third]) {
      expect(session).toBeInstanceOf(BaseSession); expect(session).toBeInstanceOf(NFXNDEFReaderSession); session.begin(); await ticks(); flush(); host.adapters.nfc.emitText("Original"); flush(); const tag = tags.at(-1)!; const connected = vi.fn(); session.connect(tag, connected); await ticks(); flush(); expect(connected).toHaveBeenCalledExactlyOnceWith(null);
      const status = vi.fn(); tag.queryNDEFStatus(status); await ticks(); flush(); expect(status).toHaveBeenCalledWith("readWrite", 4096, null);
      const wrote = vi.fn(); tag.writeNDEF(new NFXNDEFMessage([NFXNDEFPayload.wellKnownTypeTextPayload("Updated", new Intl.Locale("en"))!]), wrote); await ticks(); flush(); expect(wrote).toHaveBeenCalledWith(null);
      const read = vi.fn(); tag.readNDEF(read); await ticks(); flush(); const message = read.mock.calls[0]![0] as NFXNDEFMessage; expect(message).toBeInstanceOf(NFXNDEFMessage); expect(message.records[0]!.payload).toBeInstanceOf(NSEData); expect(message.records[0]!.wellKnownTypeTextPayload()[0]).toBe("Updated");
      const lock = vi.fn(); tag.writeLock(lock); await ticks(); flush(); expect(lock).toHaveBeenCalledWith(null); tag.queryNDEFStatus(status); await ticks(); flush(); expect(status).toHaveBeenLastCalledWith("readOnly", 4096, null); session.invalidate(); await ticks(); flush(); expect(host.adapters.nfc.activeSessionCount()).toBe(0);
    }
    expect(invalidated).toHaveBeenCalledTimes(3);
    const staleRead = vi.fn(); const stale = await afterAwait({ readerSessionDidInvalidateWithError() {}, readerSessionDidDetectNDEFs: staleRead }); stale.begin(); await ticks(); host.adapters.nfc.emitText("Queued"); host.adapters.permissions.deny(); host.adapters.permissions.allow(); flush(); expect(staleRead).not.toHaveBeenCalled(); expect(host.adapters.nfc.activeSessionCount()).toBe(0); expect(() => stale.begin()).toThrow(NFXReaderError);
    const ending = await afterAwait(delegate); ending.begin(); await ticks(); await host.dispose(); flush(); expect(host.adapters.nfc.activeSessionCount()).toBe(0); expect(() => ending.begin()).toThrow(NFXReaderError);
  } finally { await host.dispose(); flush(); vi.unstubAllGlobals(); }
});
it.each(["read", "invalidate"])("native %s denial overrides saved consent through the installed app entry", async boundary => {
  const jobs: (() => void)[] = []; vi.stubGlobal("scheduler", { postTask: (job: () => void) => { jobs.push(job); return Promise.resolve(); } }); const flush = () => { while (jobs.length) jobs.shift()!(); };
  const host = createSynWareTestHost({ application: Application, manifest: { schemaVersion: 1, ...info }, document });
  try {
    await host.render(); host.adapters.permissions.allow(); host.adapters.policy.allow(); host.adapters.nfc.allow(); const tags: NFXNDEFTag[] = []; const completed = vi.fn(); const session = await afterAwait({ readerSessionDidInvalidateWithError: completed, readerSessionDidDetectTags(_sender, values) { tags.push(...values); } }); session.begin(); await ticks(); flush(); host.adapters.nfc.emitText("Granted"); flush(); session.connect(tags[0]!, () => {}); await ticks(); flush();
    host.adapters.nfc.deny(); if (boundary === "read") tags[0]!.readNDEF(completed); else session.invalidate(); await ticks(); host.adapters.nfc.allow(); flush(); expect(completed).not.toHaveBeenCalled(); expect(NFXNDEFReaderSession.readingAvailable).toBe(false); expect(() => new NFXNDEFReaderSession({ readerSessionDidInvalidateWithError() {} }).begin()).toThrow(NFXReaderError); expect(host.adapters.nfc.activeSessionCount()).toBe(0);
  } finally { await host.dispose(); flush(); vi.unstubAllGlobals(); }
});
