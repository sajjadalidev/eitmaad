import { DataTable } from "./data-table";

const ACTIONS = [
  ["ALLOW_COD", "Ship as cash on delivery."],
  ["REQUIRE_CONFIRMATION_CALL", "Call the customer to confirm before dispatch."],
  ["REQUIRE_PARTIAL_ADVANCE", "Ask for part of the amount in advance, for example the delivery charge."],
  ["PREPAID_ONLY", "Accept the order only if it is paid in advance."],
] as const;

export function ActionTable() {
  return (
    <DataTable
      columns={["Action", "What the merchant does"]}
      rows={ACTIONS.map(([action, meaning]) => [<code key="a">{action}</code>, meaning])}
    />
  );
}
