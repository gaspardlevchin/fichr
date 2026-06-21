"use server";

import { redirect } from "next/navigation";

import { runDeterministicProductAudit } from "@/server/audit/product-audit";

export async function runProductAuditAction(formData: FormData): Promise<void> {
  const productId = formData.get("productId");

  if (typeof productId !== "string" || productId.length === 0) {
    redirect("/catalog");
  }

  try {
    await runDeterministicProductAudit(productId);
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Product audit failed."
    );
    redirect(`/products/${encodeURIComponent(productId)}?error=${message}`);
  }

  redirect(`/products/${encodeURIComponent(productId)}`);
}
