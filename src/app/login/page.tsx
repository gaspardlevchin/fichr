import Image from "next/image";
import { redirect } from "next/navigation";

import { UiIcon } from "@/components/ui/ui-icon";
import { loginPrivateBetaAction } from "@/server/auth/actions";
import {
  getPrivateBetaDevLoginConfiguration,
  getPrivateBetaDevLoginConfigurationMessage
} from "@/server/auth/core";
import { getCurrentSession } from "@/server/auth/session";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getCurrentSession();

  if (session) {
    redirect("/");
  }

  const { error } = await searchParams;
  const devLoginConfiguration = getPrivateBetaDevLoginConfiguration();

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <Image
          alt="Fichr"
          className="login-brand"
          height={52}
          priority
          src="/brand/fichr_logo.svg"
          width={130}
        />
        <p className="eyebrow">Bêta privée</p>
        <h1 id="login-title">Accéder à Fichr</h1>
        <p className="muted-text">
          L’accès est réservé aux adresses autorisées pour la bêta.
        </p>

        {devLoginConfiguration.configured ? (
          <form action={loginPrivateBetaAction} className="login-form">
            <label htmlFor="private-beta-email">Email</label>
            <input
              autoComplete="email"
              id="private-beta-email"
              name="email"
              required
              type="email"
            />
            <button className="primary-button" type="submit">
              Continuer
              <UiIcon name="arrow-right" />
            </button>
          </form>
        ) : (
          <p className="notice-text">
            {getPrivateBetaDevLoginConfigurationMessage(
              devLoginConfiguration
            )}
          </p>
        )}

        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
