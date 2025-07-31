







import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import './StockReports.css';



const StockReport = () => {
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');



  useEffect(() => {
    // Fetch locations for filter dropdown
    supabase.from('locations').select('id, name').then(({ data }) => setLocations(data || []));
  }, []);




  useEffect(() => {
    async function fetchStock() {
      // Fetch all products (with SKU, name, standard_price, promotional_price)
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, sku, name, price, standard_price, promotional_price');
      if (productsError || !productsData) {
        setProducts([]);
        return;
      }

      // Fetch inventory, filter by location if selected
      let inventoryRows = [];
      if (!location) {
        const { data, error } = await supabase
          .from('inventory')
          .select('product_id, quantity, location');
        if (!error && data) inventoryRows = data;
      } else {
        const { data, error } = await supabase
          .from('inventory')
          .select('product_id, quantity, location')
          .eq('location', location);
        if (!error && data) inventoryRows = data;
      }

      // Map inventory by product_id
      const inventoryMap = {};
      inventoryRows.forEach(row => {
        if (!inventoryMap[row.product_id]) inventoryMap[row.product_id] = 0;
        inventoryMap[row.product_id] += row.quantity || 0;
      });

      // Always show all products, even if inventory is empty
      const merged = productsData.map(prod => {
        const quantity = inventoryMap[prod.id] || 0;
        // Fallback: use prod.price if standard_price is missing
        let standard_price = prod.standard_price;
        if (standard_price === undefined || standard_price === null || standard_price === '') {
          standard_price = prod.price !== undefined && prod.price !== null && prod.price !== '' ? prod.price : 0;
        }
        return {
          ...prod,
          standard_price,
          quantity,
        };
      });
      setProducts(merged);
    }
    fetchStock();
  }, [location]);


  // Filter by product name or SKU, but always show all products if search is empty
  const filteredProducts = products.filter(p => {
    if (!search || search.trim() === '') return true;
    const s = search.toLowerCase();
    return ((p.name && p.name.toLowerCase().includes(s)) || (p.sku && p.sku.toLowerCase().includes(s)));
  });



  // Export filtered products to CSV (only the required columns)
  const handleExportCSV = () => {
    if (!filteredProducts.length) return;
    const header = ['SKU', 'Product', 'Standard Price', 'Promotional Price', 'Quantity'];
    const rows = filteredProducts.map(p => [
      p.sku || '',
      p.name || '',
      p.standard_price !== undefined ? p.standard_price : '',
      p.promotional_price !== undefined ? p.promotional_price : '',
      p.quantity
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


  // Export filtered products to PDF with signature lines and value calculation
  // (Remove this function if it was not present in the original file)

  return (
    <div className="stock-report-container">
      <h2 className="stock-report-header">Stock Report</h2>

      <div className="stock-report-controls">
        <label>
          Location:
          <select
            className="stock-report-select"
            value={location}
            onChange={e => setLocation(e.target.value)}
          >
            <option value="">All</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        <input
          type="text"
          className="stock-report-search"
          placeholder="Search Products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="stock-report-export-btn" onClick={handleExportCSV}>Export to CSV</button>
      </div>

      <table className="stock-report-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Product</th>
            <th>Standard Price</th>
            <th>Promotional Price</th>
            <th>Quantity</th>
          </tr>
        </thead>
        <tbody>
          {filteredProducts.map(p => (
            <tr key={p.id}>
              <td>{(p.sku !== undefined && p.sku !== null && p.sku !== '') ? p.sku : '-'}</td>
              <td>{p.name || ''}</td>
              <td>{(p.standard_price !== undefined && p.standard_price !== null && p.standard_price !== '') ? p.standard_price : (p.price !== undefined && p.price !== null && p.price !== '' ? p.price : 0)}</td>
              <td>{p.promotional_price !== undefined && p.promotional_price !== null && p.promotional_price !== '' ? p.promotional_price : ''}</td>
              <td>{p.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default StockReport;
