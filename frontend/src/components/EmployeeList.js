import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Building2,
  Download,
  Filter,
  Mail,
  RotateCcw,
  UserCheck,
  UserRound,
  Users,
} from "lucide-react";
import LeaveStatusDot from "./LeaveStatusDot";
import ValueHelpSelect from "./ValueHelpSelect";
import ValueHelpSearch from "./ValueHelpSearch";
import { buildRequesterHeaders } from "../utils/requester";

const initialFilters = {
  search: "",
  department: "All",
  status: "All",
  project: "All",
  joiningFrom: "",
  joiningTo: "",
  periodStart: "",
  periodEnd: "",
  leaveLastMonth: "All",
  sortBy: "name",
  sortOrder: "asc",
};

const buildSearchSuggestions = (employees) => {
  const seen = new Set();
  return employees.flatMap((employee) =>
    [
      employee.name,
      employee.email,
      employee.department,
      employee.manager_name,
      employee.project,
      employee.designation,
    ]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter((value) => {
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((value) => ({ value, label: value }))
  );
};

const formatDate = (value) => {
  if (!value) return "Not available";

  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Not available";

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Not available";
  }
};

const formatLeaveWindow = (window) => {
  if (!window?.start || !window?.end) return "last month";
  return `${formatDate(window.start)} to ${formatDate(window.end)}`;
};

const formatProjectNames = (projectNames = []) => {
  if (!projectNames.length) return "No project assigned";
  return projectNames.join(", ");
};

const EmployeeList = ({ user, onNavigateToProfile, isAdmin = false }) => {
  const [employees, setEmployees] = useState([]);
  const [directoryMeta, setDirectoryMeta] = useState({
    scope_records: 0,
    filtered_records: 0,
    active_filtered_records: 0,
    available_filters: { departments: [], projects: [] },
    last_month_window: null,
  });
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const deferredSearch = useDeferredValue(filters.search);
  const canViewDirectory = isAdmin || user?.role === "Manager";
  const requesterHeaders = useMemo(() => buildRequesterHeaders(user), [user]);

  const fetchEmployees = useCallback(async () => {
    if (!canViewDirectory) {
      setEmployees([]);
      setDirectoryMeta({
        scope_records: 0,
        filtered_records: 0,
        active_filtered_records: 0,
        available_filters: { departments: [], projects: [] },
        last_month_window: null,
      });
      setLoading(false);
      setMessage(user?.role === "Employee" ? "Employees cannot view other team members" : "");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const params = {
        scope: isAdmin ? "all" : "manager",
        search: deferredSearch || undefined,
        department: filters.department !== "All" ? filters.department : undefined,
        status: filters.status !== "All" ? filters.status.toLowerCase() : undefined,
        project: filters.project !== "All" ? filters.project : undefined,
        joined_from: filters.joiningFrom || undefined,
        joined_to: filters.joiningTo || undefined,
        period_start: filters.periodStart || undefined,
        period_end: filters.periodEnd || undefined,
        leave_last_month:
          filters.leaveLastMonth === "All"
            ? undefined
            : filters.leaveLastMonth === "With Leave"
              ? "with_leave"
              : "without_leave",
        sort_by:
          filters.sortBy === "joiningDate"
            ? "joining_date"
            : filters.sortBy === "lastMonthLeave"
              ? "last_month_leave"
              : filters.sortBy,
        sort_order: filters.sortOrder,
      };

      if (!isAdmin && user?.email) {
        params.manager_email = user.email;
      }

      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/directory`,
        {
          params,
          headers: requesterHeaders,
        }
      );

      setEmployees(Array.isArray(response.data?.items) ? response.data.items : []);
      setDirectoryMeta(
        response.data?.meta || {
          scope_records: 0,
          filtered_records: 0,
          active_filtered_records: 0,
          available_filters: { departments: [], projects: [] },
          last_month_window: null,
        }
      );
    } catch (error) {
      console.error("Error fetching employees:", error);
      setEmployees([]);
      setDirectoryMeta({
        scope_records: 0,
        filtered_records: 0,
        active_filtered_records: 0,
        available_filters: { departments: [], projects: [] },
        last_month_window: null,
      });
      setMessage(error.response?.data?.error || "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }, [canViewDirectory, deferredSearch, filters, isAdmin, requesterHeaders, user?.email, user?.role]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const handleFilterChange = (field, value) => {
    setFilters((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleActiveToggle = async (employeeId, nextStatus) => {
    try {
      setActionLoadingId(employeeId);
      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/set_active/${employeeId}`,
        { is_active: nextStatus },
        { headers: requesterHeaders }
      );

      if (response.status === 200) {
        await fetchEmployees();
      }
    } catch (error) {
      console.error("Error updating active status:", error);
      setMessage(error.response?.data?.error || "Failed to update active status");
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setActionLoadingId(null);
    }
  };

  const downloadCSV = () => {
    const csvHeaders = [
      "Employee ID",
      "Name",
      "Email",
      "Designation",
      "Department",
      "Role",
      "Projects",
      "Date of Joining",
      "Reports To",
      "Leave Period Start",
      "Leave Period End",
      "Leave Period Days",
      "Leave Period Records",
      "Status",
    ];

    const csvRows = employees.map((employee) => [
      employee.employeeId || employee._id,
      employee.name || "",
      employee.email || "",
      employee.designation || "",
      employee.department || "",
      employee.role || "Employee",
      formatProjectNames(employee.projectNames),
      formatDate(employee.dateOfJoining),
      employee.reportsToEmail || "",
      employee.leaveSummary?.periodStart || "",
      employee.leaveSummary?.periodEnd || "",
      employee.leaveSummary?.days ?? 0,
      employee.leaveSummary?.records ?? 0,
      employee.is_active !== false ? "Active" : "Inactive",
    ]);

    const csvContent = [
      csvHeaders.join(","),
      ...csvRows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    link.setAttribute("href", url);
    link.setAttribute("download", `employees_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const stats = useMemo(
    () => ({
      total: directoryMeta.scope_records || 0,
      active: directoryMeta.active_filtered_records || 0,
      departments: directoryMeta.available_filters?.departments?.length || 0,
      filtered: directoryMeta.filtered_records || employees.length,
    }),
    [directoryMeta, employees.length]
  );

  const departments = useMemo(
    () => ["All", ...(directoryMeta.available_filters?.departments || [])],
    [directoryMeta.available_filters]
  );
  const projects = useMemo(
    () => ["All", ...(directoryMeta.available_filters?.projects || [])],
    [directoryMeta.available_filters]
  );
  const searchSuggestions = useMemo(() => buildSearchSuggestions(employees), [employees]);
  const activeFilterCount = useMemo(
    () =>
      Object.entries(filters).filter(([field, value]) => {
        const defaultValue = initialFilters[field];
        return String(value ?? "").trim() !== String(defaultValue ?? "").trim();
      }).length,
    [filters]
  );

  if (loading) {
    return (
      <section className="employee-directory">
        <div className="fiori-loading-card">
          <Users size={28} />
          <div>
            <strong>Loading employee directory</strong>
            <p>Preparing employee, project, and leave summary data.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="employee-directory">
      <header className="employee-directory-hero">
        <div>
          <div className="admin-section-overline">
            {isAdmin ? "Enterprise Directory" : "Team Directory"}
          </div>
          <h1>{isAdmin ? "Employee Directory" : "Team Members"}</h1>
        </div>

        <div className="employee-directory-hero-actions">
          <button className="fiori-button secondary" onClick={fetchEmployees}>
            <Filter size={16} />
            <span>Refresh view</span>
          </button>
          <button className="fiori-button secondary" onClick={downloadCSV} disabled={!employees.length}>
            <Download size={16} />
            <span>Export current view</span>
          </button>
        </div>
      </header>

      <div className="employee-directory-summary">
        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">{isAdmin ? "Visible Workforce" : "Visible Team"}</span>
            <Users size={18} />
          </div>
          <div className="fiori-stat-value">{stats.total}</div>
          <div className="fiori-stat-note">Employees in the current backend scope</div>
        </article>

        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Active In View</span>
            <UserCheck size={18} />
          </div>
          <div className="fiori-stat-value">{stats.active}</div>
          <div className="fiori-stat-note">Active records after applying current filters</div>
        </article>

        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Projects</span>
            <Building2 size={18} />
          </div>
          <div className="fiori-stat-value">{projects.length - 1}</div>
          <div className="fiori-stat-note">Project filter options available in this scope</div>
        </article>

        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Filtered Results</span>
            <Filter size={18} />
          </div>
          <div className="fiori-stat-value">{stats.filtered}</div>
          <div className="fiori-stat-note">
            Leave summary window: {formatLeaveWindow(directoryMeta.period_window || directoryMeta.last_month_window)}
          </div>
        </article>
      </div>

      <section className="fiori-panel employee-filter-panel">
        <div className="fiori-panel-header employee-filter-panel-header">
          <div>
            <h3>Filters</h3>
            <p>
              {activeFilterCount
                ? `${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}`
                : "Default view"}
            </p>
          </div>
          <div className="employee-filter-panel-actions">
            <button
              type="button"
              className="fiori-button secondary compact"
              onClick={() => setFilters(initialFilters)}
              disabled={!activeFilterCount}
            >
              <RotateCcw size={14} />
              Reset
            </button>
          </div>
        </div>

        <div className="employee-directory-filters employee-directory-filters-extended">
          <label className="employee-filter-field employee-filter-search">
            <span>Search</span>
            <ValueHelpSearch
              value={filters.search}
              onChange={(value) => handleFilterChange("search", value)}
              suggestions={searchSuggestions}
              placeholder="Search by employee, email, department, manager, or project"
            />
          </label>

          <label className="employee-filter-field">
            <span>Department</span>
            <ValueHelpSelect
              value={filters.department}
              onChange={(value) => handleFilterChange("department", value)}
              searchPlaceholder="Search departments"
              options={departments.map((department) => ({ value: department, label: department }))}
            />
          </label>

          <label className="employee-filter-field">
            <span>Status</span>
            <ValueHelpSelect
              value={filters.status}
              onChange={(value) => handleFilterChange("status", value)}
              searchPlaceholder="Search statuses"
              options={[
                { value: "All", label: "All" },
                { value: "Active", label: "Active" },
                { value: "Inactive", label: "Inactive" },
              ]}
            />
          </label>

          <label className="employee-filter-field">
            <span>Project</span>
            <ValueHelpSelect
              value={filters.project}
              onChange={(value) => handleFilterChange("project", value)}
              searchPlaceholder="Search projects"
              options={projects.map((project) => ({ value: project, label: project }))}
            />
          </label>

          <label className="employee-filter-field">
            <span>Joined From</span>
            <input
              className="input"
              type="date"
              value={filters.joiningFrom}
              onChange={(event) => handleFilterChange("joiningFrom", event.target.value)}
            />
          </label>

          <label className="employee-filter-field">
            <span>Joined To</span>
            <input
              className="input"
              type="date"
              value={filters.joiningTo}
              onChange={(event) => handleFilterChange("joiningTo", event.target.value)}
            />
          </label>

          <label className="employee-filter-field">
            <span>Leave Period Start</span>
            <input
              className="input"
              type="date"
              value={filters.periodStart}
              onChange={(event) => handleFilterChange("periodStart", event.target.value)}
            />
          </label>

          <label className="employee-filter-field">
            <span>Leave Period End</span>
            <input
              className="input"
              type="date"
              value={filters.periodEnd}
              onChange={(event) => handleFilterChange("periodEnd", event.target.value)}
            />
          </label>

          <label className="employee-filter-field">
            <span>Last Month Leave</span>
            <ValueHelpSelect
              value={filters.leaveLastMonth}
              onChange={(value) => handleFilterChange("leaveLastMonth", value)}
              searchPlaceholder="Search leave filters"
              options={[
                { value: "All", label: "All" },
                { value: "With Leave", label: "With Leave" },
                { value: "Without Leave", label: "Without Leave" },
              ]}
            />
          </label>

          <label className="employee-filter-field">
            <span>Sort By</span>
            <ValueHelpSelect
              value={filters.sortBy}
              onChange={(value) => handleFilterChange("sortBy", value)}
              searchPlaceholder="Search sort options"
              options={[
                { value: "name", label: "Name" },
                { value: "department", label: "Department" },
                { value: "joiningDate", label: "Joining date" },
                { value: "lastMonthLeave", label: "Last month leave" },
                { value: "status", label: "Status" },
              ]}
            />
          </label>

          <label className="employee-filter-field">
            <span>Sort Order</span>
            <ValueHelpSelect
              value={filters.sortOrder}
              onChange={(value) => handleFilterChange("sortOrder", value)}
              searchPlaceholder="Search order"
              options={[
                { value: "asc", label: "Ascending" },
                { value: "desc", label: "Descending" },
              ]}
            />
          </label>
        </div>
      </section>

      {employees.length === 0 ? (
        <div className="admin-empty-state">
          <UserRound size={28} />
          <div>
            <strong>
              {canViewDirectory ? "No employees match the current filters" : "No employees available"}
            </strong>
            <p>Adjust the filters or refresh the workspace to review more records.</p>
          </div>
        </div>
      ) : (
        <section className="fiori-panel">
          <div className="fiori-panel-header">
            <div>
              <h3>Employee Table</h3>
              <p>
                Showing {directoryMeta.filtered_records} of {directoryMeta.scope_records} employees
              </p>
            </div>
          </div>

          <div className="fiori-table-shell">
            <table className="fiori-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Role</th>
                  <th>Projects</th>
                  <th>Joined On</th>
                  <th>Leave In Period</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((employee) => {
                  const isActive = employee.is_active !== false;

                  return (
                    <tr key={employee._id}>
                      <td>
                        <div className="employee-directory-table-primary">
                          <div className="employee-card-avatar-wrap">
                            {employee.photoUrl ? (
                              <img
                                src={employee.photoUrl}
                                alt={employee.name || "Employee"}
                                className="employee-card-avatar"
                              />
                            ) : (
                              <div className="employee-card-avatar employee-card-avatar-fallback">
                                {employee.name?.charAt(0) || "E"}
                              </div>
                            )}
                            <div className="employee-card-leave-status">
                              <LeaveStatusDot userId={employee._id} size={10} />
                            </div>
                          </div>

                          <div className="fiori-primary-cell">
                            <button
                              type="button"
                              className="employee-name-button"
                              onClick={() => onNavigateToProfile(employee._id)}
                              title="Open employee profile"
                            >
                              {employee.name || "Unnamed employee"}
                            </button>
                            <span>{employee.designation || "Designation not available"}</span>
                            <span>{employee.employeeId || employee._id}</span>
                            <span>
                              <Mail size={13} /> {employee.email || "No email available"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="fiori-primary-cell">
                          <strong>{employee.department || "Unassigned"}</strong>
                          <span>{employee.reportsToEmail || "No reporting manager"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="fiori-primary-cell">
                          <strong>{employee.role || "Employee"}</strong>
                          <span>{employee.employment_type || "Employee"}</span>
                          <span>{employee.shiftTimings || "Shift not set"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="fiori-primary-cell">
                          <strong>{employee.projectNames?.length || 0} project(s)</strong>
                          <span>{formatProjectNames(employee.projectNames)}</span>
                        </div>
                      </td>
                      <td>{formatDate(employee.dateOfJoining)}</td>
                      <td>
                        <div className="fiori-primary-cell">
                          <strong>{employee.leaveSummary?.days ?? 0} day(s)</strong>
                          <span>{employee.leaveSummary?.records ?? 0} record(s)</span>
                          <span>{employee.leaveSummary?.approvedDays ?? 0} approved day(s)</span>
                          <span>
                            {formatLeaveWindow({
                              start: employee.leaveSummary?.periodStart,
                              end: employee.leaveSummary?.periodEnd,
                            })}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="fiori-primary-cell">
                          <span className={`fiori-status-pill ${isActive ? "is-approved" : "is-rejected"}`}>
                            {isActive ? "Active" : "Inactive"}
                          </span>
                          <span>{employee.leaveSummary?.pendingRecords ?? 0} pending leave record(s)</span>
                        </div>
                      </td>
                      <td>
                        <div className="employee-table-actions">
                          <button
                            className="fiori-button secondary"
                            onClick={() => onNavigateToProfile(employee._id)}
                          >
                            Open profile
                          </button>
                          {isAdmin && (
                            <button
                              className={`fiori-button secondary ${isActive ? "danger" : ""}`}
                              disabled={actionLoadingId === employee._id}
                              onClick={() => handleActiveToggle(employee._id, !isActive)}
                            >
                              {actionLoadingId === employee._id
                                ? "Updating..."
                                : isActive
                                  ? "Mark inactive"
                                  : "Mark active"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {message && (
        <div className="admin-toast is-error" style={{ position: "static", maxWidth: "100%" }}>
          {message}
        </div>
      )}
    </section>
  );
};

export default EmployeeList;
