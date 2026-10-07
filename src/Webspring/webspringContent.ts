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

import type { WebspringContentSource, WebspringContentSources } from "../SynCloudOS/SynCloudOS";
import type { ContentItem, ContentState, LocalisedText, WebspringContent } from "./webspringTypes";

export type { WebspringContentReadRequest, WebspringContentSource, WebspringContentSources } from "../SynCloudOS/SynCloudOS";
export interface WebspringContentSectionSnapshot { readonly id: string; readonly title: LocalisedText; readonly empty: "hide" | "message"; readonly state: ContentState; }

const unavailable: LocalisedText = Object.freeze({ key: "content.unavailable", fallback: "Content is unavailable." });
const failed: LocalisedText = Object.freeze({ key: "content.error", fallback: "Content could not be loaded." });

function safeRoute(route: string) {
  return route.startsWith("/") && !route.startsWith("//") && !route.includes("\\") && !/^[a-z][a-z0-9+.-]*:/iu.test(route);
}

function safeItem(item: ContentItem, resolveImage?: WebspringContentSource["resolveImage"]): ContentItem | null {
  if (!item || typeof item.id !== "string" || !item.id || typeof item.title !== "string" || !item.title ||
      typeof item.destination?.appId !== "string" || !item.destination.appId ||
      typeof item.destination.route !== "string" || !safeRoute(item.destination.route)) return null;
  const publishedTime = item.publishedAt === undefined ? Number.NEGATIVE_INFINITY : Date.parse(item.publishedAt);
  if (item.publishedAt !== undefined && !Number.isFinite(publishedTime)) return null;
  const imageUrl = item.image && resolveImage ? resolveImage(item.image.url) : null;
  const image = item.image && imageUrl
    ? Object.freeze({ url: imageUrl, alternativeText: String(item.image.alternativeText ?? "") })
    : undefined;
  return Object.freeze({
    id: item.id,
    title: item.title,
    ...(item.excerpt === undefined ? {} : { excerpt: String(item.excerpt) }),
    ...(item.publishedAt === undefined ? {} : { publishedAt: item.publishedAt }),
    ...(image ? { image } : {}),
    destination: Object.freeze({ appId: item.destination.appId, route: item.destination.route }),
  });
}

export class WebspringContentController {
  private generation = 0;
  private active = false;
  private abort: AbortController | null = null;
  private readonly listeners = new Set<() => void>();
  private subscriptions: Array<() => void> = [];
  private snapshot: readonly WebspringContentSectionSnapshot[];

  constructor(private readonly content: Readonly<WebspringContent> | undefined, private readonly sources: WebspringContentSources) {
    this.snapshot = Object.freeze((content?.sections ?? []).map((section) => Object.freeze({
      id: section.id, title: section.title, empty: section.empty,
      state: Object.freeze(sources[section.sourceId] ? { status: "loading" as const } : { status: "unavailable" as const, message: unavailable }),
    })));
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  start() {
    if (this.active) return;
    this.active = true;
    const unique = new Set((this.content?.sections ?? []).map((section) => section.sourceId));
    this.subscriptions = [...unique].flatMap((id) => {
      const subscribe = this.sources[id]?.subscribe;
      return subscribe ? [subscribe(() => { void this.refresh(); })] : [];
    });
    void this.refresh();
  }

  async refresh() {
    if (!this.active) return;
    const generation = ++this.generation;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    const sections = this.content?.sections ?? [];
    this.snapshot = Object.freeze(sections.map((section) => Object.freeze({
      id: section.id, title: section.title, empty: section.empty,
      state: Object.freeze(this.sources[section.sourceId] ? { status: "loading" as const } : { status: "unavailable" as const, message: unavailable }),
    })));
    this.emit();
    const tasks = sections.map(async (section, index): Promise<void> => {
      const source = this.sources[section.sourceId];
      if (!source) return;
      let next: WebspringContentSectionSnapshot;
      try {
        const requestedLimit = Number.isFinite(section.limit) ? Math.trunc(section.limit) : 1;
        const limit = Math.max(1, Math.min(20, requestedLimit));
        const values = await source.read({ limit, signal: abort.signal });
        abort.signal.throwIfAborted();
        const items = values.map((item) => safeItem(item, source.resolveImage)).filter((item): item is ContentItem => item !== null)
          .sort((left, right) => (Date.parse(right.publishedAt ?? "") || 0) - (Date.parse(left.publishedAt ?? "") || 0) || left.id.localeCompare(right.id))
          .slice(0, limit);
        next = Object.freeze({ id: section.id, title: section.title, empty: section.empty, state: Object.freeze({ status: "ready", items: Object.freeze(items) }) });
      } catch (error) {
        if (abort.signal.aborted) return;
        next = Object.freeze({ id: section.id, title: section.title, empty: section.empty, state: Object.freeze({ status: "error", message: failed }) });
      }
      if (!this.active || generation !== this.generation || abort.signal.aborted) return;
      const updated = [...this.snapshot];
      updated[index] = next;
      this.snapshot = Object.freeze(updated);
      this.emit();
    });
    await Promise.allSettled(tasks);
  }

  dispose() {
    this.active = false;
    this.generation += 1;
    this.abort?.abort();
    this.abort = null;
    for (const dispose of this.subscriptions.splice(0)) dispose();
    this.listeners.clear();
  }

  private emit() { for (const listener of [...this.listeners]) listener(); }
}
