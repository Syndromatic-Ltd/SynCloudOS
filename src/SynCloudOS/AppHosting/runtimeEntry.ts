/** Internal kernel/React host bootstrap. Never re-export from an SDK package entry. */
export { createSynWareDefinitionFromApplicationClass, createSynWareDefinitionFromComponent, isNSEApplicationClass } from "./applicationClass";
export { applicationSessionFor } from "./applicationSession";

export { NSEViewControllerView } from "./applicationHosting";

export { installedApplicationMenuSections } from "./installedApplicationMenus";
