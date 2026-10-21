"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle, MessagesSquare } from "@/lib/icons";
import { FloatingPanel } from "@/components/ui/FloatingPanel";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { FaqList } from "./FaqList";
import { FaqAnswerView } from "./FaqAnswerView";
import { FAQ_SECTIONS, filterFaq } from "./faqContent";

// The list and answer pages sit side by side and slide horizontally.
// `invisible` takes the off-screen page out of the tab order / a11y tree;
// visibility is in the transition so it flips only once the slide ends.
const PAGE =
  "absolute inset-0 overflow-auto transition-[transform,visibility] duration-300 ease-in-out motion-reduce:transition-none";

interface OpenQuestion {
  section: string;
  item: string;
}

/** Common questions in a FloatingPanel — opened from the FAB's FAQ action. */
export function FaqPopup({
  onClose,
  onOpenChat,
  sidebarWidth = 0,
}: {
  onClose: () => void;
  /** "Still need help?" hands off to the chat panel. */
  onOpenChat: () => void;
  sidebarWidth?: number;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  // `showing` drives the slide; `answer` is not cleared on back, so the answer
  // page keeps its text while it slides out instead of going blank.
  const [showing, setShowing] = useState(false);
  const [answer, setAnswer] = useState<OpenQuestion | null>(null);
  const sections = filterFaq(FAQ_SECTIONS, query, t);

  function openQuestion(q: OpenQuestion) {
    setAnswer(q);
    setShowing(true);
  }

  return (
    <FloatingPanel label={t("faq.title")} storageKey="faq-popup-size" sidebarWidth={sidebarWidth}>
      {({ maximized, toggleMaximize }) => (
        <div className="h-full flex flex-col bg-surface-lowest">
          <PanelHeader
            avatar={
              <span className="size-[34px] rounded-full inline-flex items-center justify-center bg-primary/10 text-primary shrink-0">
                <HelpCircle size={18} strokeWidth={1.75} />
              </span>
            }
            title={t("faq.title")}
            subtitle={t("faq.subtitle")}
            maximized={maximized}
            onToggleMaximize={toggleMaximize}
            onClose={onClose}
            closeLabel={t("faq.close")}
          />

          <div className="flex-1 min-h-0 relative overflow-hidden">
            {/* List page — slides out to the left */}
            <div className={[PAGE, showing ? "-translate-x-full invisible" : "translate-x-0"].join(" ")}>
              <FaqList
                query={query}
                onQueryChange={setQuery}
                sections={sections}
                onOpen={(section, item) => openQuestion({ section, item })}
              />
            </div>

            {/* Answer page — slides in from the right */}
            <div className={[PAGE, showing ? "translate-x-0" : "translate-x-full invisible"].join(" ")}>
              {answer && (
                <FaqAnswerView
                  section={t(`faq.sections.${answer.section}`)}
                  question={t(`faq.items.${answer.item}.q`)}
                  answer={t(`faq.items.${answer.item}.a`)}
                  onBack={() => setShowing(false)}
                />
              )}
            </div>
          </div>

          {/* Hand-off to a human */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-3 border-t border-outline-variant bg-surface-low shrink-0">
            <span className="text-body-sm text-secondary">{t("faq.still_need_help")}</span>
            <button
              type="button"
              onClick={onOpenChat}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border-none cursor-pointer bg-primary text-primary-foreground text-[12.5px] font-bold hover:opacity-90 transition-opacity"
            >
              <MessagesSquare size={15} strokeWidth={1.75} />
              {t("faq.message_team")}
            </button>
          </div>
        </div>
      )}
    </FloatingPanel>
  );
}
