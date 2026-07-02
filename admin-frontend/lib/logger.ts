// lib/logger.ts
// Logger utility for consistent logging across the app (dev-only, no-op in production).

const ANSI = {
  reset: "\x1b[0m",
  key: "\x1b[36m",
  string: "\x1b[32m",
  number: "\x1b[33m",
  boolean: "\x1b[35m",
  nil: "\x1b[90m",
  punctuation: "\x1b[37m",
};

function tryParseJson(input: unknown): unknown {
  if (typeof input !== "string") return input;

  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function colorizeJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2);
  if (!json) return "";

  return json.replace(
    /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?|[{}\[\],]/g,
    (match, quoted, colon, literal) => {
      if (quoted) {
        if (colon) {
          return `${ANSI.key}${quoted}${ANSI.reset}${ANSI.punctuation}${colon}${ANSI.reset}`;
        }
        return `${ANSI.string}${quoted}${ANSI.reset}`;
      }

      if (literal) {
        if (literal === "null") return `${ANSI.nil}${literal}${ANSI.reset}`;
        return `${ANSI.boolean}${literal}${ANSI.reset}`;
      }

      if (/^-?\d/.test(match)) {
        return `${ANSI.number}${match}${ANSI.reset}`;
      }

      return `${ANSI.punctuation}${match}${ANSI.reset}`;
    },
  );
}

export const logger = {
  log: (...args: unknown[]) => {
    if (process.env.NODE_ENV === "development") {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (process.env.NODE_ENV === "development") {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  },
  json: (label: string, input: unknown) => {
    if (process.env.NODE_ENV !== "development") return;

    const parsed = tryParseJson(input);
    // Only use ANSI color in Node.js environments where process.versions.node
    // exists — avoids process.stdout access in Edge/middleware/browser bundles.
    const canUseAnsi =
      typeof process !== "undefined" &&
      typeof process.versions === "object" &&
      typeof process.versions.node !== "undefined";

    if (typeof parsed === "string" || !canUseAnsi) {
      console.log(label, parsed);
      return;
    }

    console.log(`${label}\n${colorizeJson(parsed)}`);
  },
};
