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

import type { InstalledApplicationConfiguration, InstalledApplicationSnapshot } from "../SynCloudOS";
interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ readonly outcome: "accepted" | "dismissed" }>;
}

/** One adapter per mounted browser host; the worker survives the host's lifetime. */
export class BrowserInstalledApplicationAdapter {
  #prompt: InstallPrompt | null = null;
  #disposed = false;
  #listeners = new Set<() => void>();
  #snapshot: InstalledApplicationSnapshot;
  constructor(readonly browserWindow: Window, readonly browserNavigator: Navigator, readonly configuration: InstalledApplicationConfiguration) {
    this.#snapshot = Object.freeze({ installed: this.isInstalled(), canInstall: false, worker: "idle", persistence: "unrequested", error: null });
  }
  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => { this.#listeners.add(listener); return () => { this.#listeners.delete(listener); }; };
  #set(patch: Partial<InstalledApplicationSnapshot>) {
    if (this.#disposed) return;
    this.#snapshot = Object.freeze({ ...this.#snapshot, ...patch });
    for (const listener of this.#listeners) listener();
  }
  isInstalled(): boolean {
    return this.browserWindow.matchMedia?.("(display-mode: standalone)").matches === true
      || this.browserWindow.matchMedia?.("(display-mode: window-controls-overlay)").matches === true
      || (this.browserNavigator as Navigator & { standalone?: boolean }).standalone === true;
  }
  readonly #beforeInstall = (event: Event) => {
    event.preventDefault(); this.#prompt = event as InstallPrompt; this.#set({ canInstall: true });
  };
  readonly #installed = () => { this.#prompt = null; this.#set({ installed: true, canInstall: false }); void this.#persist(); };
  async #persist() {
    try { this.#set({ persistence: this.browserNavigator.storage?.persist ? await this.browserNavigator.storage.persist() ? "granted" : "refused" : "unsupported" }); }
    catch (error) { this.#set({ persistence: "refused", error: String(error) }); }
  }
  async start(): Promise<void> {
    this.browserWindow.addEventListener("beforeinstallprompt", this.#beforeInstall);
    this.browserWindow.addEventListener("appinstalled", this.#installed);
    if (this.#snapshot.installed) void this.#persist();
    if (!this.browserNavigator.serviceWorker) { this.#set({ worker: "unsupported" }); return; }
    try {
      await this.browserNavigator.serviceWorker.register(`${this.configuration.base}syncloudos-sw.js`, { scope: this.configuration.base, updateViaCache: "none" });
      this.#set({ worker: "registered" });
    } catch (error) { this.#set({ worker: "failed", error: error instanceof Error ? error.message : String(error) }); }
  }
  async install(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (this.#disposed || !this.#prompt) return "unavailable";
    const prompt = this.#prompt; this.#prompt = null; this.#set({ canInstall: false });
    await prompt.prompt(); return (await prompt.userChoice).outcome;
  }
  dispose(): void {
    this.#disposed = true; this.#prompt = null; this.#listeners.clear();
    this.browserWindow.removeEventListener("beforeinstallprompt", this.#beforeInstall);
    this.browserWindow.removeEventListener("appinstalled", this.#installed);
  }
}
