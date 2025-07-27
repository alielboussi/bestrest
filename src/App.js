import React, { useState, useEffect } from 'react';
import { Route, Routes, Navigate, useNavigate, useLocation } from 'react-router-dom';
import UserAccessControl from './UserAccessControl';
import LaybyManagement from "./LaybyManagement";
import LoginPage from './LoginPage';
import Dashboard from './Dashboard';
import POS from './POS';
import CompanySettings from './CompanySettings';
import Customers from './Customers';
import Locations from './Locations';
import Products from './Products';
import Categories from './Categories';
import UnitsOfMeasure from './UnitsOfMeasure';
import OpeningStock from './Stocktake';
import ClosingStock from './ClosingStock';
import Transfer from './Transfer';
import TransferList from './TransferList';
import supabase from './supabase';
import VarianceReport from './VarianceReport';
import StockViewer from './StockViewer';
import Sets from "./Sets";
import SalesReport from './SalesReport';
import StockReport from './StockReport';
import LaybyReport from './LaybyReport';
import StocktakeReport from './StocktakeReport';
import FactoryResetAziliButton from './FactoryResetAziliButton';

// Wrapper to extract query params for VarianceReport
function VarianceReportWrapper() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const locationId = params.get('locationId');
  const openingStockId = params.get('openingStockId');
  const closingStockId = params.get('closingStockId');
  return <VarianceReport locationId={locationId} openingStockId={openingStockId} closingStockId={closingStockId} />;
}

function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [permissions, setPermissions] = useState({});
  const [permsLoading, setPermsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loggedInUser = localStorage.getItem('user');
    const role = localStorage.getItem('userRole');
    if (loggedInUser) {
      setUser(JSON.parse(loggedInUser));
      setUserRole(role);
    }
    setLoading(false);
  }, []);

  // Fetch permissions for the logged-in user
  useEffect(() => {
    async function fetchPerms() {
      if (!user) return;
      // List of modules/pages
      const MODULES = [
        'Products', 'Categories', 'Customers', 'Sales', 'Laybys', 'Stocktake', 'Stock Transfers', 'Reports', 'Company Settings', 'Variance Report', 'Sets', 'Units of Measure', 'Stock Viewer', 'Transfer List', 'Closing Stock', 'Locations'
      ];
      // Get user role
      const { data: userRoleData } = await supabase.from('user_roles').select('role_id').eq('user_id', user.id).single();
      const roleId = userRoleData?.role_id;
      let perms = {};
      if (roleId) {
        const { data: permsData } = await supabase.from('permissions').select('*').eq('role_id', roleId);
        for (const mod of MODULES) {
          const found = permsData?.find(p => p.module === mod);
          perms[mod] = found ? !!found.can_view : false;
        }
      }
      setPermissions(perms);
      setPermsLoading(false);
    }
    fetchPerms();
  }, [user]);

  if (loading || permsLoading) {
    return <div>Loading...</div>;
  }

  // Helper to check permission for a module
  const canView = (module) => {
    if (user && user.role === 'admin') return true;
    return permissions[module];
  };

  // ...existing code...
  // handleLogin must be defined before use
  const handleLogin = async (email, password) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .eq('password', password)
        .single();
      if (error || !data) {
        setError('Invalid credentials, please try again.');
        return;
      }
      localStorage.setItem('user', JSON.stringify(data));
      localStorage.setItem('userRole', data.role);
      setUser(data);
      setUserRole(data.role);
      navigate('/dashboard');
    } catch (err) {
      setError('An unexpected error occurred.');
    }
  };

  return (
    <div className="App">
      <Routes>
        <Route path="/login" element={<LoginPage handleLogin={handleLogin} />} />
        <Route path="/dashboard" element={user ? (<Dashboard user={user} userRole={userRole} />) : (<Navigate to="/login" />)} />
        <Route path="/pos" element={user && canView('Sales') ? <POS /> : <Navigate to="/dashboard" />} />
        <Route path="/layby-management" element={user && canView('Laybys') ? <LaybyManagement /> : <Navigate to="/dashboard" />} />
        <Route path="/company-settings" element={user && canView('Company Settings') ? <CompanySettings /> : <Navigate to="/dashboard" />} />
        <Route path="/customers" element={user && canView('Customers') ? <Customers /> : <Navigate to="/dashboard" />} />
        <Route path="/locations" element={user && canView('Locations') ? <Locations /> : <Navigate to="/dashboard" />} />
        <Route path="/categories" element={user && canView('Categories') ? <Categories /> : <Navigate to="/dashboard" />} />
        <Route path="/products" element={user && canView('Products') ? <Products /> : <Navigate to="/dashboard" />} />
        <Route path="/units-of-measure" element={user && canView('Units of Measure') ? <UnitsOfMeasure /> : <Navigate to="/dashboard" />} />
        <Route path="/opening-stock" element={user && canView('Stocktake') ? <OpeningStock /> : <Navigate to="/dashboard" />} />
        <Route path="/closing-stock" element={user && canView('Closing Stock') ? <ClosingStock /> : <Navigate to="/dashboard" />} />
        <Route path="/transfer" element={user && canView('Stock Transfers') ? <Transfer /> : <Navigate to="/dashboard" />} />
        <Route path="/stock-viewer" element={user && canView('Stock Viewer') ? <StockViewer /> : <Navigate to="/dashboard" />} />
        <Route path="/sets" element={user && canView('Sets') ? <Sets /> : <Navigate to="/dashboard" />} />
        {/* Reports: Only show if user has Reports view permission */}
        <Route path="/sales-report" element={user && canView('Reports') ? <SalesReport /> : <Navigate to="/dashboard" />} />
        <Route path="/stock-report" element={user && canView('Reports') ? <StockReport /> : <Navigate to="/dashboard" />} />
        <Route path="/layby-report" element={user && canView('Reports') ? <LaybyReport /> : <Navigate to="/dashboard" />} />
        <Route path="/stocktake-report" element={user && canView('Reports') ? <StocktakeReport /> : <Navigate to="/dashboard" />} />
        {/* Variance Report: Only show if user has permission */}
        <Route path="/variance-report" element={user && canView('Variance Report') ? <VarianceReportWrapper /> : <Navigate to="/dashboard" />} />
        {/* User Access Control Route (admin only) */}
        <Route path="/user-access-control" element={user && user.role === 'admin' ? <UserAccessControl /> : <Navigate to="/dashboard" />} />
        {/* Default route: Redirect to login */}
        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
      <FactoryResetAziliButton />
    </div>
  );
}

export default App;
