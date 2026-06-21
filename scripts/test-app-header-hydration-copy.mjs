import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { appNavigationItems } from "../src/lib/app-navigation.ts";

assert.deepEqual(
  appNavigationItems.map((item) => item.label),
  ["Imports", "Catalogue", "Exports"]
);
assert.equal(
  appNavigationItems.some((item) => item.label === "Dashboard"),
  false
);
assert.equal(
  appNavigationItems.some((item) => item.label === "Tableau de bord"),
  false
);

const header = await readFile("src/components/app-header.tsx", "utf8");
const headerStyles = await readFile(
  "src/components/app-header.module.css",
  "utf8"
);
const shell = await readFile("src/components/app-shell.tsx", "utf8");

assert.equal(header.includes("navigationItems.map"), true);
assert.equal(header.includes("Dashboard"), false);
assert.equal(header.includes("Tableau de bord"), false);
assert.equal(header.includes("localStorage"), false);
assert.equal(header.includes("sessionStorage"), false);
assert.equal(header.includes("Math.random"), false);
assert.equal(header.includes("Date.now"), false);
assert.equal(shell.includes("navigationItems={appNavigationItems}"), true);
assert.equal(header.includes("catalog-navigation-drawer"), false);
assert.equal(header.includes("CatalogDrawer"), false);
assert.equal(header.includes("app-subnav"), false);
assert.equal(header.includes("sessionDrawerOpen"), true);
assert.equal(header.includes('aria-controls="session-navigation-drawer"'), true);
assert.equal(header.includes("<details"), false);
assert.equal(header.includes("Compte"), true);
assert.equal(header.includes("Réglages"), true);
assert.equal(header.includes("onPointerEnter"), false);
assert.equal(header.includes("onPointerLeave"), false);
assert.equal(header.includes("catalogDrawerOpen"), false);
assert.equal(header.includes("styles.planBadge"), false);
assert.equal(headerStyles.includes("grid-template-rows: 0fr"), true);
assert.equal(headerStyles.includes("grid-template-rows: 1fr"), true);
const drawerStyles = headerStyles.slice(
  headerStyles.indexOf(".drawer {"),
  headerStyles.indexOf(".drawerOpen")
);
assert.equal(drawerStyles.includes("position: absolute"), false);
assert.equal(headerStyles.includes(".catalogTrigger"), false);
assert.equal(headerStyles.includes(":has("), false);
assert.equal(headerStyles.includes(".sessionDrawer"), true);
assert.equal(headerStyles.includes("position: absolute"), false);

const effectIndex = header.indexOf("useEffect(() =>");
const windowIndex = header.indexOf("window.addEventListener");
assert.equal(effectIndex >= 0 && windowIndex > effectIndex, true);

console.log("App header hydration copy coverage passed.");
