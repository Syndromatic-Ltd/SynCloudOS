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

// Static module-relative URLs let the package build emit the original artwork.
// Keep these as individual exports so consumers only retain the assets they use.
import synCloudOSLogo from "../../SynCloudOSReact/Resources/SynCloudOSLogo.png?url&no-inline";

export const synCloudOSLogoUrl = synCloudOSLogo;
export const newsIconUrl = new URL("../../../public/assets/icons/system/news.png?no-inline", import.meta.url).href;
export const webspringIconUrl = new URL("../../../public/assets/icons/system/Webspring.png?no-inline", import.meta.url).href;
export const selectionCircleUrl = new URL("../../../public/assets/icons/system/select circle.png?no-inline", import.meta.url).href;
export const spinnerUrl = new URL("../../../public/assets/icons/system/spinner.png?no-inline", import.meta.url).href;
export const selectorArrowUrl = new URL("../../../public/assets/webspring/arrow-SELECTOR.png?no-inline", import.meta.url).href;
export const timeMachineShadowUrl = new URL("../../../public/assets/webspring/time machine shadow.png?no-inline", import.meta.url).href;
