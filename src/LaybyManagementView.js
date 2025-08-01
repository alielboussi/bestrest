import React, { useEffect, useState } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import supabase from './supabase';
import './LaybyManagementView.css';

const LaybyManagementView = () => {
  const [laybys, setLaybys] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      // Fetch current user (assume session user)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCurrentUser(null);
        setUserRole(null);
        setLoading(false);
        return;
      }
      setCurrentUser(user);
      // Fetch user roles
      const { data: userRows } = await supabase.from('users').select('id, email, role').eq('id', user.id);
      if (!userRows || userRows.length === 0) {
        setUserRole(null);
        setLoading(false);
        return;
      }
      const role = userRows[0].role;
      setUserRole(role);
      if (!['admin', 'user'].includes(role)) {
        setLoading(false);
        return;
      }
      // Fetch laybys, customers
      const { data: laybyRows } = await supabase.from('laybys').select('id, customer_id, total_amount, paid_amount, status');
      const { data: customerRows } = await supabase.from('customers').select('id, name');
      setLaybys(laybyRows || []);
      setCustomers(customerRows || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  function getCustomerName(id) {
    const c = customers.find(c => c.id === id);
    return c ? c.name : '';
  }

  function formatAmount(amount) {
    return Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function handleExportPDF() {
    const doc = new jsPDF('p', 'pt', 'a4');
    doc.setFontSize(18);
    doc.text('Layby Management (View Only)', 40, 40);
    const tableHead = [
      [
        { content: 'Customer', styles: { fillColor: [34,34,34], textColor: 255, fontStyle: 'bold' } },
        { content: 'Total Amount', styles: { fillColor: [34,34,34], textColor: 255, fontStyle: 'bold' } },
        { content: 'Paid Amount', styles: { fillColor: [34,34,34], textColor: 255, fontStyle: 'bold' } },
        { content: 'Outstanding', styles: { fillColor: [34,34,34], textColor: 255, fontStyle: 'bold' } },
        { content: 'Status', styles: { fillColor: [34,34,34], textColor: 255, fontStyle: 'bold' } },
      ]
    ];
    const tableBody = laybys.map(l => [
      getCustomerName(l.customer_id),
      formatAmount(l.total_amount),
      formatAmount(l.paid_amount),
      formatAmount((l.total_amount || 0) - (l.paid_amount || 0)),
      l.status
    ]);
    doc.autoTable({
      head: tableHead,
      body: tableBody,
      startY: 60,
      styles: {
        fontSize: 12,
        cellPadding: 6,
        halign: 'left',
        valign: 'middle',
        textColor: [34,34,34],
        lineColor: [220,220,220],
        lineWidth: 0.5,
      },
      headStyles: {
        fillColor: [34,34,34],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'left',
        valign: 'middle',
      },
      alternateRowStyles: { fillColor: [245,245,245] },
      tableLineColor: [220,220,220],
      tableLineWidth: 0.5,
      margin: { left: 24, right: 24 },
    });
    doc.save('layby_report.pdf');
  }

  function handleExportCSV() {
    const header = ['Customer', 'Total Amount', 'Paid Amount', 'Outstanding', 'Status'];
    const rows = laybys.map(l => [
      getCustomerName(l.customer_id),
      l.total_amount,
      l.paid_amount,
      (l.total_amount || 0) - (l.paid_amount || 0),
      l.status
    ]);
    const csvContent = [header, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'layby_report.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div>Loading...</div>;
  if (!currentUser) return <div className="layby-view-access-denied">Please log in to access Layby Management.</div>;
  if (!['admin', 'user'].includes(userRole)) return <div className="layby-view-access-denied">Access denied. Only admin or user roles can view this page.</div>;

  // Filter laybys by search
  const filteredLaybys = laybys.filter(l => {
    const customer = getCustomerName(l.customer_id).toLowerCase();
    const status = (l.status || '').toLowerCase();
    const searchVal = search.toLowerCase();
    return (
      customer.includes(searchVal) ||
      status.includes(searchVal) ||
      String(l.total_amount).includes(searchVal) ||
      String(l.paid_amount).includes(searchVal)
    );
  });

  return (
    <div className="layby-view-container landscape-layout">
      <div className="layby-view-title">Layby Management (View Only)</div>
      <div className="layby-view-searchbar">
        <input
          type="text"
          placeholder="Search by customer, status, or amount..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: 400, marginBottom: 12, padding: 8, fontSize: 16, borderRadius: 4, border: '1px solid #bbb' }}
        />
      </div>
      <table className="layby-view-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Total Amount</th>
            <th>Paid Amount</th>
            <th>Outstanding</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {filteredLaybys.map(l => (
            <tr key={l.id}>
              <td>{getCustomerName(l.customer_id)}</td>
              <td>{formatAmount(l.total_amount)}</td>
              <td>{formatAmount(l.paid_amount)}</td>
              <td>{formatAmount((l.total_amount || 0) - (l.paid_amount || 0))}</td>
              <td>{l.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="layby-view-export-btns">
        <button onClick={handleExportPDF}>Export as PDF</button>
        <button onClick={handleExportCSV}>Export as CSV</button>
      </div>
    </div>
  );
};

export default LaybyManagementView;
