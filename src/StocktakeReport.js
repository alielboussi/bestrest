import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import './ReportPage.css';


const StocktakeReport = () => {
  const [stocktakes, setStocktakes] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('stocktakes').select('*').order('ended_at', { ascending: false }).then(({ data }) => setStocktakes(data || []));
  }, []);

  // Only search by type and location for stocktake report
  const filteredStocktakes = stocktakes.filter(st => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (st.type || '').toLowerCase().includes(s) ||
      (st.location_id + '').toLowerCase().includes(s)
    );
  });

  // Export as PDF
  const handleExportPDF = () => {
    const doc = new jsPDF('p', 'pt', 'a4');
    const margin = 40;
    let y = margin;
    doc.setFontSize(18);
    doc.text('Stocktake Report', margin, y);
    y += 24;
    doc.setFontSize(12);
    doc.autoTable({
      head: [['Type', 'Location', 'Started At', 'Ended At', 'Variance']],
      body: filteredStocktakes.map(st => [
        st.type,
        st.location_id,
        st.started_at ? new Date(st.started_at).toLocaleString() : '',
        st.ended_at ? new Date(st.ended_at).toLocaleString() : '',
        st.variance || ''
      ]),
      startY: y + 10,
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [0, 191, 255] },
      margin: { left: margin, right: margin }
    });
    doc.save(`stocktake_report.pdf`);
  };

  // Export as CSV
  const handleExportCSV = () => {
    if (!filteredStocktakes.length) return;
    const header = ['Type', 'Location', 'Started At', 'Ended At', 'Variance'];
    const rows = filteredStocktakes.map(st => [
      st.type,
      st.location_id,
      st.started_at ? new Date(st.started_at).toLocaleString() : '',
      st.ended_at ? new Date(st.ended_at).toLocaleString() : '',
      st.variance || ''
    ]);
    const csvContent = [header, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stocktake_report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="report-page">
      <h2>Stocktake Reports</h2>
      <div className="report-filters" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        <input
          type="text"
          placeholder="Search Stocktakes..."
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #00bfff', background: '#181c20', color: '#fff', minWidth: 160 }}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <table className="report-table">
        <thead>
          <tr>
            <th>Type</th>
            <th>Location</th>
            <th>Started At</th>
            <th>Ended At</th>
            <th>Variance</th>
          </tr>
        </thead>
        <tbody>
          {filteredStocktakes.map(st => (
            <tr key={st.id}>
              <td>{st.type}</td>
              <td>{st.location_id}</td>
              <td>{st.started_at ? new Date(st.started_at).toLocaleString() : ''}</td>
              <td>{st.ended_at ? new Date(st.ended_at).toLocaleString() : ''}</td>
              <td>{st.variance || ''}</td>
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
export default StocktakeReport;
