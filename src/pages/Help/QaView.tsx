import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { getQaQuestion, normalizeQaSearch, qaQuestionHref, qaQuestions, qaTopics, readQaAddress, type QaTopic } from "../../lib/help/qaCatalog";
import { trackHelpQuestionOpen } from "../../lib/analytics/localEvents";
import guideStyles from "../GuideHubV2/GuideHubV2.module.css";
import helpStyles from "./help.module.css";
import styles from "./QaView.module.css";

export function useQaNavigation(active: boolean) {
  const { t } = useTranslation();
  const location = useLocation(), navigate = useNavigate();
  const address = readQaAddress(location.search, location.hash);
  const addressKey = `${location.key}:${location.pathname}${location.search}${location.hash}`;
  // Router transitions can commit after another activation. Keep pending toggles
  // synchronous; actual history navigation replaces this context without events.
  const interaction = useRef({ key: addressKey, opened: address.opened, target: location.pathname + location.search + location.hash });
  if (interaction.current.key !== addressKey) {
    interaction.current = { key: addressKey, opened: address.opened, target: location.pathname + location.search + location.hash };
  }
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ [address.topic.id]: true });
  useEffect(() => {
    if (active) setExpanded(previous => ({ ...previous, [address.topic.id]: true }));
  }, [active, address.topic.id]);
  useEffect(() => {
    if (!active || !address.question) return;
    const button = document.getElementById(`qa-question-${address.question.id}`);
    const scroller = button?.closest("main");
    button?.focus({ preventScroll: true });
    if (button && scroller) scroller.scrollTop += button.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16;
  }, [active, address.question?.id]);

  const update = (topic: QaTopic, section?: string, question?: string, opened = interaction.current.opened) => {
    const params = new URLSearchParams(location.search);
    params.set("view", "qa"); params.set("topic", topic.id);
    if (section && topic.nested) params.set("sub", section); else params.delete("sub");
    if (question) params.set("question", question); else params.delete("question");
    // Canonical catalog order, never arbitrary URL values or translated strings.
    const ids = qaQuestions.filter(item => opened.has(item.id)).map(item => item.id);
    if (ids.length) params.set("open", ids.join(",")); else params.delete("open");
    const search = `?${params}`;
    interaction.current.opened = opened;
    if (interaction.current.target === `/help${search}`) return;
    interaction.current.target = `/help${search}`;
    navigate({ pathname: "/help", search, hash: "" }, { state: location.state, preventScrollReset: true });
  };
  const selectQuestion = (id: string) => {
    const question = getQaQuestion(id);
    if (!question) return;
    const opened = new Set(interaction.current.opened);
    const opening = !opened.has(id);
    opened.add(id);
    update(question.topic, question.section.id, id, opened);
    if (opening) trackHelpQuestionOpen(id);
  };
  const toggleQuestion = (id: string) => {
    if (!interaction.current.opened.has(id)) { selectQuestion(id); return; }
    const opened = new Set(interaction.current.opened); opened.delete(id);
    update(address.topic, address.section?.id, address.question?.id === id ? undefined : address.question?.id, opened);
  };
  const questionClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); selectQuestion(id);
  };
  const needle = normalizeQaSearch(query);
  const matches = qaQuestions.filter(question => [
    t(`help.qa.topics.${question.topic.id}`),
    question.topic.nested ? t(`help.qa.sections.${question.section.id}`) : "",
    t(`help.qa.questions.${question.id}.question`),
  ].some(text => normalizeQaSearch(text).includes(needle)));
  return { ...address, query, setQuery, expanded, setExpanded, update, selectQuestion, toggleQuestion, questionClick, needle, matches };
}
type QaModel = ReturnType<typeof useQaNavigation>;

export function QaSidebar({ model: m }: { model: QaModel }) {
  const { t } = useTranslation();
  return <nav className={`${guideStyles.nav} ${styles.sidebar}`} aria-label={t("help.qa.navigation")} data-qa-navigation>
    <div className={guideStyles.navHeader}>
      <input className={guideStyles.searchInput} type="search" value={m.query} onChange={event => m.setQuery(event.target.value)}
        placeholder={t("help.qa.search")} aria-label={t("help.qa.search")} data-qa-search />
      {m.query && <button type="button" className={guideStyles.navItem} data-qa-clear onClick={() => m.setQuery("")}>{t("help.qa.clear")}</button>}
    </div>
    <div className={guideStyles.navScroller}>
      {m.needle && <p className={styles.searchStatus} role="status">{t(m.matches.length ? "help.qa.results" : "help.qa.noResults")}</p>}
      {qaTopics.map(topic => {
        const hits = m.matches.filter(question => question.topic.id === topic.id);
        if (m.needle && !hits.length) return null;
        const isOpen = !!m.needle || !!m.expanded[topic.id];
        return <div key={topic.id} className={guideStyles.navSection}>
          <button type="button" data-qa-topic={topic.id} className={`${guideStyles.navRow} ${guideStyles.categoryRow} ${m.topic.id === topic.id && !m.section ? guideStyles.navItemActive : ""}`}
            aria-current={m.topic.id === topic.id && !m.section ? "page" : undefined}
            aria-expanded={topic.nested ? isOpen : undefined} aria-controls={topic.nested ? `qa-branches-${topic.id}` : undefined}
            onClick={() => { m.setExpanded(previous => ({ ...previous, [topic.id]: !previous[topic.id] })); m.update(topic); }}>
            <span className={guideStyles.navRowLabel}>{t(`help.qa.topics.${topic.id}`)}</span>
            {topic.nested && <span aria-hidden="true" className={`${guideStyles.navRowChevron} ${isOpen ? guideStyles.navRowChevronOpen : ""}`} />}
          </button>
          {(topic.nested || m.needle) && <div id={`qa-branches-${topic.id}`} className={guideStyles.entryList} hidden={!isOpen}>
            {topic.sections.map(section => {
              const sectionHits = hits.filter(question => question.section.id === section.id);
              if (m.needle && !sectionHits.length) return null;
              return <div key={section.id} className={guideStyles.subSection}>
                {topic.nested && <button type="button" data-qa-sub={section.id}
                  className={`${guideStyles.subRow} ${m.topic.id === topic.id && m.section?.id === section.id ? guideStyles.navItemActive : ""}`}
                  aria-current={m.topic.id === topic.id && m.section?.id === section.id ? "page" : undefined}
                  onClick={() => m.update(topic, section.id)}>{t(`help.qa.sections.${section.id}`)}</button>}
                {m.needle && sectionHits.map(question => <a key={question.id} href={`#${qaQuestionHref(question.id)}`}
                  className={`${guideStyles.navItem} ${styles.result}`} data-qa-result={question.id}
                  onClick={event => m.questionClick(event, question.id)}>{t(`help.qa.questions.${question.id}.question`)}</a>)}
              </div>;
            })}
          </div>}
        </div>;
      })}
    </div>
  </nav>;
}

export function QaContent({ model: m }: { model: QaModel }) {
  const { t } = useTranslation();
  const location = useLocation();
  const groups = m.section ? [m.section] : m.topic.sections;
  return <div className={styles.content} data-qa-content>
    <h2 className={styles.title}>{t(`help.qa.topics.${m.topic.id}`)}{m.topic.nested && m.section ? ` / ${t(`help.qa.sections.${m.section.id}`)}` : ""}</h2>
    {groups.map(section => <section key={section.id} aria-label={m.topic.nested ? t(`help.qa.sections.${section.id}`) : t(`help.qa.topics.${m.topic.id}`)}>
      {m.topic.nested && !m.section && <h3 className={helpStyles.cardTitle}>{t(`help.qa.sections.${section.id}`)}</h3>}
      <div className={styles.questions}>
        {section.questions.map(id => {
          const question = getQaQuestion(id)!;
          const open = m.opened.has(id);
          return <article key={id} className={`${helpStyles.card} ${styles.question}`} data-qa-question={id}>
            <h3 className={styles.questionHeading}><button id={`qa-question-${id}`} type="button" className={styles.toggle}
              aria-expanded={open} aria-controls={`qa-answer-${id}`} onClick={() => m.toggleQuestion(id)}>
              <span>{t(`help.qa.questions.${id}.question`)}</span><ChevronDown aria-hidden="true" className={open ? styles.chevronOpen : undefined} />
            </button></h3>
            <div id={`qa-answer-${id}`} hidden={!open} role="region" aria-labelledby={`qa-question-${id}`} className={styles.answer}>
              {t(`help.qa.questions.${id}.answer`).split("\n\n").map((paragraph, index) => <p key={index} className={helpStyles.paragraph}>{paragraph}</p>)}
              {question.related && <div className={styles.related}><p>{t("help.qa.related")}</p><ul>{question.related.map(target => <li key={target}>
                <a href={`#${qaQuestionHref(target)}`} onClick={event => m.questionClick(event, target)}>{t(`help.qa.questions.${target}.question`)}</a>
              </li>)}</ul></div>}
              {question.action && <Link className={styles.action} to={question.action.to}
                state={{ returnTo: location.pathname + location.search, profileReturnState: location.state }}>{t(question.action.labelKey)}</Link>}
            </div>
          </article>;
        })}
      </div>
    </section>)}
  </div>;
}
