# FAQ content

`faq.csv` is the FAQ shown in the client portal — both the **Common Questions**
panel and the **Help Assistant** in Messages. Replacing this one file updates both.

## Columns

| topic_en | topic_zh | question_en | question_zh | answer_en | answer_zh |
|---|---|---|---|---|---|
| Account & Settings | 帳戶與設定 | How do I change my email? | 如何更改電郵？ | Go to Settings → … | 前往「設定」… |

- **One row per question**, English and Chinese side by side.
- Rows with the same `topic_en` are grouped into one topic. Topics and questions
  appear in the portal in the order they first appear in the sheet.
- Every cell must be filled in. Blank rows are ignored.
- A topic's `topic_zh` must be spelled the same on all of its rows.
- Line breaks inside an answer cell are kept (Alt+Enter in Excel, Ctrl+Enter in Google Sheets).

## Editing

**Google Sheets (recommended):** File → Import → Upload `faq.csv` to start from
the current version. When done: File → Download → **Comma-separated values (.csv)**.

**Excel:** open `faq.csv`, edit, then File → Save As → **CSV UTF-8 (Comma delimited)**.
Do not choose plain "CSV" — it can garble the Chinese text.

Hand the downloaded file to a developer to replace `content/faq/faq.csv`.

## Publishing (developers)

1. Replace `content/faq/faq.csv` with the new file (keep the name).
2. Run `npm run faq` — it checks the file and prints any problem with its row
   number, e.g. `content/faq/faq.csv row 7: empty cell(s): answer_zh`.
   (`npm run dev` and `npm run build` run this automatically.)
3. Commit `faq.csv` **and** the regenerated `components/faq/faq.generated.json`, then deploy.

Saved Help Assistant conversations from the previous FAQ are cleared automatically,
so no one sees an old answer under a new question.
