import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const packageRoot = new URL('../../../../../site/node_modules/@syndromatic/syncloudos/', import.meta.url);
const metadata = JSON.parse(await readFile(new URL('package.json',packageRoot),'utf8'));
const nse = await import(new URL(metadata.exports['./nse'].import,packageRoot));
const controls = await import(new URL(metadata.exports['./nse/controls'].import,packageRoot));
assert.equal('NSEPageHeader' in nse, false);
assert.equal('NSEPageHeader' in controls, false);
const controller = new nse.NSEWindowController();
assert.equal(controller.window.toolbarStyle, 'automatic');
for (const style of ['expanded','preference','unified','unifiedCompact','automatic']) {
  controller.window.toolbarStyle = style;
  assert.equal(controller.window.toolbarStyle, style);
}
controller.window.subtitle = 'Work in progress';
assert.equal(controller.window.subtitle, 'Work in progress');
const accessory = new nse.NSETitlebarAccessoryViewController({owner:controller});
accessory.layoutAttribute = 'leading';
controller.window.addTitlebarAccessoryViewController(accessory);
assert.equal(controller.window.titlebarAccessoryViewControllers[0], accessory);
controller.window.removeTitlebarAccessoryViewController(0);
assert.equal(accessory.isDisposed,true);
controller.dispose();
const receipt = JSON.parse(await readFile(new URL('../../../../../site/vendor/framework-receipt.json',import.meta.url),'utf8'));
const result = {passed:true,frameworkCommit:receipt.commit,archiveSha256:receipt.archiveSha256,removed:['NSEPageHeader','NSEPageHeaderProps'],styles:['automatic','expanded','preference','unified','unifiedCompact'],subtitle:true,leadingAccessory:true};
await writeFile(new URL('installed-sdk.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
