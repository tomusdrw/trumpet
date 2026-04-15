export type Zone = "green" | "yellow" | "red";

export function centsZone(cents: number): Zone {
  const abs = Math.abs(cents);
  if (abs <= 5) return "green";
  if (abs <= 15) return "yellow";
  return "red";
}

export function zoneColor(zone: Zone): string {
  switch (zone) {
    case "green":
      return "var(--accent-green)";
    case "yellow":
      return "var(--accent-yellow)";
    case "red":
      return "var(--accent-red)";
  }
}
