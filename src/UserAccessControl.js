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
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [stats, setStats] = useState({});
  const [aziliEnabled, setAziliEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Fetch users from Supabase
  useEffect(() => {
    async function fetchUsers() {
      // Exclude admin users from the dropdown
      const { data, error } = await supabase.from('users').select('id, full_name, email, role');
      if (data) {
        const nonAdmins = data.filter(u => u.role !== 'admin');
        setUsers(nonAdmins);
        setSelectedUser(nonAdmins[0]?.id || null);
      }
    }
    fetchUsers();
  }, []);

  // Fetch permissions, stats, azili for selected user
  useEffect(() => {
    if (!selectedUser) return;
    setLoading(true);
    async function fetchUserPermissions() {
      // Fetch user role
      const { data: userRoleData } = await supabase.from('user_roles').select('role_id').eq('user_id', selectedUser).single();
      const roleId = userRoleData?.role_id;
      // Fetch permissions for this role
      let perms = {};
      if (roleId) {
        const { data: permsData } = await supabase.from('permissions').select('*').eq('role_id', roleId);
        for (const mod of MODULES) {
          perms[mod.name] = {};
          for (const action of mod.actions) {
            const found = permsData?.find(p => p.module === mod.name);
            perms[mod.name][action] = found ? !!found[`can_${action}`] : false;
          }
        }
      }
      setPermissions(perms);
      // Fetch stats access (assume a user_stats table: user_id, stat, allowed)
      const { data: statsData } = await supabase.from('user_stats').select('stat, allowed').eq('user_id', selectedUser);
      let statsObj = {};
      for (const s of STATS) {
        const found = statsData?.find(st => st.stat === s);
        statsObj[s] = found ? !!found.allowed : false;
      }
      setStats(statsObj);
      // Fetch azili enabled (assume a user_settings table: user_id, azili_enabled)
      const { data: aziliData } = await supabase.from('user_settings').select('azili_enabled').eq('user_id', selectedUser).single();
      setAziliEnabled(!!aziliData?.azili_enabled);
      setLoading(false);
    }
    fetchUserPermissions();
  }, [selectedUser]);

  const handlePermissionToggle = (module, action) => {
    setPermissions(prev => ({
      ...prev,
      [module]: {
        ...prev[module],
        [action]: prev[module]?.[action] === true ? false : true,
      },
    }));
  };

  const handleStatToggle = (stat) => {
    setStats(prev => ({
      ...prev,
      [stat]: prev[stat] === true ? false : true,
    }));
  };

  // Save changes to Supabase
  const handleSave = async () => {
    setSaving(true);
    // Save permissions: update permissions table for the user's role
    const { data: userRoleData } = await supabase.from('user_roles').select('role_id').eq('user_id', selectedUser).single();
    const roleId = userRoleData?.role_id;
    if (roleId) {
      for (const mod of MODULES) {
        const permRow = {
          module: mod.name,
          role_id: roleId,
        };
        for (const action of mod.actions) {
          permRow[`can_${action}`] = !!permissions[mod.name]?.[action];
        }
        // Upsert permission row
        await supabase.from('permissions').upsert([permRow], { onConflict: ['module', 'role_id'] });
      }
    }
    // Save stats: upsert user_stats
    for (const stat of STATS) {
      await supabase.from('user_stats').upsert([
        { user_id: selectedUser, stat, allowed: !!stats[stat] }
      ], { onConflict: ['user_id', 'stat'] });
    }
    // Save azili enabled: upsert user_settings
    await supabase.from('user_settings').upsert([
      { user_id: selectedUser, azili_enabled: aziliEnabled }
    ], { onConflict: ['user_id'] });
    setSaving(false);
    alert('Permissions updated!');
  };

return (
  <div className="user-access-control-root" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'flex-start', padding: 0 }}>
    <h2 style={{ margin: '8px 0 2px 0' }}>User Access Control</h2>
    <div className="user-select-row" style={{ marginBottom: 2 }}>
      <label htmlFor="user-select">Select User:</label>
      <select id="user-select" value={selectedUser || ''} onChange={e => setSelectedUser(Number(e.target.value))}>
        {users.map(u => (
          <option key={u.id} value={u.id}>{u.full_name || u.email || u.id}</option>
        ))}
      </select>
    </div>
    {loading ? <div>Loading...</div> : <>
    <div className="stats-section" style={{ marginBottom: 1, overflowX: 'auto', maxWidth: '100vw' }}>
      <h3 style={{ margin: '0 0 1px 0', fontSize: '1.01em' }}>Stats Access</h3>
      <table className="stats-table-outline" style={{ border: '2px solid #00ffff', borderCollapse: 'collapse', width: 'fit-content', minWidth: 120, margin: '0 auto', fontSize: '0.75rem' }}>
        <thead>
          <tr>
            {STATS.map(stat => (
              <th key={stat} style={{ border: '1px solid #00ffff', textAlign: 'center', padding: '0 1px' }}>{stat}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {STATS.map(stat => (
              <td key={stat} style={{ border: '1px solid #00ffff', textAlign: 'center', padding: '0' }}>
                <span
                  className={`custom-checkbox ${stats[stat] ? 'checked' : 'unchecked'}`}
                  onClick={() => handleStatToggle(stat)}
                  role="checkbox"
                  aria-checked={stats[stat]}
                  tabIndex={0}
                  style={{ fontSize: '0.9em' }}
                >
                  {stats[stat] ? '✔️' : '❌'}
                </span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
    {/* Removed report search fields as requested */}
    {/* Permissions matrix for all modules except 'Reports' */}
    <div className="permissions-matrix-horizontal" style={{ display: 'flex', gap: 0, justifyContent: 'center', overflowX: 'auto', maxWidth: '100vw', marginBottom: 1 }}>
      {[0, 1, 2].map(i => {
        const third = Math.ceil((MODULES.length - 1) / 3); // -1 to exclude 'Reports'
        // Exclude 'Reports' from the matrix
        const filteredModules = MODULES.filter(m => m.name !== 'Reports');
        const modulesSlice = filteredModules.slice(i * third, (i + 1) * third);
        return (
          <table key={i} className="permissions-table-outline" style={{ minWidth: 120, maxWidth: 135, marginRight: i < 2 ? 0 : 0, borderCollapse: 'collapse', border: '2px solid #00ffff', fontSize: '0.75rem' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #00ffff', textAlign: 'center', padding: '0 1px' }}>Module/Page</th>
                {['add', 'edit', 'delete', 'view'].map(action => (
                  <th key={action} style={{ border: '1px solid #00ffff', textAlign: 'center', padding: '0 1px' }}>{action.charAt(0).toUpperCase() + action.slice(1)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {modulesSlice.map(mod => {
                const isReport = mod.name.toLowerCase().includes('report');
                return (
                  <tr key={mod.name}>
                    <td style={{ border: '1px solid #00ffff', textAlign: 'left', paddingLeft: 1 }}>{mod.name}</td>
                    {['add', 'edit', 'delete', 'view'].map(action => (
                      <td key={action} style={{ border: '1px solid #00ffff', textAlign: 'center', padding: '0' }}>
                        {mod.actions.includes(action) && (!isReport || action === 'view') ? (
                          <span
                            className={`custom-checkbox ${permissions[mod.name]?.[action] ? 'checked' : 'unchecked'}`}
                            onClick={() => handlePermissionToggle(mod.name, action)}
                            role="checkbox"
                            aria-checked={permissions[mod.name]?.[action]}
                            tabIndex={0}
                            style={{ fontSize: '0.9em' }}
                          >
                            {permissions[mod.name]?.[action] ? '✔️' : '❌'}
                          </span>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', margin: '10px 0 0 0', width: '100%' }}>
      <button
        className="save-btn"
        onClick={handleSave}
        disabled={saving}
        style={{
          fontSize: '0.95em',
          padding: '6px 18px',
          background: '#00bfff',
          color: '#fff',
          border: 'none',
          borderRadius: 6,
          fontWeight: 600,
          boxShadow: '0 1px 4px #0003',
          cursor: 'pointer',
          transition: 'background 0.2s',
          minWidth: 120,
          marginRight: 'auto',
        }}
        onMouseOver={e => { e.currentTarget.style.background = '#0099cc'; }}
        onMouseOut={e => { e.currentTarget.style.background = '#00bfff'; }}
      >{saving ? 'Saving...' : 'Save Changes'}</button>
      <div className="azili-toggle-row" style={{ display: 'flex', alignItems: 'center', margin: '0 auto' }}>
        <label style={{ marginRight: 4, color: '#00bfff', fontWeight: 600 }}>Enable Factory Reset:</label>
        <span
          className={`custom-checkbox ${aziliEnabled ? 'checked' : 'unchecked'}`}
          onClick={() => setAziliEnabled(v => !v)}
          role="checkbox"
          aria-checked={aziliEnabled}
          tabIndex={0}
          style={{ fontSize: '1.1em' }}
        >
          {aziliEnabled ? '✔️' : '❌'}
        </span>
      </div>
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
    </>}
  </div>
  );
}

export default UserAccessControl;
