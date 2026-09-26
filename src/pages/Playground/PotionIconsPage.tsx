import CombinedPotionIcon from "../../components/potions/CombinedPotionIcon";
import styles from "./PotionIconsPage.module.css";

export default function PotionIconsPage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h2 className={styles.title}>Tränke-Icons</h2>
        <p className={styles.subtitle}>Original-Assets aus der Spielerprofil-Zuordnung.</p>
      </header>

      <section className={styles.previewStage} aria-label="Tränke-Icon Vorschau">
        <CombinedPotionIcon className={styles.previewIcon} size="min(440px, 82vw)" />
      </section>
    </div>
  );
}
