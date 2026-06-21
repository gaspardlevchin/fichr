import { randomUUID } from "node:crypto";

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";

import { sessions, users } from "../../../db/schema";
import {
  createSessionToken,
  getSessionCookieOptions,
  hashSessionToken,
  isEmailAllowed,
  SESSION_DURATION_SECONDS
} from "@/server/auth/core";
import { db } from "@/server/db/client";
import type { SessionContext } from "@/types/auth";

export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME ?? "fichr_session";

export async function createUserSession(userId: string): Promise<void> {
  const token = createSessionToken();
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_SECONDS * 1000
  ).toISOString();

  db.insert(sessions)
    .values({
      expiresAt,
      id: `ses_${randomUUID().replaceAll("-", "")}`,
      tokenHash: hashSessionToken(token),
      userId
    })
    .run();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
}

export async function getCurrentSession(): Promise<SessionContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const session = db
    .select({
      email: users.email,
      expiresAt: sessions.expiresAt,
      name: users.name,
      sessionId: sessions.id,
      userId: sessions.userId
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashSessionToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date().toISOString())
      )
    )
    .limit(1)
    .get();

  if (!session || !isEmailAllowed(session.email)) {
    return null;
  }

  return session;
}

export async function revokeCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    db.update(sessions)
      .set({
        revokedAt: sql`CURRENT_TIMESTAMP`,
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(
        and(
          eq(sessions.tokenHash, hashSessionToken(token)),
          isNull(sessions.revokedAt)
        )
      )
      .run();
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}
