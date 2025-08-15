// StocktakeReport.js - rebuilt from scratch
// Requirements:
// - Use opening_stock_entries/opening_stock_sessions and closing_stock_entries/closing_stock_sessions
// - For selected location, find most recent complete cycle (latest opening session followed by closing session)
// - Display opening period, closing period, and activity window
// - Aggregate sales, transfers in, opening, closing within window
// - Variance = Opening + Transfers In – Sales – Closing
// - Variance Amount = Variance × Product Standard Price

import React, { useState, useEffect } from 'react';
import { getMaxSetQty, selectPrice, formatAmount } from './utils/setInventoryUtils';
import supabase from './supabase';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import './StocktakeReport.css';

const StocktakeReport = () => {
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState('');
  const [cycle, setCycle] = useState(null); // { openingSession, closingSession }
  const [products, setProducts] = useState([]);
  const [combos, setCombos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch locations
  useEffect(() => {
    supabase.from('locations').select('id, name').then(({ data }) => setLocations(data || []));
  }, []);

  // Fetch most recent complete cycle for selected location
  useEffect(() => {
    if (!location) { setCycle(null); return; }
    async function fetchCycle() {
      setLoading(true);
      // Get latest opening session
      const { data: openingSessions } = await supabase
        .from('opening_stock_sessions')
        .select('id, started_at')
        .eq('location_id', location)
        .order('started_at', { ascending: false });
      const openingSession = (openingSessions || [])[0];
      if (!openingSession) { setCycle(null); setLoading(false); return; }
      // Get first closing session after opening
      const { data: closingSessions } = await supabase
        .from('closing_stock_sessions')
        .select('id, ended_at')
        .eq('location_id', location)
        .gte('ended_at', openingSession.started_at)
        .order('ended_at', { ascending: true });
      const closingSession = (closingSessions || [])[0];
      if (!closingSession) { setCycle(null); setLoading(false); return; }
      setCycle({ openingSession, closingSession });
      setLoading(false);
    }
    fetchCycle();
  }, [location]);

  // Fetch products and aggregate activity for the cycle
  useEffect(() => {
    if (!cycle) { setProducts([]); setCombos([]); setComboItems([]); return; }
    async function fetchReport() {
      setLoading(true);
      // Get all products
      const { data: productsRaw } = await supabase
        .from('products')
        .select('id, sku, name, standard_price, promotional_price');
      // Get all combos
      const { data: combosRaw } = await supabase
        .from('combos')
        .select('id, sku, combo_name, standard_price, combo_price, promotional_price');
      // Get all combo items
      const comboIds = (combosRaw || []).map(c => c.id);
      let comboItemsRaw = [];
      if (comboIds.length > 0) {
        const { data: comboItemsData } = await supabase
          .from('combo_items')
          .select('combo_id, product_id, quantity')
          .in('combo_id', comboIds);
        comboItemsRaw = comboItemsData || [];
      }
      // Get manual inventory adjustments (we will split by type in code)
      const { data: adjustments } = await supabase
        .from('inventory_adjustments')
        .select('product_id, location_id, quantity, adjustment_type, adjusted_at')
        .eq('location_id', location);
      // Get opening stock entries for this opening session
      const { data: openingStock } = await supabase
        .from('opening_stock_entries')
        .select('product_id, qty')
        .eq('session_id', cycle.openingSession.id);
      const openingEntries = openingStock || [];
      // Build opening map from entries, then override with latest manual opening-type adjustments (absolute qty)
      const openingMap = {};
      (openingEntries || []).forEach(e => { openingMap[e.product_id] = Number(e.qty) || 0; });
      // Consider both 'opening' and 'Stock Transfer Qty Adjustment' as opening-type adjustments based on current UI
      const openingAdjLatest = {};
      (adjustments || [])
        .filter(a => a.adjustment_type === 'opening' || a.adjustment_type === 'Stock Transfer Qty Adjustment')
        .forEach(a => {
          const ts = new Date(a.adjusted_at).getTime() || 0;
          const prev = openingAdjLatest[a.product_id];
          if (!prev || ts > prev.ts) {
            openingAdjLatest[a.product_id] = { qty: Number(a.quantity) || 0, ts };
          }
        });
      Object.keys(openingAdjLatest).forEach(pid => {
        openingMap[pid] = openingAdjLatest[pid].qty;
      });
      // Get closing stock
      const { data: closingEntries } = await supabase
        .from('closing_stock_entries')
        .select('product_id, qty')
        .eq('session_id', cycle.closingSession.id);
  // Get transfers in only from Transfer module (stock_transfer_entries) within window
  let transferInMap = {};
      // Also include stock_transfer_entries as before
      const { data: transferSessions } = await supabase
        .from('stock_transfer_sessions')
        .select('id')
        .eq('to_location', location)
        .gte('created_at', cycle.openingSession.started_at)
        .lte('created_at', cycle.closingSession.ended_at);
      const transferSessionIds = (transferSessions || []).map(s => s.id);
      if (transferSessionIds.length > 0) {
        const { data: transferEntries } = await supabase
          .from('stock_transfer_entries')
          .select('product_id, quantity')
          .in('session_id', transferSessionIds);
        (transferEntries || []).forEach(e => {
          transferInMap[e.product_id] = (transferInMap[e.product_id] || 0) + Number(e.quantity || 0);
        });
      }
      // Get sales
      const { data: sales } = await supabase
        .from('sales')
        .select('id, sale_date')
        .eq('location_id', location)
        .gte('sale_date', cycle.openingSession.started_at)
        .lte('sale_date', cycle.closingSession.ended_at);
      const saleIds = (sales || []).map(s => s.id);
      let salesMap = {};
      if (saleIds.length > 0) {
        const { data: salesItems } = await supabase
          .from('sales_items')
          .select('product_id, quantity, sale_id')
          .in('sale_id', saleIds);
        (salesItems || []).forEach(e => {
          salesMap[e.product_id] = (salesMap[e.product_id] || 0) + Number(e.quantity || 0);
        });
      }
      // Layby sales
      const { data: laybys } = await supabase
        .from('laybys')
        .select('id, sale_id, status, updated_at, created_at')
        .not('status', 'eq', 'completed')
        .gte('updated_at', cycle.openingSession.started_at)
        .lte('updated_at', cycle.closingSession.ended_at);
      const laybySaleIdsRaw = (laybys || []).map(l => l.sale_id).filter(Boolean);
      let laybySaleIds = [];
      if (laybySaleIdsRaw.length > 0) {
        const { data: laybySales } = await supabase
          .from('sales')
          .select('id, location_id')
          .in('id', laybySaleIdsRaw);
        laybySaleIds = (laybySales || []).filter(s => s.location_id === location).map(s => s.id);
      }
      if (laybySaleIds.length > 0) {
        const { data: laybyItems } = await supabase
          .from('sales_items')
          .select('product_id, quantity, sale_id')
          .in('sale_id', laybySaleIds);
        (laybyItems || []).forEach(e => {
          salesMap[e.product_id] = (salesMap[e.product_id] || 0) + Number(e.quantity || 0);
        });
      }
      // Build product map for lookup
      const productMap = {};
      (productsRaw || []).forEach(p => { productMap[p.id] = p; });
      // Build combo map for lookup
      const comboMap = {};
      (combosRaw || []).forEach(c => { comboMap[c.id] = c; });
      // Build combo items map
      const comboItemsMap = {};
      (comboItemsRaw || []).forEach(ci => {
        if (!comboItemsMap[ci.combo_id]) comboItemsMap[ci.combo_id] = [];
        comboItemsMap[ci.combo_id].push(ci);
      });
      // Prepare rows: combos first, with their components below
      const rows = [];
      combosRaw.forEach(combo => {
        // Centralized set inventory calculation using combined opening map
        const items = comboItemsMap[combo.id] || [];
        const productStock = { ...openingMap };
        const opening = getMaxSetQty(items, productStock);
        // Compute transfer into sets based on component transfers during window
        let transferSets = 0;
        let possibleSetsTransferred = '';
        if (items.length > 0) {
          const transferStock = {};
          items.forEach(it => { transferStock[it.product_id] = transferInMap[it.product_id] || 0; });
          transferSets = getMaxSetQty(items, transferStock) || 0;
          possibleSetsTransferred = transferSets;
        }
        // Sales for set: processed on the set itself
        const closingStock = closingEntries.find(e => e.product_id === combo.id)?.qty || 0;
        const sales = salesMap[combo.id] || 0;
        const expectedClosing = opening + transferSets - sales;
        const variance = closingStock - expectedClosing;
        const usePrice = selectPrice(combo.promotional_price, combo.standard_price);
        const amount = formatAmount(variance * usePrice);
        rows.push({
          isCombo: true,
          sku: combo.sku,
          name: combo.combo_name,
          opening: opening !== null ? opening : '',
          transfer: transferSets,
          possibleSetsTransferred,
          sales,
          actual: closingStock,
          expectedClosing,
          variance,
          amount,
          standard_price: combo.standard_price || '',
          promotional_price: combo.promotional_price || '',
          highlight: opening === 0,
        });
        // Show component products below, with only SKU and name, rest as '-', add tooltip for set logic
        items.forEach(item => {
          const prod = productMap[item.product_id] || {};
          rows.push({
            isComboComponent: true,
            sku: prod.sku || '-',
            name: prod.name || '-',
            opening: '-',
            transfer: '-',
            sales: '-',
            actual: '-',
            expectedClosing: '-',
            variance: '-',
            amount: '-',
            standard_price: '-',
            tooltip: `This product is a component of set ${combo.combo_name}. Set qty is determined by the lowest available component stock.`,
          });
        });
      });
      // Now show all products not part of any set
      const setComponentIds = Object.values(comboItemsMap).flat().map(ci => ci.product_id);
    (productsRaw || []).forEach(prod => {
        if (!setComponentIds.includes(prod.id)) {
      const opening = openingMap[prod.id] || 0;
      const transfer = transferInMap[prod.id] || 0;
          const sales = salesMap[prod.id] || 0;
          const actual = closingEntries.find(e => e.product_id === prod.id)?.qty || 0;
          const expectedClosing = opening + transfer - sales;
          const variance = actual - expectedClosing;
          const usePrice = selectPrice(prod.promotional_price, prod.standard_price);
          const amount = formatAmount(variance * usePrice);
          rows.push({
            sku: prod.sku,
            name: prod.name,
            opening,
            transfer,
            sales,
            expectedClosing,
            actual,
            variance,
            amount,
            standard_price: prod.standard_price || 0,
            promotional_price: prod.promotional_price || '',
          });
        }
      });
      setProducts(rows);
      setCombos(combosRaw);
      setComboItems(comboItemsRaw);
      setLoading(false);
    }
    fetchReport();
  }, [cycle, location]);

  // Export as PDF
  const handleExportPDF = () => {
    if (!products.length) return;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;
    // Add logo (bestrest-logo.png from /public)
    const logoImg = new Image();
    logoImg.src = window.location.origin + '/bestrest-logo.png';
    logoImg.onload = function() {
      // 1. Logo at top center
      doc.addImage(logoImg, 'PNG', pageWidth/2 - 20, y, 40, 18);
      y += 26;
      // 2. Header below logo
      doc.setFontSize(22);
      doc.text('Stocktake Report', pageWidth / 2, y, { align: 'center' });
      y += 14;
      // 3. Company details left-aligned, spaced below header
      doc.setFontSize(12);
      let companyDetails = '';
      if (window.companySettings) {
        const cs = window.companySettings;
        companyDetails = `${cs.company_name || ''}\n${cs.company_address || ''}\n${cs.company_phone || ''}\n${cs.company_email || ''}\nTPIN: ${cs.company_tpin || ''}`;
      }
      if (companyDetails) {
        const detailsArr = companyDetails.split('\n');
        detailsArr.forEach(line => {
          doc.text(line, 14, y);
          y += 8;
        });
        y += 4;
      }
      // 4. Location and period info
      doc.text(`Location: ${locations.find(l => l.id === location)?.name || ''}`, 14, y);
      y += 8;
      if (cycle) {
        doc.text(`Opening: ${new Date(cycle.openingSession.started_at).toLocaleString()}`, 14, y);
        doc.text(`Closing: ${new Date(cycle.closingSession.ended_at).toLocaleString()}`, pageWidth - 14, y, { align: 'right' });
        y += 8;
      }
      y += 6;
      // 5. Table: only renderedRows, no duplicates
      const tableColumn = [
        'SKU', 'Product', 'Opening', 'Transfer In', 'Sales', 'Expected Closing', 'Actual', 'Standard Price', 'Promotional Price', 'Variance', 'Amount'
      ];
      const tableRows = renderedRows.map(row => [
        row.sku,
        row.name,
        row.opening,
        row.transfer,
        row.sales,
        row.expectedClosing,
        row.actual,
        row.standard_price,
        row.promotional_price || '',
        row.variance,
        row.amount
      ]);
      // Reduce column widths for better fit
      const columnStyles = {};
      tableColumn.forEach((col, i) => { columnStyles[i] = { cellWidth: 22 }; });
      doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: y,
        styles: { fontSize: 10, cellPadding: 2 },
        headStyles: { fillColor: [0, 174, 239], textColor: 255, fontStyle: 'bold', minCellHeight: 14 },
        bodyStyles: { valign: 'middle', fillColor: [230, 255, 230] },
        theme: 'grid',
        margin: { left: 10, right: 10 },
      });

      // Add disclaimer page after the table
      doc.addPage('a4', 'landscape');
      let dy = 20;
      // Logo at top center
      doc.addImage(logoImg, 'PNG', pageWidth/2 - 20, dy, 40, 18);
      dy += 26;
      // Company details
      doc.setFontSize(14);
      if (companyDetails) {
        const detailsArr = companyDetails.split('\n');
        detailsArr.forEach(line => {
          doc.text(line, 14, dy);
          dy += 8;
        });
        dy += 4;
      }
      // Disclaimer header
      doc.setFontSize(18);
      doc.text('Disclaimer', pageWidth / 2, dy, { align: 'center' });
      dy += 12;
      doc.setFontSize(12);
      const disclaimerText = `We, the undersigned, confirm that the stocktake report above has been completed in accordance with company procedures. To the best of our knowledge and belief, the quantities, descriptions, and valuations recorded are true, correct, and represent the physical stock on hand as at the date/time stated. Any variances or adjustments have been reviewed, justified, and recorded.\n\nWe acknowledge that this confirmation may be relied upon for financial reporting, audit, and internal control purposes and that any material misstatement or omission is subject to company policy and applicable law.\n\nNotes / Exceptions (if any):`;
      doc.text(disclaimerText, 14, dy, { maxWidth: pageWidth - 28 });
      dy += 54;
  // Signatures side by side
  doc.setFontSize(14);
  doc.text('Signatures', 14, dy);
  dy += 10;
  doc.setFontSize(12);
  // Manager box
  const boxWidth = (pageWidth - 40) / 2;
  doc.text('Manager', 14, dy);
  doc.rect(14, dy + 6, boxWidth, 16); // Empty box for signature
  doc.text('Name (print): ____________________________________', 14, dy + 26);
  doc.text('Title: ____________________', 14, dy + 34);
  doc.text('Date: ____ / ____ / ______   Time: ________', 14, dy + 42);
  // Director box
  const directorX = 14 + boxWidth + 12;
  doc.text('Director', directorX, dy);
  doc.rect(directorX, dy + 6, boxWidth, 16); // Empty box for signature
  doc.text('Name (print): ____________________________________', directorX, dy + 26);
  doc.text('Title: ____________________', directorX, dy + 34);
  doc.text('Date: ____ / ____ / ______   Time: ________', directorX, dy + 42);
  dy += 54;
      // Company stamp box
      doc.text('Company Stamp (optional):', 14, dy);
      dy += 6;
      doc.rect(14, dy, 60, 28);
      doc.text('STAMP AREA', 44, dy + 16, { align: 'center' });

      doc.save(`stocktake_report_${location || 'all'}.pdf`);
    };
    // Fetch company settings from supabase and set to window.companySettings if not already
    if (!window.companySettings) {
      supabase.from('company_settings').select('*').single().then(({ data }) => {
        window.companySettings = data || {};
        logoImg.src = window.location.origin + '/bestrest-logo.png'; // re-trigger onload
      });
    } else {
      logoImg.src = window.location.origin + '/bestrest-logo.png'; // trigger onload
    }
  };

  // Deduplicate set rows and render table
  let renderedRows = [];
  let seenCombos = new Set();
  products.forEach((row, idx) => {
    if (row.isCombo) {
      if (seenCombos.has(row.sku)) return;
      seenCombos.add(row.sku);
      renderedRows.push(row);
    } else if (row.isComboComponent) {
      renderedRows.push(row);
    } else if (!row.isCombo) {
      // Only render non-combo products that are not combos themselves
      if (!seenCombos.has(row.sku)) {
        renderedRows.push(row);
      }
    }
  });

  return (
    <div className="report-page stocktake-bg">
      <h2 className="stocktake-title">Stocktake Report</h2>
      <div className="stocktake-report-filters">
        <label>Location:
          <select value={location} onChange={e => setLocation(e.target.value)} className="stocktake-select">
            <option value="">Select Location</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
  <button className="export-btn" onClick={handleExportPDF} style={{marginTop: '-10mm'}}>Export as PDF</button>
      </div>
      {cycle && (
        <table className="stocktake-table" style={{marginBottom: 18, width: 'auto', minWidth: 420}}>
          <thead>
            <tr>
              <th colSpan={2} style={{textAlign: 'center'}}>Period Info</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Opening Period</td>
              <td>{new Date(cycle.openingSession.started_at).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Closing Period</td>
              <td>{new Date(cycle.closingSession.ended_at).toLocaleString()}</td>
            </tr>
            <tr>
              <td>Activity Window</td>
              <td>{new Date(cycle.openingSession.started_at).toLocaleString()} - {new Date(cycle.closingSession.ended_at).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      )}
      <table className="report-table stocktake-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product</th>
            <th>Opening</th>
            <th>Transfer In</th>
            <th title="Possible sets transferred based on product transfers">Possible Sets Transferred</th>
            <th>Sales</th>
            <th>Expected Closing</th>
            <th>Actual</th>
            <th>Standard Price</th>
            <th>Promotional Price</th>
            <th>Variance</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {renderedRows.map((row, idx) => (
            <tr key={idx} className={row.isCombo ? (row.highlight ? 'combo-row highlight-row' : 'combo-row') : row.isComboComponent ? 'combo-comp-row' : ''} title={row.tooltip || ''}>
              <td>{row.sku}</td>
              <td>{row.name}</td>
              <td>{row.opening}</td>
              <td>{row.transfer}</td>
              <td>{row.possibleSetsTransferred || ''}</td>
              <td>{row.sales}</td>
              <td>{row.expectedClosing}</td>
              <td>{row.actual}</td>
              <td>{row.standard_price}</td>
              <td>{row.promotional_price || ''}</td>
              <td>{row.variance}</td>
              <td>{row.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {loading && <div className="stocktake-loading">Loading...</div>}
    </div>
  );
};

export default StocktakeReport;