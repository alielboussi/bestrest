import React, { useState, useEffect } from 'react';
import './ClosingStock.css';
import supabase from './supabase';
import { useNavigate } from 'react-router-dom';

function ClosingStock() {
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState({}); // { product_id: qty }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Fetch locations
  useEffect(() => {
    supabase.from('locations').select('*').then(({ data }) => {
      setLocations(data || []);
    });
  }, []);

  // Fetch products for selected location
  useEffect(() => {
    if (!selectedLocation) return;
    supabase
      .from('products')
      .select('id, name, sku, unit_of_measure_id')
      .then(({ data }) => {
        setProducts(data || []);
      });
  }, [selectedLocation]);

  // Handle qty change
  const handleQtyChange = (productId, qty) => {
    setEntries({ ...entries, [productId]: qty });
  };

  // Save closing stock
  const handleSave = async () => {
    if (!selectedLocation) {
      setError('Please select a location.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Create closing stocktake
      const { data: stocktake, error: stError } = await supabase
        .from('stocktakes')
        .insert([
          {
            location_id: selectedLocation,
            user_id: JSON.parse(localStorage.getItem('user')).id,
            started_at: new Date().toISOString(),
            ended_at: new Date().toISOString(),
            type: 'closing',
            name: `Closing Stock - ${new Date().toLocaleDateString()}`
          }
        ])
        .select()
        .single();
      if (stError) throw stError;
      // Prepare entries: all products, qty from entries or 0
      const stockEntries = products.map(p => ({
        stocktake_id: stocktake.id,
        product_id: p.id,
        qty: Number(entries[p.id]) || 0
      }));
      // Insert stocktake_entries
      const { error: seError } = await supabase
        .from('stocktake_entries')
        .insert(stockEntries);
      if (seError) throw seError;
      // Update inventory for each product at location
      for (const entry of stockEntries) {
        await supabase
          .from('inventory')
          .upsert({
            product_id: entry.product_id,
            location: selectedLocation,
            quantity: entry.qty,
            updated_at: new Date().toISOString()
          }, { onConflict: ['product_id', 'location'] });
      }
      setSaving(false);
      navigate('/dashboard');
    } catch (err) {
      setError('Error saving closing stock.');
      setSaving(false);
    }
  };

  // Filtered products
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="closing-stock-container">
      <h2 className="closing-stock-title">Closing Stock</h2>
      <button className="back-dashboard-btn" onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      <div className="closing-stock-form">
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
          type="text"
          placeholder="Search products by name or SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="product-search-input"
        />
        <div className="product-list">
          {filteredProducts.map(product => (
            <div key={product.id} className="product-row">
              <span className="product-name">{product.name}</span>
              <input
                type="number"
                min="0"
                value={entries[product.id] || ''}
                onChange={e => handleQtyChange(product.id, e.target.value)}
                placeholder="Qty"
                className="qty-input"
              />
            </div>
          ))}
        </div>
        {error && <div className="error-message">{error}</div>}
        <button className="save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Closing Stock'}
        </button>
      </div>
    </div>
  );
}

export default ClosingStock;
