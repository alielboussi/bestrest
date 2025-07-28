import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./Products.css";
import supabase from "./supabase";

const initialForm = {
  name: "",
  sku: "",
  sku_type: "auto", // default to "auto" (will be mapped to boolean)
  cost_price: "",
  price: "",
  promotional_price: "",
  promo_start_date: "",
  promo_end_date: "",
  currency: "",
  category_id: "",
  unit_of_measure_id: "",
  locations: [],
  image: null,
};


function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
    const [units, setUnits] = useState([]);
  const [locations, setLocations] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetchAll();
    fetchUnits();
  }, []);

  const fetchUnits = async () => {
    const { data, error } = await supabase.from('unit_of_measure').select('*').order('created_at', { ascending: false });
    if (!error) setUnits(data || []);
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [{ data: products }, { data: categories }, { data: locations }] = await Promise.all([
        supabase.from("products").select("id, name, sku, sku_type, cost_price, price, promotional_price, promo_start_date, promo_end_date, currency, category_id, unit_of_measure_id, created_at").order("created_at", { ascending: false }),
        supabase.from("categories").select("id, name"),
        supabase.from("locations").select("id, name"),
      ]);
      setProducts(products || []);
      setCategories(categories || []);
      setLocations(locations || []);
    } catch (err) {
      setError("Failed to fetch data.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;
    if (name === "locations") {
      // Multi-select
      const options = Array.from(e.target.selectedOptions, (opt) => opt.value);
      setForm((f) => ({ ...f, locations: options }));
    } else if (type === "file") {
      setForm((f) => ({ ...f, image: files[0] }));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  };

  const handleEdit = (product) => {
    setForm({
      name: product.name || "",
      sku: product.sku || "",
      sku_type: product.sku_type ? "auto" : "manual", // map boolean to string
      cost_price: product.cost_price || "",
      price: product.price || "",
      promotional_price: product.promotional_price || "",
      promo_start_date: product.promo_start_date || "",
      promo_end_date: product.promo_end_date || "",
      currency: product.currency || "",
      category_id: product.category_id || "",
      unit_of_measure_id: product.unit_of_measure_id || "",
      locations: product.product_locations ? product.product_locations.map((pl) => pl.location_id) : [],
      image: null,
    });
    setEditingId(product.id);
    setImageUrl(product.product_images && product.product_images[0] ? product.product_images[0].image_url : "");
  };

  const handleCancelEdit = () => {
    setForm(initialForm);
    setEditingId(null);
    setImageUrl("");
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      fetchAll();
    } catch (err) {
      setError("Failed to delete product.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      let productId = editingId;
      // Prepare product data
      const productData = {
        name: form.name,
        sku: form.sku,
        sku_type: form.sku_type === "auto", // true for "auto", false for "manual"
        cost_price: form.cost_price ? parseFloat(form.cost_price) : null,
        price: form.price ? parseFloat(form.price) : null,
        promotional_price: form.promotional_price ? parseFloat(form.promotional_price) : null,
        promo_start_date: form.promo_start_date || null,
        promo_end_date: form.promo_end_date || null,
        currency: form.currency,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        unit_of_measure_id: form.unit_of_measure_id ? parseInt(form.unit_of_measure_id) : null,
      };
      let result;
      if (editingId) {
        result = await supabase.from("products").update(productData).eq("id", editingId).select();
      } else {
        result = await supabase.from("products").insert([productData]).select();
        if (result.data && result.data[0]) productId = result.data[0].id;
      }
      if (result.error) throw result.error;

      // Handle locations (product_locations join table)
      if (productId) {
        // Remove old locations if editing
        if (editingId) {
          await supabase.from("product_locations").delete().eq("product_id", productId);
        }
        if (form.locations.length > 0) {
          const locRows = form.locations.map((locId) => ({ product_id: productId, location_id: locId }));
          await supabase.from("product_locations").insert(locRows);
        }
      }

      // Handle image upload
      if (form.image) {
        const fileExt = form.image.name.split('.').pop();
        const fileName = `${productId}-${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('productimages')
          .upload(fileName, form.image, { upsert: true });
        if (uploadError) throw uploadError;
        const imageUrl = `${process.env.REACT_APP_SUPABASE_URL}/storage/v1/object/public/productimages/${fileName}`;
        // Remove old image if editing
        if (editingId) {
          await supabase.from("product_images").delete().eq("product_id", productId);
        }
        await supabase.from("product_images").insert({ product_id: productId, image_url: imageUrl });
      }

      setForm(initialForm);
      setEditingId(null);
      setImageUrl("");
      fetchAll();
    } catch (err) {
      setError("Failed to save product.");
    } finally {
      setSaving(false);
    }
  };

  // Filter products by search
  const filteredProducts = products.filter((product) => {
    const searchLower = search.toLowerCase();
    return (
      product.name?.toLowerCase().includes(searchLower) ||
      product.sku?.toLowerCase().includes(searchLower) ||
      (categories.find((c) => c.id === product.category_id)?.name?.toLowerCase().includes(searchLower))
    );
  });

  return (
    <div className="products-container">
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
      <h1>Products</h1>
      <form className="product-form" onSubmit={handleSubmit}>
        <input name="name" type="text" placeholder="Product Name" value={form.name} onChange={handleChange} required />
        <input name="sku" type="text" placeholder="SKU (leave blank for auto)" value={form.sku} onChange={handleChange} />
        <select name="sku_type" value={form.sku_type} onChange={handleChange}>
          <option value="auto">Auto SKU</option>
          <option value="manual">Manual SKU</option>
        </select>
        <input name="cost_price" type="number" step="0.01" placeholder="Cost Price" value={form.cost_price} onChange={handleChange} />
        <input name="price" type="number" step="0.01" placeholder="Price" value={form.price} onChange={handleChange} />
        <input name="promotional_price" type="number" step="0.01" placeholder="Promotional Price" value={form.promotional_price} onChange={handleChange} />
        <input name="promo_start_date" type="date" value={form.promo_start_date} onChange={handleChange} />
        <input name="promo_end_date" type="date" value={form.promo_end_date} onChange={handleChange} />
        <select name="currency" value={form.currency} onChange={handleChange} required>
          <option value="">Select Currency</option>
          <option value="K">K</option>
          <option value="$">$</option>
        </select>
        <select name="category_id" value={form.category_id} onChange={handleChange} required>
          <option value="">Select Category</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        <select name="unit_of_measure_id" value={form.unit_of_measure_id || ''} onChange={handleChange} required>
          <option value="">Select Unit</option>
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>{unit.name}{unit.abbreviation ? ` (${unit.abbreviation})` : ''}</option>
          ))}
        </select>
        <div className="locations-checkbox-group">
          {locations.map((loc) => (
            <label key={loc.id} style={{ display: 'inline-flex', alignItems: 'center', marginRight: '1.5rem', marginBottom: '0.5rem', fontWeight: 400 }}>
              <input
                type="checkbox"
                name="locations"
                value={loc.id}
                checked={form.locations.includes(loc.id)}
                onChange={e => {
                  const checked = e.target.checked;
                  setForm(f => ({
                    ...f,
                    locations: checked
                      ? [...f.locations, loc.id]
                      : f.locations.filter(id => id !== loc.id)
                  }));
                }}
                style={{ marginRight: '0.4em' }}
              />
              {loc.name}
            </label>
          ))}
        </div>
        <input name="image" type="file" accept="image/*" onChange={handleChange} />
        {imageUrl && <img src={imageUrl} alt="Product" className="product-image-preview" />}
        {/* Back to Dashboard button is now fixed at bottom right for best UX */}
        <button
          type="button"
          className="back-dashboard-btn"
          onClick={() => navigate("/dashboard")}
        >
          ← Back to Dashboard
        </button>
        <button type="submit" disabled={saving}>{editingId ? "Update" : "Add"} Product</button>
        {editingId && <button type="button" onClick={handleCancelEdit}>Cancel</button>}
      </form>
      {error && <div className="products-error">{error}</div>}
      <input
        className="products-search-bar"
        type="text"
        placeholder="Search products by name, SKU, or category..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{marginBottom: '1.5rem'}}
      />
      <div className="products-list" style={{overflowX: 'auto', width: '100%'}}>
        {loading ? (
          <div>Loading...</div>
        ) : filteredProducts.length === 0 ? (
          <div>No products found.</div>
        ) : (
          <table style={{width: '100%', minWidth: 900, background: 'transparent', color: '#e0e6ed', borderCollapse: 'collapse'}}>
            <thead>
              <tr style={{background: '#23272f'}}>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8'}}>Image</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8'}}>Name</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8'}}>SKU</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8'}}>Category</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8'}}>Unit</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8'}}>Locations</th>
        <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8'}}>Price</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8'}}>Promo</th>
                <th style={{padding: '0.5rem', borderBottom: '1px solid #00b4d8'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id} style={{background: editingId === product.id ? '#1a222b' : 'inherit'}}>
                  <td style={{textAlign: 'center'}}>
                    {product.product_images && product.product_images[0] && (
                      <img src={product.product_images[0].image_url} alt="Product" className="product-image-thumb" />
                    )}
                  </td>
                  <td>{product.name}</td>
                  <td>{product.sku || '(auto)'}</td>
                  <td>{categories.find((c) => c.id === product.category_id)?.name || '-'}</td>
                  <td>{units.find((u) => u.id === product.unit_of_measure_id)?.abbreviation || units.find((u) => u.id === product.unit_of_measure_id)?.name || '-'}</td>
                  <td>{product.product_locations && product.product_locations.length > 0 ? product.product_locations.map((pl) => locations.find((l) => l.id === pl.location_id)?.name).join(", ") : '-'}</td>
                  <td>{product.price} {product.currency === 'K' ? 'K' : product.currency === '$' ? '$' : ''}</td>
                  <td>{product.promotional_price ? `${product.promotional_price} (${product.promo_start_date} to ${product.promo_end_date})` : '-'}</td>
                  <td>
                    <button className="edit-btn" onClick={() => handleEdit(product)} disabled={saving}>Edit</button>
                    <button className="delete-btn" onClick={() => handleDelete(product.id)} disabled={saving}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Products;
