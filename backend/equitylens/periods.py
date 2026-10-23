"""Reporting-frequency boundaries and auditable TTM observations."""
import math
import re
from datetime import date, timedelta

FLOW_METRICS = {'revenue', 'ebitda', 'ebit', 'net_income', 'operating_cash_flow', 'capital_expenditure', 'free_cash_flow'}

def classify(period):
    return 'annual' if re.fullmatch(r'(?:19|20)\d{2}', period or '') else 'quarterly' if re.fullmatch(r'(?:19|20)\d{2}-Q[1-4]', period or '') else 'unsupported'

def quarter_index(period):
    return int(period[:4])*4 + int(period[-1])-1

def annual_history(history):
    return {p:r for p,r in history.items() if classify(p)=='annual'}

def validate_period_metadata(figures):
    seen={}
    for f in figures:
        for key in ('period_start','period_end'):
            value=getattr(f,key,'')
            if value:
                try: date.fromisoformat(value)
                except ValueError: raise ValueError(f'{f.period}: invalid {key}; use YYYY-MM-DD.')
        if f.period_start and f.period_end:
            days=(date.fromisoformat(f.period_end)-date.fromisoformat(f.period_start)).days+1
            if days<=0 or (classify(f.period)=='annual' and not 350<=days<=371): raise ValueError(f'{f.period}: shortened, overlapping or ambiguous fiscal year; provide a comparable full-year period.')
        for key in ('period_start','period_end','fiscal_calendar'):
            value=getattr(f,key,'')
            if value and (f.period,key) in seen and seen[f.period,key]!=value: raise ValueError(f'{f.period}: inconsistent {key}; separate incompatible fiscal periods.')
            if value: seen[f.period,key]=value

def ttm_figures(figures, currency):
    output, issues = [], []
    quarters=sorted({f.period for f in figures if classify(f.period)=='quarterly'},key=quarter_index)
    for end in quarters:
        labels=[p for p in quarters if quarter_index(end)-3 <= quarter_index(p) <= quarter_index(end)]
        for metric in sorted(FLOW_METRICS):
            if not any(f.metric==metric and f.period in labels for f in figures): continue
            try:
                if len(labels)!=4: raise ValueError('four consecutive quarters required')
                rows=[]
                for period in labels:
                    matches=[f for f in figures if f.period==period and f.metric==metric]
                    if len(matches)!=1: raise ValueError(f'{period}: missing or duplicate {metric}')
                    f=matches[0]
                    if f.currency!=currency or f.value is None or not math.isfinite(f.value*f.unit_scale): raise ValueError('currency, value or scale is incompatible')
                    if not f.period_start or not f.period_end or not f.fiscal_calendar: raise ValueError('verified period start/end dates and fiscal calendar identifier required')
                    start, finish=date.fromisoformat(f.period_start),date.fromisoformat(f.period_end)
                    if not 70 <= (finish-start).days+1 <= 110: raise ValueError('quarter is not a standalone approximately three-month period; YTD is not supported')
                    if rows:
                        prev=rows[-1]
                        if date.fromisoformat(prev.period_end)+timedelta(days=1)!=start or prev.fiscal_calendar!=f.fiscal_calendar: raise ValueError('overlapping, missing dates or changed fiscal calendar')
                    rows.append(f)
                days=(date.fromisoformat(rows[-1].period_end)-date.fromisoformat(rows[0].period_start)).days+1
                if not 350<=days<=371: raise ValueError('quarters do not cover a complete 52/53-week year')
                values=[abs(f.value*f.unit_scale) if metric=='capital_expenditure' else f.value*f.unit_scale for f in rows]
                output.append(dict(metric=metric,period=end,basis='ttm',period_start=rows[0].period_start,period_end=rows[-1].period_end,fiscal_calendar=rows[0].fiscal_calendar,value=sum(values),currency=currency,unit_scale=1,inputs=[f.model_dump(mode='json') for f in rows]))
            except ValueError as exc: issues.append(f'{metric} TTM ending {end}: {exc}.')
    # Derive FCF only from compatible TTM OCF and capex observations.
    for end in quarters:
        available={r['metric']:r for r in output if r['period']==end}
        if 'free_cash_flow' not in available and all(k in available for k in ['operating_cash_flow','capital_expenditure']):
            a,b=available['operating_cash_flow'],available['capital_expenditure']
            if (a['period_start'],a['period_end'],a['fiscal_calendar'])==(b['period_start'],b['period_end'],b['fiscal_calendar']):
                output.append({**a,'metric':'free_cash_flow','value':a['value']-b['value'],'inputs':a['inputs']+b['inputs']})
    return dict(figures=output,issues=issues)

def target_financials(p, history):
    basis=p.relative_basis
    if basis=='forward':
        f=p.forward_target
        if not f or not f.reviewed or f.currency!=p.currency or classify(f.period)!='annual': raise ValueError('Forward valuation requires reviewed annual forward financials, matching currency and an explicit financial year.')
        if f.balance_date:
            try: date.fromisoformat(f.balance_date)
            except ValueError: raise ValueError('Forward balance date must be YYYY-MM-DD.')
        return dict(values=f.metrics,basis=basis,period=f.period,inputs={},balance_date=f.balance_date)
    if basis=='annual':
        annual=annual_history(history)
        if not annual: raise ValueError('Annual multiples cannot use quarterly target figures. Provide annual statements or verified TTM data.')
        period=max(annual)
        dates={f.period_end for f in p.figures if f.period==period and f.metric=='total_equity' and f.period_end}
        return dict(values=annual[period],basis=basis,period=period,balance_date=next(iter(dates)) if len(dates)==1 else '',inputs={k:[f.model_dump(mode='json') for f in p.figures if f.period==period and f.metric==k] for k in annual[period]})
    ttm=ttm_figures(p.figures,p.currency)
    quarters=[f.period for f in p.figures if classify(f.period)=='quarterly']
    if not quarters: raise ValueError('TTM valuation requires four consecutive verified quarters with dates and fiscal calendar identifiers.')
    period=max(quarters,key=quarter_index)
    rows=[r for r in ttm['figures'] if r['period']==period]
    if not rows: raise ValueError('TTM unavailable: ' + '; '.join(ttm['issues'][-7:]))
    end_dates={r['period_end'] for r in rows}; calendars={r['fiscal_calendar'] for r in rows}
    if len(end_dates)!=1 or len(calendars)!=1: raise ValueError('Target TTM metrics have inconsistent fiscal periods.')
    end=rows[0]['period_end']; values={r['metric']:r['value'] for r in rows}; inputs={r['metric']:r['inputs'] for r in rows}
    equity=[f for f in p.figures if f.period==period and f.metric=='total_equity' and f.period_end==end and f.value is not None]
    if len(equity)==1: values['total_equity']=equity[0].value*equity[0].unit_scale; inputs['total_equity']=[equity[0].model_dump(mode='json')]
    return dict(values=values,basis=basis,period=period,balance_date=end,inputs=inputs,issues=[i for i in ttm['issues'] if f'ending {period}:' in i])
