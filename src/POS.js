
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
  const [customerLaybys, setCustomerLaybys] = useState([]);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const navigate = useNavigate();

  // Fetch locations and customers
  useEffect(() => {
    supabase.from("locations").select("id, name").then(({ data }) => setLocations(data || []));
    supabase.from("customers").select("id, name, phone").then(({ data }) => setCustomers(data || []));
  }, []);

  // Fetch products and sets for selected location
  useEffect(() => {
    if (selectedLocation) {
      // Fetch products
      supabase
        .from("inventory")
        .select("product_id, quantity, product:products(id, name, sku, standard_price, promotional_price, currency)")
        .eq("location", selectedLocation)
        .then(({ data }) => {
          setProducts((data || []).map(row => ({ ...row.product, stock: row.quantity })));
        });
      // Fetch sets/kits (combos)
      supabase
        .from("combo_inventory")
        .select("combo_id, quantity, combo:combos(id, combo_name, sku, standard_price, promotional_price, currency)")
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

  // Helper: get correct price (promo > standard)
  const getBestPrice = (item) => {
    if (item.promotional_price && Number(item.promotional_price) > 0) return Number(item.promotional_price);
    if (item.standard_price && Number(item.standard_price) > 0) return Number(item.standard_price);
    return 0;
  };

  // Add product or set to cart
  const addToCart = (item) => {
    setCart([
      ...cart,
      {
        ...item,
        qty: 1,
        price: getBestPrice(item),
        isSet: item.isSet || false
      }
    ]);
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
            sale_id: saleIdValue
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
      const saleItems = cart.map((item) => ({
        sale_id: saleId,
        product_id: item.id,
        quantity: item.qty,
        unit_price: item.price,
        currency: item.currency || currency // Use item's currency if available, else selected currency
      }));
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
          // Get current inventory for this product/location
          const { data: invRows, error: invError } = await supabase
            .from('inventory')
            .select('id, quantity')
            .eq('product_id', item.id)
            .eq('location', selectedLocation);
          if (invError) throw invError;
          if (invRows && invRows.length > 0) {
            // Update existing inventory row
            const invId = invRows[0].id;
            const newQty = Math.max(0, (Number(invRows[0].quantity) || 0) - Number(item.qty));
            const { error: updateError } = await supabase
              .from('inventory')
              .update({ quantity: newQty, updated_at: new Date().toISOString() })
              .eq('id', invId);
            if (updateError) throw updateError;
          } else {
            // No inventory row exists for this product/location, create one with negative quantity
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
        }
      setCart([]);
      setPaymentAmount(0);
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
        maxWidth: 1000,
        width: '100%',
        justifyContent: 'space-between',
      }}>
        {/* Left controls */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} required style={{ fontSize: '1rem', width: 180, height: 40, borderRadius: 6, boxSizing: 'border-box' }}>
            <option value="">Select Location</option>
            {locations.map(loc => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
          </select>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{
              fontSize: '1rem',
              width: 220,
              height: 40,
              borderRadius: 6,
              boxSizing: 'border-box',
              padding: '10px 12px',
              background: '#222',
              color: '#fff',
              border: '1px solid #333',
              outline: 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              marginTop: '-7px',
            }}
          />
          <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ fontSize: '1rem', width: 100, height: 40, borderRadius: 6, boxSizing: 'border-box' }}>
            <option value="K">K</option>
            <option value="$">$</option>
          </select>
          <button type="button" onClick={() => setShowCustomerModal(true)} style={{ fontSize: '1rem', width: 220, height: 40, borderRadius: 6, background: '#00b4ff', color: '#fff', fontWeight: 600, border: 'none', boxSizing: 'border-box', marginTop: '-16px' }}><FaUserPlus /> New Customer</button>
        </div>
        {/* Right controls: Select Customer and Edit button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={selectedCustomer} onChange={e => setSelectedCustomer(e.target.value)} style={{ fontSize: '1rem', width: 180, height: 40, borderRadius: 6, boxSizing: 'border-box' }}>
            <option value="">Select Customer</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
          </select>
          {selectedCustomer && (
            <button type="button" style={{ fontSize: '1rem', width: 80, height: 40, borderRadius: 6, boxSizing: 'border-box' }} onClick={() => {
              const cust = customers.find(c => c.id === selectedCustomer);
              if (cust) openEditCustomerModal(cust);
            }}>Edit</button>
          )}
        </div>
      </div>
      {/* ...rest of the component remains unchanged... */}
      <div className="pos-row" style={{ gap: 6, marginBottom: 6 }}>
        <input
          type="text"
          placeholder="Search product by name or SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ fontSize: '0.95rem', height: 40, width: 180, marginRight: 4, marginLeft: 10, borderRadius: 6, boxSizing: 'border-box', background: '#222', color: '#fff', border: '1px solid #333' }}
        />
        <button type="button" onClick={() => setShowAddProduct(true)} style={{ fontSize: '0.92rem', padding: '2px 8px', height: 28, minWidth: 70, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FaSearch /> Search</button>
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
        {!search.trim() && (
          <div style={{ color: '#aaa', textAlign: 'center', margin: '32px 0', fontSize: '1.1rem' }}>
            Search for a product or kit/set by name or SKU to display results.
          </div>
        )}
      </div>
      <table className="pos-table" style={{ fontSize: '0.95rem' }}>
        <thead>
          <tr>
            <th className="text-col" style={{ fontSize: '0.95rem', padding: 4 }}>SKU</th>
            <th className="text-col" style={{ fontSize: '0.95rem', padding: 4 }}>Name</th>
            <th className="num-col" style={{ fontSize: '0.95rem', padding: 4 }}>Qty</th>
            <th className="num-col" style={{ fontSize: '0.95rem', padding: 4 }}>Amount</th>
            <th className="action-col" style={{ fontSize: '0.95rem', padding: 4 }}>Remove</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item, idx) => (
            <tr key={idx}>
              <td className="text-col" style={{ padding: 4 }}>{item.sku}</td>
              <td className="text-col" style={{ padding: 4 }}>{item.name}</td>
              <td className="num-col" style={{ padding: 4 }}><input type="number" min="1" max={item.stock} value={item.qty} onChange={e => updateCartItem(idx, { qty: Number(e.target.value) })} style={{ width: 48, fontSize: '0.95rem', height: 24, textAlign: 'center' }} /></td>
              <td className="num-col" style={{ padding: 4 }}><input type="number" min="0" value={item.price} onChange={e => updateCartItem(idx, { price: e.target.value })} style={{ width: 64, fontSize: '0.95rem', height: 24, textAlign: 'center' }} /></td>
              <td className="action-col" style={{ padding: 4 }}><button onClick={() => removeCartItem(idx)} style={{ fontSize: '0.95rem', padding: '2px 8px', height: 24 }}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
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
    </div>
  );
}
