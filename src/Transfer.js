import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import supabase from './supabase';
import { getMaxSetQty, selectPrice } from './utils/setInventoryUtils';
import './Transfer.css';

const Transfer = () => {
  const navigate = useNavigate();
  const { id } = useParams(); // transfer id for edit
  const [transferDate, setTransferDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fromLocation, setFromLocation] = useState('');
  const [toLocation, setToLocation] = useState('');
  const [locations, setLocations] = useState([]);
  const [deliveryNumber, setDeliveryNumber] = useState('');
  const [search, setSearch] = useState('');
  const [products, setProducts] = useState([]);
  const [sets, setSets] = useState([]); // sets available at fromLocation
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [filteredSets, setFilteredSets] = useState([]);
  // selected items: product rows and set rows
  const [selectedProducts, setSelectedProducts] = useState([]); // product: {type:'product', product_id, name, sku, price, qty}; set: {type:'set', set_id, name, sku, price, qty, components}
  // staged qty per search row key (e.g., 'p-12' or 's-3')
  const [stagedQty, setStagedQty] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch transfer session and entries if editing
  useEffect(() => {
    if (id) {
      setLoading(true);
      (async () => {
        // Fetch session
        const { data: session } = await supabase.from('stock_transfer_sessions').select('*').eq('id', id).single();
        if (session) {
          setTransferDate(session.transfer_date);
          setFromLocation(session.from_location);
          setToLocation(session.to_location);
          setDeliveryNumber(session.delivery_number || '');
        }
        // Fetch entries
        const { data: entries } = await supabase.from('stock_transfer_entries').select('*').eq('session_id', id);
        // Fetch products for fromLocation
        const { data: productLocs } = await supabase.from('product_locations').select('product_id').eq('location_id', session.from_location);
        const productIds = (productLocs || []).map(pl => pl.product_id);
        const { data: productsData } = await supabase.from('products').select('id, name, sku, price').in('id', productIds);
  setProducts(productsData || []);
  setFilteredProducts([]); // don't show until search
        // Load sets for this from-location
        const [{ data: invData }, { data: combos }, { data: comboItems }] = await Promise.all([
          supabase.from('inventory').select('product_id, quantity').eq('location', session.from_location),
          supabase.from('combos').select('id, combo_name, sku, standard_price, promotional_price, combo_price, currency, combo_locations:combo_locations(location_id)'),
          supabase.from('combo_items').select('combo_id, product_id, quantity')
        ]);
        const invMap = (invData || []).reduce((m, r) => { m[r.product_id] = Number(r.quantity) || 0; return m; }, {});
        const combosForLoc = (combos || []).filter(c => Array.isArray(c.combo_locations) && c.combo_locations.some(cl => String(cl.location_id) === String(session.from_location)));
        const setsBuilt = combosForLoc.map(c => ({
          set_id: c.id,
          name: c.combo_name,
          sku: c.sku,
          price: selectPrice(c.promotional_price, c.standard_price ?? c.combo_price),
          components: (comboItems || []).filter(ci => String(ci.combo_id) === String(c.id)).map(ci => ({ product_id: ci.product_id, quantity: Number(ci.quantity) })),
          stock: getMaxSetQty((comboItems || []).filter(ci => String(ci.combo_id) === String(c.id)), invMap)
        }));
  setSets(setsBuilt);
  setFilteredSets([]); // don't show until search
        // Map selectedProducts from entries
        const selected = (entries || []).map(e => {
          const prod = (productsData || []).find(p => p.id === e.product_id);
          return prod ? { type:'product', product_id: prod.id, name: prod.name, sku: prod.sku, price: prod.price, qty: e.quantity } : null;
        }).filter(Boolean);
        setSelectedProducts(selected);
        setLoading(false);
      })();
    }
  }, [id]);

  useEffect(() => {
    supabase.from('locations').select('id, name').then(({ data }) => setLocations(data || []));
  }, []);

  useEffect(() => {
    if (fromLocation) {
      // Fetch products for fromLocation
      supabase
        .from('product_locations')
        .select('product_id')
        .eq('location_id', fromLocation)
        .then(async ({ data: productLocs }) => {
          const productIds = (productLocs || []).map(pl => pl.product_id);
          if (productIds.length === 0) {
            setProducts([]);
            setFilteredProducts([]);
            return;
          }
          const [{ data: products }, { data: invData }, { data: combos }, { data: comboItems }] = await Promise.all([
            supabase
              .from('products')
              .select('id, name, sku, price')
              .in('id', productIds),
            supabase.from('inventory').select('product_id, quantity').eq('location', fromLocation),
            supabase.from('combos').select('id, combo_name, sku, standard_price, promotional_price, combo_price, currency, combo_locations:combo_locations(location_id)'),
            supabase.from('combo_items').select('combo_id, product_id, quantity'),
          ]);
          const invMap = (invData || []).reduce((m, r) => { m[r.product_id] = Number(r.quantity) || 0; return m; }, {});
          setProducts(products || []);
          setFilteredProducts([]);
          const combosForLoc = (combos || []).filter(c => Array.isArray(c.combo_locations) && c.combo_locations.some(cl => String(cl.location_id) === String(fromLocation)));
          const setsBuilt = combosForLoc.map(c => ({
            set_id: c.id,
            name: c.combo_name,
            sku: c.sku,
            price: selectPrice(c.promotional_price, c.standard_price ?? c.combo_price),
            components: (comboItems || []).filter(ci => String(ci.combo_id) === String(c.id)).map(ci => ({ product_id: ci.product_id, quantity: Number(ci.quantity) })),
            stock: getMaxSetQty((comboItems || []).filter(ci => String(ci.combo_id) === String(c.id)), invMap)
          }));
          setSets(setsBuilt);
          setFilteredSets([]);
        });
    } else {
  setProducts([]);
  setFilteredProducts([]);
  setSets([]);
  setFilteredSets([]);
    }
    setSelectedProducts([]);
  }, [fromLocation]);

  useEffect(() => {
    if (!search) {
      // Show nothing until user types
      setFilteredProducts([]);
      setFilteredSets([]);
      return;
    }
    const s = search.toLowerCase();
    // Exclude already-selected items from search results
    const filteredP = (products || []).filter((p) =>
      ((p.name || '').toLowerCase().includes(s) || (p.sku && p.sku.toLowerCase().includes(s)) || (p.price && String(p.price).toLowerCase().includes(s))) &&
      !selectedProducts.some(r => r.type==='product' && r.product_id === p.id)
    );
    const filteredS = (sets || []).filter((c) =>
      (((c.name || '').toLowerCase().includes(s) || (c.sku && c.sku.toLowerCase().includes(s))) &&
      !selectedProducts.some(r => r.type==='set' && r.set_id === c.set_id))
    );
    setFilteredProducts(filteredP);
    setFilteredSets(filteredS);
  }, [search, products, sets, selectedProducts]);

  const handleQtyChange = (kind, id, qty) => {
    setSelectedProducts(rows => {
      if (kind === 'product') {
        const exists = rows.find(r => r.type === 'product' && r.product_id === id);
        if (exists) {
          return rows.map(r => (r.type==='product' && r.product_id === id) ? { ...r, qty } : r);
        }
        const prod = (products || []).find(p => p.id === id);
        if (!prod) return rows;
        return [...rows, { type:'product', product_id: id, name: prod.name, sku: prod.sku, price: prod.price, qty }];
      } else {
        const exists = rows.find(r => r.type === 'set' && r.set_id === id);
        if (exists) {
          return rows.map(r => (r.type==='set' && r.set_id === id) ? { ...r, qty } : r);
        }
        const setRow = (sets || []).find(s => s.set_id === id);
        if (!setRow) return rows;
        return [...rows, { type:'set', set_id: id, name: setRow.name, sku: setRow.sku, price: setRow.price, qty, components: setRow.components }];
      }
    });
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      if (!fromLocation || !toLocation || fromLocation === toLocation) throw new Error('Select different locations');
      if (!transferDate) throw new Error('Transfer date required');
      if (!selectedProducts.length) throw new Error('Add at least one product');
      // Get user (assume current user is first in users table for demo)
      const { data: users } = await supabase.from('users').select('id').limit(1);
      const userId = users && users.length > 0 ? users[0].id : null;
      let sessionId = id;
      let oldEntries = [];
      if (id) {
        // Update session
        const { error: sessErr } = await supabase.from('stock_transfer_sessions').update({
          from_location: fromLocation,
          to_location: toLocation,
          user_id: userId,
          delivery_number: deliveryNumber,
          transfer_date: transferDate
        }).eq('id', id);
        if (sessErr) throw sessErr;
        // Fetch old entries before deleting
        const { data: oldEnts } = await supabase.from('stock_transfer_entries').select('*').eq('session_id', id);
        oldEntries = oldEnts || [];
        // Delete old entries
        await supabase.from('stock_transfer_entries').delete().eq('session_id', id);
      } else {
        // Create session
        const { data: session, error: sessErr } = await supabase.from('stock_transfer_sessions').insert({
          from_location: fromLocation,
          to_location: toLocation,
          user_id: userId,
          delivery_number: deliveryNumber,
          transfer_date: transferDate,
          created_at: new Date()
        }).select().single();
        if (sessErr) throw sessErr;
        sessionId = session.id;
      }
      // Create entries (expand sets into components)
      const entries = [];
      for (const r of selectedProducts) {
        if (!r || !r.qty) continue;
        if (r.type === 'set') {
          for (const comp of (r.components || [])) {
            entries.push({ session_id: sessionId, product_id: comp.product_id, quantity: parseFloat(comp.quantity) * parseFloat(r.qty) });
          }
        } else {
          entries.push({ session_id: sessionId, product_id: r.product_id, quantity: r.qty });
        }
      }
      const { error: entErr } = await supabase.from('stock_transfer_entries').insert(entries);
      if (entErr) throw entErr;
      // If editing, revert old inventory changes before applying new ones
      if (id && oldEntries.length > 0) {
        for (const e of oldEntries) {
          // Add back to fromLocation
          const { data: invFrom } = await supabase.from('inventory').select('id, quantity').eq('product_id', e.product_id).eq('location', fromLocation).single();
          if (invFrom) {
            await supabase.from('inventory').update({ quantity: (parseFloat(invFrom.quantity) + parseFloat(e.quantity)), updated_at: new Date() }).eq('id', invFrom.id);
          }
          // Subtract from toLocation
          const { data: invTo } = await supabase.from('inventory').select('id, quantity').eq('product_id', e.product_id).eq('location', toLocation).single();
          if (invTo) {
            await supabase.from('inventory').update({ quantity: (parseFloat(invTo.quantity) - parseFloat(e.quantity)), updated_at: new Date() }).eq('id', invTo.id);
          }
        }
      }
      // Update inventory: subtract from fromLocation, add to toLocation (expanding sets)
      for (const r of selectedProducts) {
        if (!r || !r.qty) continue;
        const applyMove = async (productId, qty) => {
          // Subtract from fromLocation
          const { data: invFrom } = await supabase.from('inventory').select('id, quantity').eq('product_id', productId).eq('location', fromLocation).single();
          if (invFrom) {
            await supabase.from('inventory').update({ quantity: (parseFloat(invFrom.quantity) - parseFloat(qty)), updated_at: new Date() }).eq('id', invFrom.id);
          }
          // Add to toLocation
          const { data: invTo } = await supabase.from('inventory').select('id, quantity').eq('product_id', productId).eq('location', toLocation).single();
          if (invTo) {
            await supabase.from('inventory').update({ quantity: (parseFloat(invTo.quantity) + parseFloat(qty)), updated_at: new Date() }).eq('id', invTo.id);
          } else {
            await supabase.from('inventory').insert({ product_id: productId, location: toLocation, quantity: qty, updated_at: new Date() });
          }
        };

        if (r.type === 'set') {
          for (const comp of (r.components || [])) {
            const qty = parseFloat(comp.quantity) * parseFloat(r.qty);
            await applyMove(comp.product_id, qty);
          }
        } else {
          await applyMove(r.product_id, r.qty);
        }
      }
  // Go to a fresh Transfer page to ensure all fields are blank for a new transfer
  window.location.replace('/transfer');
    } catch (err) {
      setError(err.message || 'Failed to process transfer.');
    } finally {
      setSaving(false);
    }
  };

  // All actions always accessible
  const canAdd = true;
  const canEdit = true;
  const canDelete = true;

  return (
    <div className="transfer-container">
      <h1>{id ? 'Edit Transfer' : 'Stock Transfer'}</h1>
      <div className="transfer-form">
        {loading ? <div>Loading...</div> : <>
          <div className="transfer-form-row">
            <label>Date of Transfer:</label>
            <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} required />
          </div>
          <div className="transfer-form-row">
            <label>From Location:</label>
            <select value={fromLocation} onChange={e => setFromLocation(e.target.value)} required disabled={!!id}>
              <option value="">-- Select --</option>
              {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
            </select>
          </div>
          <div className="transfer-form-row">
            <label>To Location:</label>
            <select value={toLocation} onChange={e => setToLocation(e.target.value)} required>
              <option value="">-- Select --</option>
              {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
            </select>
          </div>
          <div className="transfer-form-row">
            <label>Delivery #:</label>
            <input type="text" value={deliveryNumber} onChange={e => setDeliveryNumber(e.target.value)} />
          </div>
          <div className="transfer-form-row">
            <label>Search Items (Products or Sets):</label>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <input style={{ flex: 1 }} type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, SKU, or Price" />
              <button type="button" onClick={() => setSearch('')} style={{ padding: '10px 12px', borderRadius: 8, border: '1px solid #00b4d8', background: '#23272f', color: '#e0e6ed' }}>Clear</button>
            </div>
          </div>
          <div className="transfer-table-wrapper">
      <table className="transfer-table">
              <thead>
        <tr><th>Item</th><th>SKU</th><th>Price</th><th>Qty</th></tr>
              </thead>
              <tbody>
                {/* Show previously selected items and live search results (products + sets) without duplicates */}
                {(() => {
                  const searchRows = [
                    ...filteredProducts.map(p => ({ type:'product', id: p.id, name: p.name, sku: p.sku, price: p.price })),
                    ...filteredSets.map(s => ({ type:'set', id: s.set_id, name: `${s.name} (Set)`, sku: s.sku, price: s.price }))
                  ];
                  const displayRows = searchRows; // show only search results; selected items are shown in the review table
                  return displayRows.map(row => {
                    const key = row.type === 'product' ? `p-${row.product_id || row.id}` : `s-${row.set_id || row.id}`;
                    const name = row.name;
                    const sku = row.sku;
                    const price = row.price;
                    const qtyValue = stagedQty[key] ?? '';
                    const kind = row.type;
                    const idVal = row.product_id || row.set_id || row.id;
                    return (
                      <tr key={key}>
                        <td>{name}</td>
                        <td>{sku}</td>
                        <td>{price}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            value={qtyValue}
                            onChange={e => setStagedQty(prev => ({ ...prev, [key]: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                const q = Number(stagedQty[key]);
                                if (Number.isFinite(q) && q > 0) {
                                  handleQtyChange(kind, idVal, q);
                                  setStagedQty(prev => ({ ...prev, [key]: '' }));
                                }
                              }
                            }}
                            style={{ width: 60 }}
                          />
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
          {selectedProducts.filter(r => Number(r.qty) > 0).length > 0 && (
            <div className="transfer-table-wrapper">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: '10px 0' }}>Selected Items</h3>
                <button type="button" onClick={() => setSelectedProducts([])} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #00b4d8', background: '#23272f', color: '#e0e6ed' }}>Clear Selected</button>
              </div>
              <table className="transfer-table">
                <thead>
                  <tr><th>Item</th><th>SKU</th><th>Price</th><th>Qty</th></tr>
                </thead>
                <tbody>
                  {selectedProducts.filter(r => Number(r.qty) > 0).map(r => {
                    const kind = r.type;
                    const idVal = r.type==='product' ? r.product_id : r.set_id;
                    return (
                      <tr key={(kind==='product' ? `p-${idVal}` : `s-${idVal}`)}>
                        <td>{r.name}{kind==='set' ? ' (Set)' : ''}</td>
                        <td>{r.sku}</td>
                        <td>{r.price}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            value={r.qty}
                            onChange={e => handleQtyChange(kind, idVal, e.target.value)}
                            style={{ width: 60 }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <button className="transfer-submit-btn" onClick={handleSubmit} disabled={saving}>{id ? 'Save Changes' : 'Process Transfer'}</button>
          {error && <div className="transfer-error">{error}</div>}
        </>}
      </div>
    </div>
  );
};

export default Transfer;
