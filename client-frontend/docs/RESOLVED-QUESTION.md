| Q1 | Portfolio — Ticket UX | Should "Raise a Ticket" replace the inline Allot/Redeem row buttons entirely, or coexist as a supplementary entry point? |
- Entirely replaces the inline allot/redeem row button, but the ticket type should not only be limited to Allotment / Redemption Requestion, but also "Others".
- Solely resides in the portfolio page.
| Q2 | Portfolio — Historical | Does the "(Hist)" suffix signal any specific changes to the historical table (e.g., pagination, date filtering, export)? Or is it just acknowledging the existing section? |
- Since we already has the historical table, let's just adjusts its sementic meaning; the client no longer initiates request themselves, but tickets to be handled and resolved by the RM
- Meanwhile the pagination feature should be implemented, it is current hardcorded and unwired.
- Add a filter for searching feature
| Q3 | Portfolio — IB Account | What does "Associated IB Account" mean in context? Is it an Interactive Brokers account number, an internal account ID, or something else? How many IB accounts can be associated per model? |
- It is an interactive broker account number, hyperlinked. For now let's one account per model
| Q4 | Profile — Edit scope | Should email be editable from the Profile page, or is it locked to the auth provider (Firebase)? |
- The sensitive attributes like email, phone, and password should be ineditable directly in the profile page; this leaves to the setting page
| Q5 | Profile — Other Docs | What is the preferred section title: "Other Documents", "Supporting Documents", or something else? Which specific document categories should be listed? |
- Supporting Documents. When submitting it, there should be a dropdown selection specifying "Questionnaire", "Others", etc.
| Q6 | Header — Contact RM | Is "Contact RM" a global button (same RM for all users) or per-user (RM assignment is stored on the backend user record)? For the mock phase, a single static RM record is assumed. |
- The "Contact Advisor" button in the pop-up should be removed, replace by the email and the whatsapp of the assigned RM (Note: In this context Advisor refers to RM, but now let's stick to RM for more specificity)
| Q7 | Header — Rename | Should the existing "Contact Advisor" text in the help popup be renamed to "Contact RM", or should "Contact RM" be a new, separate button? |
- As answered in the previous question, the "Contact RM" aka "Contact Advisor" should be replaced with mere email / Whatsapp contact of the assigned RM
| Q8 | Legal Docs | What documents should be listed (ToS, Privacy Policy, Prospectus, others)? Are they downloadable PDFs or external links? |
- Any relevent document for experience invester client to reference
| Q9 | RM WhatsApp | Should the WhatsApp link open the web interface (`wa.me`) or a native deep link? Should there be a phone number displayed alongside, or just a WhatsApp icon? |
- WhatsApp icon with a phone number displayed alongside. Right now just static, no need for link