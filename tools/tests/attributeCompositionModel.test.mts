import assert from "node:assert/strict";
import type { AttributeCode, AttributeCompositionItem } from "../../src/lib/parsing/latestValues";
import {
  aggregateAttributeCompositionSourceTotals,
  buildAttributeCompositionRadarModel,
  buildAttributeCompositionSegments,
  createAttributeCompositionModelFromNormalizedAttributes,
  createAttributeCompositionModelFromStats,
  type AttributeCompositionModel,
} from "../../src/components/attribute-composition/attributeCompositionModel";
import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer";

type TestCase = {
  name: string;
  run: () => void;
};

const CODES: AttributeCode[] = ["str", "dex", "int", "con", "lck"];

const labels = {
  base: "Base",
  baseItems: "Base Items",
  upgrades: "Upgrades",
  equipment: "Equipment",
  gems: "Gems",
  pet: "Pet Bonus",
  potion: "Potion",
  petBonus: "Pet Count",
  other: "Other",
};

const attribute = (
  code: AttributeCode,
  overrides: Partial<AttributeCompositionItem> = {},
  breakdownOverrides: Partial<AttributeCompositionItem["breakdown"]> = {},
): AttributeCompositionItem => ({
  code,
  total: 200,
  base: 100,
  bonus: 100,
  breakdown: {
    baseItems: 3,
    upgrades: 4,
    equipment: 20,
    gems: 5,
    pet: 10,
    potion: 2,
    items: null,
    petBonus: 12,
    ...breakdownOverrides,
  },
  ...overrides,
});

const composition = (
  perCode?: (code: AttributeCode, index: number) => Partial<AttributeCompositionItem> & {
    breakdown?: Partial<AttributeCompositionItem["breakdown"]>;
  },
): AttributeCompositionModel => ({
  attributes: CODES.map((code, index) => {
    const override = perCode?.(code, index) ?? {};
    return attribute(code, override, override.breakdown);
  }),
});

const compactSfPlayer = () => {
  const save = Array(70).fill(0);
  save[1] = 2940;
  save[3] = 600;
  save[20] = 1;
  [1000, 200, 300, 400, 500].forEach((value, index) => {
    save[30 + index] = value;
    save[35 + index] = 0;
    save[40 + index] = value;
  });

  const equippedItems = Array(190).fill(0);
  equippedItems[0] = 2;
  equippedItems[1] = 10;
  equippedItems[3] = 1000;
  equippedItems[7] = 1;
  equippedItems[10] = 100;
  equippedItems[15] = 0;
  equippedItems[16] = 50;

  const potions = Array(10).fill(0);
  potions[1] = 1;
  potions[4] = 999999;
  potions[7] = 10;

  return {
    name: "Compact Test",
    identifier: "am1_net_p2940",
    prefix: "am1_net",
    own: 0,
    saveVersion: 2,
    save,
    equippedItems,
    potions,
    pets: [2940, 0, 0, 0, 0, 20],
  };
};

const tests: TestCase[] = [
  {
    name: "aggregiert sechs Radar-Quellen über fünf Attribute",
    run() {
      const totals = aggregateAttributeCompositionSourceTotals(composition((_, index) => ({
        base: 100 + index,
        breakdown: {
          baseItems: 3 + index,
          upgrades: 4 + index,
          gems: 5 + index,
          equipment: 9999,
          pet: 10 + index,
          potion: index,
        },
      })));
      assert.deepEqual(totals, {
        base: { status: "known", value: 510 },
        baseItems: { status: "known", value: 25 },
        upgrades: { status: "known", value: 30 },
        gems: { status: "known", value: 35 },
        petBonus: { status: "known", value: 60 },
        potion: { status: "known", value: 10 },
      });
    },
  },
  {
    name: "EQ ist keine Radarquelle und Equipment wird nicht doppelt gezählt",
    run() {
      const totals = aggregateAttributeCompositionSourceTotals(composition(() => ({
        breakdown: { baseItems: 1_000, upgrades: 100, equipment: 20_000, gems: 10 },
      })));
      assert.equal(Object.prototype.hasOwnProperty.call(totals ?? {}, "equipment"), false);
      assert.deepEqual(totals?.baseItems, { status: "known", value: 5_000 });
      assert.deepEqual(totals?.upgrades, { status: "known", value: 500 });
      assert.deepEqual(totals?.gems, { status: "known", value: 50 });
    },
  },
  {
    name: "Pet Count wird nicht als Pet-Bonus-Beitrag verwendet",
    run() {
      const totals = aggregateAttributeCompositionSourceTotals(composition(() => ({
        breakdown: { pet: 10, petBonus: 999 },
      })));
      assert.equal(totals?.petBonus.status, "known");
      assert.equal(totals?.petBonus.status === "known" ? totals.petBonus.value : null, 50);
    },
  },
  {
    name: "Max-Normalisierung setzt stärkste Quelle auf 100",
    run() {
      const radar = buildAttributeCompositionRadarModel(composition(() => ({
        base: 100,
        breakdown: { baseItems: 20, upgrades: 70, equipment: 9999, gems: 50, pet: 25, potion: 0 },
      })));
      assert.ok(radar);
      assert.equal(radar.maxValue, 500);
      assert.deepEqual(
        radar.axes.map((axis) => [axis.key, axis.displayScore]),
        [
          ["base", 100],
          ["baseItems", 20],
          ["upgrades", 70],
          ["gems", 50],
          ["petBonus", 25],
          ["potion", 0],
        ],
      );
      assert.equal(radar.axes.some((axis) => axis.label === "EQ" || axis.key === "equipment"), false);
    },
  },
  {
    name: "explizite Null bleibt Null",
    run() {
      const totals = aggregateAttributeCompositionSourceTotals(composition(() => ({
        breakdown: { potion: 0 },
      })));
      assert.deepEqual(totals?.potion, { status: "known", value: 0 });
    },
  },
  {
    name: "fehlender Wert bleibt unbekannt",
    run() {
      const totals = aggregateAttributeCompositionSourceTotals(composition((_, index) => ({
        breakdown: { potion: index === 2 ? null : 0 },
      })));
      assert.deepEqual(totals?.potion, { status: "unknown" });
    },
  },
  {
    name: "fehlende oder unbelastbare Daten erzeugen kein Radar-Polygon",
    run() {
      assert.equal(
        buildAttributeCompositionRadarModel(composition(() => ({
          base: 0,
          breakdown: { baseItems: 0, upgrades: 0, gems: 0, pet: 0, potion: 0 },
        }))),
        null,
      );
      assert.equal(
        buildAttributeCompositionRadarModel(composition((_, index) => ({
          breakdown: { gems: index === 0 ? null : 0 },
        }))),
        null,
      );
    },
  },
  {
    name: "DB- und Local-Adapter liefern denselben Präsentationsvertrag",
    run() {
      const source = composition();
      const fromStats = createAttributeCompositionModelFromStats({ attributeComposition: source.attributes });
      assert.deepEqual(fromStats, source);
    },
  },
  {
    name: "lokaler Adapter verwendet normalisierte kompakte SFTools-Attribute",
    run() {
      const normalized = normalizeSfPlayerCharacterCore(compactSfPlayer());
      const model = createAttributeCompositionModelFromNormalizedAttributes(normalized.attributes);
      const strength = model.attributes.find((entry) => entry.code === "str");

      assert.ok(strength);
      assert.equal(strength.base, normalized.attributes.strength.base);
      assert.equal(strength.total, normalized.attributes.strength.total);
      assert.equal(strength.base, 1000);
      assert.equal(strength.total, 1518);
      assert.deepEqual(strength.breakdown, {
        baseItems: 100,
        upgrades: 0,
        equipment: 150,
        gems: 50,
        pet: 253,
        potion: 115,
        items: 100,
        petBonus: null,
      });

      const totals = aggregateAttributeCompositionSourceTotals(model);
      assert.deepEqual(totals?.base, { status: "known", value: 2400 });
      assert.deepEqual(totals?.baseItems, { status: "known", value: 100 });
      assert.deepEqual(totals?.upgrades, { status: "known", value: 0 });
      assert.deepEqual(totals?.gems, { status: "known", value: 50 });
      assert.deepEqual(totals?.petBonus, { status: "known", value: 253 });
      assert.deepEqual(totals?.potion, { status: "known", value: 115 });
    },
  },
  {
    name: "Detailsegmente zeigen Pet Count nur als statisches Metadatum",
    run() {
      const segments = buildAttributeCompositionSegments(labels, 100, attribute("str").breakdown, 200);
      const petCount = segments.find((segment) => segment.sourceKey === "petBonus");
      assert.ok(petCount);
      assert.equal(petCount.isBarSegment, false);
      assert.equal(petCount.isInteractive, false);
    },
  },
];

for (const test of tests) {
  try {
    test.run();
    console.log(`ok - ${test.name}`);
  } catch (error) {
    console.error(`not ok - ${test.name}`);
    throw error;
  }
}
