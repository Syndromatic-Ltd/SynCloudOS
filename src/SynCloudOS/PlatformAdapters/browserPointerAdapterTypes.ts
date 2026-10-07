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

export interface BrowserCursorImageResourceLease {
  readonly resourceId: string;
  readonly source: string;
  readonly byteLength: number;
  readonly intrinsicWidth: number;
  readonly intrinsicHeight: number;
  readonly devicePixelRatio: number;
  release(): void;
}

/** Narrow resource/intrinsic policy authority. It must return only a source
 * already authorised for CSS cursor use; the pointer adapter never fetches or
 * decodes arbitrary URLs itself. */
export interface BrowserCursorImageResourcePort {
  acquireCursorImage(resourceId: string, signal: AbortSignal): Promise<BrowserCursorImageResourceLease>;
}

export interface BrowserPointerObserver<TEntry> {
  observe(target: Element): void;
  unobserve(target: Element): void;
  disconnect(): void;
}

export interface BrowserPointerAdapterPlatform {
  readonly cursorImages?: BrowserCursorImageResourcePort | null;
  createResizeObserver(callback: (entries: readonly ResizeObserverEntry[]) => void): BrowserPointerObserver<ResizeObserverEntry> | null;
  createIntersectionObserver(callback: (entries: readonly IntersectionObserverEntry[]) => void): BrowserPointerObserver<IntersectionObserverEntry> | null;
}
