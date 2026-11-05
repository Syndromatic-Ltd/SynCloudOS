import { useState } from "react";
import { NSEButton, NSESearchField } from "@syndromatic/syncloudos/nse/controls";
import type { SearchController } from "../index";

function LocalHelp() {
  const [expanded, setExpanded] = useState(false);
  return <button type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>Local help</button>;
}
export function SearchView({ controller }: { readonly controller: SearchController }) {
  return <div ref={controller.content.ref}>
    <NSESearchField aria-label="Search" binding={controller.queryBinding} />
    <NSEButton title="Clear search" action={controller.clearSearchAction} />
    <output aria-label="Search result">{controller.result}</output>
    <LocalHelp />
  </div>;
}
