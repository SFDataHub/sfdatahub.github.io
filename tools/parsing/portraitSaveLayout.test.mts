import assert from "node:assert/strict";

import type { SfJsonPortrait } from "../../src/lib/parsing/types.ts";
import { extractPortraitFromSaveArray } from "../../src/lib/parsing/extractPortrait.ts";
import { parseSfJson } from "../../src/lib/parsing/parseSfJson.ts";
import { createPortraitOptionsFromSaveArray } from "../../src/lib/portraitFromSave.ts";
import type { PortraitOptions } from "../../src/components/player-profile/types.ts";

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

const assertPortraitValues = (
  portrait: SfJsonPortrait,
  expected: Omit<SfJsonPortrait, "frameId" | "hornColor"> & { frameId?: number; hornColor?: number },
) => {
  assert.equal(portrait.genderName, expected.genderName);
  assert.equal(portrait.classId, expected.classId);
  assert.equal(portrait.raceId, expected.raceId);
  assert.equal(portrait.mouth, expected.mouth);
  assert.equal(portrait.hair, expected.hair);
  assert.equal(portrait.hairColor, expected.hairColor);
  assert.equal(portrait.brows, expected.brows);
  assert.equal(portrait.eyes, expected.eyes);
  assert.equal(portrait.beard, expected.beard);
  assert.equal(portrait.nose, expected.nose);
  assert.equal(portrait.ears, expected.ears);
  assert.equal(portrait.extra, expected.extra);
  assert.equal(portrait.horn, expected.horn);
  assert.equal(portrait.hornColor, expected.hornColor ?? 1);
  assert.equal(portrait.special, expected.special);
  assert.equal(portrait.frameId, expected.frameId ?? 0);
};

const assertRendererMatchesDecoded = (portrait: SfJsonPortrait, render: PortraitOptions) => {
  assert.equal(render.genderName, portrait.genderName);
  assert.equal(render.class, portrait.classId);
  assert.equal(render.race, portrait.raceId);
  assert.equal(render.mouth, portrait.mouth);
  assert.equal(render.hair, portrait.hair);
  assert.equal(render.hairColor, portrait.hairColor);
  assert.equal(render.brows, portrait.brows);
  assert.equal(render.eyes, portrait.eyes);
  assert.equal(render.beard, portrait.beard);
  assert.equal(render.nose, portrait.nose);
  assert.equal(render.ears, portrait.ears);
  assert.equal(render.extra, portrait.extra);
  assert.equal(render.horn, portrait.horn);
  assert.equal(render.hornColor, portrait.hornColor);
  assert.equal(render.special, portrait.special);
};

{
  const save = Array.from({ length: 70 }, () => 0);
  save[1] = 292680;
  save[3] = 520;
  setCompactPortrait(save, {
    mouth: 4,
    hairRaw: 105,
    browsRaw: 101,
    eyes: 4,
    beardRaw: 106,
    nose: 1,
    ears: 2,
    extra: 8,
    hornRaw: 1,
    special: 0,
    race: 6,
    gender: 1,
    classId: 2,
  });

  const context = { own: 1, saveVersion: 2, save };
  const portrait = extractPortraitFromSaveArray(save, context);
  const render = createPortraitOptionsFromSaveArray(save, context);
  assertPortraitValues(portrait, {
    genderName: "male",
    classId: 2,
    raceId: 6,
    mouth: 4,
    hair: 5,
    hairColor: 1,
    brows: 1,
    eyes: 4,
    beard: 6,
    nose: 1,
    ears: 2,
    extra: 8,
    horn: 1,
    special: 0,
  });
  assertRendererMatchesDecoded(portrait, render);

  const parsed = parseSfJson({
    players: [
      {
        own: 1,
        saveVersion: 2,
        save,
        identifier: "f28_net_p292680",
        prefix: "f28_net",
        name: "Darth Monk Jr",
      },
    ],
  });
  assert.equal(parsed.ownPlayer?.portrait?.classId, 2);
  assert.equal(parsed.ownPlayer?.portrait?.raceId, 6);
  assert.equal(parsed.ownPlayer?.portrait?.genderName, "male");
}

{
  const save = Array.from({ length: 70 }, () => 0);
  save[1] = 17328;
  save[3] = 456;
  setCompactPortrait(save, {
    mouth: 9,
    hairRaw: 308,
    browsRaw: 304,
    eyes: 3,
    beardRaw: 305,
    nose: 3,
    ears: 2,
    extra: 16,
    hornRaw: 8,
    special: 0,
    race: 8,
    gender: 1,
    classId: 6,
  });

  const context = { own: 1, saveVersion: 2, save };
  const portrait = extractPortraitFromSaveArray(save, context);
  const render = createPortraitOptionsFromSaveArray(save, context);
  assertPortraitValues(portrait, {
    genderName: "male",
    classId: 6,
    raceId: 8,
    mouth: 9,
    hair: 8,
    hairColor: 3,
    brows: 4,
    eyes: 3,
    beard: 5,
    nose: 3,
    ears: 2,
    extra: 16,
    horn: 8,
    hornColor: 3,
    special: 0,
  });
  assertRendererMatchesDecoded(portrait, render);
}

{
  const save = Array.from({ length: 70 }, () => 0);
  save[1] = 12345;
  save[3] = 520;
  setCompactPortrait(save, {
    mouth: 2,
    hairRaw: 204,
    browsRaw: 105,
    eyes: 3,
    beardRaw: 201,
    nose: 4,
    ears: 1,
    extra: 6,
    hornRaw: 7,
    special: 0,
    race: 5,
    gender: 2,
    classId: 4,
  });

  const context = { own: 1, saveVersion: 2, save };
  const portrait = extractPortraitFromSaveArray(save, context);
  const render = createPortraitOptionsFromSaveArray(save, context);
  assertPortraitValues(portrait, {
    genderName: "female",
    classId: 4,
    raceId: 5,
    mouth: 2,
    hair: 4,
    hairColor: 2,
    brows: 5,
    eyes: 3,
    beard: 1,
    nose: 4,
    ears: 1,
    extra: 6,
    horn: 7,
    special: 0,
  });
  assertRendererMatchesDecoded(portrait, render);
}

{
  const save = Array.from({ length: 706 }, () => 0);
  save[17] = 5;
  save[18] = 203;
  save[19] = 101;
  save[20] = 7;
  save[21] = 304;
  save[22] = 6;
  save[23] = 4;
  save[24] = 2;
  save[25] = 405;
  save[26] = 0;
  save[27] = 2;
  save[28] = 2;
  save[29] = 3;
  save[705] = 50;

  const context = { own: 1, save };
  const portrait = extractPortraitFromSaveArray(save, context);
  const render = createPortraitOptionsFromSaveArray(save, context);
  assertPortraitValues(portrait, {
    genderName: "female",
    classId: 3,
    raceId: 2,
    mouth: 5,
    hair: 3,
    hairColor: 2,
    brows: 1,
    eyes: 7,
    beard: 4,
    nose: 6,
    ears: 4,
    extra: 2,
    horn: 5,
    special: 0,
    hornColor: 1,
    frameId: 50,
  });
  assertRendererMatchesDecoded(portrait, render);
  assert.equal(render.frame, "worldBossFrameGold");
}

{
  const save = Array.from({ length: 256 }, () => 0);
  setCompactPortrait(save, {
    mouth: 11,
    hairRaw: 412,
    browsRaw: 207,
    eyes: 6,
    beardRaw: 104,
    nose: 5,
    ears: 3,
    extra: 9,
    hornRaw: 202,
    special: 0,
    race: 4,
    gender: 0,
    classId: 8,
  });

  const context = { own: 0, save };
  const portrait = extractPortraitFromSaveArray(save, context);
  const render = createPortraitOptionsFromSaveArray(save, context);
  assertPortraitValues(portrait, {
    genderName: "male",
    classId: 8,
    raceId: 4,
    mouth: 11,
    hair: 12,
    hairColor: 4,
    brows: 7,
    eyes: 6,
    beard: 4,
    nose: 5,
    ears: 3,
    extra: 9,
    horn: 2,
    hornColor: 4,
    special: 0,
  });
  assertRendererMatchesDecoded(portrait, render);
}

console.log("portraitSaveLayout.test.mts passed");
