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

import React from "react";
import { NSEButton } from "../NSE/Controls/Buttons/NSEButton";
import { NSEImage } from "../NSE/Controls/Images/NSEImageResource";

/** @internal The stage's standard back cell, shared by application and document title bars. */
export function ApplicationNavigationBackButton({ label, onActivate }: {
  readonly label: string;
  readonly onActivate: () => void;
}) {
  return <NSEButton bezelStyle="texturedRounded" title={label}
    image={NSEImage.named(NSEImage.goBackTemplateName)} imagePosition="imageOnly"
    className="webspring-application-navigation-back" data-nse-application-navigation-back="true"
    onClick={onActivate} />;
}
