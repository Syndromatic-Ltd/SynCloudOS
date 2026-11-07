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

import { mountSynCloudOS } from "../../src/SynCloudOSReact/browser";
import { defineWebspring } from "../../src/Webspring/public";
import "../../src/NSE/public/styles.css";

// FX-only pages need a secure localhost document, not a running application host.
// The document/window suites use the actual framework fixture routes and host.
if (location.pathname.startsWith("/__framework-tests/")) {
  const shell = defineWebspring({
    manifest: {
      schemaVersion: 1, bundleIdentifier: "com.example.tests.framework-shell", version: "1.0.0", displayName: "Framework fixtures",
      webspringShell: {
        views: [{ id: "fixture", presentations: ["desktop", "tablet", "mobile"], mode: "persistent" }],
        defaults: { desktop: "fixture", tablet: "fixture", mobile: "fixture" },
        homeRoute: "/", branding: { name: { key: "fixture.name", fallback: "Framework fixtures" } },
      },
    },
    components: { fixture: () => <main>Framework fixtures</main> },
  });
  const host = await mountSynCloudOS({ element: document.getElementById("root")!, shell });
  import.meta.hot?.dispose(() => { void host.dispose("framework fixture reload"); });
}
