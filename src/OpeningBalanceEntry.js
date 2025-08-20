import React, { useEffect, useState } from 'react';
import { FaCashRegister, FaPlus } from 'react-icons/fa';
import supabase from './supabase';
import { getMaxSetQty, selectPrice } from './utils/setInventoryUtils';
import './POS.css';

export default function OpeningBalanceEntry() {
  // Core state
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [currency, setCurrency] = useState('K');
  const [receiptNumber, setReceiptNumber] = useState('');
  // New customer modal
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState('');
  const [customerForm, setCustomerForm] = useState({ name: '', phone: '', tpin: '', address: '', city: '', currency: 'K' });

  // Catalog
  const [products, setProducts] = useState([]);
  const [sets, setSets] = useState([]);
  const [search, setSearch] = useState('');

  // Cart
  const [cart, setCart] = useState([]); // items: {id, name, sku, qty, price, isSet?, isCustom?}
  const [discountAll, setDiscountAll] = useState(0);

  // Custom price/product modals
  const [showCustomPriceModal, setShowCustomPriceModal] = useState(false);
  const [customPriceIdx, setCustomPriceIdx] = useState(null);
  const [customPriceValue, setCustomPriceValue] = useState(0);
  const [showCustomProductModal, setShowCustomProductModal] = useState(false);
  const [customProductForm, setCustomProductForm] = useState({ name: '', price: '', qty: 1 });
  const [customProductError, setCustomProductError] = useState('');
  // Amount-only entry
  const [amountOnly, setAmountOnly] = useState('');
  const [amountDesc, setAmountDesc] = useState('');

  // UX
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    // Prefetch locations and customers with currency + opening balance
    (async () => {
      const [{ data: locs }, { data: custs }] = await Promise.all([
        supabase.from('locations').select('id, name'),
        supabase.from('customers').select('id, name, phone, currency, opening_balance'),
      ]);
      setLocations(locs || []);
      setCustomers(custs || []);
    })();
  }, []);

  // When customer changes, reflect currency and show current opening balance
  useEffect(() => {
    const cust = customers.find(c => String(c.id) === String(selectedCustomer));
    if (cust?.currency) setCurrency(cust.currency);
  }, [selectedCustomer, customers]);

  // Fetch products and sets (global search; stock shown only when a location is selected)
  useEffect(() => {
    (async () => {
      // Base products
      const { data: productsData } = await supabase
        .from('products')
        .select('id, name, sku, price, promotional_price, currency, product_locations(location_id)');

      let invMap = {};
      if (selectedLocation) {
        const { data: invData } = await supabase
          .from('inventory')
          .select('product_id, quantity')
          .eq('location', selectedLocation);
        invMap = (invData || []).reduce((m, r) => { m[r.product_id] = Number(r.quantity) || 0; return m; }, {});
      }

      let productList = productsData || [];
      if (selectedLocation) {
        productList = productList.filter(p => Array.isArray(p.product_locations) && p.product_locations.some(pl => String(pl.location_id) === String(selectedLocation)));
      }
      const finalProducts = productList.map(p => ({
        ...p,
        stock: selectedLocation ? (invMap[p.id] ?? 0) : undefined,
      }));

      // Sets / combos
      const [{ data: combosData }, { data: comboItemsData }] = await Promise.all([
        supabase.from('combos').select('id, combo_name, sku, standard_price, promotional_price, combo_price, currency, combo_locations:combo_locations(location_id)'),
        supabase.from('combo_items').select('combo_id, product_id, quantity'),
      ]);

      let combosForLocation = (combosData || []);
      if (selectedLocation) {
        combosForLocation = combosForLocation.filter(combo => {
          const locationIds = Array.isArray(combo.combo_locations) ? combo.combo_locations.map(cl => String(cl.location_id)) : [];
          return locationIds.includes(String(selectedLocation));
        });
      }

      function calcSetQtyWithInv(comboId) {
        if (!selectedLocation) return undefined;
        const items = (comboItemsData || []).filter(ci => String(ci.combo_id) === String(comboId));
        return getMaxSetQty(items, invMap);
      }

      const filteredSets = combosForLocation.map(combo => ({
        ...combo,
        price: selectPrice(combo.promotional_price, combo.standard_price ?? combo.combo_price),
        currency: combo.currency ?? '',
        stock: calcSetQtyWithInv(combo.id),
        isSet: true,
      }));

      setSets(filteredSets);
      setProducts(finalProducts);
    })();
  }, [selectedLocation]);

  // Helpers
  const getBestPrice = (item) => selectPrice(item.promotional_price, item.price);
  const addToCart = (item) => setCart(c => ([...c, { ...item, qty: 1, price: getBestPrice(item), isSet: item.isSet || false, isCustom: false }]));
  const updateCartItem = (idx, changes) => setCart(c => c.map((it, i) => i === idx ? { ...it, ...changes } : it));
  const removeCartItem = (idx) => setCart(c => c.filter((_, i) => i !== idx));

  const capitalizeWords = (str) => str.replace(/\b\w/g, ch => ch.toUpperCase());

  const handleAddCustomer = async (e) => {
    e.preventDefault();
    setCustomerError('');
    setCustomerLoading(true);
    if (!customerForm.name.trim() && !customerForm.phone.trim()) {
      setCustomerError('Please enter at least one field (name or phone).');
      setCustomerLoading(false);
      return;
    }
    const name = capitalizeWords(customerForm.name.trim());
    const payload = {
      name,
      phone: customerForm.phone.trim(),
      tpin: customerForm.tpin.trim(),
      address: customerForm.address.trim(),
      city: customerForm.city.trim(),
      currency: customerForm.currency || 'K',
    };
    const { data, error } = await supabase.from('customers').insert([payload]).select();
    if (error) {
      setCustomerError(error.message);
    } else {
      setCustomers(prev => [...prev, ...data]);
      setSelectedCustomer(data[0].id);
      if (data[0].currency) setCurrency(data[0].currency);
      setShowCustomerModal(false);
      setCustomerForm({ name: '', phone: '', tpin: '', address: '', city: '', currency: 'K' });
    }
    setCustomerLoading(false);
  };

  const addCustomProductToCart = () => {
    setCustomProductError('');
    const name = customProductForm.name.trim();
    const price = Number(customProductForm.price);
    const qty = Number(customProductForm.qty);
    if (!name || isNaN(price) || price <= 0 || isNaN(qty) || qty <= 0) {
      setCustomProductError('Enter valid name, price, and quantity.');
      return;
    }
    setCart(c => ([...c, { id: `custom-${Date.now()}`, name, sku: '', qty, price, isCustom: true, isSet: false, currency } ]));
    setShowCustomProductModal(false);
    setCustomProductForm({ name: '', price: '', qty: 1 });
  };

  // Totals
  const subtotal = cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty || 0)), 0);
  const discountAmount = Number(discountAll) || 0;
  const total = Math.max(0, subtotal - discountAmount + (cart.length === 0 ? Number(amountOnly || 0) : 0));

  // Save as opening-balance-only sale (no stock deduction)
  const handleRecord = async () => {
    setError('');
    setSuccess('');
  if (!selectedCustomer) { setError('Select a customer.'); return; }
    if (!receiptNumber.trim()) { setError('Enter a receipt number.'); return; }
  if ((cart.length === 0 && !(Number(amountOnly) > 0)) || total <= 0) { setError('Enter an amount or add items to cart.'); return; }
    const cust = customers.find(c => String(c.id) === String(selectedCustomer));
    const opening = Number(cust?.opening_balance || 0);
  // No guard: if customer has no opening balance, we'll create it now by increasing it

    setSaving(true);
    try {
      // 1) Create layby record first so we can link the sale to it
      const { data: laybyRows, error: laybyErr } = await supabase
        .from('laybys')
        .insert([
          {
            customer_id: cust.id,
            total_amount: total,
            paid_amount: 0,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            notes: amountDesc || null,
          }
        ])
        .select();
      if (laybyErr) throw laybyErr;
      const laybyId = laybyRows?.[0]?.id;

      // 2) Create sale linked to the layby
      const { data: saleData, error: saleError } = await supabase
        .from('sales')
        .insert([
          {
            customer_id: cust.id,
            // Ensure a full timestamp string
    sale_date: new Date(date).toISOString(),
            total_amount: total,
            status: 'layby',
            updated_at: new Date().toISOString(),
            location_id: selectedLocation || null,
            layby_id: laybyId || null,
            currency,
            discount: discountAmount,
            down_payment: 0,
            receipt_number: `#${receiptNumber.trim().replace(/^#*/, '')}`,
          }
        ])
        .select();
  if (saleError) throw saleError;
  if (!saleData || !saleData[0]?.id) throw new Error('Failed to create sale (no ID returned).');
      const saleId = saleData[0].id;

      // 2b) Backfill layby with sale_id for management screens
      if (laybyId) {
        await supabase.from('laybys').update({ sale_id: saleId, updated_at: new Date().toISOString() }).eq('id', laybyId);
      }

      // 3) Insert sale items; amount-only uses a single custom line; sets expand into components with price 0
      const saleItems = [];
      if (cart.length === 0 && Number(amountOnly) > 0) {
        saleItems.push({ sale_id: saleId, product_id: null, quantity: 1, unit_price: Number(amountOnly), currency, display_name: amountDesc || 'Opening balance entry' });
      } else {
        for (const item of cart) {
          if (item.isCustom) {
            saleItems.push({ sale_id: saleId, product_id: null, quantity: Number(item.qty), unit_price: Number(item.price), currency: item.currency || currency, display_name: item.name });
          } else if (item.isSet) {
            const comboIdInt = typeof item.id === 'string' ? parseInt(String(item.id).replace('set-', ''), 10) : item.id;
            const { data: comboItemsData } = await supabase.from('combo_items').select('product_id, quantity').eq('combo_id', comboIdInt);
            for (const ci of comboItemsData || []) {
              saleItems.push({ sale_id: saleId, product_id: ci.product_id, quantity: Number(ci.quantity) * Number(item.qty), unit_price: 0, currency: item.currency || currency });
            }
          } else {
            saleItems.push({ sale_id: saleId, product_id: item.id, quantity: Number(item.qty), unit_price: Number(item.price), currency: item.currency || currency });
          }
        }
      }
      const { error: itemsError } = await supabase.from('sales_items').insert(saleItems);
      if (itemsError) throw itemsError;

  // 4) Set customer's opening balance to the page total (starting balance)
  const newOpening = total;
  await supabase.from('customers').update({ opening_balance: newOpening }).eq('id', cust.id);

  // 5) Refresh local state
  setCustomers(prev => prev.map(c => c.id === cust.id ? { ...c, opening_balance: newOpening } : c));
  setSuccess('Opening balance set from this entry. Stock was not deducted.');
  setCart([]);
      setDiscountAll(0);
      setReceiptNumber('');
  setAmountOnly('');
  setAmountDesc('');
    } catch (err) {
      // Show more informative error details to help diagnose issues
      const msg = (err && (err.message || err.error_description)) ? err.message || err.error_description : 'Failed to record opening balance sale.';
      setError(msg);
    }
    setSaving(false);
  };

  // Filters
  const searchValue = search.trim().toLowerCase();
  const filteredProducts = searchValue ? products.filter(p => {
    const n = String(p.name || '').toLowerCase();
    const s = String(p.sku || '').toLowerCase();
    return n.includes(searchValue) || s.includes(searchValue);
  }) : [];
  const filteredSets = searchValue ? sets.filter(s => {
    const n = String(s.combo_name || '').toLowerCase();
    const sk = String(s.sku || '').toLowerCase();
    return n.includes(searchValue) || sk.includes(searchValue);
  }) : [];

  // UI
  return (
    <div className="pos-container">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}><FaCashRegister style={{ marginRight: 6, fontSize: '1.1rem' }} /> Opening Balance Entry</h2>
      </div>

      <div className="pos-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} style={{ fontSize: '1rem', width: 170, height: 40, borderRadius: 6 }}>
          <option value="">All Locations</option>
          {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ fontSize: '1rem', width: 160, height: 40, borderRadius: 6, padding: '0 12px', background: '#222', color: '#fff', border: '1px solid #333' }} />
        <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ fontSize: '1rem', width: 80, height: 40, borderRadius: 6 }}>
          <option value="K">K</option>
          <option value="$">$</option>
        </select>
        <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} style={{ fontSize: '1rem', width: 220, height: 40, borderRadius: 6 }}>
          <option value="">Select Customer</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
        </select>
        <button type="button" onClick={() => setShowCustomerModal(true)} style={{ fontSize: '1rem', width: 200, height: 40, borderRadius: 6, background: '#00b4ff', color: '#fff', fontWeight: 600, border: 'none' }}>New Customer</button>
        {selectedCustomer && (
          <span style={{ background: '#2e7d32', color: '#fff', padding: '4px 10px', borderRadius: 8, fontSize: '0.92rem', fontWeight: 700 }}>
            Opening balance: {currency} {Number(customers.find(c => String(c.id) === String(selectedCustomer))?.opening_balance || 0).toLocaleString()}
          </span>
        )}
      </div>

      <div className="pos-row" style={{ gap: 10, marginBottom: 6, alignItems: 'center', display: 'flex', flexWrap: 'nowrap' }}>
        <button type="button" onClick={() => setShowCustomProductModal(true)} style={{ fontSize: '0.92rem', padding: '2px 8px', height: 40, width: 220, minWidth: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#00b4d8', color: '#fff', border: 'none', borderRadius: 6 }}>
          <FaPlus style={{ marginRight: 4 }} /> Add Custom Product/Service
        </button>
        <input type="text" placeholder="Search product or SKU..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1, height: 40, borderRadius: 6, background: '#222', color: '#fff', border: '1px solid #333', padding: '0 10px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative', width: 190 }}>
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#aaa' }}>#</span>
          <input type="text" placeholder="Receipt Number" value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} style={{ height: 40, width: '100%', paddingLeft: 22, borderRadius: 6, background: '#222', color: '#fff', border: '1px solid #333' }} />
        </div>
      </div>

      {/* Amount-only entry controls */}
      <div className="pos-row" style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
        <input type="number" min="0" placeholder="Amount (no items)" value={amountOnly} onChange={e => setAmountOnly(e.target.value)} style={{ width: 220, height: 40, borderRadius: 6, background: '#222', color: '#fff', border: '1px solid #333', padding: '0 10px' }} />
        <input type="text" placeholder="Description (optional)" value={amountDesc} onChange={e => setAmountDesc(e.target.value)} style={{ width: 320, height: 40, borderRadius: 6, background: '#222', color: '#fff', border: '1px solid #333', padding: '0 10px' }} />
        <span style={{ color: '#aaa', fontSize: '0.9rem' }}>
          Tip: leave Amount empty if you prefer to add products/services instead
        </span>
      </div>

      <div className="pos-products" style={{ gap: 0 }}>
        {[...filteredProducts.map(product => (
          <button key={product.id} className="pos-product-btn" onClick={() => addToCart(product)}>
            {product.name} ({product.sku})<br />
            {product.stock !== undefined && (<>
              Stock: {product.stock}<br />
            </>)}
            <b>Price: {getBestPrice(product).toFixed(2)} {product.currency || currency}</b>
          </button>
        )),
        ...filteredSets.map(set => (
          <button key={`set-${set.id}`} className="pos-product-btn" onClick={() => addToCart(set)}>
            {set.combo_name} (Set) ({set.sku})<br />
            {set.stock !== undefined && (
              <>
                <span style={{ color: '#00b4d8' }}>Stock: {set.stock}</span><br />
              </>
            )}
            <b>Price: {getBestPrice(set).toFixed(2)} {set.currency || currency}</b>
          </button>
        ))]}
      </div>

      <table className="pos-table" style={{ fontSize: '0.95rem' }}>
        <thead>
          <tr>
            <th className="text-col" style={{ padding: 4 }}>SKU</th>
            <th className="text-col" style={{ padding: 4 }}>Name</th>
            <th className="num-col" style={{ padding: 4 }}>Qty</th>
            <th className="num-col" style={{ padding: 4 }}>Amount</th>
            <th className="action-col" style={{ padding: 4 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item, idx) => (
            <tr key={idx}>
              <td className="text-col" style={{ padding: 4 }}>{item.sku || (item.isCustom ? '-' : '')}</td>
              <td className="text-col" style={{ padding: 4 }}>
                {item.name}{item.isCustom && <span style={{ color: '#00b4d8', fontSize: '0.9em', marginLeft: 4 }}>(Custom)</span>}
                {item.isSet && <span style={{ color: '#00b4d8', fontSize: '0.9em', marginLeft: 8 }}>(Stock: {item.stock})</span>}
              </td>
              <td className="num-col" style={{ padding: 4 }}>
                <input type="number" min="1" value={item.qty} onChange={e => updateCartItem(idx, { qty: Number(e.target.value) })} style={{ width: 56, height: 24, textAlign: 'center' }} />
              </td>
              <td className="num-col" style={{ padding: 4 }}>{Number(item.price).toFixed(2)}</td>
              <td className="action-col" style={{ padding: 4, display: 'flex', gap: 4 }}>
                <button onClick={() => removeCartItem(idx)} style={{ padding: '2px 8px', height: 24 }}>Remove</button>
                <button onClick={() => { setCustomPriceIdx(idx); setCustomPriceValue(item.price); setShowCustomPriceModal(true); }} style={{ padding: '2px 8px', height: 24, background: '#00b4d8', color: '#fff', border: 'none', borderRadius: 4 }}>Set Custom Price</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showCustomPriceModal && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            <h3>Set Custom Price</h3>
            <input type="number" min="0" value={customPriceValue} onChange={e => setCustomPriceValue(e.target.value)} style={{ width: 120, fontSize: '1.1em', marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { if (customPriceIdx !== null) updateCartItem(customPriceIdx, { price: Number(customPriceValue) }); setShowCustomPriceModal(false); }} style={{ background: '#00b4d8', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px' }}>Save</button>
              <button onClick={() => setShowCustomPriceModal(false)} style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showCustomProductModal && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            <h3>Add Custom Product/Service</h3>
            <input type="text" placeholder="Name" value={customProductForm.name} onChange={e => setCustomProductForm(f => ({ ...f, name: e.target.value }))} style={{ width: 220, marginBottom: 8 }} />
            <input type="number" placeholder="Price" value={customProductForm.price} onChange={e => setCustomProductForm(f => ({ ...f, price: e.target.value }))} style={{ width: 120, marginBottom: 8 }} />
            <input type="number" placeholder="Quantity" value={customProductForm.qty} min={1} onChange={e => setCustomProductForm(f => ({ ...f, qty: e.target.value }))} style={{ width: 80, marginBottom: 8 }} />
            {customProductError && <div style={{ color: '#ff5252', marginBottom: 8 }}>{customProductError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addCustomProductToCart} style={{ background: '#00b4d8', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px' }}>Add</button>
              <button onClick={() => { setShowCustomProductModal(false); setCustomProductError(''); }} style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showCustomerModal && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            <h3>New Customer</h3>
            {customerError && <div style={{ color: '#ff5252', marginBottom: 8 }}>{customerError}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <input type="text" placeholder="Name" value={customerForm.name} onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))} style={{ width: 260, height: 36 }} />
              <input type="text" placeholder="Phone" value={customerForm.phone} onChange={e => setCustomerForm(f => ({ ...f, phone: e.target.value }))} style={{ width: 180, height: 36 }} />
              <input type="text" placeholder="TPIN" value={customerForm.tpin} onChange={e => setCustomerForm(f => ({ ...f, tpin: e.target.value }))} style={{ width: 140, height: 36 }} />
              <input type="text" placeholder="Address" value={customerForm.address} onChange={e => setCustomerForm(f => ({ ...f, address: e.target.value }))} style={{ width: 260, height: 36 }} />
              <input type="text" placeholder="City" value={customerForm.city} onChange={e => setCustomerForm(f => ({ ...f, city: e.target.value }))} style={{ width: 160, height: 36 }} />
              <select value={customerForm.currency} onChange={e => setCustomerForm(f => ({ ...f, currency: e.target.value }))} style={{ width: 100, height: 36 }}>
                <option value="K">K</option>
                <option value="$">$</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleAddCustomer} disabled={customerLoading} style={{ background: '#00b4d8', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', minWidth: 120 }}>
                {customerLoading ? 'Saving…' : 'Save Customer'}
              </button>
              <button onClick={() => { setShowCustomerModal(false); setCustomerError(''); }} style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="pos-summary" style={{ fontSize: '1rem', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, marginBottom: 8 }}>
        <div>Subtotal: {subtotal.toFixed(2)}</div>
        <div>
          Discount: <input type="number" min="0" max={subtotal} value={discountAll} onChange={e => setDiscountAll(e.target.value)} style={{ width: 80, marginLeft: 6, height: 24 }} />
        </div>
        <div><b>Total: {total.toFixed(2)} {currency}</b></div>
      </div>

      <div className="pos-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <button onClick={handleRecord} disabled={saving || total <= 0 || !selectedCustomer || !receiptNumber.trim()} style={{ fontSize: '0.95rem', padding: '6px 14px', height: 32, whiteSpace: 'nowrap', minWidth: 220 }}>
          {saving ? 'Saving...' : 'Record'}
        </button>
        {/* Hint why Record is disabled */}
        {(!saving && (total <= 0 || !selectedCustomer || !receiptNumber.trim())) && (
          <span style={{ color: '#aaa', fontSize: '0.9rem' }}>
            {!selectedCustomer ? 'Select a customer' : !receiptNumber.trim() ? 'Enter a receipt number' : 'Total must be greater than 0'}
          </span>
        )}
      </div>

      {error && <div style={{ color: '#ff5252', marginTop: 10 }}>{error}</div>}
      {success && <div style={{ color: '#4caf50', marginTop: 10 }}>{success}</div>}
    </div>
  );
}
