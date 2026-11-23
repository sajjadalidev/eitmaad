import { REASON_CODES, REASON_CODE_CATALOGUE } from "@etimaad/core";
import { DataTable } from "./data-table";

// Read-only view of the reason code catalogue from @etimaad/core (blueprint section 3.2).
export function ReasonCodeTable() {
  const rows = REASON_CODES.map((code) => {
    const def = REASON_CODE_CATALOGUE[code];
    return [
      <code key="c">{code}</code>,
      def.validStatuses.join(", "),
      def.derivedFault,
      def.severityWeight,
      def.minDeliveryAttempts === null ? "None" : `${def.minDeliveryAttempts} attempts`,
    ];
  });
  return <DataTable columns={["Reason code", "Valid with status", "Fault", "Severity", "Rule"]} rows={rows} />;
}
