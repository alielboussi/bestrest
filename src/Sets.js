
import React, { useState, useEffect } from "react";
import supabase from "./supabase";
import "./Sets.css";
import { FaArrowLeft, FaTrash } from "react-icons/fa";
import { useNavigate } from "react-router-dom";

export default function Sets() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState("");
  const [kitName, setKitName] = useState("");
  const [sku, setSku] = useState("");
  const [standardPrice, setStandardPrice] = useState("");
  const [promotionalPrice, setPromotionalPrice] = useState("");
  const [promoStart, setPromoStart] = useState("");
  const [promoEnd, setPromoEnd] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [kitItems, setKitItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [inventory, setInventory] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from("products").select("id, name").then(({ data }) => setProducts(data || []));
    supabase.from("locations").select("id, name").then(({ data }) => setLocations(data || []));
  }, []);

  // Fetch inventory for selected location
  useEffect(() => {
    if (selectedLocation) {
      supabase.from("inventory").select("product_id, quantity, location_id").eq("location_id", selectedLocation).then(({ data }) => setInventory(data || []));
    } else {
      setInventory([]);
    }
  }, [selectedLocation]);

  // Filter products for search
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) &&
    !kitItems.some(item => item.product_id === p.id)
  );

  // Build a product stock map for the selected location
  const productStock = {};
  inventory.forEach(i => {
    productStock[i.product_id] = (productStock[i.product_id] || 0) + i.quantity;
  });

  // Add product to kit
  const addProductToKit = (product) => {
    setKitItems([...kitItems, { product_id: product.id, name: product.name, quantity: 1 }]);
  };

  // Update quantity in kit, but do not allow more than available in location
  const updateQty = (product_id, qty) => {
    const maxQty = productStock[product_id] || 0;
    if (qty > maxQty) qty = maxQty;
    setKitItems(kitItems.map(item =>
      item.product_id === product_id ? { ...item, quantity: qty } : item
    ));
  };

  // Remove product from kit
  const removeProductFromKit = (product_id) => {
    setKitItems(kitItems.filter(item => item.product_id !== product_id));
  };

  // Save kit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!kitName || !standardPrice || kitItems.length === 0 || !selectedLocation) {
      alert("Please fill all required fields, select a location, and add at least one product.");
      return;
    }
    // Check if enough stock in location for each item
    for (const item of kitItems) {
      if ((productStock[item.product_id] || 0) < item.quantity) {
        alert(`Not enough stock for ${item.name} in selected location.`);
        return;
      }
    }
    // Create the combo (set)
    const { data: combo, error } = await supabase
      .from("combos")
      .insert([{
        combo_name: kitName,
        sku,
        standard_price: standardPrice,
        promotional_price: promotionalPrice,
        promo_start_date: promoStart || null,
        promo_end_date: promoEnd || null,
        picture_url: imageUrl || null
      }])
      .select()
      .single();
    if (error) return alert("Error creating kit: " + error.message);

    // Insert combo_items and update inventory for the selected location
    for (const item of kitItems) {
      await supabase.from("combo_items").insert({
        combo_id: combo.id,
        product_id: item.product_id,
        quantity: item.quantity
      });
      // Subtract used qty from inventory in selected location
      const inv = inventory.find(i => i.product_id === item.product_id);
      if (inv) {
        await supabase.from("inventory").update({ quantity: inv.quantity - item.quantity }).eq("product_id", item.product_id).eq("location_id", selectedLocation);
      }
    }
    // Insert set quantity for this location (store in a new table or in combos if you have location_id field)
    // For now, let's assume a table 'combo_inventory' with combo_id, location_id, quantity
    await supabase.from("combo_inventory").insert({ combo_id: combo.id, location_id: selectedLocation, quantity: 1 });

    alert("Kit/Set created for selected location!");
    setKitName(""); setSku(""); setStandardPrice(""); setPromotionalPrice(""); setPromoStart(""); setPromoEnd(""); setKitItems([]); setImageUrl("");
  };

  return (
    <div className="sets-container">
      <div className="sets-header">
        <h2>Create Kit / Set</h2>
        <button
          className="back-to-dashboard-btn"
          style={{
            fontSize: '0.95em',
            padding: '6px 18px',
            background: '#00bfff',
            color: '#fff',
            border: '2px solid #00bfff',
            borderRadius: 6,
            fontWeight: 600,
            boxShadow: '0 1px 4px #0003',
            cursor: 'pointer',
            transition: 'background 0.2s, color 0.2s',
            minWidth: 120,
            margin: '0 0 0 18px',
          }}
          onClick={() => navigate('/dashboard')}
          onMouseOver={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#00bfff'; e.currentTarget.style.borderColor = '#00bfff'; }}
          onMouseOut={e => { e.currentTarget.style.background = '#00bfff'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#00bfff'; }}
        >Back to Dashboard</button>
      </div>
      <form className="sets-form" onSubmit={handleSubmit}>
        <div className="sets-form-row">
          <select required value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}>
            <option value="">Select Location</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
          <input required placeholder="Kit/Set Name" value={kitName} onChange={e => setKitName(e.target.value)} />
          <input placeholder="SKU" value={sku} onChange={e => setSku(e.target.value)} />
          <input required type="number" step="0.01" placeholder="Standard Price" value={standardPrice} onChange={e => setStandardPrice(e.target.value)} />
          <input type="number" step="0.01" placeholder="Promotional Price" value={promotionalPrice} onChange={e => setPromotionalPrice(e.target.value)} />
          <input type="date" placeholder="Promo Start" value={promoStart} onChange={e => setPromoStart(e.target.value)} />
          <input type="date" placeholder="Promo End" value={promoEnd} onChange={e => setPromoEnd(e.target.value)} />
        </div>
        <input placeholder="Image URL" value={imageUrl} onChange={e => setImageUrl(e.target.value)} />
        <div className="sets-section-title">Kit Components</div>
        <div className="sets-search-row">
          <input
            className="sets-search"
            placeholder="Search product to add..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="sets-search-results">
            {filteredProducts.slice(0, 5).map(product => (
              <button
                type="button"
                key={product.id}
                className="sets-add-btn"
                onClick={() => addProductToKit(product)}
              >
                + {product.name} (Stock: {productStock[product.id] || 0})
              </button>
            ))}
          </div>
        </div>
        <table className="sets-list">
          <thead>
            <tr>
              <th>Product</th>
              <th style={{ width: 120 }}>Quantity</th>
              <th style={{ width: 60 }}>Remove</th>
            </tr>
          </thead>
          <tbody>
            {kitItems.map(item => (
              <tr key={item.product_id}>
                <td>{item.name}</td>
                <td>
                  <input
                    type="number"
                    min="1"
                    max={productStock[item.product_id] || 0}
                    value={item.quantity}
                    onChange={e => updateQty(item.product_id, Number(e.target.value))}
                    style={{ width: 70 }}
                  />
                  <span style={{ color: '#00bfff', fontSize: '0.9em', marginLeft: 6 }}>
                    (Stock: {productStock[item.product_id] || 0})
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="sets-delete-btn"
                    onClick={() => removeProductFromKit(item.product_id)}
                  >
                    <FaTrash />
                  </button>
                </td>
              </tr>
            ))}
            {kitItems.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: "center", color: "#888" }}>No products added yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        <button type="submit" className="sets-save-btn">Create Kit/Set</button>
      </form>
    </div>
  );
}