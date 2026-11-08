import React from "react";
export const None=()=>null;
export const db={};
const auth={status:"authenticated",isLoading:false,user:{id:"",roles:["admin"],favorites:{players:{},guilds:{}},linkedPlayers:[]},logout:()=>{}};
export const useAuth=()=>auth;
export const useDataJobs=()=>({isReady:true,runningSfToolsImportJob:null,runningScanMergeJob:null});
export const getDataJobDetail=async()=>null;
export const getDataJobProgress=()=>0;
export const getDataJobStatusLabel=()=>"Fixture";
