import type { ChallengeGroup, Target } from "./challenges";

export const CUSTOM_STORAGE_KEY = "trumpet-custom-challenges-v1";

export interface StoredCustomChallenge {
  id: string;
  title: string;
  group: ChallengeGroup;
  description?: string;
  targets: readonly Target[];
  source: string;
  createdAt: number;
}

type StorageShape = Record<string, StoredCustomChallenge>;

function readRaw(): StorageShape {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as StorageShape;
  } catch {
    return {};
  }
}

function writeRaw(data: StorageShape): void {
  try {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage may be full or disabled; drop the write silently.
  }
}

export function listCustom(): StoredCustomChallenge[] {
  const all = readRaw();
  return Object.values(all).sort((a, b) => b.createdAt - a.createdAt);
}

export function addCustom(entry: StoredCustomChallenge): void {
  const all = readRaw();
  all[entry.id] = entry;
  writeRaw(all);
}

export function deleteCustom(id: string): void {
  const all = readRaw();
  if (id in all) {
    delete all[id];
    writeRaw(all);
  }
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug.length > 0 ? slug : "challenge";
}

function randomSuffix(): string {
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function newCustomId(title: string): string {
  return `custom-${slugify(title)}-${randomSuffix()}`;
}
