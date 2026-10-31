/*
 * SynWare SDK
 * Copyright © 2026 Syndromatic Ltd. All rights reserved.
 *
 * Designed by Kavish Krishnakumar in Manchester.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** Explicit application-authored OS presentation; never inferred from a document or URL.
 * This bounded transport surface does not expose capture, hardware or artwork loading. */
export interface AppPlaybackMetadata {
  readonly title: string;
  readonly artist?: string;
  readonly album?: string;
}
export type AppPlaybackAction = "play" | "pause" | "stop" | "seekto" | "seekbackward" | "seekforward";
export interface AppPlaybackPresentationRequest {
  readonly metadata: AppPlaybackMetadata;
  /** Existing application commands. Seek commands receive a mounted payload
   * {time: seconds}. Play commands must use the usual scoped activation path. */
  readonly commands: Readonly<Partial<Record<AppPlaybackAction, string>>>;
}
export interface AppPlaybackPresentationSnapshot {
  readonly state: "active" | "deferred" | "unsupported" | "failed" | "released";
  readonly actions: readonly AppPlaybackAction[];
  readonly lastAction: "none" | "pending" | "completed" | "refused" | "failed" | "cancelled";
  readonly errorName: string | null;
}
export interface AppPlaybackPresentationLease {
  getSnapshot(): AppPlaybackPresentationSnapshot;
  subscribe(listener: () => void): () => void;
  updateMetadata(metadata: AppPlaybackMetadata): void;
  dispose(): void;
}
export interface AppScreenWakeSnapshot {
  readonly state: "requesting" | "held" | "releasing" | "released" | "revoked" | "unsupported" | "deferred" | "failed";
  readonly reason: "requested" | "not-foreground" | "hidden" | "owner-ended" | "account-changed" | "caller-ended" | "explicit" | "browser-released" | "request-failed" | "release-failed" | "unavailable";
  readonly errorName: string | null;
}
export interface AppScreenWakeLease {
  getSnapshot(): AppScreenWakeSnapshot;
  subscribe(listener: () => void): () => void;
  /** Also fences a pending acquisition. It may remain releasing until the
   * browser settles; late sentinels are released rather than published. */
  release(): Promise<void>;
}
export interface AppScreenWakeClient {
  /** Call from an explicit user/application action. No acquisition occurs at
   * construction, playback start, visibility return or subscription. */
  request(reason: string, signal?: AbortSignal): AppScreenWakeLease;
}
