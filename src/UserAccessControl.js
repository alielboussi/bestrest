import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './UserAccessControl.css';
import supabase from './supabase';

// Define modules/pages and stats (static for now, can be fetched if you want to make dynamic)
const MODULES = [
  { name: 'Dashboard', actions: ['view'] },
  { name: 'Products', actions: ['add', 'edit', 'delete', 'view'] },
  { name: 'Categories', actions: ['add', 'edit', 'delete', 'view'] },
  { name: 'Customers', actions: ['add', 'edit', 'delete', 'view'] },
  { name: 'Sales', actions: ['add', 'edit', 'delete', 'view'] },
  { name: 'Laybys', actions: ['add', 'edit', 'delete', 'view'] },
  { name: 'Stocktake', actions: ['add', 'edit', 'delete', 'view'] },
  { name: 'Stock Transfers', actions: ['add', 'edit', 'delete', 'view'] },
  { name: 'Transfer List', actions: ['add', 'edit', 'delete', 'view'] },
  { name: 'Closing Stock', actions: ['add', 'edit', 'delete', 'view'] },
  { name: 'Units of Measure', actions: ['add', 'edit', 'delete', 'view'] },
  { name: 'Stock Viewer', actions: ['add', 'edit', 'delete', 'view'] },
  { name: 'Sets', actions: ['add', 'edit', 'delete', 'view'] },
  { name: 'Reports', actions: ['view'] },
  { name: 'Sales Report', actions: ['view'] },
  { name: 'Stock Report', actions: ['view'] },
  { name: 'Layby Report', actions: ['view'] },
  { name: 'Stocktake Report', actions: ['view'] },
  { name: 'Company Settings', actions: ['add', 'edit', 'delete', 'view'] },
  { name: 'Variance Report', actions: ['view'] },
];
const STATS = [
  'Total Sales',
  'Outstanding Laybys',
  'Stock Value',
  'Customer Due',
  'Variance',
];

function UserAccessControl() {
  const navigate = useNavigate();
  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch roles from Supabase
  useEffect(() => {
    supabase.from('roles').select('*').then(({ data }) => setRoles(data || []));
  }, []);

  // Fetch permissions for selected role
  useEffect(() => {
    if (!selectedRoleId) return;
    setLoading(true);
    supabase.from('permissions').select('*').eq('role_id', selectedRoleId)
      .then(({ data }) => {
        setPermissions(data || []);
        setLoading(false);
      });
  }, [selectedRoleId]);

  // Handle toggle change
  const handleToggle = async (module, action, value) => {
    setLoading(true);
    setMessage('');
    const { error } = await supabase
      .from('permissions')
      .update({ [action]: value })
      .eq('role_id', selectedRoleId)
      .eq('module', module);
    if (error) {
      setMessage('Failed to update permission.');
    } else {
      setMessage('Permission updated!');
    }
    // Refresh permissions
    const { data } = await supabase.from('permissions').select('*').eq('role_id', selectedRoleId);
    setPermissions(data || []);
    setLoading(false);
  };

  const handleStatToggle = (stat) => {
    setStats(prev => ({
      ...prev,
      [stat]: prev[stat] === true ? false : true,
    }));
  };

  // No save button needed, changes are live

  return (
    <div className="user-access-control-root" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'flex-start', padding: 0 }}>
      <h2 style={{ margin: '8px 0 2px 0' }}>User Access Control</h2>
      <div className="role-select-row" style={{ marginBottom: 2 }}>
        <label htmlFor="role-select">Select Role:</label>
        <select id="role-select" value={selectedRoleId || ''} onChange={e => setSelectedRoleId(Number(e.target.value))}>
          <option value="">-- Select Role --</option>
          {roles.map(role => (
            <option key={role.id} value={role.id}>{role.role_name}</option>
          ))}
        </select>
      </div>
      {loading ? <div>Loading...</div> : null}
      {message && <div className="success-message">{message}</div>}
      {selectedRoleId && (
        <table className="access-table">
          <thead>
            <tr>
              <th>Module/Page</th>
              {['can_view', 'can_add', 'can_edit', 'can_delete'].map(action => (
                <th key={action}>{action.replace('can_', '').toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MODULES.map(mod => {
              const perm = permissions.find(p => p.module === mod.name);
              return (
                <tr key={mod.name}>
                  <td>{mod.name}</td>
                  {['can_view', 'can_add', 'can_edit', 'can_delete'].map(action => (
                    <td key={action}>
                      <input
                        type="checkbox"
                        checked={perm ? perm[action] : false}
                        onChange={e => handleToggle(mod.name, action, e.target.checked)}
                        disabled={loading}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <button
        className="back-to-dashboard-btn"
        style={{
          fontSize: '0.95em',
          padding: '6px 18px',
          background: '#00bfff',
          color: '#fff',
          border: '2px solid #00bfff',
          borderRadius: 6,
          fontWeight: 600,
          boxShadow: '0 1px 4px #0003',
          cursor: 'pointer',
          transition: 'background 0.2s, color 0.2s',
          minWidth: 120,
          marginLeft: 'auto',
        }}
        onClick={() => navigate('/dashboard')}
        onMouseOver={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#00bfff'; e.currentTarget.style.borderColor = '#00bfff'; }}
        onMouseOut={e => { e.currentTarget.style.background = '#00bfff'; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#00bfff'; }}
      >
        Back to Dashboard
      </button>
    </div>
  );
}

export default UserAccessControl;
