
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

  useEffect(() => {
    if (locked) return;
    async function fetchLaybys() {
      setLoading(true);
      const { data: laybyData, error } = await supabase
        .from('laybys')
        .select('id, customer_id, total_amount, paid_amount, status, created_at, sale_id')
        .order('created_at', { ascending: false });
      if (error) {
        setLaybys([]);
        setLoading(false);
        return;
      }
      // Fetch customer names for display
      const customerIds = Array.from(new Set((laybyData || []).map(l => l.customer_id).filter(Boolean)));
      let customersMap = {};
      if (customerIds.length) {
        const { data: customers } = await supabase
          .from('customers')
          .select('id, name, phone')
          .in('id', customerIds);
        customersMap = (customers || []).reduce((acc, c) => {
          acc[c.id] = c;
          return acc;
        }, {});
      }
      setCustomersMap(customersMap);
      setLaybys(laybyData || []);
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
      // Show modal with existing URL
      let downloaded = false;
      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100vw';
      modal.style.height = '100vh';
      modal.style.background = 'rgba(0,0,0,0.55)';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.zIndex = '9999';
      modal.innerHTML = `
        <div style="background: #23272f; color: #fff; border-radius: 10px; padding: 28px 18px 18px 18px; min-width: 260px; max-width: 90vw; box-shadow: 0 2px 12px rgba(0,0,0,0.18); text-align: center;">
          <div style="font-size: 1.1em; margin-bottom: 10px; font-weight: 600;">PDF already generated!</div>
          <div style="margin-bottom: 18px;">Click the button below to download your PDF:</div>
          <a id="pdf-download-link" href="${pdfUrl}" download style="display: inline-block; background: #00bfff; color: #fff; padding: 10px 22px; border-radius: 6px; font-weight: 600; font-size: 1em; text-decoration: none; margin-bottom: 18px;">Download PDF</a>
          <div style="margin-top: 18px; display: flex; gap: 18px; justify-content: center;">
            <button id="pdf-modal-cancel" style="background: #444; color: #fff; border-radius: 6px; padding: 8px 18px; font-weight: 500; font-size: 1em; border: none;">Cancel</button>
            <button id="pdf-modal-ok" style="background: #00bfff; color: #fff; border-radius: 6px; padding: 8px 18px; font-weight: 600; font-size: 1em; border: none;">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      // Download button click
      modal.querySelector('#pdf-download-link').addEventListener('click', () => {
        downloaded = true;
      });
      // Cancel button
      modal.querySelector('#pdf-modal-cancel').addEventListener('click', () => {
        document.body.removeChild(modal);
      });
      // OK button
      modal.querySelector('#pdf-modal-ok').addEventListener('click', () => {
        if (!downloaded) {
          if (!window.confirm('Are you sure you want to close this dialog? You have not downloaded the PDF yet.')) {
            return;
          }
        }
        document.body.removeChild(modal);
      });
      return;
    }
    // ...existing code for generating and uploading PDF...
    // Fetch products for this layby (from sales_items)
    const { data: saleItems } = await supabase
      .from('sales_items')
      .select('product_id, quantity, unit_price, product:products(name, sku)')
      .eq('sale_id', layby.sale_id);
    const products = (saleItems || []).map(i => ({
      name: i.product?.name || '',
      sku: i.product?.sku || '',
      qty: i.quantity,
      price: i.unit_price
    }));
    // Fetch payments for this layby
    const { data: payments } = await supabase
      .from('sales_payments')
      .select('amount, payment_date')
      .eq('sale_id', layby.sale_id);
    // Fetch sale to get currency
    const { data: saleRows } = await supabase
      .from('sales')
      .select('currency')
      .eq('id', layby.sale_id)
      .single();
    const currency = saleRows?.currency || 'K';
    // Attach currency to layby for rendering
    layby._currency = currency;
    const customer = customersMap[layby.customer_id] || {};
    const logoUrl = window.location.origin + '/bestrest-logo.png';
    const companyName = 'BestRest';
    try {
      const doc = exportLaybyPDF({ companyName, logoUrl, customer, layby, products, payments, currency, returnDoc: true });
      if (!doc) {
        alert('PDF generation failed: exportLaybyPDF did not return a document.');
        return;
      }
      const fileName = `${customer.name || 'layby'}_statement.pdf`;
      const pdfBlob = await doc.output('blob');
      // Upload to Supabase Storage bucket 'layby'
      const filePath = `${layby.id}/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('layby').upload(filePath, pdfBlob, { contentType: 'application/pdf', upsert: true });
      if (uploadError) {
        alert('Failed to upload PDF: ' + JSON.stringify(uploadError));
        return;
      }
      // Get public URL
      const { data: publicUrlData } = supabase.storage.from('layby').getPublicUrl(filePath);
      pdfUrl = publicUrlData?.publicUrl;
      if (!pdfUrl) {
        alert('Could not get public URL for PDF.');
        return;
      }
      // Save URL in layby_view table (id, Layby_URL)
      const { error: insertError } = await supabase.from('layby_view').insert({ id: layby.id, Layby_URL: pdfUrl });
      if (insertError) {
        alert('Failed to save PDF URL to layby_view: ' + JSON.stringify(insertError));
        return;
      }
      // Show a custom modal with a real download button and confirmation
      let downloaded = false;
      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.top = '0';
      modal.style.left = '0';
      modal.style.width = '100vw';
      modal.style.height = '100vh';
      modal.style.background = 'rgba(0,0,0,0.55)';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.zIndex = '9999';
      modal.innerHTML = `
        <div style=\"background: #23272f; color: #fff; border-radius: 10px; padding: 28px 18px 18px 18px; min-width: 260px; max-width: 90vw; box-shadow: 0 2px 12px rgba(0,0,0,0.18); text-align: center;\">
          <div style=\"font-size: 1.1em; margin-bottom: 10px; font-weight: 600;\">PDF generated!</div>
          <div style=\"margin-bottom: 18px;\">Click the button below to download your PDF:</div>
          <a id=\"pdf-download-link\" href=\"${pdfUrl}\" download style=\"display: inline-block; background: #00bfff; color: #fff; padding: 10px 22px; border-radius: 6px; font-weight: 600; font-size: 1em; text-decoration: none; margin-bottom: 18px;\">Download PDF</a>
          <div style=\"margin-top: 18px; display: flex; gap: 18px; justify-content: center;\">
            <button id=\"pdf-modal-cancel\" style=\"background: #444; color: #fff; border-radius: 6px; padding: 8px 18px; font-weight: 500; font-size: 1em; border: none;\">Cancel</button>
            <button id=\"pdf-modal-ok\" style=\"background: #00bfff; color: #fff; border-radius: 6px; padding: 8px 18px; font-weight: 600; font-size: 1em; border: none;\">OK</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      // Download button click
      modal.querySelector('#pdf-download-link').addEventListener('click', () => {
        downloaded = true;
      });
      // Cancel button
      modal.querySelector('#pdf-modal-cancel').addEventListener('click', () => {
        document.body.removeChild(modal);
      });
      // OK button
      modal.querySelector('#pdf-modal-ok').addEventListener('click', () => {
        if (!downloaded) {
          if (!window.confirm('Are you sure you want to close this dialog? You have not downloaded the PDF yet.')) {
            return;
          }
        }
        document.body.removeChild(modal);
      });
    } catch (e) {
      alert('Error generating or uploading PDF: ' + (e?.message || e));
    }
  }

  if (locked) {
    return (
      <div className="layby-mobile-container" style={{ maxWidth: 340, margin: '60px auto', background: '#23272f', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.13)' }}>
        <h2 className="layby-mobile-title" style={{ textAlign: 'center', marginBottom: 18 }}>Enter Password</h2>
        <form onSubmit={handleUnlock} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            style={{ padding: '10px 12px', borderRadius: 6, border: '1px solid #333', background: '#181c20', color: '#fff', fontSize: '1.1rem' }}
            autoFocus
          />
          {error && <div style={{ color: '#ff5252', fontSize: 15 }}>{error}</div>}
          <button type="submit" style={{ background: '#00bfff', color: '#fff', borderRadius: 6, padding: '10px 0', fontWeight: 600, fontSize: '1.1rem', marginTop: 6 }}>Unlock</button>
        </form>
      </div>
    );
  }

  // Only show laybys if search is not empty and matches customer name or phone
  const filteredLaybys =
    search.trim() === ''
      ? []
      : laybys.filter(l => {
          const customer = customersMap[l.customer_id]?.name?.toLowerCase() || '';
          const phone = customersMap[l.customer_id]?.phone?.toLowerCase() || '';
          return (
            customer.includes(search.toLowerCase()) ||
            phone.includes(search.toLowerCase())
          );
        });

  return (
    <div className="layby-mobile-container" style={{ maxWidth: 900, margin: '18px auto', background: '#181c20', borderRadius: 10, padding: '6px 1px 10px 1px', boxShadow: '0 2px 12px rgba(0,0,0,0.13)', minHeight: '60vh', width: '100%', display: 'flex', flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start' }}>
      <h2 className="layby-mobile-title" style={{ fontSize: '1.05rem', color: '#4cafef', textAlign: 'center', marginBottom: 7, wordBreak: 'break-word' }}>Laybys (Mobile)</h2>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 7 }}>
        <input
          type="text"
          placeholder="Search customer name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #333', background: '#23272f', color: '#fff', fontSize: '0.82rem', minWidth: 80, width: '98%' }}
        />
      </div>
      {loading ? (
        <div className="layby-mobile-loading">Loading...</div>
      ) : (
        <div style={{ width: '100%' }}>
          <table className="layby-mobile-table" style={{ width: '100%', background: '#23272f', borderRadius: 5, margin: '0 auto', fontSize: '0.85rem', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: '70px' }}>Date</th>
                <th style={{ width: '120px', wordBreak: 'break-word', whiteSpace: 'normal' }}>Customer</th>
                <th style={{ width: '120px' }}>Total</th>
                <th style={{ width: '120px' }}>Paid</th>
                <th style={{ width: '120px' }}>Due</th>
                <th style={{ width: '90px' }}>Export</th>
              </tr>
            </thead>
            <tbody>
              {filteredLaybys.map(l => {
                // Fetch currency for this layby (if not already fetched)
                const currency = l._currency || 'K';
                const total = l.total_amount ? `${currency} ${l.total_amount}` : '';
                const paid = l.paid_amount ? `${currency} ${l.paid_amount}` : '';
                const due = (Number(l.total_amount) || 0) - (Number(l.paid_amount) || 0);
                const dueStr = `${currency} ${due}`;
                return (
                  <tr key={l.id}>
                    <td style={{ fontSize: '0.85em' }}>{new Date(l.created_at).toLocaleDateString()}</td>
                    <td style={{ wordBreak: 'break-word', whiteSpace: 'normal', fontSize: '0.85em' }}>{customersMap[l.customer_id]?.name || l.customer_id}</td>
                    <td>{total}</td>
                    <td>{paid}</td>
                    <td>{dueStr}</td>
                    <td style={{ minWidth: 0, padding: 0 }}>
                      <button
                        style={{ background: '#00bfff', color: '#fff', borderRadius: 4, padding: '8px 0', fontWeight: 700, fontSize: '0.95rem', minWidth: '100%', width: '100%', lineHeight: 1.2, letterSpacing: 0.2, border: 'none', margin: 0 }}
                        onClick={() => handleExport(l)}
                      >PDF</button>
                    </td>
                  </tr>
                );
              })}
              {filteredLaybys.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: '#aaa', padding: 8 }}>No laybys found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default LaybyManagementMobile;
