import React, { useEffect, useMemo, useState } from 'react';
import supabase from './supabase';
import './SalesReportMobile.css';

export default function SalesReportMobile() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customer, setCustomer] = useState('');
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [paymentType, setPaymentType] = useState('all');
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    (async () => {
      const [{ data: custs }, { data: salesRows }, { data: locs }] = await Promise.all([
        supabase.from('customers').select('id,name'),
        supabase.from('sales').select('*, customer:customer_id(id,name)'),
        supabase.from('locations').select('id, location_name, name'),
      ]);
      setCustomers(custs || []);
      setSales(salesRows || []);
      setLocations(locs || []);
    })();
  }, []);

  const filtered = useMemo(() => {
    return (sales || []).filter(sale => {
      if (dateFrom && sale.sale_date < dateFrom) return false;
      if (dateTo && sale.sale_date > dateTo) return false;
      if (locationId && String(sale.location_id || '') !== String(locationId)) return false;
      if (receiptNumber) {
        const rec = (String(sale.receipt_number || '') || String(sale.id || '')).toLowerCase();
        if (!rec.includes(receiptNumber.toLowerCase())) return false;
      }
      if (customer && String(sale.customer_id) !== String(customer)) return false;
      if (paymentType === 'completed' && sale.status !== 'completed') return false;
      if (paymentType === 'layby' && sale.status !== 'layby') return false;
      if (search) {
        const s = search.toLowerCase();
        const saleName = sale.customer?.name?.toLowerCase() || '';
        const saleStatus = (sale.status || '').toLowerCase();
        const saleId = String(sale.id || '').toLowerCase();
        if (!saleName.includes(s) && !saleStatus.includes(s) && !saleId.includes(s)) return false;
      }
      return true;
    });
  }, [sales, dateFrom, dateTo, locationId, receiptNumber, customer, paymentType, search]);

  return (
    <div className="sr-mobile-container">
      <div className="sr-mobile-filters">
        <select value={locationId} onChange={e => setLocationId(e.target.value)}>
          <option value="">All Locations</option>
          {locations.map(l => <option key={l.id} value={l.id}>{l.location_name || l.name || `#${l.id}`}</option>)}
        </select>
        <select value={paymentType} onChange={e => setPaymentType(e.target.value)}>
          <option value="all">All</option>
          <option value="completed">Completed</option>
          <option value="layby">Layby</option>
        </select>
        <input className="full" type="text" placeholder="Search Sales..." value={search} onChange={e => setSearch(e.target.value)} />
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        <select value={customer} onChange={e => setCustomer(e.target.value)} className="full">
          <option value="">All Customers</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input type="text" value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} placeholder="Receipt #" className="full" />
      </div>

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
              <tr><td colSpan={5} style={{ color: '#9aa4b2', textAlign: 'center' }}>No results</td></tr>
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
