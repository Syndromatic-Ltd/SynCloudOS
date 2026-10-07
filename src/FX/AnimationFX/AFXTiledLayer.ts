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

import { AFXLayer, type AFXFrameScheduler, type AFXLayerSurface } from "./AFXLayer";
import type { AFXTileContent, AFXTiledContent } from "./AFXLayerContent";
import { intersectRects, normaliseRect, normaliseSize, type GFXRect, type GFXSize } from "../GraphicsFX/GFXGeometry";
import { GFXImage } from "../GraphicsFX/GFXImage";
import { IFXContext } from "../ImageFX/IFXContext";
import { IFXImage } from "../ImageFX/IFXImage";
import { IFXRenderDestination } from "../ImageFX/IFXRenderDestination";
import { finiteExtent } from "../ImageFX/extent";

export interface AFXTileRenderRequest {
  readonly rect: GFXRect;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  readonly scale: number;
  readonly level: number;
  readonly generation: number;
}

/** Drawing delegate for a visible CATiledLayer-style tile. */
export type AFXTileDraw = (
  request: AFXTileRenderRequest,
  signal: AbortSignal,
) => GFXImage | IFXImage | Promise<GFXImage | IFXImage>;

type TileSpec = Readonly<AFXTileRenderRequest & { key: string; version: number }>;
type CachedTile = Readonly<Omit<AFXTileContent, "fadeDuration"> & { bytes: number; used: number }>;
type PendingTile = { controller: AbortController; spec: TileSpec };
type IdleWaiter = { resolve: () => void; reject: (error: unknown) => void };
const MAX_VISIBLE_TILES = 256;
const MAX_TILE_DIMENSION = 4096;
const MAX_TILE_PIXELS = 4 * 1024 * 1024;
const MAX_CONCURRENT = 4;
const finite = (value: number, label: string, minimum: number, maximum: number) => {
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw new RangeError(`${label} is outside its finite range.`);
  return value;
};

/** Visible-region tiled projection with bounded asynchronous GFX/IFX rendering. */
export class AFXTiledLayer extends AFXLayer {
  readonly #scheduler: AFXFrameScheduler;
  #drawTile: AFXTileDraw | null = null;
  #tileImageContext: IFXContext | null = null;
  #activeDraws = 0;
  #tileSize: GFXSize = normaliseSize({ width: 256, height: 256 });
  #levelsOfDetail = 1;
  #levelsOfDetailBias = 0;
  #contentsScale = 1;
  #fadeDuration = 0.25;
  #maximumCacheBytes = 32 * 1024 * 1024;
  #visible: GFXRect | null = null;
  #zoomScale = 1;
  #currentLevel = 0;
  #generation = 0;
  #versions = new Map<string, number>();
  #cache = new Map<string, CachedTile>();
  #cacheBytes = 0;
  #used = 0;
  #queue: TileSpec[] = [];
  #pending = new Map<string, PendingTile>();
  #cancelFrame: (() => void) | null = null;
  #releaseState: (() => void) | null = null;
  #waiters = new Set<IdleWaiter>();
  #lastError: unknown = null;
  #disposed = false;

  constructor(surface: AFXLayerSurface, scheduler: AFXFrameScheduler, options: Readonly<{ signal?: AbortSignal }> = {}) {
    super(surface, scheduler, options);
    this.#scheduler = scheduler;
    let pendingRelease: (() => void) | null = null;
    try {
      this.setLayerContent(this.#content([]));
      if (options.signal?.aborted || this.#disposed)
        throw new DOMException("Tiled layer owner aborted during construction.", "AbortError");
      pendingRelease = scheduler.subscribeState?.(() => this.#stateChanged()) ?? null;
      if (options.signal?.aborted || this.#disposed) {
        try { pendingRelease?.(); } catch {}
        pendingRelease = null;
        throw new DOMException("Tiled layer owner aborted during construction.", "AbortError");
      }
      this.#releaseState = pendingRelease;
      pendingRelease = null;
    } catch (error) {
      try { pendingRelease?.(); } catch {}
      if (!this.#disposed) {
        this.#disposed = true;
        try { super.dispose(); } catch {}
      }
      throw error;
    }
  }
  #assertLive() { if (this.#disposed) throw new Error("Tiled layer is disposed."); }
  #content(tiles: readonly AFXTileContent[]): AFXTiledContent {
    return Object.freeze({ kind: "tiled", tiles: Object.freeze([...tiles]) });
  }
  #level() {
    const raw = Math.round(Math.log2(this.#zoomScale));
    return Math.max(-(this.#levelsOfDetail - 1), Math.min(this.#levelsOfDetailBias, raw));
  }
  #visibleSpecs(): TileSpec[] {
    if (!this.#visible) return [];
    const visible = intersectRects(this.#visible, this.bounds);
    if (!visible || visible.width === 0 || visible.height === 0) return [];
    const level = this.#level(), scale = this.#contentsScale * 2 ** level;
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Effective tile scale is invalid.");
    const { width, height } = this.#tileSize;
    const firstX = Math.floor((visible.x - this.bounds.x) / width);
    const lastX = Math.ceil((visible.x + visible.width - this.bounds.x) / width) - 1;
    const firstY = Math.floor((visible.y - this.bounds.y) / height);
    const lastY = Math.ceil((visible.y + visible.height - this.bounds.y) / height) - 1;
    const count = (lastX - firstX + 1) * (lastY - firstY + 1);
    if (!Number.isSafeInteger(count) || count > MAX_VISIBLE_TILES)
      throw new RangeError(`Visible tile budget exceeds ${MAX_VISIBLE_TILES} tiles.`);
    const specs: TileSpec[] = [];
    for (let y = firstY; y <= lastY; y++) for (let x = firstX; x <= lastX; x++) {
      const rect = intersectRects({
        x: this.bounds.x + x * width,
        y: this.bounds.y + y * height,
        width,
        height,
      }, this.bounds);
      if (!rect) continue;
      const pixelWidth = Math.ceil(rect.width * scale), pixelHeight = Math.ceil(rect.height * scale);
      if (pixelWidth < 1 || pixelHeight < 1 || pixelWidth > MAX_TILE_DIMENSION || pixelHeight > MAX_TILE_DIMENSION || pixelWidth * pixelHeight > MAX_TILE_PIXELS)
        throw new RangeError("Tile pixel dimensions exceed the render preflight budget.");
      if (pixelWidth * pixelHeight * 4 > this.#maximumCacheBytes)
        throw new RangeError("A visible tile exceeds the configured cache byte budget.");
      const key = `${level}:${x}:${y}`;
      specs.push(Object.freeze({
        key,
        rect: Object.freeze(rect),
        pixelWidth,
        pixelHeight,
        scale,
        level,
        generation: this.#generation,
        version: this.#versions.get(key) ?? 0,
      }));
    }
    const aggregateBytes = specs.reduce((sum, spec) => sum + spec.pixelWidth * spec.pixelHeight * 4, 0);
    if (!Number.isSafeInteger(aggregateBytes) || aggregateBytes > this.#maximumCacheBytes)
      throw new RangeError("Visible tile aggregate working set exceeds the cache byte budget.");
    return specs;
  }
  #cancelScheduled() {
    try { this.#cancelFrame?.(); } catch {}
    this.#cancelFrame = null;
  }
  #cancelPending() {
    for (const pending of this.#pending.values()) pending.controller.abort(new DOMException("Tile request superseded.", "AbortError"));
    this.#pending.clear();
    this.#queue = [];
  }
  #schedule() {
    if (this.#disposed || this.#cancelFrame || this.#scheduler.suspended || !this.#drawTile || !this.#visible) {
      this.#settleIdle();
      return;
    }
    this.#cancelFrame = this.#scheduler.requestFrame(() => {
      this.#cancelFrame = null;
      try { this.#enqueueVisible(); } catch (error) { this.#lastError = error; }
      this.#drain();
    });
  }
  #enqueueVisible() {
    const specs = this.#visibleSpecs();
    this.#currentLevel = this.#level();
    const wanted = new Set(specs.map(({ key }) => key));
    this.#queue = this.#queue.filter(({ key }) => wanted.has(key));
    for (const spec of specs)
      if (!this.#cache.has(spec.key) && !this.#pending.has(spec.key) && !this.#queue.some(({ key }) => key === spec.key))
        this.#queue.push(spec);
    this.#publish();
  }
  #drain() {
    if (this.#scheduler.suspended || !this.#drawTile) { this.#settleIdle(); return; }
    while (this.#activeDraws < MAX_CONCURRENT && this.#queue.length) {
      const spec = this.#queue.shift()!;
      if ((this.#versions.get(spec.key) ?? 0) !== spec.version) continue;
      const controller = new AbortController(), pending = { controller, spec };
      this.#pending.set(spec.key, pending);
      this.#activeDraws++;
      this.#renderTile(spec, controller.signal).then((image) => {
        if (this.#disposed || controller.signal.aborted || this.#pending.get(spec.key) !== pending || spec.generation !== this.#generation || (this.#versions.get(spec.key) ?? 0) !== spec.version) return;
        const bytes = image.bytesPerRow * image.height;
        this.#put(Object.freeze({ key: spec.key, rect: spec.rect, image, scale: spec.scale, level: spec.level, bytes, used: ++this.#used }));
      }, (error) => {
        if (!controller.signal.aborted && !(error instanceof Error && error.name === "AbortError")) this.#lastError = error;
      }).finally(() => {
        this.#activeDraws--;
        if (this.#pending.get(spec.key) === pending) this.#pending.delete(spec.key);
        try { this.#publish(); } catch (error) { this.#lastError ??= error; }
        this.#pruneVersions();
        this.#drain();
      });
    }
    this.#settleIdle();
  }
  async #renderTile(request: AFXTileRenderRequest, signal: AbortSignal): Promise<GFXImage> {
    const draw = this.#drawTile;
    if (!draw) throw new Error("Tiled layer has no drawing callback.");
    const output = await Promise.resolve().then(() => {
      signal.throwIfAborted();
      return draw(request, signal);
    });
    signal.throwIfAborted();
    let image: GFXImage;
    if (output instanceof GFXImage) image = output;
    else if (output instanceof IFXImage) {
      const context = this.#tileImageContext;
      if (!context) throw new TypeError("IFX tile output requires a canonical IFXContext.");
      const destination = new IFXRenderDestination(finiteExtent({
        x: 0, y: 0, width: request.pixelWidth, height: request.pixelHeight,
      }));
      try { image = (await context.render(output, destination, { signal })).image; }
      finally { destination.dispose(); }
    } else throw new TypeError("Tile drawing must return GFXImage or IFXImage.");
    signal.throwIfAborted();
    if (image.width !== request.pixelWidth || image.height !== request.pixelHeight)
      throw new RangeError("Tile pixels must match the requested pixel dimensions.");
    return image;
  }
  #put(tile: CachedTile) {
    const prior = this.#cache.get(tile.key);
    if (prior) this.#cacheBytes -= prior.bytes;
    this.#cache.set(tile.key, tile);
    this.#cacheBytes += tile.bytes;
    this.#trimCache();
  }
  #trimCache() {
    while (this.#cacheBytes > this.#maximumCacheBytes && this.#cache.size) {
      const oldest = [...this.#cache.values()].sort((a, b) => a.used - b.used)[0]!;
      this.#cache.delete(oldest.key);
      this.#cacheBytes -= oldest.bytes;
    }
  }
  #pruneVersions() {
    const live = new Set([
      ...this.#queue.map(({ key }) => key),
      ...this.#pending.keys(),
      ...this.#cache.keys(),
    ]);
    for (const key of this.#versions.keys()) if (!live.has(key)) this.#versions.delete(key);
  }
  #publish() {
    if (this.#disposed) return;
    let current: TileSpec[];
    try { current = this.#visibleSpecs(); } catch (error) { this.#lastError = error; return; }
    const currentTiles = current.flatMap((spec) => {
      const tile = this.#cache.get(spec.key);
      return tile ? [tile] : [];
    });
    const complete = currentTiles.length === current.length;
    const fallback = complete || !this.#visible ? [] : [...this.#cache.values()].filter((tile) => tile.level !== this.#currentLevel && !!intersectRects(tile.rect, this.#visible!));
    const fadeDuration = this.#scheduler.reducedMotion ? 0 : this.#fadeDuration;
    this.setLayerContent(this.#content([...fallback, ...currentTiles].map(({ key, rect, image, scale, level }) => Object.freeze({ key, rect, image, scale, level, fadeDuration }))));
  }
  #settleIdle() {
    if (this.#cancelFrame || this.#queue.length || this.#pending.size) return;
    const waiters = [...this.#waiters];
    this.#waiters.clear();
    const error = this.#lastError;
    this.#lastError = null;
    for (const waiter of waiters) error ? waiter.reject(error) : waiter.resolve();
  }
  #reset(clearCache: boolean) {
    this.#cancelScheduled();
    this.#cancelPending();
    this.#generation++;
    if (clearCache) { this.#cache.clear(); this.#cacheBytes = 0; this.#versions.clear(); }
    else this.#pruneVersions();
    this.#publish();
    this.#schedule();
  }
  #stateChanged() {
    if (this.#disposed) return;
    if (this.#scheduler.suspended) {
      this.#cancelScheduled();
      this.#cancelPending();
      this.#settleIdle();
    } else this.#schedule();
  }

  get drawTile() { return this.#drawTile; }
  set drawTile(value: AFXTileDraw | null) {
    this.#assertLive();
    if (value !== null && typeof value !== "function") throw new TypeError("Tiled layer requires a drawing callback.");
    this.#drawTile = value;
    this.#reset(true);
  }
  get tileImageContext() { return this.#tileImageContext; }
  set tileImageContext(value: IFXContext | null) {
    this.#assertLive();
    if (value !== null && !(value instanceof IFXContext)) throw new TypeError("Tile image context requires IFXContext.");
    this.#tileImageContext = value;
    this.#reset(true);
  }
  get tileSize() { return this.#tileSize; }
  set tileSize(value: GFXSize) {
    const size = normaliseSize(value);
    if (size.width <= 0 || size.height <= 0 || size.width > MAX_TILE_DIMENSION || size.height > MAX_TILE_DIMENSION) throw new RangeError("Tile size is outside its bounded range.");
    this.#assertLive(); this.#tileSize = size; this.#reset(true);
  }
  get levelsOfDetail() { return this.#levelsOfDetail; }
  set levelsOfDetail(value: number) {
    if (!Number.isInteger(value) || value < 1 || value > 16) throw new RangeError("Levels of detail must be from 1 to 16.");
    this.#assertLive(); this.#levelsOfDetail = value; this.#reset(false);
  }
  get levelsOfDetailBias() { return this.#levelsOfDetailBias; }
  set levelsOfDetailBias(value: number) {
    if (!Number.isInteger(value) || value < 0 || value > 8) throw new RangeError("Levels-of-detail bias must be from 0 to 8.");
    this.#assertLive(); this.#levelsOfDetailBias = value; this.#reset(false);
  }
  get contentsScale() { return this.#contentsScale; }
  set contentsScale(value: number) { const next = finite(value, "Contents scale", 0.25, 8); this.#assertLive(); this.#contentsScale = next; this.#reset(true); }
  get fadeDuration() { return this.#fadeDuration; }
  set fadeDuration(value: number) { const next = finite(value, "Tile fade duration", 0, 2); this.#assertLive(); this.#fadeDuration = next; this.#publish(); }
  get maximumCacheBytes() { return this.#maximumCacheBytes; }
  set maximumCacheBytes(value: number) {
    if (!Number.isSafeInteger(value) || value < 1024 * 1024 || value > 64 * 1024 * 1024) throw new RangeError("Tile cache must be from 1 MiB to 64 MiB.");
    this.#assertLive();
    const previous = this.#maximumCacheBytes;
    this.#maximumCacheBytes = value;
    try { this.#visibleSpecs(); } catch (error) { this.#maximumCacheBytes = previous; throw error; }
    this.#trimCache(); this.#publish(); this.#schedule();
  }
  override get bounds() { return super.bounds; }
  override set bounds(value: GFXRect) {
    super.bounds = value;
    this.#reset(true);
  }
  override get frame() { return super.frame; }
  override set frame(value: GFXRect) {
    super.frame = value;
    this.#reset(true);
  }
  setVisibleRect(rect: GFXRect, zoomScale = 1) {
    this.#assertLive();
    const visible = normaliseRect(rect), zoom = finite(zoomScale, "Zoom scale", 1 / 256, 256);
    const previous = this.#visible, previousZoom = this.#zoomScale;
    this.#visible = intersectRects(visible, this.bounds);
    this.#zoomScale = zoom;
    try { this.#visibleSpecs(); } catch (error) { this.#visible = previous; this.#zoomScale = previousZoom; throw error; }
    this.#reset(false);
  }
  invalidate(rect: GFXRect = this.bounds) {
    this.#assertLive();
    const dirty = normaliseRect(rect);
    this.#generation++;
    this.#cancelScheduled();
    this.#queue = this.#queue.filter((spec) => {
      if (!intersectRects(spec.rect, dirty)) return true;
      this.#versions.set(spec.key, spec.version + 1); return false;
    });
    for (const [key, pending] of [...this.#pending]) if (intersectRects(pending.spec.rect, dirty)) {
      this.#versions.set(key, pending.spec.version + 1);
      pending.controller.abort(new DOMException("Dirty tile superseded.", "AbortError"));
      this.#pending.delete(key);
    }
    for (const [key, tile] of [...this.#cache]) if (intersectRects(tile.rect, dirty)) {
      this.#versions.set(key, (this.#versions.get(key) ?? 0) + 1);
      this.#cache.delete(key); this.#cacheBytes -= tile.bytes;
    }
    this.#pruneVersions();
    this.#publish();
    this.#schedule();
  }
  override setNeedsDisplay(rect?: GFXRect) { this.invalidate(rect); }
  waitForIdle(): Promise<void> {
    if (this.#disposed) return Promise.reject(new Error("Tiled layer is disposed."));
    if (!this.#cancelFrame && !this.#queue.length && !this.#pending.size) {
      const error = this.#lastError; this.#lastError = null;
      return error ? Promise.reject(error) : Promise.resolve();
    }
    return new Promise((resolve, reject) => this.#waiters.add({ resolve, reject }));
  }
  get diagnostics() { return Object.freeze({ visibleTiles: this.#visibleSpecs().length, queuedTiles: this.#queue.length, pendingTiles: this.#pending.size, cachedTiles: this.#cache.size, cacheBytes: this.#cacheBytes, trackedVersions: this.#versions.size, level: this.#currentLevel, maximumVisibleTiles: MAX_VISIBLE_TILES, maximumConcurrentRenders: MAX_CONCURRENT }); }
  override dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cancelScheduled(); this.#cancelPending();
    let error: unknown;
    try { this.#releaseState?.(); } catch (caught) { error = caught; }
    this.#releaseState = null;
    this.#cache.clear(); this.#cacheBytes = 0; this.#versions.clear();
    for (const waiter of this.#waiters) waiter.reject(new Error("Tiled layer is disposed."));
    this.#waiters.clear();
    try { super.dispose(); } catch (caught) { error ??= caught; }
    if (error) throw error;
  }
}
