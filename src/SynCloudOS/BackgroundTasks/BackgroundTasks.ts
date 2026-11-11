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

import type { NSEData } from "../../Foundation/NSEData";

/** BackgroundTasks schedules declared, same-origin network work in the system worker. */
export interface BGTaskRequest {
  readonly identifier: string;
  readonly url: string;
  readonly method?: "GET" | "POST" | "PUT" | "DELETE";
  readonly body?: string;
}
export interface BGDownloadTaskRequest {
  readonly identifier: string;
  readonly urls: readonly string[];
  readonly title: string;
  readonly downloadTotal?: number;
}
export interface BGTaskScheduler {
  capabilities(): Promise<{ readonly backgroundSync: boolean; readonly backgroundFetch: boolean }>;
  submit(request: BGTaskRequest): Promise<void>;
  submitDownload(request: BGDownloadTaskRequest): Promise<{ readonly id: string; abort(): Promise<boolean> }>;
  downloadedData(identifier: string, url: string): Promise<{ readonly data: NSEData; readonly mimeType: string } | null>;
  getPendingTaskRequests(): Promise<readonly BGTaskRequest[]>;
  cancel(identifier: string): Promise<void>;
}
