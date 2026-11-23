import type { Metadata } from "next";
import { SCORE_MODEL_V1 } from "@etimaad/core";
import { DataTable } from "@/components/data-table";
import { ReasonCodeTable } from "@/components/reason-code-table";

export const metadata: Metadata = { title: "Scoring model" };

export default function AdminScoringPage() {
  const p = SCORE_MODEL_V1;

  const params: [string, string][] = [
    ["Prior (alpha / beta)", `${p.alpha} / ${p.beta} (starts at ${(100 * p.alpha) / (p.alpha + p.beta)})`],
    ["Recency half-life", `${p.halfLifeDays} days, floor ${p.recencyFloor}`],
    ["Orders counted", `last ${p.maxAgeDays} days`],
    ["Tiers", `LOW from ${p.lowTierMinScore}, MEDIUM from ${p.mediumTierMinScore}, HIGH below`],
    ["Enough data", `${p.minScoreableOrders} orders and weighted evidence ${p.minWeightedEvidence}`],
    ["Recent window", `${p.recentWindowDays} days`],
    [
      "Payment weights",
      `COD ${p.paymentWeights.COD}, partial advance ${p.paymentWeights.PARTIAL_ADVANCE}, prepaid ${p.paymentWeights.PREPAID}`,
    ],
    ["Per-vendor cap", `full credit for ${p.perVendorFullCreditOrders} orders, then ${p.perVendorExtraCreditRate}`],
    ["Daily cap", `${p.dailyOrderCap} scoreable orders per vendor per day`],
    ["Open dispute weight", String(p.openDisputeWeight)],
    ["Probation backfill", `x ${p.probationBackfillMultiplier}`],
  ];

  const bands = p.valueBands.map((b) => [b.maxPkr === null ? "above" : `up to ${b.maxPkr}`, String(b.factor)]);

  return (
    <>
      <h1>Scoring model</h1>
      <p className="muted">
        Active model version <span className="badge badge-accent">v{p.version}</span>. Read only. A change needs a
        new model version.
      </p>
      <DataTable columns={["Parameter", "Value"]} rows={params} />
      <h2>Value bands (PKR)</h2>
      <DataTable columns={["Order value", "Factor"]} rows={bands} />
      <h2>Reason codes</h2>
      <ReasonCodeTable />
    </>
  );
}
