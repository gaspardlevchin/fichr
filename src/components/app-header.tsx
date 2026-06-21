"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FocusEvent } from "react";

import styles from "@/components/app-header.module.css";
import type { AppNavigationItem } from "@/lib/app-navigation";
import { getPlanStatusLabel } from "@/lib/plan-status";
import { logoutAction } from "@/server/auth/actions";
import type { SessionContext } from "@/types/auth";
import type { EntitlementStatus } from "@/types/entitlement";

type AppHeaderProps = {
  navigationItems: readonly AppNavigationItem[];
  planLabel: string;
  planStatus: EntitlementStatus;
  session: SessionContext;
};

function getInitials(session: SessionContext): string {
  const source = session.name?.trim() || session.email.split("@")[0] || "F";
  const words = source.split(/[\s._-]+/).filter(Boolean);

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/catalog" && pathname.startsWith("/products/")) {
    return true;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function SessionDrawer({
  email,
  initials,
  onClose,
  open,
  planLabel,
  planStatus
}: {
  email: string;
  initials: string;
  onClose(): void;
  open: boolean;
  planLabel: string;
  planStatus: EntitlementStatus;
}) {
  return (
    <section
      aria-label="Compte et session"
      className={`${styles.drawer} ${styles.sessionDrawer} ${
        open ? styles.drawerOpen : ""
      }`}
      id="session-navigation-drawer"
    >
      <div className={styles.sessionPanel}>
        <header className={styles.sessionHeader}>
          <div className={styles.sessionIdentity}>
            <span className={styles.sessionAvatar} aria-hidden="true">
              {initials}
            </span>
            <div>
              <p className={styles.sessionEyebrow}>Session</p>
              <strong className={styles.sessionEmail}>{email}</strong>
            </div>
          </div>
          <button
            className={styles.sessionClose}
            onClick={onClose}
            aria-label="Fermer le tiroir de session"
            type="button"
          >
            Fermer
          </button>
        </header>

        <div className={styles.sessionBody}>
          <div className={styles.sessionPlan}>
            <span>Plan</span>
            <strong>{planLabel}</strong>
            <small>{getPlanStatusLabel(planStatus)}</small>
          </div>

          <nav aria-label="Navigation du compte" className={styles.sessionLinks}>
            <Link href="/account" onClick={onClose}>
              Compte
            </Link>
            <Link href="/settings" onClick={onClose}>
              Réglages
            </Link>
            <Link href="/spaces" onClick={onClose}>
              Espaces
            </Link>
          </nav>

          <div className={styles.sessionActions}>
            <form action={logoutAction}>
              <button className={styles.sessionLogout} type="submit">
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

export function AppHeader({
  navigationItems,
  planLabel,
  planStatus,
  session
}: AppHeaderProps) {
  const pathname = usePathname();
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const initials = getInitials(session);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSessionDrawerOpen(false);

        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleShellBlur(event: FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;

    if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
      setSessionDrawerOpen(false);
    }
  }

  return (
    <div className={`${styles.shell} app-header-shell`} onBlur={handleShellBlur}>
      <header className="app-header">
        <Link className="brand-link" href="/">
          <Image
            alt="fichr"
            className="brand-logo"
            height={72}
            priority
            src="/brand/fichr_logo.svg"
            width={180}
          />
        </Link>

        <div className="app-header-right">
          <nav className="app-nav" aria-label="Navigation principale">
            {navigationItems.map((item) => {
              const isActive = isActivePath(pathname, item.href);

              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <button
            aria-controls="session-navigation-drawer"
            aria-expanded={sessionDrawerOpen}
            aria-label={`Compte ${session.email}`}
            className="profile-avatar"
            onClick={() => {
              setSessionDrawerOpen((open) => !open);
            }}
            title={session.email}
            type="button"
          >
            {initials}
          </button>
        </div>
      </header>
      <SessionDrawer
        email={session.email}
        initials={initials}
        onClose={() => setSessionDrawerOpen(false)}
        open={sessionDrawerOpen}
        planLabel={planLabel}
        planStatus={planStatus}
      />
    </div>
  );
}
