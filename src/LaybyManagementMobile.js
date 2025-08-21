import React, { useEffect, useState } from 'react';

import supabase from './supabase';
import { exportLaybyPDF } from './exportLaybyUtils';
import { openOrCreateLaybyPdf } from './laybyPdfService';
import './LaybyManagementMobile.css';



function LaybyManagementMobile() {
  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
  const [laybys, setLaybys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [customersMap, setCustomersMap] = useState({});
  const [locked, setLocked] = useState(() => sessionStorage.getItem('laybyMobileUnlocked') !== 'true');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Simple currency formatter
  const formatCurrency = (amount, currency = 'K') => {
    if (amount === null || amount === undefined || amount === '') return '';
    const n = Number(amount);
    const formatted = n % 1 === 0 ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${currency} ${formatted}`;
  };

  useEffect(() => {
    if (locked) return;
    async function fetchLaybys() {
      setLoading(true);
      setError('');
      // 1) All active laybys
      const { data: laybyRows, error: laybyErr } = await supabase
        .from('laybys')
        .select('id, customer_id, sale_id, total_amount, paid_amount, status, notes, created_at, updated_at')
        .not('status', 'eq', 'completed');
      if (laybyErr) {
        setError(laybyErr.message);
        setLaybys([]);
        setLoading(false);
        return;
      }
      const laybys = laybyRows || [];

      // 2) Sales for down_payment/reminder
      const saleIds = Array.from(new Set(laybys.map(l => Number(l.sale_id)).filter(id => !isNaN(id))));
      let salesMap = {};
      if (saleIds.length) {
        const { data: sales, error: salesErr } = await supabase
          .from('sales')
          .select('id, down_payment, reminder_date, currency, discount')
          .in('id', saleIds);
        if (!salesErr) {
          salesMap = (sales || []).reduce((acc, s) => { acc[s.id] = s; return acc; }, {});
        }
      }

      // 3) Payments aggregated per sale
      let paymentsMap = {};
      if (saleIds.length) {
        const { data: pays, error: paysErr } = await supabase
          .from('sales_payments')
          .select('sale_id, amount')
          .in('sale_id', saleIds);
        if (!paysErr) {
          paymentsMap = (pays || []).reduce((acc, p) => {
            acc[p.sale_id] = (acc[p.sale_id] || 0) + Number(p.amount || 0);
            return acc;
          }, {});
        }
      }

      // 4) Customers
      const customerIds = Array.from(new Set(laybys.map(l => l.customer_id).filter(Boolean)));
      let custMap = {};
      if (customerIds.length) {
        const { data: customers } = await supabase
          .from('customers')
          .select('id, name, phone, currency, opening_balance')
          .in('id', customerIds);
        custMap = (customers || []).reduce((acc, c) => { acc[c.id] = c; return acc; }, {});
      }
      setCustomersMap(custMap);

      // 5) Build enriched list
      const enriched = laybys.map(l => {
        const sale = salesMap[Number(l.sale_id)] || {};
        let paid = 0;
        if (sale.down_payment) paid += Number(sale.down_payment);
        if (paymentsMap[Number(l.sale_id)]) paid += Number(paymentsMap[Number(l.sale_id)]);
        return {
          ...l,
          paid,
          outstanding: Number(l.total_amount) - paid,
          reminder_date: sale.reminder_date,
          sale_currency: sale.currency,
          sale_discount: Number(sale.discount || 0),
          customerInfo: custMap[l.customer_id] || {},
        };
      }).sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));

      setLaybys(enriched);
      setLoading(false);
    }
    fetchLaybys();
  }, [locked]);


  // Password check handler
  async function handleUnlock(e) {
    e.preventDefault();
    setError('');
    // Fetch password from Supabase mobile_laybuy_password table (key/value structure)
    const { data, error: fetchError } = await supabase
      .from('mobile_laybuy_password')
      .select('value')
      .eq('key', 'layby_mobile_password')
      .single();
    if (fetchError || !data) {
      setError('Could not verify password.');
      return;
    }
    if (password === data.value) {
      setLocked(false);
      sessionStorage.setItem('laybyMobileUnlocked', 'true');
    } else {
      setError('Incorrect password.');
    }
  }

  // Export PDF: use shared service to open existing or create+upload then open
  async function handleExport(layby) {
    try {
      // Fast path: shared util handles existence check, generation, upload, and opening
      const opened = await openOrCreateLaybyPdf(layby, customersMap);
      if (opened) return;

      // Fallback path: (shouldn’t run usually) – local generation and upload
      // Fetch sale-related data in parallel for speed
      const [saleItemsRes, paymentsRes, saleRes] = await Promise.all([
        supabase
          .from('sales_items')
          .select('product_id, quantity, unit_price, display_name, product:products(name, sku)')
          .eq('sale_id', layby.sale_id),
        supabase
          .from('sales_payments')
          .select('amount, payment_date')
          .eq('sale_id', layby.sale_id),
        supabase
          .from('sales')
          .select('currency, discount')
          .eq('id', layby.sale_id)
          .single(),
      ]);

      const saleItems = saleItemsRes.data || [];
      const payments = paymentsRes.data || [];
      const saleRow = saleRes.data || {};

      const products = saleItems.map(i => ({
        name: i.product?.name || i.display_name || '',
        sku: i.product?.sku || '',
        qty: i.quantity,
        price: i.unit_price,
      }));

      const currency = saleRow.currency || customersMap[layby.customer_id]?.currency || 'K';
      const discount = Number(saleRow.discount || 0);
      const customer = { ...(customersMap[layby.customer_id] || {}), opening_balance: customersMap[layby.customer_id]?.opening_balance || 0 };
      const logoUrl = window.location.origin + '/bestrest-logo.png';
      const companyName = 'BestRest';

      // Generate PDF
  const doc = exportLaybyPDF({ companyName, logoUrl, customer, layby, products, payments, currency, discount });
  const safeName = (customer.name || 'Customer').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_') || 'Customer';
  try { doc.save(`${safeName}_Layby_${layby.id}.pdf`); } catch {}
    } catch (err) {
      console.error('Export failed:', err);
      alert('Could not export PDF. Please try again.');
    }
  }

  if (locked) {
    return (
      <div className="layby-mobile-login-container">
        <h2 className="layby-mobile-title">Enter Password</h2>
        <form className="layby-mobile-login-form" onSubmit={handleUnlock}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            className="layby-mobile-login-input"
            autoFocus
          />
          {error && <div className="layby-mobile-login-error">{error}</div>}
          <button type="submit" className="layby-mobile-login-btn">Unlock</button>
        </form>
      </div>
    );
  }

  // Show all laybys by default, filter by search (customer name, phone, or due amount)
  const filteredLaybys = laybys.filter(layby => {
    const name = layby.customerInfo?.name?.toLowerCase() || customersMap[layby.customer_id]?.name?.toLowerCase() || "";
    const phone = layby.customerInfo?.phone?.toLowerCase() || customersMap[layby.customer_id]?.phone?.toLowerCase() || "";
    const due = (Number(layby.outstanding) || 0).toString();
    const searchTerm = search.toLowerCase();
    return (!searchTerm || name.includes(searchTerm) || phone.includes(searchTerm) || due.includes(searchTerm));
  });

  return (
    <div className="layby-mobile-container">
      <div className="layby-mobile-title">Laybys (Mobile)</div>
  {/* Backfill button removed — new Opening Balance flow already creates laybys */}
      <div className="layby-mobile-search">
        <input
          type="text"
          className="layby-mobile-search-input"
          placeholder="Search customer name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      {loading && (
        <div className="layby-mobile-loading">Loading…</div>
      )}
      <div className="layby-mobile-table-wrapper">
        <table className="layby-mobile-table">
          <thead>
            <tr>
              <th className="date-col">Date</th>
              <th className="customer-col">Customer</th>
              <th className="num-col">Total</th>
              <th className="num-col">Paid</th>
              <th className="num-col">Due</th>
              <th className="export-col">Export</th>
            </tr>
          </thead>
          <tbody>
            {filteredLaybys.map(l => {
              const currency = l.sale_currency || l.customerInfo?.currency || customersMap[l.customer_id]?.currency || 'K';
              return (
                <tr key={l.id}>
                  <td className="date-col" style={{ fontSize: '0.85em' }}>{new Date(l.created_at).toLocaleDateString()}</td>
                  <td className="customer-col" style={{ fontSize: '0.85em' }}>
                    <div>{l.customerInfo?.name || customersMap[l.customer_id]?.name || l.customer_id}</div>
                  </td>
                  <td className="num-col">{formatCurrency(l.total_amount, currency)}</td>
                  <td className="num-col">{formatCurrency(l.paid, currency)}</td>
                  <td className="num-col">{formatCurrency(l.outstanding, currency)}</td>
                  <td className="export-col">
                    <button
                      className="layby-mobile-export-btn"
                      aria-label={`Export layby ${l.id} as PDF`}
                      onClick={() => handleExport(l)}
                    >PDF</button>
                  </td>
                </tr>
              );
            })}
            {filteredLaybys.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: '#aaa', padding: 8 }}>
                  No laybys found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default LaybyManagementMobile;
