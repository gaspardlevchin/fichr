"use server";

import { redirect } from "next/navigation";

import { ensurePrivateBetaAccount } from "@/server/auth/account";
import {
  assertDevLoginEmailAllowed,
  AuthenticationConfigurationError
} from "@/server/auth/core";
import {
  createUserSession,
  revokeCurrentSession
} from "@/server/auth/session";

function loginErrorRedirect(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

export async function loginPrivateBetaAction(
  formData: FormData
): Promise<void> {
  const email = formData.get("email");

  if (typeof email !== "string" || email.trim().length === 0) {
    loginErrorRedirect("Saisissez une adresse email autorisée.");
  }

  try {
    const normalizedEmail = assertDevLoginEmailAllowed(email);
    const userId = ensurePrivateBetaAccount(normalizedEmail);

    await createUserSession(userId);
  } catch (error) {
    const message =
      error instanceof AuthenticationConfigurationError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Connexion refusée.";

    loginErrorRedirect(message);
  }

  redirect("/");
}

export async function logoutAction(): Promise<void> {
  await revokeCurrentSession();
  redirect("/login");
}
