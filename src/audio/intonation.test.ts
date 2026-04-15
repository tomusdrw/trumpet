import { describe, it, expect } from "vitest";
import { centsZone, zoneColor, type Zone } from "./intonation";

describe("centsZone", () => {
  it("returns 'green' within ±5 cents (inclusive)", () => {
    expect(centsZone(0)).toBe("green" satisfies Zone);
    expect(centsZone(5)).toBe("green" satisfies Zone);
    expect(centsZone(-5)).toBe("green" satisfies Zone);
  });

  it("returns 'yellow' between ±5 and ±15 cents (inclusive at 15)", () => {
    expect(centsZone(6)).toBe("yellow" satisfies Zone);
    expect(centsZone(-6)).toBe("yellow" satisfies Zone);
    expect(centsZone(15)).toBe("yellow" satisfies Zone);
    expect(centsZone(-15)).toBe("yellow" satisfies Zone);
  });

  it("returns 'red' beyond ±15 cents", () => {
    expect(centsZone(16)).toBe("red" satisfies Zone);
    expect(centsZone(-16)).toBe("red" satisfies Zone);
    expect(centsZone(50)).toBe("red" satisfies Zone);
  });
});

describe("zoneColor", () => {
  it("maps zones to CSS custom properties", () => {
    expect(zoneColor("green")).toBe("var(--accent-green)");
    expect(zoneColor("yellow")).toBe("var(--accent-yellow)");
    expect(zoneColor("red")).toBe("var(--accent-red)");
  });
});
