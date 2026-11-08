import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { HashRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import i18n from "../../../src/i18n";
import "../../../src/styles/index.css";
import RootLayout from "../../../src/layout/RootLayout";
import { settingsRouteElements } from "../../../src/pages/Settings/routes";
import { dataHubRouteElements } from "../../../src/pages/DataHub/routes";
import { FEATURE_ACCESS_CONFIG, FeatureAccessProvider } from "../../../src/lib/featureAccessConfig";
import { preferencesStore, PREFERENCES_KEY } from "../../../src/lib/settings/preferences";
import { setRole } from "./mocks";

const api = { ready:false, documentId:crypto.randomUUID(), navigate:(_to:string)=>{}, location:null as any,
 role:(role:string)=>flushSync(()=>setRole(role)), lang:(lang:string)=>i18n.changeLanguage(lang), store:preferencesStore,
 operations:[] as string[], shellOperations:[] as string[], writes:[] as string[], failWrite:false, failRead:false, errors:[] as string[] };
(globalThis as any).w124=api;
window.addEventListener('error',e=>api.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>api.errors.push(String(e.reason)));
const set=Storage.prototype.setItem,get=Storage.prototype.getItem;
Storage.prototype.setItem=function(key,value){if(key===PREFERENCES_KEY){if(api.failWrite)throw new DOMException('Synthetic quota','QuotaExceededError');api.writes.push(value);}else if(this===sessionStorage && key==='sfh:authNext') api.shellOperations.push('existing-gate:authNext');else api.operations.push('storage-write:'+key);return set.call(this,key,value);};
Storage.prototype.getItem=function(key){if(key===PREFERENCES_KEY && api.failRead)throw new DOMException('Synthetic denied','SecurityError');return get.call(this,key);};
const rules=FEATURE_ACCESS_CONFIG;
set.call(localStorage,'sf_feature_access_snapshot',JSON.stringify({byId:Object.fromEntries(rules.map(r=>[r.id,r])),byRoute:Object.fromEntries(rules.map(r=>[r.route,r]))}));
set.call(localStorage,'sf_feature_access_date',new Date().toISOString().slice(0,10));
// Guard operation boundaries, rather than attributing existing app initialization to settings.
const fetchOriginal=window.fetch;window.fetch=(input,init)=>{const url=String(input instanceof Request?input.url:input);if(!url.startsWith(location.origin)&&!url.startsWith('/')){api.operations.push('network:'+url);return Promise.reject(Error('External request prohibited'));}return fetchOriginal(input,init);};
const open=indexedDB.open.bind(indexedDB);indexedDB.open=((...args:Parameters<IDBFactory['open']>)=>{api.operations.push('indexedDB.open:'+args[0]);return open(...args);}) as IDBFactory['open'];
const NativeWorker=window.Worker;window.Worker=class extends NativeWorker {constructor(url:string|URL,options?:WorkerOptions){api.operations.push('worker:'+url);super(url,options);}};
function Login(){const l=useLocation();return <div data-login>{l.search}</div>;}
function App(){const navigate=useNavigate(),l=useLocation();api.location=l;api.navigate=to=>flushSync(()=>navigate(to));return <Routes><Route element={<RootLayout/>}>{settingsRouteElements()}{dataHubRouteElements()}<Route path="/" element={<div data-home>Home</div>}/><Route path="/login" element={<Login/>}/></Route></Routes>;}
createRoot(document.getElementById('root')!).render(<React.StrictMode><HashRouter><FeatureAccessProvider><App/></FeatureAccessProvider></HashRouter></React.StrictMode>);
setTimeout(()=>{api.ready=true;},0);
