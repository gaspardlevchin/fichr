import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <AppShell>
      <PageHeader
        description="Consultez les informations du workspace et les outils locaux disponibles."
        eyebrow="Workspace"
        title="Réglages"
        titleId="settings-title"
      />

      <section className="settings-grid" aria-label="Réglages Fichr">
        <article className="result-panel settings-panel">
          <p className="eyebrow">Workspace</p>
          <h2>Workspace</h2>
          <dl className="detail-list">
            <div>
              <dt>Mode</dt>
              <dd>Développement local</dd>
            </div>
            <div>
              <dt>Stockage</dt>
              <dd>Données stockées localement</dd>
            </div>
          </dl>
        </article>

        <article className="result-panel settings-panel">
          <p className="eyebrow">Développement local</p>
          <h2>Réinitialisation</h2>
          <p className="muted-text">
            Cette commande réinitialise la base locale et les fichiers de test.
            Elle n’est jamais exécutée depuis l’interface.
          </p>
          <code className="command-pill">npm run db:reset:dev</code>
        </article>

        <article className="result-panel settings-panel">
          <p className="eyebrow">Interface</p>
          <h2>Thème Fichr</h2>
          <p className="muted-text">
            Interface claire et sobre, adaptée au travail sur les catalogues.
          </p>
        </article>

        <article className="result-panel settings-panel">
          <p className="eyebrow">Session</p>
          <h2>Session locale</h2>
          <p className="muted-text">
            La photo de session n’est pas configurée.
          </p>
        </article>
      </section>
    </AppShell>
  );
}
