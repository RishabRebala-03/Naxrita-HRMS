import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { RefreshCw, ShieldCheck, ShieldPlus, Users } from "lucide-react";

import { buildRequesterHeaders, getRequesterId } from "../utils/requester";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "";

const AccessManagement = ({ user }) => {
  const [options, setOptions] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [savingUserId, setSavingUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const requesterHeaders = useMemo(() => buildRequesterHeaders(user), [user]);
  const requesterId = getRequesterId(user);

  const loadWorkspace = async () => {
    try {
      setLoading(true);
      setMessage("");
      const response = await axios.get(`${API_BASE}/api/users/access-management`, {
        headers: requesterHeaders,
      });
      setOptions(Array.isArray(response.data?.options) ? response.data.options : []);
      setUsers(Array.isArray(response.data?.users) ? response.data.users : []);
    } catch (error) {
      console.error("Failed to load access management data", error);
      setMessage(error.response?.data?.error || "Failed to load access management data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!requesterId) return;
    loadWorkspace();
  }, [requesterId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;

    return users.filter((item) =>
      [item.name, item.email, item.role, item.department, item.designation, item.employeeId]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [search, users]);

  const stats = useMemo(
    () => ({
      people: users.filter((item) => !item.hasFullAdminAccess).length,
      delegated: users.filter((item) => (item.adminMenuAccess || []).length > 0).length,
      admins: users.filter((item) => item.hasFullAdminAccess).length,
    }),
    [users]
  );

  const togglePermission = async (targetUser, menuKey) => {
    if (targetUser.hasFullAdminAccess) return;

    const currentAccess = Array.isArray(targetUser.adminMenuAccess) ? targetUser.adminMenuAccess : [];
    const nextAccess = currentAccess.includes(menuKey)
      ? currentAccess.filter((key) => key !== menuKey)
      : [...currentAccess, menuKey];

    try {
      setSavingUserId(targetUser._id);
      setMessage("");

      const response = await axios.put(
        `${API_BASE}/api/users/access-management/${targetUser._id}`,
        { adminMenuAccess: nextAccess },
        { headers: requesterHeaders }
      );

      setUsers((current) =>
        current.map((item) => (item._id === targetUser._id ? response.data.user : item))
      );
      setMessage(`Updated access for ${targetUser.name}`);
    } catch (error) {
      console.error("Failed to update delegated access", error);
      setMessage(error.response?.data?.error || "Failed to update delegated access");
    } finally {
      setSavingUserId("");
      window.setTimeout(() => setMessage(""), 3000);
    }
  };

  if (loading) {
    return (
      <section className="access-management-workspace">
        <div className="fiori-loading-card">
          <ShieldPlus size={28} />
          <div>
            <strong>Loading access management</strong>
            <p>Preparing delegated admin controls and user assignments.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="access-management-workspace">
      <header className="admin-hero access-management-hero">
        <div className="admin-hero-copy">
          <div className="admin-section-overline">Security Administration</div>
          <h1>Access Management</h1>
          <p>Grant individual admin sidebar workspaces without turning someone into a full admin.</p>
        </div>

        <div className="admin-hero-meta access-management-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Eligible people</span>
            <strong>{stats.people}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Delegated users</span>
            <strong>{stats.delegated}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Full admins</span>
            <strong>{stats.admins}</strong>
          </div>
        </div>
      </header>

      <section className="employee-directory-summary access-management-summary">
        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Security model</span>
            <ShieldCheck size={18} />
          </div>
          <div className="fiori-stat-value">Least Privilege</div>
          <div className="fiori-stat-note">Users keep their base role and receive only selected admin menus.</div>
        </article>

        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Non-delegable</span>
            <ShieldPlus size={18} />
          </div>
          <div className="fiori-stat-value">Access Control</div>
          <div className="fiori-stat-note">Only full admins can change menu grants or delegate more access.</div>
        </article>

        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Coverage</span>
            <Users size={18} />
          </div>
          <div className="fiori-stat-value">{options.length}</div>
          <div className="fiori-stat-note">Admin sidebar workspaces available for selective delegation.</div>
        </article>
      </section>

      <section className="fiori-panel employee-filter-panel access-management-filter-panel">
        <div className="fiori-panel-header employee-filter-panel-header">
          <div>
            <h3>Assigned Menus</h3>
            <p>Search people, then enable only the admin workspaces they should see and use.</p>
          </div>
          <button type="button" className="fiori-button secondary" onClick={loadWorkspace}>
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="employee-directory-filters">
          <label className="employee-filter-field employee-filter-search">
            <span>Search people</span>
            <input
              className="input"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, email, employee ID, role, or department"
            />
          </label>
        </div>
      </section>

      <section className="fiori-panel access-management-matrix-panel">
        <div className="fiori-panel-header">
          <div>
            <h3>Delegated Access Matrix</h3>
            <p>{filteredUsers.length} visible user{filteredUsers.length === 1 ? "" : "s"} in the current view.</p>
          </div>
        </div>

        <div className="fiori-table-shell access-management-table-shell">
          <table className="fiori-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Status</th>
                {options.map((option) => (
                  <th key={option.key}>{option.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((item) => {
                const isSaving = savingUserId === item._id;

                return (
                  <tr key={item._id}>
                    <td>
                      <div className="fiori-primary-cell">
                        <strong>{item.name || "Unnamed user"}</strong>
                        <span>{item.email || "No email"}</span>
                        <span>{item.employeeId || item._id}</span>
                      </div>
                    </td>
                    <td>
                      <div className="fiori-primary-cell">
                        <strong>{item.role || "Employee"}</strong>
                        <span>{item.designation || "No designation"}</span>
                        <span>{item.department || "No department"}</span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`fiori-status-pill ${
                          item.hasFullAdminAccess
                            ? "is-neutral"
                            : item.is_active === false
                              ? "is-rejected"
                              : "is-approved"
                        }`}
                      >
                        {item.hasFullAdminAccess
                          ? "Full Admin"
                          : item.is_active === false
                            ? "Inactive"
                            : "Active"}
                      </span>
                    </td>
                    {options.map((option) => {
                      const checked = (item.adminMenuAccess || []).includes(option.key);

                      return (
                        <td key={option.key}>
                          <label
                            className="access-management-toggle"
                            title={option.description || option.label}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={item.hasFullAdminAccess || isSaving}
                              onChange={() => togglePermission(item, option.key)}
                            />
                            <span>{item.hasFullAdminAccess ? "Included" : checked ? "Granted" : "Off"}</span>
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!filteredUsers.length ? (
                <tr>
                  <td colSpan={3 + options.length}>No users match the current search.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {message ? (
        <div
          className={`admin-toast ${
            message.toLowerCase().includes("failed") || message.toLowerCase().includes("error")
              ? "is-error"
              : "is-success"
          }`}
        >
          {message}
        </div>
      ) : null}
    </section>
  );
};

export default AccessManagement;
