// src/pages/GuideHub/PackageSkipOrder.tsx
import React from "react";
import styles from "./PackageSkipOrder.module.css"; // Die CSS-Datei für die Seite

export default function PackageSkipOrder() {
  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.headerBar}>
        <h2 className={styles.title}>Fortress Package skip order</h2>
        <span className={styles.meta}>Last updated: 21.02.2025</span>
      </div>
      <p className={styles.description}>
        This guide outlines the optimal order to upgrade your Fortress and associated buildings in Shakes & Fidget. Follow the suggested order to minimize resource use and maximize efficiency.
      </p>

      {/* Main content: Table and Info Box */}
      <div className={styles.contentWrapper}>
        {/* Fortress Build Order Table */}
        <section className={styles.tableSection}>
          <h3 className={styles.sectionTitle}>Fortress Build Order</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Building</th>
                <th>Level</th>
                <th>Gold Cost</th>
                <th>Shroom Cost</th>
                <th>Wood Cost</th>
                <th>Stone Cost</th>
              </tr>
            </thead>
            <tbody>
              {/* Fortress and Laborer's Quarter entries */}
              <tr>
                <td>Fortress</td>
                <td>Level 10</td>
                <td>2</td>
                <td>0</td>
                <td>0</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Laborer's Quarter</td>
                <td>Level 5</td>
                <td>2</td>
                <td>35</td>
                <td>50</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Fortress</td>
                <td>Level 20</td>
                <td>4</td>
                <td>150</td>
                <td>50</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Laborer's Quarter</td>
                <td>Level 10</td>
                <td>3</td>
                <td>138</td>
                <td>46</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Fortress</td>
                <td>Level 30</td>
                <td>6</td>
                <td>440</td>
                <td>140</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Laborer's Quarter</td>
                <td>Level 15</td>
                <td>6</td>
                <td>406</td>
                <td>129</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Fortress</td>
                <td>Level 40</td>
                <td>12</td>
                <td>1,100</td>
                <td>333</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Laborer's Quarter</td>
                <td>Level 20</td>
                <td>12</td>
                <td>1,015</td>
                <td>308</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Fortress</td>
                <td>Level 50</td>
                <td>24</td>
                <td>2,500</td>
                <td>800</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Laborer's Quarter</td>
                <td>Level 25</td>
                <td>24</td>
                <td>2,308</td>
                <td>738</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Fortress</td>
                <td>Level 60</td>
                <td>36</td>
                <td>6,000</td>
                <td>2,000</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Laborer's Quarter</td>
                <td>Level 30</td>
                <td>36</td>
                <td>5,538</td>
                <td>1,849</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Fortress</td>
                <td>Level 70</td>
                <td>48</td>
                <td>13,417</td>
                <td>4,433</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Fortress</td>
                <td>Level 80</td>
                <td>78</td>
                <td>27,200</td>
                <td>9,280</td>
                <td>-</td>
              </tr>
              {/* Hall of Knight entries */}
              <tr>
                <td>Hall of Knight</td>
                <td>-</td>
                <td>-</td>
                <td>720</td>
                <td>240</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Hall of Knight</td>
                <td>-</td>
                <td>-</td>
                <td>1,408</td>
                <td>448</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Hall of Knight</td>
                <td>-</td>
                <td>-</td>
                <td>2,640</td>
                <td>800</td>
                <td>-</td>
              </tr>
              {/* Gem Mine and other buildings */}
              <tr>
                <td>Gem Mine</td>
                <td>Level 1</td>
                <td>2</td>
                <td>50</td>
                <td>17</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Treasury</td>
                <td>Level 1</td>
                <td>2</td>
                <td>40</td>
                <td>13</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Woodcutter</td>
                <td>Level 1</td>
                <td>2</td>
                <td>0</td>
                <td>20</td>
                <td>-</td>
              </tr>
              <tr>
                <td>Woodcutter</td>
                <td>Level 2</td>
                <td>3</td>
                <td>30</td>
                <td>20</td>
                <td>-</td>
              </tr>
              {/* Add more rows as needed */}
            </tbody>
          </table>
        </section>

        {/* Info Box */}
        <section className={styles.infoBox}>
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
