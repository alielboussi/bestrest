import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

import './ReportPage.css';

const LaybyReport = () => {
  const [customer, setCustomer] = useState('');
  const [customers, setCustomers] = useState([]);
  const [laybys, setLaybys] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('customers').select('id, full_name').then(({ data }) => setCustomers(data || []));
  }, []);

  useEffect(() => {
    let query = supabase.from('laybys').select('*, customers:customer_id(*), sales:sale_id(*), sales_items:sale_id(*, products(*)), sales_payments:sale_id(*)');
    if (customer) query = query.eq('customer_id', customer);
    query.then(({ data }) => setLaybys(data || []));
  }, [customer]);

  const filteredLaybys = laybys.filter(l => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (l.customers?.full_name || '').toLowerCase().includes(s) ||
      (l.status || '').toLowerCase().includes(s)
    );
  });

  // Export as PDF
  const handleExportPDF = () => {
    const doc = new jsPDF('p', 'pt', 'a4');
    const margin = 40;
    let y = margin;
    doc.setFontSize(18);
    doc.text('Layby Report', margin, y);
    y += 24;
    doc.setFontSize(12);
    doc.autoTable({
      head: [['Customer', 'Status', 'Products', 'Payments', 'Total Deposited', 'Pending Balance']],
      body: filteredLaybys.map(l => [
        l.customers?.full_name,
        l.status,
        l.sales_items?.map(si => si.products?.name).join(', '),
        l.sales_payments?.map(sp => `${sp.amount} (${sp.payment_date})`).join(', '),
        l.paid_amount,
        l.total_amount - l.paid_amount
      ]),
      startY: y + 10,
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [0, 191, 255] },
      margin: { left: margin, right: margin }
    });
    doc.save(`layby_report.pdf`);
  };

  // Export as CSV
  const handleExportCSV = () => {
    const header = ['Customer', 'Status', 'Products', 'Payments', 'Total Deposited', 'Pending Balance'];
    const rows = filteredLaybys.map(l => [
      l.customers?.full_name,
      l.status,
      l.sales_items?.map(si => si.products?.name).join(', '),
      l.sales_payments?.map(sp => `${sp.amount} (${sp.payment_date})`).join(', '),
      l.paid_amount,
      l.total_amount - l.paid_amount
    ]);
    const csvContent = [header, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `layby_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };



  return (
    <div className="report-page">
      <h2>Layby Report</h2>
      <div className="report-filters" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>Customer:
          <select value={customer} onChange={e => setCustomer(e.target.value)}>
            <option value="">All</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </label>
        <input
          type="text"
          placeholder="Search Laybys..."
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #00bfff', background: '#181c20', color: '#fff', minWidth: 160 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <table className="report-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Status</th>
            <th>Products</th>
            <th>Payments</th>
            <th>Total Deposited</th>
            <th>Pending Balance</th>
          </tr>
        </thead>
        <tbody>
          {filteredLaybys.map(l => (
            <tr key={l.id}>
              <td>{l.customers?.full_name}</td>
              <td>{l.status}</td>
              <td>{l.sales_items?.map(si => si.products?.name).join(', ')}</td>
              <td>{l.sales_payments?.map(sp => `${sp.amount} (${sp.payment_date})`).join(', ')}</td>
              <td>{l.paid_amount}</td>
              <td>{l.total_amount - l.paid_amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0 0 0', width: '100%' }}>
        <button
          className="export-btn"
          style={{
            fontSize: '0.95em',
            padding: '6px 18px',
            background: '#00bfff',
            color: '#fff',
            border: '2px solid #00bfff',
            borderRadius: 6,
            fontWeight: 600,
            boxShadow: '0 1px 4px #0003',
            cursor: 'pointer',
            transition: 'background 0.2s, color 0.2s',
            minWidth: 120,
            marginRight: 12,
          }}
          onClick={handleExportPDF}
        >Export as PDF</button>
        <button
          className="export-btn"
          style={{
            fontSize: '0.95em',
            padding: '6px 18px',
            background: '#00bfff',
            color: '#fff',
            border: '2px solid #00bfff',
            borderRadius: 6,
            fontWeight: 600,
            boxShadow: '0 1px 4px #0003',
            cursor: 'pointer',
            transition: 'background 0.2s, color 0.2s',
            minWidth: 120,
            marginRight: 'auto',
          }}
          onClick={handleExportCSV}
        >Export as CSV</button>
        <button
          className="back-to-dashboard-btn"
          style={{
            fontSize: '0.95em',
            padding: '6px 18px',
            background: '#00bfff',
            color: '#fff',
            border: '2px solid #00bfff',
            borderRadius: 6,
            fontWeight: 600,
            boxShadow: '0 1px 4px #0003',
            cursor: 'pointer',
            transition: 'background 0.2s, color 0.2s',
            minWidth: 120,
            marginLeft: 'auto',
          }}
          onClick={() => window.location.href = '/dashboard'}
          onMouseOver={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#00bfff'; e.currentTarget.style.borderColor = '#00bfff'; }}
          onMouseOut={e => { e.currentTarget.style.background = '#00bfff'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#00bfff'; }}
        >Back to Dashboard</button>
      </div>

    </div>
  );
}

export default LaybyReport;
