/** Source shared by the Vite plugin and installed SDK tooling. */
export function createScosAppModuleSource(appId) {
  return `export * from "@syndromatic/syncloudos";\nimport { createAppSCOS } from "@syndromatic/syncloudos/sdk";\nexport const SCOS = createAppSCOS(${JSON.stringify(appId)});\n`;
}
