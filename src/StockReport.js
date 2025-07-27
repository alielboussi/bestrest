
import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import './ReportPage.css';




const StockReport = () => {
  const [location, setLocation] = useState('');
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('locations').select('id, name').then(({ data }) => setLocations(data || []));
  }, []);

  useEffect(() => {
    let query = supabase.from('products').select('*');
    if (location) query = query.eq('location_id', location);
    query.then(({ data }) => setProducts(data || []));
  }, [location]);

  // Only search by product name for stock report
  const filteredProducts = products.filter(p => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (p.name || '').toLowerCase().includes(s);
  });

  // Export as PDF
  const handleExportPDF = () => {
    const doc = new jsPDF('p', 'pt', 'a4');
    const margin = 40;
    let y = margin;
    doc.setFontSize(18);
    doc.text('Stock Report', margin, y);
    y += 24;
    doc.setFontSize(12);
    doc.text(`Location: ${location || 'All'}`, margin, y);
    y += 18;
    doc.autoTable({
      head: [['Product', 'Quantity', 'Total Cost']],
      body: filteredProducts.map(p => [
        p.name,
        p.quantity,
        p.cost_price
      ]),
      startY: y + 10,
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [0, 191, 255] },
      margin: { left: margin, right: margin }
    });
    doc.save(`stock_report_${location || 'all'}.pdf`);
  };

  // Export as CSV
  const handleExportCSV = () => {
    if (!filteredProducts.length) return;
    const header = ['Product', 'Quantity', 'Total Cost'];
    const rows = filteredProducts.map(p => [
      p.name,
      p.quantity,
      p.cost_price
    ]);
    const csvContent = [header, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_report_${location || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };



  return (
    <div className="report-page">
      <h2>Stock Report</h2>
      <div className="report-filters" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>Location:
          <select value={location} onChange={e => setLocation(e.target.value)}>
            <option value="">All</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <input
          type="text"
          placeholder="Search Products..."
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #00bfff', background: '#181c20', color: '#fff', minWidth: 160 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <table className="report-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Quantity</th>
            <th>Total Cost</th>
          </tr>
        </thead>
        <tbody>
          {filteredProducts.map(p => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td>{p.quantity}</td>
              <td>{p.cost_price}</td>
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
export default StockReport;
