// npm run faq — turns content/faq/faq.csv (questions) and assistant.csv (the
// help assistant's lines) into components/faq/faq.generated.json.
// Runs automatically before `npm run dev` and `npm run build` (predev/prebuild),
// so replacing the CSVs is all a content change needs.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAssistantCsv, parseFaqCsv } from "./parseFaqCsv.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FAQ_SOURCE = "content/faq/faq.csv";
const ASSISTANT_SOURCE = "content/faq/assistant.csv";
const OUT = join(root, "components", "faq", "faq.generated.json");

try {
  const faq = {
    ...parseFaqCsv(readFileSync(join(root, FAQ_SOURCE), "utf8"), FAQ_SOURCE),
    assistant: parseAssistantCsv(readFileSync(join(root, ASSISTANT_SOURCE), "utf8"), ASSISTANT_SOURCE),
  };
  // Changes whenever the content does; saved help-assistant transcripts from
  // an older version are discarded rather than shown against new questions.
  const version = createHash("sha256").update(JSON.stringify(faq)).digest("hex").slice(0, 12);

  writeFileSync(OUT, JSON.stringify({ version, ...faq }, null, 2) + "\n");
  const count = faq.sections.reduce((n, s) => n + s.items.length, 0);
  console.log(`FAQ: ${faq.sections.length} topics, ${count} questions → components/faq/faq.generated.json (${version})`);
} catch (err) {
  console.error(`\nFAQ build failed: ${err.message}\n`);
  process.exit(1);
}
