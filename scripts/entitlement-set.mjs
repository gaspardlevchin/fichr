import {
  assertDevelopmentScript,
  entitlementStatuses,
  getPeriod,
  getWorkspaceForEmail,
  openLocalDatabase,
  parseArguments,
  planKeys,
  upsertEntitlement
} from "./billing-script-utils.mjs";

function main() {
  assertDevelopmentScript();
  const args = parseArguments(process.argv.slice(2));
  const email = args.email;
  const plan = args.plan;
  const status = args.status;
  const periodDays = Number(args["period-days"] ?? "30");

  if (!email || !planKeys.includes(plan) || !entitlementStatuses.includes(status)) {
    throw new Error(
      "Usage: npm run entitlement:set -- --email ... --plan studio --status active --period-days 30"
    );
  }

  if (!Number.isInteger(periodDays) || periodDays <= 0) {
    throw new Error("period-days doit être un entier positif.");
  }

  const database = openLocalDatabase();

  try {
    const workspace = getWorkspaceForEmail(database, email);
    const period = getPeriod(periodDays);
    upsertEntitlement(database, {
      periodEnd: period.end,
      periodStart: period.start,
      plan,
      source: "manual",
      status,
      workspaceId: workspace.workspace_id
    });
    console.log(`Entitlement ${plan}/${status} appliqué au workspace local.`);
  } finally {
    database.close();
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
