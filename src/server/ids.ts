import { randomUUID } from "node:crypto";

export function createServerId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}
