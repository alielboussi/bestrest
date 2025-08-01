
import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import './ReportPage.css';
import './StocktakeReport.css';



const StocktakeReport = () => {
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');
  const [periods, setPeriods] = useState([]); // Stocktake periods for selected location
  const [selectedPeriod, setSelectedPeriod] = useState(null); // { opening, closing, started_at, ended_at }


  useEffect(() => {
    // Fetch locations for filter dropdown
    supabase.from('locations').select('id, name').then(({ data }) => setLocations(data || []));
  }, []);

  // Fetch stocktake periods for selected location
  useEffect(() => {
    if (!location) {
      setPeriods([]);
      setSelectedPeriod(null);
      return;
    }
    async function fetchPeriods() {
      // Get all stocktakes for this location, order by started_at
      const { data: stocktakes, error } = await supabase
        .from('stocktakes')
        .select('id, started_at, ended_at, type')
        .eq('location_id', location)
        .order('started_at', { ascending: true });
      if (error || !stocktakes) {
        setPeriods([]);
        setSelectedPeriod(null);
        return;
      }
      // Pair opening/closing stocktakes by started_at (assume opening then closing)
      let periods = [];
      for (let i = 0; i < stocktakes.length - 1; i++) {
        if (stocktakes[i].type === 'opening' && stocktakes[i + 1].type === 'closing') {
          periods.push({
            opening: stocktakes[i],
            closing: stocktakes[i + 1],
            started_at: stocktakes[i].started_at,
            ended_at: stocktakes[i + 1].ended_at
          });
          i++; // skip next (closing)
        }
      }
      // Only keep the latest period (most recent)
      if (periods.length > 1) {
        periods = periods.slice(-1);
      }
      setPeriods(periods);
      setSelectedPeriod(periods.length > 0 ? periods[0] : null);
    }
    fetchPeriods();
  }, [location]);

  // Fetch products and period-based stock data
  useEffect(() => {
    async function fetchStockPeriod() {
      if (!location || !selectedPeriod) {
        setProducts([]);
        return;
      }
      // Fetch all products (include currency)
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, sku, name, price, standard_price, promotional_price, currency');
      if (productsError || !productsData) {
        setProducts([]);
        return;
      }

      // Fetch opening stocktake entries and aggregate by product_id
      const { data: openingEntriesRaw } = await supabase
        .from('stocktake_entries')
        .select('product_id, qty')
        .eq('stocktake_id', selectedPeriod.opening.id);
      const openingEntries = {};
      (openingEntriesRaw || []).forEach(e => {
        if (!openingEntries[e.product_id]) openingEntries[e.product_id] = 0;
        openingEntries[e.product_id] += Number(e.qty || 0);
      });

      // Fetch closing stocktake entries and aggregate by product_id
      const { data: closingEntriesRaw } = await supabase
        .from('stocktake_entries')
        .select('product_id, qty')
        .eq('stocktake_id', selectedPeriod.closing.id);
      const closingEntries = {};
      (closingEntriesRaw || []).forEach(e => {
        if (!closingEntries[e.product_id]) closingEntries[e.product_id] = 0;
        closingEntries[e.product_id] += Number(e.qty || 0);
      });

      // Fetch transfers in (to this location) during period
      const { data: transferSessions } = await supabase
        .from('stock_transfer_sessions')
        .select('id')
        .eq('to_location', location)
        .gte('created_at', selectedPeriod.started_at)
        .lte('created_at', selectedPeriod.ended_at);
      const transferSessionIds = (transferSessions || []).map(s => s.id);
      let transferInMap = {};
      if (transferSessionIds.length > 0) {
        const { data: transferEntries } = await supabase
          .from('stock_transfer_entries')
          .select('product_id, quantity')
          .in('session_id', transferSessionIds);
        (transferEntries || []).forEach(e => {
          transferInMap[e.product_id] = (transferInMap[e.product_id] || 0) + Number(e.quantity || 0);
        });
      }


      // Fetch sales during period for this location (use sale_date from sales table for filtering)
      let salesMap = {};
      // 1. Get all sales for this location and period
      const { data: sales } = await supabase
        .from('sales')
        .select('id')
        .eq('location_id', location)
        .gte('sale_date', selectedPeriod.started_at)
        .lte('sale_date', selectedPeriod.ended_at);
      const saleIds = (sales || []).map(s => s.id);
      if (saleIds.length > 0) {
        // 2. Get all sales_items for those sales
        const { data: salesItems } = await supabase
          .from('sales_items')
          .select('product_id, quantity, sale_id')
          .in('sale_id', saleIds);
        (salesItems || []).forEach(e => {
          salesMap[e.product_id] = (salesMap[e.product_id] || 0) + Number(e.quantity || 0);
        });
      }

      // Merge all data, only one row per product
      const merged = productsData.map(prod => {
        const opening = openingEntries[prod.id] || 0;
        const transfer = transferInMap[prod.id] || 0;
        const sales = salesMap[prod.id] || 0;
        const closing = closingEntries[prod.id] || 0;
        const expectedStock = opening + transfer - sales;
        const actualStock = closing;
        const variance = actualStock - expectedStock;
        let standard_price = prod.standard_price;
        if (standard_price === undefined || standard_price === null || standard_price === '') {
          standard_price = prod.price !== undefined && prod.price !== null && prod.price !== '' ? prod.price : 0;
        }
        // Amount: variance * promo price if available, else standard price
        let price = (prod.promotional_price !== undefined && prod.promotional_price !== null && prod.promotional_price !== '') ? prod.promotional_price : standard_price;
        let amount = (variance * price);
        return {
          ...prod,
          opening,
          transfer,
          sales,
          closing,
          expectedStock,
          actualStock,
          variance,
          standard_price,
          amount,
        };
      });
      setProducts(merged);
    }
    fetchStockPeriod();
  }, [location, selectedPeriod]);


  // Filter: only show products with non-zero data for this location/period, or matching the search
  const filteredProducts = products.filter(p => {
    const hasData = (
      (p.opening && p.opening !== 0) ||
      (p.transfer && p.transfer !== 0) ||
      (p.sales && p.sales !== 0) ||
      (p.closing && p.closing !== 0) ||
      (p.expectedStock && p.expectedStock !== 0) ||
      (p.actualStock && p.actualStock !== 0) ||
      (p.variance && p.variance !== 0) ||
      (p.amount && p.amount !== 0)
    );
    if (search && search.trim() !== '') {
      const s = search.toLowerCase();
      return (
        (p.name && p.name.toLowerCase().includes(s)) ||
        (p.sku && p.sku.toLowerCase().includes(s))
      );
    }
    return hasData;
  });


  // Export filtered products to PDF with professional layout, all columns, currency, total row, and signature lines
  const handleExportPDF = () => {
    if (!filteredProducts.length) return;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    // Get stocktake id for anti-forgery header (use opening id)
    const stocktakeId = selectedPeriod?.opening?.id || 'N/A';
    // Function to draw anti-forgery header (start/end)
    function drawAntiForgeryHeader(doc, pageWidth, type) {
      doc.setFontSize(11);
      doc.setTextColor(180);
      let headerText = '';
      if (type === 'start') {
        headerText = `start : ${stocktakeId}`;
      } else if (type === 'end') {
        headerText = `------------------- :end`;
      }
      doc.text(headerText, pageWidth / 2, 10, { align: 'center' });
      doc.setTextColor(0);
    }

    // Draw 'start' on first page
    drawAntiForgeryHeader(doc, pageWidth, 'start');

    // Title
    doc.setFontSize(22);
    doc.text('Stocktake Report', pageWidth / 2, y, { align: 'center' });
    y += 10;

    // Sub-header: Location and Period
    doc.setFontSize(12);
    let locationName = locations.find(l => l.id === location)?.name || 'All';
    let periodLabel = selectedPeriod ? `${new Date(selectedPeriod.started_at).toLocaleString()} - ${new Date(selectedPeriod.ended_at).toLocaleString()}` : '';
    doc.text(`Location: ${locationName}`, 14, y);
    doc.text(`Period: ${periodLabel}`, pageWidth - 14, y, { align: 'right' });
    y += 10;


    // Table headers (detailed)
    const tableColumn = [
      'SKU',
      'Product',
      'Opening',
      'Transfer',
      'Sales',
      'Closing',
      'Expected',
      'Actual',
      'Variance',
      'Standard Price',
      'Promotional Price',
      'Amount'
    ];

    // Build a map of product_id to currency from sales_items (use the most recent sale for each product)
    let productCurrencyMap = {};
    // Try to get currency from sales_items for the selected period/location
    // (This is a synchronous block, but in real code, you may want to cache this or fetch with the main query)
    if (filteredProducts.length > 0) {
      // Get all sales for this location and period
      // (Repeat query for currency extraction)
      // This is a synchronous hack for now, but in production, refactor to async and state
      const getCurrencyMap = async () => {
        const { data: sales } = await supabase
          .from('sales')
          .select('id')
          .eq('location_id', location)
          .gte('sale_date', selectedPeriod.started_at)
          .lte('sale_date', selectedPeriod.ended_at);
        const saleIds = (sales || []).map(s => s.id);
        if (saleIds.length > 0) {
          const { data: salesItems } = await supabase
            .from('sales_items')
            .select('product_id, currency, sale_id')
            .in('sale_id', saleIds);
          // Use the most recent sale's currency for each product
          (salesItems || []).forEach(e => {
            if (e.currency && e.product_id) {
              productCurrencyMap[e.product_id] = e.currency;
            }
          });
        }
      };
      // This is a hack: block on the promise (not recommended in production)
      // eslint-disable-next-line no-async-promise-executor
      new Promise(async (resolve) => { await getCurrencyMap(); resolve(); });
    }

    // Table rows
    const tableRows = filteredProducts.map(p => {
      // Use currency from sales_items if available, else fallback to product.currency, else blank
      const currency = productCurrencyMap[p.id] || p.currency || '';
      // If promo price is available, use it for calculation and display, else use standard price
      const hasPromo = p.promotional_price !== undefined && p.promotional_price !== null && p.promotional_price !== '';
      const usePrice = hasPromo
        ? Number(p.promotional_price)
        : (p.standard_price !== undefined && p.standard_price !== null && p.standard_price !== ''
            ? Number(p.standard_price)
            : (p.price !== undefined && p.price !== null && p.price !== '' ? Number(p.price) : 0));
      const amount = (typeof p.variance === 'number' ? p.variance : 0) * usePrice;
      const numStr = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const formattedAmount = currency ? `${currency} ${numStr}` : numStr;
      // For display: if promo price is used, show it, else show standard price
      const standardPrice = hasPromo ? '' : usePrice;
      const promoPrice = hasPromo ? usePrice : '';
      return [
        p.sku || '-',
        p.name || '',
        p.opening || 0,
        p.transfer || 0,
        p.sales || 0,
        p.closing || 0,
        p.expectedStock || 0,
        p.actualStock || 0,
        typeof p.variance === 'number' ? p.variance : 0,
        standardPrice,
        promoPrice,
        formattedAmount
      ];
    });

    // Calculate total amount (sum of all variance amounts, using correct price logic)
    let totalAmount = 0;
    let totalCurrency = '';
    for (let p of filteredProducts) {
      const currency = productCurrencyMap[p.id] || p.currency || '';
      const hasPromo = p.promotional_price !== undefined && p.promotional_price !== null && p.promotional_price !== '';
      const usePrice = hasPromo
        ? Number(p.promotional_price)
        : (p.standard_price !== undefined && p.standard_price !== null && p.standard_price !== ''
            ? Number(p.standard_price)
            : (p.price !== undefined && p.price !== null && p.price !== '' ? Number(p.price) : 0));
      const amount = (typeof p.variance === 'number' ? p.variance : 0) * usePrice;
      totalAmount += amount;
      if (!totalCurrency && currency) totalCurrency = currency;
    }
    const totalNumStr = totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const totalRow = [
      '', 'TOTAL', '', '', '', '', '', '', '', '', '',
      { content: `${totalCurrency ? totalCurrency + ' ' : ''}${totalNumStr}`, styles: { textColor: [255,0,0], fontStyle: 'bold' } }
    ];

    // Use autoTable with advanced options for multi-page, header, and total row
    // Show all header columns fully, no forced wrapping, increase minCellHeight for clarity
    doc.autoTable({
      head: [[
        'SKU',
        'Product',
        'Opening',
        'Transfer',
        'Sales',
        'Closing',
        'Expected Stock',
        'Actual Stock',
        'Variance',
        'Standard Price',
        'Promotional Price',
        'Amount'
      ]],
      body: [...tableRows, totalRow],
      startY: y,
      styles: { fontSize: 10, cellPadding: 2 },
      headStyles: { fillColor: [0, 174, 239], textColor: 255, fontStyle: 'bold', minCellHeight: 14 },
      bodyStyles: { valign: 'middle' },
      columnStyles: {
        11: { textColor: [0,0,0], fontStyle: 'normal' }, // Amount
      },
      didDrawPage: function (data) {
        // Only draw anti-forgery header on first page
        const pageSize = doc.internal.pageSize;
        const pageWidth = pageSize.getWidth();
        if (doc.internal.getCurrentPageInfo().pageNumber === 1) {
          drawAntiForgeryHeader(doc, pageWidth, 'start');
        }
        // Add page numbers at the bottom right
        const pageCount = doc.internal.getNumberOfPages();
        const pageHeight = pageSize.getHeight();
        doc.setFontSize(10);
        doc.setTextColor(0);
        doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${pageCount}`, pageWidth - 20, pageHeight - 10, { align: 'right' });
      },
      margin: { left: 10, right: 10 },
      theme: 'grid',
      willDrawCell: function (data) {
        // Make total row bold and red for amount
        if (data.row.index === tableRows.length && data.column.index === 11) {
          data.cell.styles.textColor = [255,0,0];
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.row.index === tableRows.length) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });

    // Add a new page for signatures
    doc.addPage();
    const sigPageWidth = doc.internal.pageSize.getWidth();
    const sigPageHeight = doc.internal.pageSize.getHeight();
    // Draw 'end' anti-forgery header on last page
    drawAntiForgeryHeader(doc, sigPageWidth, 'end');
    // Page number for signature page
    const sigPageCount = doc.internal.getNumberOfPages();
    doc.setFontSize(10);
    doc.text(`Page ${sigPageCount} of ${sigPageCount}`, sigPageWidth - 20, sigPageHeight - 10, { align: 'right' });

    // Centered header for signature/disclaimer page
    const sigHeaderY = 30;
    doc.setFontSize(18);
    doc.text('Stocktake Authorization & Certification', sigPageWidth / 2, sigHeaderY, { align: 'center' });

    // Signature boxes and name fields (rectangular, smaller, improved alignment)
    const sigBoxWidth = 60; // wider
    const sigBoxHeight = 35; // less tall
    const marginX = 40;
    const topY = sigHeaderY + 18; // space below header
    const labelSpacing = 8;
    const nameLineY = topY + 12;
    const nameLineLength = sigBoxWidth - 10; // longer line
    // Manager (left)
    const managerX = marginX;
    doc.setFontSize(13);
    doc.text('Manager', managerX + sigBoxWidth/2, topY, { align: 'center' });
    doc.setFontSize(11);
    doc.text('Name:', managerX, nameLineY);
    // Connect line to 'Name:' and make it longer
    const nameLabelWidth = doc.getTextWidth('Name: ');
    doc.line(managerX + nameLabelWidth + 2, nameLineY + 1, managerX + nameLabelWidth + 2 + nameLineLength, nameLineY + 1);
    doc.text('Signature:', managerX, nameLineY + labelSpacing + 10);
    doc.rect(managerX, nameLineY + labelSpacing + 12, sigBoxWidth, sigBoxHeight);

    // Director (right)
    const directorX = sigPageWidth - marginX - sigBoxWidth;
    doc.setFontSize(13);
    doc.text('Director', directorX + sigBoxWidth/2, topY, { align: 'center' });
    doc.setFontSize(11);
    doc.text('Name:', directorX, nameLineY);
    // Connect line to 'Name:' and make it longer
    doc.line(directorX + nameLabelWidth + 2, nameLineY + 1, directorX + nameLabelWidth + 2 + nameLineLength, nameLineY + 1);
    doc.text('Signature:', directorX, nameLineY + labelSpacing + 10);
    doc.rect(directorX, nameLineY + labelSpacing + 12, sigBoxWidth, sigBoxHeight);

    // Disclaimer footer
    const disclaimer = [
      'Disclaimer:',
      'The names and signatures provided on this stocktake record are certified as accurate and valid by the undersigned.',
      'By signing above, each party acknowledges that the information recorded is true and correct to the best of their knowledge,',
      'and that their signature constitutes legal acceptance and approval of the stocktake results. These signatures are valid for all',
      'legal and official purposes related to this document.'
    ];
    let discY = sigPageHeight - 80;
    doc.setFontSize(11);
    doc.setTextColor(80);
    disclaimer.forEach((line, i) => {
      doc.text(line, sigPageWidth/2, discY + i*13, { align: 'center' });
    });

    doc.save(`stocktake_report_${location || 'all'}.pdf`);
  };


  // Export filtered products to CSV (only the required columns)
  const handleExportCSV = () => {
    if (!filteredProducts.length) return;
    const header = ['SKU', 'Product', 'Opening', 'Transfer', 'Sales', 'Closing', 'Variance', 'Standard Price', 'Promotional Price'];
    const rows = filteredProducts.map(p => [
      p.sku || '',
      p.name || '',
      p.opening || 0,
      p.transfer || 0,
      p.sales || 0,
      p.closing || 0,
      p.variance || 0,
      (p.standard_price !== undefined && p.standard_price !== null && p.standard_price !== '') ? p.standard_price : (p.price !== undefined && p.price !== null && p.price !== '' ? p.price : 0),
      p.promotional_price !== undefined && p.promotional_price !== null && p.promotional_price !== '' ? p.promotional_price : ''
    ]);
    const csvContent = [header, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stocktake_report_${location || 'all'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <div className="report-page">
      <h2>Stocktake Reports</h2>
      <div className="report-filters stocktake-report-filters">
        <label>
          Location:
          <select
            className="stock-report-select"
            value={location}
            onChange={e => setLocation(e.target.value)}
          >
            <option value="">Select Location</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        {periods.length > 0 && (
          <label style={{ marginLeft: 16 }}>
            Period:
            <select
              className="stock-report-select"
              value={selectedPeriod ? `${selectedPeriod.opening.id}|${selectedPeriod.closing.id}` : ''}
              onChange={e => {
                const [openingId, closingId] = e.target.value.split('|');
                const period = periods.find(p => p.opening.id === openingId && p.closing.id === closingId);
                setSelectedPeriod(period || null);
              }}
            >
              {periods.map(p => (
                <option key={p.opening.id + p.closing.id} value={`${p.opening.id}|${p.closing.id}`}>{
                  `${new Date(p.started_at).toLocaleString()} - ${new Date(p.ended_at).toLocaleString()}`
                }</option>
              ))}
            </select>
          </label>
        )}
        <input
          type="text"
          className="stock-report-search"
          placeholder="Search Products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <table className="report-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product</th>
            <th>Opening</th>
            <th>Transfer</th>
            <th>Sales</th>
            <th>Closing</th>
            <th>Expected Stock</th>
            <th>Actual Stock</th>
            <th>Variance</th>
            <th>Standard Price</th>
            <th>Promotional Price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {filteredProducts.map(p => (
            <tr key={p.id}>
              <td>{(p.sku !== undefined && p.sku !== null && p.sku !== '') ? p.sku : '-'}</td>
              <td>{p.name || ''}</td>
              <td>{p.opening || 0}</td>
              <td>{p.transfer || 0}</td>
              <td>{p.sales || 0}</td>
              <td>{p.closing || 0}</td>
              <td>{p.expectedStock || 0}</td>
              <td>{p.actualStock || 0}</td>
              <td>{typeof p.variance === 'number' ? (p.variance < 0 ? p.variance : p.variance) : 0}</td>
              <td>{(p.standard_price !== undefined && p.standard_price !== null && p.standard_price !== '') ? p.standard_price : (p.price !== undefined && p.price !== null && p.price !== '' ? p.price : 0)}</td>
              <td>{p.promotional_price !== undefined && p.promotional_price !== null && p.promotional_price !== '' ? p.promotional_price : ''}</td>
              <td>{p.amount !== undefined && p.amount !== null ? p.amount.toFixed(2) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="stocktake-export-btns">
        <button
          className="export-btn"
          onClick={handleExportPDF}
        >Export as PDF</button>
        <button
          className="export-btn"
          onClick={handleExportCSV}
        >Export as CSV</button>
      </div>
    </div>
  );
}
export default StocktakeReport;
