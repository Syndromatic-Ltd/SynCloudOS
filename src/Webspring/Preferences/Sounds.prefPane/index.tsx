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

import { NSEToggleButton } from "../../../NSE/public/controls";
import { definePreferencePane, type PreferencePaneViewProps } from "../../../SynCloudOS/Preferences";
import { useKernelSynCloudOS } from "../../../SynCloudOSReact";
import { useSystemText } from "../useSystemText";
import { AudioHapticsPane } from "./AudioHapticsPane";

function SoundsSummary({ settings }: PreferencePaneViewProps) {
  const t = useSystemText();
  return <>{settings.soundEnabled ? t("preferences.on", "On") : t("preferences.off", "Off")}</>;
}

// Same master switch as Notifications: the commonest thing anyone wants from
// this pane is silence, and it should not need a trip inside.
function SoundsSwitch({ settings }: PreferencePaneViewProps) {
  const runtime = useKernelSynCloudOS();
  const t = useSystemText();
  return (
    <NSEToggleButton
      checked={settings.soundEnabled}
      onCheckedChange={(value) => runtime.settings.set("soundEnabled", value)}
      aria-label={t("preferences.audioEnabled", "Audio enabled")}
    />
  );
}

export default definePreferencePane({
  id: "sounds",
  title: { key: "preferences.audioHaptics", fallback: "Audio & Haptics" },
  order: 200,
  summary: SoundsSummary,
  accessory: SoundsSwitch,
  view: AudioHapticsPane,
});
