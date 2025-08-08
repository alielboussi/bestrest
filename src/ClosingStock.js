import React, { useState, useEffect } from 'react';
import { getMaxSetQty } from './utils/setInventoryUtils';
import supabase from './supabase';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
// Removed user permissions imports

// Utility to export confirmation table to CSV (Excel-compatible)

function exportToCSV(rows) {
  const header = ['Name', 'SKU', 'Unit', 'Qty'];
  const csvRows = [header.join(',')];
  rows.forEach(row => {
    csvRows.push([
      '"' + row.name.replace(/"/g, '""') + '"',
      '"' + row.sku.replace(/"/g, '""') + '"',
      '"' + (row.unit || '-') + '"',
      row.qty
    ].join(','));
  });
  const csvContent = csvRows.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'closing_stock_confirmation.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function ClosingStock() {
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState({}); // { product_id: qty }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmChecked, setConfirmChecked] = useState(false);
  // Removed user permissions state
  // For closing stock sessions/entries
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
  }, [selectedLocation]);

  // Barcode scanning logic: listen for barcode input and increment product qty
  useEffect(() => {
    let barcode = '';
    let barcodeTimeout = null;
    function handleKeyDown(e) {
      if (!selectedLocation) return;
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
  }, [products, selectedLocation]);


  // Removed permissions fetching logic

  // Removed permission helpers
  const canAdd = true;
  const canEdit = true;
  const canDelete = true;

  // Removed permission access check

  // Build confirmation table rows: only products with qty input and that were searched
  const confirmRows = products
    .filter(p => entries[p.id] && Number(entries[p.id]) > 0)
    .map(p => ({
      name: p.name,
      sku: p.sku,
      unit: units.find(u => u.id === p.unit_of_measure_id)?.name || '-',
      qty: entries[p.id]
    }));

  // Only show products matching the search term (never show all by default)
  const filteredProducts = search.trim().length > 0
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
      )
    : [];

  return (
    <div className="closing-stock-container">
      <div className="closing-stock-form">
        <h2 className="closing-stock-title">Closing Stock</h2>
        {/* Location selection */}
        <label>
          Location:
          <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}>
            <option value="">Select Location</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </label>
        {/* Product search */}
        <input
          className="product-search-input"
          type="text"
          placeholder="Search products by name or SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          disabled={!selectedLocation}
        />
        {/* Product list */}
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
                {!prod.is_combo && <div style={{ fontSize: '0.95em', color: '#aaa' }}>Unit: {units.find(u => u.id === prod.unit_of_measure_id)?.name || '-'}</div>}
                {prod.is_combo && prod.components && (
                  <div style={{ fontSize: '0.95em', color: '#aaa' }}>
                    Components: {prod.components.map(ci => {
                      const cp = products.find(p => p.id === ci.product_id);
                      return cp ? `${cp.name} (${ci.quantity})` : `ID ${ci.product_id} (${ci.quantity})`;
                    }).join(', ')}
                  </div>
                )}
              </div>
              <input
                className="qty-input"
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
                style={{ width: 80, marginLeft: 12 }}
              />
            </div>
          ))}
        </div>
        {/* Save/Confirm section */}
        {filteredProducts.length > 0 && (canAdd || canEdit) && (
          <div style={{ marginTop: 18 }}>
            <button
              className="save-btn"
              style={{ background: '#00b4d8', color: '#fff', fontWeight: 600, fontSize: '1.1em', border: 'none', borderRadius: 7, padding: '10px 28px', cursor: 'pointer', marginRight: 12 }}
              disabled={saving || Object.values(entries).every(qty => !qty || Number(qty) <= 0)}
              onClick={() => setShowConfirm(true)}
            >
              {saving ? 'Saving...' : 'Save & Confirm'}
            </button>
            {error && <div style={{ color: '#ff4d4d', marginTop: 8 }}>{error}</div>}
          </div>
        )}
        {/* Confirmation Modal */}
        {showConfirm && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.7)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ background: '#23272f', borderRadius: 12, padding: 32, minWidth: 320, color: '#e0e6ed', boxShadow: '0 2px 16px #000a', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <h3 style={{ marginTop: 0, marginBottom: 12 }}>Confirm Closing Stock</h3>
              <div style={{ maxHeight: 220, overflowY: 'auto', width: '100%', marginBottom: 16 }}>
                <table style={{ width: '100%', color: '#fff', fontSize: '1em', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: '#00bfff' }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>Name</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>SKU</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>Unit</th>
                      <th style={{ textAlign: 'left', padding: '4px 8px' }}>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmRows.map((row, idx) => (
                      <tr key={idx}>
                        <td style={{ padding: '4px 8px' }}>{row.name}</td>
                        <td style={{ padding: '4px 8px' }}>{row.sku}</td>
                        <td style={{ padding: '4px 8px' }}>{row.unit}</td>
                        <td style={{ padding: '4px 8px' }}>{row.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label style={{ marginBottom: 12 }}>
                <input type="checkbox" checked={confirmChecked} onChange={e => setConfirmChecked(e.target.checked)} /> I confirm the above entries are correct
              </label>
              <div style={{ display: 'flex', gap: 16 }}>
                <button
                  className="save-btn"
                  style={{ background: '#00b4d8', color: '#fff', fontWeight: 600, fontSize: '1.1em', border: 'none', borderRadius: 7, padding: '8px 22px', cursor: 'pointer' }}
                  disabled={!confirmChecked || saving}
                  onClick={async () => {
                    setSaving(true);
                    setError('');
                    try {
                      // 1. Save closing stock session and entries (same as before)
                      let sessionId = null;
                      const userId = 1; // Replace with actual user id if available
                      const now = new Date().toISOString();
                      const { data: openSession, error: sessionError } = await supabase
                        .from('closing_stock_sessions')
                        .select('*')
                        .eq('location_id', selectedLocation)
                        .eq('user_id', userId)
                        .eq('status', 'open')
                        .order('started_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                      if (sessionError) throw sessionError;
                      if (openSession) {
                        sessionId = openSession.id;
                      } else {
                        // Create new session
                        const { data: newSession, error: newSessionError } = await supabase
                          .from('closing_stock_sessions')
                          .insert({
                            id: uuidv4(),
                            user_id: userId,
                            location_id: selectedLocation,
                            started_at: now,
                            status: 'open'
                          })
                          .select()
                          .single();
                        if (newSessionError) throw newSessionError;
                        sessionId = newSession.id;
                      }
                      await supabase.from('closing_stock_entries').delete().eq('session_id', sessionId);
                      const rows = confirmRows.map(row => ({
                        id: uuidv4(),
                        session_id: sessionId,
                        product_id: products.find(p => p.sku === row.sku).id,
                        qty: Number(row.qty),
                        stocktake_conductor: ''
                      }));
                      if (rows.length > 0) {
                        const { error: insertError } = await supabase.from('closing_stock_entries').insert(rows);
                        if (insertError) throw insertError;
                      }
                      await supabase.from('closing_stock_sessions').update({ status: 'closed', ended_at: now }).eq('id', sessionId);

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
                      const entriesToInsert = confirmRows.map(row => ({
                        stocktake_id: closingStocktakeId,
                        product_id: products.find(p => p.sku === row.sku).id,
                        qty: Number(row.qty)
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

                      setShowConfirm(false);
                      setEntries({});
                      setConfirmChecked(false);
                      exportToCSV(confirmRows);
                      setTimeout(() => {
                        const ua = navigator.userAgent || navigator.vendor || window.opera;
                        if (/android/i.test(ua) && window.ReactNativeWebView) {
                          window.ReactNativeWebView.postMessage('close');
                        } else if (/android/i.test(ua)) {
                          window.close();
                        } else {
                          navigate('/dashboard');
                        }
                      }, 500);
                    } catch (err) {
                      setError('Failed to save: ' + err.message);
                    }
                    setSaving(false);
                  }}
                >
                  {saving ? 'Saving...' : 'Confirm & Save'}
                </button>
                <button
                  style={{ background: '#888', color: '#fff', fontWeight: 600, fontSize: '1.1em', border: 'none', borderRadius: 7, padding: '8px 22px', cursor: 'pointer' }}
                  onClick={() => setShowConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  style={{ background: '#00b4d8', color: '#fff', fontWeight: 600, fontSize: '1.1em', border: 'none', borderRadius: 7, padding: '8px 22px', cursor: 'pointer' }}
                  onClick={() => exportToCSV(confirmRows)}
                >
                  Export CSV
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default ClosingStock;
// end of file
