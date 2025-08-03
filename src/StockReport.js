import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import './StockReports.css';

const StockReport = () => {

  // State for filters and data
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [expandedImage, setExpandedImage] = useState(null);
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [productLocations, setProductLocations] = useState([]);

  // Fetch locations, categories, and products
  useEffect(() => {
    const fetchData = async () => {
      const { data: locs } = await supabase.from('locations').select('*');
      setLocations(locs || []);
      const { data: cats } = await supabase.from('categories').select('*');
      setCategories(cats || []);
      const { data: prods } = await supabase.from('products').select('*');
      setProducts(prods || []);
      const { data: prodLocs } = await supabase.from('product_locations').select('*');
      setProductLocations(prodLocs || []);
    };
    fetchData();
  }, []);

  // Filter products
  const filteredProducts = products.filter(p => {
    // Find all location_ids for this product
    const productLocs = productLocations.filter(pl => pl.product_id === p.id);
    const locationIds = productLocs.map(pl => pl.location_id);
    const matchesLocation = !location || locationIds.includes(location);
    const matchesCategory = !category || p.category_id === Number(category);
    const searchValue = search.trim().toLowerCase();
    const matchesSearch = !searchValue || (
      (p.name && p.name.toLowerCase().includes(searchValue)) ||
      (p.sku && p.sku.toLowerCase().includes(searchValue))
    );
    return matchesLocation && matchesCategory && matchesSearch;
  });

  return (
    <div className="stock-report-container">
      <div className="stock-report-filters">
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
                <div>Standard Price: <b>{p.price !== undefined && p.price !== null && p.price !== '' ? (p.currency ? `${p.currency} ` : '') + p.price : '-'}</b></div>
                <div>Promotional Price: <b>{p.promotional_price !== undefined && p.promotional_price !== null && p.promotional_price !== '' ? (p.currency ? `${p.currency} ` : '') + p.promotional_price : '-'}</b></div>
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
