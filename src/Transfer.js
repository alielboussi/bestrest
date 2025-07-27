import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import supabase from './supabase';
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
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]); // [{product_id, name, sku, price, qty}]
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
        setFilteredProducts(productsData || []);
        // Map selectedProducts from entries
        const selected = (entries || []).map(e => {
          const prod = (productsData || []).find(p => p.id === e.product_id);
          return prod ? { product_id: prod.id, name: prod.name, sku: prod.sku, price: prod.price, qty: e.quantity } : null;
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
          const { data: products } = await supabase
            .from('products')
            .select('id, name, sku, price')
            .in('id', productIds);
          setProducts(products || []);
          setFilteredProducts(products || []);
        });
    } else {
      setProducts([]);
      setFilteredProducts([]);
    }
    setSelectedProducts([]);
  }, [fromLocation]);

  useEffect(() => {
    if (!search) {
      setFilteredProducts(products);
      return;
    }
    const s = search.toLowerCase();
    setFilteredProducts(
      products.filter(
        p =>
          p.name.toLowerCase().includes(s) ||
          (p.sku && p.sku.toLowerCase().includes(s)) ||
          (p.price && p.price.toString().includes(s))
      )
    );
  }, [search, products]);

  const handleQtyChange = (product_id, qty) => {
    setSelectedProducts(rows => {
      const exists = rows.find(r => r.product_id === product_id);
      if (exists) {
        return rows.map(r => r.product_id === product_id ? { ...r, qty } : r);
      } else {
        const prod = products.find(p => p.id === product_id);
        return [...rows, { product_id, name: prod.name, sku: prod.sku, price: prod.price, qty }];
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
      // Create entries
      const entries = selectedProducts.map(r => ({ session_id: sessionId, product_id: r.product_id, quantity: r.qty }));
      const { error: entErr } = await supabase.from('stock_transfer_entries').insert(entries);
      if (entErr) throw entErr;
      // Update inventory: subtract from fromLocation, add to toLocation
      for (const r of selectedProducts) {
        // Subtract from fromLocation
        const { data: invFrom } = await supabase.from('inventory').select('id, quantity').eq('product_id', r.product_id).eq('location', fromLocation).single();
        if (invFrom) {
          await supabase.from('inventory').update({ quantity: (parseFloat(invFrom.quantity) - parseFloat(r.qty)), updated_at: new Date() }).eq('id', invFrom.id);
        }
        // Add to toLocation
        const { data: invTo } = await supabase.from('inventory').select('id, quantity').eq('product_id', r.product_id).eq('location', toLocation).single();
        if (invTo) {
          await supabase.from('inventory').update({ quantity: (parseFloat(invTo.quantity) + parseFloat(r.qty)), updated_at: new Date() }).eq('id', invTo.id);
        } else {
          await supabase.from('inventory').insert({ product_id: r.product_id, location: toLocation, quantity: r.qty, updated_at: new Date() });
        }
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Failed to process transfer.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="transfer-container">
      <h1>{id ? 'Edit Transfer' : 'Stock Transfer'}</h1>
      <div className="transfer-form">
        {loading ? <div>Loading...</div> : <>
        <label>Date of Transfer:</label>
        <input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} required />
        <label>From Location:</label>
        <select value={fromLocation} onChange={e => setFromLocation(e.target.value)} required disabled={!!id}>
          <option value="">-- Select --</option>
          {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
        </select>
        <label>To Location:</label>
        <select value={toLocation} onChange={e => setToLocation(e.target.value)} required>
          <option value="">-- Select --</option>
          {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
        </select>
        <label>Delivery #:</label>
        <input type="text" value={deliveryNumber} onChange={e => setDeliveryNumber(e.target.value)} />
        <label>Search Products:</label>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, SKU, or Price" />
        <table className="transfer-table">
          <thead>
            <tr><th>Product</th><th>SKU</th><th>Price</th><th>Qty</th></tr>
          </thead>
          <tbody>
            {filteredProducts.map(p => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.sku}</td>
                <td>{p.price}</td>
                <td>
                  <input
                    type="number"
                    min="0"
                    value={selectedProducts.find(r => r.product_id === p.id)?.qty || ''}
                    onChange={e => handleQtyChange(p.id, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={handleSubmit} disabled={saving}>{id ? 'Save Changes' : 'Process Transfer'}</button>
        {error && <div className="transfer-error">{error}</div>}
        <button
          type="button"
          className="back-dashboard-btn"
          onClick={() => navigate('/dashboard')}
        >
          ← Back to Dashboard
        </button>
        </>}
      </div>
    </div>
  );
};

export default Transfer;
