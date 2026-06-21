"use server";

import { redirect } from "next/navigation";

import { startBillingCheckout } from "./service";

export async function startBillingCheckoutAction(
  formData: FormData
): Promise<void> {
  const planKey = formData.get("planKey");
  const interval = formData.get("interval");

  if (typeof planKey !== "string" || typeof interval !== "string") {
    redirect("/billing/plans?error=Sélection%20invalide.");
  }

  let checkoutUrl: string;

  try {
    checkoutUrl = (
      await startBillingCheckout({
        interval,
        planKey
      })
    ).checkoutUrl;
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Checkout impossible."
    );
    redirect(`/billing/plans?error=${message}`);
  }

  redirect(checkoutUrl);
}
