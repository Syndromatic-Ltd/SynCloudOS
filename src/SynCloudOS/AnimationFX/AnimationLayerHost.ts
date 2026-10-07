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

import type { AFXLayer } from "../../FX/AnimationFX/AFXLayer";
import type { AFXShapeLayer } from "../../FX/AnimationFX/AFXShapeLayer";
import type { AFXGradientLayer } from "../../FX/AnimationFX/AFXGradientLayer";
import type { AFXTextLayer } from "../../FX/AnimationFX/AFXTextLayer";
import type { AFXReplicatorLayer } from "../../FX/AnimationFX/AFXReplicatorLayer";
import type { AFXEmitterLayer } from "../../FX/AnimationFX/AFXEmitterLayer";
import type { AFXTiledLayer } from "../../FX/AnimationFX/AFXTiledLayer";
import type { AFXRenderer, AFXRendererOptions } from "../../FX/AnimationFX/AFXRenderer";
export interface AnimationLayerKinds { layer: AFXLayer; shape: AFXShapeLayer; gradient: AFXGradientLayer; text: AFXTextLayer; replicator: AFXReplicatorLayer; emitter: AFXEmitterLayer; tiled: AFXTiledLayer; }
/** GPU storage a host renderer holds, reported for runtime resource
 * accounting. Byte counts are estimates from allocated dimensions. */
export interface AnimationRendererResidency {
  /** active: sampled by the current scene or the render target; idle: pooled for reuse. */
  measure(): Iterable<{ readonly key: unknown; readonly bytes: number; readonly state: "active" | "idle" }>;
  /** Releases up to `targetBytes` of idle storage; returns the bytes released. */
  releaseIdle(targetBytes: number): number;
}
export interface AnimationLayerHost {
  bind<K extends keyof AnimationLayerKinds>(kind: K, target: object, signal: AbortSignal): AnimationLayerKinds[K];
  /** `residency`, when given, receives the renderer's GPU residency once it exists. */
  createRenderer(target: object, options: Pick<AFXRendererOptions, "maximumQuads" | "onRenderError">, signal: AbortSignal,
    residency?: (report: AnimationRendererResidency) => void): AFXRenderer;
}
