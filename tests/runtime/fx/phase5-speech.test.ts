import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserSpeechAdapter } from "../../../src/SynCloudOS/PlatformAdapters/BrowserSpeechAdapter";
import { SPFXError } from "../../../src/FX/SpeechFX/public";
const locale = new Intl.Locale("en-GB");
const nativeStart = vi.fn();
const nativeConstruct = vi.fn();
class Recognition {
  constructor() { nativeConstruct(); }
  start() { nativeStart(); }
  stop() {}
  abort() {}
}
function setup() {
  nativeStart.mockClear(); nativeConstruct.mockClear();
  vi.stubGlobal("SpeechRecognition", Recognition); vi.stubGlobal("webkitSpeechRecognition", Recognition);
  // The old adapter receives its original injected implementation too, so the RED
  // proves unwanted capture rather than merely failing an obsolete constructor.
  return Reflect.construct(BrowserSpeechAdapter, [{ isSecureContext: true, browserWindow: { SpeechRecognition: Recognition, webkitSpeechRecognition: Recognition } }]) as BrowserSpeechAdapter;
}
afterEach(() => vi.unstubAllGlobals());
describe("Current Speech browser adapter fails closed without capture", () => {
  it("reports unavailable Speech-only authorization passively", () => {
    const adapter = setup(); expect(adapter.authorizationStatus()).toBe("unavailable"); expect(adapter.isAvailable(locale)).toBe(false); expect(adapter.supportsOnDeviceRecognition(locale)).toBe(false);
    expect(() => adapter.supportedLocales()).toThrow(SPFXError); expect(nativeConstruct).not.toHaveBeenCalled(); expect(nativeStart).not.toHaveBeenCalled();
  });
  it("never constructs or starts native microphone recognition to request authorization", async () => {
    const adapter = setup(); const requested = adapter.requestAuthorization(new AbortController().signal);
    expect(nativeConstruct).not.toHaveBeenCalled(); expect(nativeStart).not.toHaveBeenCalled();
    await expect(requested).resolves.toBe("unavailable"); expect(adapter.authorizationStatus()).toBe("unavailable");
  });
  it("returns unavailable on repeated authorization requests without acquisition", async () => {
    const adapter = setup(); const owner = new AbortController(); const first = adapter.requestAuthorization(owner.signal), second = adapter.requestAuthorization(owner.signal);
    expect(nativeConstruct).not.toHaveBeenCalled(); expect(nativeStart).not.toHaveBeenCalled();
    await expect(first).resolves.toBe("unavailable"); await expect(second).resolves.toBe("unavailable");
  });
  it("honors an ended authorization owner without any native work", async () => {
    const adapter = setup(); const owner = new AbortController(); owner.abort();
    await expect(adapter.requestAuthorization(owner.signal)).rejects.toBeInstanceOf(SPFXError); expect(nativeConstruct).not.toHaveBeenCalled();
  });
  it.each(["buffers", "url"] as const)("rejects %s recognition without microphone work or fabricated segments", source => {
    const adapter = setup(); expect(() => adapter.start({ locale, source, shouldReportPartialResults: true, requiresOnDeviceRecognition: false, taskHint: "unspecified", contextualStrings: [], addsPunctuation: false }, vi.fn(), new AbortController().signal)).toThrow(SPFXError);
    expect(nativeConstruct).not.toHaveBeenCalled(); expect(nativeStart).not.toHaveBeenCalled();
  });
});
