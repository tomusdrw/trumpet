import { describe, it, expect } from "vitest";
import { frequencyToNote } from "./notes";

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
