

import React, { useState, useEffect } from 'react';
import supabase from './supabase';
import { useNavigate } from 'react-router-dom';
import PasswordPage from './PasswordPage';

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
  // Show password page if not entered
  const [passwordEntered, setPasswordEntered] = useState(() => localStorage.getItem('closingStockPasswordEntered') === 'true');
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
  const navigate = useNavigate();

  // Listen for password entry event (in case PasswordPage sets it)
  useEffect(() => {
    const check = () => {
      if (localStorage.getItem('closingStockPasswordEntered') === 'true') {
        setPasswordEntered(true);
      }
    };
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  }, []);

  if (!passwordEntered) {
    return <PasswordPage />;
  }

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
      .from('product_locations')
      .select('product_id, products(id, name, sku, unit_of_measure_id)')
      .eq('location_id', selectedLocation)
      .then(({ data }) => {
        // Map to just the product objects
        setProducts((data || []).map(row => row.products));
      });
    setSearch(''); // Clear search when location changes
  }, [selectedLocation]);

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
            user_id: null, // No user for public closing stock
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
            user_id: null, // No user for public closing stock
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

  // Show all products if search is empty, otherwise filter
  const filteredProducts = search.trim().length > 0
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
      )
    : products;


  // After successful submission, reset password entry so next user must re-enter
  useEffect(() => {
    if (!showConfirm && !saving && passwordEntered) {
      // If navigated away after submit, clear password entry
      const handle = () => {
        localStorage.removeItem('closingStockPasswordEntered');
      };
      window.addEventListener('beforeunload', handle);
      return () => window.removeEventListener('beforeunload', handle);
    }
  }, [showConfirm, saving, passwordEntered]);

  return (
    <div className="products-container">
      <div className="product-form" style={{maxWidth: 700, margin: '2rem auto'}}>
        {/* ...existing code... */}
        <h2 className="products-title" style={{marginTop: 0, marginBottom: '1.2rem'}}>Closing Stock</h2>
        {/* ...existing code... */}
      </div>
    </div>
  );
}
export default ClosingStock;