// Parses the FAQ spreadsheet export (content/faq/faq.csv): one row per
// question, English and Chinese side by side.
//
//   topic_en | topic_zh | question_en | question_zh | answer_en | answer_zh
//
// Rows sharing a topic_en form one topic; topics and questions keep the order
// they first appear in. Errors name the spreadsheet row (the header is row 1)
// so a non-technical editor can find the problem in the sheet.

export const COLUMNS = ["topic_en", "topic_zh", "question_en", "question_zh", "answer_en", "answer_zh"];
const LANGS = { en: "_en", "zh-TW": "_zh" };

export class FaqFormatError extends Error {
  constructor(file, row, message) {
    super(row ? `${file} row ${row}: ${message}` : `${file}: ${message}`);
    this.name = "FaqFormatError";
  }
}

/**
 * RFC 4180 CSV → rows of cells. Handles quoted cells containing commas,
 * doubled quotes and line breaks, CRLF or LF endings, and a UTF-8 BOM.
 * @param {string} source
 * @returns {string[][]}
 */
export function parseCsv(source) {
  const text = source.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * @param {string} source  CSV text
 * @param {string} file    name used in error messages
 * @returns {{ sections: { key: string, items: string[] }[],
 *             text: Record<string, { sections: Record<string, string>, items: Record<string, { q: string, a: string }> }> }}
 */
export function parseFaqCsv(source, file = "faq.csv") {
  if (source.includes("�")) {
    throw new FaqFormatError(file, 0, 'contains garbled characters — save it as "CSV UTF-8" (Excel) or download from Google Sheets as CSV');
  }
  const [header, ...body] = parseCsv(source);
  const names = (header ?? []).map((h) => h.trim());
  const missing = COLUMNS.filter((c) => !names.includes(c));
  if (missing.length) {
    throw new FaqFormatError(file, 1, `missing column(s): ${missing.join(", ")} — the header row must be: ${COLUMNS.join(", ")}`);
  }
  const col = Object.fromEntries(COLUMNS.map((c) => [c, names.indexOf(c)]));

  const topics = []; // { en, cells, questions: row cell maps }
  body.forEach((cells, i) => {
    const row = i + 2;
    if (cells.every((c) => c.trim() === "")) return; // blank spacer rows are fine
    const get = (c) => (cells[col[c]] ?? "").replace(/\r\n?/g, "\n").trim();
    const empty = COLUMNS.filter((c) => !get(c));
    if (empty.length) throw new FaqFormatError(file, row, `empty cell(s): ${empty.join(", ")}`);

    let topic = topics.find((t) => t.topic_en === get("topic_en"));
    if (!topic) {
      topic = { topic_en: get("topic_en"), topic_zh: get("topic_zh"), row, questions: [] };
      topics.push(topic);
    } else if (topic.topic_zh !== get("topic_zh")) {
      throw new FaqFormatError(
        file, row,
        `topic "${topic.topic_en}" has topic_zh "${get("topic_zh")}" here but "${topic.topic_zh}" in row ${topic.row} — they must match`,
      );
    }
    topic.questions.push(Object.fromEntries(COLUMNS.map((c) => [c, get(c)])));
  });

  if (topics.length === 0) throw new FaqFormatError(file, 0, "no questions found");

  // Ids are positional (t1, t1q2): stable while the sheet's order is.
  const sections = topics.map((t, i) => ({ key: `t${i + 1}`, items: t.questions.map((_, j) => `t${i + 1}q${j + 1}`) }));
  const text = {};
  for (const [lang, suffix] of Object.entries(LANGS)) {
    text[lang] = { sections: {}, items: {} };
    topics.forEach((t, i) => {
      text[lang].sections[`t${i + 1}`] = t[`topic${suffix}`];
      t.questions.forEach((q, j) => {
        text[lang].items[`t${i + 1}q${j + 1}`] = { q: q[`question${suffix}`], a: q[`answer${suffix}`] };
      });
    });
  }
  return { sections, text };
}

