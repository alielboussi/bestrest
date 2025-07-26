


import React, { useState, useEffect } from 'react';
import { Route, Routes, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { FaCog, FaUsers } from 'react-icons/fa'; // Import React Icons
import LoginPage from './LoginPage'; // Login Page Component
import Dashboard from './Dashboard'; // Correctly import Dashboard Component
import CompanySettings from './CompanySettings'; // Import Company Settings page
import Customers from './Customers'; // Import Customers page
import Locations from './Locations'; // Import Locations page
import Products from './Products';
import Categories from './Categories';
import UnitsOfMeasure from './UnitsOfMeasure';
import OpeningStock from './Stocktake';
import ClosingStock from './ClosingStock';
import Transfer from './Transfer';
import TransferList from './TransferList';
import supabase from './supabase';
import VarianceReport from './VarianceReport';

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
  const [loading, setLoading] = useState(true); // Manage loading state
  const [error, setError] = useState(''); // For managing errors
  const navigate = useNavigate(); // For navigating after login


  // Check if the user is logged in on mount
  useEffect(() => {
    console.log("useEffect triggered: Checking for stored user data...");
    const loggedInUser = localStorage.getItem('user'); // Checking localStorage for user session
    const role = localStorage.getItem('userRole'); // Fetch role from localStorage
    console.log(`LoggedInUser: ${loggedInUser}, UserRole: ${role}`);

    if (loggedInUser) {
      setUser(JSON.parse(loggedInUser)); // Parse and set user
      setUserRole(role); // Set the user role
      console.log("User found in localStorage. Setting state.");
    } else {
      console.log("No user data found in localStorage.");
    }

    setLoading(false); // Stop loading once session check is complete
  }, []);

  // If data is still loading, show loading screen
  if (loading) {
    console.log("Loading screen active...");
    return <div>Loading...</div>;
  }

  // Handle login after form submission
  const handleLogin = async (email, password) => {
    console.log(`Attempting login with email: ${email}`);

    try {
      // Query the 'users' table for the entered email and password
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email) // Check if email matches
        .eq('password', password) // Check if password matches
        .single(); // Ensure it returns only one user record

      // Debug logging for Supabase response
      console.log("Supabase query result:", data);
      console.log("Supabase query error:", error);

      // Handle error or no matching data
      if (error || !data) {
        console.error("Login Error:", error); // Log the error for debugging
        setError('Invalid credentials, please try again.');
        return;
      }

      // If login is successful, save user data and role to localStorage
      console.log("Login successful. Storing user data in localStorage.");
      localStorage.setItem('user', JSON.stringify(data));
      localStorage.setItem('userRole', data.role);
      setUser(data);
      setUserRole(data.role);

      console.log("User data and role saved to localStorage. Navigating to dashboard.");
      // Redirect to dashboard after successful login
      navigate('/dashboard');
    } catch (err) {
      console.error("Unexpected Error:", err); // Log unexpected errors
      setError('An unexpected error occurred.');
    }
  };

  console.log("App rendering... Current User:", user);

  return (
    <div className="App">
      <Routes>
        {/* Login Page Route */}
        <Route path="/login" element={<LoginPage handleLogin={handleLogin} />} />

        {/* Dashboard Route for logged-in users */}
        <Route
          path="/dashboard"
          element={user ? (
            <Dashboard user={user} userRole={userRole} />
          ) : (
            <Navigate to="/login" />
          )}
        />

        {/* Company Settings Route */}
        <Route
          path="/company-settings"
          element={user ? <CompanySettings /> : <Navigate to="/login" />} 
        />
import StockViewer from './StockViewer';
import './StockViewer.css';

        {/* Customers Route */}
        <Route
          path="/customers"
          element={user ? <Customers /> : <Navigate to="/login" />}
        />

        {/* Locations Route */}
        <Route
          path="/locations"
          element={user ? <Locations /> : <Navigate to="/login" />}
        />

        {/* Categories Route */}
        <Route
          path="/categories"
          element={user ? <Categories /> : <Navigate to="/login" />}
        />

        {/* Products Route */}
        <Route
          path="/products"
          element={user ? <Products /> : <Navigate to="/login" />}
        />

        {/* Units of Measure Route */}
        <Route
          path="/units-of-measure"
          element={user ? <UnitsOfMeasure /> : <Navigate to="/login" />}
        />

        {/* Opening Stock Route */}
        <Route
          path="/opening-stock"
          element={user ? <OpeningStock /> : <Navigate to="/login" />}
        />

        {/* Closing Stock Route */}
        <Route
          path="/closing-stock"
          element={user ? <ClosingStock /> : <Navigate to="/login" />}
        />

        {/* Transfer Route */}
        <Route
          path="/transfer"
          element={user ? <Transfer /> : <Navigate to="/login" />}
        />

        {/* Admin Route based on userRole */}
        {userRole === 'admin' && (
          <Route path="/admin" element={<div>Admin Page: Accessible only by Admin</div>} />
        )}

        {/* Default route: Redirect to login */}
        <Route path="/" element={<Navigate to="/login" />} />
      </Routes>
    </div>
  );
}

export default App;
