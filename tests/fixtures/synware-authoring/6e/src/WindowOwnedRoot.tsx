import { NSEViewController, NSEWindowController } from "@syndromatic/syncloudos";

class InspectorContent extends NSEViewController {
  constructor(readonly windowController: InspectorWindow) { super(); }
  override renderView() {
    return <button onClick={() => void this.windowController.window.close()}>Close inspector</button>;
  }
}
export class InspectorWindow extends NSEWindowController {
  static override contentViewControllerClass = InspectorContent;
}
class NoArgumentContent extends NSEViewController { override renderView() { return <p>No-argument root</p>; } }
export class NoArgumentWindow extends NSEWindowController { static override contentViewControllerClass = NoArgumentContent; }
