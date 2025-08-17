import PriceLabels from './PriceLabels';
import React from 'react';
import { Route, Routes, Navigate, useLocation, useNavigate } from 'react-router-dom';
import BackToDashboard from './BackToDashboard';
import LoginPage from './LoginPage';
import Dashboard from './Dashboard';
import POS from './POS';
import CompanySettings from './CompanySettings';
import Customers from './Customers';
import Locations from './Locations';
import Products from './Products';
import ProductsListPage from './ProductsListPage';
import Categories from './Categories';
import UnitsOfMeasure from './UnitsOfMeasure';
import OpeningStock from './OpeningStock';
import ClosingStock from './ClosingStock';
import Transfer from './Transfer';
import TransferList from './TransferList';
import supabase from './supabase';
// import VarianceReport from './VarianceReport';
// import StockViewer from './StockViewer';
import Sets from "./Sets";
import SalesReport from './SalesReport';
import StockReport from './StockReport';
import StockApp from './StockApp';
import StocktakeReport from './StocktakeReport';
import LaybyManagement from "./LaybyManagement";
import LaybyManagementMobile from "./LaybyManagementMobile";
import EditSet from './EditSet';
import PriceLabelMobile from './PriceLabelMobile';
// Utility to detect Android WebView
const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
// SmartRedirect: redirects / based on user role
function SmartRedirect() {
  const navigate = useNavigate();
  React.useEffect(() => {
    async function doRedirect() {
      // Only redirect to layby-management for Android app
      if (isAndroid) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          navigate('/stock-report', { replace: true });
          return;
        }
        const { data: userRows } = await supabase.from('users').select('role').eq('id', user.id);
        const role = userRows && userRows[0] ? userRows[0].role : null;
        if (["admin", "user"].includes(role)) {
          navigate('/layby-management', { replace: true });
        } else {
          navigate('/login', { replace: true });
        }
      } else {
        // On desktop/web, go to dashboard
        navigate('/dashboard', { replace: true });
      }
    }
    doRedirect();
  }, [navigate]);
  return null;
}

function App() {
  return (
    <div className="App">
      <BackToDashboard />
  <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/locations" element={<Locations />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products-list" element={<ProductsListPage />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/layby-management" element={<LaybyManagement />} />
        <Route path="/layby-management-mobile" element={<LaybyManagementMobile />} />
  <Route path="/stock-report-mobile" element={React.createElement(require('./StockReportMobile').default)} />
  <Route path="/stock-report-mobile-locked" element={React.createElement(require('./StockReportMobileLocked').default)} />
        <Route path="/closing-stock-mobile" element={React.createElement(require('./ClosingStockMobile').default)} />
        {/* <Route path="/layby-management-view" element={<LaybyManagementView />} /> */}
        {/* <Route path="/layby-report" element={<LaybyManagementView />} /> */}
  <Route path="/stocktake-report" element={<StocktakeReport />} />
  <Route path="/price-labels" element={<PriceLabels />} />
  <Route path="/price-labels-mobile" element={<PriceLabelMobile />} />
        <Route path="/stock-report" element={<StockReport />} />
        <Route path="/opening-stock" element={<OpeningStock />} />
        <Route path="/transfer" element={<Transfer />} />
        <Route path="/sales-report" element={<SalesReport />} />
        <Route path="/company-settings" element={<CompanySettings />} />
        <Route path="/sets" element={<Sets />} />
        <Route path="/units-of-measure" element={<UnitsOfMeasure />} />
        {/* <Route path="/stock-viewer" element={<StockViewer />} /> */}
        <Route path="/transfers" element={<TransferList />} />
        <Route path="/closing-stock" element={<ClosingStock />} />
        <Route path="/edit-set/:id" element={<EditSet />} />
        {/* Add more routes as needed */}
        <Route path="*" element={<LoginPage />} />
      </Routes>
    </div>
  );
}

export default App;
