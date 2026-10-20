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

import type { GFXPoint, GFXRect } from "../GraphicsFX/GFXGeometry";
import type { GFXImage } from "../GraphicsFX/GFXImage";
import {
  AFXLayer,
  type AFXFrameScheduler,
  type AFXLayerSnapshot,
  type AFXLayerSurface,
} from "./AFXLayer";
import { AFXReplicatorLayer } from "./AFXReplicatorLayer";
import { AFXParticleLayer } from './AFXParticleLayer';
import { createAFXLayer } from "./host";
import { AFXTransform3D } from "./AFXTransform3D";
import { VFXFrame } from "../VideoFX/VFXFrame";
import { batchAFXFrameScheduler } from './AFXFrameBatch';
import type { AFXEmitterParticle } from './AFXLayerContent';
import type { IFXShader } from '../ImageFX/IFXShader';
import type { IFXFilter } from '../ImageFX/IFXFilterRegistry';

export interface AFXRendererColourModulation {
  readonly scale: Readonly<{ r: number; g: number; b: number; a: number }>;
  readonly offset: Readonly<{ r: number; g: number; b: number; a: number }>;
}

export interface AFXRendererMask {
  readonly content: GFXImage;
  readonly uv: GFXRect;
}

export interface AFXRendererQuad {
  /** Semantic owner, independent of the admitted preview or detail surface. */
  readonly layer?: AFXLayer;
  readonly pickable?: boolean;
  readonly content: VFXFrame | GFXImage | IFXShader | null;
  readonly group?: AFXRendererGroup;
  readonly compositingFilter?: IFXFilter<'blend'> | null;
  readonly uv: GFXRect;
  readonly bounds: GFXRect;
  readonly transform: AFXTransform3D;
  readonly opacity: number;
  readonly colourModulation?: AFXRendererColourModulation;
  readonly mask?: AFXRendererMask;
  /** Effective edge flags after the layer's allowsEdgeAntialiasing gate. */
  readonly edgeAntialiasingMask?: number;
}

/** Adapter submission for a bounded, local-coordinate content and sublayer image. */
export interface AFXRendererGroup {
  readonly scene: AFXRendererScene;
  readonly filters: readonly IFXShader[];
}

export interface AFXRendererScene {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio?: number;
  readonly quads: readonly AFXRendererQuad[];
  /** Compact submissions interleaved at their original position in layer order. */
  readonly particleBatches?: readonly AFXRendererParticleBatch[];
}

export interface AFXRendererParticleBatch {
  readonly compositingFilter?: IFXFilter<'blend'> | null;
  readonly beforeQuad: number;
  readonly particles: readonly AFXEmitterParticle[];
  readonly transform: AFXTransform3D;
  readonly opacity: number;
  readonly colourModulation: AFXRendererColourModulation;
  readonly mask?: AFXRendererMask;
}

export interface AFXRendererTarget {
  /** Opt-in instancing; other targets receive equivalent ordinary quads. */
  readonly supportsParticleBatches?: boolean;
  /** Submit one scene synchronously while its content surfaces remain borrowed. */
  render(scene: AFXRendererScene): void | boolean;
  /** Adapter availability. A lost device suspends submission, not layer ownership. */
  readonly available?: boolean;
  /** Request a fresh presentation-tree submission after adapter restoration. */
  subscribeInvalidation?(listener: () => void): () => void;
  setViewport?(viewport: AFXRendererViewport): void;
  dispose(): void;
}

export interface AFXRendererViewport {
  readonly width: number;
  readonly height: number;
  readonly pixelRatio: number;
}

export interface AFXRendererOptions {
  readonly scheduler: AFXFrameScheduler;
  readonly target: AFXRendererTarget;
  readonly width: number;
  readonly height: number;
  readonly signal?: AbortSignal;
  readonly maximumQuads?: number;
  /**
   * Receives an error thrown by a scheduled render, which otherwise escapes as
   * an uncaught error. The renderer stays live; the owner decides whether to
   * change the scene, fall back or dispose. Direct `render()` calls still throw.
   */
  readonly onRenderError?: (error: unknown) => void;
}

class RendererLayerSurface implements AFXLayerSurface {
  constructor(private readonly invalidate: () => void) {}
  #snapshot: AFXLayerSnapshot | null = null;
  readonly supportedProperties = Object.freeze(["frame", "opacity", "transform", "sublayerTransform"]);
  readonly supportedContentKinds = Object.freeze(["video", "image", "emitter", 'shader'] as const);
  readonly supportsFilters = true;
  readonly supportsReplication = true;
  get snapshot(): AFXLayerSnapshot | null { return this.#snapshot; }
  replicationCapability() { return Object.freeze({ projectiveDepth: true }); }
  createSublayerSurface(): AFXLayerSurface { return new RendererLayerSurface(this.invalidate); }
  apply(snapshot: AFXLayerSnapshot): void { this.#snapshot = snapshot; this.invalidate(); }
  attach(): void { this.invalidate(); }
  detach(): void { this.invalidate(); }
  setMask(): void { this.invalidate(); }
  dispose(): void { this.#snapshot = null; }
}

const identity = new AFXTransform3D();
const identityModulation: AFXRendererColourModulation = Object.freeze({
  scale: Object.freeze({ r: 1, g: 1, b: 1, a: 1 }),
  offset: Object.freeze({ r: 0, g: 0, b: 0, a: 0 }),
});
const unitRect: GFXRect = Object.freeze({ x: 0, y: 0, width: 1, height: 1 });

/** Per-layer derived state, reused while its inputs keep their identity. */
interface LayerRecord {
  placement: { parent: AFXTransform3D; local: AFXTransform3D; world: AFXTransform3D;
    sublayer: AFXTransform3D; children: AFXTransform3D | null } | null;
  local: Readonly<{ position: GFXPoint; zPosition: number; transform: AFXTransform3D; anchorPoint: GFXPoint;
    bounds: GFXRect; anchorPointZ: number; value: AFXTransform3D }> | null;
  mask: AFXRendererMask | null;
  /** The last quad published for this layer's own content (not particles). */
  quad: AFXRendererQuad | null;
}

/** Renders a presentation layer tree to a target; source synchronization belongs to the caller. */
export class AFXRenderer {
  readonly layer: AFXLayer;
  readonly #renderer: AFXRendererTarget;
  readonly #scheduler: AFXFrameScheduler;
  #width: number;
  #height: number;
  #pixelRatio = 1;
  readonly #maximumQuads: number;
  readonly #signal: AbortSignal | undefined;
  readonly #onRenderError: ((error: unknown) => void) | undefined;
  readonly #abort = () => this.dispose();
  readonly #unsubscribeTarget: (() => void) | undefined;
  #cancelRender: (() => void) | null = null;
  #ready = false;
  #disposed = false;
  #lastScene: AFXRendererScene | null = null;
  readonly #pickable = new Set<AFXLayer>();
  readonly #ownedLayers = new Set<AFXLayer>();
  readonly #surfaces = new WeakMap<AFXLayer, RendererLayerSurface>();
  readonly #records = new WeakMap<AFXLayer, LayerRecord>();

  constructor(options: AFXRendererOptions) {
    if (options.signal?.aborted) throw new DOMException("Layer renderer owner is aborted.", "AbortError");
    if (!Number.isSafeInteger(options.width) || options.width <= 0 ||
      !Number.isSafeInteger(options.height) || options.height <= 0 ||
      !Number.isSafeInteger(options.maximumQuads ?? 4096) ||
      (options.maximumQuads ?? 4096) < 1 || (options.maximumQuads ?? 4096) > 16384)
      throw new RangeError("Layer renderer dimensions and quad budget must be positive bounded integers.");
    this.#scheduler = batchAFXFrameScheduler(options.scheduler);
    this.#renderer = options.target;
    this.#width = options.width;
    this.#height = options.height;
    this.#maximumQuads = options.maximumQuads ?? 4096;
    this.#signal = options.signal;
    if (options.onRenderError !== undefined && typeof options.onRenderError !== "function")
      throw new TypeError("Layer renderer onRenderError must be a function.");
    this.#onRenderError = options.onRenderError;
    const rootSurface = new RendererLayerSurface(() => this.#invalidate());
    this.layer = createAFXLayer(rootSurface, this.#scheduler);
    this.#surfaces.set(this.layer, rootSurface);
    this.#ready = true;
    this.#unsubscribeTarget = this.#renderer.subscribeInvalidation?.(() => this.#invalidate());
    this.layer.frame = { x: 0, y: 0, width: this.#width, height: this.#height };
    this.#signal?.addEventListener("abort", this.#abort, { once: true });
  }

  get disposed(): boolean { return this.#disposed; }

  makeLayer(parent: AFXLayer | null = this.layer): AFXLayer {
    this.#assertLive();
    if (parent && parent !== this.layer && !this.#isDescendant(parent))
      throw new TypeError("Layer renderer parent must belong to this scene.");
    const surface = new RendererLayerSurface(() => this.#invalidate());
    const layer = createAFXLayer(surface, this.#scheduler);
    this.#surfaces.set(layer, surface);
    this.#ownedLayers.add(layer);
    try { parent?.addSublayer(layer); }
    catch (error) { layer.dispose(); throw error; }
    return layer;
  }

  makeReplicatorLayer(parent: AFXLayer | null = this.layer): AFXReplicatorLayer {
    this.#assertLive();
    if (parent && parent !== this.layer && !this.#isDescendant(parent))
      throw new TypeError("Layer renderer parent must belong to this scene.");
    const surface = new RendererLayerSurface(() => this.#invalidate());
    const layer = createAFXLayer(AFXReplicatorLayer, surface, this.#scheduler);
    this.#surfaces.set(layer, surface);
    this.#ownedLayers.add(layer);
    try { parent?.addSublayer(layer); }
    catch (error) { layer.dispose(); throw error; }
    return layer;
  }

  makeParticleLayer(parent: AFXLayer | null = this.layer): AFXParticleLayer {
    this.#assertLive();
    if (parent && parent !== this.layer && !this.#isDescendant(parent))
      throw new TypeError('Layer renderer parent must belong to this scene.');
    const surface = new RendererLayerSurface(() => this.#invalidate());
    const layer = createAFXLayer(AFXParticleLayer, surface, this.#scheduler);
    this.#surfaces.set(layer, surface); this.#ownedLayers.add(layer);
    try { parent?.addSublayer(layer); }
    catch (error) { layer.dispose(); throw error; }
    return layer;
  }

  setViewport(viewport: AFXRendererViewport): void {
    this.#assertLive();
    const { width, height, pixelRatio } = viewport;
    if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0 ||
      !Number.isFinite(pixelRatio) || pixelRatio <= 0 ||
      !Number.isSafeInteger(Math.round(width * pixelRatio)) ||
      !Number.isSafeInteger(Math.round(height * pixelRatio)))
      throw new RangeError("Layer renderer viewport requires bounded positive CSS and backing dimensions.");
    const prior = { width: this.#width, height: this.#height, pixelRatio: this.#pixelRatio };
    this.#renderer.setViewport?.(viewport);
    try {
      this.#width = width;
      this.#height = height;
      this.#pixelRatio = pixelRatio;
      this.layer.frame = { x: 0, y: 0, width, height };
      this.render();
    } catch (error) {
      this.#cancelPendingRender();
      this.#width = prior.width;
      this.#height = prior.height;
      this.#pixelRatio = prior.pixelRatio;
      this.layer.frame = { x: 0, y: 0, width: prior.width, height: prior.height };
      this.#cancelPendingRender();
      this.#renderer.setViewport?.(prior);
      throw error;
    }
  }

  /** Explicitly opt semantic layers into picking; decoration is excluded by default. */
  setPickable(layer: AFXLayer, eligible: boolean): void {
    this.#assertLive();
    if (layer === this.layer || !this.#isDescendant(layer))
      throw new TypeError("Pickable layer must belong to this layer renderer.");
    if (eligible) this.#pickable.add(layer);
    else this.#pickable.delete(layer);
    this.#invalidate();
  }

  /** Pick only the presentation geometry accepted by the last renderer submission. */
  hitTest(point: GFXPoint): AFXLayer | null {
    this.#assertLive();
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError("Pick point must be finite.");
    if (this.#renderer.available === false) return null;
    const scene = this.#lastScene;
    return scene ? this.#hitScene(scene, point, 1) : null;
  }

  #hitScene(scene: AFXRendererScene, point: GFXPoint, parentOpacity: number): AFXLayer | null {
    if (point.x < 0 || point.y < 0 || point.x > scene.width || point.y > scene.height) return null;
    let result: AFXLayer | null = null;
    let writtenDepth = -Infinity;
    for (const quad of scene.quads) {
      const opacity = parentOpacity * quad.opacity;
      if ((!quad.group && (!quad.pickable || !quad.layer)) || opacity <= 0) continue;
      const m = quad.transform.values, b = quad.bounds, x = point.x, y = point.y;
      const corners = [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height]];
      if (corners.some(([cx, cy]) => m[3] * cx + m[7] * cy + m[15] <= 0)) continue;
      const a = m[0] - x * m[3], c = m[1] - y * m[3];
      const bb = m[4] - x * m[7], d = m[5] - y * m[7];
      const determinant = a * d - bb * c;
      if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) continue;
      const ex = x * m[15] - m[12], ey = y * m[15] - m[13];
      const lx = (ex * d - bb * ey) / determinant, ly = (a * ey - ex * c) / determinant;
      if (lx < b.x || ly < b.y || lx > b.x + b.width || ly > b.y + b.height) continue;
      const w = m[3] * lx + m[7] * ly + m[15];
      if (w <= 0) continue;
      const depth = (m[2] * lx + m[6] * ly + m[14]) / w;
      if (depth < writtenDepth - 1e-9) continue;
      // The group texture maps bounds to a zero-origin local scene. Recurse
      // through that accepted scene rather than consulting the current tree.
      const descendant = quad.group ? this.#hitScene(quad.group.scene, { x: lx - b.x, y: ly - b.y }, opacity) : null;
      const candidate = descendant ?? (quad.pickable ? quad.layer : null);
      if (!candidate) continue;
      result = candidate;
      if (opacity === 1) writtenDepth = depth;
    }
    return result;
  }

  render(): void {
    this.#assertLive();
    this.#cancelRender?.();
    this.#cancelRender = null;
    if (this.#renderer.available === false) { this.#lastScene = null; return; }
    const scene = this.#buildScene();
    // A loss can occur during submission. Never publish picking geometry for
    // a scene that the device did not accept, or retain its borrowed surfaces.
    this.#lastScene = this.#renderer.render(scene) === false ? null : scene;
  }

  #presentationFor(layer: AFXLayer): AFXLayerSnapshot {
    return this.#surfaces.get(layer)?.snapshot ?? layer.presentation;
  }

  #recordFor(layer: AFXLayer): LayerRecord {
    let record = this.#records.get(layer);
    if (!record) {
      record = { placement: null, local: null, mask: null, quad: null };
      this.#records.set(layer, record);
    }
    return record;
  }

  #localTransformFor(record: LayerRecord, snapshot: AFXLayerSnapshot): AFXTransform3D {
    const cached = record.local;
    if (
      cached?.position === snapshot.position &&
      cached.zPosition === snapshot.zPosition &&
      cached.transform === snapshot.transform &&
      cached.anchorPoint === snapshot.anchorPoint &&
      cached.bounds === snapshot.bounds &&
      cached.anchorPointZ === snapshot.anchorPointZ
    ) return cached.value;
    const transform = AFXTransform3D.translation(
      snapshot.position.x,
      snapshot.position.y,
      snapshot.zPosition,
    ).multiply(snapshot.transform).multiply(AFXTransform3D.translation(
      -snapshot.anchorPoint.x * snapshot.bounds.width - snapshot.bounds.x,
      -snapshot.anchorPoint.y * snapshot.bounds.height - snapshot.bounds.y,
      -snapshot.anchorPointZ,
    ));
    record.local = Object.freeze({
      position: snapshot.position,
      zPosition: snapshot.zPosition,
      transform: snapshot.transform,
      anchorPoint: snapshot.anchorPoint,
      bounds: snapshot.bounds,
      anchorPointZ: snapshot.anchorPointZ,
      value: transform,
    });
    return transform;
  }

  #buildScene(): AFXRendererScene {
    let quads: AFXRendererQuad[] = [];
    let particleBatches: AFXRendererParticleBatch[] = [];
    let submittedCount = 0;
    const admit = (count = 1) => {
      submittedCount += count;
      if (submittedCount > this.#maximumQuads) throw new RangeError('Renderer quad budget exceeded.');
    };
    const combineModulation = (
      parent: AFXRendererColourModulation,
      child: AFXRendererColourModulation,
    ): AFXRendererColourModulation => Object.freeze({
      scale: Object.freeze({
        r: parent.scale.r * child.scale.r,
        g: parent.scale.g * child.scale.g,
        b: parent.scale.b * child.scale.b,
        a: parent.scale.a * child.scale.a,
      }),
      offset: Object.freeze({
        r: parent.offset.r * child.scale.r + child.offset.r,
        g: parent.offset.g * child.scale.g + child.offset.g,
        b: parent.offset.b * child.scale.b + child.offset.b,
        a: parent.offset.a * child.scale.a + child.offset.a,
      }),
    });
    const maskFor = (layer: AFXLayer, record: LayerRecord): AFXRendererMask | undefined => {
      const mask = layer.mask;
      if (!mask) return undefined;
      const p = this.#presentationFor(mask);
      if (p.content?.kind !== "image")
        throw new DOMException("Layer renderer masks require image-backed mask content.", "NotSupportedError");
      if (p.bounds.width <= 0 || p.bounds.height <= 0)
        throw new RangeError("Layer renderer masks require positive bounds.");
      const cached = record.mask;
      if (cached?.content === p.content.image && cached.uv === p.contentsRect) return cached;
      return (record.mask = Object.freeze({ content: p.content.image, uv: p.contentsRect }));
    };
    const visit = (
      layer: AFXLayer,
      parentTransform: AFXTransform3D,
      parentOpacity: number,
      modulation: AFXRendererColourModulation,
      isolatedRoot = false,
    ): void => {
      if (layer.hidden) return;
      const p = this.#presentationFor(layer);
      const opacity = isolatedRoot ? 1 : parentOpacity * p.opacity;
      if (opacity <= 0) return;
      const record = this.#recordFor(layer);
      const local = this.#localTransformFor(record, p);
      let placement = record.placement;
      if (!placement || placement.parent !== parentTransform || placement.local !== local) {
        placement = { parent: parentTransform, local, world: parentTransform.multiply(local),
          sublayer: p.sublayerTransform, children: null };
        record.placement = placement;
      }
      const world = isolatedRoot ? AFXTransform3D.translation(-p.bounds.x, -p.bounds.y) : placement.world;
      const compositingFilter = isolatedRoot ? null : p.compositingFilter;
      if (!isolatedRoot && ((p.filters?.length ?? 0) > 0 || (compositingFilter && layer.sublayers.length))) {
        if (p.bounds.width <= 0 || p.bounds.height <= 0)
          throw new RangeError('Filtered layer subtrees require positive bounds.');
        if (p.clipsToBounds)
          throw new DOMException('Layer renderer layer clipping is unsupported.', 'NotSupportedError');
        const outerQuads = quads, outerBatches = particleBatches;
        quads = []; particleBatches = [];
        visit(layer, identity, 1, identityModulation, true);
        const scene = Object.freeze({ width: p.bounds.width, height: p.bounds.height, pixelRatio: this.#pixelRatio,
          quads: Object.freeze(quads), ...(particleBatches.length ? { particleBatches: Object.freeze(particleBatches) } : {}) });
        quads = outerQuads; particleBatches = outerBatches;
        admit();
        quads.push(Object.freeze({ layer, pickable: this.#pickable.has(layer), content: null,
          group: Object.freeze({ scene, filters: p.filters ?? Object.freeze([]) }), compositingFilter,
          uv: unitRect, bounds: p.bounds, transform: world, opacity, colourModulation: modulation,
          mask: maskFor(layer, record), edgeAntialiasingMask: p.style.allowsEdgeAntialiasing ? p.style.edgeAntialiasingMask : 0 }));
        return;
      }
      if (p.content?.kind === 'emitter') {
        if (this.#renderer.supportsParticleBatches) {
          admit(p.content.particles.length);
          particleBatches.push(Object.freeze({ beforeQuad: quads.length, particles: p.content.particles,
            transform: world, opacity, colourModulation: modulation, compositingFilter,
            mask: isolatedRoot ? undefined : maskFor(layer, record) }));
        } else {
        // Particle order is authored by the producer, as with AFXEmitterLayer.
        // Keep it stable for transparent overlap; no per-particle layer traversal.
        for (const particle of p.content.particles) {
          const colour = particle.colour.converting('srgb').components;
          if (colour.a <= 0 || particle.scale <= 0) continue;
          admit();
          const c = Math.cos(particle.rotation) * particle.scale, s = Math.sin(particle.rotation) * particle.scale;
          const local = new AFXTransform3D([c,s,0,0, -s,c,0,0, 0,0,1,0,
            particle.position.x,particle.position.y,particle.zPosition,1]);
          quads.push(Object.freeze({ layer, pickable: false, content: particle.contents, compositingFilter,
            uv: unitRect,
            bounds: Object.freeze({ x: -particle.contents.width / 2, y: -particle.contents.height / 2,
              width: particle.contents.width, height: particle.contents.height }),
            transform: world.multiply(local), opacity: opacity * colour.a,
            colourModulation: combineModulation(modulation, { scale: { ...colour, a: 1 },
              offset: { r: 0, g: 0, b: 0, a: 0 } }), mask: isolatedRoot ? undefined : maskFor(layer, record),
            // Sprites keep all four analytic edges, avoiding the conservative
            // expanded-edge geometry needed by partially disabled layer edges.
            edgeAntialiasingMask: 15 }));
        }
        }
      }
      if (p.content?.kind === "video" || p.content?.kind === "image" || p.content?.kind === 'shader') {
        if (p.contentsGravity !== "resize")
          throw new DOMException("Layer renderer content gravity is unsupported.", "NotSupportedError");
        if (p.contentsCenter.x !== 0 || p.contentsCenter.y !== 0 ||
          p.contentsCenter.width !== 1 || p.contentsCenter.height !== 1)
          throw new DOMException("Layer renderer nine-slice content is unsupported.", "NotSupportedError");
        if (p.clipsToBounds)
          throw new DOMException("Layer renderer layer clipping is unsupported.", "NotSupportedError");
        const content = p.content.kind === "video" ? p.content.video : p.content.kind === 'shader' ? p.content.shader : p.content.image;
        if (!(content instanceof VFXFrame) || !content.closed) {
          admit();
          const pickable = this.#pickable.has(layer), mask = isolatedRoot ? undefined : maskFor(layer, record);
          const edgeAntialiasingMask = p.style.allowsEdgeAntialiasing ? p.style.edgeAntialiasingMask : 0;
          // Quads are immutable and may outlive this frame (picking, targets),
          // so an unchanged layer republishes its previous quad object.
          const prior = record.quad;
          if (prior && prior.content === content && prior.uv === p.contentsRect && prior.bounds === p.bounds &&
            prior.transform === world && prior.opacity === opacity && prior.colourModulation === modulation &&
            prior.mask === mask && prior.pickable === pickable && prior.edgeAntialiasingMask === edgeAntialiasingMask &&
            prior.compositingFilter === compositingFilter)
            quads.push(prior);
          else quads.push(record.quad = Object.freeze({ layer, pickable, content,
            uv: p.contentsRect, bounds: p.bounds, transform: world, opacity,
            colourModulation: modulation, mask, edgeAntialiasingMask, compositingFilter }));
        }
      }
      const children = layer.sublayers;
      if (!children.length) return;
      const replication = p.replication;
      if (!replication) {
        if (isolatedRoot || !placement.children || placement.sublayer !== p.sublayerTransform) {
          placement.sublayer = p.sublayerTransform;
          if (isolatedRoot) {
            const childParent = world.multiply(p.sublayerTransform);
            for (const child of children) visit(child, childParent, opacity, modulation);
            return;
          }
          placement.children = world.multiply(p.sublayerTransform);
        }
        const childParent = placement.children;
        for (let index = 0; index < children.length; index++) visit(children[index]!, childParent, opacity, modulation);
        return;
      }
      const colour = replication.instanceColour.converting("srgb").components;
      let instanceTransform = identity;
      for (let index = 0; index < replication.instanceCount; index++) {
        const state = replication.instances[index];
        const instanceOpacity = state?.opacity ?? 1;
        const aroundBounds = AFXTransform3D.translation(-p.bounds.x, -p.bounds.y)
          .multiply(instanceTransform)
          .multiply(state?.transform ?? identity)
          .multiply(AFXTransform3D.translation(p.bounds.x, p.bounds.y));
        const replicaModulation: AFXRendererColourModulation = Object.freeze({
          scale: Object.freeze({ r: colour.r, g: colour.g, b: colour.b, a: colour.a }),
          offset: Object.freeze({
            r: index * replication.instanceRedOffset,
            g: index * replication.instanceGreenOffset,
            b: index * replication.instanceBlueOffset,
            a: index * replication.instanceAlphaOffset,
          }),
        });
        const childParent = world.multiply(aroundBounds).multiply(p.sublayerTransform);
        const childModulation = combineModulation(modulation, replicaModulation);
        for (let child = 0; child < children.length; child++)
          visit(children[child]!, childParent, opacity * instanceOpacity, childModulation);
        instanceTransform = instanceTransform.multiply(replication.instanceTransform);
      }
    };
    visit(this.layer, identity, 1, identityModulation);
    return Object.freeze({ width: this.#width, height: this.#height, pixelRatio: this.#pixelRatio, quads: Object.freeze(quads),
      ...(particleBatches.length ? { particleBatches: Object.freeze(particleBatches) } : {}) });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#signal?.removeEventListener("abort", this.#abort);
    this.#unsubscribeTarget?.();
    this.#cancelRender?.();
    this.#cancelRender = null;
    this.#lastScene = null;
    this.#pickable.clear();
    try {
      this.layer.dispose();
      for (const layer of this.#ownedLayers) layer.dispose();
      this.#ownedLayers.clear();
    } finally { this.#renderer.dispose(); }
  }

  #invalidate(): void {
    if (!this.#ready || this.#disposed || this.#cancelRender) return;
    this.#cancelRender = this.#scheduler.requestFrame(() => {
      this.#cancelRender = null;
      if (this.#disposed) return;
      if (!this.#onRenderError) { this.render(); return; }
      try { this.render(); }
      catch (error) { this.#onRenderError(error); }
    });
  }

  #cancelPendingRender(): void {
    this.#cancelRender?.();
    this.#cancelRender = null;
  }

  #isDescendant(layer: AFXLayer): boolean {
    let current: AFXLayer | null = layer;
    while (current) {
      if (current === this.layer) return true;
      current = current.superlayer;
    }
    return false;
  }

  #assertLive(): void {
    if (this.#disposed) throw new DOMException("Layer renderer is disposed.", "InvalidStateError");
  }
}
