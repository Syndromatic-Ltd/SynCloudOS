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

import { useRef, type CSSProperties, type ReactNode } from "react";
import { NSEPresence, useNSEPresentation } from "../NSE/Animation";
import { LoadingSpinner } from "../NSE/NSE";
import { useWebspringLocale } from "./webspringLocale";
import { useSystemStartupMotion, type SystemStartupMotionPreset } from "./SystemStartupLayer.transitions";
export type SystemStartupPhase = "booting" | "material" | "complete";

/** One boot-screen part: it rests at its model style and its AnimationFX
 * presentations play over it, entering on mount and exiting with the layer. */
function StartupPart({ className, motion, style, children }: {
  className: string;
  motion: SystemStartupMotionPreset;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useNSEPresentation(ref, motion);
  return <div ref={ref} className={className} style={style}>{children}</div>;
}

// The material's stylesheet opacity is 0 until it is revealed.
const revealedMaterial: CSSProperties = { opacity: 1 };

function StartupScreen({ showMaterial }: { showMaterial: boolean }) {
  const { t } = useWebspringLocale();
  const startupMotion = useSystemStartupMotion();
  return (
    <StartupPart className="syncloudos-startup-layer" motion={startupMotion.bootLayer}>
      {showMaterial ? <StartupPart className="syncloudos-startup-material" motion={startupMotion.bootMaterialReveal} style={revealedMaterial} /> : null}
      {showMaterial ? <StartupPart className="syncloudos-startup-spotlight" motion={startupMotion.bootOverlayReveal} /> : null}
      <StartupPart className="syncloudos-startup-spinner" motion={startupMotion.bootSpinner}>
        <LoadingSpinner label={t("startup.starting", "Starting SynCloudOS")} variant="dark" />
      </StartupPart>
    </StartupPart>
  );
}

export function SystemStartupLayer({ phase }: { phase: SystemStartupPhase }) {
  // The whole screen leaves once every part's exit has settled.
  return <NSEPresence>{phase !== "complete" ? <StartupScreen showMaterial={phase === "material"} /> : null}</NSEPresence>;
}
