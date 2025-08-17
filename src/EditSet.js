import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import supabase from "./supabase";
import "./Sets.css";
import { FaTrash } from "react-icons/fa";

export default function EditSet() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [combo, setCombo] = useState(null);
  const [setProduct, setSetProduct] = useState(null);
  const [comboItems, setComboItems] = useState([]);
  const [products, setProducts] = useState([]);
  const [kitItems, setKitItems] = useState([]);
  const [locations, setLocations] = useState([]);
  const [units, setUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [kitName, setKitName] = useState("");
  const [sku, setSku] = useState("");
  const [standardPrice, setStandardPrice] = useState("");
  const [promotionalPrice, setPromotionalPrice] = useState("");
  const [promoStart, setPromoStart] = useState("");
  const [promoEnd, setPromoEnd] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [currency, setCurrency] = useState("");

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      // Fetch combo and populate fields directly from combos table
      const { data: comboData } = await supabase
        .from("combos")
        .select("id, combo_name, sku, standard_price, combo_price, promotional_price, promo_start_date, promo_end_date, picture_url, currency, product_id")
        .eq("id", id)
        .single();
      setCombo(comboData);
      setKitName(comboData?.combo_name || "");
      setSku(comboData?.sku || "");
      setStandardPrice(comboData?.standard_price || comboData?.combo_price || "");
      setPromotionalPrice(comboData?.promotional_price || "");
      setPromoStart(comboData?.promo_start_date || "");
      setPromoEnd(comboData?.promo_end_date || "");
      setImageUrl(comboData?.picture_url || "");
      setCurrency(comboData?.currency || "");
      // Fetch combo_items
      const { data: itemsData } = await supabase.from("combo_items").select("*").eq("combo_id", id);
      setComboItems(itemsData || []);
      setKitItems((itemsData || []).map(item => ({ product_id: item.product_id, quantity: item.quantity })));
      // Fetch products, locations, units, categories
  const { data: prods } = await supabase.from("products").select("id, name, sku");
      setProducts(prods || []);
      const { data: locs } = await supabase.from("locations").select("id, name");
      setLocations(locs || []);
      const { data: unitsData } = await supabase.from("unit_of_measure").select("id, name");
      setUnits(unitsData || []);
      const { data: cats } = await supabase.from("categories").select("id, name");
      setCategories(cats || []);
      setLoading(false);
    }
    fetchData();
  }, [id]);

  // Add product to kit
  const addProductToKit = (product) => {
    setKitItems([...kitItems, { product_id: product.id, name: product.name, quantity: 1 }]);
  };

  // Update quantity in kit
  const updateQty = (product_id, qty) => {
    if (qty < 1) qty = 1;
    setKitItems(kitItems.map(item =>
      item.product_id === product_id ? { ...item, quantity: qty } : item
    ));
  };

  // Remove product from kit
  const removeProductFromKit = (product_id) => {
    setKitItems(kitItems.filter(item => item.product_id !== product_id));
  };

  // Save changes
  const handleSave = async (e) => {
    e.preventDefault();
  if (!kitName || !standardPrice || kitItems.length === 0) {
      alert("Please fill all required fields and add at least one product.");
      return;
    }
  // Update combo only (sets are stored in combos; product row may not exist)
    const { error: comboError } = await supabase
      .from("combos")
      .update({
        combo_name: kitName,
        sku,
        standard_price: standardPrice,
        combo_price: standardPrice,
        promotional_price: promotionalPrice === "" ? null : promotionalPrice,
        promo_start_date: promoStart || null,
        promo_end_date: promoEnd || null,
    picture_url: imageUrl || null,
    currency: currency || combo?.currency || null
      })
      .eq("id", id);
    if (comboError) return alert("Error updating combo: " + comboError.message);
    // Update combo_items: delete old, insert new
    await supabase.from("combo_items").delete().eq("combo_id", id);
    for (const item of kitItems) {
      await supabase.from("combo_items").insert({
        combo_id: id,
        product_id: item.product_id,
        quantity: item.quantity
      });
    }
    alert("Set updated!");
    navigate("/sets");
  };

  if (loading) return <div style={{color:'#00b4d8', textAlign:'center', marginTop:'2rem'}}>Loading...</div>;

  return (
    <div className="products-container" style={{maxWidth: '100vw', minHeight: '100vh', height: 'auto', overflow: 'visible', padding: '0', margin: 0}}>
      <h1 className="products-title" style={{marginTop: '1rem'}}>Edit Kit / Set</h1>
      <form className="product-form" onSubmit={handleSave}>
        <div className="form-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(5, 150px)', gap: '18px', width: 'fit-content', margin: '0 auto', alignItems: 'center'}}>
          <select name="currency" value={currency} onChange={e => setCurrency(e.target.value)} style={{borderColor: '#00b4d8', width: '100%', minWidth: 220, height: '40px', verticalAlign: 'middle', padding: '0 10px'}}>
            <option value="">Select Currency</option>
            <option value="K">K</option>
            <option value="$">$</option>
          </select>
          <input required name="kitName" placeholder="Kit/Set Name" value={kitName} onChange={e => setKitName(e.target.value)} style={{borderColor: '#00b4d8', minWidth: 0, width: '150px', maxWidth: '150px', height: '40px', verticalAlign: 'middle', padding: '0 8px', boxSizing: 'border-box', display: 'block', margin: 0}} />
          <input name="sku" placeholder="SKU" value={sku} onChange={e => setSku(e.target.value)} style={{borderColor: '#00b4d8', width: '100%', minWidth: 220, height: '40px', verticalAlign: 'middle', padding: '0 10px', boxSizing: 'border-box', display: 'block', margin: 0}} />
          <input required type="number" step="0.01" name="standardPrice" placeholder="Standard Price" value={standardPrice} onChange={e => setStandardPrice(e.target.value)} style={{borderColor: '#00b4d8', width: '100%', minWidth: 220, height: '40px', verticalAlign: 'middle', padding: '0 10px'}} />
          <input type="number" step="0.01" name="promotionalPrice" placeholder="Promotional Price" value={promotionalPrice} onChange={e => setPromotionalPrice(e.target.value)} style={{borderColor: '#00b4d8', width: '100%', minWidth: 220, height: '40px', verticalAlign: 'middle', padding: '0 10px'}} />
          <input placeholder="Image URL" value={imageUrl} onChange={e => setImageUrl(e.target.value)} style={{borderColor: '#00b4d8'}} />
        </div>
        <div className="form-grid" style={{display: 'grid', gridTemplateColumns: 'repeat(2, 150px)', gap: '18px', width: 'fit-content', margin: '0 auto', alignItems: 'center', marginTop: '8px'}}>
          <input type="date" name="promoStart" placeholder="Promo Start" value={promoStart} onChange={e => setPromoStart(e.target.value)} style={{borderColor: '#00b4d8', width: '100%', minWidth: 220, height: '40px', verticalAlign: 'middle', padding: '0 10px'}} />
          <input type="date" name="promoEnd" placeholder="Promo End" value={promoEnd} onChange={e => setPromoEnd(e.target.value)} style={{borderColor: '#00b4d8', width: '100%', minWidth: 220, height: '40px', verticalAlign: 'middle', padding: '0 10px'}} />
        </div>
        <div className="sets-section-title" style={{color: '#00b4d8'}}>Kit Components</div>
        <div className="form-grid-search-row" style={{marginTop: '18px', marginBottom: '8px', width: '100%', display: 'flex', justifyContent: 'flex-start'}}>
          <div style={{position: 'relative', width: '350px'}}>
            <input
              className="products-search-bar"
              placeholder="Search product to add..."
              // No search logic for now, can be added
              style={{marginBottom: 0, width: '100%', borderColor: '#00b4d8', background: '#23272f', color: '#e0e6ed', borderRadius: '6px', padding: '8px 12px', fontSize: '1rem'}}
            />
            {/* Add product dropdown logic if needed */}
          </div>
        </div>
        <div className="products-list" style={{width: '100%', marginTop: '0.5rem', overflowY: 'auto', maxHeight: '350px'}}>
          <table style={{width: '100%', minWidth: 600, background: 'transparent', color: '#e0e6ed', borderCollapse: 'collapse'}}>
            <thead>
              <tr style={{background: '#23272f'}}>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', textAlign: 'left'}}>Product Name</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 120}}>Quantity</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8', color: '#00b4d8', width: 60}}>Remove</th>
              </tr>
            </thead>
            <tbody>
              {kitItems.map(item => {
                const prod = products.find(p => p.id === item.product_id);
                return (
                  <tr key={item.product_id} style={{background: '#181818'}}>
                    <td style={{textAlign: 'left'}}>{prod ? prod.name : item.product_id}</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => updateQty(item.product_id, Number(e.target.value))}
                        style={{ width: 70, borderColor: '#00b4d8', borderRadius: '4px', background: '#23272f', color: '#e0e6ed', padding: '4px 8px' }}
                      />
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
                );
              })}
              {kitItems.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ textAlign: "center", color: "#888" }}>No products added yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '2px', marginTop: '-18px', width: '100%'}}>
          <button type="submit" className="sets-save-btn" style={{background: '#00b4d8', color: '#fff', border: 'none', borderRadius: '6px', padding: '0.5rem 1.2rem', fontWeight: 'bold', fontSize: '0.98rem', boxShadow: '0 2px 8px #00b4d855', cursor: 'pointer', width: 'auto'}}>Save Changes</button>
        </div>
      </form>
    </div>
  );
}
