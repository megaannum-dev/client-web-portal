const PW_CHARS = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789#$%&*";

/** 12-char temporary password generator (excludes visually-ambiguous chars). */
export function genPassword(): string {
  return Array.from({ length: 12 }, () => PW_CHARS[Math.floor(Math.random() * PW_CHARS.length)]).join("");
}
