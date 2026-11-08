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

import { nfcAdapterFor } from "../../FX/NFCFX/internal/nfcPort";
import { paymentAdapterFor } from "../../FX/PassFX/internal/paymentPort";
import { contactsAdapterFor } from "../../FX/ContactsFX/internal/contactsPort";
import type { SynCloudOSRuntime } from "../Runtime/runtimeInstanceTypes";
import { speechAdapterFor } from "../../FX/SpeechFX/internal/speechPort";
import { networkAdapterFor } from "../../FX/NetworkFX/internal/networkPort";
import { CPFXAlgorithm } from "../../FX/CompressionFX/public";
export interface SystemCapabilityRow { readonly family: string; readonly query: string; readonly value: string }
export async function systemCapabilityReport(runtime: SynCloudOSRuntime): Promise<readonly SystemCapabilityRow[]> {
  const environment = runtime.environment;
  const families: readonly [string, unknown][] = [
    ["AnimationFX", runtime.animations], ["GraphicsFX", null], ["ImageFX", runtime.images], ["TextFX", runtime.textLayout],
    ["AudioFX", environment.speechSynthesis], ["VideoFX", environment.videoPresentation], ["MediaFX", runtime.mediaClock],
    ["HapticsFX", runtime.haptics], ["MotionFX", environment.motion], ["LocationFX", environment.location],
    ["MIDIFX", environment.midi], ["LuminaFX", runtime.lumina], ["NetworkFX", networkAdapterFor(environment)],
    ["BluetoothFX", environment.bluetooth], ["NFCFX", nfcAdapterFor(environment)], ["SpeechFX", speechAdapterFor(environment)],
    ["ContactsFX", contactsAdapterFor(environment)], ["PassFX", paymentAdapterFor(environment)], ["XRFX", environment.xr],
  ];
  const rows = await Promise.all(families.map(async ([family, candidate]): Promise<SystemCapabilityRow> => {
    if (family === "NFCFX") return { family, query: "NFCNDEFReaderSession.readingAvailable", value: String(nfcAdapterFor(environment)?.readingAvailable ?? false) };
    if (family === "PassFX") return { family, query: "PKPaymentAuthorizationController.canMakePayments()", value: String(paymentAdapterFor(environment)?.canMakePayments() ?? false) };
    if (!candidate) return { family, query: "No passive host query", value: "Not reported" };
    const source = candidate as { getCapabilities?(): unknown; capabilities?: unknown };
    try {
      const query = typeof source.getCapabilities === "function" ? "getCapabilities()" : typeof source.capabilities === "function" ? "capabilities()" : source.capabilities !== undefined ? "capabilities" : "No passive host query";
      const value = query === "getCapabilities()" ? source.getCapabilities!() : query === "capabilities()" ? (source.capabilities as () => unknown)() : source.capabilities;
      return { family, query, value: value === undefined ? "Not reported" : JSON.stringify(await value) };
    } catch (error) { return { family, query: "Capability query", value: error instanceof Error ? error.message : String(error) }; }
  }));
  return [...rows, { family: "CompressionFX", query: "Compression.Algorithm", value: JSON.stringify(CPFXAlgorithm) }];
}
