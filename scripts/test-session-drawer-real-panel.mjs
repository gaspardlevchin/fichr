import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const header = await readFile("src/components/app-header.tsx", "utf8");
const styles = await readFile("src/components/app-header.module.css", "utf8");
const shell = await readFile("src/components/app-shell.tsx", "utf8");

for (const className of [
  "sessionDrawer",
  "sessionPanel",
  "sessionHeader",
  "sessionBody",
  "sessionIdentity",
  "sessionPlan",
  "sessionLinks",
  "sessionActions"
]) {
  assert.equal(header.includes(`styles.${className}`), true);
  assert.equal(styles.includes(`.${className}`), true);
}

assert.equal(header.includes("CatalogDrawer"), false);
assert.equal(header.includes("catalogDrawerOpen"), false);
assert.equal(header.includes("onMouseEnter"), false);
assert.equal(header.includes("onPointerEnter"), false);
assert.equal(styles.includes(":has("), false);
assert.equal(styles.includes("position: absolute"), false);
assert.equal(shell.includes("getCatalogProducts"), false);
assert.equal(header.includes('event.key === "Escape"'), true);
assert.equal(header.includes('aria-label="Fermer le tiroir de session"'), true);

console.log("Real session drawer coverage passed.");
