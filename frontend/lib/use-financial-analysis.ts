"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useWorkspace} from "./workspace";
import {apiPost} from "./api";
import {financialFingerprint} from "./fingerprint";
import type {FinancialAnalysisSnapshot} from "./types";
import type {HistoricalReferences} from "./historical-references";

type Response = Omit<FinancialAnalysisSnapshot,"input_hash"|"created_at"> & {historical_references?:HistoricalReferences};
export function useFinancialAnalysis(){
  const context=useWorkspace(),{workspace:w,project}=context;
  const hash=financialFingerprint(w.figures),key=`${project.id}:${w.company.currency}:${hash}`;
  const latest=useRef({...context,hash,key});latest.current={...context,hash,key};
  const request=useRef<{controller:AbortController;key:string;manual:boolean}|null>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [loading,setLoading]=useState(false),[error,setError]=useState(""),[completed,setCompleted]=useState("");
  const run=useCallback(async(manual=true)=>{
    if(timer.current){clearTimeout(timer.current);timer.current=null}
    const captured=latest.current,workspace=captured.workspace;
    if(!workspace.figures.length || workspace.figures.some(f=>f.currency!==workspace.company.currency))return;
    if(request.current?.key===captured.key && (!manual || request.current.manual))return;
    request.current?.controller.abort();
    const active={controller:new AbortController(),key:captured.key,manual};request.current=active;
    setLoading(true);setError("");setCompleted("");
    try{
      const response=await apiPost<Response>("/v1/financials/analyze",{figures:workspace.figures.map(({record_id:_id,...f})=>f),currency:workspace.company.currency,history_window:workspace.historicalReferences?.window??3},{signal:active.controller.signal});
      if(active.controller.signal.aborted || request.current!==active || latest.current.key!==active.key)return;
      if(!Array.isArray(response.analysis) || !Array.isArray(response.quality_issues))throw new Error("The analysis response was incomplete. Retry the calculation.");
      const created_at=new Date().toISOString();
      const {historical_references,...analysis}=response;
      captured.updateWorkspace(current=>financialFingerprint(current.figures)!==captured.hash || current.company.currency!==workspace.company.currency ? current : ({...current,
        financialAnalysis:{...analysis,input_hash:captured.hash,created_at,unit_scale:Math.max(1,...workspace.figures.map(f=>f.unit_scale)),currency:workspace.company.currency},
        ...(historical_references?{historicalReferences:{...historical_references,input_hash:captured.hash,currency:workspace.company.currency,created_at}}:{})}));
      setCompleted("Financial analysis updated successfully.");
    }catch(reason){
      if(!active.controller.signal.aborted && request.current===active && latest.current.key===active.key)setError(`${reason instanceof Error?reason.message:"Calculation failed."} Review approved financial inputs or retry.`);
    }finally{if(request.current===active){request.current=null;setLoading(false)}}
  },[]);
  useEffect(()=>{
    setLoading(false);setError("");setCompleted("");
    const current=latest.current.workspace;
    if(current.figures.length && !current.figures.some(f=>f.currency!==current.company.currency) && (current.financialAnalysis?.input_hash!==hash || (current.financialAnalysis.currency && current.financialAnalysis.currency!==current.company.currency))) timer.current=setTimeout(()=>void run(false),400);
    return ()=>{if(timer.current){clearTimeout(timer.current);timer.current=null}request.current?.controller.abort();request.current=null};
  },[key,hash,run]);
  return {loading,error,completed,run,hash};
}
