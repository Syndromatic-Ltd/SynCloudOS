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

export type VFXHardwareAcceleration = "no-preference" | "prefer-hardware" | "prefer-software";

export interface VFXDecoderConfig {
  readonly codec: string;
  readonly codedWidth: number;
  readonly codedHeight: number;
  readonly hardwareAcceleration: VFXHardwareAcceleration;
  readonly optimizeForLatency: boolean;
}

export type VFXDecoderConfigInput = Readonly<{
  codec: string;
  codedWidth: number;
  codedHeight: number;
  hardwareAcceleration?: VFXHardwareAcceleration;
  optimizeForLatency?: boolean;
}>;

export type VFXDecoderCapability =
  | Readonly<{ supported: true; config: VFXDecoderConfig }>
  | Readonly<{ supported: false; config: VFXDecoderConfig; reason: string }>;

export interface VFXCodecCapabilityProbe {
  queryDecoder(config: VFXDecoderConfig): Promise<Readonly<{
    supported: boolean;
    config?: Partial<VFXDecoderConfig>;
    reason?: string;
  }>>;
}

const HARDWARE_ACCELERATION = new Set<VFXHardwareAcceleration>(["no-preference", "prefer-hardware", "prefer-software"]);

function dimension(value: unknown, name: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0 || Number(value) > 16_384)
    throw new RangeError(`Video decoder ${name} must be a positive safe integer no greater than 16384.`);
  return Number(value);
}

export function normalizeVFXDecoderConfig(input: VFXDecoderConfigInput): VFXDecoderConfig {
  if (!input || typeof input !== "object") throw new TypeError("Video decoder configuration is required.");
  if (typeof input.codec !== "string" || input.codec.trim().length === 0 || input.codec.length > 256)
    throw new TypeError("Video decoder codec must be a nonempty bounded string.");
  const hardwareAcceleration = input.hardwareAcceleration ?? "no-preference";
  if (!HARDWARE_ACCELERATION.has(hardwareAcceleration)) throw new TypeError("Video decoder hardware acceleration preference is invalid.");
  if (input.optimizeForLatency !== undefined && typeof input.optimizeForLatency !== "boolean")
    throw new TypeError("Video decoder optimizeForLatency must be boolean.");
  return Object.freeze({
    codec: input.codec.trim(),
    codedWidth: dimension(input.codedWidth, "width"),
    codedHeight: dimension(input.codedHeight, "height"),
    hardwareAcceleration,
    optimizeForLatency: input.optimizeForLatency ?? false,
  });
}

export class VFXCodecCapabilities {
  static async queryDecoder(input: VFXDecoderConfigInput, probe: VFXCodecCapabilityProbe): Promise<VFXDecoderCapability> {
    if (!probe || typeof probe.queryDecoder !== "function") throw new TypeError("Video decoder capability query requires a probe.");
    const config = normalizeVFXDecoderConfig(input);
    const result = await probe.queryDecoder(config);
    if (!result || typeof result !== "object" || typeof result.supported !== "boolean")
      throw new TypeError("Video decoder capability probe returned an invalid result.");
    const normalized = normalizeVFXDecoderConfig({ ...config, ...(result.config ?? {}) });
    if (result.supported) return Object.freeze({ supported: true as const, config: normalized });
    const reason = typeof result.reason === "string" && result.reason.trim().length > 0 ? result.reason.trim() : "unsupported-configuration";
    return Object.freeze({ supported: false as const, config: normalized, reason });
  }
}