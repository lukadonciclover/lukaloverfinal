import type { PeerInput } from "./workbench";
const norm = (v?: string) => (v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
export function samePeer(a: PeerInput, b: PeerInput, transactions = false) {
  if (transactions && a.transaction_id && b.transaction_id)
    return norm(a.transaction_id) === norm(b.transaction_id);
  const id = (r: PeerInput) =>
    norm(r.company_id) ||
    (r.ticker ? `${norm(r.exchange)}:${norm(r.ticker)}` : "");
  const left = id(a),
    right = id(b),
    company =
      left && right ? left === right : norm(a.company) === norm(b.company);
  return (
    company &&
    (transactions
      ? norm(a.acquirer) === norm(b.acquirer) &&
        a.acquisition_date === b.acquisition_date
      : (a.financial_period ?? "") === (b.financial_period ?? "") &&
        (a.reporting_basis ?? "unverified") ===
          (b.reporting_basis ?? "unverified") &&
        (a.measurement_date ?? "") === (b.measurement_date ?? ""))
  );
}
const financialKeys = [
  "market_cap",
  "enterprise_value",
  "debt",
  "cash",
  "revenue",
  "ebitda",
  "ebit",
  "net_income",
  "book_equity",
] as const;
export function previewPeers(
  existing: PeerInput[],
  incoming: PeerInput[],
  transactions = false,
) {
  return incoming.map((row, index) => {
    const found = existing.findIndex((r) => samePeer(r, row, transactions));
    const prior = incoming
      .slice(0, index)
      .find((r) => samePeer(r, row, transactions));
    const match =
      found >= 0
        ? existing[found]
        : (prior ??
          incoming
            .slice(index + 1)
            .find(
              (r) =>
                samePeer(r, row, transactions) &&
                ((r.period_end ?? "") !== (row.period_end ?? "") ||
                  r.currency !== row.currency ||
                  financialKeys.some((k) =>
                    r[k] === null
                      ? row[k] !== null
                      : row[k] === null ||
                        r[k]! * r.unit_scale !== row[k]! * row.unit_scale,
                  )),
            ));
    const equal =
      match &&
      (row.period_end ?? "") === (match.period_end ?? "") &&
      row.currency === match.currency &&
      financialKeys.every((k) =>
        row[k] === null
          ? match[k] === null
          : match[k] !== null &&
            row[k]! * row.unit_scale === match[k]! * match.unit_scale,
      );
    return {
      row,
      existingIndex: found,
      status: !match ? "new" : equal ? "duplicate" : "conflict",
    } as const;
  });
}
export function importNewPeers(
  existing: PeerInput[],
  incoming: PeerInput[],
  transactions = false,
) {
  return [
    ...existing,
    ...previewPeers(existing, incoming, transactions)
      .filter((r) => r.status === "new")
      .map((r) => ({ ...r.row, selected: false })),
  ];
}
