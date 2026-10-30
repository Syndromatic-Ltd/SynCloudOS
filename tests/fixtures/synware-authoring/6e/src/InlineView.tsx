import { NSEViewController, observable, bind, action, actionRef, type NSEBinding } from "@syndromatic/syncloudos";
import { NSESearchField, NSEPushButton } from "@syndromatic/syncloudos/nse/controls";
export class InlineSearchController extends NSEViewController {
  @observable accessor query = "";
  readonly queryBinding: NSEBinding<string> = bind<InlineSearchController, "query">(this, "query");
  @action clearSearch() { this.query = ""; }
  override renderView() {
    return <section><NSESearchField aria-label="Inline search" binding={this.queryBinding} />
      <NSEPushButton action={actionRef(InlineSearchController, "clearSearch")}>Clear</NSEPushButton></section>;
  }
}
