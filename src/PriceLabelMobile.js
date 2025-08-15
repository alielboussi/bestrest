import React, { useEffect, useMemo, useRef, useState } from 'react';
import supabase from './supabase';
import { QRCodeSVG } from 'qrcode.react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import './PriceLabelMobile.css';
import './PriceLabels.css';

// Mobile-first Price Labels: search, select, preview, save PDF and share
export default function PriceLabelMobile() {
  const [products, setProducts] = useState([]);
  const [combos, setCombos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [company, setCompany] = useState({ name: 'Best Rest Furniture' });

  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selected, setSelected] = useState([]); // { type, id, data, qty }
  // no bottom sheet; search stays at top

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

  // simple search with duplicate suppression when a product also exists as a set
  useEffect(() => {
    if (!search.trim()) return setSearchResults([]);
    const q = search.toLowerCase();
    const p = products.filter((x) => (x.name || '').toLowerCase().includes(q));
    const s = combos.filter((c) => (c.combo_name || '').toLowerCase().includes(q));
    const comboNames = new Set(s.map(c => (c.combo_name || '').toLowerCase()));
    const comboSkus = new Set(s.map(c => (c.sku || '').toString()));
    const pFiltered = p.filter(prod => {
      const n = (prod.name || '').toLowerCase();
      const sku = (prod.sku || '').toString();
      return !(comboNames.has(n) || (sku && comboSkus.has(sku)));
    });
    setSearchResults([
      ...pFiltered.map((x) => ({ type: 'product', id: x.id, data: x })),
      ...s.map((c) => ({ type: 'set', id: c.id, data: c })),
    ]);
  }, [search, products, combos]);

  const addItem = (item) => {
    if (!selected.find((s) => s.type === item.type && s.id === item.id)) {
      setSelected((prev) => [...prev, { ...item, qty: 1 }]);
    }
  };
  const handleAdd = (item) => {
    addItem(item);
    setSearch('');
    setSearchResults([]);
  };
  const removeItem = (item) => setSelected((prev) => prev.filter((s) => !(s.type === item.type && s.id === item.id)));
  const setQty = (item, qty) => setSelected((prev) => prev.map((s) => (s.type === item.type && s.id === item.id ? { ...s, qty: Math.max(1, Number(qty) || 1) } : s)));

  const getComboComponents = (comboId) => comboItems.filter((c) => c.combo_id === comboId);
  const getProductComboComponents = (product) => {
    if (!product) return [];
    const bySku = (product.sku && combos.find((c) => (c.sku || '').toString() === (product.sku || '').toString())) || null;
    const byName = (!bySku && product.name && combos.find((c) => (c.combo_name || '').toLowerCase() === (product.name || '').toLowerCase())) || null;
    const matched = bySku || byName;
    return matched ? getComboComponents(matched.id) : [];
  };

  const formatCurrency = (v) => (v === null || v === undefined || v === '' ? '' : `K ${Number(v).toLocaleString()}`);

  // Expand selection by qty
  const expanded = useMemo(() => selected.flatMap((s) => Array(s.qty || 1).fill(s)), [selected]);

  // Refs to label nodes for PDF
  const hiddenRenderRef = useRef(null);

  const generateAndSharePdf = async ({ share = false } = {}) => {
    const container = hiddenRenderRef.current;
    if (!container) return;
    // Capture each A4 page (pair of labels) to keep layout identical to desktop at high resolution (~300 DPI)
    const labelNodes = Array.from(container.querySelectorAll('.a4-pair'));
    if (labelNodes.length === 0) return;

    const pageWidthMm = 210;
    const pageHeightMm = 297;
    const targetDpi = 300; // High-resolution target
    const mmToInch = (mm) => mm / 25.4;
    const targetWidthPx = Math.round(mmToInch(pageWidthMm) * targetDpi);  // ≈ 2480
    const targetHeightPx = Math.round(mmToInch(pageHeightMm) * targetDpi); // ≈ 3508

    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    doc.setProperties({ title: 'Price Labels' });

    let first = true;
    for (const node of labelNodes) {
      // Compute scale so the rendered canvas width matches our target 300 DPI width
      const nodeWidthPx = node.offsetWidth || targetWidthPx; // fallback if not measurable
      const scale = nodeWidthPx ? targetWidthPx / nodeWidthPx : 3; // default to x3 if unknown

      const canvas = await html2canvas(node, {
        backgroundColor: '#ffffff',
        useCORS: true,
        foreignObjectRendering: true,
        imageTimeout: 0,
        scale,
      });
      // Convert to PNG for best clarity (avoids JPEG artifacts on text/QR)
      const imgData = canvas.toDataURL('image/png');

      if (!first) doc.addPage();
      first = false;
      // Full-bleed A4 page
      doc.addImage(imgData, 'PNG', 0, 0, pageWidthMm, pageHeightMm);
    }

    if (share && navigator.canShare) {
      const blob = doc.output('blob');
      const file = new File([blob], 'price-labels.pdf', { type: 'application/pdf' });
      try {
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ title: 'Price Labels', text: 'Price labels PDF', files: [file] });
          return;
        }
      } catch (_) {
        // fall through to download
      }
    }
    // Fallback: download
    doc.save('price-labels.pdf');
  };

  // Exact desktop label card (uses PriceLabels.css classes)
  const LabelCardA4 = ({ item }) => {
    if (!item) return null;
    const isProduct = item.type === 'product';
    const data = item.data;
    const components = item.type === 'set' ? getComboComponents(item.id) : getProductComboComponents(data);
    const oldPrice = isProduct ? data.price : data.standard_price || data.combo_price;
    const promoPrice = data.promotional_price;
    const hasPromo = promoPrice || promoPrice === 0;

    return (
      <div className="label-card">
        <div className="label-watermark"><img src="/bestrest-logo.png" alt="wm" /></div>
        <div className="label-header">
          <img src="/bestrest-logo.png" className="header-logo" alt="logo" />
          <div className="header-company">{company.name || 'Best Rest Furniture'}</div>
          <img src="/bestrest-logo.png" className="header-logo" alt="logo" />
        </div>

        <div className="label-name">
          <span className="label-name-label">Product Name:</span>
          <span className="label-name-value">{isProduct ? data.name : data.combo_name}</span>
        </div>

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

        <div className="label-stamp"><img src="/bestreststamp.png" alt="stamp" /></div>

        <div className="label-bl">
          <div className="label-qr"><QRCodeSVG value={(isProduct ? data.sku : data.sku) || ''} /></div>
          <div className="label-sku"><span className="sku-label">Code:</span> {isProduct ? data.sku : data.sku}</div>
        </div>

        <div className="label-br">
          {hasPromo ? (
            <div className="price-old price-old-labeled">
              <span className="price-old-label">Old Price:</span>{' '}
              <span className="price-old-amount diagonal">{formatCurrency(oldPrice)}</span>
            </div>
          ) : null}

          {hasPromo ? (
            <div className="price-now"><span className="price-now-label">Promotional Price:</span> {formatCurrency(promoPrice)}</div>
          ) : (
            <div className="price-now"><span className="price-now-label">Price:</span> {formatCurrency(oldPrice)}</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="plm-page">
      {/* Search and results at top */}
      <header className="plm-topbar">
        <input className="plm-search" placeholder="Search products or sets..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {search && (
          <div className="plm-results">
            {searchResults.length === 0 && <div className="plm-empty">No results</div>}
            {searchResults.map((r) => (
              <button className="plm-result" key={r.type + '-' + r.id} onClick={() => handleAdd(r)}>
                <div className="plm-result-name">{r.type === 'product' ? r.data.name : r.data.combo_name}</div>
                <div className="plm-result-type">{r.type}</div>
                <div className="plm-result-add">Add</div>
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Selected items table */}
      <section className="plm-selected">
        <h3>Labels</h3>
        {selected.length === 0 ? (
          <div className="plm-empty">No items selected.</div>
        ) : (
          <table className="plm-table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Qty</th><th>Action</th></tr>
            </thead>
            <tbody>
              {selected.map((s) => (
                <tr key={s.type + '-' + s.id}>
                  <td className="plm-td-name">{s.type === 'product' ? s.data.name : s.data.combo_name}</td>
                  <td className="plm-td-type">{s.type}</td>
                  <td className="plm-td-qty"><input type="number" min={1} value={s.qty} onChange={(e) => setQty(s, e.target.value)} className="plm-qty" /></td>
                  <td className="plm-td-action"><button className="plm-remove" onClick={() => removeItem(s)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Hidden offscreen render for PDF capture */}
      <section className="labels-a4 plm-hidden-render" ref={hiddenRenderRef} aria-hidden>
        {(() => {
          const pairs = [];
          for (let i = 0; i < expanded.length; i += 2) pairs.push(expanded.slice(i, i + 2));
          return pairs.map((pair, idx) => (
            <div className="a4-pair" key={idx}>
              <div className="a4-label"><LabelCardA4 item={pair[0]} /></div>
              <div className="a4-label"><LabelCardA4 item={pair[1] || null} /></div>
            </div>
          ));
        })()}
      </section>

      <footer className="plm-actions">
        <button disabled={expanded.length === 0} className="plm-btn primary" onClick={() => generateAndSharePdf({ share: true })}>Share as PDF</button>
      </footer>
    </div>
  );
}
