import { createHash, randomUUID } from "node:crypto";

export function uuid(): string {
  return randomUUID();
}

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function shortHash(input: string, len = 12): string {
  return sha256(input).slice(0, len);
}

/** Zero-padded application number, e.g. 1 -> "application-001". */
export function applicationSlug(n: number): string {
  return `application-${String(n).padStart(3, "0")}`;
}

/** Filesystem-safe slug from arbitrary text. */
export function slugify(input: string, maxLen = 60): string {
  const s = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return s.slice(0, maxLen) || "item";
}
