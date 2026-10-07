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

export default {
  schemaVersion: 1,
  id: "com.syncloudos.examples.text-system",
  version: "0.1.0",
  title: "Text System",
  routes: [{ path: "/examples/text-system", primary: true }],
  presentations: ["desktop", "tablet", "mobile"],
  // This private local demo deliberately admits guest launch through the ordinary app policy.
  runtime: { policy: { public: true, requiresLogin: false } },
  documentTypes: [{ id: "com.syncloudos.examples.text-system", displayName: "Text system example", extensions: ["textsystem"] }],
  webspring: { visible: false },
} as const;
