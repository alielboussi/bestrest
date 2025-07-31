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
  payments
}) {
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

  // Logo and Title
  if (logoUrl) {
    const img = new window.Image();
    img.src = logoUrl;
    img.onload = function () {
      doc.addImage(img, 'PNG', margin, y, 64, 64);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(title, pageWidth / 2, y + 32, { align: 'center' });
      y += 80;
      addHeaderDetails();
      addSummaryTable();
      addProducts();
      y += 24; // Extra space between tables
      addPayments();
      addFooter();
      doc.save(`layby_statement_${customer.name}.pdf`);
    };
    return;
  }

  // If no logo, just add centered title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 32;
  addHeaderDetails();
  addSummaryTable();
  addProducts();
  y += 24; // Extra space between tables
  addPayments();
  addFooter();
  doc.save(`layby_statement_${customer.name}.pdf`);

  // Products table with Net, VAT, Total inside
  function addProducts() {
    doc.setFontSize(13);
    doc.text('Products:', margin, y);
    y += 16;
    // Rearranged: SKU, Product Name, Qty, Amount
    const productRows = products.map(p => [
      p.sku,
      p.name,
      p.qty,
      (p.qty * p.price).toFixed(2)
    ]);
    // Calculate Net, VAT (exclusive), Total (Total = Net only)
    const net = products.reduce((sum, p) => sum + (p.qty * p.price), 0);
    // Add an empty row after the last product
    const emptyRow = ['', '', '', ''];
    // Add summary rows as part of the table
    const summaryRows = [
      ['', '', { content: 'Net', styles: { halign: 'right', fontStyle: 'bold' } }, { content: net.toFixed(2), styles: { halign: 'right', fontStyle: 'bold' } }],
      ['', '', { content: 'VAT @ 16 %', styles: { halign: 'right', fontStyle: 'bold' } }, { content: 'Inclusive', styles: { halign: 'right', fontStyle: 'bold' } }],
      ['', '', { content: 'Total', styles: { halign: 'right', fontStyle: 'bold' } }, { content: net.toFixed(2), styles: { halign: 'right', fontStyle: 'bold' } }]
    ];
    const tableData = [...productRows, emptyRow, ...summaryRows];
    doc.autoTable({
      head: [['SKU', 'Product Name', 'Qty', 'Amount']],
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
        layby.total_amount != null ? layby.total_amount : '',
        layby.paid != null ? layby.paid : '',
        layby.outstanding != null ? layby.outstanding : ''
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

  function addPayments() {
    doc.setFontSize(13);
    doc.text('Payments:', margin, y);
    y += 16;
    // Only include rows that have at least one value, and always provide two columns
    const tableData = payments && payments.length > 0
      ? payments.map(p => [
          (p && p.payment_date) ? new Date(p.payment_date).toLocaleDateString() : '',
          (p && p.amount != null) ? p.amount : ''
        ])
      : [['', '']];
    // 8cm = 226.8pt
    const paymentsTableWidth = 'wrap';
    // Move table 2mm (5.67pt) to the right
    const paymentsTableLeftMargin = border + 5.67;
    doc.autoTable({
      head: [['Date', 'Amount']],
      body: tableData,
      startY: y,
      styles: { fontSize: 10, cellPadding: 4, valign: 'middle' },
      headStyles: {
        0: { fillColor: [76, 175, 80], fontStyle: 'bold', halign: 'center', valign: 'middle' }, // Date header center
        1: { fillColor: [76, 175, 80], fontStyle: 'bold', halign: 'center', valign: 'middle' } // Amount header center
      },
      columnStyles: {
        0: { halign: 'center', valign: 'middle' },    // Date (center)
        1: { halign: 'center', valign: 'middle' }     // Amount (center)
      },
      bodyStyles: {
        0: { halign: 'center', valign: 'middle' },    // Date
        1: { halign: 'center', valign: 'middle' }     // Amount
      },
      margin: { left: paymentsTableLeftMargin, right: undefined },
      tableWidth: paymentsTableWidth,
      pageBreak: 'auto',
    });
    y = doc.lastAutoTable.finalY + 16;
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
}

export function exportLaybyCSV({ customer, layby, products, payments }) {
  let csv = '';
  csv += `Customer,${customer.name}\n`;
  csv += `Phone,${customer.phone || ''}\n`;
  csv += `Address,${customer.address || ''}\n`;
  csv += `Layby Status,${layby.status}\n`;
  csv += `Total,${layby.total_amount}\n`;
  csv += `Total Paid,${layby.paid}\n`;
  csv += `Outstanding,${layby.outstanding}\n\n`;
  csv += 'Products\n';
  csv += 'Product,SKU,Qty,Unit Price,Total\n';
  products.forEach(p => {
    csv += `${p.name},${p.sku},${p.qty},${p.price},${(p.qty * p.price).toFixed(2)}\n`;
  });
  csv += '\nPayments\n';
  csv += 'Date,Amount\n';
  payments.forEach(p => {
    csv += `${new Date(p.payment_date).toLocaleDateString()},${p.amount}\n`;
  });
  return csv;
}
