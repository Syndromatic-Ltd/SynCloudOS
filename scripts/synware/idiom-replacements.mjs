/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. All rights reserved.
 * Designed by Kavish Krishnakumar in Manchester.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// One authority for definite raw construct → public replacement diagnostics.
// NSEColor does not exist in this SDK. UI colours come from the neutral
// appearance contract, not GraphicsFX colours or a mandatory concrete theme.
export const IDIOM_REPLACEMENTS = Object.freeze({
  button: { symbol: "NSEButton", entry: "nse" },
  input: { symbol: "NSETextField, NSESearchField, NSESlider, NSEStepper or NSESwitch", entry: "nse" },
  select: { symbol: "NSEPopUpButton or NSESegmentedControl", entry: "nse" },
  textarea: { symbol: "NSETextView", entry: "nse" },
  table: { symbol: "NSETableView", entry: "nse" },
  buttonImage: { symbol: "NSEButton with a text title and its image property set to a bundled image URL (use NSEImage.named for available named system images)", entry: "nse" },
  systemImage: { symbol: "NSEImage.named(NSEImage.goBackTemplateName) or NSEImage.named(NSEImage.goForwardTemplateName)", entry: "nse" },
  uiColour: { symbol: "defineNSEAppearance / NSEAppearanceDefinition and its semantic --nse-* colour values", entry: "nse/appearance" },
  scroll: { symbol: "NSEScrollView", entry: "nse/scroll" },
  preferences: { symbol: "NSEUserDefaults (use a structured preference descriptor; primary documents belong in workspaceDocuments)", entry: "foundation" },
  bluetooth: { symbol: "BTFXCentralManager constructed inside the plugin-compiled application bundle", entry: "fx/bluetooth" },
  nfc: { symbol: "NFXNDEFReaderSession constructed inside the plugin-compiled application bundle", entry: "fx/nfc" },
  geolocation: { symbol: "LFXLocationManager", entry: "fx/location", owner: "this.fx.location" },
  mediaDevices: { symbol: "VFXCaptureSession", entry: "fx/video", owner: "this.fx.video" },
  contacts: { symbol: "CNFXContactPickerViewController constructed inside the plugin-compiled application bundle", entry: "fx/contacts" },
  requestMIDIAccess: { symbol: "MIFXAccess", entry: "fx/midi", owner: "this.fx.midi" },
  xr: { symbol: "XRFXSession constructed inside the plugin-compiled application bundle", entry: "fx/xr" },
  vibrate: { symbol: "HFXHapticSession", entry: "fx/haptics", owner: "this.fx.haptics" },
  speechSynthesis: { symbol: "AUFXSpeechSynthesizer constructed inside the plugin-compiled application bundle", entry: "fx/audio" },
  SpeechRecognition: { symbol: "SPFXSpeechRecognizer constructed inside the plugin-compiled application bundle", entry: "fx/speech" },
  appearance: { symbol: "NSEAppearance inherited from the window, or a deliberate custom NSEAppearance with a documented opt-out", entry: "nse/appearance" },
  eyebrow: { symbol: "NSETextField with the title as its label, using the inherited appearance", entry: "nse" },
});

export function replacementMessage(key) {
  const replacement = IDIOM_REPLACEMENTS[key];
  if (!replacement) throw new Error(`Unknown idiom replacement ${key}.`);
  return `Use ${replacement.symbol} from "@syndromatic/syncloudos/${replacement.entry}"${replacement.owner ? ` through the owner-scoped ${replacement.owner} service` : ""}.`;
}
