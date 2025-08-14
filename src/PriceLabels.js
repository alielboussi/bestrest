import React, { useEffect, useState } from 'react';
import supabase from './supabase';
import { QRCodeSVG } from 'qrcode.react';
import './PriceLabels.css';

// PriceLabels: search, select, and print/export two-up A4 labels
const PriceLabels = () => {
  const [products, setProducts] = useState([]);
  const [combos, setCombos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [company, setCompany] = useState({ name: 'Best Rest Furniture' });

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selected, setSelected] = useState([]); // { type, id, data, qty }

  useEffect(() => {
    (async () => {
      const { data: productsData } = await supabase.from('products').select('*');
      setProducts(productsData || []);
      const { data: combosData } = await supabase.from('combos').select('*');
      setCombos(combosData || []);
      const { data: ci } = await supabase.from('combo_items').select('*');
      setComboItems(ci || []);
      const { data: companyData } = await supabase.from('company_settings').select('name').maybeSingle();
      if (companyData && companyData.name) setCompany(companyData);
    })();
  }, []);

  // simple search
  useEffect(() => {
    if (!search.trim()) return setSearchResults([]);
    const q = search.toLowerCase();
    const p = products.filter((x) => (x.name || '').toLowerCase().includes(q));
    const s = combos.filter((c) => (c.combo_name || '').toLowerCase().includes(q));
    setSearchResults([
      ...p.map((x) => ({ type: 'product', id: x.id, data: x })),
      ...s.map((c) => ({ type: 'set', id: c.id, data: c })),
    ]);
  }, [search, products, combos]);

  const addItem = (item) => {
    if (!selected.find((s) => s.type === item.type && s.id === item.id)) {
      setSelected((prev) => [...prev, { ...item, qty: 1 }]);
    }
  };
  const removeItem = (item) => setSelected((prev) => prev.filter((s) => !(s.type === item.type && s.id === item.id)));
  const setQty = (item, qty) => setSelected((prev) => prev.map((s) => (s.type === item.type && s.id === item.id ? { ...s, qty: Math.max(1, Number(qty) || 1) } : s)));

  const getComboComponents = (comboId) => comboItems.filter((c) => c.combo_id === comboId);

  const formatCurrency = (v) => (v === null || v === undefined || v === '' ? '' : `K ${Number(v).toLocaleString()}`);
  const getDiscountPercent = (oldP, promoP) => {
    if (!oldP || !promoP) return null;
    const percent = Math.round((1 - promoP / oldP) * 100);
    return percent > 0 ? percent : null;
  };

  // Expand selection by qty and create label pairs (2 per page)
  const expanded = selected.flatMap((s) => Array(s.qty || 1).fill(s));
  const pairs = [];
  for (let i = 0; i < expanded.length; i += 2) pairs.push(expanded.slice(i, i + 2));

  // Render a single label - matches CSS layout
  const LabelCard = ({ item }) => {
    if (!item) return <div className="label-card" />;
    const isProduct = item.type === 'product';
    const data = item.data;
    const components = item.type === 'set' ? getComboComponents(item.id) : [];
    const oldPrice = isProduct ? data.price : data.standard_price || data.combo_price;
    const promoPrice = data.promotional_price;
    const hasPromo = promoPrice || promoPrice === 0;
    const discount = hasPromo ? getDiscountPercent(oldPrice, promoPrice) : null;

    return (
      <div className="label-card">
        <div className="label-watermark"><img src="/bestrest-logo.png" alt="wm" /></div>
        <div className="label-header">
          <img src="/bestrest-logo.png" className="header-logo" alt="logo" />
          <div className="header-company">{company.name || 'Best Rest Furniture'}</div>
          <img src="/bestrest-logo.png" className="header-logo" alt="logo" />
        </div>

        <div className="label-title">{isProduct ? data.name : data.combo_name}</div>

        {components && components.length > 0 && (
          <ul className="label-components">
            {components.map((c) => {
              const prod = products.find((p) => p.id === c.product_id) || {};
              return (
                <li key={c.product_id}>{prod.name || c.product_id} x{c.quantity}</li>
              );
            })}
          </ul>
        )}

        <div className="label-bl">
          <div className="label-qr"><QRCodeSVG value={(isProduct ? data.sku : data.sku) || ''} /></div>
          <div className="label-sku"><span className="sku-label">Code:</span> {isProduct ? data.sku : data.sku}</div>
        </div>

        <div className="label-br">
          <div className="price-old-wrap">
            {hasPromo ? (
              <div>
                <div className="price-old diagonal">{formatCurrency(oldPrice)}</div>
              </div>
            ) : null}
            {discount ? <div className="discount-badge">-{discount}%</div> : null}
          </div>

          <div className="price-star" aria-hidden>
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <polygon points="50,2 61,38 98,38 67,59 79,95 50,72 21,95 33,59 2,38 39,38" fill="#ffd54f" stroke="#f0a500" strokeWidth="1" />
            </svg>
            <div className="price-value">
              <div className="price-value-inner">{formatCurrency(hasPromo ? promoPrice : oldPrice)}</div>
              <div className="price-value-sub">Price Per Pc(s)</div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="price-labels-page">
      <div className="label-search-bar">
        <input placeholder="Search products or sets..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {search && searchResults.length > 0 && (
        <div className="label-search-results">
          <table>
            <thead><tr><th>Name</th><th>Type</th><th>Action</th></tr></thead>
            <tbody>
              {searchResults.map((r) => (
                <tr key={r.type + '-' + r.id}>
                  <td>{r.type === 'product' ? r.data.name : r.data.combo_name}</td>
                  <td>{r.type}</td>
                  <td><button onClick={() => addItem(r)}>Add</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="label-selected-table">
        <h3>Labels to Print</h3>
        {selected.length === 0 ? <div style={{ color: '#aaa' }}>No items selected.</div> : (
          <table className="labels-table-full">
            <thead><tr><th>Name</th><th>Type</th><th>Qty</th><th>Remove</th></tr></thead>
            <tbody>
              {selected.map((s) => (
                <tr key={s.type + '-' + s.id}>
                  <td>{s.type === 'product' ? s.data.name : s.data.combo_name}</td>
                  <td>{s.type}</td>
                  <td><input type="number" min={1} value={s.qty} onChange={(e) => setQty(s, e.target.value)} style={{ width: 64 }} /></td>
                  <td><button onClick={() => removeItem(s)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="label-actions">
        <button disabled={selected.length === 0} onClick={() => window.print()}>Print</button>
        <button disabled={selected.length === 0} onClick={() => { window.print(); setTimeout(() => alert("Choose 'Save as PDF' in the print dialog to export."), 400); }}>Export as PDF</button>
      </div>

      {/* Print-only labels */}
      <div className="labels-a4">
        {pairs.length === 0 ? null : pairs.map((pair, idx) => (
          <div className="a4-pair" key={idx}>
            <div className="a4-label"><LabelCard item={pair[0]} /></div>
            <div className="a4-label"><LabelCard item={pair[1] || null} /></div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PriceLabels;
