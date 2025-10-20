import { Member } from "./types";

function rand(seed: number){ let t = seed + 1013904223; return ()=> (t=(1664525*t+1013904223)%4294967296)/4294967296; }
const CLASSES = ["Warrior","Mage","Scout","Assassin","Battle Mage","Berserker","Demon Hunter","Druid","Necromancer","Bard","Assault Mage"];
const ROLES = ["Guild Master","Officer","Member","Recruit"];

export const mockMembers: Member[] = Array.from({ length: 16 }).map((_, i) => {
  const r = rand(i+7);
  const level = 250 + Math.floor(r()*250);
  const scrapbook = 50 + Math.floor(r()*50);
  const power = Math.floor(level*(0.8 + r()*0.6))*1000;
  const role = ROLES[Math.floor(r()*ROLES.length)];
  const cls  = CLASSES[Math.floor(r()*CLASSES.length)];
  const server = ["eu1","de12","int3","uk1"][Math.floor(r()*4)];
  const name = `Player_${String(i+1).padStart(2,"0")}`;
  const activity = Array.from({ length: 7 }).map(()=> Math.floor(r()*10));
  const online = r() > 0.6;
  const baseStats = { str: Math.floor(r()*100), dex: Math.floor(r()*100), int: Math.floor(r()*100), con: Math.floor(r()*100), luck: Math.floor(r()*100) };
  const sumBase = Object.values(baseStats).reduce((a,b)=>a+b,0);
  const totalStats = sumBase + Math.floor(r()*500);

  return { id: `${server}__${i+1}`, name, class: cls, role, level, power, scrapbook,
           server, activity, online, baseStats, totalStats,
           joinedAt: new Date(Date.now() - (10 + Math.floor(r()*365))*86400000),
           lastOnline: new Date(Date.now() - Math.floor(r()*5*86400000) ) };
});
