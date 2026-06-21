import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const header = await readFile("src/components/app-header.tsx", "utf8");
const styles = await readFile("src/components/app-header.module.css", "utf8");

for (const className of [
  "sessionPanel",
  "sessionHeader",
  "sessionBody",
  "sessionIdentity",
  "sessionAvatar",
  "sessionEmail",
  "sessionPlan",
  "sessionLinks",
  "sessionActions",
  "sessionLogout",
  "sessionClose"
]) {
  assert.equal(header.includes(`styles.${className}`), true);
  assert.equal(styles.includes(`.${className}`), true);
}

for (const label of ["Session", "Compte", "Réglages", "Espaces", "Se déconnecter", "Fermer"]) {
  assert.equal(header.includes(label), true);
}

assert.equal(styles.includes("grid-template-columns: minmax(190px, 0.7fr)"), true);
assert.equal(styles.includes(".catalogTrigger"), false);
assert.equal(styles.includes(":has("), false);
assert.equal(styles.includes("position: absolute"), false);
assert.equal(header.includes("CatalogDrawer"), false);
assert.equal(header.includes("styles.planBadge"), false);

console.log("Session drawer layout coverage passed.");
