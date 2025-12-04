import React from "react";
import ContentShell from "../../components/ContentShell";
import styles from "./help.module.css";
import { useTranslation } from "react-i18next";

type Section = {
  key: string;
  title: string;
  bullets?: string[];
  paragraphs?: string[];
};

const HelpPage: React.FC = () => {
  const { t } = useTranslation();
  const dataFreshnessParagraphs = t("help.dataFreshness.body").split("\n\n");

  const sections: Section[] = [
    {
      key: "intro",
      title: t("help.sections.intro.title"),
      paragraphs: [t("help.sections.intro.body1"), t("help.sections.intro.body2")],
    },
    {
      key: "actions",
      title: t("help.sections.actions.title"),
      bullets: [
        t("help.sections.actions.items.toplists"),
        t("help.sections.actions.items.profiles"),
        t("help.sections.actions.items.guides"),
        t("help.sections.actions.items.tools"),
      ],
    },
    {
      key: "freshness",
      title: t("help.dataFreshness.title"),
      paragraphs: dataFreshnessParagraphs,
    },
    {
      key: "login",
      title: t("help.sections.login.title"),
      paragraphs: [
        t("help.sections.login.body1"),
        t("help.sections.login.body2"),
        t("help.sections.login.body3"),
        t("help.sections.login.body4"),
      ],
    },
    {
      key: "legal",
      title: t("help.sections.legal.title"),
      paragraphs: [
        t("help.sections.legal.body1"),
        t("help.sections.legal.body2"),
        t("help.sections.legal.body3"),
      ],
      bullets: [
        t("help.sections.legal.items.tos"),
        t("help.sections.legal.items.privacy"),
        t("help.sections.legal.items.imprint"),
      ],
    },
  ];

  return (
    <ContentShell
      title={t("help.title")}
      subtitle={t("help.subtitle")}
      centerFramed
      padded
    >
      <div className={styles.root}>
        <section className={styles.hero}>
          <div>
            <p className={styles.eyebrow}>{t("help.hero.eyebrow")}</p>
            <h1 className={styles.heading}>{t("help.hero.heading")}</h1>
            <p className={styles.lead}>{t("help.hero.lead")}</p>
          </div>
          <div className={styles.freshnessHint}>
            <div className={styles.hintLabel}>{t("help.hero.freshnessLabel")}</div>
            <p className={styles.hintText}>{t("help.hero.freshnessBody")}</p>
          </div>
        </section>

        <div className={styles.grid}>
          {sections.map((section) => (
            <section key={section.key} className={styles.card}>
              <h2 className={styles.cardTitle}>{section.title}</h2>
              {section.paragraphs?.map((text, idx) => (
                <p key={`${section.key}-p-${idx}`} className={styles.paragraph}>
                  {text}
                </p>
              ))}
              {section.bullets && (
                <ul className={styles.list}>
                  {section.bullets.map((item) => (
                    <li key={`${section.key}-${item}`} className={styles.listItem}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </div>
    </ContentShell>
  );
};

export default HelpPage;
