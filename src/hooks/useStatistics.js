import { useEffect, useState } from 'react';
import supabase from '../supabase';

// Shared statistics hook: computes sales by currency, most/least sold product,
// layby dues by currency, and total customers. Accepts optional filters.
export default function useStatistics({ dateFrom = '', dateTo = '', locationFilter = '' } = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [stats, setStats] = useState({
    salesByCurrency: {},
    mostSoldProduct: '',
    leastSoldProduct: '',
    laybyByCurrency: {},
    dueK: 0,
    due$: 0,
    dueUSD: 0,
    totalCustomers: 0,
  });
  const [debug, setDebug] = useState({
    salesData: [],
    salesItemsData: [],
    productsData: [],
    laybyData: [],
    customersData: [],
    saleIds: [],
    filteredSales: [],
    productSales: {},
    prodMap: {},
  });

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);
      setError('');
      try {
        // 0) Locations map for name->id resolution
        const { data: locData } = await supabase.from('locations').select('id, name');
        const locationMap = {};
        (locData || []).forEach(l => { locationMap[l.id] = l.name; });

        const resolveLocId = (filter) => {
          if (!filter) return '';
          // If numeric-ish assume it's an id, else try match name
          if (!isNaN(Number(filter))) return filter;
          const match = Object.keys(locationMap).find(id => (locationMap[id] || '').toLowerCase() === String(filter).toLowerCase());
          return match || filter;
        };
        const locId = resolveLocId(locationFilter);

        // 1) Total Sales (with currency)
        let salesQuery = supabase.from('sales').select('id, total_amount, sale_date, location_id, currency');
        if (dateFrom) salesQuery = salesQuery.gte('sale_date', dateFrom);
        if (dateTo) salesQuery = salesQuery.lte('sale_date', dateTo);
        if (locId) salesQuery = salesQuery.eq('location_id', locId);
        const { data: salesData, error: salesError } = await salesQuery;
        if (salesError) throw salesError;
        const salesByCurrency = {};
        (salesData || []).forEach(s => {
          const cur = s.currency || '';
          salesByCurrency[cur] = (salesByCurrency[cur] || 0) + ((Number(s.total_amount) || 0));
        });

        // 2) Most/Least Sold Product (filter by date/location)
        const allSales = salesData || [];
        let filteredSales = allSales;
        // Already filtered by query above
        const saleIds = filteredSales.map(s => s.id);
        let itemsData = [];
        if (saleIds.length > 0) {
          const { data: items, error: itemsError } = await supabase
            .from('sales_items')
            .select('product_id, quantity, sale_id')
            .in('sale_id', saleIds);
          if (itemsError) throw itemsError;
          itemsData = items;
        }
        const productSales = {};
        (itemsData || []).forEach(item => {
          productSales[item.product_id] = (productSales[item.product_id] || 0) + (Number(item.quantity) || 0);
        });
        let mostSoldProduct = '', leastSoldProduct = '';
        let prodMap = {};
        if (Object.keys(productSales).length > 0) {
          const sorted = Object.entries(productSales).sort((a, b) => b[1] - a[1]);
          const prodIds = sorted.map(([id]) => id);
          const { data: prodData, error: prodError } = await supabase
            .from('products')
            .select('id, name')
            .in('id', prodIds);
          if (prodError) throw prodError;
          (prodData || []).forEach(p => { prodMap[p.id] = p.name; });
          mostSoldProduct = prodMap[sorted[0][0]] || '';
          leastSoldProduct = prodMap[sorted[sorted.length - 1][0]] || '';
        }

        // 3) Lay-By dues by currency
        // Lay-By dues by currency (use sales.currency per layby)
        let laybyQuery = supabase.from('laybys').select('id, sale_id, total_amount, paid_amount, location_id');
        if (locId) laybyQuery = laybyQuery.eq('location_id', locId);
        const { data: laybyData, error: laybyError } = await laybyQuery;
        if (laybyError) throw laybyError;
        const laybyByCurrency = {};
        // Recompute paid per layby using down_payment + sales_payments
        const saleIdsForLayby = Array.from(new Set((laybyData || []).map(l => Number(l.sale_id)).filter(id => !isNaN(id))));
        let downMap = {}, payMap = {}, currencyMap = {};
        if (saleIdsForLayby.length) {
          const { data: dpRows } = await supabase.from('sales').select('id, down_payment, currency').in('id', saleIdsForLayby);
          (dpRows || []).forEach(r => {
            downMap[r.id] = Number(r.down_payment || 0);
            currencyMap[r.id] = r.currency || 'K';
          });
          const { data: payRows } = await supabase.from('sales_payments').select('sale_id, amount').in('sale_id', saleIdsForLayby);
          (payRows || []).forEach(p => { const sid = Number(p.sale_id); payMap[sid] = (payMap[sid] || 0) + Number(p.amount || 0); });
        }
        let dueK = 0, due$ = 0;
        (laybyData || []).forEach(l => {
          const sid = Number(l.sale_id);
          const curRaw = currencyMap[sid] || 'K';
          const cur = (curRaw === '$' || (curRaw || '').toUpperCase() === 'USD') ? 'USD' : 'K';
          const paid = (downMap[sid] || 0) + (payMap[sid] || 0);
          const due = Math.max(0, (Number(l.total_amount) || 0) - paid);
          laybyByCurrency[cur] = (laybyByCurrency[cur] || 0) + due;
          if (cur === 'K') dueK += due;
          else if (cur === 'USD') due$ += due;
        });

        // 4) Total Customers
        const { data: custData, error: custError } = await supabase.from('customers').select('id');
        if (custError) throw custError;
        const totalCustomers = (custData || []).length;

        // Products for debug only
        const { data: productsData } = await supabase.from('products').select('id, name');

  setStats({ salesByCurrency, mostSoldProduct, leastSoldProduct, laybyByCurrency, dueK, due$, dueUSD: due$, totalCustomers });
        setDebug({
          salesData: salesData || [],
          salesItemsData: itemsData || [],
          productsData: productsData || [],
          laybyData: laybyData || [],
          customersData: custData || [],
          saleIds,
          filteredSales,
          productSales,
          prodMap,
        });
      } catch (err) {
        setError('Failed to fetch statistics.');
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, locationFilter]);

  return { loading, error, stats, debug };
}
