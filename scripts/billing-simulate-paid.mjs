import {
  assertDevelopmentScript,
  createId,
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
  const amountCents = Number(args.amount);
  const periodDays = Number(args["period-days"] ?? "30");

  if (
    !email ||
    !planKeys.includes(plan) ||
    plan === "demo" ||
    !Number.isInteger(amountCents) ||
    amountCents <= 0 ||
    !Number.isInteger(periodDays) ||
    periodDays <= 0
  ) {
    throw new Error(
      "Usage: npm run billing:simulate-paid -- --email ... --plan studio --amount 2900 --period-days 30"
    );
  }

  const database = openLocalDatabase();

  try {
    const workspace = getWorkspaceForEmail(database, email);
    const period = getPeriod(periodDays);
    const subscriptionId = createId("sub");
    const invoiceId = createId("inv");
    const invoiceNumber = `DEV-${Date.now()}-${createId("n").slice(-6)}`;

    database.transaction(() => {
      database
        .prepare(
          `insert into billing_subscriptions (
            id, workspace_id, provider, plan_key, status, amount_cents,
            currency, interval, current_period_start, current_period_end
          ) values (?, ?, 'manual', ?, 'active', ?, 'EUR', 'month', ?, ?)`
        )
        .run(
          subscriptionId,
          workspace.workspace_id,
          plan,
          amountCents,
          period.start,
          period.end
        );
      database
        .prepare(
          `insert into billing_invoices (
            id, workspace_id, subscription_id, invoice_number, provider,
            status, plan_key, amount_cents, currency, interval,
            period_start, period_end, issued_at, paid_at
          ) values (?, ?, ?, ?, 'manual', 'paid', ?, ?, 'EUR', 'month', ?, ?, ?, ?)`
        )
        .run(
          invoiceId,
          workspace.workspace_id,
          subscriptionId,
          invoiceNumber,
          plan,
          amountCents,
          period.start,
          period.end,
          period.start,
          period.start
        );
      upsertEntitlement(database, {
        periodEnd: period.end,
        periodStart: period.start,
        plan,
        source: "manual",
        status: "active",
        workspaceId: workspace.workspace_id
      });
    })();

    console.log(`Paiement local simulé pour le plan ${plan}.`);
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
