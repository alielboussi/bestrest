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
  const [customerForm, setCustomerForm] = useState({ name: "", phone: "", tpin: "", address: "", city: "" });
  const [customerError, setCustomerError] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutSuccess, setCheckoutSuccess] = useState("");
  const [currency, setCurrency] = useState("K");
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]); // [{product, qty, price, vat, discount}]
  const [vatIncluded, setVatIncluded] = useState(true);
  const [discountAll, setDiscountAll] = useState(0);
  const [paymentType, setPaymentType] = useState("");
  const [layby, setLayby] = useState(false);
  const [downPayment, setDownPayment] = useState(0);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const navigate = useNavigate();

  // Fetch locations and customers
  useEffect(() => {
    supabase.from("locations").select("id, name").then(({ data }) => setLocations(data || []));
    supabase.from("customers").select("id, name, phone").then(({ data }) => setCustomers(data || []));
  }, []);

  // Fetch products for selected location
  useEffect(() => {
    if (selectedLocation) {
      supabase
        .from("inventory")
        .select("product_id, quantity, product:products(id, name, sku, standard_price, promotional_price, currency)")
        .eq("location", selectedLocation)
        .then(({ data }) => {
          setProducts((data || []).map(row => ({ ...row.product, stock: row.quantity })));
        });
    } else {
      setProducts([]);
    }
  }, [selectedLocation]);

  // Add product to cart
  const addToCart = (product) => {
    setCart([...cart, { ...product, qty: 1, price: currency === "K" ? product.standard_price : "", vat: vatIncluded, discount: 0 }]);
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
    if (!customerForm.name.trim() || !customerForm.phone.trim()) {
      setCustomerError("Name and phone are required.");
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

  // Calculate totals
  const subtotal = cart.reduce((sum, item) => sum + (Number(item.price || 0) * Number(item.qty)), 0);
  const vatAmount = vatIncluded ? subtotal * 0.16 : 0;
  const discountAmount = discountAll + cart.reduce((sum, item) => sum + (Number(item.discount || 0) * Number(item.qty)), 0);
  const total = subtotal + vatAmount - discountAmount;


  // Handle checkout (Supabase integration)
  const handleCheckout = async () => {
    setCheckoutError("");
    setCheckoutSuccess("");
    if (!selectedLocation || !selectedCustomer || cart.length === 0 || !paymentType) {
      setCheckoutError("Please select location, customer, payment type, and add products to cart.");
      return;
    }
    setCheckoutLoading(true);
    try {
      // 1. Insert sale
      const { data: saleData, error: saleError } = await supabase
        .from("sales")
        .insert([
          {
            location: selectedLocation,
            customer_id: selectedCustomer,
            sale_date: date,
            total_amount: total,
            vat: vatAmount,
            discount: discountAmount,
            currency,
            payment_type: paymentType,
            layby,
            down_payment: layby ? downPayment : null,
            status: layby ? 'layby' : 'completed',
            updated_at: new Date().toISOString(),
          },
        ])
        .select();
      if (saleError) throw saleError;
      const saleId = saleData[0].id;

      // 2. Insert sale_items
      const saleItems = cart.map((item) => ({
        sale_id: saleId,
        product_id: item.id,
        quantity: item.qty,
        unit_price: item.price,
        vat: item.vat ? 0.16 * item.price * item.qty : 0,
        discount: item.discount,
      }));
      const { error: itemsError } = await supabase.from("sales_items").insert(saleItems);
      if (itemsError) throw itemsError;

      // 3. Insert payment (if not layby)
      if (!layby) {
        const { error: payError } = await supabase.from("sales_payments").insert([
          {
            sale_id: saleId,
            amount: total,
            payment_type: paymentType,
            currency,
            payment_date: new Date().toISOString(),
          },
        ]);
        if (payError) throw payError;
      } else {
        // 4. If layby, create layby record and link both ways
        const { data: laybyData, error: laybyError } = await supabase
          .from("laybys")
          .insert([
            {
              customer_id: selectedCustomer,
              sale_id: saleId,
              total_amount: total,
              paid_amount: downPayment,
              status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ])
          .select();
        if (laybyError) throw laybyError;
        const laybyId = laybyData[0].id;
        // Update sale with layby_id
        const { error: updateSaleError } = await supabase
          .from("sales")
          .update({ layby_id: laybyId, updated_at: new Date().toISOString() })
          .eq("id", saleId);
        if (updateSaleError) throw updateSaleError;
      }

      setCheckoutSuccess("Sale completed successfully!");
      setCart([]);
      setPaymentType("");
      setLayby(false);
      setDownPayment(0);
    } catch (err) {
      setCheckoutError(err.message || "Checkout failed.");
    }
    setCheckoutLoading(false);
  };

  // Handle layby (placeholder)
  const handleLayby = () => {
    setLayby(true);
    setCheckoutError("");
    setCheckoutSuccess("");
  };

  return (
    <div className="pos-container">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <button onClick={() => navigate('/dashboard')} style={{ background: '#222', color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', marginRight: 16, cursor: 'pointer', fontWeight: 500 }}>Back to Dashboard</button>
        <h2 style={{ margin: 0 }}><FaCashRegister style={{ marginRight: 8 }} /> Point of Sale</h2>
      </div>
      <div className="pos-row">
        <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} required>
          <option value="">Select Location</option>
          {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        <select value={currency} onChange={e => setCurrency(e.target.value)}>
          <option value="K">K</option>
          <option value="$">$</option>
        </select>
        <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)}>
          <option value="">Select Customer</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
        </select>
        <button type="button" onClick={() => setShowCustomerModal(true)}><FaUserPlus /> New Customer</button>
      </div>
      <div className="pos-row">
        <input
          type="text"
          placeholder="Search product by name or SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button type="button" onClick={() => setShowAddProduct(true)}><FaSearch /> Search</button>
      </div>
      <div className="pos-products">
        {products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase())).slice(0, 8).map(product => (
          <button key={product.id} className="pos-product-btn" onClick={() => addToCart(product)}>
            {product.name} ({product.sku})<br />Stock: {product.stock}
          </button>
        ))}
      </div>
      <table className="pos-table">
        <thead>
          <tr>
            <th>SKU</th>
            <th>Name</th>
            <th>Qty</th>
            <th>Amount</th>
            <th>VAT</th>
            <th>Discount</th>
            <th>Remove</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item, idx) => (
            <tr key={idx}>
              <td>{item.sku}</td>
              <td>{item.name}</td>
              <td><input type="number" min="1" max={item.stock} value={item.qty} onChange={e => updateCartItem(idx, { qty: Number(e.target.value) })} /></td>
              <td><input type="number" min="0" value={item.price} onChange={e => updateCartItem(idx, { price: e.target.value })} disabled={currency === "K"} /></td>
              <td><input type="checkbox" checked={item.vat} onChange={e => updateCartItem(idx, { vat: e.target.checked })} /></td>
              <td><input type="number" min="0" value={item.discount} onChange={e => updateCartItem(idx, { discount: e.target.value })} /></td>
              <td><button onClick={() => removeCartItem(idx)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pos-summary">
        <div>Subtotal: {subtotal.toFixed(2)}</div>
        <div>VAT (16%): {vatAmount.toFixed(2)}</div>
        <div>Discount: {discountAmount.toFixed(2)}</div>
        <div><b>Total: {total.toFixed(2)} {currency}</b></div>
      </div>
      <div className="pos-actions">
        <select value={paymentType} onChange={e => setPaymentType(e.target.value)} style={{ minWidth: 120 }}>
          <option value="">Payment Type</option>
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="mobile">Mobile Money</option>
          <option value="bank">Bank Transfer</option>
          <option value="check">Check</option>
        </select>
        {layby && (
          <input
            type="number"
            min="0"
            value={downPayment}
            onChange={e => setDownPayment(Number(e.target.value))}
            placeholder="Down Payment"
            style={{ minWidth: 120 }}
          />
        )}
        <button onClick={handleCheckout} disabled={checkoutLoading}>{checkoutLoading ? "Processing..." : "Checkout"}</button>
        <button onClick={handleLayby} style={{ background: layby ? '#4caf50' : undefined }}>Layby</button>
      </div>
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
    </div>
  );
}
