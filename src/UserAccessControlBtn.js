import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUserShield } from 'react-icons/fa';
import './UserAccessControlBtn.css';

function UserAccessControlBtn() {
  const navigate = useNavigate();
  return (
    <button
      className="dashboard-page-btn gray"
      style={{ width: 130, height: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'normal', textAlign: 'center', wordBreak: 'break-word', padding: 0 }}
      onClick={() => navigate('/user-access-control')}
      title="User Access Control"
    >
      <FaUserShield size={32} />
      <span style={{ fontSize: 13, marginTop: 2 }}>User Access</span>
    </button>
  );
}

export default UserAccessControlBtn;
