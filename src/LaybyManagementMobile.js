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
      // Scroll to top to ensure modal is centered in viewport
      window.scrollTo({ top: 0, behavior: 'auto' });
      // Show modal with existing URL
      let downloaded = false;
      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.left = '0';
      modal.style.top = '0';
      modal.style.width = '100vw';
      modal.style.height = '100vh';
      modal.style.background = 'rgba(0,0,0,0.55)';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.style.zIndex = '9999';
      modal.innerHTML = `
        <div style="background: #23272f; color: #fff; border-radius: 10px; padding: 28px 18px 18px 18px; min-width: 260px; max-width: 95vw; box-shadow: 0 2px 12px rgba(0,0,0,0.18); text-align: center; display: flex; flex-direction: column; align-items: center;">
          <div style="font-size: 1.1em; margin-bottom: 10px; font-weight: 600;">PDF already generated!</div>
          <div style="margin-bottom: 18px;">Click the button below to download your PDF:</div>
          <a id="pdf-download-link" href="${pdfUrl}" download style="display: inline-block; background: #00bfff; color: #fff; padding: 10px 22px; border-radius: 6px; font-weight: 600; font-size: 1em; text-decoration: none; margin-bottom: 18px; width: 100%; max-width: 300px;">Download PDF</a>
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
    // ...existing code for generating and uploading PDF...
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
    <div className="layby-mobile-container">
      <div className="layby-mobile-title">Laybys (Mobile)</div>
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
