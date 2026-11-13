/* SynCloudOS — Copyright © 2026 Syndromatic Ltd. AGPL-3.0-or-later. */

import { useInsertionEffect } from "react";
import { observeReactOwnedNSEMenu, type NSEMenu } from "./NSEMenu";

export function useNSEMenuLifetime(menu: NSEMenu | readonly NSEMenu[]): void {
  useInsertionEffect(() => {
    const menus = "dispose" in menu ? [menu] : menu;
    const release = menus.map(observeReactOwnedNSEMenu);
    return () => { for (const dispose of release) dispose?.(); };
  }, [menu]);
}
