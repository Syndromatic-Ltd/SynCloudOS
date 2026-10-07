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

import type { HTMLAttributes, ReactNode } from "react";
import { classes } from "../../Controls/Core/nseControlsShared";
import { NSEToolButton } from "../../Controls/Buttons/NSEButtonFamilies";
import { NSEPageHeader } from "./NSEPageHeader";

export interface NSEHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "content" | "title"> {
  title?: ReactNode;
  content?: ReactNode;
  kicker?: ReactNode;
  actions?: ReactNode;
}

export function NSEHeader({
  title,
  content,
  kicker,
  actions,
  children,
  className = "",
  ...props
}: NSEHeaderProps) {
  const headerTitle = title ?? content ?? children;
  const headerBody = title || content ? children : null;

  return (
    <NSEPageHeader
      className={classes("nse-extended-header", className)}
      kicker={kicker}
      title={headerTitle}
      actions={actions}
      {...props}
    >
      {headerBody}
    </NSEPageHeader>
  );
}

export interface NSEPrevNextBannerProps extends Omit<HTMLAttributes<HTMLDivElement>, "content"> {
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  previousLabel?: string;
  nextLabel?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  content?: ReactNode;
}

export function NSEPrevNextBanner({
  previousDisabled = false,
  nextDisabled = false,
  previousLabel = "Previous",
  nextLabel = "Next",
  onPrevious,
  onNext,
  content,
  children,
  className = "",
  ...props
}: NSEPrevNextBannerProps) {
  return (
    <div className={classes("nse-extended-prev-next-banner", className)} {...props}>
      <NSEToolButton
        className="nse-extended-prev-next-button"
        data-direction="prev"
        label={previousLabel}
        disabled={previousDisabled}
        onClick={() => onPrevious?.()}
      />
      <span className="nse-extended-prev-next-content">{children ?? content}</span>
      <NSEToolButton
        className="nse-extended-prev-next-button"
        data-direction="next"
        label={nextLabel}
        disabled={nextDisabled}
        onClick={() => onNext?.()}
      />
    </div>
  );
}
