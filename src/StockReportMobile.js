import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import './StockReportMobile.css';

const StockReportMobile = () => {
  const [products, setProducts] = useState([]);
  const [productLocations, setProductLocations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [units, setUnits] = useState([]);
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const { data: prods } = await supabase.from('products').select('*');
      setProducts(prods || []);
      const { data: prodLocs } = await supabase.from('product_locations').select('*');
      setProductLocations(prodLocs || []);
      const { data: locs } = await supabase.from('locations').select('*');
      setLocations(locs || []);
      const { data: cats } = await supabase.from('categories').select('*');
      setCategories(cats || []);
      const { data: inv } = await supabase.from('inventory').select('*');
      setInventory(inv || []);
      const { data: unitData } = await supabase.from('unit_of_measure').select('*');
      setUnits(unitData || []);
    };
    fetchData();
  }, []);

  const filteredProducts = products.filter(p => {
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
    <div className="stock-report-mobile-container">
      <div className="stock-report-mobile-filters">
        <select
          className="stock-report-mobile-select"
          value={location}
          onChange={e => setLocation(e.target.value)}
        >
          <option value="">All Locations</option>
          {locations.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
        <select
          className="stock-report-mobile-select"
          value={category}
          onChange={e => setCategory(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="text"
          className="stock-report-mobile-search"
          placeholder="Search Products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="stock-report-mobile-list">
        {filteredProducts.map(p => {
          // Find the correct unit name/abbreviation
          let unit = '';
          if (p.unit_of_measure_id) {
            const unitObj = units.find(u => u.id === p.unit_of_measure_id);
            unit = unitObj ? (unitObj.abbreviation || unitObj.name || '') : '';
          }
          // Find the correct stock quantity for this product at the selected location
          let stockQty = 0;
          if (location) {
            const inv = inventory.find(i => i.product_id === p.id && i.location === location);
            stockQty = inv ? inv.quantity : 0;
          } else {
            // Sum across all locations
            const invs = inventory.filter(i => i.product_id === p.id);
            stockQty = invs.reduce((sum, i) => sum + (i.quantity || 0), 0);
          }
          return (
            <div className="stock-report-mobile-card" key={p.id}>
              <div className="stock-report-mobile-card-img-wrap">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="stock-report-mobile-card-img"
                  />
                ) : (
                  <div className="stock-report-mobile-card-img-placeholder">No Image</div>
                )}
              </div>
              <div className="stock-report-mobile-card-info">
                <div className="stock-report-mobile-card-title">{p.name}</div>
                <div className="stock-report-mobile-card-sku">SKU: {p.sku || '-'}</div>
                <div>Stock: <b>{stockQty}</b> {unit}</div>
                <div>Standard Price: <b>{p.price !== undefined && p.price !== null && p.price !== '' ? (p.currency ? `${p.currency} ` : '') + p.price : '-'}</b></div>
                <div>Promotional Price: <b>{p.promotional_price !== undefined && p.promotional_price !== null && p.promotional_price !== '' ? (p.currency ? `${p.currency} ` : '') + p.promotional_price : '-'}</b></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StockReportMobile;
