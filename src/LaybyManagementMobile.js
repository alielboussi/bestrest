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

  async function handleUnlock(e) {
    e.preventDefault();
    setError('');
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

  async function handleExport(layby) {
    const { data: laybyViewRows, error: laybyViewError } = await supabase
      .from('layby_view')
      .select('Layby_URL')
      .eq('id', layby.id)
      .maybeSingle();
    let pdfUrl = laybyViewRows?.Layby_URL;
    if (pdfUrl) {
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
      const downloadBtn = modal.querySelector('#pdf-download-link');
      downloadBtn.addEventListener('click', () => {
        downloaded = true;
        setTimeout(() => {
          if (document.body.contains(modal)) document.body.removeChild(modal);
        }, 500);
      });
      modal.querySelector('#pdf-modal-cancel').addEventListener('click', () => {
        if (document.body.contains(modal)) document.body.removeChild(modal);
      });
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
    // existing PDF generation/upload logic goes here
  }

  // Show all when search is empty
  const filteredLaybys =
    search.trim() === ''
      ? laybys
      : laybys.filter(l => {
          const customer = (customersMap[l.customer_id]?.name || '').toLowerCase();
          const phone = (customersMap[l.customer_id]?.phone || '').toLowerCase();
          return (
            customer.includes(search.toLowerCase()) ||
            phone.includes(search.toLowerCase())
          );
        });

  if (locked) {
    return (
      <div className="layby-mobile-container">
        <div className="layby-mobile-inner locked-container">
          <h2 className="layby-mobile-title">Enter Password</h2>
          <form onSubmit={handleUnlock} className="password-form">
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              className="password-input"
              autoFocus
            />
            {error && <div className="error-text">{error}</div>}
            <button type="submit" className="unlock-btn">Unlock</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="layby-mobile-container">
      <div className="layby-mobile-inner">
        <h2 className="layby-mobile-title">Laybys (Mobile)</h2>
        <input
          type="text"
          placeholder="Search customer name or phone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="layby-mobile-search"
        />
        {loading ? (
          <div className="layby-mobile-loading">Loading...</div>
        ) : (
          <div className="table-wrapper">
            <table className="layby-mobile-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Date</th>
                  <th style={{ width: '80px', wordBreak: 'break-word', whiteSpace: 'normal' }}>Customer</th>
                  <th style={{ width: '80px' }}>Total</th>
                  <th style={{ width: '80px' }}>Paid</th>
                  <th style={{ width: '80px' }}>Due</th>
                  <th style={{ width: '50px' }}>Export</th>
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
                      <td style={{ minWidth: 0, padding: 0 }}>
                        <button
                          className="export-pdf-btn"
                          onClick={() => handleExport(l)}
                        >PDF</button>
                      </td>
                    </tr>
                  );
                })}
                {filteredLaybys.length === 0 && (
                  <tr>
                    <td colSpan={6} className="no-data-cell">No laybys found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default LaybyManagementMobile;
