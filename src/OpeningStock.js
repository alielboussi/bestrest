import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from './supabase';
import './OpeningStock.css';

const OpeningStock = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: select location, 2: enter name, 3: stocktake
  const [locations, setLocations] = useState([]);
  const [allProducts, setAllProducts] = useState([]); // all products at location
  const [products, setProducts] = useState([]); // filtered products for search
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [userName, setUserName] = useState('');
  const [stockRows, setStockRows] = useState([]); // {product_id, qty}
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [startedAt, setStartedAt] = useState(null);

  React.useEffect(() => {
    supabase.from('locations').select('id, name').then(({ data }) => setLocations(data || []));
  }, []);

  const handleLocationSelect = async (e) => {
    setSelectedLocation(e.target.value);
    setStep(2);
  };

  const handleNameSubmit = async (e) => {
    e.preventDefault();
    if (!userName) return setError('Name required');
    setError('');
    // Fetch all products for this location
    const { data: productLocs } = await supabase.from('product_locations').select('product_id').eq('location_id', selectedLocation);
    const productIds = (productLocs || []).map(pl => pl.product_id);
    const { data: productsData } = await supabase.from('products').select('id, name, sku').in('id', productIds);
    setAllProducts(productsData || []);
    setProducts(productsData || []);
    setStockRows([]);
    setStartedAt(new Date());
    setStep(3);
  };

  const handleQtyChange = (product_id, qty) => {
    setStockRows(rows => {
      const exists = rows.find(r => r.product_id === product_id);
      if (exists) {
        return rows.map(r => r.product_id === product_id ? { ...r, qty } : r);
      } else {
        const prod = allProducts.find(p => p.id === product_id);
        return [...rows, { product_id, qty, name: prod?.name, sku: prod?.sku }];
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      // Find user by name (or use current user if available)
      let userId = null;
      const { data: users } = await supabase.from('users').select('id, full_name').ilike('full_name', `%${userName}%`);
      if (users && users.length > 0) userId = users[0].id;
      // Create stocktake session (opening)
      const { data: stocktake, error: stError } = await supabase.from('stocktakes').insert({
        location_id: selectedLocation,
        user_id: userId,
        name: userName,
        started_at: startedAt,
        ended_at: new Date(),
        type: 'opening'
      }).select().single();
      if (stError) throw stError;
      // Insert stocktake entries for entered products
      const entries = stockRows.map(r => ({ stocktake_id: stocktake.id, product_id: r.product_id, qty: r.qty }));
      const { error: seError } = await supabase.from('stocktake_entries').insert(entries);
      if (seError) throw seError;
      // Overwrite inventory for this location
      // 1. Set entered products to their qty
      for (const r of stockRows) {
        const { data: inv } = await supabase.from('inventory').select('id').eq('product_id', r.product_id).eq('location', selectedLocation).single();
        if (inv) {
          await supabase.from('inventory').update({ quantity: r.qty, updated_at: new Date() }).eq('id', inv.id);
        } else {
          await supabase.from('inventory').insert({ product_id: r.product_id, location: selectedLocation, quantity: r.qty, updated_at: new Date() });
        }
      }
      // 2. Set all other products at this location to 0
      const enteredIds = stockRows.map(r => r.product_id);
      const zeroProducts = allProducts.filter(p => !enteredIds.includes(p.id));
      for (const p of zeroProducts) {
        const { data: inv } = await supabase.from('inventory').select('id').eq('product_id', p.id).eq('location', selectedLocation).single();
        if (inv) {
          await supabase.from('inventory').update({ quantity: 0, updated_at: new Date() }).eq('id', inv.id);
        } else {
          await supabase.from('inventory').insert({ product_id: p.id, location: selectedLocation, quantity: 0, updated_at: new Date() });
        }
      }
      navigate('/dashboard');
    } catch (err) {
      setError('Failed to save opening stock.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="stocktake-container">
      <h1>Stocktake / Opening Stock</h1>
      {step === 1 && (
        <div className="stocktake-step">
          <label>Select Location:</label>
          <select value={selectedLocation} onChange={handleLocationSelect} required>
            <option value="">-- Select --</option>
            {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
        </div>
      )}
      {step === 2 && (
        <form className="stocktake-step" onSubmit={handleNameSubmit}>
          <label>Enter Your Name:</label>
          <input type="text" value={userName} onChange={e => setUserName(e.target.value)} required />
          <button type="submit">Start Stocktake</button>
        </form>
      )}
      {step === 3 && (
        <div className="stocktake-step">
          {/* Debug info - remove after testing */}
          <div style={{ color: 'yellow', background: '#222', padding: 8, marginBottom: 8 }}>
            <div>DEBUG: allProducts.length = {allProducts.length}</div>
            <div>DEBUG: search = '{search}'</div>
            <div>DEBUG: Matching products = {search.trim().length >= 2 ? allProducts.filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(search.trim().toLowerCase()))).length : 0}</div>
          </div>
          <h2>Location: {locations.find(l => l.id === selectedLocation)?.name}</h2>
          <h3>Stocktaker: {userName}</h3>
          <label>Search Product:</label>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or SKU"
          />
          <table className="stocktake-table">
            <thead>
              <tr><th>Product</th><th>SKU</th><th>Qty</th></tr>
            </thead>
            <tbody>
              {search.trim().length >= 2 && allProducts
                .filter(p =>
                  p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
                  (p.sku && p.sku.toLowerCase().includes(search.trim().toLowerCase()))
                )
                .map(p => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td>{p.sku}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        value={stockRows.find(r => r.product_id === p.id)?.qty || ''}
                        onChange={e => handleQtyChange(p.id, e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16 }}>
            <h4>Selected Products for Opening Stock:</h4>
            <table className="stocktake-table">
              <thead>
                <tr><th>Product</th><th>SKU</th><th>Qty</th></tr>
              </thead>
              <tbody>
                {stockRows.map(r => (
                  <tr key={r.product_id}>
                    <td>{r.name}</td>
                    <td>{r.sku}</td>
                    <td>{r.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={handleSave} disabled={saving}>Save Opening Stock</button>
        </div>
      )}
      {error && <div className="stocktake-error">{error}</div>}
    </div>
  );
};

export default OpeningStock;
