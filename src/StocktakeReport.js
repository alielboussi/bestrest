
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
      // Only keep the last two periods (most recent)
      if (periods.length > 2) {
        periods = periods.slice(-2);
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
      // Fetch all products
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, sku, name, price, standard_price, promotional_price');
      if (productsError || !productsData) {
        setProducts([]);
        return;
      }

      // Fetch opening stocktake entries
      const { data: openingEntries } = await supabase
        .from('stocktake_entries')
        .select('product_id, qty')
        .eq('stocktake_id', selectedPeriod.opening.id);
      // Fetch closing stocktake entries
      const { data: closingEntries } = await supabase
        .from('stocktake_entries')
        .select('product_id, qty')
        .eq('stocktake_id', selectedPeriod.closing.id);

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

      // Map opening/closing by product
      const openingMap = {};
      (openingEntries || []).forEach(e => {
        openingMap[e.product_id] = Number(e.qty || 0);
      });
      const closingMap = {};
      (closingEntries || []).forEach(e => {
        closingMap[e.product_id] = Number(e.qty || 0);
      });

      // Merge all data
      const merged = productsData.map(prod => {
        const opening = openingMap[prod.id] || 0;
        const transfer = transferInMap[prod.id] || 0;
        const sales = salesMap[prod.id] || 0;
        const closing = closingMap[prod.id] || 0;
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
      // If promo price is available, show it and leave standard price blank
      const showPromo = p.promotional_price !== undefined && p.promotional_price !== null && p.promotional_price !== '';
      const standardPrice = showPromo ? '' : (p.standard_price !== undefined && p.standard_price !== null && p.standard_price !== '' ? p.standard_price : (p.price !== undefined && p.price !== null && p.price !== '' ? p.price : 0));
      const promoPrice = showPromo ? p.promotional_price : '';
      // Format amount as 'K 4,800' or '$ 4,800' (currency before number, with comma)
      let formattedAmount = '';
      if (p.amount !== undefined && p.amount !== null) {
        const num = Number(p.amount);
        const numStr = num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        formattedAmount = currency ? `${currency} ${numStr}` : numStr;
      }
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

    // Calculate total amount (sum of all variance amounts)
    const totalAmount = filteredProducts.reduce((sum, p) => sum + (p.amount || 0), 0);

    // Add total row (bold, red for amount)
    // Use the first available currency from the tableRows, else blank
    let totalCurrency = '';
    for (let row of tableRows) {
      const amt = row[11];
      if (amt && typeof amt === 'string' && amt.trim().length > 0) {
        // Match currency at the start (e.g., 'K 4,800.00')
        const match = amt.match(/^([A-Za-z$]+)/);
        if (match) { totalCurrency = match[1]; break; }
      }
    }
    const totalRow = [
      '', 'TOTAL', '', '', '', '', '', '', '', '', '',
      { content: `${totalCurrency ? totalCurrency + ' ' : ''}${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, styles: { textColor: [255,0,0], fontStyle: 'bold' } }
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
        // Shift header down if needed
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

    // Move signature lines 5cm (50mm) below the last table row
    let finalY = doc.lastAutoTable.finalY || (y + 40);
    finalY += 50;
    doc.setFontSize(13);
    doc.text('Manager', 30, finalY);
    doc.text('Director', pageWidth - 60, finalY);
    doc.setLineWidth(0.5);
    doc.line(20, finalY + 5, 70, finalY + 5); // Manager signature line
    doc.line(pageWidth - 70, finalY + 5, pageWidth - 20, finalY + 5); // Director signature line

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
