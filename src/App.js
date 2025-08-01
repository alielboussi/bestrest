import React from 'react';
import { Route, Routes, Navigate, useLocation } from 'react-router-dom';
import LaybyManagement from "./LaybyManagement";
import Dashboard from './Dashboard';
import POS from './POS';
import CompanySettings from './CompanySettings';
import Customers from './Customers';
import Locations from './Locations';
import Products from './Products';
import Categories from './Categories';
import UnitsOfMeasure from './UnitsOfMeasure';
import OpeningStock from './OpeningStock';
import ClosingStock from './ClosingStock';
import Transfer from './Transfer';
import TransferList from './TransferList';
import supabase from './supabase';
import VarianceReport from './VarianceReport';
import StockViewer from './StockViewer';
import Sets from "./Sets";
import SalesReport from './SalesReport';
import StockReport from './StockReport';
import StockApp from './StockApp';
import StocktakeReport from './StocktakeReport';
import Roneth113ResetButton from './Roneth113ResetButton';

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
  return (
    <div className="App">
      <Routes>
        {/* Public, view-only stock report for Android app */}
        <Route path="/stock-app" element={<StockApp />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/layby-management" element={<LaybyManagement />} />
        <Route path="/company-settings" element={<CompanySettings />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/locations" element={<Locations />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/products" element={<Products />} />
        <Route path="/units-of-measure" element={<UnitsOfMeasure />} />
        <Route path="/opening-stock" element={<OpeningStock />} />
        <Route path="/closing-stock" element={<ClosingStock />} />
        <Route path="/transfer" element={<Transfer />} />
        <Route path="/transfer/:id" element={<Transfer />} />
        <Route path="/transfers" element={<TransferList />} />
        <Route path="/stock-viewer" element={<StockViewer />} />
        <Route path="/sets" element={<Sets />} />
        <Route path="/sales-report" element={<SalesReport />} />
        <Route path="/stock-report" element={<StockReport />} />
        <Route path="/stocktake-report" element={<StocktakeReport />} />
        <Route path="/variance-report" element={<VarianceReportWrapper />} />
        {/* Default route: Redirect to closing-stock */}
        <Route path="/" element={<Navigate to="/closing-stock" />} />
      </Routes>
      <Roneth113ResetButton />
    </div>
  );
}

export default App;
