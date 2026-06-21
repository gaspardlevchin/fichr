import Image from "next/image";
import Link from "next/link";

import { UiIcon } from "@/components/ui/ui-icon";
import { logoutAction } from "@/server/auth/actions";

export default function AccessDeniedPage() {
  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="access-denied-title">
        <Image
          alt="Fichr"
          className="login-brand"
          height={52}
          priority
          src="/brand/fichr_logo.svg"
          width={130}
        />
        <p className="eyebrow">Accès refusé</p>
        <h1 id="access-denied-title">Workspace indisponible</h1>
        <p className="muted-text">
          Votre session ne dispose pas d’un accès autorisé à ce workspace.
        </p>
        <div className="inline-actions">
          <Link className="text-link" href="/login">
            <UiIcon name="arrow-left" />
            Revenir à la connexion
          </Link>
          <form action={logoutAction}>
            <button className="secondary-button" type="submit">
              Se déconnecter
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
