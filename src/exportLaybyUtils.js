// exportLaybyUtils.js
// Utility to export layby details as PDF and CSV
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export function exportLaybyPDF({
  companyName,
  logoUrl,
  customer,
  layby,
  products,
  payments,
  currency = 'K',
  discount = 0
}) {
  // Format as 'K x,xxx' (currency symbol, space, thousands separator, no decimals for whole numbers)
  function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '';
    const n = Number(amount);
    // Show decimals only if not a whole number
    const formatted = n % 1 === 0 ? n.toLocaleString() : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${currency} ${formatted}`;
  }
  const doc = new jsPDF('p', 'pt', 'a4');
  // 1 cm = 28.35 pt
  const border = 28.35;
  const margin = 40;
  let y = margin;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Draw 1 cm border
  doc.setLineWidth(1);
  doc.rect(border, border, pageWidth - 2 * border, pageHeight - 2 * border);

  // Title: Customer Name Layby Statement
  const title = `${customer.name || 'Customer'} Layby Statement`;


  // Header details (company left, customer right)
  function addHeaderDetails() {
    doc.setFontSize(12);
    // Company details (left)
    let compY = y;
    const companyDetails = [
      'Best Rest Furniture',
      'P.O Box 3636 Parklands Shopping Centre',
      'Kitwe',
      'Zambia',
      '+260966000444',
      'bestrest10@gmail.com'
    ];
    companyDetails.forEach(line => {
      doc.text(line, margin, compY);
      compY += 16;
    });

    // Customer details (right)
    let custY = y;
    const rightX = pageWidth - margin;
    const customerDetails = [
      `Customer: ${customer.name || ''}`,
      `Phone: ${customer.phone || ''}`,
      `Address: ${customer.address || ''}`,
      `Layby Status: ${layby.status || ''}`
    ];
    customerDetails.forEach(line => {
      doc.text(line, rightX, custY, { align: 'right' });
      custY += 16;
    });

    y = Math.max(custY, compY) + 10;
  }

  // Helper to add header (logo, title, company/customer details) at a given y
  function drawHeader(doc, yStart) {
    let headerY = yStart;
    if (logoUrl) {
      try {
        const img = new window.Image();
        img.src = logoUrl;
        doc.addImage(img, 'PNG', margin, headerY, 64, 64);
      } catch {}
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(title, pageWidth / 2, headerY + 32, { align: 'center' });
      headerY += 80;
    } else {
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(title, pageWidth / 2, headerY, { align: 'center' });
      headerY += 32;
    }
    // Company details (left)
    doc.setFontSize(12);
    let compY = headerY;
    const companyDetails = [
      'Best Rest Furniture',
      'P.O Box 3636 Parklands Shopping Centre',
      'Kitwe',
      'Zambia',
      '+260966000444',
      'bestrest10@gmail.com'
    ];
    companyDetails.forEach(line => {
      doc.text(line, margin, compY);
      compY += 16;
    });
    // Customer details (right)
    let custY = headerY;
    const rightX = pageWidth - margin;
    const customerDetails = [
      `Customer: ${customer.name || ''}`,
      `Phone: ${customer.phone || ''}`,
      `Address: ${customer.address || ''}`,
      `Layby Status: ${layby.status || ''}`
    ];
    customerDetails.forEach(line => {
      doc.text(line, rightX, custY, { align: 'right' });
      custY += 16;
    });
    return Math.max(compY, custY) + 10;
  }

  // Helper to add footer (disclaimer) at a given y
  function drawFooter(doc, yStart) {
    // Calculate the total height needed for the disclaimer
    const footerLines = [
      '1) Kindly Note Period Of Validity Is 7 Days After Issued Date.',
      '2) Banking Details',
      'Account Name: BEST REST FURNITURE',
      'Bank Name: FIRST NATIONAL BANK (FNB)',
      'Account Number: 62377271912 Kitwe Branch',
      'Branch Code: 260212',
      'Swift Code: FIRNZMLX'
    ];
    const headerHeight = 18;
    const lineHeight = 14;
    const totalFooterHeight = headerHeight + (footerLines.length * lineHeight);
    // Place the footer so it is always above the border
    const borderPadding = 10; // extra space above border
    const pageHeight = doc.internal.pageSize.getHeight();
    const border = 28.35;
    let y = pageHeight - border - totalFooterHeight - borderPadding;
    if (y < border + 10) y = border + 10; // never go above top border
    doc.setFontSize(10);
    doc.setTextColor(80);
    const centerX = doc.internal.pageSize.getWidth() / 2;
    doc.setFont('helvetica', 'bold');
    doc.text('Banking & Disclaimer', centerX, y, { align: 'center' });
    const headerWidth = doc.getTextWidth('Banking & Disclaimer');
    doc.setLineWidth(0.7);
    doc.line(centerX - headerWidth / 2, y + 2, centerX + headerWidth / 2, y + 2);
    y += headerHeight;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80);
    footerLines.forEach(line => {
      doc.text(line, centerX, y, { align: 'center' });
      y += lineHeight;
    });
  }

  // Sort payments ascending by date
  const sortedPayments = (payments || []).slice().sort((a, b) => new Date(a.payment_date) - new Date(b.payment_date));

  // Use autoTable's didDrawPage to repeat header/footer on every page
  let firstTable = true;
  let lastY = 0;
  function didDrawPageHook(data) {
    // Header
    const headerEndY = drawHeader(doc, margin);
    // Move table down if first table
    if (firstTable) {
      data.settings.margin.top = headerEndY;
      firstTable = false;
    }
    // Footer (always fully visible above border)
    drawFooter(doc);
    // Page number
    const pageCount = doc.internal.getNumberOfPages();
    doc.setFontSize(10);
    doc.text(`Page ${doc.internal.getCurrentPageInfo().pageNumber} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  }

  // Render summary table
  doc.autoTable({
    head: [['Total', 'Total Paid', 'Outstanding']],
    body: [[
      formatCurrency(layby.total_amount),
      formatCurrency(layby.paid),
      formatCurrency(layby.outstanding)
    ]],
    startY: drawHeader(doc, margin),
    styles: { fontSize: 12, halign: 'center', cellPadding: 6 },
    headStyles: { fillColor: [0, 191, 255], halign: 'center' },
    margin: { left: pageWidth / 2 - 150, right: pageWidth / 2 - 150 },
    tableWidth: 300,
    didDrawPage: didDrawPageHook
  });
  // Render products table
  const productRows = products.map(p => [
    p.sku,
    p.name,
    p.qty,
    formatCurrency(p.qty * p.price)
  ]);
  const net = products.reduce((sum, p) => sum + (p.qty * p.price), 0);
  const safeDiscount = Number(discount) || 0;
  const totalAfterDiscount = Math.max(0, net - safeDiscount);
  const emptyRow = ['', '', '', ''];
  const summaryRows = [
    ['', '', { content: 'Net', styles: { halign: 'right', fontStyle: 'bold' } }, { content: formatCurrency(net), styles: { halign: 'right', fontStyle: 'bold' } }],
    ['', '', { content: 'Discount', styles: { halign: 'right', fontStyle: 'bold' } }, { content: formatCurrency(safeDiscount), styles: { halign: 'right', fontStyle: 'bold' } }],
    ['', '', { content: 'VAT @ 16 %', styles: { halign: 'right', fontStyle: 'bold' } }, { content: 'Inclusive', styles: { halign: 'right', fontStyle: 'bold' } }],
    ['', '', { content: 'Total', styles: { halign: 'right', fontStyle: 'bold' } }, { content: formatCurrency(totalAfterDiscount), styles: { halign: 'right', fontStyle: 'bold' } }]
  ];
  const tableData = [...productRows, emptyRow, ...summaryRows];
  doc.autoTable({
    head: [['SKU', 'Product Name', 'Qty', `Amount (${currency})`]],
    body: tableData,
    startY: doc.lastAutoTable ? doc.lastAutoTable.finalY + 16 : margin + 100,
    styles: { fontSize: 10, cellPadding: 4, lineWidth: 0.1, lineColor: [0,0,0] },
    headStyles: { fillColor: [0, 191, 255], halign: 'center', fontStyle: 'bold', lineWidth: 0.1, lineColor: [0,0,0] },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'center' },
      2: { halign: 'center' },
      3: { halign: 'center' }
    },
    bodyStyles: {
      1: { halign: 'center' },
      3: { halign: 'center' }
    },
    margin: { left: border + 2, right: border + 2 },
    tableWidth: 'auto',
    theme: 'grid',
    didDrawPage: didDrawPageHook
  });

  // Payments tables: small, side-by-side columns, max 3 per page, never overlap disclaimer
  doc.addPage();
  const paymentsHeaderEndY = drawHeader(doc, margin);
  // Table layout config
  const maxTablesPerPage = 3;
  const maxRowsPerTable = 10; // adjust as needed for your page size and font
  const tableWidth = 180;
  const tableSpacing = 18;
  const tableFontSize = 9;
  const tableStartY = paymentsHeaderEndY + 14;
  const tableStartXs = [margin, margin + tableWidth + tableSpacing, margin + 2 * (tableWidth + tableSpacing)];
  let paymentIdx = 0;
  let tableCol = 0;
  let tablePage = 1;
  while (paymentIdx < sortedPayments.length) {
    if (tableCol === 0 && tablePage > 1) {
      doc.addPage();
      drawHeader(doc, margin);
    }
    const tableRows = sortedPayments.slice(paymentIdx, paymentIdx + maxRowsPerTable).map(p => [
      new Date(p.payment_date).toLocaleDateString(),
      formatCurrency(p.amount)
    ]);
    doc.autoTable({
      head: [['Date', 'Amount']],
      body: tableRows,
      startY: tableStartY,
      styles: { fontSize: tableFontSize, cellPadding: 3, valign: 'middle' },
      headStyles: { fillColor: [76, 175, 80], fontStyle: 'bold', halign: 'center', valign: 'middle' },
      columnStyles: { 0: { halign: 'center' }, 1: { halign: 'center' } },
      margin: { left: tableStartXs[tableCol], right: 0 },
      tableWidth: tableWidth,
      theme: 'grid',
      didDrawPage: didDrawPageHook
    });
    paymentIdx += maxRowsPerTable;
    tableCol++;
    if (tableCol >= maxTablesPerPage) {
      tableCol = 0;
      tablePage++;
    }
  }

  // Do not auto-save here; callers will decide to save or upload/cache and then trigger download.

  // Products table with Net, VAT, Total inside
  function addProducts() {
    doc.setFontSize(13);
    doc.text('Products:', margin, y);
    y += 16;
    // Rearranged: SKU, Product Name, Qty, Amount (with currency)
    const productRows = products.map(p => [
      p.sku,
      p.name,
      p.qty,
      formatCurrency(p.qty * p.price)
    ]);
    // Calculate Net, VAT (exclusive), Total (Total = Net only)
  const net = products.reduce((sum, p) => sum + (p.qty * p.price), 0);
  const safeDiscount = Number(discount) || 0;
  const totalAfterDiscount = Math.max(0, net - safeDiscount);
    // Add an empty row after the last product
    const emptyRow = ['', '', '', ''];
    // Add summary rows as part of the table
    const summaryRows = [
      ['', '', { content: 'Net', styles: { halign: 'right', fontStyle: 'bold' } }, { content: formatCurrency(net), styles: { halign: 'right', fontStyle: 'bold' } }],
      ['', '', { content: 'Discount', styles: { halign: 'right', fontStyle: 'bold' } }, { content: formatCurrency(safeDiscount), styles: { halign: 'right', fontStyle: 'bold' } }],
      ['', '', { content: 'VAT @ 16 %', styles: { halign: 'right', fontStyle: 'bold' } }, { content: 'Inclusive', styles: { halign: 'right', fontStyle: 'bold' } }],
      ['', '', { content: 'Total', styles: { halign: 'right', fontStyle: 'bold' } }, { content: formatCurrency(totalAfterDiscount), styles: { halign: 'right', fontStyle: 'bold' } }]
    ];
    const tableData = [...productRows, emptyRow, ...summaryRows];
    doc.autoTable({
      head: [['SKU', 'Product Name', 'Qty', `Amount (${currency})`]],
      body: tableData,
      startY: y,
      styles: { fontSize: 10, cellPadding: 4, lineWidth: 0.1, lineColor: [0,0,0] },
      headStyles: { fillColor: [0, 191, 255], halign: 'center', fontStyle: 'bold', lineWidth: 0.1, lineColor: [0,0,0] },
      columnStyles: {
        0: { halign: 'left' },    // SKU
        1: { halign: 'center' }, // Product Name (centered)
        2: { halign: 'center' },  // Qty
        3: { halign: 'center' }   // Amount (centered)
      },
      bodyStyles: {
        1: { halign: 'center' },  // Product Name column (centered)
        3: { halign: 'center' }   // Amount column (centered)
      },
      margin: { left: border + 2, right: border + 2 },
      tableWidth: 'auto',
      theme: 'grid'
    });
    y = doc.lastAutoTable.finalY + 16;
  }
  // Centered summary table
  function addSummaryTable() {
    const table = [
      ['Total', 'Total Paid', 'Outstanding'],
      [
        formatCurrency(layby.total_amount),
        formatCurrency(layby.paid),
        formatCurrency(layby.outstanding)
      ]
    ];
    doc.autoTable({
      head: [table[0]],
      body: [table[1]],
      startY: y,
      styles: { fontSize: 12, halign: 'center', cellPadding: 6 },
      headStyles: { fillColor: [0, 191, 255], halign: 'center' },
      margin: { left: pageWidth / 2 - 150, right: pageWidth / 2 - 150 },
      tableWidth: 300
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // ...existing code...

  // Payments table in 4 columns (Date, Amount × 4), each group visually separated, no empty columns in last row
  function addPayments4Col(paymentsArr) {
    doc.setFontSize(13);
    doc.text('Payments:', margin, y);
    y += 16;
    // Build rows: each row has up to 4 payments (date, amount)
    const groups = [];
    for (let i = 0; i < paymentsArr.length; i += 4) {
      const group = paymentsArr.slice(i, i + 4);
      groups.push(group);
    }
    // For each group, render a separate table
    groups.forEach((group, idx) => {
      // Only show columns for actual payments in this group
      const colCount = group.length;
      const head = [];
      for (let i = 0; i < colCount; i++) {
        head.push('Date', 'Amount');
      }
      const row = [];
      for (let i = 0; i < colCount; i++) {
        const p = group[i];
        row.push(new Date(p.payment_date).toLocaleDateString());
        row.push(formatCurrency(p.amount));
      }
      doc.autoTable({
        head: [head],
        body: [row],
        startY: y,
        styles: { fontSize: 10, cellPadding: 4, valign: 'middle' },
        headStyles: { fillColor: [76, 175, 80], fontStyle: 'bold', halign: 'center', valign: 'middle' },
        columnStyles: Object.fromEntries(Array.from({length: colCount*2}, (_,i)=>[i,{halign:'center'}])),
        margin: { left: border + 2, right: border + 2 },
        tableWidth: 'auto',
        theme: 'grid',
        pageBreak: 'auto',
      });
      y = doc.lastAutoTable.finalY + 10; // Add space between tables
    });
    y += 6;
  }

  function addFooter() {
    y += 16;
    doc.setFontSize(10);
    doc.setTextColor(80);
    const centerX = doc.internal.pageSize.getWidth() / 2;
    // Underlined, centered header
    doc.setFont('helvetica', 'bold');
    doc.text('Banking & Disclaimer', centerX, y, { align: 'center' });
    const headerWidth = doc.getTextWidth('Banking & Disclaimer');
    doc.setLineWidth(0.7);
    doc.line(centerX - headerWidth / 2, y + 2, centerX + headerWidth / 2, y + 2);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(80);
    const footerLines = [
      '1) Kindly Note Period Of Validity Is 7 Days After Issued Date.',
      '2) Banking Details',
      'Account Name: BEST REST FURNITURE',
      'Bank Name: FIRST NATIONAL BANK (FNB)',
      'Account Number: 62377271912 Kitwe Branch',
      'Branch Code: 260212',
      'Swift Code: FIRNZMLX'
    ];
    footerLines.forEach(line => {
      doc.text(line, centerX, y, { align: 'center' });
      y += 14;
    });
  }
  return doc;
}

export function exportLaybyCSV({ customer, layby, products, payments, currency = 'K', discount = 0 }) {
  const fmt = (n) => (n === null || n === undefined || n === '' ? '' : `${currency} ${Number(n).toLocaleString()}`);
  let csv = '';
  csv += `Customer,${customer.name}\n`;
  csv += `Phone,${customer.phone || ''}\n`;
  csv += `Address,${customer.address || ''}\n`;
  csv += `Layby Status,${layby.status}\n`;
  csv += `Total,${fmt(layby.total_amount)}\n`;
  csv += `Total Paid,${fmt(layby.paid)}\n`;
  csv += `Outstanding,${fmt(layby.outstanding)}\n\n`;
  csv += 'Products\n';
  csv += 'Product,SKU,Qty,Unit Price,Total\n';
  products.forEach(p => {
    csv += `${p.name},${p.sku},${p.qty},${fmt(p.price)},${fmt(p.qty * p.price)}\n`;
  });
  // Add discount info under the products totals
  const net = products.reduce((sum, p) => sum + (p.qty * p.price), 0);
  const safeDiscount = Number(discount) || 0;
  const totalAfterDiscount = Math.max(0, net - safeDiscount);
  csv += `\nNet,${fmt(net)}\n`;
  csv += `Discount,${fmt(safeDiscount)}\n`;
  csv += `Total,${fmt(totalAfterDiscount)}\n`;
  csv += '\nPayments\n';
  csv += 'Date,Amount\n';
  payments.forEach(p => {
    csv += `${new Date(p.payment_date).toLocaleDateString()},${fmt(p.amount)}\n`;
  });
  return csv;
}
