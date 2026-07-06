'use client';
// ═══ Cash Flow Dashboard ═══
// One glance: money in, money out, what's still owed, tax-deductible total.
// Expenses can be added right here (and still by chat — "spent 80 on paint").
import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { createClient } from '@/lib/supabase/client';

const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

const CATEGORIES = ['Gas', 'Materials', 'Tools', 'Meals', 'Phone', 'Insurance', 'Other'];

export default function Dashboard() {
  const supabase = createClient();
  const [stats, setStats] = useState({ paid: 0, outstanding: 0, spent: 0, deductible: 0, count: 0 });
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [deductible, setDeductible] = useState(true);
  const [spentOn, setSpentOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function loadStats() {
    const [{ data: invs }, { data: exps }] = await Promise.all([
      supabase.from('invoices').select('total, status, kind').eq('kind', 'invoice'),
      supabase.from('expenses').select('amount, tax_deductible, spent_on'),
    ]);
    const paid = (invs ?? []).filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.total), 0);
    const outstanding = (invs ?? []).filter((i) => ['sent', 'overdue'].includes(i.status)).reduce((s, i) => s + Number(i.total), 0);
    const spent = (exps ?? []).reduce((s, e) => s + Number(e.amount), 0);
    const deductibleTotal = (exps ?? []).filter((e) => e.tax_deductible).reduce((s, e) => s + Number(e.amount), 0);
    setStats({ paid, outstanding, spent, deductible: deductibleTotal, count: invs?.length ?? 0 });
  }

  useEffect(() => {
    void loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setAmount(''); setDescription(''); setCategory(''); setCustomCategory('');
    setDeductible(true); setSpentOn(new Date().toISOString().slice(0, 10));
    setFormError('');
  }

  async function saveExpense() {
    const value = Number(amount);
    if (!value || value <= 0 || !description.trim()) {
      setFormError('Add an amount and what it was for.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setFormError('Sign in to log expenses.'); return; }
      const cat = category === 'Other' ? customCategory.trim() || 'Other' : category || null;
      const { error } = await supabase.from('expenses').insert({
        user_id: user.id,
        description: description.trim(),
        amount: value,
        category: cat,
        tax_deductible: deductible,
        spent_on: spentOn,
      });
      if (error) { setFormError(error.message); return; }
      setShowForm(false);
      resetForm();
      void loadStats();
    } finally {
      setSaving(false);
    }
  }

  const net = stats.paid - stats.spent;
  return (
    <div className="space-y-3 px-4 py-4">
      {/* The ONE deliberately dark element on this screen (§8) */}
      <div className="rounded-card bg-inverse-surface p-6 shadow-card-raised">
        <div className="text-label-lg font-semibold uppercase tracking-widest text-inverse-primary/80">
          Net (all time)
        </div>
        <div className={`font-display text-numeric-xl tracking-tight ${net >= 0 ? 'text-inverse-primary' : 'text-error-container'}`}>
          {money(net)}
        </div>
        <div className="mt-1 text-xs text-inverse-on-surface/60">{stats.count} invoices created</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Collected" value={money(stats.paid)} tone="text-paid" icon="check_circle" iconCls="bg-paid-container text-paid" />
        <Stat label="Still owed" value={money(stats.outstanding)} tone="text-primary" icon="pending" iconCls="bg-primary-fixed text-primary" />
        <Stat label="Spent" value={money(stats.spent)} tone="text-error" icon="shopping_cart" iconCls="bg-error-container text-error" />
        <Stat label="Deductible" value={money(stats.deductible)} tone="text-on-surface" icon="receipt_long" iconCls="bg-secondary-container text-on-surface" />
      </div>

      <button className="btn-primary w-full" onClick={() => setShowForm(true)}>
        <Icon name="add" size={22} /> Add expense
      </button>
      <a href="/expenses" className="btn-outline w-full text-primary">
        See all expenses <Icon name="arrow_forward" size={18} />
      </a>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end bg-on-background/40" onClick={() => setShowForm(false)}>
          <div
            className="w-full rounded-t-card bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Add expense</h2>
              <button aria-label="Close" className="grid h-10 w-10 place-items-center rounded-full text-on-surface-variant"
                onClick={() => setShowForm(false)}>
                <Icon name="close" size={24} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                className="input font-display font-bold text-lg"
                placeholder="$ Amount" inputMode="decimal" value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              />
              <input
                className="input"
                placeholder="What was it for?" maxLength={300} value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c} className={`chip ${category === c ? 'chip-selected' : ''}`}
                    onClick={() => setCategory(category === c ? '' : c)}>
                    {c}
                  </button>
                ))}
              </div>
              {category === 'Other' && (
                <input
                  className="input"
                  placeholder="Category name" maxLength={60} value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                />
              )}
              <label className="flex min-h-touch items-center justify-between rounded-input border border-outline-variant/60 bg-surface-container px-4 py-3">
                <span className="text-sm">Tax deductible</span>
                <button
                  role="switch" aria-checked={deductible} aria-label="Tax deductible"
                  onClick={() => setDeductible(!deductible)}
                  className={`relative h-8 w-14 rounded-full transition-colors ${deductible ? 'bg-primary-container' : 'bg-outline-variant'}`}
                >
                  <span className={`absolute top-1 h-6 w-6 rounded-full bg-surface-container-lowest shadow transition-all ${deductible ? 'left-7' : 'left-1'}`} />
                </button>
              </label>
              <input
                type="date" className="input"
                value={spentOn} onChange={(e) => setSpentOn(e.target.value)}
              />
              {formError && <p className="text-sm text-error">{formError}</p>}
              <button className="btn-primary w-full" disabled={saving} onClick={saveExpense}>
                {saving ? 'Saving…' : 'Save expense'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, icon, iconCls }: {
  label: string; value: string; tone: string; icon: string; iconCls: string;
}) {
  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className={`grid h-8 w-8 place-items-center rounded-lg ${iconCls}`}>
          <Icon name={icon} size={18} />
        </span>
        <span className="text-label-lg font-semibold text-on-surface-variant/80">{label}</span>
      </div>
      <div className={`font-display text-[24px] font-bold leading-tight ${tone}`}>{value}</div>
    </div>
  );
}
