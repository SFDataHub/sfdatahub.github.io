import assert from "node:assert/strict";

import {
  comparePlayerPortraitAppearance,
  createPlayerPortraitAppearanceSummary,
} from "../../src/lib/identities/playerPortraitAppearance.ts";
import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";
import type { SfJsonPortrait } from "../../src/lib/parsing/types.ts";

const setCompactPortrait = (
  save: number[],
  values: {
    mouth: number;
    hairRaw: number;
    browsRaw: number;
    eyes: number;
    beardRaw: number;
    nose: number;
    ears: number;
    extra: number;
    hornRaw: number;
    special: number;
    race: number;
    gender: number;
    classId: number;
  },
) => {
  save[8] = values.mouth;
  save[9] = values.hairRaw;
  save[10] = values.browsRaw;
  save[11] = values.eyes;
  save[12] = values.beardRaw;
  save[13] = values.nose;
  save[14] = values.ears;
  save[15] = values.extra;
  save[16] = values.hornRaw;
  save[17] = values.special;
  save[18] = values.race;
  save[19] = values.gender;
  save[20] = values.classId;
};

const normalizedPortraitSummary = (
  overrides: Partial<Parameters<typeof setCompactPortrait>[1]> = {},
) => {
  const save = Array.from({ length: 70 }, () => 0);
  save[1] = 1001;
  setCompactPortrait(save, {
    mouth: 9,
    hairRaw: 308,
    browsRaw: 304,
    eyes: 3,
    beardRaw: 305,
    nose: 3,
    ears: 2,
    extra: 16,
    hornRaw: 11,
    special: 0,
    race: 8,
    gender: 1,
    classId: 6,
    ...overrides,
  });
  const normalized = normalizeSfPlayerCharacterCore({
    own: 1,
    saveVersion: 2,
    save,
    identifier: "s1_p1001",
    prefix: "s1",
    name: "Portrait Fixture",
  });
  return createPlayerPortraitAppearanceSummary(normalized.portrait);
};

const availablePortrait = (
  appearanceOverrides: Partial<SfJsonPortrait["appearance"]> = {},
  portraitOverrides: Partial<SfJsonPortrait> = {},
): SfJsonPortrait => {
  const appearance: SfJsonPortrait["appearance"] = {
    classId: 1,
    raceId: 2,
    gender: "male",
    mouth: 3,
    hair: { style: 4, color: 5 },
    brows: { style: 6, color: 7 },
    eyes: 8,
    beard: { style: 9, color: 10, none: false },
    nose: 11,
    ears: 12,
    extra: 13,
    special2: { raw: 14, style: 15, color: 16 },
    horn: {
      supported: true,
      renderable: true,
      style: 17,
      color: 18,
      colorSource: "rendererDerivedHairColor",
    },
    specialPortrait: {
      active: false,
      id: null,
      sourceValue: 0,
      status: "inactive",
    },
    ...appearanceOverrides,
  };

  return {
    status: "available",
    layout: "currentCompact",
    appearance,
    frame: { status: "available", frameId: 19 },
    metadata: {
      hairColorSource: "raw",
      browsColorSource: "raw",
      beardColorSource: "raw",
      hornColorSource: "rendererDerived",
      compatibilityFrameIdFallback: 0,
    },
    genderName: appearance.gender,
    classId: appearance.classId,
    raceId: appearance.raceId,
    mouth: appearance.mouth,
    hair: appearance.hair.style,
    hairColor: appearance.hair.color,
    browsColor: appearance.brows.color,
    horn: appearance.horn.style ?? 0,
    hornColor: appearance.horn.color ?? 0,
    brows: appearance.brows.style,
    eyes: appearance.eyes,
    beard: appearance.beard.style ?? 0,
    beardColor: appearance.beard.color,
    beardNone: appearance.beard.none,
    nose: appearance.nose,
    ears: appearance.ears,
    extra: appearance.extra,
    special2: appearance.special2.raw,
    special: appearance.specialPortrait.sourceValue,
    frameId: 19,
    ...portraitOverrides,
  };
};

const compare = (
  oldPortrait: SfJsonPortrait | null | undefined,
  newPortrait: SfJsonPortrait | null | undefined,
) =>
  comparePlayerPortraitAppearance(
    createPlayerPortraitAppearanceSummary(oldPortrait),
    createPlayerPortraitAppearanceSummary(newPortrait),
  );

{
  const comparison = compare(availablePortrait(), availablePortrait());
  assert.equal(comparison.comparable, true);
  assert.equal(comparison.exact, true);
}

{
  const comparison = compare(
    availablePortrait(),
    availablePortrait(
      { classId: 8, raceId: 9, gender: "female" },
      { classId: 8, raceId: 9, genderName: "female" },
    ),
  );

  assert.equal(comparison.comparable, true);
  assert.equal(comparison.exact, true);
}

{
  const comparison = compare(
    availablePortrait(),
    availablePortrait(
      {
        horn: {
          supported: true,
          renderable: true,
          style: 17,
          color: 99,
          colorSource: "fixedFemaleDemon",
        },
      },
      { hornColor: 99 },
    ),
  );

  assert.equal(comparison.comparable, true);
  assert.equal(comparison.exact, true);
}

{
  const comparison = compare(
    availablePortrait({
      horn: {
        supported: true,
        renderable: false,
        style: 17,
        color: null,
        colorSource: null,
      },
    }),
    availablePortrait({
      horn: {
        supported: true,
        renderable: false,
        style: 23,
        color: null,
        colorSource: null,
      },
    }),
  );

  assert.equal(comparison.comparable, true);
  assert.equal(comparison.exact, true);
}

{
  const comparison = compare(
    availablePortrait({}, { frame: { status: "available", frameId: 1 }, frameId: 1 }),
    availablePortrait({}, { frame: { status: "available", frameId: 50 }, frameId: 50 }),
  );

  assert.equal(comparison.comparable, true);
  assert.equal(comparison.exact, true);
}

{
  const comparison = compare(
    availablePortrait({
      specialPortrait: {
        active: true,
        id: 301,
        sourceValue: -301,
        status: "active",
      },
    }),
    availablePortrait({
      specialPortrait: {
        active: true,
        id: 302,
        sourceValue: -302,
        status: "active",
      },
    }),
  );

  assert.equal(comparison.comparable, true);
  assert.equal(comparison.exact, false);
}

{
  const comparison = compare(
    availablePortrait({}, { status: "rosterOnly", appearance: null as never }),
    availablePortrait(),
  );

  assert.equal(comparison.comparable, false);
  assert.equal(comparison.exact, null);
}

{
  const comparison = comparePlayerPortraitAppearance(
    normalizedPortraitSummary({ beardRaw: 99 }),
    normalizedPortraitSummary({ beardRaw: 499 }),
  );

  assert.equal(comparison.comparable, true);
  assert.equal(comparison.exact, true);
}

{
  const comparison = comparePlayerPortraitAppearance(
    normalizedPortraitSummary({ special: -301 }),
    normalizedPortraitSummary({ special: -301 }),
  );

  assert.equal(comparison.comparable, true);
  assert.equal(comparison.exact, true);
}

{
  const comparison = comparePlayerPortraitAppearance(
    normalizedPortraitSummary({ special: -301 }),
    normalizedPortraitSummary({ special: -302 }),
  );

  assert.equal(comparison.comparable, true);
  assert.equal(comparison.exact, false);
}

console.log("playerPortraitAppearance.test.mts passed");
