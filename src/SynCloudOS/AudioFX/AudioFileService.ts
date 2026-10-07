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

import type { AUFXAudioFile } from "../../FX/AudioFX/AUFXAudioFile";
import type { AUFXAudioCodecConfiguration, AUFXAudioCodecNegotiation, AUFXAudioFileCapabilities, AUFXAudioFileExport, AUFXAudioFileExportOptions, AUFXAudioFileOpenRequest, AUFXAudioStreamExport, AUFXAudioStreamExportOptions } from "../../FX/AudioFX/AUFXAudioFile";
export interface RuntimeAudioFilePort {
  capabilities(): AUFXAudioFileCapabilities;
  negotiateCodec(configuration: AUFXAudioCodecConfiguration, signal: AbortSignal): Promise<AUFXAudioCodecNegotiation>;
  openFile(request: AUFXAudioFileOpenRequest, signal: AbortSignal): Promise<AUFXAudioFile>;
  exportFile(file: AUFXAudioFile, signal: AbortSignal, options?: AUFXAudioFileExportOptions): Promise<AUFXAudioFileExport>;
  exportStream(options: AUFXAudioStreamExportOptions, signal: AbortSignal): Promise<AUFXAudioStreamExport>;
}
export class RuntimeAudioFileService {
  readonly #port: RuntimeAudioFilePort;
  readonly #ownedIdentities = new WeakSet<AUFXAudioFile>();
  constructor(port: RuntimeAudioFilePort) { this.#port = port; }
  capabilities() { return this.#port.capabilities(); }
  negotiateCodec(configuration: AUFXAudioCodecConfiguration, signal: AbortSignal) { return this.#port.negotiateCodec(configuration, signal); }
  async openFile(request: AUFXAudioFileOpenRequest, signal: AbortSignal) {
    const file = await this.#port.openFile(request, signal);
    if (this.#ownedIdentities.has(file)) throw new Error("The runtime audio-file identity is already owned.");
    this.#ownedIdentities.add(file);
    const close = file.close.bind(file);
    try { Object.defineProperty(file, "close", { configurable: true, value: () => { try { close(); } finally { this.#ownedIdentities.delete(file); } } }); }
    catch (error) { this.#ownedIdentities.delete(file); close(); throw error; }
    return file;
  }
  exportFile(file: AUFXAudioFile, signal: AbortSignal, options?: AUFXAudioFileExportOptions) { return this.#port.exportFile(file, signal, options); }
  exportStream(options: AUFXAudioStreamExportOptions, signal: AbortSignal) { return this.#port.exportStream(options, signal); }
}
