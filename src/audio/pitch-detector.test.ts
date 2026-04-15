import { describe, it, expect } from "vitest";
import { autocorrelate } from "./pitch-detector";

function sineBuffer(
  freq: number,
  sampleRate: number,
  length: number,
): Float32Array {
  const buf = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buf[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return buf;
}

describe("autocorrelate", () => {
  it("detects a 440 Hz sine wave within 1% of the true frequency", () => {
    const buf = sineBuffer(440, 44100, 4096);
    const freq = autocorrelate(buf, 44100);
    expect(freq).not.toBeNull();
    expect(freq!).toBeGreaterThan(440 * 0.99);
    expect(freq!).toBeLessThan(440 * 1.01);
  });

  it("detects a 523.25 Hz (C5) sine wave within 1%", () => {
    const buf = sineBuffer(523.25, 44100, 4096);
    const freq = autocorrelate(buf, 44100);
    expect(freq).not.toBeNull();
    expect(Math.abs(freq! - 523.25) / 523.25).toBeLessThan(0.01);
  });

  it("returns null for silence (all zeros)", () => {
    const buf = new Float32Array(4096);
    const freq = autocorrelate(buf, 44100);
    expect(freq).toBeNull();
  });

  it("returns null for low-amplitude noise (below RMS threshold)", () => {
    const buf = new Float32Array(4096);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = (Math.random() - 0.5) * 0.005; // < 0.01 RMS threshold
    }
    const freq = autocorrelate(buf, 44100);
    expect(freq).toBeNull();
  });
});
