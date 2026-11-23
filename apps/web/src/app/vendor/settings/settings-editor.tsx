"use client";

import { useActionState, useMemo, useState } from "react";
import { saveSettingsAction, type FormState } from "../self-service-actions";
import {
  DEFAULT_VENDOR_SETTINGS,
  parseVendorSettings,
  resolveAction,
  type DegradedModeAction,
  type VendorSettings,
} from "@etimaad/core/actions";
import { RECOMMENDED_ACTIONS, RISK_TIERS, type RecommendedAction, type RiskTier } from "@etimaad/core/domain";

const TIER_LABEL: Record<RiskTier, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  INSUFFICIENT_DATA: "Not enough data",
};

function ActionSelect({
  id,
  value,
  onChange,
  allowNone = false,
}: {
  id: string;
  value: RecommendedAction | undefined;
  onChange: (value: RecommendedAction | undefined) => void;
  allowNone?: boolean;
}) {
  return (
    <select
      id={id}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : (e.target.value as RecommendedAction))}
    >
      {allowNone && <option value="">No override</option>}
      {RECOMMENDED_ACTIONS.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
    </select>
  );
}

const INITIAL: FormState = { status: "IDLE", message: null };

export function SettingsEditor({ initial }: { initial: VendorSettings }) {
  const [settings, setSettings] = useState<VendorSettings>(initial);
  const validation = useMemo(() => parseVendorSettings(settings), [settings]);
  const [state, formAction, pending] = useActionState(saveSettingsAction, INITIAL);

  const setTierAction = (tier: RiskTier, action: RecommendedAction | undefined) => {
    if (!action) return;
    setSettings((s) => ({ ...s, tier_actions: { ...s.tier_actions, [tier]: action } }));
  };

  const setOverride = (tier: RiskTier, action: RecommendedAction | undefined) => {
    setSettings((s) => {
      const next = { ...s.high_value_overrides };
      if (action) next[tier] = action;
      else delete next[tier];
      return { ...s, high_value_overrides: next };
    });
  };

  const preview = RISK_TIERS.map((tier) => {
    const base = { tier, hasRecentUserFault: false, ownUserFaults: 0, settings };
    return {
      tier,
      normal: resolveAction({ ...base, orderValuePkr: 3000 }).action,
      highValue: resolveAction({ ...base, orderValuePkr: settings.high_value_threshold_pkr + 1 }).action,
      recentFault: resolveAction({ ...base, orderValuePkr: 3000, hasRecentUserFault: true }).action,
      ownHistory: resolveAction({
        ...base,
        orderValuePkr: 3000,
        ownUserFaults: settings.own_history_rules.min_user_faults_with_us,
      }).action,
    };
  });

  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <form className="form card" action={formAction}>
        <input type="hidden" name="settings" value={JSON.stringify(settings)} />
        <h2>Actions by risk level</h2>
        {RISK_TIERS.map((tier) => (
          <div className="field" key={tier}>
            <label htmlFor={`tier-${tier}`}>{TIER_LABEL[tier]}</label>
            <ActionSelect
              id={`tier-${tier}`}
              value={settings.tier_actions[tier]}
              onChange={(a) => setTierAction(tier, a)}
            />
          </div>
        ))}

        <h2>High value orders</h2>
        <div className="field">
          <label htmlFor="threshold">Orders above (PKR)</label>
          <input
            id="threshold"
            type="number"
            min={1}
            value={settings.high_value_threshold_pkr}
            onChange={(e) => setSettings((s) => ({ ...s, high_value_threshold_pkr: Number(e.target.value) }))}
          />
        </div>
        {RISK_TIERS.map((tier) => (
          <div className="field" key={tier}>
            <label htmlFor={`override-${tier}`}>{TIER_LABEL[tier]} and high value</label>
            <ActionSelect
              id={`override-${tier}`}
              value={settings.high_value_overrides[tier]}
              onChange={(a) => setOverride(tier, a)}
              allowNone
            />
          </div>
        ))}

        <h2>Other rules</h2>
        <div className="field">
          <label htmlFor="recent">Not enough data, but a recent refusal</label>
          <ActionSelect
            id="recent"
            value={settings.recent_user_fault_action}
            onChange={(a) => a && setSettings((s) => ({ ...s, recent_user_fault_action: a }))}
          />
        </div>
        <div className="field">
          <label htmlFor="own-min">Customer faults at your own store</label>
          <input
            id="own-min"
            type="number"
            min={1}
            step={1}
            value={settings.own_history_rules.min_user_faults_with_us}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                own_history_rules: { ...s.own_history_rules, min_user_faults_with_us: Number(e.target.value) },
              }))
            }
          />
        </div>
        <div className="field">
          <label htmlFor="own-action">Then</label>
          <ActionSelect
            id="own-action"
            value={settings.own_history_rules.action}
            onChange={(a) =>
              a && setSettings((s) => ({ ...s, own_history_rules: { ...s.own_history_rules, action: a } }))
            }
          />
        </div>
        <div className="field">
          <label htmlFor="degraded">If Etimaad cannot answer</label>
          <select
            id="degraded"
            value={settings.degraded_mode_action}
            onChange={(e) =>
              setSettings((s) => ({ ...s, degraded_mode_action: e.target.value as DegradedModeAction }))
            }
          >
            <option value="ALLOW_COD">ALLOW_COD</option>
            <option value="REQUIRE_CONFIRMATION_CALL">REQUIRE_CONFIRMATION_CALL</option>
          </select>
        </div>

        <div className="btn-row">
          <button type="submit" className="btn btn-primary" disabled={pending || !validation.ok}>
            {pending ? "Saving..." : "Save"}
          </button>
          <button type="button" className="btn" onClick={() => setSettings(DEFAULT_VENDOR_SETTINGS)}>
            Reset to defaults
          </button>
        </div>
        {state.message && (
          <p className={state.status === "ERROR" ? "notice" : "badge badge-accent"} role="status">
            {state.message}
          </p>
        )}
        <p className="muted small">Saved settings apply to your next risk check.</p>
      </form>

      <div className="stack">
        <div className="card stack">
          <h2>Preview</h2>
          <p className={validation.ok ? "badge badge-accent" : "notice"}>
            {validation.ok ? "Settings are valid" : "Settings are not valid. Check the numbers."}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Risk level</th>
                  <th>Normal order</th>
                  <th>High value</th>
                  <th>Recent refusal</th>
                  <th>Faults with you</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.tier}>
                    <td className={`tier tier-${row.tier}`}>{TIER_LABEL[row.tier]}</td>
                    <td>
                      <code>{row.normal}</code>
                    </td>
                    <td>
                      <code>{row.highValue}</code>
                    </td>
                    <td>
                      <code>{row.recentFault}</code>
                    </td>
                    <td>
                      <code>{row.ownHistory}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">Normal order is PKR 3,000. Recent refusal only applies to Not enough data.</p>
        </div>
        <div className="card">
          <h3>Stored as</h3>
          <pre>
            <code>{JSON.stringify(settings, null, 2)}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
