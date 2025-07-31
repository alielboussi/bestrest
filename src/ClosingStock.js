import React, { useState, useEffect } from 'react';
import './ClosingStock.css';
import './Products.css';
import supabase from './supabase';
import { useNavigate } from 'react-router-dom';

function ClosingStock() {
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState({}); // { product_id: qty }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  // Fetch units
  useEffect(() => {
    supabase.from('unit_of_measure').select('*').then(({ data }) => {
      setUnits(data || []);
    });
  }, []);

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

  // Only show products when searching
  const filteredProducts = search.trim().length > 0
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
      )
    : [];

  return (
    <div className="products-container">
      <div className="product-form" style={{maxWidth: 700, margin: '2rem auto'}}>
        <h2 className="products-title" style={{marginTop: 0, marginBottom: '1.2rem'}}>Closing Stock</h2>
        <div className="form-row">
          <label style={{minWidth: 120, color: '#e0e6ed', fontWeight: 500, width: '100%', display: 'block'}}>
            Location:
            <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} style={{display: 'block', width: '100%', minWidth: 220, maxWidth: 500, marginTop: 4, fontSize: '1.08rem', padding: '0.5rem 1rem', borderRadius: 7, background: '#181a20', color: '#fff', border: '1.5px solid #00b4d8'}}>
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
            className="products-search-bar"
            style={{marginLeft: 16, flex: 2}}
            disabled={!selectedLocation}
          />
        </div>
        <div className="products-list" style={{marginTop: 0, minWidth: 0, maxHeight: 350, background: '#23272f', borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.12)'}}>
          <table style={{width: '100%', color: '#e0e6ed', background: 'transparent', borderCollapse: 'collapse'}}>
            <thead>
              <tr style={{background: '#23272f'}}>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', textAlign: 'left'}}>Name</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>SKU</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>Unit</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.length === 0 && search.trim() !== '' ? (
                <tr><td colSpan={4} style={{textAlign:'center', color:'#888'}}>No products found.</td></tr>
              ) : (
                filteredProducts.map(product => (
                  <tr key={product.id}>
                    <td>{product.name}</td>
                    <td style={{textAlign:'center'}}>{product.sku}</td>
                    <td style={{textAlign:'center'}}>{units.find(u => u.id === product.unit_of_measure_id)?.name || '-'}</td>
                    <td style={{textAlign:'center'}}>
                      <input
                        type="number"
                        min="0"
                        value={entries[product.id] || ''}
                        onChange={e => handleQtyChange(product.id, e.target.value)}
                        placeholder="Qty"
                        className="qty-input"
                        style={{width: 70}}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {error && <div className="products-error">{error}</div>}
        <div style={{display:'flex', justifyContent:'center'}}>
          <button className="save-btn" onClick={handleSave} disabled={saving} style={{marginTop: 18}}>
            {saving ? 'Saving...' : 'Save Closing Stock'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ClosingStock;
