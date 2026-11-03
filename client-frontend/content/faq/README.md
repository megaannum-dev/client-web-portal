# FAQ content

Two spreadsheets (saved as CSV) control the FAQ in the client portal:

| File | What it controls |
|---|---|
| `faq.csv` | The topics, questions and answers — shown in the **Common Questions** panel and offered by the **Help Assistant** in Messages |
| `assistant.csv` | What the Help Assistant itself says: its greeting, follow-up questions, and the Yes / No / "not listed" buttons |

## faq.csv columns

| topic_en | topic_zh | question_en | question_zh | answer_en | answer_zh |
|---|---|---|---|---|---|
| Account & Settings | 帳戶與設定 | How do I change my email? | 如何更改電郵？ | Go to Settings → … | 前往「設定」… |

- **One row per question**, English and Chinese side by side.
- Rows with the same `topic_en` are grouped into one topic. Topics and questions
  appear in the portal in the order they first appear in the sheet.
- Every cell must be filled in. Blank rows are ignored.
- A topic's `topic_zh` must be spelled the same on all of its rows.
- Line breaks inside an answer cell are kept (Alt+Enter in Excel, Ctrl+Enter in Google Sheets).

## assistant.csv columns

| key | where_it_appears | text_en | text_zh |
|---|---|---|---|
| ask_topic | Greeting — asks the client to pick a topic | Hi! What would you like help with? … | 您好！請問需要甚麼協助？… |

- **Only edit `text_en` and `text_zh`.** The `key` column must stay exactly as it is,
  and every key must appear once — don't add or delete rows.
- `where_it_appears` is a note to help you; it isn't shown anywhere.
- `ask_question` must keep `{{topic}}` in both languages — the portal replaces it
  with the topic the client picked.

## Editing

**Google Sheets (recommended):** File → Import → Upload the CSV to start from
the current version. When done: File → Download → **Comma-separated values (.csv)**.

**Excel:** open the CSV, edit, then File → Save As → **CSV UTF-8 (Comma delimited)**.
Do not choose plain "CSV" — it can garble the Chinese text.

Hand the downloaded file(s) to a developer, keeping the names `faq.csv` / `assistant.csv`.

## Publishing (developers)

1. Replace `content/faq/faq.csv` and/or `content/faq/assistant.csv` with the new file(s).
2. Run `npm run faq` — it checks both files and prints any problem with its row
   number, e.g. `content/faq/faq.csv row 7: empty cell(s): answer_zh`.
   (`npm run dev` and `npm run build` run this automatically.)
3. Commit the CSV(s) **and** the regenerated `components/faq/faq.generated.json`, then deploy.

Saved Help Assistant conversations from the previous FAQ are cleared automatically,
so no one sees an old answer under a new question.
