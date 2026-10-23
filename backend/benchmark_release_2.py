"""Synthetic benchmark: uv run --locked python benchmark_release_2.py (from backend)."""
import sys
from pathlib import Path
from timeit import timeit
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parent.parent / "tests"))
from test_workbench import project
from equitylens.workbench import evaluate, dcf_json
p=project()
for mode in ["core", "extended"]:
    print(f"{mode}: {timeit(lambda:evaluate(p,mode=mode),number=100)/100*1000:.3f} ms average (100 runs)")
with patch("equitylens.workbench.sensitivity_equity",side_effect=lambda d,schedule:dcf_json(d)["equity_value"]):
    print(f"baseline extended: {timeit(lambda:evaluate(p),number=100)/100*1000:.3f} ms average (100 runs)")

# Component timings use prevalidated, prepared candidates; exclude request parsing.
from equitylens.models import DCFInputs
from equitylens.workbench import effective_dcf, normalized_history, forecast_statements, sensitivity_equity
history=normalized_history(p)
d=effective_dcf(p,history,forecast_statements(history,p.forecast))
schedule=dcf_json(d)["forecast"]
scenarios=[DCFInputs.model_validate(d.model_copy(update={
    "revenue_growth":[v+s.growth_delta for v in d.revenue_growth],
    "ebit_margin":[v+s.margin_delta for v in d.ebit_margin],
    "wacc":d.wacc+s.wacc_delta,"terminal_growth":d.terminal_growth+s.terminal_delta,
    "exit_multiple":d.exit_multiple+s.exit_delta,
}).model_dump()) for s in p.scenarios.values()]
rate_candidates=[]
for terminal in ["growth","exit_multiple"]:
    for y in [-2,-1,0,1,2]:
        for x in [-.02,-.01,0,.01,.02]:
            rate_candidates.append(DCFInputs.model_validate({**d.model_dump(),"wacc":d.wacc+x,"terminal_method":terminal,**({"terminal_growth":d.terminal_growth+y*.005} if terminal=="growth" else {"exit_multiple":d.exit_multiple+y})}))
operating=[DCFInputs.model_validate({**d.model_dump(),"revenue_growth":[v+x for v in d.revenue_growth],"ebit_margin":[v+y for v in d.ebit_margin]}) for y in [-.02,-.01,0,.01,.02] for x in [-.02,-.01,0,.01,.02]]
for name,fn in [
    ("primary DCF",lambda:dcf_json(d)),
    ("three scenario DCFs",lambda:[dcf_json(c) for c in scenarios]),
    ("two rate sensitivity grids",lambda:[sensitivity_equity(c,schedule) for c in rate_candidates]),
    ("operating sensitivity grid",lambda:[dcf_json(c) for c in operating]),
]:
    print(f"{name}: {timeit(fn,number=100)/100*1000:.3f} ms average (prepared candidates)")
