import React, { useEffect, useState } from "react";
import supabase from "./supabase";
import { useNavigate } from "react-router-dom";
import { exportLaybyPDF } from "./exportLaybyUtils";
import { openOrCreateLaybyPdf } from './laybyPdfService';
import "./LaybyManagement.css";
// Removed user permissions logic

const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

export default function LaybyManagement() {
  // Block navigation for user role
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.role === 'user') {
      const handlePopState = () => {
  if (window.location.pathname !== '/layby-management' && window.location.pathname !== '/stock-report-mobile') {
          window.location.replace('/layby-management');
        }
      };
      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, []);
  const [laybys, setLaybys] = useState([]);
  const [selectedLayby, setSelectedLayby] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [receipt, setReceipt] = useState("");
  const [paymentType, setPaymentType] = useState('cash');
  // Reminder column removed
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showPdfPrompt, setShowPdfPrompt] = useState(false);
  const [totals, setTotals] = useState({ K: 0, USD: 0 });
  // Payments editor modal state
  const [paymentEditLayby, setPaymentEditLayby] = useState(null); // layby object
  const [paymentRows, setPaymentRows] = useState([]);
  const [paymentsBusy, setPaymentsBusy] = useState(false);
  const [paymentsErr, setPaymentsErr] = useState('');
  // Helper: upload generated PDF to Supabase storage and try to cache its public URL
  const uploadLaybyPDF = async (layby, doc, customersMapLike) => {
    let triggered = false;
    try {
      const blob = doc.output('blob');
      const bucket = 'laybypdfs';
      const filePath = `laybys/${layby.id}.pdf`;
      const { error: uploadErr } = await supabase.storage.from(bucket).upload(filePath, blob, { upsert: true, contentType: 'application/pdf' });
      if (uploadErr) throw uploadErr;
      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
      const publicUrl = publicUrlData?.publicUrl;
      if (publicUrl) {
        // Try to persist into layby_view (if updatable) for reuse; ignore failures
        try {
          await supabase.from('layby_view').update({ Layby_URL: publicUrl }).eq('id', layby.id);
        } catch {}
        // Immediate user download as well
        const a = document.createElement('a');
        const customerName = (customersMapLike?.name || layby.customerInfo?.name || 'Customer').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');
        a.href = publicUrl;
        a.download = `${customerName}.pdf`;
        a.click();
        triggered = true;
      }
    } catch (e) {
      console.error('PDF upload/cache failed:', e?.message || e);
    } finally {
      if (!triggered) {
        // Fallback: direct download from jsPDF in case upload/public URL failed
        try {
          const customerName = (customersMapLike?.name || layby.customerInfo?.name || 'Customer').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');
          doc.save(`${customerName}.pdf`);
        } catch {}
      }
    }
  };
  const navigate = useNavigate();

  const formatCurrency = (amount, currency = 'K') => {
    if (amount === null || amount === undefined || amount === '') return '';
    const n = Number(amount);
    const formatted = n % 1 === 0 ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${currency} ${formatted}`;
  };

  // After any payment change, check whether the layby is fully paid and flip statuses accordingly
  async function reconcileLaybyStatus(laybyLike) {
    try {
      const saleId = Number(laybyLike.sale_id);
      // Fetch sale with down payment and total
      const [{ data: saleRow }, { data: pays }] = await Promise.all([
        supabase.from('sales').select('id, total_amount, down_payment, status').eq('id', saleId).single(),
        supabase.from('sales_payments').select('amount').eq('sale_id', saleId),
      ]);
      const total = Number(saleRow?.total_amount || 0);
      const down = Number(saleRow?.down_payment || 0);
      const paidExtra = (pays || []).reduce((acc, r) => acc + Number(r.amount || 0), 0);
      const outstanding = total - (down + paidExtra);
      const isCleared = outstanding <= 0.009; // small epsilon for rounding

      if (isCleared) {
        // Mark sale as completed and layby as completed
        await Promise.all([
          supabase.from('sales').update({ status: 'completed' }).eq('id', saleId),
          supabase.from('laybys').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', laybyLike.id),
        ]);
      } else {
        // Ensure sale/layby show as active layby
        await Promise.all([
          supabase.from('sales').update({ status: 'layby' }).eq('id', saleId),
          supabase.from('laybys').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', laybyLike.id),
        ]);
      }
    } catch (e) {
      console.warn('reconcileLaybyStatus failed:', e?.message || e);
    }
  }

  // Fetch all layby sales with outstanding balances
  useEffect(() => {
    async function fetchLaybys() {
      // 1. Get all laybys (not completed)
      const { data: laybys, error } = await supabase
        .from("laybys")
        .select("id, customer_id, sale_id, total_amount, paid_amount, status, notes, updated_at")
        .not("status", "eq", "completed");
      if (error) return setError(error.message);

      // 2. Get all sales for these laybys
  const saleIds = (laybys || []).map(l => Number(l.sale_id)).filter(id => !isNaN(id));
      let salesMap = {};
      if (saleIds.length) {
        const { data: sales, error: salesError } = await supabase
          .from("sales")
          .select("id, down_payment, reminder_date")
          .in("id", saleIds);
        if (salesError) {
          console.error('Supabase sales query error:', salesError.message);
        }
        salesMap = (sales || []).reduce((acc, s) => {
          acc[s.id] = s;
          return acc;
        }, {});
      }

      // 3. Get all payments for these sales
      let paymentsMap = {};
      if (saleIds.length) {
        const { data: payments, error: paymentsError } = await supabase
          .from("sales_payments")
          .select("sale_id, amount")
          .in("sale_id", saleIds);
        if (paymentsError) {
          console.error('Supabase payments query error:', paymentsError.message);
        }
        paymentsMap = (payments || []).reduce((acc, p) => {
          acc[p.sale_id] = (acc[p.sale_id] || 0) + Number(p.amount || 0);
          return acc;
        }, {});
      }

      // 4. Get all customers for these laybys
      const customerIds = Array.from(new Set((laybys || []).map(l => l.customer_id).filter(Boolean)));
      let customersMap = {};
      if (customerIds.length) {
        const { data: customers } = await supabase
          .from("customers")
          .select("id, name, phone, currency, opening_balance")
          .in("id", customerIds);
        customersMap = (customers || []).reduce((acc, c) => {
          acc[c.id] = c;
          return acc;
        }, {});
      }

      // 5. Build layby list
      const laybyList = (laybys || []).map(layby => {
        const saleIdNum = Number(layby.sale_id);
        const sale = salesMap[saleIdNum] || {};
        let paid = 0;
        const downPayment = sale.down_payment;
        const payments = paymentsMap[saleIdNum];
        if (downPayment) {
          paid += Number(downPayment);
        }
        if (payments) {
          paid += Number(payments);
        }
        return {
          ...layby,
          total_amount: layby.total_amount,
          paid,
          outstanding: Number(layby.total_amount) - paid,
          reminder_date: sale.reminder_date,
          customerInfo: customersMap[layby.customer_id] || {},
        };
      });
      setLaybys(laybyList);
      const t = { K: 0, USD: 0 };
      (laybyList || []).forEach(l => {
        const cur = l.customerInfo?.currency || 'K';
        const code = (cur === '$' || cur === 'USD') ? 'USD' : 'K';
        t[code] += Number(l.outstanding || 0);
      });
      setTotals(t);
    }
    fetchLaybys();
  }, [success]);

  // Add payment to layby
  async function handleAddPayment(e) {
    /*
    ⠀⠀⠀⠀⠀⠀⠀⡀⡀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
    ⠀⠀⠀⠀⠀⠀⠀⠑⠑⢄⠀⠀⠀⠀⢸⠘⠀⠀⡀⠄⡲⠁⠀⠀⠀⠀⠀⠀⠀⠀
    ⡀⠀⠀⡀⠀⡀⠀⠀⠀⠀⠑⢄⠀⢠⢃⠠⠐⠁⠀⡢⠁⠀⠀⠀⠀⠀⡀⠀⡀⠀
    ⠀⠀⡀⠀⠀⠀⠀⠈⠀⠀⡀⡠⢹⠪⡀⠀⠀⡀⠢⠁⠀⣀⠀⠠⠈⠀⠀⠀⠀⠀
    ⠈⠀⠀⠀⠈⠀⠈⠀⡎⡆⠁⢠⠃⠀⠈⠢⡀⢠⢃⠠⠊⠂⠃⠀⠀⠀⡀⠂⠈⠀
    ⠠⠀⠂⠈⠀⠀⠂⠀⠀⠀⢀⠂⠀⠀⢀⡠⢜⠣⡁⠀⠀⠀⡀⠠⠀⠂⠀⠀⠀⠠
    ⠀⠀⠀⠀⠠⠀⠠⠀⠂⢀⠎⢀⠔⠊⠁⢠⠂⠀⠈⠢⡠⠀⠀⠀⠀⠀⠀⡀⠂⠀
    ⡀⠂⠈⠀⠀⡀⠀⠀⡀⠎⠊⠀⠀⠀⢔⡡⠀⠀⠀⠀⠈⢒⡢⠈⠀⠈⠀⠀⠀⠀
    ⠀⠀⠀⠠⠀⠀⠀⠂⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠠⠀⠀⠀⠀⡀⠠⠀⠀⠂⠀
    */
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");
    if (!selectedLayby || !paymentAmount || !paymentDate) {
      setError("All fields required.");
      setLoading(false);
      return;
    }
    // Apply to selected layby first (so due reduces immediately), then any remainder to opening balance
    try {
      const customerId = selectedLayby.customer_id;
      const { data: custRow } = await supabase
        .from('customers')
        .select('opening_balance, currency')
        .eq('id', customerId)
        .maybeSingle();
      const opening = Number(custRow?.opening_balance || 0);
      const curr = custRow?.currency || 'K';
      let amt = Number(paymentAmount);

      // Determine how much to apply to the layby
      const currentOutstanding = Number(selectedLayby.outstanding || 0);
      const applyToLayby = Math.max(0, Math.min(amt, currentOutstanding));
      const remainder = Math.max(0, amt - applyToLayby);

      // 1) Apply to layby via sales_payments (reflects in pages and PDFs)
  if (applyToLayby > 0) {
        const { error: payErr } = await supabase.from('sales_payments').insert([
          {
            sale_id: selectedLayby.sale_id,
            amount: applyToLayby,
    payment_type: paymentType,
            currency: curr,
            payment_date: paymentDate,
            reference: receipt,
          },
        ]);
        if (payErr) throw payErr;
      }

      // 2) Apply remainder (if any) to opening balance
      if (remainder > 0 && opening > 0) {
        const consume = Math.min(remainder, opening);
        const { error: upErr } = await supabase
          .from('customers')
          .update({ opening_balance: opening - consume })
          .eq('id', customerId);
        if (upErr) throw upErr;
      }

  // Touch layby and reconcile statuses
  await supabase.from('laybys').update({ updated_at: new Date().toISOString() }).eq('id', selectedLayby.id);
  await reconcileLaybyStatus(selectedLayby);

      setSuccess('Payment added!');
    } catch (ex) {
      setError(ex?.message || 'Failed to add payment');
    }
    setLoading(false);
    setPaymentAmount("");
    setPaymentDate("");
    setReceipt("");
  setSelectedLayby(null);
  setPaymentType('cash');
  }

  // Reminder functionality removed

  // Update notes for a layby
  async function handleUpdateNotes(laybyId) {
    setLoading(true);
    const { error } = await supabase.from("laybys").update({ notes, updated_at: new Date().toISOString() }).eq("id", laybyId);
    if (error) setError(error.message);
    else setSuccess("Notes updated!");
    setLoading(false);
  }

  // CSV export removed; inline PDF export retained per row

  // Filter and sort laybys for display
  const filteredLaybys = laybys
    .filter(layby => {
      const name = layby.customerInfo?.name?.toLowerCase() || "";
      const phone = layby.customerInfo?.phone?.toLowerCase() || "";
      return (
        name.includes(search.toLowerCase()) ||
        phone.includes(search.toLowerCase())
      );
    })
  .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));

  // All actions always accessible
  const canAdd = true;
  const canEdit = true;
  const canDelete = true;

  // Open payments editor for a layby (loads sales_payments rows)
  async function openPaymentsEditor(layby) {
    setPaymentsErr('');
    setPaymentsBusy(true);
    setPaymentEditLayby(layby);
    try {
      const { data, error } = await supabase
        .from('sales_payments')
        .select('id, amount, payment_date, reference, currency, payment_type')
        .eq('sale_id', layby.sale_id)
        .order('payment_date', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw error;
      const payments = (data || []).map(r => {
        const norm = (r.payment_type || '').toLowerCase();
        const normalizedType = ['cash','bank_transfer','mobile_money','cheque','visa_card'].includes(norm) ? norm : 'cash';
        return { ...r, amount: Number(r.amount || 0), payment_type: normalizedType };
      });
      // Also include the sale's down payment as a read-only row at the top (if any)
      let downRow = null;
      try {
        const { data: saleRow } = await supabase
          .from('sales')
          .select('id, down_payment, created_at, currency')
          .eq('id', layby.sale_id)
          .maybeSingle();
        const dp = Number(saleRow?.down_payment || 0);
        if (dp > 0) {
          downRow = {
            id: `down-${saleRow.id}`,
            amount: dp,
            payment_date: (saleRow?.created_at || new Date().toISOString()),
            reference: 'Down Payment',
            currency: saleRow?.currency || layby.customerInfo?.currency || 'K',
            payment_type: 'down_payment',
            _readonly: true,
          };
        }
      } catch {}
      const rows = downRow ? [downRow, ...payments] : payments;
      setPaymentRows(rows);
    } catch (e) {
      setPaymentsErr(e?.message || 'Failed to load payments');
    } finally {
      setPaymentsBusy(false);
    }
  }

  // Standardized payment types used across Add and Edit Payment UIs
  const allowedPaymentTypes = ['cash', 'bank_transfer', 'mobile_money', 'cheque', 'visa_card'];
  const paymentTypeLabels = {
    cash: 'Cash',
    bank_transfer: 'Bank Transfer',
    mobile_money: 'Mobile Money',
    cheque: 'Cheque',
    visa_card: 'Visa Card',
  };

  function updatePaymentRow(id, patch) {
    setPaymentRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }

  async function savePayments() {
    if (!paymentEditLayby) return;
    setPaymentsBusy(true);
    setPaymentsErr('');
    try {
      // Persist edits row-by-row
      for (const row of paymentRows) {
        if (row._readonly || String(row.id).startsWith('down-')) continue; // skip read-only down payment
        const { id, amount, payment_date, reference, currency, payment_type } = row;
        const { error: upErr } = await supabase
          .from('sales_payments')
          .update({ amount: Number(amount || 0), payment_date, reference, currency, payment_type })
          .eq('id', id);
        if (upErr) throw upErr;
      }
  // Touch layby and reconcile statuses
  await supabase.from('laybys').update({ updated_at: new Date().toISOString() }).eq('id', paymentEditLayby.id);
  await reconcileLaybyStatus(paymentEditLayby);
      setSuccess('Payments updated.');
      setPaymentEditLayby(null);
      setPaymentRows([]);
    } catch (e) {
      setPaymentsErr(e?.message || 'Failed to save payments');
    } finally {
      setPaymentsBusy(false);
    }
  }

  async function deletePayment(id) {
    if (!paymentEditLayby) return;
  if (String(id).startsWith('down-')) return; // cannot delete down payment here
    if (!window.confirm('Delete this payment?')) return;
    setPaymentsBusy(true);
    setPaymentsErr('');
    try {
      const { error } = await supabase.from('sales_payments').delete().eq('id', id);
      if (error) throw error;
      setPaymentRows(prev => prev.filter(r => r.id !== id));
  await supabase.from('laybys').update({ updated_at: new Date().toISOString() }).eq('id', paymentEditLayby.id);
  await reconcileLaybyStatus(paymentEditLayby);
      setSuccess('Payment deleted.');
    } catch (e) {
      setPaymentsErr(e?.message || 'Failed to delete payment');
    } finally {
      setPaymentsBusy(false);
    }
  }

  return (
    <div className="layby-mgmt-container" style={{ maxWidth: 1050, margin: '32px auto', background: '#181c20', borderRadius: 14, padding: '24px 12px 18px 12px', boxShadow: '0 2px 12px rgba(0,0,0,0.13)' }}>
      <h2 style={{ fontSize: '1.6rem', color: '#4caf50', textAlign: 'center', marginBottom: 20 }}>Layby Management</h2>
      <div className="layby-total-due-banner-row">
        <div className="layby-total-box k">K {Number(totals.K || 0).toLocaleString()}</div>
        <div className="layby-total-box usd">$ {Number(totals.USD || 0).toLocaleString()}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search customer name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #333', background: '#23272f', color: '#fff', fontSize: '1rem', minWidth: 220 }}
        />
      </div>
      {error && <div style={{ color: "#ff5252", marginBottom: 10 }}>{error}</div>}
      {success && <div style={{ color: "#4caf50", marginBottom: 10 }}>{success}</div>}
      {/* Table container is horizontally scrollable if needed */}
      <div style={{ width: '100%', background: 'transparent', borderRadius: 8, overflowX: 'auto' }}>
    <table className="pos-table" style={{ width: '100%', minWidth: 600, background: '#23272f', borderRadius: 8, margin: '0 auto', fontSize: '0.8rem', tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th className="text-col">Customer</th>
              <th className="text-col">Phone</th>
              <th className="num-col">Total</th>
              <th className="num-col">Paid</th>
              <th className="num-col">Outstanding</th>
  <th className="actions-col">Actions</th>
  <th className="export-col">Export</th>
  <th className="updated-col">Updated</th>
            </tr>
          </thead>
          <tbody>
            {filteredLaybys.map(layby => (
              <tr key={layby.id} style={{ background: layby.outstanding === 0 ? '#0f2e1d' : undefined }}>
                <td className="text-col" style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>
                  <div>{layby.customerInfo?.name}</div>
                </td>
                <td className="text-col" style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>{layby.customerInfo?.phone}</td>
                <td className="num-col">{formatCurrency(layby.total_amount, layby.customerInfo?.currency || 'K')}</td>
                <td className="num-col">{formatCurrency(layby.paid, layby.customerInfo?.currency || 'K')}</td>
                <td className="num-col">{formatCurrency(layby.outstanding, layby.customerInfo?.currency || 'K')}</td>
        <td className="actions-col" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <button
          style={{ background: '#00bfff', color: '#fff', borderRadius: 4, padding: '2px 6px', fontWeight: 600, fontSize: '0.78rem', minWidth: 100, maxWidth: 120 }}
                    onClick={() => setSelectedLayby(layby)}
                    disabled={(layby.outstanding === 0 && !(Number(layby.customerInfo?.opening_balance || 0) > 0)) || (JSON.parse(localStorage.getItem('user'))?.role === 'user')}
                  >
                    Add Payment
                  </button>
                  <button
            style={{ background: '#6c5ce7', color: '#fff', borderRadius: 4, padding: '2px 6px', fontWeight: 600, fontSize: '0.78rem', minWidth: 110 }}
            title="View and edit payments for this layby"
            onClick={() => openPaymentsEditor(layby)}
            disabled={(JSON.parse(localStorage.getItem('user'))?.role === 'user')}
          >
            Edit Payments
          </button>
                </td>
                <td className="export-col">
          <button
                    style={{ background: '#00bfff', color: '#fff', borderRadius: 4, padding: '0 6px', fontWeight: 600, fontSize: '0.72rem', minWidth: 50, maxWidth: 70, height: 22, marginRight: 2 }}
                    onClick={async () => {
            await openOrCreateLaybyPdf(layby);
                    }}
                  >PDF</button>
                  {/* CSV export removed */}
                </td>
                <td className="updated-col" style={{ color: '#00bfff', fontSize: 13 }}>{layby.updated_at ? new Date(layby.updated_at).toLocaleDateString('en-GB') : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedLayby && (
        <form onSubmit={handleAddPayment} style={{ marginTop: 24, background: '#23272f', padding: 18, borderRadius: 8 }}>
          <h3>Add Payment for {selectedLayby.customerInfo?.name}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 12 }}>
            <input type="number" placeholder="Amount" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} required style={{ width: '100%' }} />
            <input type="date" placeholder="Date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required style={{ width: '100%' }} />
            <select value={paymentType} onChange={e => setPaymentType(e.target.value)} style={{ width: '100%' }}>
              {allowedPaymentTypes.map(t => (
                <option key={t} value={t}>{paymentTypeLabels[t]}</option>
              ))}
            </select>
            <input type="text" placeholder="Receipt #" value={receipt} onChange={e => setReceipt(e.target.value)} style={{ width: '100%' }} />
          </div>
          <button type="submit" disabled={loading}>{loading ? "Processing..." : "Add Payment"}</button>
          <button type="button" style={{ marginLeft: 8 }} onClick={() => setSelectedLayby(null)}>Cancel</button>
        </form>
      )}
      {paymentEditLayby && (
        <div className="pdf-modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="pdf-modal-content" style={{ maxWidth: 760, width: '95vw' }}>
            <h3 style={{ marginTop: 0 }}>Edit Payments – {paymentEditLayby.customerInfo?.name}</h3>
            {paymentsErr && <div style={{ color: '#ff5252', marginBottom: 8 }}>{paymentsErr}</div>}
            <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid #333', borderRadius: 6, padding: 8, background: '#1f2430' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'center', padding: 6, width: '12ch' }}>Date</th>
                    <th style={{ textAlign: 'center', padding: 6, width: '12ch' }}>Amount</th>
                    <th style={{ textAlign: 'center', padding: 6, width: '12ch' }}>Type</th>
                    <th style={{ textAlign: 'center', padding: '6px 6px 6px 0', width: '3.2cm' }}>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentRows.map(row => (
                    <tr key={row.id}>
                      <td style={{ padding: 6, textAlign: 'center', verticalAlign: 'middle' }}>
                        <input type="date" value={(row.payment_date || '').slice(0,10)} onChange={e => updatePaymentRow(row.id, { payment_date: e.target.value })} style={{ width: '100%', padding: '4px 6px', textAlign: 'center' }} disabled={row._readonly} />
                      </td>
                      <td style={{ padding: 6, textAlign: 'center', verticalAlign: 'middle' }}>
                        <input type="number" step="0.01" value={row.amount} onChange={e => updatePaymentRow(row.id, { amount: Number(e.target.value) })} style={{ width: 'calc(100% - 12px)', textAlign: 'center', padding: '4px 6px' }} disabled={row._readonly} />
                      </td>
                      <td style={{ padding: 6, textAlign: 'center', verticalAlign: 'middle' }}>
                        <select
                          value={['cash','bank_transfer','mobile_money','cheque','visa_card'].includes((row.payment_type || '').toLowerCase()) ? (row.payment_type || '').toLowerCase() : 'cash'}
                          onChange={e => updatePaymentRow(row.id, { payment_type: e.target.value })}
                          style={{ width: '12ch', padding: '4px 6px', margin: '0 auto' }}
                          disabled={row._readonly}
                        >
                          <option value="cash">Cash</option>
                          <option value="bank_transfer">Bank Transfer</option>
                          <option value="mobile_money">Mobile Money</option>
                          <option value="cheque">Cheque</option>
                          <option value="visa_card">Visa Card</option>
                        </select>
                      </td>
                      <td style={{ padding: '6px 6px 6px 0', textAlign: 'center', verticalAlign: 'middle' }}>
                        <button onClick={() => deletePayment(row.id)} disabled={paymentsBusy || row._readonly} style={{ background: '#ff5252', color: '#fff', borderRadius: 4, padding: '2px 0', fontSize: '0.72rem', width: '3cm', margin: '0 auto', opacity: row._readonly ? 0.6 : 1, textAlign: 'center', display: 'block' }}>Del</button>
                      </td>
                    </tr>
                  ))}
                  {paymentRows.length === 0 && !paymentsBusy && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'center', color: '#9aa4b2', padding: 8 }}>No payments yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button onClick={() => setPaymentEditLayby(null)} disabled={paymentsBusy} style={{ background: '#444', color: '#fff', borderRadius: 6, padding: '6px 12px' }}>Close</button>
              <button onClick={savePayments} disabled={paymentsBusy} style={{ background: '#00bfff', color: '#fff', borderRadius: 6, padding: '6px 12px', fontWeight: 700 }}>{paymentsBusy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
      {/* PDF download prompt modal */}
      {showPdfPrompt && (
        <div className="pdf-modal-overlay">
          <div className="pdf-modal-content">
            <h2>Download PDF</h2>
            <p>Would you like to download or share the PDF?</p>
            <button onClick={() => setShowPdfPrompt(false)}>Cancel</button>
            <button onClick={async () => {
              setShowPdfPrompt(false);
              // Proceed with PDF generation and sharing
              const { data: saleItems } = await supabase
                .from("sales_items")
                .select("product_id, quantity, unit_price, product:products(name, sku)")
                .eq("sale_id", selectedLayby.sale_id);
              const products = (saleItems || []).map(i => ({
                name: i.product?.name || '',
                sku: i.product?.sku || '',
                qty: i.quantity,
                price: i.unit_price
              }));
              const { data: payments } = await supabase
                .from("sales_payments")
                .select("amount, payment_date")
                .eq("sale_id", selectedLayby.sale_id);
              const customer = selectedLayby.customerInfo || {};
              const logoUrl = window.location.origin + '/bestrest-logo.png';
              const companyName = 'BestRest';
              exportLaybyPDF({ companyName, logoUrl, customer, layby: selectedLayby, products, payments });
            }}>OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
