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

import { NSEBox } from "../../../NSE/public/controls";
import { GroupedRow } from "../../../NSE/Controls/Selection/GroupedRow";
import { NSEPreferencePane, type PreferencePaneViewProps } from "../../../SynCloudOS/Preferences";
import { useKernelSynCloudOS } from "../../../SynCloudOSReact";

function LanguageSummary({ locale }: PreferencePaneViewProps) {
  return <>{locale.supportedLocales.find((entry) => entry.code === locale.activeLocale)?.nativeName ?? locale.activeLocale}</>;
}

function LanguagePane({ locale }: PreferencePaneViewProps) {
  const runtime = useKernelSynCloudOS();
  return (
    <div className="nse-prefs-section">
      <NSEBox>
        {locale.supportedLocales.map((entry) => (
          <GroupedRow
            key={entry.code}
            selected={entry.code === locale.activeLocale}
            meta={entry.code}
            onClick={() => runtime.locale.setLocale(entry.code)}
          >
            {entry.nativeName || entry.englishName}
          </GroupedRow>
        ))}
      </NSEBox>
    </div>
  );
}

export default class LanguagePreferencePane extends NSEPreferencePane {
  static id = "language";
  static title = { key: "preferences.language", fallback: "Language" };
  static order = 500;

  override renderSummary() {
    return <LanguageSummary settings={this.settings} appearance={this.appearance} locale={this.locale} />;
  }

  override renderView() {
    return <LanguagePane settings={this.settings} appearance={this.appearance} locale={this.locale} />;
  }
}
