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

import { createResponsivenessProbe } from "./responsivenessProbe";

const worker = globalThis as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent) => void) | null;
};
const probe = createResponsivenessProbe();
worker.onmessage = ({ data }) => {
  if (!data || typeof data !== "object" || !Number.isInteger(data.epoch)) return;
  if (data.kind === "state" && typeof data.visible === "boolean") probe.reset(data.visible, data.epoch, performance.now());
  else if (data.kind === "pong" && Number.isInteger(data.id)) probe.acknowledge(data.epoch, data.id, performance.now());
};
setInterval(() => { for (const message of probe.tick(performance.now())) worker.postMessage(message); }, 1000);
worker.postMessage({ kind: "ready" });
