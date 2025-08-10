
import React, { useEffect, useState } from "react";
import "./StockReportMobileLocked.css";
import supabase from "./supabase";

const LOCKED_LOCATION_ID = "454a092c-5b12-441e-b99d-216f6fa72198";

function StockReportMobileLocked() {
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [expandedImage, setExpandedImage] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    // Fetch product_locations for locked location
    const { data: prodLocs } = await supabase
      .from("product_locations")
      .select("product_id")
      .eq("location_id", LOCKED_LOCATION_ID);
    const productIds = prodLocs ? prodLocs.map(pl => pl.product_id) : [];
    // Fetch products for those IDs
    let productsData = [];
    if (productIds.length > 0) {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, category_id, unit_of_measure_id, image_url, price, promotional_price")
        .in("id", productIds);
      productsData = data || [];
    }
    // Fetch stock for locked location only
    const { data: stockData } = await supabase
      .from("inventory")
      .select("product_id, quantity")
      .eq("location", LOCKED_LOCATION_ID);
    // Fetch categories
    const { data: catData } = await supabase
      .from("categories")
      .select("id, name");
    setProducts(productsData);
    setStock(stockData || []);
    setCategories(catData || []);
    setLoading(false);
  }

  // Filter products by search and category
  const filteredProducts = products.filter(product => {
    const searchLower = search.trim().toLowerCase();
    const matchesSearch =
      product.name.toLowerCase().includes(searchLower) ||
      product.sku.toLowerCase().includes(searchLower) ||
      (product.price && String(product.price).includes(searchLower));
    const matchesCategory = selectedCategory === "" || String(product.category_id) === String(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="stock-report-mobile-locked">
      <h2>Stock Report</h2>
      <div className="stock-report-controls">
        <input
          type="text"
          placeholder="Search by name, SKU, or price..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="stock-report-search"
        />
        <select
          value={selectedCategory}
          onChange={e => setSelectedCategory(e.target.value)}
          className="stock-report-category"
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <table className="stock-report-table" style={{fontSize:'0.95em', width:'100%'}}>
          <thead>
            <tr>
              <th style={{minWidth:40, padding:'4px'}}>Image</th>
              <th style={{minWidth:80, padding:'4px'}}>Name</th>
              <th style={{minWidth:60, padding:'4px'}}>SKU</th>
              <th style={{minWidth:70, padding:'4px'}}>Category</th>
              <th style={{minWidth:50, padding:'4px'}}>Stock Qty</th>
              <th style={{minWidth:60, padding:'4px'}}>Standard Price</th>
              <th style={{minWidth:60, padding:'4px'}}>Promo Price</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map(product => {
              const stockItem = stock.find(s => s.product_id === product.id);
              const category = categories.find(c => String(c.id) === String(product.category_id));
              return (
                <tr key={product.id}>
                  <td>
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        style={{maxWidth:28,maxHeight:28,borderRadius:4,cursor:'pointer'}}
                        onClick={() => setExpandedImage(product.image_url)}
                      />
                    ) : (
                      <span style={{fontSize:'0.9em'}}>No Image</span>
                    )}
                  </td>
                  <td style={{wordBreak:'break-word',padding:'4px'}}>{product.name}</td>
                  <td style={{padding:'4px'}}>{product.sku}</td>
                  <td style={{padding:'4px'}}>{category ? category.name : '-'}</td>
                  <td style={{padding:'4px'}}>{stockItem ? stockItem.quantity : 0}</td>
                  <td style={{padding:'4px'}}>{product.price ? product.price : '-'}</td>
                  <td style={{padding:'4px'}}>{product.promotional_price ? product.promotional_price : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {/* Image Expansion Modal */}
      {expandedImage && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0,0,0,0.7)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={e => {
            if (e.target === e.currentTarget) setExpandedImage(null);
          }}
        >
          <img src={expandedImage} alt="Expanded" style={{maxWidth:'80vw',maxHeight:'80vh',borderRadius:'12px',boxShadow:'0 2px 24px #000'}} />
        </div>
      )}
    </div>
  );
}

export default StockReportMobileLocked;
