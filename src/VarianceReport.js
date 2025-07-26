import React, { useState, useEffect } from 'react';
import './VarianceReport.css';
import supabase from './supabase';
import { useNavigate } from 'react-router-dom';
import { exportVarianceReportPDF } from './pdfUtils';

function VarianceReport({ locationId, openingStockId, closingStockId }) {
  const [reportRows, setReportRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [reportDate, setReportDate] = useState('');
  const [openingInfo, setOpeningInfo] = useState({ date: '', user: '' });
  const [closingInfo, setClosingInfo] = useState({ date: '', user: '' });
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch company name for header
    const companySettings = JSON.parse(localStorage.getItem('companySettings'));
    if (companySettings) setCompanyName(companySettings.company_name);
    setReportDate(new Date().toLocaleDateString());
  }, []);

  useEffect(() => {
    async function fetchReport() {
      setLoading(true);
      setError('');
      try {
        // Fetch opening and closing stocktakes info
        const { data: openingStocktake } = await supabase
          .from('stocktakes')
          .select('started_at, ended_at, user_id')
          .eq('id', openingStockId)
          .single();
        const { data: closingStocktake } = await supabase
          .from('stocktakes')
          .select('started_at, ended_at, user_id')
          .eq('id', closingStockId)
          .single();
        // Fetch user names
        let openingUser = '', closingUser = '';
        if (openingStocktake?.user_id) {
          const { data: user } = await supabase.from('users').select('full_name').eq('id', openingStocktake.user_id).single();
          openingUser = user?.full_name || '';
        }
        if (closingStocktake?.user_id) {
          const { data: user } = await supabase.from('users').select('full_name').eq('id', closingStocktake.user_id).single();
          closingUser = user?.full_name || '';
        }
        setOpeningInfo({ date: openingStocktake?.started_at || '', user: openingUser });
        setClosingInfo({ date: closingStocktake?.ended_at || '', user: closingUser });

        // Fetch opening and closing stock entries
        const { data: openingStock } = await supabase
          .from('stocktake_entries')
          .select('product_id, qty')
          .eq('stocktake_id', openingStockId);
        const { data: closingStock } = await supabase
          .from('stocktake_entries')
          .select('product_id, qty')
          .eq('stocktake_id', closingStockId);
        // Fetch products
        const { data: products } = await supabase
          .from('products')
          .select('id, name, cost_price, currency');
        // TODO: Fetch transfers and sales for the period
        const rows = products.map(p => ({
          product: p.name,
          opening: openingStock?.find(e => e.product_id === p.id)?.qty || 0,
          transfers: 0, // To be filled
          sales: 0, // To be filled
          closing: closingStock?.find(e => e.product_id === p.id)?.qty || 0,
          variance: 0, // To be calculated
          varianceAmount: 0, // To be calculated
          cost_price: p.cost_price,
          currency: p.currency
        }));
        setReportRows(rows);
      } catch (err) {
        setError('Failed to load report data.');
      }
      setLoading(false);
    }
    if (openingStockId && closingStockId) fetchReport();
  }, [openingStockId, closingStockId]);

  // Export as CSV
  const handleExportCSV = () => {
    if (!reportRows.length) return;
    const header = ['Product','Opening Stock','Transfers In','Sales','Closing Stock','Variance (Qty)','Variance (Amount)','Currency'];
    const rows = reportRows.map(row => [
      row.product,
      row.opening,
      row.transfers,
      row.sales,
      row.closing,
      row.variance,
      row.varianceAmount,
      row.currency
    ]);
    const csvContent = [header, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `variance_report_${reportDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Advanced Export as PDF using jsPDF
  const handleExportPDF = () => {
    exportVarianceReportPDF({
      companyName,
      logoUrl: window.location.origin + '/bestrest-logo.png',
      reportDate,
      openingInfo,
      closingInfo,
      reportRows
    });
  };

  return (
    <div className="variance-report-container">
      <div className="variance-report-header">
        <img src="/bestrest-logo.png" alt="Company Logo" className="company-logo" />
        <div>
          <h1>{companyName} - Variance Report</h1>
          <p>Date: {reportDate}</p>
          <p>
            <strong>Stocktake Period:</strong>
            {openingInfo.date && closingInfo.date
              ? ` ${new Date(openingInfo.date).toLocaleString()} to ${new Date(closingInfo.date).toLocaleString()}`
              : ' N/A'}
          </p>
          <p>
            <strong>Opening Stock by:</strong> {openingInfo.user || 'N/A'}<br />
            <strong>Closing Stock by:</strong> {closingInfo.user || 'N/A'}
          </p>
        </div>
      </div>
      <button className="back-dashboard-btn" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      {loading ? (
        <div>Loading...</div>
      ) : error ? (
        <div className="error-message">{error}</div>
      ) : (
        <div className="variance-table-wrapper">
          <table className="variance-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Opening Stock</th>
                <th>Transfers In</th>
                <th>Sales</th>
                <th>Closing Stock</th>
                <th>Variance (Qty)</th>
                <th>Variance (Amount)</th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((row, idx) => (
                <tr key={idx}>
                  <td>{row.product}</td>
                  <td>{row.opening}</td>
                  <td>{row.transfers}</td>
                  <td>{row.sales}</td>
                  <td>{row.closing}</td>
                  <td>{row.variance}</td>
                  <td>{row.varianceAmount} {row.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="variance-report-actions">
        <button className="export-btn" onClick={handleExportPDF} disabled={loading || error}>Export as PDF</button>
        <button className="export-btn" onClick={handleExportCSV} disabled={loading || error}>Export as CSV</button>
      </div>
    </div>
  );
}

export default VarianceReport;
