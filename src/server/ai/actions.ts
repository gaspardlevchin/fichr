"use server";

import { redirect } from "next/navigation";

import {
  applyProductAiSuggestionField,
  createProductSuggestionDraft,
  dismissProductAiSuggestion
} from "@/server/ai/product-suggestions";

export async function requestProductSuggestionAction(
  formData: FormData
): Promise<void> {
  const productId = formData.get("productId");

  if (typeof productId !== "string" || productId.length === 0) {
    redirect("/catalog?ai_error=Product%20missing.");
  }

  let redirectTarget: string;

  try {
    const result = await createProductSuggestionDraft(productId);
    const params = new URLSearchParams({
      ai_suggestion: result.status
    });

    if ("errorCode" in result && result.errorCode) {
      params.set("ai_error_code", result.errorCode);
    }

    redirectTarget = `/products/${encodeURIComponent(
      productId
    )}?${params.toString()}`;
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "AI suggestion request failed."
    );

    redirectTarget = `/products/${encodeURIComponent(productId)}?ai_error=${message}`;
  }

  redirect(redirectTarget);
}

export async function dismissAiSuggestionAction(
  formData: FormData
): Promise<void> {
  const suggestionId = formData.get("suggestionId");

  if (typeof suggestionId !== "string" || suggestionId.length === 0) {
    redirect("/catalog?ai_error=Suggestion%20missing.");
  }

  let redirectTarget: string;

  try {
    const result = await dismissProductAiSuggestion(suggestionId);

    redirectTarget = `/products/${encodeURIComponent(
      result.productId
    )}?ai_suggestion=${encodeURIComponent(result.status)}`;
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "AI suggestion dismissal failed."
    );

    redirectTarget = `/catalog?ai_error=${message}`;
  }

  redirect(redirectTarget);
}

export async function applyAiSuggestionFieldAction(
  formData: FormData
): Promise<void> {
  const suggestionId = formData.get("suggestionId");
  const fieldKey = formData.get("fieldKey");

  if (typeof suggestionId !== "string" || suggestionId.length === 0) {
    redirect("/catalog?ai_error=Suggestion%20missing.");
  }

  if (typeof fieldKey !== "string" || fieldKey.length === 0) {
    redirect("/catalog?ai_error=Field%20missing.");
  }

  let redirectTarget: string;

  try {
    const result = await applyProductAiSuggestionField({
      fieldKey,
      suggestionId
    });

    redirectTarget = `/products/${encodeURIComponent(
      result.productId
    )}?ai_suggestion=${encodeURIComponent(result.status)}`;
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "AI suggestion apply failed."
    );

    redirectTarget = `/catalog?ai_error=${message}`;
  }

  redirect(redirectTarget);
}
