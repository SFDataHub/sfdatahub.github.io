// FILE: src/pages/GuideHub/Fortress/PackageSkipOrder.tsx
import React from "react";
import styles from "./PackageSkipOrder.module.css";

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
              <tr><td>Fortress</td><td>1</td><td>10</td><td>2</td><td>0</td><td>0</td></tr>
              <tr><td>Laborer's Quarter</td><td>1</td><td>5</td><td>2</td><td>35</td><td>12</td></tr>
              <tr><td>Fortress</td><td>2</td><td>20</td><td>4</td><td>150</td><td>50</td></tr>
              <tr><td>Laborer's Quarter</td><td>2</td><td>10</td><td>3</td><td>138</td><td>46</td></tr>
              <tr><td>Fortress</td><td>3</td><td>30</td><td>6</td><td>440</td><td>140</td></tr>
              <tr><td>Laborer's Quarter</td><td>3</td><td>15</td><td>6</td><td>406</td><td>129</td></tr>
              <tr><td>Fortress</td><td>4</td><td>40</td><td>12</td><td>1,100</td><td>333</td></tr>
              <tr><td>Laborer's Quarter</td><td>4</td><td>20</td><td>12</td><td>1,015</td><td>308</td></tr>
              <tr><td>Fortress</td><td>5</td><td>50</td><td>24</td><td>2,500</td><td>800</td></tr>
              <tr><td>Laborer's Quarter</td><td>5</td><td>25</td><td>24</td><td>2,308</td><td>738</td></tr>
              <tr><td>Fortress</td><td>6</td><td>60</td><td>36</td><td>6,000</td><td>2,000</td></tr>
              <tr><td>Laborer's Quarter</td><td>6</td><td>30</td><td>36</td><td>5,538</td><td>1,849</td></tr>
              <tr><td>Fortress</td><td>7</td><td>70</td><td>48</td><td>13,417</td><td>4,433</td></tr>
              <tr><td>Fortress</td><td>8</td><td>80</td><td>78</td><td>27,200</td><td>9,280</td></tr>
              <tr><td>Hall of Knight</td><td>1</td><td>0</td><td>0</td><td>720</td><td>240</td></tr>
              <tr><td>Hall of Knight</td><td>2</td><td>0</td><td>0</td><td>1,408</td><td>448</td></tr>
              <tr><td>Hall of Knight</td><td>3</td><td>0</td><td>0</td><td>2,640</td><td>800</td></tr>
              <tr><td>Gem Mine</td><td>1</td><td>15</td><td>2</td><td>50</td><td>17</td></tr>
              <tr><td>Treasury</td><td>1</td><td>25</td><td>2</td><td>40</td><td>13</td></tr>
              <tr><td>Woodcutter</td><td>1</td><td>2</td><td>2</td><td>0</td><td>20</td></tr>
              <tr><td>Woodcutter</td><td>2</td><td>4</td><td>3</td><td>30</td><td>20</td></tr>
              <tr><td>Woodcutter</td><td>3</td><td>6</td><td>5</td><td>92</td><td>74</td></tr>
              <tr><td>Woodcutter</td><td>4</td><td>8</td><td>10</td><td>248</td><td>200</td></tr>
              <tr><td>Woodcutter</td><td>5</td><td>10</td><td>21</td><td>500</td><td>320</td></tr>
              <tr><td>Quarry</td><td>1</td><td>3</td><td>2</td><td>22</td><td>0</td></tr>
              <tr><td>Quarry</td><td>2</td><td>6</td><td>3</td><td>90</td><td>16</td></tr>
              <tr><td>Quarry</td><td>3</td><td>9</td><td>5</td><td>264</td><td>45</td></tr>
              <tr><td>Quarry</td><td>4</td><td>12</td><td>10</td><td>660</td><td>107</td></tr>
              <tr><td>Barracks</td><td>1</td><td>4</td><td>2</td><td>20</td><td>14</td></tr>
              <tr><td>Barracks</td><td>2</td><td>8</td><td>3</td><td>82</td><td>55</td></tr>
              <tr><td>Total cost</td><td>-</td><td>577</td><td>363</td><td>99,881</td><td>33,218</td></tr>
              <tr><td>Fortress Pack ressources</td><td>-</td><td>-</td><td>300</td><td>100,000</td><td>50,000</td></tr>
              <tr><td>Left over</td><td>-</td><td>-577</td><td>-63</td><td>119</td><td>16,782</td></tr>
            </tbody>
          </table>
        </section>

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
