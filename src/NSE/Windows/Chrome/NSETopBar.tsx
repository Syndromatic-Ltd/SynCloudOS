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

import type { CSSProperties } from "react";
import {
  getOptionalNSESmoothSurfaceProps,
  type NSESmoothSurfaceStyle
} from "../../SmoothSurface";
import { useNSEFeedback } from "../../Feedback";
import { NSETopBarButton } from "./NSETopBarButton";
import { nseTopBarStyles } from "./nseTopBarStyles";
import type { NSETopBarItem, NSETopBarItemPosition, NSETopBarProps } from "./nseTopBarTypes";

type CSSVarStyle = CSSProperties & Record<`--${string}`, string>;

function NSETopBarTitle({
  title,
  center,
  titleAction
}: Pick<NSETopBarProps, "title" | "center" | "titleAction">) {
  const feedback = useNSEFeedback();

  if (center) return <>{center}</>;
  if (!titleAction) return <>{title}</>;
  return (
    <button
      type="button"
      className="nse-app-topbar-title-button"
      data-selected={titleAction.selected ? "true" : "false"}
      aria-label={titleAction.label}
      aria-expanded={titleAction.selected}
      aria-controls={titleAction.controlsId}
      disabled={titleAction.disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        titleAction.onClick();
        void feedback?.trigger("rigid");
      }}
    >
      <span className="nse-app-topbar-title-text">{title}</span>
      <span className="nse-app-topbar-title-arrow" aria-hidden="true">
        <span className="nse-app-topbar-title-arrow-glyph nse-app-topbar-title-arrow-right" />
        <span className="nse-app-topbar-title-arrow-glyph nse-app-topbar-title-arrow-down" />
      </span>
    </button>
  );
}

/** Spliced metal pill (return / user-info / custom glyph) for the `atmoMetal` chrome. */
function NSETopBarMetalPill({ item, position }: { item: NSETopBarItem; position: NSETopBarItemPosition }) {
  const feedback = useNSEFeedback();

  const glyphClass = item.kind === "webspring"
    ? "nse-app-topbar-metal-pill-glyph-return"
    : item.kind === "userInfo"
      ? "nse-app-topbar-metal-pill-glyph-userinfo"
      : item.kind === "settings"
        ? "nse-app-topbar-metal-pill-glyph-settings"
        : "nse-app-topbar-metal-pill-glyph-custom";
  const glyphStyle = item.kind === "custom" && item.icon
    ? ({ "--nse-app-topbar-metal-pill-glyph": `url("${item.icon}")` } as CSSVarStyle)
    : undefined;

  return (
    <button
      ref={item.onElementChange}
      type="button"
      className="nse-app-topbar-metal-pill"
      data-position={position}
      aria-label={item.label}
      aria-haspopup={item.opensMenu ? "menu" : undefined}
      aria-expanded={item.opensMenu ? Boolean(item.selected) : undefined}
      title={item.label}
      disabled={item.disabled}
      onClick={() => {
        item.onClick?.();
        void feedback?.trigger(item.haptic ?? "rigid");
      }}
    >
      <span className="nse-app-topbar-metal-pill-shell" aria-hidden="true" />
      <span className={`nse-app-topbar-metal-pill-glyph ${glyphClass}`} style={glyphStyle} aria-hidden="true" />
    </button>
  );
}

function NSETopBarMetal({
  title,
  scheme = "light",
  rail,
  leadingItems = [],
  trailingItems = [],
  leading,
  trailing,
  titleAction = null,
  titlePlacement = "centre",
  center,
  className = ""
}: NSETopBarProps) {
  const railWidth = rail?.width;
  const leadingTitle = titlePlacement === "leading";
  const headerStyle: CSSVarStyle | undefined = railWidth != null
    ? { "--nse-app-topbar-rail": typeof railWidth === "number" ? `${railWidth}px` : railWidth }
    : undefined;

  const main = (
    <div className="nse-app-topbar-metal-main">
      <span className="nse-app-topbar-metal-grain" aria-hidden="true" />
      {leading !== undefined || leadingItems.length || leadingTitle ? (
        <div className="nse-app-topbar-metal-cluster nse-app-topbar-metal-leading">
          {leading !== undefined ? leading : leadingItems.map((item) => (
            <NSETopBarMetalPill key={`${item.kind}-${item.label}`} item={item} position="left" />
          ))}
          {leadingTitle ? (
            <h1 className="nse-app-topbar-metal-title nse-app-topbar-metal-leading-title">
              <NSETopBarTitle title={title} titleAction={titleAction} />
            </h1>
          ) : null}
        </div>
      ) : null}
      {leadingTitle ? (
        center !== undefined ? <div className="nse-app-topbar-metal-title nse-app-topbar-metal-centre">{center}</div> : null
      ) : (
        <h1 className="nse-app-topbar-metal-title">
          <NSETopBarTitle title={title} center={center} titleAction={titleAction} />
        </h1>
      )}
      {trailing !== undefined ? (
        <div className="nse-app-topbar-metal-cluster nse-app-topbar-metal-trailing">{trailing}</div>
      ) : trailingItems.length ? (
        <div className="nse-app-topbar-metal-cluster nse-app-topbar-metal-trailing">
          {trailingItems.map((item) => (
            <NSETopBarMetalPill key={`${item.kind}-${item.label}`} item={item} position="right" />
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <header
      className={`nse-app-topbar nse-app-topbar-metal ${className}`.trim()}
      data-variant="atmoMetal"
      data-mode={scheme}
      data-has-rail={rail ? "true" : "false"}
      data-title-placement={titlePlacement}
      style={headerStyle}
    >
      {rail ? (
        <div className="nse-app-topbar-metal-rail">
          <span className="nse-app-topbar-metal-grain" aria-hidden="true" />
          <div className="nse-app-topbar-metal-rail-content">
            {rail.titleAction ? (
              <NSETopBarTitle title={typeof rail.content === "string" ? rail.content : ""} titleAction={rail.titleAction} />
            ) : (
              rail.content
            )}
          </div>
        </div>
      ) : null}
      {main}
    </header>
  );
}

export function NSETopBar(props: NSETopBarProps) {
  if (props.variant === "atmoMetal") {
    return <NSETopBarMetal {...props} />;
  }

  const {
    title,
    leadingItems = [],
    trailingItems = [],
    leading,
    trailing,
    titleAction = null,
    center,
    className = "",
    smoothSurface = false,
    style
  } = props;
  const styleDefinition = nseTopBarStyles.atmoCumulus;
  const surfaceProps = getOptionalNSESmoothSurfaceProps(
    smoothSurface,
    className,
    style as NSESmoothSurfaceStyle | undefined
  );
  const topBarStyle: CSSVarStyle = {
    "--nse-app-topbar-height": `${styleDefinition.height}px`,
    ...(surfaceProps.style as CSSVarStyle | undefined)
  };

  return (
    <header className={`nse-app-topbar ${surfaceProps.className ?? ""}`.trim()} data-variant="atmoCumulus" style={topBarStyle}>
      <div className="nse-app-topbar-base" aria-hidden="true">
        <span className="nse-app-topbar-base-glass" />
      </div>
      <div className="nse-app-topbar-content">
        <div className="nse-app-topbar-slot nse-app-topbar-slot-left">
          {leading !== undefined ? leading : leadingItems.map((item) => (
            <NSETopBarButton key={`${item.kind}-${item.label}`} item={item} position="left" styleDefinition={styleDefinition} />
          ))}
        </div>
        <h1 className="nse-app-topbar-title">
          <NSETopBarTitle title={title} center={center} titleAction={titleAction} />
        </h1>
        <div className="nse-app-topbar-slot nse-app-topbar-slot-right">
          {trailing !== undefined ? trailing : trailingItems.map((item) => (
            <NSETopBarButton key={`${item.kind}-${item.label}`} item={item} position="right" styleDefinition={styleDefinition} />
          ))}
        </div>
      </div>
    </header>
  );
}
