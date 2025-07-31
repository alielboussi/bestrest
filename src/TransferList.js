import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from './supabase';
import './TransferList.css';

const TransferList = () => {
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTransfers = async () => {
      setLoading(true);
      const { data: locs } = await supabase.from('locations').select('id, name');
      setLocations(locs || []);
      const { data, error } = await supabase
        .from('stock_transfer_sessions')
        .select('id, from_location, to_location, delivery_number, transfer_date, created_at')
        .order('created_at', { ascending: false });
      console.log('Fetched transfers:', data, 'Error:', error);
      setTransfers(data || []);
      setLoading(false);
    };
    fetchTransfers();
  }, []);

  return (
    <div className="transfer-list-container">
      <div className="transfer-list-title">Processed Transfers</div>
      {loading ? <div>Loading...</div> : (
        transfers.length === 0 ? (
          <div style={{color:'#aaa', textAlign:'center', marginTop:'2rem', fontSize:'1.1rem'}}>No transfers found.</div>
        ) : (
          <table className="transfer-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>From</th>
                <th>To</th>
                <th>Delivery #</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map(t => (
                <tr key={t.id}>
                  <td>{t.transfer_date}</td>
                  <td>{locations.find(l => l.id === t.from_location)?.name || t.from_location}</td>
                  <td>{locations.find(l => l.id === t.to_location)?.name || t.to_location}</td>
                  <td>{t.delivery_number}</td>
                  <td>
                    <button className="transfer-edit-btn" onClick={() => navigate(`/transfer/${t.id}`)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      )}
    </div>
  );
};

export default TransferList;
