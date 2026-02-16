// FILE: src/pages/GuideHub/Fortress/PackageSkipOrder.tsx
import React from "react";
import styles from "./PackageSkipOrder.module.css";

type PackageSkipOrderTableVariant = "guidehub" | "underworld";

export function PackageSkipOrderTable({
  variant = "guidehub",
}: {
  variant?: PackageSkipOrderTableVariant;
}) {
  const isUnderworld = variant === "underworld";
  const thClass = isUnderworld ? styles.uwTh : undefined;
  const thNumberClass = isUnderworld ? `${styles.uwTh} ${styles.uwTdNumber}` : undefined;
  const tdClass = isUnderworld ? styles.uwTd : undefined;
  const tdNumberClass = isUnderworld ? `${styles.uwTd} ${styles.uwTdNumber}` : undefined;

  const table = (
    <div className={isUnderworld ? styles.uwTableWrap : undefined}>
      <table className={isUnderworld ? styles.uwTable : styles.table}>
        <thead>
          <tr>
            <th className={thClass}>Building</th>
            <th className={thNumberClass}>Level</th>
            <th className={thNumberClass}>Gold Cost</th>
            <th className={thNumberClass}>Shroom Cost</th>
            <th className={thNumberClass}>Wood Cost</th>
            <th className={thNumberClass}>Stone Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className={tdClass}>Fortress</td><td className={tdNumberClass}>1</td><td className={tdNumberClass}>10</td><td className={tdNumberClass}>2</td><td className={tdNumberClass}>0</td><td className={tdNumberClass}>0</td></tr>
          <tr><td className={tdClass}>Laborer's Quarter</td><td className={tdNumberClass}>1</td><td className={tdNumberClass}>5</td><td className={tdNumberClass}>2</td><td className={tdNumberClass}>35</td><td className={tdNumberClass}>12</td></tr>
          <tr><td className={tdClass}>Fortress</td><td className={tdNumberClass}>2</td><td className={tdNumberClass}>20</td><td className={tdNumberClass}>4</td><td className={tdNumberClass}>150</td><td className={tdNumberClass}>50</td></tr>
          <tr><td className={tdClass}>Laborer's Quarter</td><td className={tdNumberClass}>2</td><td className={tdNumberClass}>10</td><td className={tdNumberClass}>3</td><td className={tdNumberClass}>138</td><td className={tdNumberClass}>46</td></tr>
          <tr><td className={tdClass}>Fortress</td><td className={tdNumberClass}>3</td><td className={tdNumberClass}>30</td><td className={tdNumberClass}>6</td><td className={tdNumberClass}>440</td><td className={tdNumberClass}>140</td></tr>
          <tr><td className={tdClass}>Laborer's Quarter</td><td className={tdNumberClass}>3</td><td className={tdNumberClass}>15</td><td className={tdNumberClass}>6</td><td className={tdNumberClass}>406</td><td className={tdNumberClass}>129</td></tr>
          <tr><td className={tdClass}>Fortress</td><td className={tdNumberClass}>4</td><td className={tdNumberClass}>40</td><td className={tdNumberClass}>12</td><td className={tdNumberClass}>1,100</td><td className={tdNumberClass}>333</td></tr>
          <tr><td className={tdClass}>Laborer's Quarter</td><td className={tdNumberClass}>4</td><td className={tdNumberClass}>20</td><td className={tdNumberClass}>12</td><td className={tdNumberClass}>1,015</td><td className={tdNumberClass}>308</td></tr>
          <tr><td className={tdClass}>Fortress</td><td className={tdNumberClass}>5</td><td className={tdNumberClass}>50</td><td className={tdNumberClass}>24</td><td className={tdNumberClass}>2,500</td><td className={tdNumberClass}>800</td></tr>
          <tr><td className={tdClass}>Laborer's Quarter</td><td className={tdNumberClass}>5</td><td className={tdNumberClass}>25</td><td className={tdNumberClass}>24</td><td className={tdNumberClass}>2,308</td><td className={tdNumberClass}>738</td></tr>
          <tr><td className={tdClass}>Fortress</td><td className={tdNumberClass}>6</td><td className={tdNumberClass}>60</td><td className={tdNumberClass}>36</td><td className={tdNumberClass}>6,000</td><td className={tdNumberClass}>2,000</td></tr>
          <tr><td className={tdClass}>Laborer's Quarter</td><td className={tdNumberClass}>6</td><td className={tdNumberClass}>30</td><td className={tdNumberClass}>36</td><td className={tdNumberClass}>5,538</td><td className={tdNumberClass}>1,849</td></tr>
          <tr><td className={tdClass}>Fortress</td><td className={tdNumberClass}>7</td><td className={tdNumberClass}>70</td><td className={tdNumberClass}>48</td><td className={tdNumberClass}>13,417</td><td className={tdNumberClass}>4,433</td></tr>
          <tr><td className={tdClass}>Fortress</td><td className={tdNumberClass}>8</td><td className={tdNumberClass}>80</td><td className={tdNumberClass}>78</td><td className={tdNumberClass}>27,200</td><td className={tdNumberClass}>9,280</td></tr>
          <tr><td className={tdClass}>Hall of Knight</td><td className={tdNumberClass}>1</td><td className={tdNumberClass}>0</td><td className={tdNumberClass}>0</td><td className={tdNumberClass}>720</td><td className={tdNumberClass}>240</td></tr>
          <tr><td className={tdClass}>Hall of Knight</td><td className={tdNumberClass}>2</td><td className={tdNumberClass}>0</td><td className={tdNumberClass}>0</td><td className={tdNumberClass}>1,408</td><td className={tdNumberClass}>448</td></tr>
          <tr><td className={tdClass}>Hall of Knight</td><td className={tdNumberClass}>3</td><td className={tdNumberClass}>0</td><td className={tdNumberClass}>0</td><td className={tdNumberClass}>2,640</td><td className={tdNumberClass}>800</td></tr>
		      <tr><td className={tdClass}>Hall of Knight</td><td className={tdNumberClass}>4</td><td className={tdNumberClass}>0</td><td className={tdNumberClass}>0</td><td className={tdNumberClass}>4,800</td><td className={tdNumberClass}>1,536</td></tr>
		      <tr><td className={tdClass}>Hall of Knight</td><td className={tdNumberClass}>5</td><td className={tdNumberClass}>0</td><td className={tdNumberClass}>0</td><td className={tdNumberClass}>9,600</td><td className={tdNumberClass}>3,200</td></tr>
		      <tr><td className={tdClass}>Hall of Knight</td><td className={tdNumberClass}>6</td><td className={tdNumberClass}>0</td><td className={tdNumberClass}>0</td><td className={tdNumberClass}>18,400</td><td className={tdNumberClass}>6,080</td></tr>
          <tr><td className={tdClass}>Gem Mine</td><td className={tdNumberClass}>1</td><td className={tdNumberClass}>15</td><td className={tdNumberClass}>2</td><td className={tdNumberClass}>50</td><td className={tdNumberClass}>17</td></tr>
          <tr><td className={tdClass}>Treasury</td><td className={tdNumberClass}>1</td><td className={tdNumberClass}>25</td><td className={tdNumberClass}>2</td><td className={tdNumberClass}>40</td><td className={tdNumberClass}>13</td></tr>
          <tr><td className={tdClass}>Woodcutter</td><td className={tdNumberClass}>1</td><td className={tdNumberClass}>2</td><td className={tdNumberClass}>2</td><td className={tdNumberClass}>0</td><td className={tdNumberClass}>20</td></tr>
          <tr><td className={tdClass}>Woodcutter</td><td className={tdNumberClass}>2</td><td className={tdNumberClass}>4</td><td className={tdNumberClass}>3</td><td className={tdNumberClass}>30</td><td className={tdNumberClass}>20</td></tr>
          <tr><td className={tdClass}>Woodcutter</td><td className={tdNumberClass}>3</td><td className={tdNumberClass}>6</td><td className={tdNumberClass}>5</td><td className={tdNumberClass}>88</td><td className={tdNumberClass}>56</td></tr>
          <tr><td className={tdClass}>Woodcutter</td><td className={tdNumberClass}>4</td><td className={tdNumberClass}>8</td><td className={tdNumberClass}>10</td><td className={tdNumberClass}>220</td><td className={tdNumberClass}>133</td></tr>
          <tr><td className={tdClass}>Woodcutter</td><td className={tdNumberClass}>5</td><td className={tdNumberClass}>10</td><td className={tdNumberClass}>21</td><td className={tdNumberClass}>500</td><td className={tdNumberClass}>320</td></tr>
          <tr><td className={tdClass}>Quarry</td><td className={tdNumberClass}>1</td><td className={tdNumberClass}>3</td><td className={tdNumberClass}>2</td><td className={tdNumberClass}>22</td><td className={tdNumberClass}>0</td></tr>
          <tr><td className={tdClass}>Quarry</td><td className={tdNumberClass}>2</td><td className={tdNumberClass}>6</td><td className={tdNumberClass}>3</td><td className={tdNumberClass}>90</td><td className={tdNumberClass}>16</td></tr>
          <tr><td className={tdClass}>Quarry</td><td className={tdNumberClass}>3</td><td className={tdNumberClass}>9</td><td className={tdNumberClass}>5</td><td className={tdNumberClass}>264</td><td className={tdNumberClass}>45</td></tr>
          <tr><td className={tdClass}>Quarry</td><td className={tdNumberClass}>4</td><td className={tdNumberClass}>12</td><td className={tdNumberClass}>10</td><td className={tdNumberClass}>660</td><td className={tdNumberClass}>107</td></tr>
          <tr><td className={tdClass}>Barracks</td><td className={tdNumberClass}>1</td><td className={tdNumberClass}>4</td><td className={tdNumberClass}>2</td><td className={tdNumberClass}>20</td><td className={tdNumberClass}>14</td></tr>
          <tr><td className={tdClass}>Barracks</td><td className={tdNumberClass}>2</td><td className={tdNumberClass}>8</td><td className={tdNumberClass}>3</td><td className={tdNumberClass}>82</td><td className={tdNumberClass}>55</td></tr>
          <tr><td className={tdClass}>Total cost</td><td className={tdNumberClass}>-</td><td className={tdNumberClass}>577</td><td className={tdNumberClass}>363</td><td className={tdNumberClass}>99,881</td><td className={tdNumberClass}>33,218</td></tr>
          <tr><td className={tdClass}>Fortress Pack ressources</td><td className={tdNumberClass}>-</td><td className={tdNumberClass}>-</td><td className={tdNumberClass}>300</td><td className={tdNumberClass}>100,000</td><td className={tdNumberClass}>50,000</td></tr>
          <tr><td className={tdClass}>Left over</td><td className={tdNumberClass}>-</td><td className={tdNumberClass}>-577</td><td className={tdNumberClass}>-63</td><td className={tdNumberClass}>119</td><td className={tdNumberClass}>16,782</td></tr>
        </tbody>
      </table>
    </div>
  );

  if (isUnderworld) {
    return (
      <div className={styles.uwWrap}>
        <div className={styles.uwCard}>
          <h2 className={styles.uwTitle}>Fortress Build Order</h2>
          {table}
        </div>
      </div>
    );
  }

  return (
    <section className={styles.tableSection}>
      <h3 className={styles.sectionTitle}>Fortress Build Order</h3>
      {table}
    </section>
  );
}

export default function PackageSkipOrder() {
  return (
    <div className={styles.wrap}>
      {/* Header (wie AMRuneBonuses: Titelzeile mit unterer Trennlinie) */}
      <div className={styles.headerBar}>
        <h2 className={styles.title}>Fortress Package skip order</h2>
        <span className={styles.meta}>Last updated: 21.02.2025</span>
      </div>

      <p className={styles.description}>
        This guide outlines the optimal order to upgrade your Fortress and associated buildings in Shakes &amp; Fidget. Follow the suggested order to minimize resource use and maximize efficiency.
      </p>

      {/* Main content: Table and Info Box */}
      <div className={styles.contentWrapper}>
        {/* Fortress Build Order Table */}
        <PackageSkipOrderTable />

        {/* Info Box */}
        <section className={styles.infoBox}>
          <h3 className={styles.sectionTitle}>Important</h3>
          <p>Completely ignore building the following buildings until you have built everything else to MAX:</p>
          <ul>
            <li>Archery Guild</li>
            <li>Mage&apos;s Tower</li>
            <li>Fortifications</li>
          </ul>

          <div className={styles.divider} />

          <h3 className={styles.sectionTitle}>Total Costs</h3>
          <p>
            <strong>Total Gold:</strong> 577 <br />
            <strong>Total Shrooms:</strong> 363 <br />
            <strong>Total Wood:</strong> 99,881 <br />
            <strong>Total Stone:</strong> 33,218 <br />
          </p>

          <h3 className={styles.sectionTitle}>Remaining Resources</h3>
          <p>
            <strong>Remaining Gold:</strong> -577 <br />
            <strong>Remaining Shrooms:</strong> -63 <br />
            <strong>Remaining Wood:</strong> 119 <br />
            <strong>Remaining Stone:</strong> 16,782
          </p>
        </section>
      </div>
    </div>
  );
}
