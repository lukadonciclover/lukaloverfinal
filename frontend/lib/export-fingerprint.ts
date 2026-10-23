import { fingerprint } from "./fingerprint";
import { payloadFor } from "./workbench";
import { assumptionExport } from "./assumptions";
import type { Workspace } from "./types";
export function workbookFingerprint(w: Workspace) {
  return fingerprint({
    financialInputs: payloadFor(w),
    sourceAudit: assumptionExport(w),
  });
}
