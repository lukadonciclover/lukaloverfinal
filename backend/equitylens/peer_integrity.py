import re
from datetime import date

def normalized(value):
    return re.sub(r'[^a-z0-9]', '', (value or '').lower())

def same_observation(a, b, transactions=False):
    if transactions and a.transaction_id and b.transaction_id:
        return normalized(a.transaction_id)==normalized(b.transaction_id)
    identifier=lambda r: normalized(r.company_id) or (normalized(r.exchange)+':'+normalized(r.ticker) if r.ticker else '')
    left,right=identifier(a),identifier(b)
    company=left==right if left and right else normalized(a.company)==normalized(b.company)
    if transactions:
        return company and normalized(a.acquirer)==normalized(b.acquirer) and a.acquisition_date==b.acquisition_date
    return company and (a.financial_period,a.reporting_basis,a.measurement_date)==(b.financial_period,b.reporting_basis,b.measurement_date)

def validate_peers(rows, target, transactions=False):
    selected=[r for r in rows if r.selected]
    for index,row in enumerate(selected):
        if any(same_observation(row,other,transactions) for other in selected[:index]):
            raise ValueError(f'Potential duplicate {"transaction" if transactions else "peer"}: {row.company}. Review or deselect duplicate observations before valuation.')
        if not row.company.strip(): raise ValueError('Selected observations require a company name.')
        if not row.basis_reviewed or row.reporting_basis=='unverified': raise ValueError(f'{row.company}: review the financial reporting basis and measurement date before valuation.')
        if row.reporting_basis!=target['basis']: raise ValueError(f'{row.company}: {row.reporting_basis} multiples are incompatible with {target["basis"]} target financials. Select matching historical or forward bases.')
        if not row.financial_period: raise ValueError(f'{row.company}: specify the financial reporting period.')
        from equitylens.periods import classify
        if row.reporting_basis in {'annual','forward'} and classify(row.financial_period)!='annual': raise ValueError(f'{row.company}: annual/forward multiples require a complete annual financial period, not quarterly earnings.')
        if row.reporting_basis=='forward' and row.financial_period!=target['period']: raise ValueError('Forward multiple and target forecast years must match.')
        if row.reporting_basis=='ttm' and classify(row.financial_period)!='quarterly': raise ValueError('TTM peer periods must identify the ending fiscal quarter; confirm the supplied denominators cover twelve months.')
        for label,value in [('measurement date',row.measurement_date),('financial period end',row.period_end)]:
            try: date.fromisoformat(value)
            except ValueError: raise ValueError(f'{row.company}: supply a valid {label} (YYYY-MM-DD).')
        if row.reporting_basis!='forward' and row.period_end>row.measurement_date: raise ValueError(f'{row.company}: historical financial period ends after its measurement date.')
