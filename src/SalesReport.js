

import React, { useState, useEffect } from 'react';

import jsPDF from 'jspdf';
import 'jspdf-autotable';

import supabase from './supabase';

const SalesReport = () => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customer, setCustomer] = useState('');
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('customers').select('id, full_name').then(({ data }) => setCustomers(data || []));
  }, []);

  useEffect(() => {
    let query = supabase.from('sales').select('*, customers:customer_id(full_name)');
    if (dateFrom) query = query.gte('sale_date', dateFrom);
    if (dateTo) query = query.lte('sale_date', dateTo);
    if (customer) query = query.eq('customer_id', customer);
    query.then(({ data }) => setSales(data || []));
  }, [dateFrom, dateTo, customer]);

  // Only search by customer name and status for sales report
  const filteredSales = sales.filter(sale => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (sale.customers?.full_name || '').toLowerCase().includes(s) ||
      (sale.status || '').toLowerCase().includes(s)
    );
  });

  // Export as PDF
  const handleExportPDF = () => {
    const doc = new jsPDF('p', 'pt', 'a4');
    const margin = 40;
    let y = margin;
    doc.setFontSize(18);
    doc.text('Sales Report', margin, y);
    y += 24;
    doc.setFontSize(12);
    doc.autoTable({
      head: [['Date', 'Customer', 'Total Amount', 'Status']],
      body: filteredSales.map(sale => [
        sale.sale_date ? new Date(sale.sale_date).toLocaleDateString() : '',
        sale.customers?.full_name || '',
        sale.total_amount,
        sale.status
      ]),
      startY: y + 10,
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [0, 191, 255] },
      margin: { left: margin, right: margin }
    });
    doc.save(`sales_report.pdf`);
  };

  // Export as CSV
  const handleExportCSV = () => {
    const header = ['Date', 'Customer', 'Total Amount', 'Status'];
    const rows = filteredSales.map(sale => [
      sale.sale_date ? new Date(sale.sale_date).toLocaleDateString() : '',
      sale.customers?.full_name || '',
      sale.total_amount,
      sale.status
    ]);
    const csvContent = [header, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="report-page">
      <h2>Sales Report</h2>
      <div className="report-filters" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>From: <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></label>
        <label>To: <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></label>
        <label>Customer:
          <select value={customer} onChange={e => setCustomer(e.target.value)}>
            <option value="">All</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </label>
        <input
          type="text"
          placeholder="Search Sales..."
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #00bfff', background: '#181c20', color: '#fff', minWidth: 160 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <table className="report-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Customer</th>
            <th>Total Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredSales.map(sale => (
            <tr key={sale.id}>
              <td>{sale.sale_date ? new Date(sale.sale_date).toLocaleDateString() : ''}</td>
              <td>{sale.customers?.full_name || ''}</td>
              <td>{sale.total_amount}</td>
              <td>{sale.status}</td>
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

export default SalesReport;
