import React, { useState, useEffect } from "react";
import supabase from "./supabase";
import "./Sets.css";
import { FaArrowLeft, FaTrash } from "react-icons/fa";
import { useNavigate } from "react-router-dom";
// Removed user permissions imports

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
  // Removed user permissions state
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from("products").select("id, name").then(({ data }) => setProducts(data || []));
    supabase.from("locations").select("id, name").then(({ data }) => setLocations(data || []));
  }, []);

  // Fetch inventory for selected location
  useEffect(() => {
    if (selectedLocation) {
      supabase.from("inventory").select("product_id, quantity, location").eq("location", selectedLocation).then(({ data }) => setInventory(data || []));
    } else {
      setInventory([]);
    }
  }, [selectedLocation]);

  // Removed permissions fetching logic

  // Removed permission helpers
  const canAdd = true;
  const canEdit = true;
  const canDelete = true;

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
        combo_price: standardPrice, // Fix: add combo_price for NOT NULL constraint
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
        await supabase.from("inventory").update({ quantity: inv.quantity - item.quantity }).eq("product_id", item.product_id).eq("location", selectedLocation);
      }
    }
    // Insert set quantity for this location (store in a new table or in combos if you have location_id field)
    // For now, let's assume a table 'combo_inventory' with combo_id, location_id, quantity
    await supabase.from("combo_inventory").insert({ combo_id: combo.id, location_id: selectedLocation, quantity: 1 });

    alert("Kit/Set created for selected location!");
    setKitName(""); setSku(""); setStandardPrice(""); setPromotionalPrice(""); setPromoStart(""); setPromoEnd(""); setKitItems([]); setImageUrl("");
  };

  // Removed permission access check

  return (
    <div className="products-container" style={{maxWidth: '100vw', minHeight: '100vh', height: '100vh', overflow: 'hidden', padding: '0', margin: 0}}>
      <h1 className="products-title" style={{marginTop: '1rem'}}>Create Kit / Set</h1>
      <form className="product-form" onSubmit={handleSubmit}>
        <div className="form-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(7, 150px)', gap: '18px', width: 'fit-content', margin: '0 auto', alignItems: 'center'}}>
          <select required name="location" value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px'}}>
            <option value="">Select Location</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
          <input required name="kitName" placeholder="Kit/Set Name" value={kitName} onChange={e => setKitName(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px', boxSizing: 'border-box', display: 'block', margin: 0}} />
          <input name="sku" placeholder="SKU" value={sku} onChange={e => setSku(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px', boxSizing: 'border-box', display: 'block', margin: 0}} />
          <input required type="number" step="0.01" name="standardPrice" placeholder="Standard Price" value={standardPrice} onChange={e => setStandardPrice(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px'}} />
          <input type="number" step="0.01" name="promotionalPrice" placeholder="Promotional Price" value={promotionalPrice} onChange={e => setPromotionalPrice(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px'}} />
          <input type="date" name="promoStart" placeholder="Promo Start" value={promoStart} onChange={e => setPromoStart(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px'}} />
          <input type="date" name="promoEnd" placeholder="Promo End" value={promoEnd} onChange={e => setPromoEnd(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px'}} />
        </div>

        <input placeholder="Image URL" value={imageUrl} onChange={e => setImageUrl(e.target.value)} style={{marginBottom: '10px', borderColor: '#00b4d8'}} />
        <div className="sets-section-title" style={{color: '#00b4d8'}}>Kit Components</div>
        <div className="form-grid-search-row" style={{marginTop: '18px', marginBottom: '8px', width: '100%', display: 'flex', justifyContent: 'flex-start'}}>
          <input
            className="products-search-bar"
            placeholder="Search product to add..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{marginBottom: 0, width: '350px', borderColor: '#00b4d8', background: '#23272f', color: '#e0e6ed', borderRadius: '6px', padding: '8px 12px', fontSize: '1rem'}}
          />
        </div>

        <div className="products-list" style={{width: '100%', marginTop: '0.5rem', overflow: 'visible', maxHeight: 'none'}}>
          <table style={{width: '100%', minWidth: 600, background: 'transparent', color: '#e0e6ed', borderCollapse: 'collapse'}}>
            <thead>
              <tr style={{background: '#23272f'}}>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8'}}>Product</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 120}}>Quantity</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 60}}>Remove</th>
              </tr>
            </thead>
            <tbody>
              {kitItems.map(item => (
                <tr key={item.product_id} style={{background: '#181818'}}>
                  <td>{item.name}</td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      max={productStock[item.product_id] || 0}
                      value={item.quantity}
                      onChange={e => updateQty(item.product_id, Number(e.target.value))}
                      style={{ width: 70, borderColor: '#00b4d8', borderRadius: '4px', background: '#23272f', color: '#e0e6ed', padding: '4px 8px' }}
                    />
                    <span style={{ color: '#00b4d8', fontSize: '0.9em', marginLeft: 6 }}>
                      (Stock: {productStock[item.product_id] || 0})
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="sets-delete-btn"
                      onClick={() => removeProductFromKit(item.product_id)}
                      style={{background: '#ff4d4d', color: '#fff', border: 'none', borderRadius: '5px', padding: '6px 10px', fontSize: '1rem', cursor: 'pointer'}}>
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
        </div>
        <div className="form-actions" style={{display: 'flex', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'flex-end', width: 'auto'}}>
          <button type="submit" className="sets-save-btn" style={{background: '#00b4d8', color: '#fff', border: 'none', borderRadius: '8px', padding: '1rem 2rem', fontWeight: 'bold', fontSize: '1.1rem', boxShadow: '0 2px 8px #00b4d855', cursor: 'pointer', width: 'auto', marginTop: '1rem'}}>Create Kit/Set</button>
        </div>
      </form>
    </div>
  );
}