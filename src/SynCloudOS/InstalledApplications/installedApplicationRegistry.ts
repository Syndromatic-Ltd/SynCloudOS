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

import type { InstalledApplicationSnapshot } from "./installedApplicationTypes";
export interface InstalledApplicationClient {
  getSnapshot(): InstalledApplicationSnapshot;
  subscribe(listener: () => void): () => void;
  install(): Promise<"accepted" | "dismissed" | "unavailable">;
}
const clients = new WeakMap<Document, InstalledApplicationClient>();
export function installedApplicationForDocument(document: Document | null): InstalledApplicationClient | undefined { return document ? clients.get(document) : undefined; }
export function bindInstalledApplication(document: Document, client: InstalledApplicationClient): () => void {
  clients.set(document, client);
  return () => { if (clients.get(document) === client) clients.delete(document); };
}
