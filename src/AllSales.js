import React, { useEffect, useMemo, useState } from 'react';
import supabase from './supabase';
import './AllSales.css';

function formatCurrency(amount, currency = 'K') {
  const n = Number(amount || 0);
  const formatted = n % 1 === 0 ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency} ${formatted}`;
}

export default function AllSales() {
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customersMap, setCustomersMap] = useState({});
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // { sale, layby }
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchAll() {
      setLoading(true);
      try {
        // Fetch customers
        const { data: custRows } = await supabase
          .from('customers')
          .select('id, name, phone, currency');
        setCustomers(custRows || []);
        const cMap = (custRows || []).reduce((acc, c) => { acc[c.id] = c; return acc; }, {});
        setCustomersMap(cMap);

        // Fetch sales (all)
        const { data: salesRows } = await supabase
          .from('sales')
          .select('id, sale_date, customer_id, status, currency, total_amount, discount, down_payment, receipt_number, reminder_date')
          .order('sale_date', { ascending: false });
        const saleIds = (salesRows || []).map(s => s.id);

        // Fetch laybys for these sales
        let laybyBySale = {};
        if (saleIds.length > 0) {
          const { data: laybyRows } = await supabase
            .from('laybys')
            .select('id, sale_id, customer_id, total_amount, paid_amount, status, notes, created_at, updated_at')
            .in('sale_id', saleIds);
          (laybyRows || []).forEach(l => { laybyBySale[Number(l.sale_id)] = l; });
        }

        // Fetch payments sums per sale
        let paymentsMap = {};
        if (saleIds.length > 0) {
          const { data: pays } = await supabase
            .from('sales_payments')
            .select('sale_id, amount')
            .in('sale_id', saleIds);
          (pays || []).forEach(p => {
            const sid = Number(p.sale_id);
            paymentsMap[sid] = (paymentsMap[sid] || 0) + Number(p.amount || 0);
          });
        }

        // Merge
        const enriched = (salesRows || []).map(s => {
          const layby = laybyBySale[Number(s.id)];
          const down = Number(s.down_payment || 0);
          const pays = Number(paymentsMap[Number(s.id)] || 0);
          const paid = down + pays;
          const outstanding = (s.status === 'layby') ? (Number(s.total_amount || 0) - paid) : 0;
          const customer = cMap[s.customer_id] || {};
          const receipt = s.receipt_number || s.id;
          return {
            ...s,
            receipt,
            isLayby: s.status === 'layby' || !!layby,
            layby,
            paid,
            outstanding,
            customerName: customer.name,
            customer,
          };
        });
        setSales(enriched);
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  const filtered = useMemo(() => {
    const s = (search || '').toLowerCase().trim();
    if (!s) return sales;
    return sales.filter(row => {
      const rec = String(row.receipt || '').toLowerCase();
      const name = String(row.customerName || '').toLowerCase();
      const total = String(row.total_amount || '').toLowerCase();
      const paid = String(row.paid || '').toLowerCase();
      const due = String(row.outstanding || '').toLowerCase();
      return rec.includes(s) || name.includes(s) || total.includes(s) || paid.includes(s) || due.includes(s);
    });
  }, [sales, search]);

  const openEdit = (row) => {
    const layby = row.layby || null;
    setEditing({
      saleId: row.id,
      receipt: row.receipt || row.id,
      sale_date: row.sale_date ? row.sale_date.substring(0, 10) : '',
      customer_id: row.customer_id,
      status: row.status || 'completed',
      currency: row.currency || (customersMap[row.customer_id]?.currency || 'K'),
      total_amount: Number(row.total_amount || 0),
      discount: Number(row.discount || 0),
      down_payment: Number(row.down_payment || 0),
      layby_id: layby?.id || null,
      layby_status: layby?.status || (row.status === 'layby' ? 'active' : 'completed'),
      layby_notes: layby?.notes || '',
      layby_total_amount: Number((layby?.total_amount != null ? layby.total_amount : row.total_amount) || 0),
    });
  };

  const closeEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const saleUpdates = {
        sale_date: editing.sale_date || null,
        customer_id: editing.customer_id,
        status: editing.status,
        currency: editing.currency,
        total_amount: editing.total_amount,
        discount: editing.discount,
        down_payment: editing.down_payment,
      };
      const { error: saleErr } = await supabase
        .from('sales')
        .update(saleUpdates)
        .eq('id', editing.saleId);
      if (saleErr) throw saleErr;

      // Layby sync: ensure layby row matches sale status
      if (editing.status === 'layby') {
        if (editing.layby_id) {
          const { error: laybyErr } = await supabase
            .from('laybys')
            .update({
              customer_id: editing.customer_id,
              total_amount: editing.layby_total_amount || editing.total_amount,
              status: editing.layby_status || 'active',
              notes: editing.layby_notes || null,
            })
            .eq('id', editing.layby_id);
          if (laybyErr) throw laybyErr;
        } else {
          // create layby if missing
          const { error: insErr } = await supabase
            .from('laybys')
            .insert({
              customer_id: editing.customer_id,
              sale_id: editing.saleId,
              total_amount: editing.layby_total_amount || editing.total_amount,
              status: editing.layby_status || 'active',
              notes: editing.layby_notes || null,
            });
          if (insErr) throw insErr;
        }
      } else {
        // If sale completed/cancelled, mark layby completed if exists
        if (editing.layby_id) {
          const { error: laybyDoneErr } = await supabase
            .from('laybys')
            .update({ status: 'completed' })
            .eq('id', editing.layby_id);
          if (laybyDoneErr) throw laybyDoneErr;
        }
      }

      // Refresh the list minimally by reloading the edited row
      const { data: sRow } = await supabase
        .from('sales')
        .select('id, sale_date, customer_id, status, currency, total_amount, discount, down_payment, receipt_number, reminder_date')
        .eq('id', editing.saleId)
        .single();
      let layby = null;
      const { data: lRow } = await supabase
        .from('laybys')
        .select('id, sale_id, customer_id, total_amount, paid_amount, status, notes, created_at, updated_at')
        .eq('sale_id', editing.saleId)
        .maybeSingle();
      if (lRow) layby = lRow;
      let payments = 0;
      const { data: pays } = await supabase
        .from('sales_payments')
        .select('amount')
        .eq('sale_id', editing.saleId);
      (pays || []).forEach(p => payments += Number(p.amount || 0));
      const down = Number(sRow.down_payment || 0);
      const paid = down + payments;
      const outstanding = (sRow.status === 'layby') ? (Number(sRow.total_amount || 0) - paid) : 0;
      const customer = customersMap[sRow.customer_id] || {};
      const receipt = sRow.receipt_number || sRow.id;

      setSales(prev => prev.map(r => r.id === editing.saleId ? {
        ...sRow,
        receipt,
        isLayby: sRow.status === 'layby' || !!layby,
        layby,
        paid,
        outstanding,
        customerName: customer.name,
        customer,
      } : r));
      setEditing(null);
    } catch (err) {
      console.error(err);
      alert('Failed to save changes: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="allsales-container">
      <div className="allsales-header">
        <h2>All Sales & Laybys</h2>
        <input
          className="allsales-search"
          placeholder="Search by receipt, customer, or amount..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="allsales-loading">Loading…</div>
      ) : (
        <div className="allsales-table-wrap">
          <table className="allsales-table">
            <thead>
              <tr>
                <th className="date-col">Date</th>
                <th className="receipt-col">Receipt</th>
                <th className="customer-col">Customer</th>
                <th className="status-col">Status</th>
                <th className="num-col">Total</th>
                <th className="num-col">Paid</th>
                <th className="num-col">Outstanding</th>
                <th className="actions-col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => (
                <tr key={row.id}>
                  <td className="date-col">{row.sale_date ? new Date(row.sale_date).toLocaleDateString() : ''}</td>
                  <td className="receipt-col">{row.receipt}</td>
                  <td className="customer-col">{row.customerName || row.customer_id}</td>
                  <td className="status-col">{row.status}</td>
                  <td className="num-col">{formatCurrency(row.total_amount, row.currency)}</td>
                  <td className="num-col">{row.isLayby ? formatCurrency(row.paid, row.currency) : '-'}</td>
                  <td className="num-col">{row.isLayby ? formatCurrency(row.outstanding, row.currency) : '-'}</td>
                  <td className="actions-col">
                    <button className="allsales-edit-btn" onClick={() => openEdit(row)}>Edit</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: '#9aa4b2' }}>No results</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="allsales-modal-overlay" onClick={(e) => { if (e.target.classList.contains('allsales-modal-overlay')) closeEdit(); }}>
          <div className="allsales-modal">
            <h3>Edit Sale #{editing.receipt}</h3>
            <div className="allsales-form">
              <label>
                Customer
                <select value={editing.customer_id} onChange={e => setEditing({ ...editing, customer_id: Number(e.target.value) })}>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input type="date" value={editing.sale_date || ''} onChange={e => setEditing({ ...editing, sale_date: e.target.value })} />
              </label>
              <label>
                Status
                <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}>
                  <option value="completed">completed</option>
                  <option value="layby">layby</option>
                  <option value="cancelled">cancelled</option>
                </select>
              </label>
              <label>
                Currency
                <input value={editing.currency} onChange={e => setEditing({ ...editing, currency: e.target.value })} />
              </label>
              <label>
                Total Amount
                <input type="number" step="0.01" value={editing.total_amount} onChange={e => setEditing({ ...editing, total_amount: Number(e.target.value) })} />
              </label>
              <label>
                Discount
                <input type="number" step="0.01" value={editing.discount} onChange={e => setEditing({ ...editing, discount: Number(e.target.value) })} />
              </label>
              <label>
                Down Payment
                <input type="number" step="0.01" value={editing.down_payment} onChange={e => setEditing({ ...editing, down_payment: Number(e.target.value) })} />
              </label>

              {editing.status === 'layby' && (
                <div className="allsales-layby-block">
                  <label>
                    Layby Status
                    <select value={editing.layby_status} onChange={e => setEditing({ ...editing, layby_status: e.target.value })}>
                      <option value="active">active</option>
                      <option value="completed">completed</option>
                    </select>
                  </label>
                  <label>
                    Layby Total Amount
                    <input type="number" step="0.01" value={editing.layby_total_amount} onChange={e => setEditing({ ...editing, layby_total_amount: Number(e.target.value) })} />
                  </label>
                  <label>
                    Notes
                    <input value={editing.layby_notes} onChange={e => setEditing({ ...editing, layby_notes: e.target.value })} />
                  </label>
                </div>
              )}
            </div>
            <div className="allsales-modal-actions">
              <button className="allsales-cancel-btn" onClick={closeEdit} disabled={saving}>Cancel</button>
              <button className="allsales-save-btn" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
