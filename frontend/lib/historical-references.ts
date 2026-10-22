import type {Workspace} from "./types";
import {financialFingerprint} from "./fingerprint";
import {applyProposals,currentValue,proposalError,targetsFor,type Assumption,type Proposal} from "./assumptions";
import {settingsFor} from "./workbench";

export interface HistoricalAverage {metric:string;value:number|null;count:number;periods:string[];observations:Assumption[];source:Assumption;unavailable:string;prefill_eligible?:boolean}
export interface HistoricalReferences {window:2|3|5;periods:string[];available_years:string[];averages:HistoricalAverage[];latest:Assumption[];issues:string[];currency:string;input_hash:string;created_at:string}
export type HistoricalScope="forecast"|"valuation";
export function referencesCurrent(w:Workspace,refs=w.historicalReferences){return !!refs && refs.input_hash===financialFingerprint(w.figures) && refs.currency===w.company.currency}
export function historicalCandidates(w:Workspace,scope:HistoricalScope):Proposal[]{
  const refs=w.historicalReferences;if(!refs || !referencesCurrent(w,refs))return [];
  const settings=settingsFor(w);
  const sources=[...refs.averages.filter(a=>a.value!==null).map(a=>a.source),...refs.latest];
  const candidates=sources.flatMap(source=>targetsFor(source,w).filter(target=>scope==="forecast"?target.startsWith("forecast."):!target.startsWith("forecast.") && !target.startsWith("wacc.")).map(target=>({source,target,value:source.value!,period:target.startsWith("forecast.")?`Initial reference across ${settings.forecast.horizon} forecast years`:`Historical starting input; ${source.period}`,rationale:source.rationale,reviewed:true})));
  return candidates.filter(p=>{
    if(settings.enabled.forecast && (p.target.startsWith("dcf.") || p.target==="settings.opening_nwc"))return false;
    // Prefer the reported EBITDA driver; an opex override must reconcile with its definition.
    if(p.target==="forecast.opex_ratio"){
      if(!refs.averages.find(a=>a.metric==="opex_ratio")?.prefill_eligible)return false;
      if(settings.forecast.ebitda_margin!==null || sources.some(a=>a.metric==="ebitda_margin" && a.value!==null))return false;
      const gross=sources.find(a=>a.metric==="gross_margin")?.value;
      if(gross===null || gross===undefined || settings.forecast.gross_margin!==null && settings.forecast.gross_margin!==gross)return false;
    }
    return !proposalError(p,w);
  });
}
export function fillHistorical(w:Workspace,scope:HistoricalScope,target?:string):{workspace:Workspace;count:number}{
  const rows=historicalCandidates(w,scope).filter(p=>target?p.target===target:currentValue(w,p.target)===null && !(w.assumptionAdoptions??[]).some(a=>a.target===p.target && a.user_modified_at));
  if(!rows.length)return {workspace:w,count:0};
  const next=applyProposals(w,rows,w.revision);
  const offset=w.assumptionAdoptions?.length??0;
  next.assumptionAdoptions=next.assumptionAdoptions!.map((a,i)=>i<offset?a:{...a,mode:target?"historical restore":"automatic",input_hash:w.historicalReferences!.input_hash,window:w.historicalReferences!.window});
  return {workspace:next,count:rows.length};
}
export function markHistoricalEdits(before:Workspace,next:Workspace):Workspace{
  if(next===before || !before.assumptionAdoptions?.length)return next;
  const latest=new Map(before.assumptionAdoptions.map(a=>[a.target,a]));
  let changed=false;
  const records=next.assumptionAdoptions?.map(a=>{
    if(latest.get(a.target)?.id!==a.id || a.user_modified_at || (next.assumptionAdoptions??[]).some(b=>b.target===a.target && !before.assumptionAdoptions!.some(old=>old.id===b.id)))return a;
    if(currentValue(before,a.target)===currentValue(next,a.target))return a;
    changed=true;return {...a,user_modified_at:new Date().toISOString()};
  });
  return changed?{...next,assumptionAdoptions:records}:next;
}
export function historicalLabel(w:Workspace,target:string):string|null{
  const record=w.assumptionAdoptions?.filter(a=>a.target===target).at(-1);
  if(!record?.mode)return null;
  const current=currentValue(w,target);
  const formatted=record.source.unit==="percentage" && current!==null?`${(current*100).toLocaleString(undefined,{maximumFractionDigits:3})}%`:current===null?"Blank":current.toLocaleString();
  const edited=record.user_modified_at || current!==record.value;
  return `${formatted} · ${edited?"User-modified":record.source.basis==="historical average"?"Historical average":"Latest annual position"} · ${record.source.period}${record.input_hash!==financialFingerprint(w.figures) || record.source.currency!==w.company.currency?" · Historical reference stale":""}`;
}
