import { describe, it, expect } from "vitest";
import {
  frequencyToNote,
  midiToStaffPitch,
  type StaffPitch,
} from "./notes";

describe("frequencyToNote", () => {
  it("returns A4 for 440 Hz with 0 cents", () => {
    const result = frequencyToNote(440);
    expect(result!.note).toBe("A");
    expect(result!.octave).toBe(4);
    expect(result!.cents).toBe(0);
  });

  it("returns A4 for frequencies slightly above 440 Hz", () => {
    const result = frequencyToNote(442);
    expect(result!.note).toBe("A");
    expect(result!.octave).toBe(4);
    expect(result!.cents).toBeGreaterThan(0);
    expect(result!.cents).toBeLessThan(10);
  });

  it("returns A4 for frequencies slightly below 440 Hz", () => {
    const result = frequencyToNote(438);
    expect(result!.note).toBe("A");
    expect(result!.octave).toBe(4);
    expect(result!.cents).toBeLessThan(0);
    expect(result!.cents).toBeGreaterThan(-10);
  });

  it("returns Bb4 for ~466.16 Hz", () => {
    const result = frequencyToNote(466.16);
    expect(result!.note).toBe("Bb");
    expect(result!.octave).toBe(4);
    expect(Math.abs(result!.cents)).toBeLessThan(2);
  });

  it("returns C4 (middle C) for ~261.63 Hz", () => {
    const result = frequencyToNote(261.63);
    expect(result!.note).toBe("C");
    expect(result!.octave).toBe(4);
    expect(Math.abs(result!.cents)).toBeLessThan(2);
  });

  it("returns null for frequency 0", () => {
    expect(frequencyToNote(0)).toBeNull();
  });

  it("returns null for negative frequency", () => {
    expect(frequencyToNote(-100)).toBeNull();
  });

  it("returns cents within -50..+50 range", () => {
    const result = frequencyToNote(440);
    expect(result!.cents).toBeGreaterThanOrEqual(-50);
    expect(result!.cents).toBeLessThanOrEqual(50);
  });

  it("uses flats for enharmonic notes (Bb not A#, Eb not D#)", () => {
    const bb = frequencyToNote(466.16);
    expect(bb!.note).toBe("Bb");

    const eb = frequencyToNote(311.13);
    expect(eb!.note).toBe("Eb");

    const ab = frequencyToNote(415.30);
    expect(ab!.note).toBe("Ab");
  });
});

describe("midiToStaffPitch", () => {
  it("C4 (middle C) is C natural in octave 4", () => {
    expect(midiToStaffPitch(60)).toEqual<StaffPitch>({
      letter: "C",
      accidental: "natural",
      octave: 4,
    });
  });

  it("A4 is A natural in octave 4", () => {
    expect(midiToStaffPitch(69)).toEqual<StaffPitch>({
      letter: "A",
      accidental: "natural",
      octave: 4,
    });
  });

  it("Bb4 spells as B flat (not A sharp)", () => {
    expect(midiToStaffPitch(70)).toEqual<StaffPitch>({
      letter: "B",
      accidental: "flat",
      octave: 4,
    });
  });

  it("Eb5 spells as E flat", () => {
    expect(midiToStaffPitch(75)).toEqual<StaffPitch>({
      letter: "E",
      accidental: "flat",
      octave: 5,
    });
  });

  it("Ab4 spells as A flat (pitch class 8)", () => {
    expect(midiToStaffPitch(68)).toEqual<StaffPitch>({
      letter: "A",
      accidental: "flat",
      octave: 4,
    });
  });

  it("C#5 spells as C sharp", () => {
    expect(midiToStaffPitch(73)).toEqual<StaffPitch>({
      letter: "C",
      accidental: "sharp",
      octave: 5,
    });
  });

  it("F#4 spells as F sharp", () => {
    expect(midiToStaffPitch(66)).toEqual<StaffPitch>({
      letter: "F",
      accidental: "sharp",
      octave: 4,
    });
  });

  it("C6 is C natural in octave 6 (boundary)", () => {
    expect(midiToStaffPitch(84)).toEqual<StaffPitch>({
      letter: "C",
      accidental: "natural",
      octave: 6,
    });
  });

  it("B3 is B natural in octave 3 (just below middle C)", () => {
    expect(midiToStaffPitch(59)).toEqual<StaffPitch>({
      letter: "B",
      accidental: "natural",
      octave: 3,
    });
  });
});
