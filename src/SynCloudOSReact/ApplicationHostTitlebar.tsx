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

import { useMemo, useState, type ReactNode } from "react";
import { NSETopBar } from "../NSE/Windows/Chrome/NSETopBar";
import { NSEWindowTitlebarHostContext, type NSEWindowTitlebarDocument, type NSEWindowTitlebarHost } from "../SynCloudOS/AppHosting/windowChrome";
import { useApplicationMenuSnapshot, type ApplicationMenuStore } from "../Webspring/applicationMenuPresentation";

interface ApplicationHostTitlebarProps {
  /** The application's name, leading, as the stage's bar shows it. */
  readonly title: string;
  /** The application's icon, where the stage shows its home button. */
  readonly iconSrc: string | null;
  readonly material: "metal" | "cumulus";
  readonly scheme: "light" | "dark";
  readonly menuStore: ApplicationMenuStore;
  /** The application menu trigger's label; null when the frame declares no right slot. */
  readonly menuLabel: string | null;
  readonly children: ReactNode;
}

/**
 * The title bar of a page-filling application in an application-only host whose frame declares
 * `topBar: "standard"`: the same document layout the Webspring stage draws (the window's title,
 * subtitle and titlebar accessories centred), in flow above the application.
 */
export function ApplicationHostTitlebar({ title, iconSrc, material, scheme, menuStore, menuLabel, children }: ApplicationHostTitlebarProps) {
  const [document, setDocument] = useState<NSEWindowTitlebarDocument | null>(null);
  const [leadingAccessories, setLeadingAccessories] = useState<HTMLSpanElement | null>(null);
  const [trailingAccessories, setTrailingAccessories] = useState<HTMLSpanElement | null>(null);
  const host = useMemo<NSEWindowTitlebarHost>(() => Object.freeze({ setDocument, leadingAccessories, trailingAccessories }),
    [leadingAccessories, trailingAccessories]);
  return (
    <div className="syncloudos-application-host-frame" style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column" }}>
      <HostTopBar title={title} iconSrc={iconSrc} material={material} scheme={scheme} menuStore={menuStore} menuLabel={menuLabel}
        center={(
          <span className="nse-window-titlebar-document">
            <span ref={setLeadingAccessories} className="nse-window-titlebar-accessory-slot" data-layout-attribute="leading" />
            <span className="nse-window-titlebar-title" data-document-edited={document?.documentEdited || undefined}>
              {document?.title && document.toolbarStyle !== "expanded" ? <span className="nse-window-titlebar-title-text">{document.title}</span> : null}
              {document?.subtitle && document.toolbarStyle !== "expanded" ? <span className="nse-window-titlebar-subtitle">{document.subtitle}</span> : null}
              <span ref={setTrailingAccessories} className="nse-window-titlebar-accessory-slot" data-layout-attribute="trailing" />
            </span>
          </span>
        )}
      />
      <div className="syncloudos-application-host-content" style={{ position: "relative", flex: "1 1 auto", minHeight: 0 }}>
        <NSEWindowTitlebarHostContext.Provider value={host}>{children}</NSEWindowTitlebarHostContext.Provider>
      </div>
    </div>
  );
}

function HostTopBar({ title, iconSrc, material, scheme, menuStore, menuLabel, center }: Omit<ApplicationHostTitlebarProps, "children"> & { readonly center: ReactNode }) {
  const snapshot = useApplicationMenuSnapshot(menuStore);
  return (
    <NSETopBar
      title={title}
      titlePlacement="leading"
      className="nse-document-titlebar"
      variant={material === "metal" ? "atmoMetal" : "atmoCumulus"}
      scheme={scheme}
      leading={iconSrc ? <img src={iconSrc} width="20" height="20" alt="" className="syncloudos-application-host-icon" /> : undefined}
      center={center}
      trailingItems={menuLabel ? [{
        kind: "settings",
        label: menuLabel,
        selected: snapshot.open,
        opensMenu: true,
        onElementChange: menuStore.setAnchor,
        onClick: () => menuStore.toggle(),
      }] : []}
    />
  );
}
