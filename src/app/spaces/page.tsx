import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PageHeader } from "@/components/ui/page-header";
import { UiIcon } from "@/components/ui/ui-icon";
import { formatCount } from "@/lib/format-count";
import { getWorkspaceSpaceSummariesByStatus } from "@/server/products/queries";
import {
  archiveWorkspaceSpaceAction,
  createWorkspaceSpaceAction,
  restoreWorkspaceSpaceAction
} from "@/server/spaces/actions";

export const dynamic = "force-dynamic";

type SpacesPageProps = {
  searchParams?: Promise<{
    created?: string;
    archived?: string;
    error?: string;
    restored?: string;
    status?: string;
  }>;
};

export default async function SpacesPage({ searchParams }: SpacesPageProps) {
  const query = await searchParams;
  const status = query?.status === "archived" ? "archived" : "active";
  const spaces = await getWorkspaceSpaceSummariesByStatus(status);

  return (
    <AppShell>
      <PageHeader
        actions={
          <Link className="text-link compact-link" href="/catalog?space=unassigned">
            Voir les fiches sans espace
          </Link>
        }
        description="Organisez les produits par collection, dossier ou projet."
        eyebrow="Organisation"
        title="Espaces"
        titleId="spaces-title"
      />

      {query?.created ? (
        <InlineAlert variant="success">Espace créé.</InlineAlert>
      ) : null}
      {query?.archived ? (
        <InlineAlert variant="success">
          Espace archivé. Les fiches associées sont conservées.
        </InlineAlert>
      ) : null}
      {query?.restored ? (
        <InlineAlert variant="success">Espace restauré.</InlineAlert>
      ) : null}
      {query?.error ? (
        <InlineAlert variant="error">{query.error}</InlineAlert>
      ) : null}

      <section className="result-panel spaces-create-panel" aria-labelledby="create-space-title">
        <div>
          <p className="eyebrow">Nouvel espace</p>
          <h2 id="create-space-title">Créer un espace</h2>
        </div>
        <form action={createWorkspaceSpaceAction} className="space-create-form">
          <label className="form-field" htmlFor="space-name">
            <span>Nom</span>
            <input
              className="text-input"
              id="space-name"
              maxLength={80}
              name="name"
              required
              type="text"
            />
          </label>
          <label className="form-field" htmlFor="space-description">
            <span>Description optionnelle</span>
            <input
              className="text-input"
              id="space-description"
              maxLength={240}
              name="description"
              type="text"
            />
          </label>
          <button className="primary-button" type="submit">
            <UiIcon name="check" />
            Créer l’espace
          </button>
        </form>
      </section>

      <section className="result-panel spaces-list-panel" aria-labelledby="spaces-list-title">
        <div className="result-header">
          <div>
            <p className="eyebrow">Classement</p>
            <h2 id="spaces-list-title">
              {status === "active" ? "Espaces actifs" : "Espaces archivés"}
            </h2>
          </div>
          <Link className="text-link compact-link" href="/catalog?space=unassigned">
            Fiches sans espace
            <UiIcon name="arrow-right" />
          </Link>
        </div>

        <nav className="catalog-filter-tabs spaces-status-tabs" aria-label="État des espaces">
          <Link
            aria-current={status === "active" ? "page" : undefined}
            className={
              status === "active"
                ? "status-pill catalog-filter-active"
                : "status-pill"
            }
            href="/spaces"
          >
            Espaces actifs
          </Link>
          <Link
            aria-current={status === "archived" ? "page" : undefined}
            className={
              status === "archived"
                ? "status-pill catalog-filter-active"
                : "status-pill"
            }
            href="/spaces?status=archived"
          >
            Espaces archivés
          </Link>
        </nav>

        <p className="muted-text">
          Archiver un espace le retire des sélecteurs actifs sans masquer ni
          supprimer ses produits. Le masquage groupé des produits se fait
          uniquement depuis la revue de leur lot importé.
        </p>

        {spaces.length > 0 ? (
          <div className="space-list">
            {spaces.map((space) => (
              <article className="space-list-row" key={space.id}>
                <div>
                  <h3>{space.name}</h3>
                  <p className="muted-text">
                    {space.description ?? "Aucune description"}
                  </p>
                </div>
                <span className="status-pill">
                  {status === "archived"
                    ? "Archivé"
                    : formatCount(space.productCount, "fiche", "fiches")}
                </span>
                <div className="space-row-actions">
                  <Link
                    className="text-link compact-link"
                    href={`/catalog?space=${encodeURIComponent(space.id)}`}
                  >
                    Ouvrir dans le catalogue
                    <UiIcon name="arrow-right" />
                  </Link>
                  {status === "active" ? (
                    <details className="space-archive-confirmation">
                      <summary>Archiver</summary>
                      <form action={archiveWorkspaceSpaceAction}>
                        <input name="spaceId" type="hidden" value={space.id} />
                        <p>
                          Les fiches resteront associées et ne seront pas supprimées.
                        </p>
                        <button className="danger-button" type="submit">
                          Confirmer l’archivage
                        </button>
                      </form>
                    </details>
                  ) : (
                    <form action={restoreWorkspaceSpaceAction}>
                      <input name="spaceId" type="hidden" value={space.id} />
                      <button className="secondary-button" type="submit">
                        <UiIcon name="check" />
                        Restaurer
                      </button>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            action={
              status === "active" ? (
                <Link className="text-link compact-link" href="#create-space-title">
                  Créer un espace
                </Link>
              ) : (
                <Link className="text-link compact-link" href="/spaces">
                  Voir les espaces actifs
                </Link>
              )
            }
            contained
            description={
              status === "active"
                ? "Créez un espace pour regrouper les fiches d’une collection ou d’un projet."
                : "Les espaces archivés apparaîtront ici et resteront restaurables."
            }
            label={
              status === "active"
                ? "Aucun espace actif"
                : "Aucun espace archivé"
            }
            title={
              status === "active"
                ? "Aucun espace actif"
                : "Aucun espace archivé"
            }
          />
        )}
      </section>
    </AppShell>
  );
}
