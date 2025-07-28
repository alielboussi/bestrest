import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "./supabase";
import "./StockViewer.css";

export default function StockViewer() {
  const [products, setProducts] = useState([]);
  const [combos, setCombos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [inventory, setInventory] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    // Fetch all data in parallel
    Promise.all([
      supabase.from("products").select("id, name, standard_price, promotional_price, promo_start_date, promo_end_date"),
      supabase.from("combos").select("*"),
      supabase.from("combo_items").select("*"),
      supabase.from("inventory").select("product_id, quantity")
    ]).then(([prodRes, comboRes, comboItemsRes, invRes]) => {
      setProducts(prodRes.data || []);
      setCombos(comboRes.data || []);
      setComboItems(comboItemsRes.data || []);
      setInventory(invRes.data || []);
    });
  }, []);

  // Build a product stock map
  const productStock = {};
  inventory.forEach(i => {
    productStock[i.product_id] = (productStock[i.product_id] || 0) + i.quantity;
  });

  // Calculate kits/sets stock and adjust product stock
  const kits = combos.map(kit => {
    const items = comboItems.filter(ci => ci.combo_id === kit.id);
    // Find how many kits can be made
    let kitQty = Math.min(
      ...items.map(item => Math.floor((productStock[item.product_id] || 0) / item.quantity))
    );
    // Subtract used stock for this kit
    items.forEach(item => {
      productStock[item.product_id] -= kitQty * item.quantity;
    });
    return {
      ...kit,
      quantity: kitQty,
      items
    };
  });

  // Products not used up in kits
  const remainingProducts = products.filter(p => (productStock[p.id] || 0) > 0);

  return (
    <div className="stock-viewer-container" style={{maxWidth: '100vw', maxHeight: '100vh', overflow: 'auto', padding: '0 1vw'}}>
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
          margin: '12px 0 18px 0',
        }}
        onClick={() => navigate('/dashboard')}
        onMouseOver={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#00bfff'; e.currentTarget.style.borderColor = '#00bfff'; }}
        onMouseOut={e => { e.currentTarget.style.background = '#00bfff'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#00bfff'; }}
      >Back to Dashboard</button>
      <h2>Stock Viewer</h2>
      <h3>Kits / Sets</h3>
      <ul className="stock-viewer-list" style={{overflowX: 'auto', overflowY: 'auto', maxHeight: '40vh'}}>
        {kits.filter(k => k.quantity > 0).map(kit => (
          <li className="kit" key={kit.id}>
            <b>{kit.combo_name}</b> — Qty: {kit.quantity} — Price: {kit.promotional_price || kit.standard_price}
            <ul>
              {kit.items.map(item => (
                <li key={item.product_id}>
                  {products.find(p => p.id === item.product_id)?.name || "Unknown"} x {item.quantity}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <h3>Individual Products</h3>
      <ul className="stock-viewer-list">
        {remainingProducts.map(p => (
          <li key={p.id}>
            {p.name} — Qty: {productStock[p.id]}
          </li>
        ))}
      </ul>
      <button className="stock-viewer-back-btn" onClick={() => navigate("/dashboard")}> 
        Back to Dashboard
      </button>
    </div>
  );
}
