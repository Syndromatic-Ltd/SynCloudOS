import { NSEApplication } from "../../src/NSE/Application/NSEApplication";
import { NSEViewController, type NSEViewControllerClass } from "../../src/NSE/Application/NSEViewController";
import { NSEWindowController } from "../../src/NSE/Application/NSEWindowController";
import { observable } from "../../src/NSE/Objects/observable";
import { preference } from "../../src/NSE/Objects/preference";
import { observes } from "../../src/NSE/Objects/observes";

class Fields extends NSEViewController {
  @observable accessor query = "";
  @preference("query.saved") accessor saved = "";
  @observes("query", { lifetime: "owner" }) valid(value: string, previous: string | undefined) { void value; void previous; }
  // @ts-expect-error the direct property does not exist
  @observes("missing", { lifetime: "owner" }) absent(value: string) { void value; }
  // @ts-expect-error the direct property's type is string
  @observes("query", { lifetime: "owner" }) wrong(value: number) { void value; }
  // @ts-expect-error asynchronous observers must use a managed task
  @observes("query", { lifetime: "owner" }) async asynchronous(value: string) { void value; }
  // @ts-expect-error complex preferences require a schema descriptor
  @preference("complex") accessor complex = { width: 1 };
  // @ts-expect-error a source's selected value is a number
  @observes((owner: Fields) => owner, { lifetime: "owner", select: () => 12 }) wrongProjection(value: string) { void value; }
}
const view = new Fields({ ownerSignal: new AbortController().signal });
view.own(() => ({ dispose() {} }));
// @ts-expect-error asynchronous factories are forbidden
view.own(async () => ({ dispose() {} }));
// @ts-expect-error thenable disposables are still asynchronous
view.own(() => ({ dispose() {}, then() {} }));
class Parameterized extends NSEViewController { constructor(readonly title: string, readonly index: number) { super(); } }
view.addChild(Parameterized, "Title", 1);
// @ts-expect-error constructor arguments retain their declared tuple types
view.addChild(Parameterized, 1, "Title");
class App extends NSEApplication { static override mainViewController = Fields; }
class Window extends NSEWindowController { static override contentViewControllerClass = Fields; }
class WindowRoot extends NSEViewController { constructor(readonly windowController: Window) { super(); } }
class ParameterizedWindow extends NSEWindowController { static override contentViewControllerClass = WindowRoot; }
const rootClass: NSEViewControllerClass = WindowRoot;
class NeedsMoreArguments extends NSEViewController { constructor(readonly windowController: Window, readonly required: string) { super(); } }
// @ts-expect-error content classes receive exactly the owning window, no extra required arguments
const incompatible: NSEViewControllerClass = NeedsMoreArguments;
// @ts-expect-error a root must be an NSEViewController
const nonController: NSEViewControllerClass = class { constructor(readonly windowController: Window) {} };
void [ParameterizedWindow, rootClass, incompatible, nonController];
void App; void Window;
