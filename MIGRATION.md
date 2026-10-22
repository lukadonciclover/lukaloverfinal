# Valuation workbench migration

No destructive data migration is required. Existing version-1/version-2 workspace imports and portfolio storage remain supported. The optional `valuationWorkbench` field adds forecast/model/scenario settings. Legacy financial figures, document source references, DCF assumptions and company projects are preserved.

Research fields remain in saved JSON and the legacy SQLite schema solely for data compatibility. Their pages, execution modules and API endpoints are removed. Research fields are never used to produce new valuation results. Old research snapshots cannot be exported as new valuation reports.

New valuation models start disabled. Review historic DCF units before enabling standalone DCF: the new workbench uses actual currency units and actual share counts. Historical figures retain their recorded unit scales. Previously entered comparables lack reliable currency/scale metadata; enter or import them into the reviewed peer table instead of silently assuming units. Company share price/count seed the new workbench once; its editable bridge inputs then remain authoritative.

Existing project export/import, duplicate, archive/restore and source-text privacy behavior are retained. No production data, deployment settings or database structures were changed. Old research-route aliases may still redirect under the unchanged deployment routing configuration; their destinations are no longer application modules.
