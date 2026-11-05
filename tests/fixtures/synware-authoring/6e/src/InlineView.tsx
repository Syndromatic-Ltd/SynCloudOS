import { NSEViewController, observable, bind, action, actionRef, type NSEBinding } from "@syndromatic/syncloudos";
import { NSEButton, NSESearchField } from "@syndromatic/syncloudos/nse/controls";
export class InlineSearchController extends NSEViewController {
  @observable accessor query = "";
  readonly queryBinding: NSEBinding<string> = bind<InlineSearchController, "query">(this, "query");
  @action clearSearch() { this.query = ""; }
  override renderView() {
    return <section><NSESearchField aria-label="Inline search" binding={this.queryBinding} />
      <NSEButton title="Clear" action={actionRef(InlineSearchController, "clearSearch")} /></section>;
  }
}
