import supabase from './supabase';
import { exportLaybyPDF } from './exportLaybyUtils';

const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

// Utility to build safe filename and storage path for a layby PDF
export function buildLaybyPdfNaming(layby, customerName) {
  const safeName = (customerName || 'Customer')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, '_') || 'Customer';
  const fileName = `${safeName}_Layby_${layby.id}.pdf`;
  const bucket = 'layby';
  const filePath = `laybys/${layby.id}/${fileName}`;
  return { bucket, fileName, filePath };
}

function withDownloadParam(url, fileName) {
  const param = 'download=' + encodeURIComponent(fileName || 'Layby.pdf');
  return url.includes('?') ? `${url}&${param}` : `${url}?${param}`;
}

async function downloadFromUrl(url, fileName) {
  const urlWithDownload = withDownloadParam(url, fileName);
  if (isAndroid) {
    // Most reliable on Android WebView: navigate current tab to a URL that forces download
    window.location.href = urlWithDownload;
    return true;
  }
  // Desktop and other browsers: try anchor download first
  const a = document.createElement('a');
  a.href = urlWithDownload;
  a.download = fileName || 'Layby.pdf';
  a.rel = 'noopener noreferrer';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 2000);
  return true;
}

// Opens the existing layby PDF if present; otherwise generates, uploads, then opens it.
export async function openOrCreateLaybyPdf(layby, customersMap = {}) {
  const customer = customersMap[layby.customer_id] || layby.customerInfo || {};
  const { bucket, fileName, filePath } = buildLaybyPdfNaming(layby, customer.name);

  // 1) If the PDF exists, just open its signed URL
  try {
    const { data: signed } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, 7 * 24 * 60 * 60);
    if (signed?.signedUrl) {
      await downloadFromUrl(signed.signedUrl, fileName);
      return signed.signedUrl;
    }
  } catch {
    // Not existing or permission issue; continue to generate
  }

  // 2) Generate fresh PDF based on latest DB data
  const [saleItemsRes, paymentsRes, saleRes] = await Promise.all([
    supabase
      .from('sales_items')
      .select('product_id, quantity, unit_price, display_name, product:products(name, sku)')
      .eq('sale_id', layby.sale_id),
    supabase
      .from('sales_payments')
      .select('amount, payment_date')
      .eq('sale_id', layby.sale_id),
    supabase
      .from('sales')
      .select('currency, discount')
      .eq('id', layby.sale_id)
      .single(),
  ]);

  const saleItems = saleItemsRes.data || [];
  const payments = paymentsRes.data || [];
  const saleRow = saleRes.data || {};

  const products = saleItems.map(i => ({
    name: i.product?.name || i.display_name || '',
    sku: i.product?.sku || '',
    qty: i.quantity,
    price: i.unit_price,
  }));

  const currency = saleRow.currency || customer.currency || 'K';
  const discount = Number(saleRow.discount || 0);
  const fullCustomer = { ...customer, opening_balance: customer?.opening_balance || 0 };
  const logoUrl = window.location.origin + '/bestrest-logo.png';
  const companyName = 'BestRest';

  const doc = exportLaybyPDF({ companyName, logoUrl, customer: fullCustomer, layby, products, payments, currency, discount });

  // 3) Upload to storage (no upsert; if it appears while uploading, continue)
  try {
    const blob = doc.output('blob');
    await supabase.storage
      .from(bucket)
      .upload(filePath, blob, { upsert: false, contentType: 'application/pdf' });
  } catch (e) {
    // ignore typical 'exists' errors; continue to URL retrieval
  }

  // 4) Get a URL and open
  let finalUrl = '';
  try {
    const { data: signed2 } = await supabase.storage
      .from(bucket)
      .createSignedUrl(filePath, 7 * 24 * 60 * 60);
    finalUrl = signed2?.signedUrl || '';
  } catch {}
  if (!finalUrl) {
    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
    finalUrl = publicUrlData?.publicUrl || '';
  }

  try { await supabase.from('layby_view').update({ Layby_URL: finalUrl }).eq('id', layby.id); } catch {}

  if (finalUrl) {
    await downloadFromUrl(finalUrl, fileName);
    return finalUrl;
  }

  // 5) Last resort: direct download
  try { doc.save(fileName); } catch {}
  return '';
}
