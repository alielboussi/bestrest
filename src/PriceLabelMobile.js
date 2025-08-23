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
  const [isGenerating, setIsGenerating] = useState(false);
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

  // Enhanced search: by name, set name, SKU, and price (standard/promotional)
  useEffect(() => {
    const term = search.trim();
    if (!term) { setSearchResults([]); return; }
    const q = term.toLowerCase();
    const digits = term.replace(/[^0-9.]/g, '');

    const matchPrice = (val) => {
      if (digits.length === 0) return false;
      const n = Number(val);
      if (isNaN(n)) return false;
      const asRaw = String(Math.round(n * 100) / 100).replace(/\D/g, '');
      const qRaw = digits.replace(/\D/g, '');
      // loose match: substring of number without formatting
      return asRaw.includes(qRaw);
    };

    const productMatches = (x) => {
      const byName = (x.name || '').toLowerCase().includes(q);
      const bySku = (x.sku || '').toString().toLowerCase().includes(q);
      const byStd = matchPrice(x.price);
      const byPromo = matchPrice(x.promotional_price);
      return byName || bySku || byStd || byPromo;
    };

    const comboMatches = (c) => {
      const byName = (c.combo_name || '').toLowerCase().includes(q);
      const bySku = (c.sku || '').toString().toLowerCase().includes(q);
      const byStd = matchPrice(c.standard_price || c.combo_price);
      const byPromo = matchPrice(c.promotional_price);
      return byName || bySku || byStd || byPromo;
    };

    const matchedProducts = products.filter(productMatches);
    const matchedCombos = combos.filter(comboMatches);

    // suppress duplicates where a product matches a set by same name or SKU
    const comboNames = new Set(matchedCombos.map(c => (c.combo_name || '').toLowerCase()));
    const comboSkus = new Set(matchedCombos.map(c => (c.sku || '').toString().toLowerCase()));
    const pFiltered = matchedProducts.filter(prod => {
      const n = (prod.name || '').toLowerCase();
      const sku = (prod.sku || '').toString().toLowerCase();
      return !(comboNames.has(n) || (sku && comboSkus.has(sku)));
    });

    setSearchResults([
      ...pFiltered.map((x) => ({ type: 'product', id: x.id, data: x })),
      ...matchedCombos.map((c) => ({ type: 'set', id: c.id, data: c })),
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

  const generatePdf = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    const container = hiddenRenderRef.current;
    if (!container) { setIsGenerating(false); return; }
    const labelNodes = Array.from(container.querySelectorAll('.a4-pair'));
    if (labelNodes.length === 0) { setIsGenerating(false); return; }

    // Page constants
    const pageWidthMm = 210;
    const pageHeightMm = 297;
    const targetDpi = 180; // Safer on mobile to avoid hangs (≈ 150–200 DPI is fine for labels)
    const mmToInch = (mm) => mm / 25.4;
    const targetWidthPx = Math.round(mmToInch(pageWidthMm) * targetDpi);
    const targetHeightPx = Math.round(mmToInch(pageHeightMm) * targetDpi);

    // Helper to render a node with a safe scale and a fallback path
    const renderNode = async (node) => {
      const nodeWidthPx = node.offsetWidth || targetWidthPx;
      const computedScale = nodeWidthPx ? targetWidthPx / nodeWidthPx : 2;
      const scale = Math.min(2.2, Math.max(1.5, computedScale));
      try {
        return await html2canvas(node, {
          backgroundColor: '#ffffff',
          useCORS: true,
          foreignObjectRendering: true,
          imageTimeout: 0,
          scale,
        });
      } catch (e) {
        // Fallback: turn off foreignObjectRendering for better stability
        return await html2canvas(node, {
          backgroundColor: '#ffffff',
          useCORS: true,
          allowTaint: true,
          foreignObjectRendering: false,
          imageTimeout: 0,
          scale: Math.max(1.25, scale - 0.5),
        });
      }
    };

    let doc;
    try {
      doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      doc.setProperties({ title: 'Price Labels' });

      let first = true;
      for (const node of labelNodes) {
        // Yield to UI loop to avoid long blocking on mobile
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 0));
        // eslint-disable-next-line no-await-in-loop
        const canvas = await renderNode(node);
        const imgData = canvas.toDataURL('image/png');
        if (!first) doc.addPage();
        first = false;
        doc.addImage(imgData, 'PNG', 0, 0, pageWidthMm, pageHeightMm, undefined, 'FAST');
      }

      // Build a Blob of the PDF
      const pdfBlob = doc.output('blob');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `price-labels-${ts}.pdf`;
      const path = `mobile/${filename}`;

      // Upload to Supabase Storage (labels bucket)
      const { error: upErr } = await supabase.storage
        .from('labels')
        .upload(path, pdfBlob, { upsert: true, contentType: 'application/pdf', cacheControl: '3600' });
      if (upErr) throw upErr;

      // Always use a signed URL to avoid public policy ambiguity
      let url = '';
      const { data: signed, error: signErr } = await supabase.storage.from('labels').createSignedUrl(path, 60 * 60);
      if (signErr) {
        // Fallback to public URL if signing fails (e.g., public bucket)
        url = supabase.storage.from('labels').getPublicUrl(path)?.data?.publicUrl || '';
        if (!url) throw signErr;
      } else {
        url = signed.signedUrl;
      }

      // Trigger download on the phone; fetch to bypass cross-origin download attribute limitations
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`Download HTTP ${resp.status}`);
        const fetchedBlob = await resp.blob();
        const dlUrl = URL.createObjectURL(fetchedBlob);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(dlUrl);
      } catch (_) {
        // Fallback to local save if direct fetch-download fails
        doc.save(filename);
      }
    } catch (err) {
      console.error('PDF upload/download error:', err);
      // Last-resort fallback to local download
      try { if (doc) doc.save('price-labels.pdf'); } catch (_) {}
    } finally {
      setIsGenerating(false);
    }
  };

  // Exact desktop label card (uses PriceLabels.css classes)
  const LabelCardA4 = ({ item }) => {
    // Render a blank card when there's no item so the second half stays visible (cut line included)
    if (!item) return <div className="label-card" />;
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
            <div className="price-now promo"><span className="price-now-label">PROMO PRICE:</span> {formatCurrency(promoPrice)}!</div>
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
        <button disabled={expanded.length === 0 || isGenerating} className="plm-btn primary" onClick={generatePdf} aria-busy={isGenerating}>
          {isGenerating ? 'Saving…' : 'Download PDF'}
        </button>
      </footer>
    </div>
  );
}
