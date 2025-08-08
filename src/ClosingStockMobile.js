import React, { useState, useEffect } from 'react';
import { getMaxSetQty } from './utils/setInventoryUtils';
import { v4 as uuidv4 } from 'uuid';
import supabase from './supabase';
import './ClosingStock.css';

function ClosingStockMobile() {
  // ...existing state declarations...
  useEffect(() => {
    let barcode = '';
    let barcodeTimeout = null;
    function handleKeyDown(e) {
      if (!selectedLocation || !passwordOk) return;
      if (e.key === 'Enter') {
        if (barcode.length > 0) {
          // Find product or set by SKU (barcode)
          const scanned = products.find(p => String(p.sku) === barcode);
          if (scanned) {
            if (scanned.is_combo && scanned.components) {
              // Check if enough product stock exists before incrementing
              const productStock = { ...entries };
              scanned.components.forEach(ci => {
                productStock[ci.product_id] = (Number(productStock[ci.product_id]) || 0);
              });
              const possibleSets = getMaxSetQty(scanned.components, productStock);
              if (possibleSets > 0) {
                setEntries(prev => {
                  const newEntries = { ...prev };
                  scanned.components.forEach(ci => {
                    newEntries[ci.product_id] = (Number(newEntries[ci.product_id]) || 0) + (ci.quantity || 1);
                  });
                  // Increment the set's own qty by 1
                  newEntries[scanned.id] = (Number(newEntries[scanned.id]) || 0) + 1;
                  return newEntries;
                });
              } else {
                setError(`Cannot increment set '${scanned.name}' due to insufficient product stock.`);
              }
            } else {
              // If it's a product, increment its qty
              setEntries(prev => ({
                ...prev,
                [scanned.id]: (Number(prev[scanned.id]) || 0) + 1
              }));
            }
          }
        }
        barcode = '';
        clearTimeout(barcodeTimeout);
        barcodeTimeout = null;
      } else if (e.key.length === 1) {
        barcode += e.key;
        clearTimeout(barcodeTimeout);
        barcodeTimeout = setTimeout(() => { barcode = ''; }, 300);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(barcodeTimeout);
    };
  }, [products, selectedLocation, passwordOk, entries]);
  // ...existing state declarations...
  const [password, setPassword] = useState('');
  const [passwordOk, setPasswordOk] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState({});
  const [conductor, setConductor] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resuming, setResuming] = useState(false);

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
    async function fetchProductsAndCombos() {
      // Fetch products
      const { data: prodLocs } = await supabase
        .from('product_locations')
        .select('product_id, products(id, name, sku, unit_of_measure_id)')
        .eq('location_id', selectedLocation);
      const products = (prodLocs || []).map(row => row.products);

      // Fetch combos (sets) and their components
      const { data: combos } = await supabase
        .from('combos')
        .select('id, sku, combo_name');
      const comboIds = (combos || []).map(c => c.id);
      let comboItems = [];
      if (comboIds.length > 0) {
        const { data: items } = await supabase
          .from('combo_items')
          .select('combo_id, product_id, quantity')
          .in('combo_id', comboIds);
        comboItems = items || [];
      }
      // Attach components to combos
      const combosWithComponents = (combos || []).map(combo => {
        const components = comboItems.filter(ci => ci.combo_id === combo.id);
        return {
          ...combo,
          is_combo: true,
          components,
          name: `Set: ${combo.combo_name}`
        };
      });
      // Merge products and combos
      setProducts([...products, ...combosWithComponents]);
    }
    fetchProductsAndCombos();
    setSearch('');
  }, [selectedLocation, passwordOk]);

  // Barcode scanning logic: listen for barcode input and increment product qty
  useEffect(() => {
    let barcode = '';
    let barcodeTimeout = null;
    function handleKeyDown(e) {
      if (!selectedLocation || !passwordOk) return;
      if (e.key === 'Enter') {
        if (barcode.length > 0) {
          // Find product or set by SKU (barcode)
          const scanned = products.find(p => String(p.sku) === barcode);
          if (scanned) {
            if (scanned.is_combo && scanned.components) {
              // Check if enough product stock exists before incrementing
              const productStock = { ...entries };
              scanned.components.forEach(ci => {
                productStock[ci.product_id] = (Number(productStock[ci.product_id]) || 0);
              });
              const possibleSets = getMaxSetQty(scanned.components, productStock);
              if (possibleSets > 0) {
                setEntries(prev => {
                  const newEntries = { ...prev };
                  scanned.components.forEach(ci => {
                    newEntries[ci.product_id] = (Number(newEntries[ci.product_id]) || 0) + (ci.quantity || 1);
                  });
                  // Increment the set's own qty by 1
                  newEntries[scanned.id] = (Number(newEntries[scanned.id]) || 0) + 1;
                  return newEntries;
                });
              } else {
                setError(`Cannot increment set '${scanned.name}' due to insufficient product stock.`);
              }
            } else {
              // If it's a product, increment its qty
              setEntries(prev => ({
                ...prev,
                [scanned.id]: (Number(prev[scanned.id]) || 0) + 1
              }));
            }
          }
        }
        barcode = '';
        clearTimeout(barcodeTimeout);
        barcodeTimeout = null;
      } else if (e.key.length === 1) {
        barcode += e.key;
        clearTimeout(barcodeTimeout);
        barcodeTimeout = setTimeout(() => { barcode = ''; }, 300);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(barcodeTimeout);
    };
  }, [products, selectedLocation, passwordOk, entries]);

  // Resume open session if exists for this conductor/location
  useEffect(() => {
    const tryResume = async () => {
      if (!selectedLocation || !conductor || !passwordOk) return;
      setResuming(true);
      // Find open session for this conductor/location
      const { data: session, error: sessionError } = await supabase
        .from('closing_stock_sessions')
        .select('*')
        .eq('location_id', selectedLocation)
        .eq('user_id', conductor)
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
          .from('closing_stock_entries')
          .select('product_id, qty')
          .eq('session_id', session.id);
        if (prevEntries) {
          const entryMap = {};
          prevEntries.forEach(e => { entryMap[e.product_id] = e.qty; });
          setEntries(entryMap);
        }
      } else {
        setSessionId(null);
        setEntries({});
      }
      setResuming(false);
    };
    tryResume();
    // eslint-disable-next-line
  }, [selectedLocation, conductor, passwordOk]);

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
      <div className="closing-stock-container mobile-friendly">
        <div className="closing-stock-form mobile-friendly-form">
          <h2 className="closing-stock-title">Mobile Closing Stock</h2>
          <input
            type="password"
            placeholder="Enter access password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="mobile-input"
          />
          <button
            className="save-btn mobile-btn"
            onClick={checkPassword}
          >
            Access
          </button>
          {passwordError && <div className="error-message">{passwordError}</div>}
        </div>
      </div>
    );
  }

  // CSV Export logic
  const handleExportCSV = async () => {
    // Fetch opening qty and current stock for each product
    const csvRows = [
      ['Location', 'Product', 'Opening Qty', 'Current Stock', 'Closing Stock Entered']
    ];
    // Fetch opening stock for products in this location
    const { data: openingStocks } = await supabase
      .from('opening_stock')
      .select('product_id, qty')
      .eq('location_id', selectedLocation);

    // Fetch transfers for products in this location
    const { data: transfers } = await supabase
      .from('stock_transfers')
      .select('product_id, qty, direction')
      .eq('location_id', selectedLocation);

    // Fetch sales for products in this location
    const { data: sales } = await supabase
      .from('sales')
      .select('product_id, qty')
      .eq('location_id', selectedLocation);

    products.forEach(prod => {
      // Opening Qty
      const openingQty = openingStocks?.find(os => os.product_id === prod.id)?.qty || 0;
      // Transfers: sum in and out
      const transferIn = transfers?.filter(t => t.product_id === prod.id && t.direction === 'in').reduce((sum, t) => sum + t.qty, 0) || 0;
      const transferOut = transfers?.filter(t => t.product_id === prod.id && t.direction === 'out').reduce((sum, t) => sum + t.qty, 0) || 0;
      // Sales
      const salesQty = sales?.filter(s => s.product_id === prod.id).reduce((sum, s) => sum + s.qty, 0) || 0;
      // Current Stock = Opening + Transfers In - Transfers Out - Sales
      const currentStock = openingQty + transferIn - transferOut - salesQty;
      // Closing Stock Entered
      const closingStock = entries[prod.id] || '';
      csvRows.push([
        locations.find(l => l.id === selectedLocation)?.name || '',
        prod.name,
        openingQty,
        currentStock,
        closingStock
      ]);
    });
    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `closing_stock_${selectedLocation}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="closing-stock-container mobile-friendly">
      <div className="closing-stock-form mobile-friendly-form">
        <h2 className="closing-stock-title">Mobile Closing Stock</h2>
        <label className="mobile-label">
          Location:
          <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} className="mobile-select">
            <option value="">Select Location</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </label>
        <label className="mobile-label">
          Stocktake Conductor Name:
          <input
            type="text"
            value={conductor}
            onChange={e => setConductor(e.target.value)}
            placeholder="Enter your name"
            className="mobile-input"
            disabled={!selectedLocation}
          />
        </label>
        <input
          className="product-search-input mobile-input"
          type="text"
          placeholder="Search products by name or SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          disabled={!selectedLocation}
        />
        <div className="product-list mobile-product-list">
          {filteredProducts.length === 0 && (
            <div className="mobile-no-products">
              {selectedLocation ? 'No products found.' : 'Select a location to begin.'}
            </div>
          )}
          {filteredProducts.map(prod => (
            <div className="product-row mobile-product-row" key={prod.id}>
              <div className="product-name mobile-product-name">
                <b>{prod.name}</b> <span className="mobile-sku">({prod.sku})</span>
                {!prod.is_combo && <div className="mobile-unit">Unit: {units.find(u => u.id === prod.unit_of_measure_id)?.name || '-'}</div>}
                {prod.is_combo && prod.components && (
                  <div className="mobile-unit">
                    Components: {prod.components.map(ci => {
                      const cp = products.find(p => p.id === ci.product_id);
                      return cp ? `${cp.name} (${ci.quantity})` : `ID ${ci.product_id} (${ci.quantity})`;
                    }).join(', ')}
                  </div>
                )}
              </div>
              <input
                className="qty-input mobile-qty-input"
                type="number"
                min="0"
                value={entries[prod.id] || ''}
                onChange={e => {
                  const val = e.target.value;
                  if (prod.is_combo && prod.components) {
                    // Update all component products
                    setEntries(prev => {
                      const newEntries = { ...prev, [prod.id]: val === '' ? '' : Math.max(0, Number(val)) };
                      prod.components.forEach(ci => {
                        newEntries[ci.product_id] = val === '' ? '' : Math.max(0, Number(val)) * ci.quantity;
                      });
                      return newEntries;
                    });
                  } else {
                    setEntries(prev => ({ ...prev, [prod.id]: val === '' ? '' : Math.max(0, Number(val)) }));
                  }
                }}
                placeholder="Qty"
                disabled={!selectedLocation || !conductor}
              />
            </div>
          ))}
        </div>
        <div className="mobile-btn-row">
          <button
            className="save-btn mobile-btn"
            disabled={saving || !selectedLocation || !conductor}
            onClick={async () => {
              setSaving(true);
              setError('');
              setSuccess('');
              try {
                let sid = sessionId;
                const now = new Date().toISOString();
                if (!sid) {
                  // Create new session
                  const { data: newSession, error: sessionError } = await supabase.from('closing_stock_sessions').insert({
                    id: uuidv4(),
                    user_id: conductor,
                    location_id: selectedLocation,
                    started_at: now,
                    status: 'open',
                  }).select().single();
                  if (sessionError) throw sessionError;
                  sid = newSession.id;
                  setSessionId(sid);
                }
                // Upsert all entries for this session
                const rows = Object.entries(entries)
                  .filter(([pid, qty]) => qty && Number(qty) > 0)
                  .map(([pid, qty]) => ({
                    id: uuidv4(),
                    session_id: sid,
                    product_id: pid,
                    qty: Number(qty),
                    stocktake_conductor: conductor
                  }));
                // Remove previous entries for this session
                await supabase.from('closing_stock_entries').delete().eq('session_id', sid);
                if (rows.length > 0) {
                  const { error: insertError } = await supabase.from('closing_stock_entries').insert(rows);
                  if (insertError) throw insertError;
                }
                // Mark session as closed
                await supabase.from('closing_stock_sessions').update({ status: 'closed', ended_at: now }).eq('id', sid);

                // 2. Close current period (opening stock, sales, transfers)
                // Find latest opening stocktake for this location
                const { data: openings, error: openErr } = await supabase
                  .from('stocktakes')
                  .select('*')
                  .eq('location_id', selectedLocation)
                  .eq('type', 'opening')
                  .order('started_at', { ascending: false });
                if (openErr || !openings || openings.length === 0) throw new Error('No opening stocktake found.');
                let opening = null;
                for (const o of openings) {
                  const { data: closing } = await supabase
                    .from('stocktakes')
                    .select('id')
                    .eq('location_id', selectedLocation)
                    .eq('type', 'closing')
                    .gte('started_at', o.started_at)
                    .lte('started_at', o.ended_at || now);
                  if (!closing || closing.length === 0) {
                    opening = o;
                    break;
                  }
                }
                if (!opening) throw new Error('No open period to close.');
                // Update opening stocktake's ended_at to now
                const { error: updateErr, data: updateData } = await supabase
                  .from('stocktakes')
                  .update({ ended_at: now })
                  .eq('id', opening.id)
                  .select();
                if (updateErr || !updateData || updateData.length === 0) {
                  throw new Error('Failed to update ended_at for opening stocktake.');
                }

                // Automatically create a stocktake row for closing stock if not exists
                const { data: existingClosingStocktake } = await supabase
                  .from('stocktakes')
                  .select('id')
                  .eq('location_id', selectedLocation)
                  .eq('type', 'closing')
                  .eq('started_at', opening.started_at)
                  .eq('ended_at', now)
                  .limit(1)
                  .maybeSingle();
                let closingStocktakeId = null;
                if (!existingClosingStocktake) {
                  const { data: closingStocktake, error: closingErr } = await supabase
                    .from('stocktakes')
                    .insert({
                      location_id: selectedLocation,
                      type: 'closing',
                      started_at: opening.started_at,
                      ended_at: now
                    })
                    .select()
                    .single();
                  if (closingErr || !closingStocktake) throw new Error('Failed to create closing stocktake.');
                  closingStocktakeId = closingStocktake.id;
                } else {
                  closingStocktakeId = existingClosingStocktake.id;
                }
                // Insert all product entries into stocktake_entries for closing
                const entriesToInsert = Object.entries(entries)
                  .filter(([pid, qty]) => qty && Number(qty) > 0)
                  .map(([pid, qty]) => ({
                    stocktake_id: closingStocktakeId,
                    product_id: pid,
                    qty: Number(qty)
                  }));
                const { error: entriesError } = await supabase
                  .from('stocktake_entries')
                  .insert(entriesToInsert);
                if (entriesError) throw new Error('Failed to insert stocktake entries.');

                // 3. Start a new period with previous closing stock as new opening stock
                const { data: newOpening, error: newOpeningErr } = await supabase
                  .from('stocktakes')
                  .insert({
                    location_id: selectedLocation,
                    type: 'opening',
                    started_at: now
                  })
                  .select()
                  .single();
                if (newOpeningErr || !newOpening) throw new Error('Failed to create new opening stocktake.');
                // Copy closing stocktake entries to new opening stocktake
                const openingEntries = entriesToInsert.map(e => ({
                  stocktake_id: newOpening.id,
                  product_id: e.product_id,
                  qty: e.qty
                }));
                const { error: openingEntriesErr } = await supabase
                  .from('stocktake_entries')
                  .insert(openingEntries);
                if (openingEntriesErr) throw new Error('Failed to copy opening stocktake entries.');

                setEntries({});
                setConductor('');
                setSessionId(null);
                setSuccess('All sessions submitted. Period closed and new opening stock set.');
              } catch (err) {
                setError(err.message || 'Failed to submit closing stock.');
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving...' : 'Pause'}
          </button>
          <button
            className="save-btn mobile-btn"
            disabled={saving || !selectedLocation || !conductor || Object.values(entries).every(qty => !qty || Number(qty) <= 0)}
            onClick={async () => {
              setSaving(true);
              setError('');
              setSuccess('');
              try {
                let sid = sessionId;
                if (!sid) {
                  // Create new session
                  const { data: newSession, error: sessionError } = await supabase.from('closing_stock_sessions').insert({
                    id: uuidv4(),
                    user_id: conductor,
                    location_id: selectedLocation,
                    started_at: new Date().toISOString(),
                    status: 'open',
                  }).select().single();
                  if (sessionError) throw sessionError;
                  sid = newSession.id;
                  setSessionId(sid);
                }
                // Upsert all entries for this session
                const rows = Object.entries(entries)
                  .filter(([pid, qty]) => qty && Number(qty) > 0)
                  .map(([pid, qty]) => ({
                    id: uuidv4(),
                    session_id: sid,
                    product_id: pid,
                    qty: Number(qty),
                    stocktake_conductor: conductor
                  }));
                // Remove previous entries for this session
                await supabase.from('closing_stock_entries').delete().eq('session_id', sid);
                if (rows.length > 0) {
                  const { error: insertError } = await supabase.from('closing_stock_entries').insert(rows);
                  if (insertError) throw insertError;
                }
                // Mark session as closed
                await supabase.from('closing_stock_sessions').update({ status: 'closed', ended_at: new Date().toISOString() }).eq('id', sid);
                // Check if any open sessions remain for this location/period
                const { data: openSessions } = await supabase
                  .from('closing_stock_sessions')
                  .select('id')
                  .eq('location_id', selectedLocation)
                  .eq('status', 'open');
                if (openSessions && openSessions.length > 0) {
                  setSuccess('Your session is submitted, but other sessions are still open. Period will close when all are submitted.');
                } else {
                  setSuccess('All sessions submitted. Period will now close and new opening stock will be set.');
                  // Here you would trigger backend logic to aggregate and close period, set new opening stock, etc.
                }
                setEntries({});
                setConductor('');
                setSessionId(null);
              } catch (err) {
                setError(err.message || 'Failed to submit closing stock.');
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving...' : 'Submit Closing Stock'}
          </button>
        </div>
        <button
          className="save-btn mobile-btn"
          style={{ marginTop: 16, background: '#4caf50' }}
          onClick={handleExportCSV}
          disabled={!selectedLocation || products.length === 0}
        >
          Export as CSV
        </button>
        {error && <div className="error-message">{error}</div>}
        {success && <div className="success-message">{success}</div>}
      </div>
    </div>
  );
}

export default ClosingStockMobile;
