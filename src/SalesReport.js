import React, { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import './SalesReport.css';
import supabase from './supabase';

const SalesReport = () => {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [customer, setCustomer] = useState('');
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    supabase.from('customers').select('id,name').then(({ data, error }) => {
      if (error) {
        console.error('Error fetching customers:', error);
      } else {
        console.log('Fetched customers:', data);
      }
      setCustomers(data || []);
    });
    supabase.from('sales').select('*, customer:customer_id(id,name)').then(({ data, error }) => {
      if (error) {
        console.error('Error fetching sales:', error);
      } else {
        console.log('Fetched sales:', data);
      }
      setSales(data || []);
    });
  }, []);

  // Filter sales in-memory by date, customer, and search
  const filteredSales = sales.filter(sale => {
    // Date filter
    if (dateFrom && sale.sale_date < dateFrom) return false;
    if (dateTo && sale.sale_date > dateTo) return false;
    // Customer filter
    if (customer && String(sale.customer_id) !== String(customer)) return false;
    // Search filter
    if (search) {
      const s = search.toLowerCase();
      const saleName = sale.customer?.name?.toLowerCase() || '';
      const saleStatus = (sale.status || '').toLowerCase();
      const saleId = String(sale.id || '').toLowerCase();
      if (
        !saleName.includes(s) &&
        !saleStatus.includes(s) &&
        !saleId.includes(s)
      ) {
        return false;
      }
    }
    return true;
  });

  // Export as PDF
  const handleExportPDF = () => {
    const doc = new jsPDF('p', 'pt', 'a4');
    const border = 28.35;
    const margin = 40;
    let y = margin;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setLineWidth(1);
    doc.rect(border, border, pageWidth - 2 * border, pageHeight - 2 * border);

    // Lower the header below the border
    y += 24;
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Sales Report', pageWidth / 2, y, { align: 'center' });
    y += 32;

    doc.setFontSize(12);
    let compY = y;
    const companyDetails = [
      'Best Rest Furniture',
      'P.O Box 3636 Parklands Shopping Centre',
      'Kitwe',
      'Zambia',
      '+260966000444',
      'bestrest10@gmail.com'
    ];
    companyDetails.forEach(line => {
      doc.text(line, margin, compY);
      compY += 16;
    });
    y = compY + 10;



    // Only export selected rows, or all if none selected
    const exportRows = selectedIds.length > 0
      ? filteredSales.filter(sale => selectedIds.includes(sale.id))
      : filteredSales;

    // Always use the currency column for each sale and display a single Total Amount column
    function formatAmount(amount, currency) {
      const num = Number(amount).toLocaleString();
      if (!currency) return `N/A ${num}`;
      return `${currency} ${num}`;
    }

    // Prepare table head and body
    const tableHead = ['Date', 'Customer', 'Total Amount', 'Status'];
    const tableBody = exportRows.map(sale => [
      sale.sale_date ? new Date(sale.sale_date).toLocaleDateString() : '',
      sale.customer?.name || '',
      formatAmount(sale.total_amount, sale.currency),
      sale.status
    ]);

    // Calculate totals per currency for the selected rows
    const currencyTotals = {};
    exportRows.forEach(sale => {
      const curr = sale.currency || 'N/A';
      currencyTotals[curr] = (currencyTotals[curr] || 0) + (parseFloat(sale.total_amount) || 0);
    });

    // Add a total row for each currency present
    if (tableBody.length > 0) {
      const totalCells = [ '', 'Total', '', '' ];
      // If only one currency, show total in the amount cell
      const currencies = Object.keys(currencyTotals);
      if (currencies.length === 1) {
        totalCells[2] = formatAmount(currencyTotals[currencies[0]], currencies[0]);
      } else {
        // If multiple currencies, show all totals in the amount cell, separated by comma
        totalCells[2] = currencies.map(curr => formatAmount(currencyTotals[curr], curr)).join(', ');
      }
      tableBody.push(totalCells);
    }

    doc.autoTable({
      head: [tableHead],
      body: tableBody,
      startY: y,
      styles: { fontSize: 10, cellPadding: 4, lineWidth: 0.1, lineColor: [0,0,0] },
      headStyles: { fillColor: [0, 191, 255], halign: 'center', fontStyle: 'bold', lineWidth: 0.1, lineColor: [0,0,0] },
      columnStyles: Object.fromEntries(tableHead.map((_, i) => [i, { halign: 'center' }])),
      bodyStyles: Object.fromEntries(tableHead.map((_, i) => [i, { halign: 'center' }])),
      margin: { left: border + 2, right: border + 2 },
      tableWidth: 'auto',
      theme: 'grid',
      didParseCell: function (data) {
        // Style the last row (total row)
        if (data.row.index === tableBody.length - 1) {
          data.cell.styles.textColor = [220, 38, 38]; // red text
          data.cell.styles.fillColor = [255, 228, 228]; // light red background
          // Amount column in total row bold red
          if (data.column.index === 2) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      }
    });

    doc.save(`sales_report.pdf`);
  };

  // Export as CSV
  const handleExportCSV = () => {
    const header = ['Date', 'Customer', 'Total Amount', 'Status'];
    const exportRows = selectedIds.length > 0
      ? filteredSales.filter(sale => selectedIds.includes(sale.id))
      : filteredSales;
    const rows = exportRows.map(sale => [
      sale.sale_date ? new Date(sale.sale_date).toLocaleDateString() : '',
      sale.customer?.name || '',
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
    <div className="sales-report-container">
      <h2>Sales Report</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <label>From: <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></label>
        <label>To: <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} /></label>
        <label>Customer:
          <select value={customer} onChange={e => setCustomer(e.target.value)}>
            <option value="">All</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <input
          type="text"
          placeholder="Search Sales..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Customer</th>
            <th>Total Amount</th>
            <th>Status</th>
             <th style={{ textAlign: 'right' }}>
               <input
                 type="checkbox"
                 checked={filteredSales.length > 0 && selectedIds.length === filteredSales.length}
                 onChange={e => {
                   if (e.target.checked) {
                     setSelectedIds(filteredSales.map(sale => sale.id));
                   } else {
                     setSelectedIds([]);
                   }
                 }}
                 aria-label="Select all"
               />
             </th>
          </tr>
        </thead>
        <tbody>
          {filteredSales.map(sale => (
            <tr key={sale.id}>
              <td>{sale.sale_date ? new Date(sale.sale_date).toLocaleDateString() : ''}</td>
              <td>{sale.customer?.name || ''}</td>
              <td>{sale.currency ? `${sale.currency} ${Number(sale.total_amount).toLocaleString()}` : `N/A ${Number(sale.total_amount).toLocaleString()}`}</td>
              <td>{sale.status}</td>
              <td style={{ textAlign: 'right' }}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(sale.id)}
                  onChange={e => {
                    if (e.target.checked) {
                      setSelectedIds(prev => [...prev, sale.id]);
                    } else {
                      setSelectedIds(prev => prev.filter(id => id !== sale.id));
                    }
                  }}
                  aria-label={`Select sale ${sale.id}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', alignItems: 'center', margin: '18px 0 0 0', width: '100%' }}>
        <button className="export-btn" style={{ marginRight: 12 }} onClick={handleExportPDF}>Export as PDF</button>
        <button className="export-btn" style={{ marginRight: 'auto' }} onClick={handleExportCSV}>Export as CSV</button>
        {/* Back to Dashboard button removed as requested */}
      </div>
    </div>
  );
}
export default SalesReport;
