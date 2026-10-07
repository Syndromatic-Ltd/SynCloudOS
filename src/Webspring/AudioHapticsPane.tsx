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

import "./audioHapticsPane.css";
import { useSyncExternalStore } from "react";
import { NSEGroupBox, NSEListItem, NSESlider, NSEToggleButton } from "../NSE/public/controls";
import { useNSEFeedback } from "../NSE/hostComposition";
import { useKernelSynCloudOS, useRuntimeSelector } from "../SynCloudOSReact";
import type { RuntimeSnapshot } from "../SynCloudOS/SynCloudOS";

const volumeDetents = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const selectApps = (snapshot: RuntimeSnapshot) => snapshot.appInfo;

export function AudioHapticsPane({ systemT }: { readonly systemT: (key: string, fallback: string) => string }) {
  const feedback = useNSEFeedback();

  const runtime = useKernelSynCloudOS();
  const settings = useSyncExternalStore(runtime.settings.subscribe, runtime.settings.get, runtime.settings.get);
  const mixer = useSyncExternalStore(runtime.audio.subscribeMixer, runtime.audio.getMixerSnapshot, runtime.audio.getMixerSnapshot);
  const apps = useRuntimeSelector(selectApps);
  const rows = mixer.applications.filter((session) => apps[session.appId]);
  const supportsHaptics = feedback?.isSupported && runtime.settings.supportsVibration();
  const volumeSlider = (label: string, volume: number, change: (value: number) => void) => (
    <NSESlider thumbMaterial="metal" className="audio-mixer-slider" label={<span className="audio-mixer-label"><span>{label}</span><span aria-hidden="true">{Math.round(volume * 100)}%</span></span>} aria-label={label} aria-valuetext={`${Math.round(volume * 100)}%`}
      value={Math.round(volume * 100)} min={0} max={100} step={1} detents={volumeDetents}
      onValueChange={(value) => change(value / 100)} style={{ width: "100%", minWidth: 0 }} />
  );
  return <div className="nse-prefs-section">
    <NSEGroupBox label={systemT("preferences.audio", "Audio")}>
      <NSEListItem tapHighlight={false} trailing={<NSEToggleButton thumbMaterial="metal" checked={settings.soundEnabled}
        onCheckedChange={(value) => runtime.settings.set("soundEnabled", value)} aria-label={systemT("preferences.audioEnabled", "Audio enabled")} />}>
        {systemT("preferences.audioEnabled", "Audio enabled")}
      </NSEListItem>
      <NSEListItem tapHighlight={false}>
        {volumeSlider(systemT("preferences.masterVolume", "Master volume"), mixer.masterVolume, runtime.audio.setMasterVolume)}
      </NSEListItem>
    </NSEGroupBox>
    {rows.length > 0 ? <NSEGroupBox label={systemT("preferences.applications", "Applications")}>
      {rows.map((session) => {
        const app = apps[session.appId];
        return <NSEListItem key={app.id} tapHighlight={false} leading={<img className="nse-prefs-app-icon" src={app.icon.src} alt="" aria-hidden="true" />}>
          {volumeSlider(app.displayName, session.volume, (value) => runtime.audio.setAppVolume(app.id, value))}
        </NSEListItem>;
      })}
    </NSEGroupBox> : null}
    {supportsHaptics ? <NSEGroupBox label={systemT("preferences.haptics", "Haptics")}>
      <NSEListItem tapHighlight={false} trailing={<NSEToggleButton thumbMaterial="metal" checked={settings.vibrationEnabled}
        onCheckedChange={(value) => runtime.settings.set("vibrationEnabled", value)} aria-label={systemT("preferences.hapticsEnabled", "Haptics enabled")} />}>
        {systemT("preferences.hapticsEnabled", "Haptics enabled")}
      </NSEListItem>
    </NSEGroupBox> : null}
  </div>;
}

