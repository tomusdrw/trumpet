import { describe, it, expect } from "vitest";
import {
  parseChallenges,
  pitchToMidi,
  DEFAULT_TRANSPOSE,
  MIN_CONCERT_MIDI,
  MAX_CONCERT_MIDI,
} from "./custom-challenge-dsl";

describe("pitchToMidi", () => {
  it("parses plain pitches", () => {
    expect(pitchToMidi("C4")).toBe(60);
    expect(pitchToMidi("A4")).toBe(69);
    expect(pitchToMidi("C0")).toBe(12);
  });

  it("applies accidentals", () => {
    expect(pitchToMidi("Bb4")).toBe(70);
    expect(pitchToMidi("F#5")).toBe(78);
    expect(pitchToMidi("Cb5")).toBe(71);
    expect(pitchToMidi("B#3")).toBe(60);
  });

  it("accepts octave 0-8", () => {
    expect(pitchToMidi("C0")).toBe(12);
    expect(pitchToMidi("C8")).toBe(108);
  });

  it("rejects bad tokens", () => {
    expect(pitchToMidi("c4")).toBeNull();
    expect(pitchToMidi("H5")).toBeNull();
    expect(pitchToMidi("C")).toBeNull();
    expect(pitchToMidi("C9")).toBeNull();
    expect(pitchToMidi("Bb10")).toBeNull();
    expect(pitchToMidi("")).toBeNull();
    expect(pitchToMidi("-")).toBeNull();
  });
});

describe("parseChallenges — happy paths", () => {
  it("parses a single valid block with default transpose", () => {
    const src = [
      "title: Happy Birthday",
      "group: melodies",
      "notes: C4 C4 D4 C4 F4 E4",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toEqual([]);
    expect(r.challenges).toHaveLength(1);
    const c = r.challenges[0].challenge;
    expect(c.title).toBe("Happy Birthday");
    expect(c.group).toBe("melodies");
    // Default transpose is -2: C4 (60) -> 58 = Bb3
    expect(c.targets.length).toBe(6);
    expect(c.targets[0]).toEqual({ kind: "note", midi: 58 });
    expect(c.targets[4]).toEqual({ kind: "note", midi: 63 }); // F4 (65) - 2
  });

  it("applies explicit transpose of 0 (concert)", () => {
    const src = [
      "title: Concert C major",
      "group: scales",
      "transpose: 0",
      "notes: C4 D4 E4 F4 G4 A4 B4 C5",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toEqual([]);
    expect(r.challenges).toHaveLength(1);
    const targets = r.challenges[0].challenge.targets;
    expect(targets[0]).toEqual({ kind: "note", midi: 60 });
    expect(targets[7]).toEqual({ kind: "note", midi: 72 });
  });

  it("parses rests", () => {
    const src = [
      "title: With rest",
      "group: long-tones",
      "notes: C4 - C4 - C4",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toEqual([]);
    const targets = r.challenges[0].challenge.targets;
    expect(targets.map((t) => t.kind)).toEqual([
      "note",
      "rest",
      "note",
      "rest",
      "note",
    ]);
  });

  it("stores description when provided", () => {
    const src = [
      "title: Slow one",
      "group: melodies",
      "description: slow and expressive",
      "notes: C4 D4 E4",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toEqual([]);
    expect(r.challenges[0].challenge.description).toBe("slow and expressive");
  });

  it("parses multiple blocks separated by blank lines", () => {
    const src = [
      "title: First",
      "group: scales",
      "notes: C4 D4",
      "",
      "title: Second",
      "group: melodies",
      "notes: E4 F4",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toEqual([]);
    expect(r.challenges).toHaveLength(2);
    expect(r.challenges[0].challenge.title).toBe("First");
    expect(r.challenges[1].challenge.title).toBe("Second");
  });

  it("parses multiple blocks without blank-line separators", () => {
    const src = [
      "title: First",
      "group: scales",
      "notes: C4 D4",
      "title: Second",
      "group: melodies",
      "notes: E4 F4",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toEqual([]);
    expect(r.challenges).toHaveLength(2);
  });

  it("preserves source text for round-trip editing", () => {
    const src = [
      "title: First",
      "group: scales",
      "notes: C4 D4",
      "",
      "title: Second",
      "group: melodies",
      "notes: E4 F4",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.challenges[0].source).toBe(
      ["title: First", "group: scales", "notes: C4 D4"].join("\n"),
    );
    expect(r.challenges[1].source).toBe(
      ["title: Second", "group: melodies", "notes: E4 F4"].join("\n"),
    );
  });

  it("tolerates extra whitespace around keys and values", () => {
    const src = [
      "  title:   Spaced   ",
      "group:   scales",
      "notes:   C4   D4   ",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toEqual([]);
    expect(r.challenges[0].challenge.title).toBe("Spaced");
  });

  it("tolerates CRLF line endings", () => {
    const src = ["title: Foo", "group: scales", "notes: C4 D4"].join("\r\n");
    const r = parseChallenges(src);
    expect(r.errors).toEqual([]);
    expect(r.challenges).toHaveLength(1);
  });
});

describe("parseChallenges — validation errors", () => {
  it("missing title (orphan fields)", () => {
    const src = ["group: scales", "notes: C4 D4"].join("\n");
    const r = parseChallenges(src);
    expect(r.challenges).toEqual([]);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors[0]).toEqual({
      line: 1,
      message: "Fields must follow a 'title:' line.",
    });
  });

  it("missing group reports at title line", () => {
    const src = ["title: Foo", "notes: C4 D4"].join("\n");
    const r = parseChallenges(src);
    expect(r.challenges).toEqual([]);
    expect(r.errors).toContainEqual({
      line: 1,
      message: "Missing required field 'group'.",
    });
  });

  it("missing notes reports at title line", () => {
    const src = ["title: Foo", "group: scales"].join("\n");
    const r = parseChallenges(src);
    expect(r.challenges).toEqual([]);
    expect(r.errors).toContainEqual({
      line: 1,
      message: "Missing required field 'notes'.",
    });
  });

  it("unknown group value", () => {
    const src = ["title: Foo", "group: tunes", "notes: C4"].join("\n");
    const r = parseChallenges(src);
    expect(r.challenges).toEqual([]);
    expect(r.errors).toContainEqual({
      line: 2,
      message:
        "Unknown group 'tunes'. Expected long-tones, scales, or melodies.",
    });
  });

  it("duplicate key within a block", () => {
    const src = [
      "title: Foo",
      "group: scales",
      "group: melodies",
      "notes: C4",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toContainEqual({
      line: 3,
      message: "Duplicate 'group:' within the same challenge.",
    });
  });

  it("invalid pitch token", () => {
    const src = ["title: Foo", "group: scales", "notes: C4 H5 D4"].join("\n");
    const r = parseChallenges(src);
    expect(r.challenges).toEqual([]);
    expect(r.errors).toContainEqual({
      line: 3,
      message: "Invalid note 'H5'. Expected e.g. C4, Bb3, F#5, or -.",
    });
  });

  it("empty notes line", () => {
    const src = ["title: Foo", "group: scales", "notes:   "].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toContainEqual({
      line: 3,
      message: "At least one note is required.",
    });
  });

  it("non-integer transpose", () => {
    const src = [
      "title: Foo",
      "group: scales",
      "transpose: abc",
      "notes: C4",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toContainEqual({
      line: 3,
      message: "Transpose must be an integer (e.g. -2, 0, 5).",
    });
  });

  it("empty title", () => {
    const src = ["title:   ", "group: scales", "notes: C4"].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toContainEqual({
      line: 1,
      message: "Title must be 1-60 characters.",
    });
  });

  it("title too long", () => {
    const long = "x".repeat(61);
    const src = [`title: ${long}`, "group: scales", "notes: C4"].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toContainEqual({
      line: 1,
      message: "Title must be 1-60 characters.",
    });
  });

  it("description too long", () => {
    const long = "x".repeat(121);
    const src = [
      "title: Foo",
      "group: scales",
      `description: ${long}`,
      "notes: C4",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toContainEqual({
      line: 3,
      message: "Description must be 1-120 characters.",
    });
  });

  it("unknown field", () => {
    const src = [
      "title: Foo",
      "flavor: strawberry",
      "group: scales",
      "notes: C4",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toContainEqual({
      line: 2,
      message:
        "Unknown field 'flavor:'. Expected one of: group, description, transpose, notes.",
    });
  });

  it("unparseable line (no colon) within a block", () => {
    const src = [
      "title: Foo",
      "just some text",
      "group: scales",
      "notes: C4",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.errors).toContainEqual({
      line: 2,
      message:
        "Unexpected line. Expected one of: title:, group:, description:, transpose:, notes:",
    });
  });

  it("out-of-range pitch (too low with default transpose)", () => {
    // C1 (24) + (-2) = 22, below 36
    const src = ["title: Foo", "group: scales", "notes: C1"].join("\n");
    const r = parseChallenges(src);
    expect(r.challenges).toEqual([]);
    expect(
      r.errors.some(
        (e) =>
          e.line === 3 &&
          e.message.includes("outside supported range"),
      ),
    ).toBe(true);
  });

  it("out-of-range pitch (too high)", () => {
    // C8 (108) + 0 = 108, above 96
    const src = [
      "title: Foo",
      "group: scales",
      "transpose: 0",
      "notes: C8",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.challenges).toEqual([]);
    expect(
      r.errors.some((e) => e.message.includes("outside supported range")),
    ).toBe(true);
  });

  it("accepts pitches at the boundary of supported range", () => {
    // With default transpose -2: written C2 (36) -> concert 34 (out); written D2 (38) -> 36 (min).
    const src = [
      "title: Low",
      "group: long-tones",
      "notes: D2",
    ].join("\n");
    expect(parseChallenges(src).errors).toEqual([]);
  });

  it("reports multiple errors in one pass", () => {
    const src = [
      "title: Foo",
      "group: nonsense",
      "transpose: xyz",
      "notes: C4 H5",
    ].join("\n");
    const r = parseChallenges(src);
    const messages = r.errors.map((e) => e.message);
    expect(messages.some((m) => m.includes("Unknown group"))).toBe(true);
    expect(messages.some((m) => m.includes("Transpose must be"))).toBe(true);
    expect(messages.some((m) => m.includes("Invalid note 'H5'"))).toBe(true);
  });

  it("independent blocks: one invalid does not stop the next", () => {
    const src = [
      "title: Bad",
      "group: scales",
      // missing notes
      "",
      "title: Good",
      "group: melodies",
      "notes: C4 D4",
    ].join("\n");
    const r = parseChallenges(src);
    expect(r.challenges).toHaveLength(1);
    expect(r.challenges[0].challenge.title).toBe("Good");
    expect(
      r.errors.some((e) => e.message.includes("Missing required field 'notes'")),
    ).toBe(true);
  });
});

describe("parseChallenges — empty input", () => {
  it("returns empty result for empty string", () => {
    expect(parseChallenges("")).toEqual({ challenges: [], errors: [] });
  });

  it("returns empty result for whitespace-only", () => {
    expect(parseChallenges("\n\n   \n")).toEqual({
      challenges: [],
      errors: [],
    });
  });
});

describe("parseChallenges — exports", () => {
  it("exposes constants", () => {
    expect(DEFAULT_TRANSPOSE).toBe(-2);
    expect(MIN_CONCERT_MIDI).toBe(36);
    expect(MAX_CONCERT_MIDI).toBe(96);
  });
});
