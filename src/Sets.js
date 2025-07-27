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
  const navigate = useNavigate();

  useEffect(() => {
    supabase.from("products").select("id, name").then(({ data }) => setProducts(data || []));
  }, []);

  // Filter products for search
  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) &&
    !kitItems.some(item => item.product_id === p.id)
  );

  // Add product to kit
  const addProductToKit = (product) => {
    setKitItems([...kitItems, { product_id: product.id, name: product.name, quantity: 1 }]);
  };

  // Update quantity in kit
  const updateQty = (product_id, qty) => {
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
    if (!kitName || !standardPrice || kitItems.length === 0) {
      alert("Please fill all required fields and add at least one product.");
      return;
    }
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

    for (const item of kitItems) {
      await supabase.from("combo_items").insert({
        combo_id: combo.id,
        product_id: item.product_id,
        quantity: item.quantity
      });
    }
    alert("Kit/Set created!");
    setKitName(""); setSku(""); setStandardPrice(""); setPromotionalPrice(""); setPromoStart(""); setPromoEnd(""); setKitItems([]); setImageUrl("");
  };

  return (
    <div className="sets-container">
      <div className="sets-header">
        <h2>Create Kit / Set</h2>
        <button className="sets-back-btn" onClick={() => navigate("/dashboard")}>
          <FaArrowLeft style={{ marginRight: 8 }} />
          Back to Dashboard
        </button>
      </div>
      <form className="sets-form" onSubmit={handleSubmit}>
        <div className="sets-form-row">
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
                + {product.name}
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
                    value={item.quantity}
                    onChange={e => updateQty(item.product_id, Number(e.target.value))}
                    style={{ width: 70 }}
                  />
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