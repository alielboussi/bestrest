// pdfUtils.js
// Utility to export variance report as a styled PDF using jsPDF and autoTable
import jsPDF from 'jspdf';
import 'jspdf-autotable';

export function exportVarianceReportPDF({
  companyName,
  logoUrl,
  reportDate,
  openingInfo,
  closingInfo,
  reportRows
}) {
  const doc = new jsPDF('p', 'pt', 'a4');
  const margin = 40;
  let y = margin;

  // Logo
  if (logoUrl) {
    // Load image as base64
    const img = new window.Image();
    img.src = logoUrl;
    img.onload = function () {
      doc.addImage(img, 'PNG', margin, y, 64, 64);
      doc.setFontSize(18);
      doc.text(companyName + ' - Variance Report', margin + 80, y + 32);
      y += 80;
      addMeta();
      addTable();
      doc.save(`variance_report_${reportDate}.pdf`);
    };
    return;
  }

  // If no logo, just add title
  doc.setFontSize(18);
  doc.text(companyName + ' - Variance Report', margin, y);
  y += 32;
  addMeta();
  addTable();
  doc.save(`variance_report_${reportDate}.pdf`);

  function addMeta() {
    doc.setFontSize(12);
    doc.text(`Date: ${reportDate}`, margin, y);
    y += 18;
    doc.text(
      `Stocktake Period: ${openingInfo.date ? new Date(openingInfo.date).toLocaleString() : 'N/A'} to ${closingInfo.date ? new Date(closingInfo.date).toLocaleString() : 'N/A'}`,
      margin,
      y
    );
    y += 18;
    doc.text(`Opening Stock by: ${openingInfo.user || 'N/A'}`, margin, y);
    y += 18;
    doc.text(`Closing Stock by: ${closingInfo.user || 'N/A'}`, margin, y);
    y += 18;
  }

  function addTable() {
    const tableData = reportRows.map(row => [
      row.product,
      row.opening,
      row.transfers,
      row.sales,
      row.closing,
      row.variance,
      row.varianceAmount + ' ' + row.currency
    ]);
    doc.autoTable({
      head: [[
        'Product',
        'Opening Stock',
        'Transfers In',
        'Sales',
        'Closing Stock',
        'Variance (Qty)',
        'Variance (Amount)'
      ]],
      body: tableData,
      startY: y + 10,
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: [0, 191, 255] },
      margin: { left: margin, right: margin }
    });
  }
}
