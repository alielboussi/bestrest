








import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import './StockReports.css';

const StockReport = () => {
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('locations').select('id, name').then(({ data }) => setLocations(data || []));
  }, []);

  useEffect(() => {
    async function fetchStock() {
      // Fetch all products (with SKU, name, standard_price, promotional_price, image, unit_of_measure)
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, sku, name, price, standard_price, promotional_price, image_url, unit_of_measure');
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

  return (
    <div className="stock-report-mobile-container">
      <h2 className="stock-report-header">Available Stock</h2>
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
      </div>
      <div className="stock-report-list">
        {filteredProducts.map(p => (
          <div className="stock-report-card" key={p.id}>
            <div className="stock-report-card-img-wrap">
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="stock-report-card-img" />
              ) : (
                <div className="stock-report-card-img-placeholder">No Image</div>
              )}
            </div>
            <div className="stock-report-card-info">
              <div><b>{p.name}</b></div>
              <div>SKU: {p.sku || '-'}</div>
              <div>Unit: {p.unit_of_measure || '-'}</div>
              <div>Stock: <b>{p.quantity}</b></div>
              <div>Standard Price: <b>{p.standard_price}</b></div>
              <div>Promotional Price: <b>{p.promotional_price !== undefined && p.promotional_price !== null && p.promotional_price !== '' ? p.promotional_price : '-'}</b></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default StockReport;
