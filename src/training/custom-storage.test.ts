import { describe, it, expect, beforeEach } from "vitest";
import {
  CUSTOM_STORAGE_KEY,
  addCustom,
  deleteCustom,
  listCustom,
  newCustomId,
  type StoredCustomChallenge,
} from "./custom-storage";

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
}

function mk(
  id: string,
  title: string,
  createdAt: number,
): StoredCustomChallenge {
  return {
    id,
    title,
    group: "scales",
    targets: [{ kind: "note", midi: 60 }],
    source: `title: ${title}\ngroup: scales\nnotes: C4`,
    createdAt,
  };
}

beforeEach(() => {
  installMemoryStorage();
});

describe("custom-storage", () => {
  it("listCustom returns [] when nothing stored", () => {
    expect(listCustom()).toEqual([]);
  });

  it("add then list round-trips", () => {
    const entry = mk("custom-a-0001", "A", 100);
    addCustom(entry);
    expect(listCustom()).toEqual([entry]);
  });

  it("list is sorted newest first by createdAt", () => {
    addCustom(mk("old", "Old", 100));
    addCustom(mk("mid", "Mid", 200));
    addCustom(mk("new", "New", 300));
    expect(listCustom().map((c) => c.id)).toEqual(["new", "mid", "old"]);
  });

  it("deleteCustom removes the entry", () => {
    addCustom(mk("a", "A", 100));
    addCustom(mk("b", "B", 200));
    deleteCustom("a");
    expect(listCustom().map((c) => c.id)).toEqual(["b"]);
  });

  it("deleteCustom on unknown id is a no-op", () => {
    addCustom(mk("a", "A", 100));
    expect(() => deleteCustom("nope")).not.toThrow();
    expect(listCustom().map((c) => c.id)).toEqual(["a"]);
  });

  it("corrupt JSON yields empty list", () => {
    localStorage.setItem(CUSTOM_STORAGE_KEY, "not-json");
    expect(listCustom()).toEqual([]);
  });

  it("non-object JSON yields empty list", () => {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(42));
    expect(listCustom()).toEqual([]);
  });

  it("array JSON yields empty list", () => {
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify([]));
    expect(listCustom()).toEqual([]);
  });

  it("newCustomId produces custom- prefix with slugged title and hex suffix", () => {
    const id = newCustomId("My Great Exercise!");
    expect(id).toMatch(/^custom-my-great-exercise-[0-9a-f]{4}$/);
  });

  it("newCustomId falls back to 'challenge' for non-slug-safe titles", () => {
    const id = newCustomId("!!! ??? ***");
    expect(id).toMatch(/^custom-challenge-[0-9a-f]{4}$/);
  });

  it("newCustomId caps the slug length", () => {
    const long = "a".repeat(100);
    const id = newCustomId(long);
    const slugPart = id.replace(/^custom-/, "").replace(/-[0-9a-f]{4}$/, "");
    expect(slugPart.length).toBeLessThanOrEqual(32);
  });
});
