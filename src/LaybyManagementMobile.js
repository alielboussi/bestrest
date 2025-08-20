import React, { useEffect, useState } from 'react';

import supabase from './supabase';
import { exportLaybyPDF, exportLaybyCSV } from './exportLaybyUtils';
import './LaybyManagementMobile.css';



function LaybyManagementMobile() {
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

  // Export or share PDF for a layby
  async function handleExport(layby) {
    // Check if PDF URL already exists in layby_view
    const { data: laybyViewRows, error: laybyViewError } = await supabase
      .from('layby_view')
      .select('Layby_URL')
      .eq('id', layby.id)
      .maybeSingle();
    let pdfUrl = laybyViewRows?.Layby_URL;
  if (pdfUrl) {
      // Scroll to top to ensure modal is centered in viewport
      window.scrollTo({ top: 0, behavior: 'auto' });
      // Show modal with customer-friendly label and filename
      let downloaded = false;
      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.left = '0';
      modal.style.top = '0';
      modal.style.width = '100vw';
      modal.style.height = '100vh';
      modal.style.background = 'rgba(0,0,0,0.55)';
      modal.style.display = 'flex';
      modal.style.alignItems = 'flex-start';
      modal.style.justifyContent = 'center';
      modal.style.zIndex = '9999';
    // Get customer name for label and filename
  const customerName = (customersMap[layby.customer_id]?.name || 'Customer').replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_');
      const downloadLabel = `Download PDF for ${customersMap[layby.customer_id]?.name || 'Customer'}`;
      const downloadFilename = `${customerName}.pdf`;
      modal.innerHTML = `
        <div style="background: #23272f; color: #fff; border-radius: 10px; padding: 28px 18px 18px 18px; min-width: 260px; max-width: 95vw; box-shadow: 0 2px 12px rgba(0,0,0,0.18); text-align: center; display: flex; flex-direction: column; align-items: center; margin-top: 4cm;">
          <div style="font-size: 1.1em; margin-bottom: 10px; font-weight: 600;">PDF already generated!</div>
          <div style="margin-bottom: 18px;">Click the button below to download your PDF:</div>
          <a id="pdf-download-link" href="${pdfUrl}" download="${downloadFilename}" style="display: inline-block; background: #00bfff; color: #fff; padding: 10px 22px; border-radius: 6px; font-weight: 600; font-size: 1em; text-decoration: none; margin-bottom: 18px; width: 100%; max-width: 300px;">${downloadLabel}</a>
          <div style="margin-top: 18px; display: flex; gap: 18px; justify-content: center; width: 100%;">
            <button id="pdf-modal-cancel" style="background: #444; color: #fff; border-radius: 6px; padding: 8px 18px; font-weight: 500; font-size: 1em; border: none;">Cancel</button>
            <button id="pdf-modal-ok" style="background: #00bfff; color: #fff; border-radius: 6px; padding: 8px 18px; font-weight: 600; font-size: 1em; border: none;">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      // Download button click
      const downloadBtn = modal.querySelector('#pdf-download-link');
      downloadBtn.addEventListener('click', () => {
        downloaded = true;
        setTimeout(() => {
          if (document.body.contains(modal)) document.body.removeChild(modal);
        }, 500);
      });
      // Cancel button
      modal.querySelector('#pdf-modal-cancel').addEventListener('click', () => {
        if (document.body.contains(modal)) document.body.removeChild(modal);
      });
      // OK button
      modal.querySelector('#pdf-modal-ok').addEventListener('click', () => {
        if (!downloaded) {
          if (!window.confirm('Are you sure you want to close this dialog? You have not downloaded the PDF yet.')) {
            return;
          }
        }
        if (document.body.contains(modal)) document.body.removeChild(modal);
      });
      return;
    }
    // ...existing code for generating and uploading PDF...
    // Generate PDF now if no cached URL
    const { data: saleItems } = await supabase
      .from('sales_items')
      .select('product_id, quantity, unit_price, display_name, product:products(name, sku)')
      .eq('sale_id', layby.sale_id);
    const products = (saleItems || []).map(i => ({ name: i.product?.name || i.display_name || '', sku: i.product?.sku || '', qty: i.quantity, price: i.unit_price }));
    const { data: payments } = await supabase
      .from('sales_payments')
      .select('amount, payment_date')
      .eq('sale_id', layby.sale_id);
    const { data: saleRows } = await supabase
      .from('sales')
      .select('currency, discount')
      .eq('id', layby.sale_id)
      .single();
    const currency = saleRows?.currency || customersMap[layby.customer_id]?.currency || 'K';
    const discount = Number(saleRows?.discount || 0);
    const customer = { ...(customersMap[layby.customer_id] || {}), opening_balance: customersMap[layby.customer_id]?.opening_balance || 0 };
    const logoUrl = window.location.origin + '/bestrest-logo.png';
    const companyName = 'BestRest';
    const doc = exportLaybyPDF({ companyName, logoUrl, customer, layby, products, payments, currency, discount });
    // Try to upload and save URL like desktop
    try {
      const blob = doc.output('blob');
      const bucket = 'laybypdfs';
      const filePath = `laybys/${layby.id}.pdf`;
      const { error: uploadErr } = await supabase.storage.from(bucket).upload(filePath, blob, { upsert: true, contentType: 'application/pdf' });
      if (!uploadErr) {
        const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
        const publicUrl = publicUrlData?.publicUrl;
        if (publicUrl) {
          try { await supabase.from('layby_view').update({ Layby_URL: publicUrl }).eq('id', layby.id); } catch {}
        }
      }
    } catch {}
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
      <div className="layby-mobile-table-wrapper">
        <table className="layby-mobile-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Due</th>
              <th>Export</th>
            </tr>
          </thead>
          <tbody>
            {filteredLaybys.map(l => {
              const currency = l.sale_currency || l.customerInfo?.currency || customersMap[l.customer_id]?.currency || 'K';
              return (
                <tr key={l.id}>
                  <td style={{ fontSize: '0.85em' }}>{new Date(l.created_at).toLocaleDateString()}</td>
                  <td style={{ wordBreak: 'break-word', whiteSpace: 'normal', fontSize: '0.85em' }}>
                    <div>{l.customerInfo?.name || customersMap[l.customer_id]?.name || l.customer_id}</div>
                  </td>
                  <td>{formatCurrency(l.total_amount, currency)}</td>
                  <td>{formatCurrency(l.paid, currency)}</td>
                  <td>{formatCurrency(l.outstanding, currency)}</td>
                  <td>
                    <button
                      className="layby-mobile-export-btn"
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
