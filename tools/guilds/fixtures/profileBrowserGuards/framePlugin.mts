import path from "node:path";
import type {Plugin} from "vite";
const fixture="/tools/guilds/fixtures/profileBrowserGuards/frameMocks.tsx";
const aliases:Record<string,string>={
 "/src/lib/firebase":"db", "/src/context/AuthContext":"useAuth",
 "/src/context/DataJobsContext":"useDataJobs,getDataJobDetail,getDataJobProgress,getDataJobStatusLabel",
 "/src/components/Topbar/Topbar":"None as default", "/src/components/LogoDock/LogoDock":"None as default",
 "/src/components/auth/LoginModalHost":"None as default",
};
for(const page of ["Index","Planner","FusionPlanner/FusionPlanner","FightTracking","Waitlist","Activity","Imports","Announcements","Events","Roles","Settings"])aliases["/src/pages/GuildHub/"+page]="None as default";
aliases["/src/pages/DataHub/compareGuilds"]="None as default";
export const framePlugin:Plugin={name:"w15-frame-boundaries",enforce:"pre",resolveId(source,importer){
 if(source.startsWith("https://sf-libs"))return "\0w15:coa";
 if(!importer||!source.startsWith("."))return;
 const resolved=path.resolve(path.dirname(importer),source).replace(/\\/g,"/").replace(/\.(tsx?|jsx?)$/,"");
 const key=Object.keys(aliases).find(k=>resolved.endsWith(k));if(key)return "\0w15:"+key;
},load(id){if(id==="\0w15:coa")return "export class CoaRenderer {}";if(id.startsWith("\0w15:"))return `export {${aliases[id.slice(5)]}} from '${fixture}';`;}};
