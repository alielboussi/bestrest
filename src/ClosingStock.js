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
  // Only require password entry as the gate
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
    // Also check on mount in case PasswordPage redirected here
    check();
    return () => window.removeEventListener('storage', check);
  }, []);

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

  if (!passwordEntered) {
    return <PasswordPage />;
  }

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

  return (
    <div className="products-container">
      <div className="product-form" style={{maxWidth: 700, margin: '2rem auto'}}>
        <h2 className="products-title" style={{marginTop: 0, marginBottom: '1.2rem'}}>Closing Stock</h2>
        {/* ...rest of the closing stock form and logic, but no password generator or password entry UI here... */}
      </div>
    </div>
  );
}
export default ClosingStock;
// end of file
