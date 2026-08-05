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
  is_default: number;
  active: number;
}

export function AdminPlans({ initial }: { initial: Plan[] }) {
  const [plans, setPlans] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState({
    name: "",
    price: "0",
    storage: "10",
    upload: "2000",
    features: "",
    active: true,
    is_default: false,
  });

  const reload = async () => {
    const data = await api<{ plans: Plan[] }>("/api/admin/plans");
    setPlans(data.plans);
  };

  const resetForm = () =>
    setForm({ name: "", price: "0", storage: "10", upload: "2000", features: "", active: true, is_default: false });

  const save = async () => {
    const body = {
      name: form.name,
      price_monthly: Number(form.price),
      storage_gb: Number(form.storage),
      max_upload_mb: Number(form.upload),
      features: form.features.split(",").map((s) => s.trim()).filter(Boolean),
      active: form.active,
      is_default: form.is_default,
    };
    try {
      if (editing) {
        await api(`/api/admin/plans/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await api("/api/admin/plans", { method: "POST", body: JSON.stringify(body) });
      }
      setCreating(false);
      setEditing(null);
      resetForm();
      reload();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const del = async (p: Plan) => {
    if (!confirm(`Delete plan "${p.name}"?`)) return;
    try {
      await api(`/api/admin/plans/${p.id}`, { method: "DELETE" });
      reload();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const openEdit = (p: Plan) => {
    setEditing(p);
    setCreating(true);
    setForm({
      name: p.name,
      price: String(p.price_monthly),
      storage: String(p.storage_bytes / (1024 * 1024 * 1024)),
      upload: String(p.max_upload_bytes / (1024 * 1024)),
      features: (JSON.parse(p.features) as string[]).join(", "),
      active: !!p.active,
      is_default: !!p.is_default,
    });
  };

  return (
    <div className="card">
      <div className="card-toolbar">
        <button className="button button-primary" onClick={() => { setEditing(null); resetForm(); setCreating(true); }}>+ New plan</button>
      </div>

      {creating && (
        <div className="modal">
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => { setCreating(false); setEditing(null); }}>✕</button>
            <h3>{editing ? "Edit plan" : "Create plan"}</h3>
            <div className="form-grid">
              <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pro" /></label>
              <label>Price (₹/month)<input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></label>
              <label>Storage (GB)<input type="number" value={form.storage} onChange={(e) => setForm({ ...form, storage: e.target.value })} /></label>
              <label>Max upload (MB)<input type="number" value={form.upload} onChange={(e) => setForm({ ...form, upload: e.target.value })} /></label>
              <label className="full">Features (comma separated)
                <textarea value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} rows={3} /></label>
              <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
              <label className="check"><input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} /> Default plan</label>
            </div>
            <div className="modal-actions">
              <button className="button button-primary" onClick={save}>{editing ? "Save changes" : "Create plan"}</button>
              <button className="button button-quiet" onClick={() => { setCreating(false); setEditing(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <table className="data-table">
        <thead>
          <tr><th>Plan</th><th>Price</th><th>Storage</th><th>Max upload</th><th>Default</th><th>Active</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {plans.map((p) => (
            <tr key={p.id}>
              <td><b>{p.name}</b></td>
              <td>₹{p.price_monthly}/mo</td>
              <td>{Math.round(p.storage_bytes / (1024 * 1024 * 1024))} GB</td>
              <td>{Math.round(p.max_upload_bytes / (1024 * 1024))} MB</td>
              <td>{p.is_default ? "✓" : "—"}</td>
              <td>{p.active ? <span className="pill pill-ok">Active</span> : <span className="pill pill-err">Inactive</span>}</td>
              <td className="row-actions">
                <button className="button button-quiet" onClick={() => openEdit(p)}>Edit</button>
                <button className="button button-quiet danger" onClick={() => del(p)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
