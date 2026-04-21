import type { Challenge, ChallengeGroup, Target } from "./challenges";

export interface ParseError {
  line: number;
  message: string;
}

export interface ParsedChallenge {
  challenge: Omit<Challenge, "id">;
  source: string;
}

export interface ParseResult {
  challenges: ParsedChallenge[];
  errors: ParseError[];
}

export const DEFAULT_TRANSPOSE = -2;
export const MIN_CONCERT_MIDI = 36;
export const MAX_CONCERT_MIDI = 96;
const VALID_GROUPS: readonly ChallengeGroup[] = [
  "long-tones",
  "scales",
  "melodies",
];
const STEP: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
const PITCH_RE = /^([A-G])([b#]?)([0-8])$/;
const LINE_RE = /^([a-zA-Z_]+)\s*:\s*(.*)$/;
const UNKNOWN_KEYS_MSG =
  "Unexpected line. Expected one of: title:, group:, description:, transpose:, notes:";

interface WorkingBlock {
  titleLine: number;
  sourceStart: number;
  sourceEnd: number;
  seen: Map<string, number>;
  title?: string;
  group?: ChallengeGroup;
  description?: string;
  transpose?: number;
  notesLine?: number;
  writtenTargets?: Target[];
  tokensWithLine?: Array<{ token: string; midi: number }>;
}

export function pitchToMidi(token: string): number | null {
  const m = PITCH_RE.exec(token);
  if (m === null) return null;
  const step = STEP[m[1]];
  const acc = m[2] === "b" ? -1 : m[2] === "#" ? 1 : 0;
  const octave = parseInt(m[3], 10);
  return (octave + 1) * 12 + step + acc;
}

export function parseChallenges(source: string): ParseResult {
  const errors: ParseError[] = [];
  const challenges: ParsedChallenge[] = [];
  const lines = source.split("\n").map((l) => l.replace(/\r$/, ""));

  let current: WorkingBlock | null = null;

  const flush = () => {
    if (current !== null) {
      finalize(current);
      current = null;
    }
  };

  const finalize = (block: WorkingBlock) => {
    const missing: string[] = [];
    if (block.title === undefined) missing.push("title");
    if (block.group === undefined) missing.push("group");
    if (block.writtenTargets === undefined) missing.push("notes");
    if (missing.length > 0) {
      for (const key of missing) {
        errors.push({
          line: block.titleLine,
          message: `Missing required field '${key}'.`,
        });
      }
      return;
    }

    const transpose = block.transpose ?? DEFAULT_TRANSPOSE;
    const finalTargets: Target[] = [];
    let rangeError = false;
    for (const t of block.writtenTargets!) {
      if (t.kind === "rest") {
        finalTargets.push(t);
        continue;
      }
      const concertMidi = t.midi + transpose;
      if (concertMidi < MIN_CONCERT_MIDI || concertMidi > MAX_CONCERT_MIDI) {
        errors.push({
          line: block.notesLine!,
          message: `Note resolves to concert MIDI ${concertMidi}, outside supported range ${MIN_CONCERT_MIDI}-${MAX_CONCERT_MIDI}.`,
        });
        rangeError = true;
        break;
      }
      finalTargets.push({ kind: "note", midi: concertMidi });
    }
    if (rangeError) return;

    const srcLines = lines.slice(block.sourceStart, block.sourceEnd + 1);
    const source = srcLines.join("\n");

    const challenge: Omit<Challenge, "id"> = {
      title: block.title!,
      group: block.group!,
      targets: finalTargets,
    };
    if (block.description !== undefined) {
      challenge.description = block.description;
    }
    challenges.push({ challenge, source });
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const trimmed = lines[i].trim();
    if (trimmed === "") continue;

    const match = LINE_RE.exec(trimmed);
    if (match === null) {
      errors.push({ line: lineNum, message: UNKNOWN_KEYS_MSG });
      if (current !== null) current.sourceEnd = i;
      continue;
    }

    const key = match[1];
    const value = match[2];

    if (key === "title") {
      flush();
      current = {
        titleLine: lineNum,
        sourceStart: i,
        sourceEnd: i,
        seen: new Map([["title", lineNum]]),
      };
      if (value.length === 0 || value.length > 60) {
        errors.push({
          line: lineNum,
          message: "Title must be 1-60 characters.",
        });
      } else {
        current.title = value;
      }
      continue;
    }

    if (current === null) {
      errors.push({
        line: lineNum,
        message: "Fields must follow a 'title:' line.",
      });
      continue;
    }

    current.sourceEnd = i;

    if (current.seen.has(key)) {
      errors.push({
        line: lineNum,
        message: `Duplicate '${key}:' within the same challenge.`,
      });
      continue;
    }

    switch (key) {
      case "group": {
        current.seen.set(key, lineNum);
        if (!(VALID_GROUPS as readonly string[]).includes(value)) {
          errors.push({
            line: lineNum,
            message: `Unknown group '${value}'. Expected long-tones, scales, or melodies.`,
          });
        } else {
          current.group = value as ChallengeGroup;
        }
        break;
      }
      case "description": {
        current.seen.set(key, lineNum);
        if (value.length === 0 || value.length > 120) {
          errors.push({
            line: lineNum,
            message: "Description must be 1-120 characters.",
          });
        } else {
          current.description = value;
        }
        break;
      }
      case "transpose": {
        current.seen.set(key, lineNum);
        if (!/^-?\d+$/.test(value)) {
          errors.push({
            line: lineNum,
            message: "Transpose must be an integer (e.g. -2, 0, 5).",
          });
        } else {
          current.transpose = parseInt(value, 10);
        }
        break;
      }
      case "notes": {
        current.seen.set(key, lineNum);
        const tokens = value.split(/\s+/).filter((s) => s.length > 0);
        if (tokens.length === 0) {
          errors.push({
            line: lineNum,
            message: "At least one note is required.",
          });
          break;
        }
        current.notesLine = lineNum;
        const targets: Target[] = [];
        let tokenError = false;
        for (const tok of tokens) {
          if (tok === "-") {
            targets.push({ kind: "rest" });
            continue;
          }
          const midi = pitchToMidi(tok);
          if (midi === null) {
            errors.push({
              line: lineNum,
              message: `Invalid note '${tok}'. Expected e.g. C4, Bb3, F#5, or -.`,
            });
            tokenError = true;
            continue;
          }
          targets.push({ kind: "note", midi });
        }
        if (!tokenError) current.writtenTargets = targets;
        break;
      }
      default: {
        errors.push({
          line: lineNum,
          message: `Unknown field '${key}:'. Expected one of: group, description, transpose, notes.`,
        });
        break;
      }
    }
  }

  flush();

  return { challenges, errors };
}
