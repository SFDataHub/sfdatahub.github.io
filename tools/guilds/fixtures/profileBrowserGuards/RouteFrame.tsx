import React from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../../../../src/i18n/en.json";
import RootLayout from "../../../../src/layout/RootLayout";
import DataHubRouteHost from "../../../../src/pages/DataHub/RouteHost";
import LocalPlayerDetail from "../../../../src/pages/DataHub/LocalPlayerDetail";
import { LOCAL_PROFILE_PATTERN } from "../../../../src/lib/data-hub/routes";
import { FeatureAccessProvider, FEATURE_ACCESS_CONFIG } from "../../../../src/lib/featureAccessConfig";
import { LocalePreferencesProvider } from "../../../../src/context/LocalePreferencesContext";
void i18n.use(initReactI18next).init({lng:"en",resources:{en:{translation:en}},initImmediate:false,interpolation:{escapeValue:false}});
const rules=FEATURE_ACCESS_CONFIG.map(r=>r.id==="main.guildHub"?{...r,status:"active"}:r);
localStorage.setItem("sf_feature_access_snapshot",JSON.stringify({byId:Object.fromEntries(rules.map(r=>[r.id,r])),byRoute:Object.fromEntries(rules.map(r=>[r.route,r]))}));
localStorage.setItem("sf_feature_access_date",new Date().toISOString().slice(0,10));
export const routing={location: null as ReturnType<typeof useLocation>|null, navigate: undefined as ReturnType<typeof useNavigate>|undefined};
function Frame({children}:{children:React.ReactNode}){
 routing.location=useLocation(); routing.navigate=useNavigate();
 return <DataHubRouteHost>{location=><Routes location={location}><Route element={<RootLayout/>}><Route path="/data-hub/guild-hub/dashboard" element={children}/><Route path="/data-hub/toplist" element={children}/><Route path={LOCAL_PROFILE_PATTERN} element={<LocalPlayerDetail/>}/><Route path="*" element={<div data-frame-empty/>}/></Route></Routes>}</DataHubRouteHost>;
}
export function RouteFrame({children,kind}:{children:React.ReactNode;kind:"dashboard"|"toplist"}){
 return <MemoryRouter initialEntries={[kind==="dashboard"?"/data-hub/guild-hub/dashboard":"/data-hub/toplist"]}><FeatureAccessProvider><LocalePreferencesProvider><Frame>{children}</Frame></LocalePreferencesProvider></FeatureAccessProvider></MemoryRouter>;
}
