export const STORAGE_KEY = "trumpet-training-v1";

export interface StoredBest {
  score: number;
  stars: 1 | 2 | 3;
  playedAt: number;
}

export type StorageShape = Record<string, StoredBest>;

function readRaw(): StorageShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    return parsed as StorageShape;
  } catch {
    return {};
  }
}

function writeRaw(data: StorageShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage may be full or disabled; drop the write silently.
  }
}

export function getAll(): StorageShape {
  return readRaw();
}

export function getBest(id: string): StoredBest | null {
  const all = readRaw();
  return all[id] ?? null;
}

export function recordRun(
  id: string,
  score: number,
  stars: 1 | 2 | 3,
): boolean {
  const all = readRaw();
  const existing = all[id];
  if (existing !== undefined && existing.score >= score) {
    return false;
  }
  all[id] = { score, stars, playedAt: Date.now() };
  writeRaw(all);
  return true;
}
