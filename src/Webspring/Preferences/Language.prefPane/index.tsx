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

import { NSEGroupBox, NSEListItem } from "../../../NSE/public/controls";
import { definePreferencePane, type PreferencePaneViewProps } from "../../../SynCloudOS/Preferences";
import { useKernelSynCloudOS } from "../../../SynCloudOSReact";

function LanguageSummary({ locale }: PreferencePaneViewProps) {
  return <>{locale.supportedLocales.find((entry) => entry.code === locale.activeLocale)?.nativeName ?? locale.activeLocale}</>;
}

function LanguagePane({ locale }: PreferencePaneViewProps) {
  const runtime = useKernelSynCloudOS();
  return (
    <div className="nse-prefs-section">
      <NSEGroupBox>
        {locale.supportedLocales.map((entry) => (
          <NSEListItem
            key={entry.code}
            selected={entry.code === locale.activeLocale}
            meta={entry.code}
            onClick={() => runtime.locale.setLocale(entry.code)}
          >
            {entry.nativeName || entry.englishName}
          </NSEListItem>
        ))}
      </NSEGroupBox>
    </div>
  );
}

export default definePreferencePane({
  id: "language",
  title: { key: "preferences.language", fallback: "Language" },
  order: 500,
  summary: LanguageSummary,
  view: LanguagePane,
});
