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

import type { SystemStartupPhase } from "../SynCloudOS/RootRuntime";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { Presence, useNSEPresentation } from "../NSE/Animation";
import { LoadingSpinner } from "../NSE/NSE";
import { useWebspringLocale } from "./webspringLocale";
import { useSystemStartupMotion, type SystemStartupMotionPreset } from "./SystemStartupLayer.transitions";

/** One boot-screen part: it rests at its model style and its AnimationFX
 * presentations play over it, entering on mount and exiting with the layer. */
function StartupPart({ className, part, role, motion, style, children }: {
  className: string;
  part: "background" | "decoration" | "loading";
  role: "startup" | "startup-material" | "startup-spotlight" | "startup-spinner";
  motion: SystemStartupMotionPreset;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useNSEPresentation(ref, motion);
  return <div ref={ref} data-nse-control={role === "startup" ? "view" : undefined}
    data-nse-part={part} data-nse-role={role} className={className} style={style}>{children}</div>;
}

// The reveal presentation animates to the material's visible model state.
const revealedMaterial: CSSProperties = { opacity: 1 };

function StartupScreen({ showMaterial }: { showMaterial: boolean }) {
  const { t } = useWebspringLocale();
  const startupMotion = useSystemStartupMotion();
  return (
    <StartupPart className="syncloudos-startup-layer" part="background" role="startup" motion={startupMotion.bootLayer}>
      {showMaterial ? <StartupPart className="syncloudos-startup-material" part="background" role="startup-material" motion={startupMotion.bootMaterialReveal} style={revealedMaterial} /> : null}
      {showMaterial ? <StartupPart className="syncloudos-startup-spotlight" part="decoration" role="startup-spotlight" motion={startupMotion.bootOverlayReveal} /> : null}
      <StartupPart className="syncloudos-startup-spinner" part="loading" role="startup-spinner" motion={startupMotion.bootSpinner}>
        <LoadingSpinner label={t("startup.starting", "Starting SynCloudOS")} variant="dark" />
      </StartupPart>
    </StartupPart>
  );
}

export function SystemStartupLayer({ phase }: { phase: SystemStartupPhase }) {
  // The whole screen leaves once every part's exit has settled.
  return <Presence>{phase !== "complete" ? <StartupScreen showMaterial={phase === "material"} /> : null}</Presence>;
}
