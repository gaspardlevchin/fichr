"use server";

import { redirect } from "next/navigation";

import {
  archiveWorkspaceSpace,
  assignProductToSpace,
  createWorkspaceSpace,
  restoreWorkspaceSpace
} from "@/server/spaces/service";

export async function createWorkspaceSpaceAction(
  formData: FormData
): Promise<void> {
  const name = formData.get("name");
  const description = formData.get("description");

  if (typeof name !== "string" || typeof description !== "string") {
    redirect("/spaces?error=Informations%20invalides.");
  }

  let spaceId: string;

  try {
    spaceId = (await createWorkspaceSpace({ description, name })).id;
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Création de l’espace impossible."
    );
    redirect(`/spaces?error=${message}`);
  }

  redirect(`/spaces?created=${encodeURIComponent(spaceId)}`);
}

export async function assignProductToSpaceAction(
  formData: FormData
): Promise<void> {
  const productId = formData.get("productId");
  const spaceId = formData.get("spaceId");

  if (
    typeof productId !== "string" ||
    !productId ||
    typeof spaceId !== "string"
  ) {
    redirect("/catalog");
  }

  try {
    await assignProductToSpace({
      productId,
      spaceId: spaceId || null
    });
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Association impossible."
    );
    redirect(`/products/${encodeURIComponent(productId)}?space_error=${message}`);
  }

  redirect(`/products/${encodeURIComponent(productId)}?space_saved=1`);
}

export async function archiveWorkspaceSpaceAction(
  formData: FormData
): Promise<void> {
  const spaceId = formData.get("spaceId");

  if (typeof spaceId !== "string" || !spaceId) {
    redirect("/spaces?error=Espace%20introuvable.");
  }

  try {
    await archiveWorkspaceSpace(spaceId);
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Archivage impossible."
    );
    redirect(`/spaces?error=${message}`);
  }

  redirect("/spaces?archived=1");
}

export async function restoreWorkspaceSpaceAction(
  formData: FormData
): Promise<void> {
  const spaceId = formData.get("spaceId");

  if (typeof spaceId !== "string" || !spaceId) {
    redirect("/spaces?status=archived&error=Espace%20introuvable.");
  }

  try {
    await restoreWorkspaceSpace(spaceId);
  } catch (error) {
    const message = encodeURIComponent(
      error instanceof Error ? error.message : "Restauration impossible."
    );
    redirect(`/spaces?status=archived&error=${message}`);
  }

  redirect("/spaces?restored=1");
}
