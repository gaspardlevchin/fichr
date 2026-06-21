import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const header = await readFile("src/components/app-header.tsx", "utf8");
const styles = await readFile("src/components/app-header.module.css", "utf8");

assert.equal(header.includes("sessionDrawerOpen"), true);
assert.equal(header.includes('id="session-navigation-drawer"'), true);
assert.equal(header.includes('aria-controls="session-navigation-drawer"'), true);
assert.equal(header.includes('href="/account"'), true);
assert.equal(header.includes('href="/settings"'), true);
assert.equal(header.includes("logoutAction"), true);
assert.equal(header.includes("Se déconnecter"), true);
assert.equal(header.includes("<details"), false);
assert.equal(styles.includes(".sessionDrawer"), true);
assert.equal(styles.includes("position: absolute"), false);
assert.equal(header.includes('event.key === "Escape"'), true);

console.log("Session drawer coverage passed.");
