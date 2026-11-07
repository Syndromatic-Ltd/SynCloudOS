import { NSEApplication, NSEViewController, observable, preference, observes, outlet, bind, action, actionRef, managedTask,
  type NSEBinding, type NSEViewOutlet } from "@syndromatic/syncloudos";
import { AFXTransaction } from "@syndromatic/syncloudos/fx/animation";
import { SearchView } from "./Views/SearchView";

export class SearchController extends NSEViewController {
  static override view = SearchView;
  static override viewDependencies = (controller: SearchController) => [controller.search];
  @observable accessor query = "";
  @observable accessor result = "";
  @preference("search.includeArchived") accessor includeArchived = false;
  @outlet accessor content!: NSEViewOutlet<HTMLDivElement>;
  readonly queryBinding: NSEBinding<string> = bind<SearchController, "query">(this, "query");
  readonly clearSearchAction = actionRef(SearchController, "clearSearch");
  readonly search = managedTask(this, { lifetime: "mounted", policy: "latest", run: async (query: string, context) => {
    await Promise.resolve();
    context.throwIfCancelled();
    return query.toUpperCase();
  }, apply: result => { this.result = result; } });
  @observes("query", { lifetime: "mounted", initial: true }) queryChanged(query: string) { this.search.run(query); }
  @action clearSearch() { this.query = ""; return this.query; }
  override viewDidLoad() { AFXTransaction.perform({ disableActions: true }, () => { this.content.layer.opacity = 1; }); }
}

export default class SearchApplication extends NSEApplication { static override mainViewController = SearchController; }
