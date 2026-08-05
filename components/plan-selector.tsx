"use client";

import { useState } from "react";
import { api } from "@/lib/client-api";

interface Plan {
  id: number;
  name: string;
  price_monthly: number;
  storage_bytes: number;
  max_upload_bytes: number;
  features: string;
}

export function PlanSelector({
  plans,
  currentPlanId,
}: {
  plans: Plan[];
  currentPlanId: number;
}) {
  const [current, setCurrent] = useState(currentPlanId);
  const [busy, setBusy] = useState<number | null>(null);

  const choose = async (planId: number) => {
    setBusy(planId);
    try {
      await api("/api/plans", { method: "POST", body: JSON.stringify({ plan_id: planId }) });
      setCurrent(planId);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  const GB = 1024 * 1024 * 1024;

  return (
    <div className="plans-grid">
      {plans.map((p) => {
        const isCurrent = p.id === current;
        const features = JSON.parse(p.features) as string[];
        const storageGB = Math.round(p.storage_bytes / GB);
        return (
          <div key={p.id} className={`plan-tile ${isCurrent ? "plan-tile-current" : ""}`}>
            <div className="plan-tile-head">
              <p className="plan-name">{p.name}</p>
              <strong>₹{p.price_monthly}<small> / month</small></strong>
            </div>
            <span className="plan-storage">{storageGB} GB storage</span>
            <ul>
              {features.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <button
              className={`button ${isCurrent ? "button-quiet" : "button-primary"} plan-btn`}
              onClick={() => choose(p.id)}
              disabled={isCurrent || busy !== null}
            >
              {isCurrent ? "Current plan" : busy === p.id ? "Switching…" : `Switch to ${p.name}`}
            </button>
          </div>
        );
      })}
    </div>
  );
}
