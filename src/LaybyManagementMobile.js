
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
      const pdfUrl = publicUrlData?.publicUrl;
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
      // Show prompt with clickable link
      window.prompt('PDF generated! Click the link below to download:', pdfUrl);
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
    <div className="layby-mobile-container" style={{ maxWidth: 370, margin: '18px auto', background: '#181c20', borderRadius: 10, padding: '6px 1px 10px 1px', boxShadow: '0 2px 12px rgba(0,0,0,0.13)', minHeight: '90vh', width: '100%' }}>
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
          <table className="layby-mobile-table" style={{ width: '100%', background: '#23272f', borderRadius: 5, margin: '0 auto', fontSize: '0.74rem', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ width: '60px', wordBreak: 'break-word', whiteSpace: 'normal' }}>Customer</th>
                <th style={{ width: '38px' }}>Total</th>
                <th style={{ width: '38px' }}>Paid</th>
                <th style={{ width: '38px' }}>Due</th>
                <th style={{ width: '34px' }}>Status</th>
                <th style={{ width: '48px' }}>Date</th>
                <th style={{ width: '38px' }}>Exp</th>
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
                const isMobile = typeof window !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
                return (
                  <tr key={l.id}>
                    <td style={{ wordBreak: 'break-word', whiteSpace: 'normal', fontSize: '0.85em' }}>{customersMap[l.customer_id]?.name || l.customer_id}</td>
                    <td>{total}</td>
                    <td>{paid}</td>
                    <td>{dueStr}</td>
                    <td style={{ wordBreak: 'break-word', whiteSpace: 'normal' }}>{l.status}</td>
                    <td style={{ fontSize: '0.85em' }}>{new Date(l.created_at).toLocaleDateString()}</td>
                    <td style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                      <button
                        style={{ background: '#00bfff', color: '#fff', borderRadius: 1, padding: '1px 0', fontWeight: 600, fontSize: '0.55rem', minWidth: 0, lineHeight: 1, letterSpacing: 0.2 }}
                        onClick={() => handleExport(l)}
                      >PDF</button>
                    </td>
                  </tr>
                );
              })}
              {filteredLaybys.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#aaa', padding: 8 }}>No laybys found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default LaybyManagementMobile;
