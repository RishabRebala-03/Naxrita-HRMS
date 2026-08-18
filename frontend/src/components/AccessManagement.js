import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { CalendarRange, ChevronDown, ChevronUp, Filter, RefreshCw, Save } from "lucide-react";

import { buildRequesterHeaders, getRequesterId } from "../utils/requester";
import ValueHelpSearch from "./ValueHelpSearch";
import ValueHelpSelect from "./ValueHelpSelect";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

const getReportingLeadLabel = (item = {}) =>
  item.reportingLeadName ||
  item.reporting_manager_name ||
  item.reportingManagerName ||
  item.reportingLead ||
  item.reporting_manager ||
  item.reportingManager ||
  item.managerName ||
  item.manager ||
  "";

const normalizeValue = (value) => String(value || "").trim().toLowerCase();

const sortUsers = (items, sortBy) => {
  const ranked = [...items];
  ranked.sort((first, second) => {
    switch (sortBy) {
      case "name_desc":
        return normalizeValue(second.name).localeCompare(normalizeValue(first.name));
      case "department":
        return normalizeValue(first.department).localeCompare(normalizeValue(second.department))
          || normalizeValue(first.name).localeCompare(normalizeValue(second.name));
      case "role":
        return normalizeValue(first.role).localeCompare(normalizeValue(second.role))
          || normalizeValue(first.name).localeCompare(normalizeValue(second.name));
      case "designation":
        return normalizeValue(first.designation).localeCompare(normalizeValue(second.designation))
          || normalizeValue(first.name).localeCompare(normalizeValue(second.name));
      case "menu_count_desc":
        return ((second.adminMenuAccess || []).length - (first.adminMenuAccess || []).length)
          || normalizeValue(first.name).localeCompare(normalizeValue(second.name));
      case "menu_count_asc":
        return ((first.adminMenuAccess || []).length - (second.adminMenuAccess || []).length)
          || normalizeValue(first.name).localeCompare(normalizeValue(second.name));
      case "recent_status":
        return Number(Boolean(second.is_active)) - Number(Boolean(first.is_active))
          || normalizeValue(first.name).localeCompare(normalizeValue(second.name));
      case "name_asc":
      default:
        return normalizeValue(first.name).localeCompare(normalizeValue(second.name));
    }
  });
  return ranked;
};

const AccessManagement = ({ user }) => {
  const [options, setOptions] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [roleFilter, setRoleFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [designationFilter, setDesignationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accessTypeFilter, setAccessTypeFilter] = useState("all");
  const [menuFilter, setMenuFilter] = useState("all");
  const [emailDomainFilter, setEmailDomainFilter] = useState("all");
  const [employeeIdFilter, setEmployeeIdFilter] = useState("all");
  const [reportingLeadFilter, setReportingLeadFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name_asc");
  const [savingUserId, setSavingUserId] = useState("");
  const [blockSettings, setBlockSettings] = useState({
    first_fortnight_block_day: 14,
    second_fortnight_block_day: 28,
  });
  const [savingBlockSettings, setSavingBlockSettings] = useState(false);
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
      const blockSettingsResponse = await axios.get(`${API_BASE}/api/timesheets/block-settings`, {
        headers: requesterHeaders,
      });
      setOptions(Array.isArray(response.data?.options) ? response.data.options : []);
      setUsers(Array.isArray(response.data?.users) ? response.data.users : []);
      setBlockSettings({
        first_fortnight_block_day: Number(blockSettingsResponse.data?.first_fortnight_block_day || 14),
        second_fortnight_block_day: Number(blockSettingsResponse.data?.second_fortnight_block_day || 28),
      });
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

  const roleOptions = useMemo(
    () => Array.from(new Set(users.map((item) => item.role).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [users]
  );

  const departmentOptions = useMemo(
    () => Array.from(new Set(users.map((item) => item.department).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [users]
  );

  const designationOptions = useMemo(
    () => Array.from(new Set(users.map((item) => item.designation).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [users]
  );

  const reportingLeadOptions = useMemo(
    () => Array.from(new Set(users.map((item) => getReportingLeadLabel(item)).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [users]
  );

  const emailDomainOptions = useMemo(
    () =>
      Array.from(
        new Set(
          users
            .map((item) => String(item.email || "").split("@")[1] || "")
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = users.filter((item) => {
      const menuAccess = Array.isArray(item.adminMenuAccess) ? item.adminMenuAccess : [];
      const reportingLead = getReportingLeadLabel(item);
      const emailDomain = String(item.email || "").split("@")[1] || "";
      const matchesSearch = !query || [
        item.name,
        item.email,
        item.role,
        item.department,
        item.designation,
        item.employeeId,
        reportingLead,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      const matchesRole = roleFilter === "all" || (item.role || "") === roleFilter;
      const matchesDepartment = departmentFilter === "all" || (item.department || "") === departmentFilter;
      const matchesDesignation = designationFilter === "all" || (item.designation || "") === designationFilter;
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "active" && item.is_active !== false)
        || (statusFilter === "inactive" && item.is_active === false)
        || (statusFilter === "full_admin" && item.hasFullAdminAccess)
        || (statusFilter === "delegated" && !item.hasFullAdminAccess && menuAccess.length > 0)
        || (statusFilter === "no_delegation" && !item.hasFullAdminAccess && menuAccess.length === 0);
      const matchesAccessType = accessTypeFilter === "all"
        || (accessTypeFilter === "admins_only" && item.hasFullAdminAccess)
        || (accessTypeFilter === "delegated_only" && !item.hasFullAdminAccess && menuAccess.length > 0)
        || (accessTypeFilter === "eligible_only" && !item.hasFullAdminAccess)
        || (accessTypeFilter === "without_access" && !item.hasFullAdminAccess && menuAccess.length === 0);
      const matchesMenu = menuFilter === "all" || menuAccess.includes(menuFilter);
      const matchesEmailDomain = emailDomainFilter === "all" || emailDomain === emailDomainFilter;
      const matchesEmployeeId = employeeIdFilter === "all"
        || (employeeIdFilter === "present" && Boolean(item.employeeId))
        || (employeeIdFilter === "missing" && !item.employeeId);
      const matchesReportingLead = reportingLeadFilter === "all" || reportingLead === reportingLeadFilter;

      return matchesSearch
        && matchesRole
        && matchesDepartment
        && matchesDesignation
        && matchesStatus
        && matchesAccessType
        && matchesMenu
        && matchesEmailDomain
        && matchesEmployeeId
        && matchesReportingLead;
    });

    return sortUsers(filtered, sortBy);
  }, [
    accessTypeFilter,
    departmentFilter,
    designationFilter,
    emailDomainFilter,
    employeeIdFilter,
    menuFilter,
    reportingLeadFilter,
    roleFilter,
    search,
    sortBy,
    statusFilter,
    users,
  ]);

  const stats = useMemo(
    () => ({
      people: users.filter((item) => !item.hasFullAdminAccess).length,
      delegated: users.filter((item) => (item.adminMenuAccess || []).length > 0).length,
      admins: users.filter((item) => item.hasFullAdminAccess).length,
    }),
    [users]
  );

  const searchSuggestions = useMemo(() => {
    const seen = new Set();
    return users.flatMap((item) => {
      const values = [
        {
          value: item.name || "",
          label: item.name || "",
          description: item.email || item.department || item.role || "",
        },
        {
          value: item.email || "",
          label: item.email || "",
          description: item.name || item.department || item.role || "",
        },
        {
          value: item.employeeId || "",
          label: item.employeeId || "",
          description: item.name || item.email || "",
        },
        {
          value: item.department || "",
          label: item.department || "",
          description: "Department",
        },
        {
          value: item.role || "",
          label: item.role || "",
          description: "Role",
        },
        {
          value: getReportingLeadLabel(item) || "",
          label: getReportingLeadLabel(item) || "",
          description: "Reporting lead",
        },
      ].filter((entry) => entry.value);

      return values.filter((entry) => {
        const key = `${entry.value}`.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
  }, [users]);

  const roleFilterOptions = useMemo(
    () => [
      { value: "all", label: "All roles" },
      ...roleOptions.map((option) => ({ value: option, label: option })),
    ],
    [roleOptions]
  );
  const departmentFilterOptions = useMemo(
    () => [
      { value: "all", label: "All departments" },
      ...departmentOptions.map((option) => ({ value: option, label: option })),
    ],
    [departmentOptions]
  );
  const designationFilterOptions = useMemo(
    () => [
      { value: "all", label: "All designations" },
      ...designationOptions.map((option) => ({ value: option, label: option })),
    ],
    [designationOptions]
  );
  const statusFilterOptions = useMemo(
    () => [
      { value: "all", label: "All statuses" },
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "full_admin", label: "Full Admin" },
      { value: "delegated", label: "Delegated Access" },
      { value: "no_delegation", label: "No Delegation" },
    ],
    []
  );
  const accessTypeFilterOptions = useMemo(
    () => [
      { value: "all", label: "All access types" },
      { value: "admins_only", label: "Full admins only" },
      { value: "delegated_only", label: "Delegated users only" },
      { value: "eligible_only", label: "Eligible non-admin users" },
      { value: "without_access", label: "Without delegated access" },
    ],
    []
  );
  const menuFilterOptions = useMemo(
    () => [
      { value: "all", label: "All menus" },
      ...options.map((option) => ({
        value: option.key,
        label: option.label,
        description: option.description || "",
      })),
    ],
    [options]
  );
  const emailDomainFilterOptions = useMemo(
    () => [
      { value: "all", label: "All domains" },
      ...emailDomainOptions.map((option) => ({ value: option, label: option })),
    ],
    [emailDomainOptions]
  );
  const employeeIdFilterOptions = useMemo(
    () => [
      { value: "all", label: "Any employee ID state" },
      { value: "present", label: "Has employee ID" },
      { value: "missing", label: "Missing employee ID" },
    ],
    []
  );
  const reportingLeadFilterOptions = useMemo(
    () => [
      { value: "all", label: "All reporting leads" },
      ...reportingLeadOptions.map((option) => ({ value: option, label: option })),
    ],
    [reportingLeadOptions]
  );
  const sortByOptions = useMemo(
    () => [
      { value: "name_asc", label: "Name A-Z" },
      { value: "name_desc", label: "Name Z-A" },
      { value: "department", label: "Department" },
      { value: "role", label: "Role" },
      { value: "designation", label: "Designation" },
      { value: "menu_count_desc", label: "Most grants first" },
      { value: "menu_count_asc", label: "Least grants first" },
      { value: "recent_status", label: "Active users first" },
    ],
    []
  );

  const activeFilterCount = useMemo(
    () => [
      search.trim(),
      roleFilter !== "all",
      departmentFilter !== "all",
      designationFilter !== "all",
      statusFilter !== "all",
      accessTypeFilter !== "all",
      menuFilter !== "all",
      emailDomainFilter !== "all",
      employeeIdFilter !== "all",
      reportingLeadFilter !== "all",
      sortBy !== "name_asc",
    ].filter(Boolean).length,
    [
      accessTypeFilter,
      departmentFilter,
      designationFilter,
      emailDomainFilter,
      employeeIdFilter,
      menuFilter,
      reportingLeadFilter,
      roleFilter,
      search,
      sortBy,
      statusFilter,
    ]
  );

  const resetFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setDepartmentFilter("all");
    setDesignationFilter("all");
    setStatusFilter("all");
    setAccessTypeFilter("all");
    setMenuFilter("all");
    setEmailDomainFilter("all");
    setEmployeeIdFilter("all");
    setReportingLeadFilter("all");
    setSortBy("name_asc");
  };

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

  const updateBlockSetting = (key, value) => {
    const numericValue = Number(value);
    setBlockSettings((current) => ({
      ...current,
      [key]: numericValue,
    }));
  };

  const saveBlockSettings = async () => {
    try {
      setSavingBlockSettings(true);
      setMessage("");
      const response = await axios.put(
        `${API_BASE}/api/timesheets/block-settings`,
        blockSettings,
        { headers: requesterHeaders }
      );
      setBlockSettings({
        first_fortnight_block_day: Number(response.data?.first_fortnight_block_day || 14),
        second_fortnight_block_day: Number(response.data?.second_fortnight_block_day || 28),
      });
      setMessage("Updated timesheet block dates for all employees");
    } catch (error) {
      console.error("Failed to update timesheet block dates", error);
      setMessage(error.response?.data?.error || "Failed to update timesheet block dates");
    } finally {
      setSavingBlockSettings(false);
      window.setTimeout(() => setMessage(""), 3000);
    }
  };

  if (loading) {
    return (
      <section className="access-management-workspace">
        <div className="fiori-loading-card">
          <Filter size={28} />
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

      <section className="fiori-panel employee-filter-panel access-management-filter-panel">
        <div className="fiori-panel-header employee-filter-panel-header">
          <div>
            <h3>Access Assignment</h3>
            <p>Filter people deeply, then enable only the admin workspaces they should see and use.</p>
          </div>
          <div className="employee-filter-actions">
            <button
              type="button"
              className="fiori-button secondary"
              onClick={() => setShowFilters((current) => !current)}
            >
              <Filter size={16} />
              <span>{showFilters ? "Hide Filters" : "Show Filters"}</span>
              {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button type="button" className="fiori-button secondary" onClick={loadWorkspace}>
              <RefreshCw size={16} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {showFilters ? (
          <div className="employee-directory-filters employee-directory-filters-extended">
            <label className="employee-filter-field employee-filter-search">
              <span>Search people</span>
              <ValueHelpSearch
                value={search}
                onChange={setSearch}
                suggestions={searchSuggestions}
                placeholder="Search by name, email, employee ID, role, department, designation, or reporting lead"
                className="access-management-search-help"
              />
            </label>

            <label className="employee-filter-field">
              <span>Role</span>
              <ValueHelpSelect
                value={roleFilter}
                onChange={setRoleFilter}
                options={roleFilterOptions}
                placeholder="All roles"
                searchPlaceholder="Search roles"
              />
            </label>

            <label className="employee-filter-field">
              <span>Department</span>
              <ValueHelpSelect
                value={departmentFilter}
                onChange={setDepartmentFilter}
                options={departmentFilterOptions}
                placeholder="All departments"
                searchPlaceholder="Search departments"
              />
            </label>

            <label className="employee-filter-field">
              <span>Designation</span>
              <ValueHelpSelect
                value={designationFilter}
                onChange={setDesignationFilter}
                options={designationFilterOptions}
                placeholder="All designations"
                searchPlaceholder="Search designations"
              />
            </label>

            <label className="employee-filter-field">
              <span>Status</span>
              <ValueHelpSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusFilterOptions}
                placeholder="All statuses"
                searchPlaceholder="Search statuses"
              />
            </label>

            <label className="employee-filter-field">
              <span>Access type</span>
              <ValueHelpSelect
                value={accessTypeFilter}
                onChange={setAccessTypeFilter}
                options={accessTypeFilterOptions}
                placeholder="All access types"
                searchPlaceholder="Search access types"
              />
            </label>

            <label className="employee-filter-field">
              <span>Granted menu</span>
              <ValueHelpSelect
                value={menuFilter}
                onChange={setMenuFilter}
                options={menuFilterOptions}
                placeholder="All menus"
                searchPlaceholder="Search granted menus"
              />
            </label>

            <label className="employee-filter-field">
              <span>Email domain</span>
              <ValueHelpSelect
                value={emailDomainFilter}
                onChange={setEmailDomainFilter}
                options={emailDomainFilterOptions}
                placeholder="All domains"
                searchPlaceholder="Search email domains"
              />
            </label>

            <label className="employee-filter-field">
              <span>Employee ID</span>
              <ValueHelpSelect
                value={employeeIdFilter}
                onChange={setEmployeeIdFilter}
                options={employeeIdFilterOptions}
                placeholder="Any employee ID state"
                searchPlaceholder="Search employee ID states"
              />
            </label>

            <label className="employee-filter-field">
              <span>Reporting lead</span>
              <ValueHelpSelect
                value={reportingLeadFilter}
                onChange={setReportingLeadFilter}
                options={reportingLeadFilterOptions}
                placeholder="All reporting leads"
                searchPlaceholder="Search reporting leads"
              />
            </label>

            <label className="employee-filter-field">
              <span>Sort by</span>
              <ValueHelpSelect
                value={sortBy}
                onChange={setSortBy}
                options={sortByOptions}
                placeholder="Sort users"
                searchPlaceholder="Search sort options"
              />
            </label>

            <div className="employee-filter-actions">
              <button type="button" className="fiori-button secondary" onClick={resetFilters}>
                Reset Filters
              </button>
              <div className="employee-directory-filter-meta">
                <strong>{activeFilterCount}</strong>
                <span>active filter{activeFilterCount === 1 ? "" : "s"}</span>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="fiori-panel access-management-block-panel">
        <div className="fiori-panel-header">
          <div>
            <h3>Timesheet Block Dates</h3>
            <p>Set the global cutoff day for both fortnights. These dates apply to every employee timesheet period.</p>
          </div>
          <div className="access-management-matrix-meta">
            <CalendarRange size={18} />
            <span>Global rule</span>
          </div>
        </div>

        <div className="access-management-block-grid">
          <label className="access-management-block-field">
            <span>First Fortnight</span>
            <strong>Block day</strong>
            <select
              className="input"
              value={blockSettings.first_fortnight_block_day}
              onChange={(event) => updateBlockSetting("first_fortnight_block_day", event.target.value)}
            >
              {Array.from({ length: 15 }, (_, index) => index + 1).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>

          <label className="access-management-block-field">
            <span>Second Fortnight</span>
            <strong>Block day</strong>
            <select
              className="input"
              value={blockSettings.second_fortnight_block_day}
              onChange={(event) => updateBlockSetting("second_fortnight_block_day", event.target.value)}
            >
              {Array.from({ length: 16 }, (_, index) => index + 16).map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>

          <div className="access-management-block-chip">
            <strong>{blockSettings.first_fortnight_block_day}</strong>
            <span>blocks 1-15 periods</span>
          </div>

          <div className="access-management-block-chip">
            <strong>{blockSettings.second_fortnight_block_day}</strong>
            <span>blocks 16-end periods</span>
          </div>

          <div className="access-management-block-actions">
            <button
              type="button"
              className="fiori-button primary"
              onClick={saveBlockSettings}
              disabled={savingBlockSettings}
            >
              <Save size={16} />
              <span>{savingBlockSettings ? "Saving" : "Save Block Dates"}</span>
            </button>
          </div>
        </div>
      </section>

      <section className="fiori-panel access-management-matrix-panel">
        <div className="fiori-panel-header">
          <div>
            <h3>Delegated Access Matrix</h3>
            <p>{filteredUsers.length} visible user{filteredUsers.length === 1 ? "" : "s"} in the current view.</p>
          </div>
          <div className="access-management-matrix-meta">
            <span>{options.length} admin menu{options.length === 1 ? "" : "s"}</span>
          </div>
        </div>

        <div className="fiori-table-shell access-management-table-shell">
          <table className="fiori-table access-management-table">
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
                  <tr
                    key={item._id}
                    className={item.hasFullAdminAccess ? "is-full-admin-row" : ""}
                  >
                    <td className="access-management-person-cell">
                      <div className="fiori-primary-cell access-management-primary-cell">
                        <strong>{item.name || "Unnamed user"}</strong>
                        <span>{item.email || "No email"}</span>
                        <span>{item.employeeId || item._id}</span>
                      </div>
                    </td>
                    <td className="access-management-role-cell">
                      <div className="fiori-primary-cell access-management-primary-cell">
                        <strong>{item.role || "Employee"}</strong>
                        <span>{item.designation || "No designation"}</span>
                        <span>{item.department || "No department"}</span>
                      </div>
                    </td>
                    <td className="access-management-status-cell">
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
                        <td key={option.key} className="access-management-permission-cell">
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
                  <td colSpan={3 + options.length} className="access-management-empty-state">
                    No users match the current search.
                  </td>
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
