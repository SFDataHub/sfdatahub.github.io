// Controlled cloud transport only; production search/member transformations execute.
const cloudGuild={name:'Audit Guild',server:'F8',memberCount:2,avgLevel:110,updatedAt:'2026-10-06T12:00:00Z'};
export const doc=(_db:unknown,path:string)=>({path});
export async function getDoc(ref:{path:string}){(globalThis as any).w32CloudReads??=[];(globalThis as any).w32CloudReads.push(ref.path);const value=ref.path.endsWith('members_summary')?{members:[{identifier:'f8_net_p1',name:'Audit Member 1',level:110,class:1},{identifier:'f8_net_p2',name:'Audit Member 2',level:120,class:2}]}:cloudGuild;return {exists:()=>true,data:()=>value};}
export const collectionGroup=(_db:unknown,id:string)=>({id});
export const query=(...clauses:unknown[])=>({clauses});
export const endAt=(...v:unknown[])=>v;export const startAt=endAt;export const limit=endAt;export const orderBy=endAt;export const where=endAt;
export async function getDocs(_query:unknown){(globalThis as any).w32CloudReads??=[];(globalThis as any).w32CloudReads.push('controlled-guild-search');const entry={id:'latest',ref:{path:'guilds/f8_net_g1/latest/latest',parent:{parent:{id:'f8_net_g1',parent:{id:'guilds'}}}},data:()=>cloudGuild};return {docs:[entry],size:1,empty:false,forEach:(f:(v:unknown)=>void)=>f(entry)};}
