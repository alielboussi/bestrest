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
          .select('*, customer:customer_id(id,name), location:location_id(id, name)'),
        supabase.from('locations').select('id, name'),
      ]);
      setSales(salesRows || []);

      // Build a robust locations list: prefer fetched locs; else derive from sales (location_id + joined names)
      const locsById = new Map((locs || []).map(l => [String(l.id), { id: l.id, name: l.name }]));
      const joinedNameById = new Map(
        (salesRows || [])
          .filter(r => r.location && r.location.id)
          .map(r => [String(r.location.id), r.location.name])
      );
      const saleLocIds = Array.from(
        new Set((salesRows || []).map(r => r.location_id).filter(Boolean).map(id => String(id)))
      );
      const derivedLocs = saleLocIds.map(id => {
        const fromFetch = locsById.get(id);
        if (fromFetch) return fromFetch;
        const joinedName = joinedNameById.get(id);
        return { id, name: joinedName || `#${id.slice(0, 8)}` };
      });
      const finalLocs = (locs && locs.length) ? locs.map(l => ({ id: l.id, name: l.name })) : derivedLocs;
      setLocations(finalLocs || []);

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

  // Helper to get the location ID from a sale object
  function getLocationId(sale) {
    return sale.location_id || (sale.location && sale.location.id) || '';
  }

  const rangeLocFiltered = useMemo(() => {
    // Dataset for totals: filter only by date and location
    const fromTime = dateFrom ? new Date(dateFrom + 'T00:00:00').getTime() : null;
    const toTime = dateTo ? new Date(dateTo + 'T23:59:59').getTime() : null;
    return (sales || []).filter(sale => {
      const saleTime = sale.sale_date ? new Date(sale.sale_date).getTime() : null;
      if (fromTime !== null && (saleTime === null || saleTime < fromTime)) return false;
      if (toTime !== null && (saleTime === null || saleTime > toTime)) return false;
      if (locationId && String(getLocationId(sale)) !== String(locationId)) return false;
      return true;
    });
  }, [sales, dateFrom, dateTo, locationId]);

  const receiptMatches = useMemo(() => {
    // Optional receipt lookup: independent of totals
    if (!receiptNumber) return [];
    const recLower = receiptNumber.toLowerCase();
    return rangeLocFiltered.filter(sale => {
      const rec = (String(sale.receipt_number || '') || String(sale.id || '')).toLowerCase();
      return rec.includes(recLower);
    });
  }, [rangeLocFiltered, receiptNumber]);

  const selectedLocationName = useMemo(() => {
    if (!locationId) return 'All Locations';
    const found = (locations || []).find(l => String(l.id) === String(locationId));
    return found?.name || `Location ${String(locationId).slice(0, 8)}`;
  }, [locations, locationId]);

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
            <span className="icon" aria-hidden="true">📅</span>
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

      {/* Summary by currency: computed from date/location filters only (not receipt) */}
      {(() => {
        const salesTotals = {}; // completed sales
        const laybyPaidTotals = {}; // paid on layby (down + payments)
        const laybyDueTotals = {}; // remaining on layby
        rangeLocFiltered.forEach(sale => {
          const curr = sale.currency || 'N/A';
          const status = (sale.status || '').toLowerCase();
          if (status === 'completed') {
            salesTotals[curr] = (salesTotals[curr] || 0) + (Number(sale.total_amount) || 0);
          } else if (status === 'layby') {
            const paid = getPaidAmount(sale);
            const due = getPendingAmount(sale);
            laybyPaidTotals[curr] = (laybyPaidTotals[curr] || 0) + paid;
            laybyDueTotals[curr] = (laybyDueTotals[curr] || 0) + due;
          }
        });
        const currencies = Array.from(new Set([
          ...Object.keys(salesTotals),
          ...Object.keys(laybyPaidTotals),
          ...Object.keys(laybyDueTotals),
        ]));
        const combinedTotals = Object.fromEntries(
          currencies.map(c => [c, (salesTotals[c] || 0) + (laybyPaidTotals[c] || 0)])
        );
        return (
          <div className="sr-mobile-summary">
            <div className="sr-mobile-scope">Scope: {selectedLocationName}</div>
            <div className="sr-mobile-grand">
              <div className="title">Grand Totals</div>
              <div className="sr-mobile-summary-grid">
                {currencies.map(curr => (
                  <div key={curr} className="sr-mobile-summary-card">
                    <div className="curr">{curr}</div>
                    <div className="row total"><span>Sales + Completed Laybys</span><b>{curr} {combinedTotals[curr].toLocaleString()}</b></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="sr-mobile-summary-title">Totals by Currency</div>
            <div className="sr-mobile-summary-grid">
              {currencies.map(curr => (
                <div key={curr} className="sr-mobile-summary-card">
                  <div className="curr">{curr}</div>
                  <div className="row"><span>Total Sales</span><b>{curr} {(salesTotals[curr] || 0).toLocaleString()}</b></div>
                  <div className="row"><span>Completed Laybys</span><b>{curr} {(laybyPaidTotals[curr] || 0).toLocaleString()}</b></div>
                  <div className="row"><span>Laybys Due</span><b>{laybyDueTotals[curr] ? `${curr} ${laybyDueTotals[curr].toLocaleString()}` : '-'}</b></div>
                  <div className="row total"><span>Sales + Completed Laybys</span><b>{curr} {combinedTotals[curr].toLocaleString()}</b></div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {receiptNumber && receiptMatches.length === 0 && (
        <div className="sr-hint">No matching receipts found.</div>
      )}

      <div className="sr-mobile-actions">
        <button onClick={() => window.history.back()}>Back</button>
      </div>
    </div>
  );
}
