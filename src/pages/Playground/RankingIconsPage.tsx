import RankingIcon, { type RankingIconVariant } from "./RankingIcon";
import styles from "./RankingIconsPage.module.css";

const VARIANTS: Array<{ variant: RankingIconVariant; title: string; name: string; description: string }> = [
  { variant: "global", title: "Global", name: "Global", description: "Eine Welt · alle Spielwelten" },
  { variant: "server", title: "Normaler Server", name: "EU8", description: "EU-Flagge als Kugeloberfläche" },
  { variant: "fusion", title: "Fusionsserver", name: "F28", description: "Zwei Welten wachsen zusammen" },
];

const NAME_ONLY_VARIANTS: typeof VARIANTS = [
  { variant: "global", title: "Global", name: "Global", description: "Eine Welt · alle Spielwelten" },
  { variant: "server", title: "Normaler Server · EU8", name: "EU8", description: "Gemeinsame blaue Serverkugel" },
  { variant: "server", title: "Normaler Server · AM1", name: "AM1", description: "Gemeinsame blaue Serverkugel" },
  { variant: "fusion", title: "Fusionsserver", name: "F28", description: "Strudeloberfläche auf einer Welt" },
];

export default function RankingIconsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h2>Ranking Icons</h2>
        <p>Spielwelt, Rankingliste und Namenskennung als gemeinsame Bildsprache.</p>
      </header>
      <section className={styles.variantSection} aria-labelledby="ranking-variant-1" data-ranking-presentation="external">
        <h3 id="ranking-variant-1" className={styles.variantTitle}>Variante 1</h3>
        <div className={styles.grid}>
          {VARIANTS.map(({ variant, title, name, description }) => (
            <article key={variant} className={styles.card} aria-labelledby={`ranking-title-${variant}`}>
              <header className={styles.cardHeader}>
                <h4 id={`ranking-title-${variant}`}>{title}</h4>
                <p>{description}</p>
              </header>
              <div className={styles.largePreview} aria-label={`${name}: große Iconvorschau`}>
                <RankingIcon variant={variant} size={192} className={styles.largeIcon} />
                <span className={styles.largeName}>{name}</span>
              </div>
              <div className={styles.badgePreview}>
                <div className={styles.sizePreviews}>
                  {[64, 32].map((size) => (
                    <div key={size} className={styles.sizePreview} aria-label={`${name}: ${size}-px-Iconvorschau, Variante 1`}>
                      <span className={styles.sizeLabel}>Badge · {size} px</span>
                      <div className={`${styles.badge} ${size === 64 ? styles.badge64 : ""}`}>
                        <RankingIcon variant={variant} size={size} />
                        <span>{name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className={styles.variantSection} aria-labelledby="ranking-variant-2" data-ranking-presentation="surface">
        <header>
          <h3 id="ranking-variant-2" className={styles.variantTitle}>Variante 2</h3>
          <p className={styles.note}>Kennung und nummerierte Rankingliste auf der Kugeloberfläche.</p>
        </header>
        <div className={styles.grid}>
          {VARIANTS.map(({ variant, title, name, description }) => (
            <article key={variant} className={styles.card} aria-labelledby={`ranking-surface-title-${variant}`}>
              <header className={styles.cardHeader}>
                <h4 id={`ranking-surface-title-${variant}`}>{title}</h4>
                <p>{description}</p>
              </header>
              <div className={styles.largePreview} aria-label={`${name}: große Iconvorschau, Variante 2`}>
                <RankingIcon variant={variant} presentation="surface" size={192} className={styles.largeIcon} />
              </div>
              <div className={styles.badgePreview}>
                <div className={styles.sizePreviews}>
                  {[64, 32].map((size) => (
                    <div key={size} className={styles.sizePreview} aria-label={`${name}: ${size}-px-Iconvorschau, Variante 2`}>
                      <span className={styles.sizeLabel}>Badge · {size} px</span>
                      <RankingIcon variant={variant} presentation="surface" size={size} />
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className={styles.variantSection} aria-labelledby="ranking-variant-3" data-ranking-presentation="adaptive">
        <header>
          <h3 id="ranking-variant-3" className={styles.variantTitle}>Variante 3</h3>
          <p className={styles.note}>Gold, Silber und Bronze · bei 32 px nur die Kennung.</p>
        </header>
        <div className={styles.grid}>
          {VARIANTS.map(({ variant, title, name, description }) => (
            <article key={variant} className={styles.card} aria-labelledby={`ranking-adaptive-title-${variant}`}>
              <header className={styles.cardHeader}>
                <h4 id={`ranking-adaptive-title-${variant}`}>{title}</h4>
                <p>{variant === "fusion" ? "Strudeloberfläche auf einer Welt" : description}</p>
              </header>
              <div className={styles.largePreview} aria-label={`${name}: große Iconvorschau, Variante 3`}>
                <RankingIcon variant={variant} presentation="adaptive" size={192} className={styles.largeIcon} />
              </div>
              <div className={styles.badgePreview}>
                <div className={styles.sizePreviews}>
                  {[64, 32].map((size) => (
                    <div key={size} className={styles.sizePreview} aria-label={`${name}: ${size}-px-Iconvorschau, Variante 3`}>
                      <span className={styles.sizeLabel}>Badge · {size} px</span>
                      <RankingIcon variant={variant} presentation="adaptive" size={size} />
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className={styles.variantSection} aria-labelledby="ranking-variant-4" data-ranking-presentation="comic">
        <header>
          <h3 id="ranking-variant-4" className={styles.variantTitle}>Variante 4</h3>
          <p className={styles.note}>Wie Variante 3 · Kennungen in Comicschrift.</p>
        </header>
        <div className={styles.grid}>
          {VARIANTS.map(({ variant, title, name, description }) => (
            <article key={variant} className={styles.card} aria-labelledby={`ranking-comic-title-${variant}`}>
              <header className={styles.cardHeader}>
                <h4 id={`ranking-comic-title-${variant}`}>{title}</h4>
                <p>{variant === "fusion" ? "Strudeloberfläche auf einer Welt" : description}</p>
              </header>
              <div className={styles.largePreview} aria-label={`${name}: große Iconvorschau, Variante 4`}>
                <RankingIcon variant={variant} presentation="comic" size={192} className={styles.largeIcon} />
              </div>
              <div className={styles.badgePreview}>
                <div className={styles.sizePreviews}>
                  {[64, 32].map((size) => (
                    <div key={size} className={styles.sizePreview} aria-label={`${name}: ${size}-px-Iconvorschau, Variante 4`}>
                      <span className={styles.sizeLabel}>Badge · {size} px</span>
                      <RankingIcon variant={variant} presentation="comic" size={size} />
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className={styles.variantSection} aria-labelledby="ranking-variant-5" data-ranking-presentation="name-only">
        <header>
          <h3 id="ranking-variant-5" className={styles.variantTitle}>Variante 5</h3>
          <p className={styles.note}>Nur die Kennung in Comicschrift · normale Server teilen sich dieselbe blaue Kugel.</p>
        </header>
        <div className={`${styles.grid} ${styles.nameOnlyGrid}`}>
          {NAME_ONLY_VARIANTS.map(({ variant, title, name, description }) => (
            <article key={name} className={styles.card} aria-labelledby={`ranking-name-only-title-${name}`}>
              <header className={styles.cardHeader}>
                <h4 id={`ranking-name-only-title-${name}`}>{title}</h4>
                <p>{description}</p>
              </header>
              <div className={styles.largePreview} aria-label={`${name}: große Iconvorschau, Variante 5`}>
                <RankingIcon variant={variant} presentation="name-only" serverCode={name} size={192} className={styles.largeIcon} />
              </div>
              <div className={styles.badgePreview}>
                <div className={styles.sizePreviews}>
                  {[64, 32].map((size) => (
                    <div key={size} className={styles.sizePreview} aria-label={`${name}: ${size}-px-Iconvorschau, Variante 5`}>
                      <span className={styles.sizeLabel}>Badge · {size} px</span>
                      <RankingIcon variant={variant} presentation="name-only" serverCode={name} size={size} />
                    </div>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <p className={styles.note}>Die Fusionsmotive sind auch für Namensserver vorgesehen.</p>
    </div>
  );
}
