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

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { NSEButton } from "../../../src/NSE/Controls/Buttons/NSEButton";
import { NSETopBar } from "../../../src/NSE/Windows/Chrome/NSETopBar";
import "../../../src/NSE/public/styles.css";
import "../../../src/NSE/Appearance/atmo-theme.css";
import "../../../src/SynCloudOS/styles/runtime.css";

function HostTypography() {
  const [family, setFamily] = useState("monospace");
  const [clicks, setClicks] = useState(0);
  const inheritedRole = new URLSearchParams(window.location.search).has("root-role");
  return <main data-nse-theme="com.syndromatic.atmo" style={{ fontFamily: inheritedRole ? undefined : family, maxWidth: 640 }}>
    <NSETopBar title="Host title" variant="atmoMetal" />
    <NSEButton title="Host button" onClick={() => setClicks(value => value + 1)} />
    <button onClick={() => setFamily("serif")}>Change host font</button>
    <output aria-label="Clicks">{clicks}</output>
  </main>;
}
createRoot(document.getElementById("root")!).render(<HostTypography />);
