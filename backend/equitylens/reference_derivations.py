"""Conservative ledger derivations; never mutate approved observations."""
import math
from equitylens.models import FinancialFigure

NWC_ASSETS = ('accounts_receivable', 'inventory', 'prepaid_expenses', 'other_operating_current_assets')
NWC_LIABILITIES = ('accounts_payable', 'accrued_operating_liabilities', 'other_operating_current_liabilities')


def extend_ledger(usable, indexed, counts, years, currency):
    expansions, missing = {}, {}
    def add(year, target, terms):
        if counts[year, target] or (year, target) in indexed:
            return False
        rows = [indexed.get((year, key)) for key, _ in terms]
        if any(row is None for row in rows):
            return False
        amount = sum(row.value * row.unit_scale * sign for row, (_, sign) in zip(rows, terms))
        if not math.isfinite(amount):
            return False
        f = FinancialFigure(company_id=rows[0].company_id, metric=target, period=year, value=amount, currency=currency, origin='derived')
        indexed[year, target] = f
        usable.append(f)
        expansions[year, target] = [original for row in rows for original in expansions.get((year, row.metric), [row])]
        return True
    for year in years:
        add(year, 'gross_profit', [('revenue', 1), ('cost_of_goods_sold', -1)])
        add(year, 'ebitda', [('ebit', 1), ('depreciation_amortization', 1)])
        # Explicit zero reconciliation records establish that tax and earnings
        # share the same consolidated continuing-operations scope. Nonzero
        # differences require reviewed pretax income rather than guessing scope.
        checks = ['discontinued_operations_net_income', 'noncontrolling_net_income', 'other_tax_reconciliation']
        reconciled = all((year, k) in indexed and indexed[year, k].value == 0 for k in checks)
        if reconciled:
            add(year, 'pretax_income', [('net_income', 1), ('tax_expense', 1)] + [(k, 1) for k in checks])
        add(year, 'pretax_income', [('ebit', 1), ('interest_expense', -1), ('nonoperating_expenses', -1), ('nonoperating_income', 1)])
        add(year, 'net_working_capital', [(k, 1) for k in NWC_ASSETS] + [(k, -1) for k in NWC_LIABILITIES])
        add(year, 'total_debt', [('short_term_debt', 1), ('long_term_debt', 1)])
        if (year, 'net_working_capital') not in indexed:
            missing.setdefault('nwc_ratio', []).append(f"{year}: missing or invalid " + ', '.join(k.replace('_', ' ') for k in (*NWC_ASSETS, *NWC_LIABILITIES) if (year, k) not in indexed))
        if (year, 'pretax_income') not in indexed:
            missing.setdefault('tax_rate', []).append(f"{year}: supply reported pretax income, or net income and tax with zero discontinued-operations, noncontrolling and other tax reconciliation records, or EBIT, borrowing interest, nonoperating expenses and nonoperating income (including confirmed zeros)")
    return expansions, missing
