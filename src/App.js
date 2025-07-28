import React, { useState, useEffect } from 'react';
import { Route, Routes, Navigate, useNavigate, useLocation } from 'react-router-dom';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const loggedInUser = localStorage.getItem('user');
    if (loggedInUser) {
      setUser(JSON.parse(loggedInUser));
    }
    setLoading(false);
  }, []);

  // Fetch permissions for the logged-in user
  // Remove permissions fetching

  if (loading) {
    return <div>Loading...</div>;
  }

  // Helper to check permission for a module
  // Remove canView helper

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
      setUser(data);
      navigate('/dashboard');
    } catch (err) {
      setError('An unexpected error occurred.');
    }
  };

  return (
    <div className="App">
      <Routes>
        <Route path="/login" element={<LoginPage handleLogin={handleLogin} />} />
        <Route path="/dashboard" element={user ? (<Dashboard user={user} />) : (<Navigate to="/login" />)} />
        <Route path="/pos" element={user ? <POS /> : <Navigate to="/dashboard" />} />
        <Route path="/layby-management" element={user ? <LaybyManagement /> : <Navigate to="/dashboard" />} />
        <Route path="/company-settings" element={user ? <CompanySettings /> : <Navigate to="/dashboard" />} />
        <Route path="/customers" element={user ? <Customers /> : <Navigate to="/dashboard" />} />
        <Route path="/locations" element={user ? <Locations /> : <Navigate to="/dashboard" />} />
        <Route path="/categories" element={user ? <Categories /> : <Navigate to="/dashboard" />} />
        <Route path="/products" element={user ? <Products /> : <Navigate to="/dashboard" />} />
        <Route path="/units-of-measure" element={user ? <UnitsOfMeasure /> : <Navigate to="/dashboard" />} />
        <Route path="/opening-stock" element={user ? <OpeningStock /> : <Navigate to="/dashboard" />} />
        <Route path="/closing-stock" element={user ? <ClosingStock /> : <Navigate to="/dashboard" />} />
        <Route path="/transfer" element={user ? <Transfer /> : <Navigate to="/dashboard" />} />
        <Route path="/stock-viewer" element={user ? <StockViewer /> : <Navigate to="/dashboard" />} />
        <Route path="/sets" element={user ? <Sets /> : <Navigate to="/dashboard" />} />
        <Route path="/sales-report" element={user ? <SalesReport /> : <Navigate to="/dashboard" />} />
        <Route path="/stock-report" element={user ? <StockReport /> : <Navigate to="/dashboard" />} />
        <Route path="/layby-report" element={user ? <LaybyReport /> : <Navigate to="/dashboard" />} />
        <Route path="/stocktake-report" element={user ? <StocktakeReport /> : <Navigate to="/dashboard" />} />
        <Route path="/variance-report" element={user ? <VarianceReportWrapper /> : <Navigate to="/dashboard" />} />
        {/* User Access Control Route (admin only) */}
        {/* UserAccessControl route removed */}
        {/* Default route: Redirect to login */}
        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
      <FactoryResetAziliButton />
    </div>
  );
}

export default App;
