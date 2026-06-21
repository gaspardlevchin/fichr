import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const account = await readFile("src/app/account/page.tsx", "utf8");
const plans = await readFile("src/app/billing/plans/page.tsx", "utf8");
const header = await readFile("src/components/app-header.tsx", "utf8");

assert.equal(account.includes("UsageLimit"), true);
assert.equal(account.includes("utilisé"), true);
assert.equal(account.includes("Disponibles :"), true);
assert.equal(account.includes("usage.maxProducts} /"), false);
assert.equal(account.includes("usage.maxSpaces} /"), false);
assert.equal(account.includes("plan.label"), true);
assert.equal(account.includes("PDF"), true);
assert.equal(account.includes("Exports sécurisés"), true);
assert.equal(plans.includes("Jusqu’à"), true);
assert.equal(plans.includes("PDF"), true);
assert.equal(header.includes("styles.planBadge"), false);

console.log("Account plan limits copy coverage passed.");
