
import React, { useState, useEffect } from 'react';
import './ClosingStock.css';
import './Products.css';
import supabase from './supabase';
import { useNavigate } from 'react-router-dom';

// Barcode scanning logic: listen for barcode input and increment product qty
useEffect(() => {
  let barcode = '';
  let barcodeTimeout = null;
  function handleKeyDown(e) {
    // Ignore if not on this page
    if (!selectedLocation) return;
    // Most barcode scanners send input as key events ending with Enter
    if (e.key === 'Enter') {
      if (barcode.length > 0) {
        // Find product by SKU (barcode)
        const product = products.find(p => String(p.sku) === barcode);
        if (product) {
          setEntries(prev => ({
            ...prev,
            [product.id]: (Number(prev[product.id]) || 0) + 1
          }));
        }
      }
      barcode = '';
      clearTimeout(barcodeTimeout);
      barcodeTimeout = null;
    } else if (e.key.length === 1) {
      barcode += e.key;
      // Reset barcode if no input for 300ms
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

  // Save closing stock (final submission)
  const handleSave = async () => {
    if (!selectedLocation) {
      setError('Please select a location.');
      return;
    }
    // Show confirmation modal first
    setShowConfirm(true);
    setConfirmChecked(false);
  };

  // Actually submit to backend after confirmation
  const handleFinalSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      // 1. End previous open period for this location (if any)
      await supabase
        .from('stocktakes')
        .update({ ended_at: new Date().toISOString() })
        .eq('location_id', selectedLocation)
        .is('ended_at', null);

      // 2. Create closing stocktake
      const { data: closingStocktake, error: stError } = await supabase
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

      // 3. Prepare entries: all products, qty from entries or 0
      const stockEntries = products.map(p => ({
        stocktake_id: closingStocktake.id,
        product_id: p.id,
        qty: Number(entries[p.id]) || 0
      }));
      // Insert stocktake_entries for closing
      const { error: seError } = await supabase
        .from('stocktake_entries')
        .insert(stockEntries);
      if (seError) throw seError;

      // 4. Update inventory for each product at location
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

      // 5. Create new opening stocktake for new period
      const { data: openingStocktake, error: osError } = await supabase
        .from('stocktakes')
        .insert([
          {
            location_id: selectedLocation,
            user_id: JSON.parse(localStorage.getItem('user')).id,
            started_at: new Date().toISOString(),
            ended_at: null,
            type: 'opening',
            name: `Opening Stock - ${new Date().toLocaleDateString()}`
          }
        ])
        .select()
        .single();
      if (osError) throw osError;

      // 6. Insert opening stocktake entries (same as closing)
      const openingEntries = products.map(p => ({
        stocktake_id: openingStocktake.id,
        product_id: p.id,
        qty: Number(entries[p.id]) || 0
      }));
      const { error: oeError } = await supabase
        .from('stocktake_entries')
        .insert(openingEntries);
      if (oeError) throw oeError;

      setSaving(false);
      setShowConfirm(false);
      navigate('/dashboard');
    } catch (err) {
      setError('Error saving closing stock.');
      setSaving(false);
    }
  };
  // Build confirmation table rows: only products with qty input and that were searched
  const confirmRows = products
    .filter(p => entries[p.id] && Number(entries[p.id]) > 0)
    .map(p => ({
      name: p.name,
      sku: p.sku,
      unit: units.find(u => u.id === p.unit_of_measure_id)?.name || '-',
      qty: entries[p.id]
    }));

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
        {/* Confirmation Modal */}
        {showConfirm && (
          <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'rgba(0,0,0,0.7)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <div style={{ background: '#23272f', borderRadius: 12, padding: 32, minWidth: 340, maxWidth: 600, boxShadow: '0 2px 16px #000a', color: '#e0e6ed' }}>
              <h3 style={{marginTop:0, marginBottom:16}}>Confirm Closing Stock</h3>
              <div style={{maxHeight: 300, overflowY: 'auto', marginBottom: 18}}>
                <table style={{width: '100%', color: '#e0e6ed', background: 'transparent', borderCollapse: 'collapse'}}>
                  <thead>
                    <tr style={{background: '#23272f'}}>
                      <th style={{padding: '0.4rem', borderBottom: '1px solid #00b4d8', textAlign: 'left'}}>Name</th>
                      <th style={{padding: '0.4rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>SKU</th>
                      <th style={{padding: '0.4rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>Unit</th>
                      <th style={{padding: '0.4rem', borderBottom: '1px solid #00b4d8', textAlign: 'center'}}>Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmRows.length === 0 ? (
                      <tr><td colSpan={4} style={{textAlign:'center', color:'#888'}}>No products with quantity entered.</td></tr>
                    ) : (
                      confirmRows.map((row, idx) => (
                        <tr key={idx}>
                          <td>{row.name}</td>
                          <td style={{textAlign:'center'}}>{row.sku}</td>
                          <td style={{textAlign:'center'}}>{row.unit}</td>
                          <td style={{textAlign:'center'}}>{row.qty}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 12}}>
                <button className="export-btn" style={{padding:'6px 18px', borderRadius:6, background:'#00b4d8', color:'#fff', border:'none', fontWeight:600, fontSize:'1em', cursor:'pointer'}}
                  onClick={() => exportToCSV(confirmRows)}>
                  Export to Excel
                </button>
                <label style={{fontSize:'1em', color:'#e0e6ed', marginLeft: 12}}>
                  <input type="checkbox" checked={confirmChecked} onChange={e => setConfirmChecked(e.target.checked)} style={{marginRight:8}} />
                  I confirm the above stocktake is correct
                </label>
              </div>
              <div style={{display:'flex', justifyContent:'flex-end', gap: 12}}>
                <button onClick={() => setShowConfirm(false)} style={{padding:'6px 18px', borderRadius:6, background:'#888', color:'#fff', border:'none', fontWeight:600, fontSize:'1em', cursor:'pointer'}}>Cancel</button>
                <button
                  className="save-btn"
                  style={{padding:'6px 18px', borderRadius:6, background:'#00e676', color:'#181a20', border:'none', fontWeight:600, fontSize:'1em', cursor: confirmChecked ? 'pointer' : 'not-allowed', opacity: confirmChecked ? 1 : 0.6}}
                  disabled={!confirmChecked || saving}
                  onClick={handleFinalSubmit}
                >
                  {saving ? 'Saving...' : 'Submit Stocktake'}
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