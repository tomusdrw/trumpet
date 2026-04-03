import { describe, it, expect } from "vitest";
import { getFingering } from "./fingerings";

describe("getFingering", () => {
  it("returns open for Bb3", () => {
    expect(getFingering("Bb", 3)).toEqual([false, false, false]);
  });

  it("returns [true, true, true] for E3", () => {
    expect(getFingering("E", 3)).toEqual([true, true, true]);
  });

  it("returns open for C6", () => {
    expect(getFingering("C", 6)).toEqual([false, false, false]);
  });

  it("returns [true, false, true] for F3", () => {
    expect(getFingering("F", 3)).toEqual([true, false, true]);
  });

  it("returns [false, true, false] for A4", () => {
    expect(getFingering("A", 4)).toEqual([false, true, false]);
  });

  it("returns open for D5", () => {
    expect(getFingering("D", 5)).toEqual([false, false, false]);
  });

  it("returns null for notes outside trumpet range", () => {
    expect(getFingering("C", 3)).toBeNull();
    expect(getFingering("D", 6)).toBeNull();
  });

  it("returns [true, false, false] for C5", () => {
    expect(getFingering("C", 5)).toEqual([true, false, false]);
  });

  it("returns [false, true, false] for C#5", () => {
    expect(getFingering("C#", 5)).toEqual([false, true, false]);
  });

  it("handles Ab4 correctly", () => {
    expect(getFingering("Ab", 4)).toEqual([true, false, false]);
  });
});
