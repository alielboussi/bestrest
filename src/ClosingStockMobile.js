import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import './ClosingStock.css';

function ClosingStockMobile() {
  const [password, setPassword] = useState('');
  const [passwordOk, setPasswordOk] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);

  // Password check
  const checkPassword = async () => {
    setPasswordError('');
    const { data, error } = await supabase
      .from('mobile_closing_stock_access')
      .select('password')
      .order('id', { ascending: false })
      .limit(1)
      .single();
    if (error || !data) {
      setPasswordError('Could not verify password.');
      return;
    }
    if (password === data.password) {
      setPasswordOk(true);
    } else {
      setPasswordError('Incorrect password.');
    }
  };

  // Fetch units
  useEffect(() => {
    if (!passwordOk) return;
    supabase.from('unit_of_measure').select('*').then(({ data }) => {
      setUnits(data || []);
    });
  }, [passwordOk]);

  // Fetch locations
  useEffect(() => {
    if (!passwordOk) return;
    supabase.from('locations').select('*').then(({ data }) => {
      setLocations(data || []);
    });
  }, [passwordOk]);

  // Fetch products for selected location
  useEffect(() => {
    if (!selectedLocation || !passwordOk) return;
    supabase
      .from('product_locations')
      .select('product_id, products(id, name, sku, unit_of_measure_id)')
      .eq('location_id', selectedLocation)
      .then(({ data }) => {
        setProducts((data || []).map(row => row.products));
      });
    setSearch('');
  }, [selectedLocation, passwordOk]);

  // Build confirmation table rows
  const confirmRows = products
    .filter(p => entries[p.id] && Number(entries[p.id]) > 0)
    .map(p => ({
      name: p.name,
      sku: p.sku,
      unit: units.find(u => u.id === p.unit_of_measure_id)?.name || '-',
      qty: entries[p.id]
    }));

  // Only show products matching the search term
  const filteredProducts = search.trim().length > 0
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
      )
    : [];

  if (!passwordOk) {
    return (
      <div className="closing-stock-container">
        <div className="closing-stock-form">
          <h2 className="closing-stock-title">Mobile Closing Stock</h2>
          <input
            type="password"
            placeholder="Enter access password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ width: '100%', padding: 12, fontSize: '1.1em', borderRadius: 7, marginBottom: 12 }}
          />
          <button
            className="save-btn"
            style={{ width: '100%' }}
            onClick={checkPassword}
          >
            Access
          </button>
          {passwordError && <div style={{ color: '#ff4d4d', marginTop: 10 }}>{passwordError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="closing-stock-container">
      <div className="closing-stock-form">
        <h2 className="closing-stock-title">Mobile Closing Stock</h2>
        <label>
          Location:
          <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}>
            <option value="">Select Location</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </label>
        <input
          className="product-search-input"
          type="text"
          placeholder="Search products by name or SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          disabled={!selectedLocation}
        />
        <div className="product-list">
          {filteredProducts.length === 0 && (
            <div style={{ color: '#aaa', padding: '1.2rem', textAlign: 'center' }}>
              {selectedLocation ? 'No products found.' : 'Select a location to begin.'}
            </div>
          )}
          {filteredProducts.map(prod => (
            <div className="product-row" key={prod.id}>
              <div className="product-name">
                <b>{prod.name}</b> <span style={{ color: '#00bfff', fontSize: '0.95em' }}>({prod.sku})</span>
                <div style={{ fontSize: '0.95em', color: '#aaa' }}>Unit: {units.find(u => u.id === prod.unit_of_measure_id)?.name || '-'}</div>
              </div>
              <input
                className="qty-input"
                type="number"
                min="0"
                value={entries[prod.id] || ''}
                onChange={e => {
                  const val = e.target.value;
                  setEntries(prev => ({ ...prev, [prod.id]: val === '' ? '' : Math.max(0, Number(val)) }));
                }}
                placeholder="Qty"
                style={{ width: 80, marginLeft: 12 }}
              />
            </div>
          ))}
        </div>
        {/* Save/Confirm section, confirmation modal, and rest of logic can be copied from desktop version as needed */}
      </div>
    </div>
  );
}

export default ClosingStockMobile;
