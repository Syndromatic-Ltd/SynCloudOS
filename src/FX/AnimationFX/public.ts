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

export { AFXAnimation } from "./AFXAnimation";
export type { AFXAnimationOptions } from "./AFXAnimation";
export { AFXBasicAnimation } from "./AFXBasicAnimation";
export { AFXKeyframeAnimation } from "./AFXKeyframeAnimation";
export { AFXSpringAnimation } from "./AFXSpringAnimation";
export { AFXTimingFunction } from "./AFXTimingFunction";
export { AFXAnimationGroup } from "./AFXAnimationGroup";
export type {
  AFXSampledAnimation,
  AFXAnimationExecutor,
} from "./AFXAnimationGroup";
export { AFXTransaction } from "./AFXTransaction";
export type {
  AFXAnimatableTarget,
  AFXTransactionOptions,
  AFXTransactionActionContext,
} from "./AFXTransaction";
export {
  normaliseAFXLayerAction,
  normaliseAFXLayerActions,
} from "./AFXLayerActions";
export type {
  AFXLayerAction,
  AFXLayerActionKey,
  AFXLayerActionMap,
} from "./AFXLayerActions";
export { AFXLayer } from "./AFXLayer";
export { AFXRenderer } from "./AFXRenderer";
export type { AFXRendererViewport } from "./AFXRenderer";
export type {
  AFXLayerSnapshot,
  AFXPresentationLayer,
  AFXLayerDelegate,
  AFXContentsGravity,
  AFXAutoresizingMask,
  AFXSublayerInsertionOptions,
} from "./AFXLayer";
export { AFXTransform3D, AFXSingularTransformError } from "./AFXTransform3D";
export type { AFXPoint3D } from "./AFXTransform3D";
export type * from "./animationTypes";
export type { AFXLayerStyle, AFXLayerCorner } from "./AFXLayerStyle";
export { AFXEdgeAntialiasingMask } from './AFXLayerStyle';

export { AFXShapeLayer } from "./AFXShapeLayer";
export { AFXGradientLayer } from "./AFXGradientLayer";
export type {
  AFXLayerContent,
  AFXShaderContent,
  AFXShapeContent,
  AFXGradientContent,
  AFXImageContent,
  AFXVideoLayerContent,
  AFXEmitterContent,
  AFXEmitterParticle,
  AFXTiledContent,
  AFXTileContent,
} from "./AFXLayerContent";

export { AFXTextLayer } from "./AFXTextLayer";
export { AFXReplicatorLayer } from "./AFXReplicatorLayer";
export type {
  AFXReplication,
  AFXReplicaPresentation,
  AFXReplicationProjectionMode,
} from "./AFXReplication";
export { AFXEmitterCell } from "./AFXEmitterCell";
export type { AFXEmitterCellOptions } from "./AFXEmitterCell";
export { AFXEmitterLayer } from "./AFXEmitterLayer";
export { AFXParticleLayer } from './AFXParticleLayer';
export type {
  AFXEmitterShape,
  AFXEmitterMode,
  AFXEmitterProjectionMode,
  AFXEmitterRenderMode,
} from "./AFXEmitterLayer";
export { AFXTiledLayer } from "./AFXTiledLayer";
export type { AFXTileRenderRequest, AFXTileDraw } from "./AFXTiledLayer";
