import React, { useEffect, useMemo, useState } from 'react';
import supabase from './supabase';
import './SalesReportMobile.css';

export default function SalesReportMobile() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Customers filter removed per request
  const [sales, setSales] = useState([]);
  const [locationId, setLocationId] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [locations, setLocations] = useState([]);
  const [laybyPaidMap, setLaybyPaidMap] = useState({}); // sale_id -> paid (down + payments)
  const [laybyTotalMap, setLaybyTotalMap] = useState({}); // sale_id -> layby total_amount

  useEffect(() => {
    (async () => {
      // Join customer and location to improve filtering/labels. Also fetch locations separately.
      const [{ data: salesRows }, { data: locs }] = await Promise.all([
        supabase
          .from('sales')
          .select('*, customer:customer_id(id,name), location:location_id(id, location_name, name)'),
        supabase.from('locations').select('id, location_name, name'),
      ]);
      setSales(salesRows || []);

      // Prefer explicit locations; if empty, derive from sales join as fallback
      const derivedLocs = Array.from(
        new Map(
          (salesRows || [])
            .map(r => r.location || {})
            .filter(l => l && l.id)
            .map(l => [l.id, { id: l.id, location_name: l.location_name, name: l.name }])
        ).values()
      );
      setLocations((locs && locs.length ? locs : derivedLocs) || []);

      // Build layby payment/total maps for quick lookup
      const saleIds = Array.from(new Set((salesRows || []).map(r => Number(r.id)).filter(id => !isNaN(id))));
      if (saleIds.length) {
        const [{ data: laybys }, { data: pays }, { data: downs }] = await Promise.all([
          supabase.from('laybys').select('sale_id, total_amount').in('sale_id', saleIds),
          supabase.from('sales_payments').select('sale_id, amount').in('sale_id', saleIds),
          supabase.from('sales').select('id, down_payment').in('id', saleIds),
        ]);
        const paymentsMap = (pays || []).reduce((acc, p) => {
          const sid = Number(p.sale_id);
          acc[sid] = (acc[sid] || 0) + Number(p.amount || 0);
          return acc;
        }, {});
        const downMap = (downs || []).reduce((acc, s) => {
          acc[Number(s.id)] = Number(s.down_payment || 0);
          return acc;
        }, {});
        const totalsMap = (laybys || []).reduce((acc, l) => {
          acc[Number(l.sale_id)] = Number(l.total_amount || 0);
          return acc;
        }, {});
        const paidMap = Object.fromEntries(saleIds.map(id => [id, (downMap[id] || 0) + (paymentsMap[id] || 0)]));
        setLaybyPaidMap(paidMap);
        setLaybyTotalMap(totalsMap);
      } else {
        setLaybyPaidMap({});
        setLaybyTotalMap({});
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    // Only show results when Receipt # is provided
    if (!receiptNumber) return [];
    return (sales || []).filter(sale => {
      if (dateFrom && sale.sale_date < dateFrom) return false;
      if (dateTo && sale.sale_date > dateTo) return false;
      if (locationId && String(sale.location_id || sale.location?.id || '') !== String(locationId)) return false;
      const rec = (String(sale.receipt_number || '') || String(sale.id || '')).toLowerCase();
      if (!rec.includes(receiptNumber.toLowerCase())) return false;
      return true;
    });
  }, [sales, dateFrom, dateTo, locationId, receiptNumber]);

  // Helpers for layby amounts
  function getPaidAmount(sale) {
    if ((sale.status || '').toLowerCase() !== 'layby') return 0;
    return Number(laybyPaidMap[Number(sale.id)] || 0);
  }
  function getPendingAmount(sale) {
    if ((sale.status || '').toLowerCase() !== 'layby') return 0;
    const total = Number(laybyTotalMap[Number(sale.id)] || sale.total_amount || 0);
    const paid = getPaidAmount(sale);
    return Math.max(0, total - paid);
  }

  return (
    <div className="sr-mobile-container">
      <div className="sr-mobile-filters">
        <select value={locationId} onChange={e => setLocationId(e.target.value)}>
          <option value="">All Locations</option>
          {locations.map(l => (
            <option key={l.id} value={l.id}>{l.location_name || l.name || `#${l.id}`}</option>
          ))}
        </select>

        <div className="date-field">
          <label>From Date</label>
          <div className="date-input">
            <span className="icon" aria-hidden>📅</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
        </div>

        <div className="date-field">
          <label>To Date</label>
          <div className="date-input">
            <span className="icon" aria-hidden>📅</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>

        <input type="text" value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} placeholder="Receipt #" className="full" />
      </div>

      {/* Summary by currency moved above table; show Completed and Layby totals */}
      {filtered.length > 0 && (() => {
        const completedTotals = {};
        const laybyTotals = {};
        filtered.forEach(sale => {
          const curr = sale.currency || 'N/A';
          const status = (sale.status || '').toLowerCase();
          if (status === 'completed') {
            completedTotals[curr] = (completedTotals[curr] || 0) + (Number(sale.total_amount) || 0);
          } else if (status === 'layby') {
            // Sum the layby total amount
            const total = Number(laybyTotalMap[Number(sale.id)] || sale.total_amount || 0);
            laybyTotals[curr] = (laybyTotals[curr] || 0) + total;
          }
        });
        const currencies = Array.from(new Set([...Object.keys(completedTotals), ...Object.keys(laybyTotals)]));
        return (
          <div className="sr-mobile-summary">
            <div className="sr-mobile-summary-title">Totals by Currency</div>
            <div className="sr-mobile-summary-grid">
              {currencies.map(curr => (
                <div key={curr} className="sr-mobile-summary-card">
                  <div className="curr">{curr}</div>
                  <div className="row"><span>Completed</span><b>{curr} {(completedTotals[curr] || 0).toLocaleString()}</b></div>
                  <div className="row total"><span>Layby</span><b>{curr} {(laybyTotals[curr] || 0).toLocaleString()}</b></div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="sr-mobile-table-wrap">
        <table className="sr-mobile-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Receipt #</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(sale => (
              <tr key={sale.id}>
                <td>{sale.sale_date ? new Date(sale.sale_date).toLocaleDateString() : ''}</td>
                <td>{sale.receipt_number || sale.id}</td>
                <td>{sale.customer?.name || ''}</td>
                <td>{sale.currency ? `${sale.currency} ${Number(sale.total_amount).toLocaleString()}` : `N/A ${Number(sale.total_amount).toLocaleString()}`}</td>
                <td>{sale.status}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ color: '#9aa4b2', textAlign: 'center' }}>{receiptNumber ? 'No results' : 'Enter a Receipt # to search'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="sr-mobile-actions">
        <button onClick={() => window.history.back()}>Back</button>
      </div>
    </div>
  );
}
