








import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import './StockReports.css';

const StockReport = () => {
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [search, setSearch] = useState('');
  const [expandedImage, setExpandedImage] = useState(null);

  useEffect(() => {
    supabase.from('locations').select('id, name').then(({ data }) => setLocations(data || []));
    supabase.from('categories').select('id, name').then(({ data }) => setCategories(data || []));
  }, []);

  useEffect(() => {
    async function fetchStock() {
      // Fetch all products
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('id, sku, name, price, promotional_price, unit_of_measure_id');
      if (productsError || !productsData) {
        setProducts([]);
        return;
      }

      // Fetch product images
      const { data: imagesData, error: imagesError } = await supabase
        .from('product_images')
        .select('product_id, image_url');
      const imageMap = {};
      if (imagesData) {
        imagesData.forEach(img => {
          if (!imageMap[img.product_id]) imageMap[img.product_id] = img.image_url;
        });
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
      // If a location is selected, only show products that have inventory records for that location (even if quantity is 0)
      let productIdsForLocation = null;
      if (location) {
        productIdsForLocation = new Set(inventoryRows.map(row => row.product_id));
      }
      let merged = productsData
        .filter(prod => {
          if (!location) return true;
          return productIdsForLocation.has(prod.id);
        })
        .map(prod => {
          const quantity = inventoryMap[prod.id] || 0;
          let standard_price = prod.standard_price;
          if (standard_price === undefined || standard_price === null || standard_price === '') {
            standard_price = prod.price !== undefined && prod.price !== null && prod.price !== '' ? prod.price : 0;
          }
          return {
            ...prod,
            standard_price,
            quantity,
            image_url: imageMap[prod.id] || null,
          };
        });
      setProducts(merged);
    }
    fetchStock();
  }, [location]);

  // Filter by product name, SKU, and category
  const filteredProducts = products.filter(p => {
    // Category filter
    if (category && String(p.category_id) !== String(category)) return false;
    // Search filter
    if (!search || search.trim() === '') return true;
    const s = search.toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(s)) ||
      (p.sku && p.sku.toLowerCase().includes(s))
    );
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
        <label>
          Category:
          <select
            className="stock-report-select"
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{ marginLeft: 8 }}
          >
            <option value="">All</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
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
                <img
                  src={p.image_url}
                  alt={p.name}
                  className="stock-report-card-img"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setExpandedImage(p.image_url)}
                />
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

      {/* Modal for expanded image */}
      {expandedImage && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setExpandedImage(null)}
        >
          <img
            src={expandedImage}
            alt="Expanded Product"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              borderRadius: '10px',
              boxShadow: '0 0 20px #000',
              background: '#fff',
            }}
            onClick={e => e.stopPropagation()}
          />
          <button
            onClick={() => setExpandedImage(null)}
            style={{
              position: 'fixed',
              top: 30,
              right: 40,
              fontSize: 32,
              background: 'transparent',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              zIndex: 1001,
            }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
};

export default StockReport;
