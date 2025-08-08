import React, { useState, useEffect } from 'react';
import { getMaxSetQty, selectPrice, formatAmount } from './utils/setInventoryUtils';
import { useNavigate } from 'react-router-dom';
import supabase from './supabase';
import './OpeningStock.css';
// Removed user permissions logic

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
  const [sessionId, setSessionId] = useState(null);
  const [resuming, setResuming] = useState(false);
  const [success, setSuccess] = useState('');
  // Add missing state for product selection and quantity input
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showQtyInput, setShowQtyInput] = useState(false);
  const [qtyInput, setQtyInput] = useState('');
  // Removed user permissions state

  React.useEffect(() => {
    supabase.from('locations').select('id, name').then(({ data }) => setLocations(data || []));
  }, []);

  // Removed permissions fetching logic

  // Removed permission helpers
  const canAdd = true;
  const canEdit = true;
  const canDelete = true;

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

    // Resume open session if exists for this user/location
    setResuming(true);
    let userId = null;
    const { data: users } = await supabase.from('users').select('id, full_name').ilike('full_name', `%${userName}%`);
    if (users && users.length > 0) userId = users[0].id;
    const { data: session, error: sessionError } = await supabase
      .from('opening_stock_sessions')
      .select('*')
      .eq('location_id', selectedLocation)
      .eq('user_id', userId)
      .eq('status', 'open')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessionError) {
      setError('Error checking for open session.');
      setResuming(false);
      setStep(3);
      return;
    }
    if (session) {
      setSessionId(session.id);
      // Load previous entries
      const { data: prevEntries } = await supabase
        .from('opening_stock_entries')
        .select('product_id, qty')
        .eq('session_id', session.id);
      if (prevEntries) {
        setStockRows(prevEntries.map(e => ({ product_id: e.product_id, qty: e.qty, name: productsData.find(p => p.id === e.product_id)?.name, sku: productsData.find(p => p.id === e.product_id)?.sku })));
      }
    } else {
      setSessionId(null);
      setStockRows([]);
    }
    setResuming(false);
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
    setSuccess('');
    try {
      // Find user by name (or use current user if available)
      let userId = null;
      const { data: users } = await supabase.from('users').select('id, full_name').ilike('full_name', `%${userName}%`);
      if (users && users.length > 0) userId = users[0].id;

      // 1. Find or create opening stock session for this user/location
      let sid = sessionId;
      const now = new Date().toISOString();
      if (!sid) {
        // Create new session
        const { data: newSession, error: newSessionError } = await supabase
          .from('opening_stock_sessions')
          .insert({
            user_id: userId,
            location_id: selectedLocation,
            started_at: now,
            status: 'open'
          })
          .select()
          .single();
        if (newSessionError) throw newSessionError;
        sid = newSession.id;
        setSessionId(sid);
      }

      // 2. Delete previous entries for this session
      await supabase.from('opening_stock_entries').delete().eq('session_id', sid);

      // 3. Insert all product entries for opening stock
      const rows = stockRows.map(row => ({
        session_id: sid,
        product_id: row.product_id,
        qty: Number(row.qty),
        stocktake_conductor: userName
      }));
      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('opening_stock_entries').insert(rows);
        if (insertError) throw insertError;
      }

      // 4. Mark session as closed
      await supabase.from('opening_stock_sessions').update({ status: 'closed', ended_at: now }).eq('id', sid);
      setSessionId(null);
      setSuccess('Session paused. You can resume later.');

      // 5. Overwrite inventory for this location
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

      // 3. After updating inventory for all products, recalculate and update inventory for each set (combo) product
      // This ensures that the inventory table reflects the correct quantity for each set, based on the available stock of its components
      const { data: combos } = await supabase.from('combos').select('id, product_id');
      const { data: comboItems } = await supabase.from('combo_items').select('combo_id, product_id, quantity');
      const { data: invData } = await supabase.from('inventory').select('product_id, quantity').eq('location', selectedLocation);
      // Build product stock map for this location
      const productStock = {};
      (invData || []).forEach(i => {
        productStock[i.product_id] = i.quantity;
      });
      // For each combo, calculate max possible sets and update inventory for set product
      for (const combo of combos || []) {
        const items = (comboItems || []).filter(ci => ci.combo_id === combo.id);
        if (items.length === 0) continue;
        const setQty = getMaxSetQty(items, productStock);
        // Insert or update inventory for the set product (combo)
        if (combo.product_id) {
          const { data: setInv } = await supabase.from('inventory').select('id').eq('product_id', combo.product_id).eq('location', selectedLocation).single();
          if (setInv) {
            await supabase.from('inventory').update({ quantity: setQty, updated_at: new Date() }).eq('id', setInv.id);
          } else {
            await supabase.from('inventory').insert({ product_id: combo.product_id, location: selectedLocation, quantity: setQty, updated_at: new Date() });
          }
        }
        // Optionally update combo_inventory for reporting
        const { data: comboInv } = await supabase.from('combo_inventory').select('id').eq('combo_id', combo.id).eq('location_id', selectedLocation).single();
        if (comboInv) {
          await supabase.from('combo_inventory').update({ quantity: setQty, updated_at: new Date() }).eq('id', comboInv.id);
        } else {
          await supabase.from('combo_inventory').insert({ combo_id: combo.id, location_id: selectedLocation, quantity: setQty, updated_at: new Date() });
        }
      }
    } catch (err) {
      setError('Failed to save opening stock.');
    } finally {
      setSaving(false);
    }
  };

  // Submit handler to finalize opening stock
  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      let userId = null;
      const { data: users } = await supabase.from('users').select('id, full_name').ilike('full_name', `%${userName}%`);
      if (users && users.length > 0) userId = users[0].id;
      let sid = sessionId;
      const now = new Date().toISOString();
      if (!sid) {
        // Create new session
        const { data: newSession, error: newSessionError } = await supabase
          .from('opening_stock_sessions')
          .insert({
            user_id: userId,
            location_id: selectedLocation,
            started_at: now,
            status: 'open'
          })
          .select()
          .single();
        if (newSessionError) throw newSessionError;
        sid = newSession.id;
        setSessionId(sid);
      }
      // Delete previous entries for this session
      await supabase.from('opening_stock_entries').delete().eq('session_id', sid);
      // Insert all product entries for opening stock
      const rows = stockRows.map(row => ({
        session_id: sid,
        product_id: row.product_id,
        qty: Number(row.qty),
        stocktake_conductor: userName
      }));
      if (rows.length > 0) {
        const { error: insertError } = await supabase.from('opening_stock_entries').insert(rows);
        if (insertError) throw insertError;
      }
      // Mark session as submitted
      await supabase.from('opening_stock_sessions').update({ status: 'submitted', ended_at: now }).eq('id', sid);
      setSessionId(null);
      setSuccess('Opening stock submitted and finalized.');

      // Automatically create a stocktake row for this opening stock
      // This enables closing stock to be entered without manual backend steps
      const { data: existingStocktake } = await supabase
        .from('stocktakes')
        .select('id')
        .eq('location_id', selectedLocation)
        .eq('type', 'opening')
        .limit(1)
        .maybeSingle();
      if (!existingStocktake) {
        await supabase.from('stocktakes').insert({
          location_id: selectedLocation,
          user_id: userId,
          name: userName,
          started_at: now,
          type: 'opening'
        });
      }

      // Overwrite inventory for this location
      for (const r of stockRows) {
        const { data: inv } = await supabase.from('inventory').select('id').eq('product_id', r.product_id).eq('location', selectedLocation).single();
        if (inv) {
          await supabase.from('inventory').update({ quantity: r.qty, updated_at: new Date() }).eq('id', inv.id);
        } else {
          await supabase.from('inventory').insert({ product_id: r.product_id, location: selectedLocation, quantity: r.qty, updated_at: new Date() });
        }
      }
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
      // Only navigate if submitted successfully
      navigate('/dashboard');
    } catch (err) {
      setError('Failed to submit opening stock.');
    } finally {
      setSaving(false);
    }
  };

  // Removed permission access check

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
          <h2>Location: {locations.find(l => l.id === selectedLocation)?.name}</h2>
          <h3>Stocktaker: {userName}</h3>
          <label>Search Product:</label>
          <div style={{position: 'relative', maxWidth: 400}}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or SKU"
              style={{width: '100%'}}
            />
            {/* Dropdown for matching products */}
            {search.trim().length >= 2 && allProducts.filter(p =>
              p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
              (p.sku && p.sku.toLowerCase().includes(search.trim().toLowerCase()))
            ).length > 0 && (
              <ul style={{position: 'absolute', top: '40px', left: 0, width: '100%', background: '#23272f', border: '1px solid #00b4d8', borderRadius: '6px', maxHeight: '180px', overflowY: 'auto', zIndex: 10, listStyle: 'none', margin: 0, padding: 0}}>
                {allProducts.filter(p =>
                  p.name.toLowerCase().includes(search.trim().toLowerCase()) ||
                  (p.sku && p.sku.toLowerCase().includes(search.trim().toLowerCase()))
                ).map(p => (
                  <li
                    key={p.id}
                    style={{padding: '8px 12px', cursor: 'pointer', color: '#e0e6ed', background: stockRows.some(r => r.product_id === p.id) ? '#181818' : 'inherit'}}
                    onClick={() => {
                      setSelectedProduct(p);
                      setShowQtyInput(true);
                      // Pre-fill qty if editing
                      const existing = stockRows.find(r => r.product_id === p.id);
                      setQtyInput(existing ? existing.qty : '');
                    }}
                  >
                    {p.name} <span style={{color:'#00b4d8', fontSize:'0.9em'}}>({p.sku})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {/* Qty input modal/inline for selected product */}
          {showQtyInput && selectedProduct && (
            <div style={{background: '#222', padding: 16, borderRadius: 8, maxWidth: 400, position: 'absolute', left: 420, top: 0, zIndex: 20}}>
              <div style={{marginBottom: 8}}>Enter quantity for <b>{selectedProduct.name}</b> ({selectedProduct.sku}):</div>
              <input
                type="number"
                min="0"
                value={qtyInput}
                onChange={e => setQtyInput(e.target.value)}
                style={{width: 120, marginRight: 12}}
              />
              <button
                onClick={() => {
                  if (qtyInput !== '' && !isNaN(Number(qtyInput))) {
                    handleQtyChange(selectedProduct.id, qtyInput);
                    setShowQtyInput(false);
                    setSelectedProduct(null);
                    setQtyInput('');
                    setSearch('');
                  }
                }}
                style={{padding: '6px 16px', background: '#00b4d8', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer'}}
              >Add</button>
              <button
                onClick={() => {
                  setShowQtyInput(false);
                  setSelectedProduct(null);
                  setQtyInput('');
                }}
                style={{padding: '6px 16px', background: '#888', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer', marginLeft: 8}}
              >Cancel</button>
            </div>
          )}
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
          <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
            <button onClick={handleSave} disabled={saving || !selectedLocation || !userName || stockRows.length === 0}>
              {saving ? 'Saving...' : 'Pause'}
            </button>
            <button
              onClick={async () => {
                setResuming(true);
                setError('');
                setSuccess('');
                // Resume open session for this user/location
                let userId = null;
                const { data: users } = await supabase.from('users').select('id, full_name').ilike('full_name', `%${userName}%`);
                if (users && users.length > 0) userId = users[0].id;
                const { data: session, error: sessionError } = await supabase
                  .from('opening_stock_sessions')
                  .select('*')
                  .eq('location_id', selectedLocation)
                  .eq('user_id', userId)
                  .eq('status', 'open')
                  .order('started_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                if (sessionError) {
                  setError('Error checking for open session.');
                  setResuming(false);
                  return;
                }
                if (session) {
                  setSessionId(session.id);
                  // Load previous entries
                  const { data: prevEntries } = await supabase
                    .from('opening_stock_entries')
                    .select('product_id, qty')
                    .eq('session_id', session.id);
                  if (prevEntries) {
                    setStockRows(prevEntries.map(e => ({ product_id: e.product_id, qty: e.qty, name: allProducts.find(p => p.id === e.product_id)?.name, sku: allProducts.find(p => p.id === e.product_id)?.sku })));
                  }
                  setSuccess('Session resumed.');
                } else {
                  setSessionId(null);
                  setStockRows([]);
                  setError('No open session found to resume.');
                }
                setResuming(false);
              }}
              disabled={resuming || !selectedLocation || !userName}
            >
              {resuming ? 'Resuming...' : 'Resume'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !selectedLocation || !userName || stockRows.length === 0}
              style={{background: '#43aa8b', color: '#fff', border: 'none', borderRadius: '5px', fontWeight: 'bold', padding: '6px 16px', cursor: 'pointer'}}
            >
              {saving ? 'Submitting...' : 'Submit'}
            </button>
          </div>
          {success && <div style={{ color: 'green', marginTop: 8 }}>{success}</div>}
        </div>
      )}
      {error && <div className="stocktake-error">{error}</div>}
    </div>
  );
};

export default OpeningStock;
