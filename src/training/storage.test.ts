import { describe, it, expect, beforeEach } from "vitest";
import { getAll, getBest, recordRun, STORAGE_KEY } from "./storage";

// In-memory localStorage stub. Vitest runs in the node environment by default,
// which does not provide window/localStorage.
function installMemoryStorage() {
  const data = new Map<string, string>();
  const stub: Storage = {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(i) {
      return Array.from(data.keys())[i] ?? null;
    },
    removeItem(key) {
      data.delete(key);
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
  (globalThis as unknown as { localStorage: Storage }).localStorage = stub;
  return stub;
}

beforeEach(() => {
  installMemoryStorage();
});

describe("storage", () => {
  it("returns {} from getAll() when nothing is stored", () => {
    expect(getAll()).toEqual({});
  });

  it("returns null from getBest() for an unknown challenge", () => {
    expect(getBest("missing")).toBeNull();
  });

  it("recordRun writes a new best and returns true", () => {
    const wasNewBest = recordRun("ch1", 80, 2);
    expect(wasNewBest).toBe(true);
    const best = getBest("ch1");
    expect(best?.score).toBe(80);
    expect(best?.stars).toBe(2);
    expect(typeof best?.playedAt).toBe("number");
  });

  it("recordRun with a lower score does not overwrite and returns false", () => {
    recordRun("ch1", 80, 2);
    const firstTimestamp = getBest("ch1")!.playedAt;
    const wasNewBest = recordRun("ch1", 60, 1);
    expect(wasNewBest).toBe(false);
    expect(getBest("ch1")!.score).toBe(80);
    expect(getBest("ch1")!.playedAt).toBe(firstTimestamp);
  });

  it("recordRun with an equal score does not overwrite (strict-beat only)", () => {
    recordRun("ch1", 80, 2);
    const firstTimestamp = getBest("ch1")!.playedAt;
    const wasNewBest = recordRun("ch1", 80, 2);
    expect(wasNewBest).toBe(false);
    expect(getBest("ch1")!.playedAt).toBe(firstTimestamp);
  });

  it("recordRun with a higher score overwrites and returns true", () => {
    recordRun("ch1", 80, 2);
    const wasNewBest = recordRun("ch1", 95, 3);
    expect(wasNewBest).toBe(true);
    expect(getBest("ch1")!.score).toBe(95);
    expect(getBest("ch1")!.stars).toBe(3);
  });

  it("getAll returns every stored challenge", () => {
    recordRun("ch1", 80, 2);
    recordRun("ch2", 95, 3);
    const all = getAll();
    expect(Object.keys(all).sort()).toEqual(["ch1", "ch2"]);
  });

  it("malformed JSON in storage is swallowed as empty", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    expect(getAll()).toEqual({});
    expect(getBest("ch1")).toBeNull();
  });

  it("non-object JSON in storage is swallowed as empty", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(42));
    expect(getAll()).toEqual({});
  });
});
