
import React, { useState, useEffect } from "react";
import supabase from "./supabase";
import { useNavigate } from "react-router-dom";
import { FaCashRegister, FaPlus, FaSearch, FaUserPlus } from "react-icons/fa";
import "./POS.css";

export default function POS() {
  // State hooks
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showEditCustomerModal, setShowEditCustomerModal] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "", tpin: "", address: "", city: "" });
  const [editCustomerForm, setEditCustomerForm] = useState({ id: null, name: "", phone: "", tpin: "", address: "", city: "" });
  const [customerError, setCustomerError] = useState("");
  const [editCustomerError, setEditCustomerError] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [editCustomerLoading, setEditCustomerLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutSuccess, setCheckoutSuccess] = useState("");
  const [currency, setCurrency] = useState("K");
  const [products, setProducts] = useState([]);
  const [sets, setSets] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]); // [{product, qty, price, vat}]
  const [vatIncluded, setVatIncluded] = useState(true);
  const [discountAll, setDiscountAll] = useState(0);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [receiptNumber, setReceiptNumber] = useState("");
  const [customerLaybys, setCustomerLaybys] = useState([]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showCustomPriceModal, setShowCustomPriceModal] = useState(false);
  const [customPriceIdx, setCustomPriceIdx] = useState(null);
  const [customPriceValue, setCustomPriceValue] = useState(0);
  const [showCustomProductModal, setShowCustomProductModal] = useState(false);
  const [customProductForm, setCustomProductForm] = useState({ name: '', price: '', qty: 1 });
  const [customProductError, setCustomProductError] = useState('');
  const navigate = useNavigate();

  // Fetch locations and customers
  useEffect(() => {
    supabase.from("locations").select("id, name").then(({ data }) => setLocations(data || []));
    supabase.from("customers").select("id, name, phone").then(({ data }) => setCustomers(data || []));
  }, []);

  // Fetch products and sets for selected location
  useEffect(() => {
    if (selectedLocation) {
      // Fetch products and aggregate stock by product_id
      supabase
        .from("inventory")
        .select("product_id, quantity, product:products(id, name, sku, price:price, promotional_price, currency), updated_at, created_at")
        .eq("location", selectedLocation)
        .then(({ data }) => {
          // For each product, use only the latest row (by updated_at, fallback to created_at)
          const productMap = {};
          (data || []).forEach(row => {
            if (!row.product) return;
            const pid = row.product.id;
            const current = productMap[pid];
            // Compare updated_at or created_at to keep the latest
            const rowTime = row.updated_at || row.created_at || '';
            const currentTime = current ? (current.updated_at || current.created_at || '') : '';
            if (!current || rowTime > currentTime) {
              productMap[pid] = { ...row.product, stock: Number(row.quantity) || 0, updated_at: row.updated_at, created_at: row.created_at };
            }
          });
          setProducts(Object.values(productMap));
        });
      // Fetch sets/kits (combos)
      supabase
        .from("combo_inventory")
        .select("combo_id, quantity, combo:combos(id, combo_name, sku, price:price, promotional_price, currency)")
        .eq("location_id", selectedLocation)
        .then(({ data }) => {
          setSets((data || []).map(row => ({
            ...row.combo,
            stock: row.quantity,
            isSet: true
          })));
        });
    } else {
      setProducts([]);
      setSets([]);
    }
  }, [selectedLocation]);

  // Helper: get correct price (use promo if present and > 0, else use price if present and > 0)
  const getBestPrice = (item) => {
    // Defensive: handle null, undefined, empty string, string 'null', and string numbers
    let std = item.price;
    let promo = item.promotional_price;
    if (std === null || std === undefined || std === '' || std === 'null') std = 0;
    if (promo === null || promo === undefined || promo === '' || promo === 'null') promo = 0;
    std = Number(std);
    promo = Number(promo);
    const hasStandard = !isNaN(std) && std > 0;
    const hasPromo = !isNaN(promo) && promo > 0;
    if (hasPromo) {
      // Use promo if present and > 0
      return promo;
    } else if (hasStandard) {
      // Use standard if promo is not present or not > 0
      return std;
    } else {
      return 0;
    }
  };

  // Add product or set to cart
  const addToCart = (item) => {
    setCart([
      ...cart,
      {
        ...item,
        qty: 1,
        price: getBestPrice(item),
        isSet: item.isSet || false,
        isCustom: false
      }
    ]);
  };

  // Add custom product/service to cart
  const addCustomProductToCart = () => {
    setCustomProductError('');
    const name = customProductForm.name.trim();
    const price = Number(customProductForm.price);
    const qty = Number(customProductForm.qty);
    if (!name || isNaN(price) || price <= 0 || isNaN(qty) || qty <= 0) {
      setCustomProductError('Enter valid name, price, and quantity.');
      return;
    }
    setCart([
      ...cart,
      {
        id: `custom-${Date.now()}-${Math.floor(Math.random()*10000)}`,
        name,
        sku: '',
        qty,
        price,
        isCustom: true,
        isSet: false,
        currency,
      }
    ]);
    setShowCustomProductModal(false);
    setCustomProductForm({ name: '', price: '', qty: 1 });
  };

  // Update cart item
  const updateCartItem = (idx, changes) => {
    setCart(cart.map((item, i) => (i === idx ? { ...item, ...changes } : item)));
  };

  // Remove cart item
  const removeCartItem = (idx) => {
    setCart(cart.filter((_, i) => i !== idx));
  };

  // Add new customer (modal logic)
  const handleAddCustomer = async (e) => {
    e.preventDefault();
    setCustomerError("");
    setCustomerLoading(true);
    if (!customerForm.name.trim() && !customerForm.phone.trim()) {
      setCustomerError("Please enter at least one field (name or phone).");
      setCustomerLoading(false);
      return;
    }
    // Insert customer with TPIN, address, city
    const { data, error } = await supabase
      .from("customers")
      .insert([{ 
        name: customerForm.name.trim(), 
        phone: customerForm.phone.trim(),
        tpin: customerForm.tpin.trim(),
        address: customerForm.address.trim(),
        city: customerForm.city.trim()
      }])
      .select();
    if (error) {
      setCustomerError(error.message);
    } else {
      setCustomers((prev) => [...prev, ...data]);
      setSelectedCustomer(data[0].id);
      setShowCustomerModal(false);
      setCustomerForm({ name: "", phone: "", tpin: "", address: "", city: "" });
    }
    setCustomerLoading(false);
  };

  // Edit existing customer (modal logic)
  const openEditCustomerModal = (customer) => {
    setEditCustomerForm({
      id: customer.id,
      name: customer.name || "",
      phone: customer.phone || "",
      tpin: customer.tpin || "",
      address: customer.address || "",
      city: customer.city || ""
    });
    setEditCustomerError("");
    setShowEditCustomerModal(true);
  };

  const handleEditCustomer = async (e) => {
    e.preventDefault();
    setEditCustomerError("");
    setEditCustomerLoading(true);
    if (!editCustomerForm.name.trim() && !editCustomerForm.phone.trim()) {
      setEditCustomerError("Please enter at least one field (name or phone).");
      setEditCustomerLoading(false);
      return;
    }
    const { error } = await supabase
      .from("customers")
      .update({
        name: editCustomerForm.name.trim(),
        phone: editCustomerForm.phone.trim(),
        tpin: editCustomerForm.tpin.trim(),
        address: editCustomerForm.address.trim(),
        city: editCustomerForm.city.trim()
      })
      .eq("id", editCustomerForm.id);
    if (error) {
      setEditCustomerError(error.message);
    } else {
      setCustomers((prev) => prev.map(c => c.id === editCustomerForm.id ? { ...c, ...editCustomerForm } : c));
      setShowEditCustomerModal(false);
      // If the edited customer is selected, update their info
      if (selectedCustomer === editCustomerForm.id) {
        setSelectedCustomer(editCustomerForm.id);
      }
    }
    setEditCustomerLoading(false);
  };

  // Calculate totals (VAT is inclusive, not added)
  const subtotal = cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty)), 0);
  const discountAmount = Number(discountAll) || 0;
  const total = subtotal - discountAmount;


  // Handle checkout (Supabase integration, supports partial payments/layby)
  const handleCheckout = async () => {
    setCheckoutError("");
    setCheckoutSuccess("");
    if (!selectedLocation || !selectedCustomer || cart.length === 0) {
      setCheckoutError("Please select location, customer, and add products to cart.");
      return;
    }
    // Require receipt number
    if (!receiptNumber.trim()) {
      setCheckoutError("Please enter a receipt number.");
      return;
    }
    // If paymentAmount is not set or 0, treat as layby/partial
    let payAmt = Number(paymentAmount);
    if (payAmt < 0 || payAmt > total) {
      setCheckoutError("Enter a valid payment amount (<= total).");
      return;
    }
    if (!payAmt || payAmt === 0) payAmt = 0;
    setCheckoutLoading(true);
    try {
      let laybyId = null;
      let saleIdValue = null;
      // 1. If partial payment, create layby record first to get layby_id
      if (payAmt < total) {
        const { data: laybyData, error: laybyError } = await supabase
          .from("laybys")
          .insert([
            {
              customer_id: selectedCustomer,
              total_amount: total,
              paid_amount: payAmt,
              status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ])
          .select();
        if (laybyError) throw laybyError;
        laybyId = laybyData[0].id;
      } else {
        // For non-layby, generate a unique sale_id (e.g., SALE-<timestamp>-<random>)
        saleIdValue = `SALE-${Date.now()}-${Math.floor(Math.random()*10000)}`;
      }

      // 2. Insert sale with all required columns
      const { data: saleData, error: saleError } = await supabase
        .from("sales")
        .insert([
          {
            customer_id: selectedCustomer,
            sale_date: date,
            total_amount: total,
            status: payAmt < total ? 'layby' : 'completed',
            updated_at: new Date().toISOString(),
            location_id: selectedLocation,
            layby_id: laybyId,
            currency: currency,
            discount: discountAmount,
            sale_id: saleIdValue,
            receipt_number: `#${receiptNumber.trim().replace(/^#*/, "")}`,
          },
        ])
        .select();
      if (saleError) throw saleError;
      const saleId = saleData[0].id;

      // 3. Update layby with sale_id if layby was created
      if (laybyId) {
        await supabase.from("laybys").update({ sale_id: saleId }).eq("id", laybyId);
      }

      // 4. Insert sale_items
      const saleItems = cart.map((item) => (
        item.isCustom
          ? {
              sale_id: saleId,
              product_id: null,
              custom_name: item.name,
              quantity: item.qty,
              unit_price: item.price,
              currency: item.currency || currency
            }
          : {
              sale_id: saleId,
              product_id: item.id,
              quantity: item.qty,
              unit_price: item.price,
              currency: item.currency || currency
            }
      ));
      const { error: itemsError } = await supabase.from("sales_items").insert(saleItems);
      if (itemsError) throw itemsError;

      // 5. Insert payment (partial or full)
      const { error: payError } = await supabase.from("sales_payments").insert([
        {
          sale_id: saleId,
          amount: payAmt,
          payment_type: 'cash', // or allow user to select in future
          currency,
          payment_date: new Date().toISOString(),
        },
      ]);
      if (payError) throw payError;

      setCheckoutSuccess("Sale completed successfully!");
        // 6. Deduct inventory for each product in the cart at the selected location
        for (const item of cart) {
          if (item.isCustom) continue; // Skip inventory for custom products/services
          // ...existing code for inventory and product_locations...
          const { data: invRows, error: invError } = await supabase
            .from('inventory')
            .select('id, quantity')
            .eq('product_id', item.id)
            .eq('location', selectedLocation);
          if (invError) throw invError;
          if (invRows && invRows.length > 0) {
            const invId = invRows[0].id;
            const newQty = Math.max(0, (Number(invRows[0].quantity) || 0) - Number(item.qty));
            const { error: updateError } = await supabase
              .from('inventory')
              .update({ quantity: newQty, updated_at: new Date().toISOString() })
              .eq('id', invId);
            if (updateError) throw updateError;
          } else {
            const { error: insertError } = await supabase
              .from('inventory')
              .insert([
                {
                  product_id: item.id,
                  location: selectedLocation,
                  quantity: Math.max(0, 0 - Number(item.qty)),
                  updated_at: new Date().toISOString()
                }
              ]);
            if (insertError) throw insertError;
          }
          const { data: prodLocRows, error: prodLocError } = await supabase
            .from('product_locations')
            .select('id')
            .eq('product_id', item.id)
            .eq('location_id', selectedLocation);
          if (prodLocError) throw prodLocError;
          if (!prodLocRows || prodLocRows.length === 0) {
            const { error: insertProdLocError } = await supabase
              .from('product_locations')
              .insert([
                {
                  product_id: item.id,
                  location_id: selectedLocation
                }
              ]);
            if (insertProdLocError) throw insertProdLocError;
          }
        }
      setCart([]);
      setPaymentAmount(0);
      setReceiptNumber("");
      // Optionally, refresh laybys for this customer
      fetchCustomerLaybys(selectedCustomer);
    } catch (err) {
      setCheckoutError(err.message || "Checkout failed.");
    }
    setCheckoutLoading(false);
  };

  // Fetch laybys for customer
  const fetchCustomerLaybys = async (customerId) => {
    if (!customerId) return;
    const { data } = await supabase
      .from('laybys')
      .select('id, sale_id, total_amount, paid_amount, status, created_at, updated_at')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    setCustomerLaybys(data || []);
  };

  // When customer changes, fetch laybys
  useEffect(() => {
    fetchCustomerLaybys(selectedCustomer);
  }, [selectedCustomer]);



  return (
    <div className="pos-container">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}><FaCashRegister style={{ marginRight: 6, fontSize: '1.1rem' }} /> Point of Sale</h2>
      </div>
      <div className="pos-row" style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: 6,
        maxWidth: 1200,
        width: '100%',
        gap: 10,
        flexWrap: 'wrap',
      }}>
        {/* Unified controls row */}
        <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} required style={{ fontSize: '1rem', width: 170, height: 38, borderRadius: 6, boxSizing: 'border-box', marginRight: 0 }}>
          <option value="">Select Location</option>
          {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
        </select>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{
            fontSize: '1rem',
            width: 160,
            height: 38,
            borderRadius: 6,
            boxSizing: 'border-box',
            padding: '0 12px',
            background: '#222',
            color: '#fff',
            border: '1px solid #333',
            outline: 'none',
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            margin: 0,
          }}
        />
        <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ fontSize: '1rem', width: 80, height: 38, borderRadius: 6, boxSizing: 'border-box', marginRight: 0 }}>
          <option value="K">K</option>
          <option value="$">$</option>
        </select>
        <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} style={{ fontSize: '1rem', width: 180, height: 38, borderRadius: 6, boxSizing: 'border-box', marginRight: 0 }}>
          <option value="">Select Customer</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
        </select>
        {selectedCustomer && (
          <button type="button" style={{ fontSize: '1rem', width: 70, height: 38, borderRadius: 6, boxSizing: 'border-box', marginRight: 0, background: '#888', color: '#fff', border: 'none' }} onClick={() => {
            const cust = customers.find(c => c.id === selectedCustomer);
            if (cust) openEditCustomerModal(cust);
          }}>Edit</button>
        )}
        <button type="button" onClick={() => setShowCustomerModal(true)} style={{ fontSize: '1rem', width: 170, height: 38, borderRadius: 6, background: '#00b4ff', color: '#fff', fontWeight: 600, border: 'none', boxSizing: 'border-box', marginRight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FaUserPlus style={{ marginRight: 6 }} /> New Customer</button>
      </div>
      {/* ...rest of the component remains unchanged... */}
      <div className="pos-row" style={{ gap: 6, marginBottom: 6, alignItems: 'center', display: 'flex', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, position: 'relative' }}>
          <input
            type="text"
            placeholder="Receipt Number"
            value={receiptNumber}
            onChange={e => setReceiptNumber(e.target.value)}
            style={{ fontSize: '0.95rem', height: 38, width: 170, paddingLeft: 22, borderRadius: 6, boxSizing: 'border-box', background: '#222', color: '#fff', border: '1px solid #333', position: 'relative' }}
          />
          <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: '1.1rem', color: '#aaa', pointerEvents: 'none' }}>#</span>
        </div>
      </div>

      {/* Search row: Add Custom Product/Service button before search field */}
      <div className="pos-row" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', flexWrap: 'nowrap', gap: 10, width: 1200 }}>
        <button type="button" onClick={() => setShowCustomProductModal(true)} style={{ fontSize: '0.92rem', padding: '2px 8px', height: 38, width: 170, minWidth: 170, maxWidth: 170, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#00b4d8', color: '#fff', border: 'none', borderRadius: 6 }}>
          <FaPlus style={{ marginRight: 4 }} /> Add Custom Product/Service
        </button>
        <input
          type="text"
          placeholder="Search product by name or SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: '0.95rem', height: 38, minHeight: 38, maxHeight: 38, flex: 1, borderRadius: 6, boxSizing: 'border-box', background: '#222', color: '#fff', border: '1px solid #333', marginLeft: 0 }}
        />
      </div>
      <div className="pos-products" style={{ gap: 0 }}>
        {/* Only show products/sets if search is not empty */}
        {search.trim() && [
          ...products.filter(p =>
            p.name.toLowerCase().includes(search.toLowerCase()) ||
            (p.sku || "").toLowerCase().includes(search.toLowerCase())
          ).map(product => (
            <button key={product.id} className="pos-product-btn" onClick={() => addToCart(product)}>
              {product.name} ({product.sku})<br />Stock: {product.stock}<br />
              <b>Price: {getBestPrice(product).toFixed(2)} {product.currency || currency}</b>
              <div style={{fontSize:'0.8em',color:'#aaa'}}>std: {String(product.price)} | promo: {String(product.promotional_price)}</div>
            </button>
          )),
          ...sets.filter(s =>
            (s.combo_name || "").toLowerCase().includes(search.toLowerCase()) ||
            (s.sku || "").toLowerCase().includes(search.toLowerCase())
          ).map(set => (
            <button key={"set-" + set.id} className="pos-product-btn" onClick={() => addToCart(set)}>
              {set.combo_name} (Set) ({set.sku})<br />Stock: {set.stock}<br />
              <b>Price: {getBestPrice(set).toFixed(2)} {set.currency || currency}</b>
            </button>
          ))
        ]}
        {/* Show a message if no search */}
        {/* No message or spacer when search is empty; table will move up */}
      </div>
      <table className="pos-table" style={{ fontSize: '0.95rem', marginTop: '-85px' }}>
        <thead>
          <tr>
            <th className="text-col" style={{ fontSize: '0.95rem', padding: 4 }}>SKU</th>
            <th className="text-col" style={{ fontSize: '0.95rem', padding: 4 }}>Name</th>
            <th className="num-col" style={{ fontSize: '0.95rem', padding: 4 }}>Qty</th>
            <th className="num-col" style={{ fontSize: '0.95rem', padding: 4 }}>Amount</th>
            <th className="action-col" style={{ fontSize: '0.95rem', padding: 4 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item, idx) => (
            <tr key={idx}>
              <td className="text-col" style={{ padding: 4 }}>{item.sku || (item.isCustom ? '-' : '')}</td>
              <td className="text-col" style={{ padding: 4 }}>{item.name}{item.isCustom && <span style={{ color: '#00b4d8', fontSize: '0.9em', marginLeft: 4 }}>(Custom)</span>}</td>
              <td className="num-col" style={{ padding: 4 }}><input type="number" min="1" max={item.stock || 9999} value={item.qty} onChange={e => updateCartItem(idx, { qty: Number(e.target.value) })} style={{ width: 48, fontSize: '0.95rem', height: 24, textAlign: 'center' }} /></td>
              <td className="num-col" style={{ padding: 4 }}>{Number(item.price).toFixed(2)}</td>
              <td className="action-col" style={{ padding: 4, display: 'flex', gap: 4 }}>
                <button onClick={() => removeCartItem(idx)} style={{ fontSize: '0.95rem', padding: '2px 8px', height: 24 }}>Remove</button>
                <button onClick={() => { setCustomPriceIdx(idx); setCustomPriceValue(item.price); setShowCustomPriceModal(true); }} style={{ fontSize: '0.95rem', padding: '2px 8px', height: 24, background: '#00b4d8', color: '#fff', border: 'none', borderRadius: 4 }}>Set Custom Price</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {/* Custom Price Modal */}
      {showCustomPriceModal && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            <h3>Set Custom Price</h3>
            <input
              type="number"
              min="0"
              value={customPriceValue}
              onChange={e => setCustomPriceValue(e.target.value)}
              style={{ width: 120, fontSize: '1.1em', marginBottom: 12 }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => {
                if (customPriceIdx !== null) updateCartItem(customPriceIdx, { price: Number(customPriceValue) });
                setShowCustomPriceModal(false);
              }} style={{ background: '#00b4d8', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 6, padding: '8px 18px' }}>Save</button>
              <button onClick={() => setShowCustomPriceModal(false)} style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Product/Service Modal */}
      {showCustomProductModal && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            <h3>Add Custom Product/Service</h3>
            <input
              type="text"
              placeholder="Name (e.g. Handmade Service)"
              value={customProductForm.name}
              onChange={e => setCustomProductForm(f => ({ ...f, name: e.target.value }))}
              style={{ width: 220, marginBottom: 8 }}
              required
            />
            <input
              type="number"
              placeholder="Price"
              value={customProductForm.price}
              onChange={e => setCustomProductForm(f => ({ ...f, price: e.target.value }))}
              style={{ width: 120, marginBottom: 8 }}
              required
            />
            <input
              type="number"
              placeholder="Quantity"
              value={customProductForm.qty}
              min={1}
              onChange={e => setCustomProductForm(f => ({ ...f, qty: e.target.value }))}
              style={{ width: 80, marginBottom: 8 }}
              required
            />
            {customProductError && <div style={{ color: '#ff5252', marginBottom: 8 }}>{customProductError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addCustomProductToCart} style={{ background: '#00b4d8', color: '#fff', fontWeight: 600, border: 'none', borderRadius: 6, padding: '8px 18px' }}>Add</button>
              <button onClick={() => { setShowCustomProductModal(false); setCustomProductError(''); }} style={{ background: '#888', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      <div className="pos-summary" style={{ fontSize: '1rem', display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginTop: 8, marginBottom: 8 }}>
        <div>Subtotal: {subtotal.toFixed(2)}</div>
        <div>VAT @16%: Inclusive</div>
        <div>
          Discount: <input
            type="number"
            min="0"
            max={subtotal}
            value={discountAll}
            onChange={e => setDiscountAll(e.target.value)}
            style={{ width: 60, marginLeft: 4, marginRight: 4, fontSize: '0.95rem', height: 24 }}
          />
        </div>
        <div><b>Total: {total.toFixed(2)} {currency}</b></div>
      </div>
      <div className="pos-actions" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
        <input
          type="number"
          min="0"
          max={total}
          value={paymentAmount}
          onChange={e => setPaymentAmount(Number(e.target.value))}
          placeholder="Payment Amount"
          style={{ minWidth: 90, fontSize: '0.95rem', height: 28, marginRight: 4 }}
        />
        <button
          onClick={handleCheckout}
          disabled={checkoutLoading || total <= 0}
          style={{ fontSize: '0.95rem', padding: '4px 14px', height: 28, whiteSpace: 'nowrap', minWidth: 140 }}
        >
          {checkoutLoading
            ? "Processing..."
            : (paymentAmount < total ? "Checkout (Partial/Layby)" : "Checkout")}
        </button>
      </div>
      {/* Show layby history for customer */}
      {customerLaybys.length > 0 && (
        <div style={{ margin: '24px 0', background: '#23272f', borderRadius: 8, padding: 16 }}>
          <h4 style={{ color: '#00b4d8', margin: 0, marginBottom: 8 }}>Layby / Partial Payment History</h4>
          <table style={{ width: '100%', color: '#fff', fontSize: 15 }}>
            <thead>
              <tr style={{ color: '#00b4d8' }}>
                <th>Created</th>
                <th>Status</th>
                <th>Total</th>
                <th>Paid</th>
                <th>Balance</th>
                <th className="customer-col">Customer</th>
              </tr>
            </thead>
            <tbody>
              {customerLaybys.map(l => {
                const customer = customers.find(c => c.id === selectedCustomer);
                return (
                  <tr key={l.id}>
                    <td>{new Date(l.created_at).toLocaleDateString()}</td>
                    <td>{l.status}</td>
                    <td>{l.total_amount}</td>
                    <td>{l.paid_amount}</td>
                    <td>{(l.total_amount - l.paid_amount).toFixed(2)}</td>
                    <td className="customer-col">{customer ? customer.name : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {checkoutError && <div style={{ color: "#ff5252", marginBottom: 10 }}>{checkoutError}</div>}
      {checkoutSuccess && <div style={{ color: "#4caf50", marginBottom: 10 }}>{checkoutSuccess}</div>}

      {/* Customer Modal */}
      {showCustomerModal && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            <h3>Add New Customer</h3>
            <form onSubmit={handleAddCustomer}>
              <input
                type="text"
                placeholder="Customer Name"
                value={customerForm.name}
                onChange={e => setCustomerForm(f => ({ ...f, name: e.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="Phone Number"
                value={customerForm.phone}
                onChange={e => setCustomerForm(f => ({ ...f, phone: e.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="TPIN (optional)"
                value={customerForm.tpin}
                onChange={e => setCustomerForm(f => ({ ...f, tpin: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Address (optional)"
                value={customerForm.address}
                onChange={e => setCustomerForm(f => ({ ...f, address: e.target.value }))}
              />
              <input
                type="text"
                placeholder="City (optional)"
                value={customerForm.city}
                onChange={e => setCustomerForm(f => ({ ...f, city: e.target.value }))}
              />
              {customerError && <div style={{ color: "#ff5252", marginBottom: 8 }}>{customerError}</div>}
              <button type="submit" disabled={customerLoading}>{customerLoading ? "Adding..." : "Add Customer"}</button>
              <button type="button" style={{ background: '#888', marginTop: 8 }} onClick={() => { setShowCustomerModal(false); setCustomerError(""); }}>Cancel</button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {showEditCustomerModal && (
        <div className="pos-modal">
          <div className="pos-modal-content">
            <h3>Edit Customer</h3>
            <form onSubmit={handleEditCustomer}>
              <input
                type="text"
                placeholder="Customer Name"
                value={editCustomerForm.name}
                onChange={e => setEditCustomerForm(f => ({ ...f, name: e.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="Phone Number"
                value={editCustomerForm.phone}
                onChange={e => setEditCustomerForm(f => ({ ...f, phone: e.target.value }))}
                required
              />
              <input
                type="text"
                placeholder="TPIN (optional)"
                value={editCustomerForm.tpin}
                onChange={e => setEditCustomerForm(f => ({ ...f, tpin: e.target.value }))}
              />
              <input
                type="text"
                placeholder="Address (optional)"
                value={editCustomerForm.address}
                onChange={e => setEditCustomerForm(f => ({ ...f, address: e.target.value }))}
              />
              <input
                type="text"
                placeholder="City (optional)"
                value={editCustomerForm.city}
                onChange={e => setEditCustomerForm(f => ({ ...f, city: e.target.value }))}
              />
              {editCustomerError && <div style={{ color: "#ff5252", marginBottom: 8 }}>{editCustomerError}</div>}
              <button type="submit" disabled={editCustomerLoading}>{editCustomerLoading ? "Saving..." : "Save Changes"}</button>
              <button type="button" style={{ background: '#888', marginTop: 8 }} onClick={() => { setShowEditCustomerModal(false); setEditCustomerError(""); }}>Cancel</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
