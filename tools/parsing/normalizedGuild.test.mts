import assert from "node:assert/strict";

import {
  createNormalizedGuildIndexes,
  linkNormalizedPlayerToGuildMember,
  normalizeSfGuild,
  normalizeSfGuildsFromScan,
} from "../../src/lib/parsing/normalizedGuild.ts";
import { normalizeSfPlayerCharacterCore } from "../../src/lib/parsing/normalizedPlayer.ts";

const packUpperShort = (upper: number, lower = 0) => lower + upper * 0x10000;

const createSave = (length = 502): unknown[] => Array.from({ length }, () => 0);

const createPlayerSave = (id: number) => {
  const save = Array.from({ length: 70 }, () => 0);
  save[1] = id;
  save[3] = 100;
  save[20] = 1;
  return save;
};

const setMember = (
  save: unknown[],
  slot: number,
  values: {
    id: number;
    role: number;
    state: number;
    level: number;
    lastActive: number;
    treasure: number;
    instructor: number;
    pet: number;
    action?: number;
  },
) => {
  save[14 + slot] = values.id;
  save[64 + slot] = values.state * 1000 + values.level;
  save[114 + slot] = values.lastActive;
  save[214 + slot] = values.treasure;
  save[264 + slot] = values.instructor;
  save[314 + slot] = values.role;
  save[390 + slot] = values.pet;
  if (values.action != null) save[445 + slot] = values.action;
};

const createModernGuild = () => {
  const save = createSave();
  save[0] = 77;
  save[13] = 0;
  save[4] = packUpperShort(123);
  save[5] = packUpperShort(1);
  save[6] = packUpperShort(42);
  save[7] = packUpperShort(9);
  save[8] = 12;
  save[364] = 555;
  save[366] = 666;
  save[370] = 88;
  save[371] = 7;
  save[377] = 1;
  save[378] = 15;
  save[379] = 3;
  save[380] = 4;
  save[385] = 100;
  save[386] = 101;
  save[387] = 102;
  save[388] = 103;
  save[389] = 104;

  setMember(save, 0, {
    id: 100,
    role: 0,
    state: 0,
    level: 1,
    lastActive: 1,
    treasure: 99,
    instructor: 99,
    pet: 99,
    action: 111,
  });
  setMember(save, 1, {
    id: 101,
    role: 1,
    state: 1,
    level: 101,
    lastActive: 5,
    treasure: 10,
    instructor: 20,
    pet: 0,
    action: 111,
  });
  setMember(save, 2, {
    id: 102,
    role: 4,
    state: 2,
    level: 102,
    lastActive: 6,
    treasure: 90,
    instructor: 90,
    pet: 90,
    action: 11,
  });
  setMember(save, 3, {
    id: 103,
    role: 2,
    state: 2,
    level: 202,
    lastActive: 7,
    treasure: 0,
    instructor: 0,
    pet: 5,
    action: 10,
  });
  setMember(save, 4, {
    id: 104,
    role: 3,
    state: 3,
    level: 303,
    lastActive: 8,
    treasure: 490,
    instructor: 30,
    pet: 6,
    action: 100,
  });

  const names = Array.from({ length: 50 }, (_, index) => `Slot ${index}`);
  names[1] = "Leader";
  names[3] = "Officer";
  names[4] = "Member";

  return {
    prefix: "s1",
    timestamp: 123456,
    offset: 2000,
    own: 1,
    name: "Guild Name",
    rank: 0,
    save,
    names,
    knights: Array.from({ length: 50 }, (_, index) => index + 1),
    description: "Hello$sWorld",
    gtsave: {
      rank: 2,
      tokens: 1234,
    },
  };
};

{
  const coa = "0123456789abcdef012345";
  const guild = normalizeSfGuild(createModernGuild(), {
    derivedGuildCoaByIdentifier: {
      eu1_g77: coa,
    },
  });

  assert.ok(guild);
  assert.equal(guild.identity.id, 77);
  assert.equal(guild.identity.identifier, "eu1_g77");
  assert.equal(guild.identity.name, "Guild Name");
  assert.equal(guild.identity.server, "eu1");
  assert.equal(guild.identity.prefix, "s1");
  assert.equal(guild.identity.coa, coa);
  assert.equal(guild.identity.own, true);
  assert.equal(guild.identity.timestamp, 123456);
  assert.equal(guild.identity.description, "Hello/World");
  assert.equal(guild.metadata.fields["identity.coa"]?.provenance, "derived");

  assert.equal(guild.progression.rank, 0);
  assert.equal(guild.progression.honor, 0);
  assert.equal(guild.metadata.fields["progression.rank"]?.status, "available");
  assert.equal(guild.metadata.fields["progression.honor"]?.status, "available");

  assert.equal(guild.combatProgress.raid, 12);
  assert.equal(guild.combatProgress.portal.life, 123 + 0x10000);
  assert.equal(guild.combatProgress.portal.percent, 42);
  assert.equal(guild.combatProgress.portal.floor, 9);
  assert.equal(guild.combatProgress.hydra.level, 3);
  assert.equal(guild.combatProgress.hydra.max, 4);
  assert.equal(guild.combatProgress.pet.id, 1);
  assert.equal(guild.combatProgress.pet.level, 15);
  assert.equal(guild.combatProgress.pet.class, 3);
  assert.equal(guild.combatProgress.pet.stats.strength, 100);
  assert.equal(guild.combatProgress.combatState.isUnderAttack, true);
  assert.equal(guild.combatProgress.combatState.underAttackId, 555);
  assert.equal(guild.combatProgress.combatState.isAttacking, true);
  assert.equal(guild.combatProgress.combatState.attackingId, 666);

  assert.equal(guild.members.length, 3);
  assert.equal(guild.totals.membersTotal, 3);
  assert.equal(guild.totals.totalKnights, 88);
  assert.equal(guild.totals.totalKnights15, 7);
  assert.equal(guild.bonuses.totalTreasure, 100);
  assert.equal(guild.bonuses.totalInstructor, 10);

  const leader = guild.members[0];
  assert.equal(leader.identity.slot, 1);
  assert.equal(leader.identity.index, 0);
  assert.equal(leader.identity.playerId, 101);
  assert.equal(leader.identity.playerIdentifier, "eu1_p101");
  assert.equal(leader.link.playerIdentifier, "eu1_p101");
  assert.equal(leader.identity.name, "Leader");
  assert.equal(leader.identity.level, 101);
  assert.equal(leader.role.id, 1);
  assert.equal(leader.role.name, "leader");
  assert.equal(leader.activity.state, 1);
  assert.equal(leader.activity.lastActive, 5000 + 2000);
  assert.equal(leader.activity.joined, null);
  assert.deepEqual(leader.actions, { hydra: true, attack: true, defense: true, raid: false });
  assert.equal(leader.readyAttack, true);
  assert.equal(leader.readyDefense, true);
  assert.equal(leader.bonuses.treasure, 10);
  assert.equal(leader.bonuses.instructor, 20);
  assert.equal(leader.bonuses.pet, 0);
  assert.equal(leader.metadata.fields["bonuses.pet"]?.status, "available");
  assert.equal(leader.contributions.knights, 2);

  const officer = guild.members[1];
  assert.equal(officer.identity.slot, 3);
  assert.equal(officer.role.name, "officer");
  assert.equal(officer.bonuses.treasure, 0);
  assert.equal(officer.metadata.fields["bonuses.treasure"]?.status, "available");
  assert.deepEqual(officer.actions, { hydra: false, attack: true, defense: false, raid: false });

  const member = guild.members[2];
  assert.equal(member.identity.slot, 4);
  assert.equal(member.role.name, "member");
  assert.deepEqual(member.actions, { hydra: true, attack: false, defense: false, raid: true });
  assert.equal(member.readyAttack, true);
  assert.equal(member.readyDefense, false);
  assert.equal(member.contributions.knights, 5);
  assert.equal(guild.tournament?.rank, 2);
  assert.equal(guild.tournament?.tokens, 1234);
  assert.equal(guild.metadata.format, "modernActions");
}

{
  const save = createSave(440);
  save[0] = 88;
  save[13] = 5;
  setMember(save, 0, {
    id: 201,
    role: 1,
    state: 1,
    level: 11,
    lastActive: 1,
    treasure: 0,
    instructor: 0,
    pet: 0,
  });
  setMember(save, 1, {
    id: 202,
    role: 2,
    state: 2,
    level: 12,
    lastActive: 2,
    treasure: 0,
    instructor: 0,
    pet: 0,
  });
  setMember(save, 2, {
    id: 203,
    role: 3,
    state: 3,
    level: 13,
    lastActive: 3,
    treasure: 0,
    instructor: 0,
    pet: 0,
  });

  const guild = normalizeSfGuild({
    prefix: "s2",
    name: "Legacy",
    rank: 1,
    save,
    names: ["Attacker", "Defender", "Raider"],
  });

  assert.ok(guild);
  assert.equal(guild.metadata.format, "legacyActions");
  assert.deepEqual(guild.members[0].actions, { hydra: false, attack: true, defense: false, raid: false });
  assert.deepEqual(guild.members[1].actions, { hydra: false, attack: false, defense: true, raid: false });
  assert.deepEqual(guild.members[2].actions, { hydra: false, attack: false, defense: false, raid: true });
  assert.equal(guild.members[2].readyAttack, true);
  assert.equal(guild.members[1].readyDefense, true);
}

{
  const raw = createModernGuild();
  delete (raw as { knights?: unknown }).knights;
  raw.own = 0;
  delete (raw as { gtsave?: unknown }).gtsave;

  const guild = normalizeSfGuild(raw);
  assert.ok(guild);
  assert.equal(guild.identity.own, false);
  assert.equal(guild.members[0].contributions.knights, null);
  assert.equal(guild.members[0].metadata.fields["contributions.knights"]?.status, "unsupported");
  assert.equal(guild.tournament, null);
  assert.equal(guild.metadata.fields["tournament.rank"]?.status, "missing");
}

{
  const first = createModernGuild();
  const second = createModernGuild();
  second.save[0] = 78;
  second.name = "Second";

  const guilds = normalizeSfGuildsFromScan({
    prefix: "s3",
    groups: [first, second],
  });

  assert.equal(guilds.length, 2);
  assert.equal(guilds[0].identity.identifier, "eu1_g77");
  assert.equal(guilds[1].identity.identifier, "eu1_g78");
  assert.equal(guilds[1].identity.name, "Second");
}

{
  const save = createSave();
  save[0] = 90;
  save[4] = "not-a-number";
  save[5] = packUpperShort(0);
  const guild = normalizeSfGuild({
    prefix: "s4",
    name: "Invalid",
    rank: 0,
    save,
    names: [],
  });

  assert.ok(guild);
  assert.equal(guild.combatProgress.portal.life, null);
  assert.equal(guild.metadata.fields["combatProgress.portal.word4"]?.status, "invalid");
  assert.equal(guild.metadata.fields["combatProgress.portal.life"]?.status, "missing");
}

{
  const guild = normalizeSfGuild({ name: "No Save" });

  assert.ok(guild);
  assert.equal(guild.identity.id, null);
  assert.equal(guild.members.length, 0);
  assert.equal(guild.totals.membersTotal, null);
  assert.equal(guild.bonuses.totalTreasure, null);
  assert.equal(guild.metadata.format, "unknown");
  assert.equal(guild.metadata.fields["identity.id"]?.status, "missing");
}

{
  const guild = normalizeSfGuild(createModernGuild());
  assert.ok(guild);
  const player = normalizeSfPlayerCharacterCore({
    saveVersion: 2,
    save: createPlayerSave(101),
    identifier: "eu1_p101",
    prefix: "eu1",
    name: "Renamed Leader",
    guildIdentifier: "eu1_g77",
    guildName: "Guild Name",
  });
  const link = linkNormalizedPlayerToGuildMember(player, createNormalizedGuildIndexes([guild]));

  assert.equal(link.linked, true);
  assert.equal(link.guild?.identity.identifier, "eu1_g77");
  assert.equal(link.guildMember?.identity.name, "Leader");
  assert.equal(link.role, "leader");
  assert.equal(link.lastActive, 7000);
  assert.equal(link.joined, null);
  assert.equal(link.guildBonuses.treasure, 10);
  assert.equal(link.guildBonuses.instructor, 20);
  assert.equal(link.guildBonuses.pet, 0);
  assert.equal(link.knightsContribution, 2);

  const sameNameWrongIdentifier = normalizeSfPlayerCharacterCore({
    saveVersion: 2,
    save: createPlayerSave(999),
    identifier: "eu1_p999",
    prefix: "eu1",
    name: "Leader",
    guildIdentifier: "eu1_g77",
    guildName: "Guild Name",
  });
  const missingLink = linkNormalizedPlayerToGuildMember(sameNameWrongIdentifier, [guild]);
  assert.equal(missingLink.linked, false, "linking must not fall back to member names");
}

{
  const first = normalizeSfGuild(createModernGuild());
  const secondRaw = createModernGuild();
  secondRaw.save[0] = 78;
  secondRaw.name = "Second Guild";
  const second = normalizeSfGuild(secondRaw);
  assert.ok(first);
  assert.ok(second);
  const indexes = createNormalizedGuildIndexes([first, second]);
  const playerWithoutGuild = normalizeSfPlayerCharacterCore({
    saveVersion: 2,
    save: createPlayerSave(101),
    identifier: "eu1_p101",
    prefix: "eu1",
    name: "Shared Identifier",
  });
  const ambiguousLink = linkNormalizedPlayerToGuildMember(playerWithoutGuild, indexes);
  assert.equal(ambiguousLink.linked, false);
  assert.equal(ambiguousLink.ambiguous, true);

  const playerWithGuild = normalizeSfPlayerCharacterCore({
    saveVersion: 2,
    save: createPlayerSave(101),
    identifier: "eu1_p101",
    prefix: "eu1",
    name: "Shared Identifier",
    guildIdentifier: "eu1_g78",
    guildName: "Second Guild",
  });
  const disambiguatedLink = linkNormalizedPlayerToGuildMember(playerWithGuild, indexes);
  assert.equal(disambiguatedLink.linked, true);
  assert.equal(disambiguatedLink.ambiguous, false);
  assert.equal(disambiguatedLink.guild?.identity.identifier, "eu1_g78");
}

{
  const player = normalizeSfPlayerCharacterCore({
    saveVersion: 2,
    save: createPlayerSave(101),
    identifier: "eu1_p101",
    prefix: "eu1",
    name: "No Guild Data",
    guildIdentifier: "eu1_g77",
    guildName: "Missing Guild",
  });
  const link = linkNormalizedPlayerToGuildMember(player, []);
  assert.equal(link.linked, false);
  assert.equal(link.guildReference?.identifier, "eu1_g77");
  assert.equal(link.guildBonuses.treasure, player.progressionStatus.guildBonuses.treasure);
}

console.log("normalizedGuild.test.mts passed");
