import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ClipboardList,
  Download,
  FileSearch,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import ValueHelpSearch from "./ValueHelpSearch";
import ValueHelpSelect from "./ValueHelpSelect";
import { buildRequesterHeaders } from "../utils/requester";

const DEFAULT_FILTERS = {
  search: "",
  requestId: "",
  employeeName: "",
  employeeEmail: "",
  employeeId: "",
  department: "all",
  designation: "all",
  action: "all",
  performedBy: "all",
  leaveType: "all",
  status: "all",
  changedField: "all",
  remarks: "all",
  diffMode: "all",
  dateFrom: "",
  dateTo: "",
};

const buildSuggestions = (items, fields) => {
  const seen = new Set();
  return items.flatMap((item) =>
    fields
      .map((field) => item[field])
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter((value) => {
        const key = value.toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((value) => ({ value, label: value }))
  );
};

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatValue = (key, value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (key.includes("date") || key.includes("_on")) {
    if (typeof value === "object" && value.$date) {
      return formatDateTime(value.$date);
    }

    if (typeof value === "string" || value instanceof Date) {
      const candidate = new Date(value);
      if (!Number.isNaN(candidate.getTime())) {
        return formatDateTime(candidate);
      }
    }
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
};

const formatKey = (key) =>
  key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());

const summarizeData = (data) => {
  if (!data || typeof data !== "object") return "—";

  const pairs = Object.entries(data)
    .map(([key, value]) => {
      const formatted = formatValue(key, value);
      return formatted === null ? null : `${formatKey(key)}: ${formatted}`;
    })
    .filter(Boolean);

  return pairs.length ? pairs.join(" | ") : "—";
};

const getChangedFields = (log) => {
  const oldData = log.old_data || {};
  const newData = log.new_data || {};
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);

  return Array.from(keys).filter((key) => {
    const before = formatValue(key, oldData[key]);
    const after = formatValue(key, newData[key]);
    return before !== after;
  });
};

const downloadCsv = (filename, headers, rows) => {
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export default function AdminLogs({ user }) {
  const [logs, setLogs] = useState([]);
  const [expandedRows, setExpandedRows] = useState({});
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/logs/all`, {
        headers: buildRequesterHeaders(user),
      });
      setLogs(Array.isArray(response.data) ? response.data : []);
    } catch (fetchError) {
      console.error(fetchError);
      setError("Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const normalizedLogs = useMemo(() => {
    return logs.map((log, index) => {
      const changedFields = getChangedFields(log);
      const leaveType = log.new_data?.leave_type || log.old_data?.leave_type || "";
      const status = log.new_data?.status || log.old_data?.status || "";
      const timestamp = log.timestamp || "";

      return {
        ...log,
        rowKey: log._id || `${log.leave_id || "leave"}-${timestamp}-${index}`,
        changedFields,
        leaveType,
        status,
        timestampValue: timestamp ? new Date(timestamp).getTime() : 0,
        timestampLabel: formatDateTime(timestamp),
        startDate: log.new_data?.start_date || log.old_data?.start_date || "",
        endDate: log.new_data?.end_date || log.old_data?.end_date || "",
        days: log.new_data?.days ?? log.old_data?.days ?? "",
        remarksText: log.remarks || "",
        oldSummary: summarizeData(log.old_data),
        newSummary: summarizeData(log.new_data),
      };
    });
  }, [logs]);

  const optionBuilder = useCallback(
    (items) => [
      { value: "all", label: "All" },
      ...items.map((item) => ({ value: item, label: item })),
    ],
    []
  );

  const searchSuggestions = useMemo(
    () =>
      buildSuggestions(normalizedLogs, [
        "employee_name",
        "employee_email",
        "employeeId",
        "employee_department",
        "employee_designation",
        "action",
        "performed_by",
        "remarksText",
        "leaveType",
        "status",
        "leave_id",
      ]),
    [normalizedLogs]
  );

  const employeeNameSuggestions = useMemo(
    () => buildSuggestions(normalizedLogs, ["employee_name"]),
    [normalizedLogs]
  );

  const emailSuggestions = useMemo(
    () => buildSuggestions(normalizedLogs, ["employee_email"]),
    [normalizedLogs]
  );

  const employeeIdSuggestions = useMemo(
    () => buildSuggestions(normalizedLogs, ["employeeId"]),
    [normalizedLogs]
  );

  const requestIdSuggestions = useMemo(
    () => buildSuggestions(normalizedLogs, ["leave_id"]),
    [normalizedLogs]
  );

  const departmentOptions = useMemo(
    () => optionBuilder(Array.from(new Set(normalizedLogs.map((log) => log.employee_department).filter(Boolean))).sort()),
    [normalizedLogs, optionBuilder]
  );

  const designationOptions = useMemo(
    () => optionBuilder(Array.from(new Set(normalizedLogs.map((log) => log.employee_designation).filter(Boolean))).sort()),
    [normalizedLogs, optionBuilder]
  );

  const actionOptions = useMemo(
    () => optionBuilder(Array.from(new Set(normalizedLogs.map((log) => log.action).filter(Boolean))).sort()),
    [normalizedLogs, optionBuilder]
  );

  const actorOptions = useMemo(
    () => optionBuilder(Array.from(new Set(normalizedLogs.map((log) => log.performed_by).filter(Boolean))).sort()),
    [normalizedLogs, optionBuilder]
  );

  const leaveTypeOptions = useMemo(
    () => optionBuilder(Array.from(new Set(normalizedLogs.map((log) => log.leaveType).filter(Boolean))).sort()),
    [normalizedLogs, optionBuilder]
  );

  const statusOptions = useMemo(
    () => optionBuilder(Array.from(new Set(normalizedLogs.map((log) => log.status).filter(Boolean))).sort()),
    [normalizedLogs, optionBuilder]
  );

  const changedFieldOptions = useMemo(
    () =>
      optionBuilder(
        Array.from(new Set(normalizedLogs.flatMap((log) => log.changedFields).filter(Boolean))).sort()
      ),
    [normalizedLogs, optionBuilder]
  );

  const filteredLogs = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    const requestId = filters.requestId.trim().toLowerCase();
    const employeeName = filters.employeeName.trim().toLowerCase();
    const employeeEmail = filters.employeeEmail.trim().toLowerCase();
    const employeeId = filters.employeeId.trim().toLowerCase();
    const fromTime = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null;
    const toTime = filters.dateTo ? new Date(filters.dateTo).getTime() : null;

    return normalizedLogs.filter((log) => {
      if (search) {
        const haystack = [
          log.employee_name,
          log.employee_email,
          log.employeeId,
          log.employee_department,
          log.employee_designation,
          log.action,
          log.performed_by,
          log.leaveType,
          log.status,
          log.remarksText,
          log.leave_id,
          log.changedFields.join(" "),
          log.oldSummary,
          log.newSummary,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(search)) return false;
      }

      if (requestId && !String(log.leave_id || "").toLowerCase().includes(requestId)) return false;
      if (employeeName && !String(log.employee_name || "").toLowerCase().includes(employeeName)) return false;
      if (employeeEmail && !String(log.employee_email || "").toLowerCase().includes(employeeEmail)) return false;
      if (employeeId && !String(log.employeeId || "").toLowerCase().includes(employeeId)) return false;
      if (filters.department !== "all" && log.employee_department !== filters.department) return false;
      if (filters.designation !== "all" && log.employee_designation !== filters.designation) return false;
      if (filters.action !== "all" && log.action !== filters.action) return false;
      if (filters.performedBy !== "all" && log.performed_by !== filters.performedBy) return false;
      if (filters.leaveType !== "all" && log.leaveType !== filters.leaveType) return false;
      if (filters.status !== "all" && log.status !== filters.status) return false;
      if (filters.changedField !== "all" && !log.changedFields.includes(filters.changedField)) return false;

      if (filters.remarks === "with-remarks" && !log.remarksText) return false;
      if (filters.remarks === "without-remarks" && log.remarksText) return false;

      if (filters.diffMode === "before-after" && !(log.old_data && log.new_data)) return false;
      if (filters.diffMode === "before-only" && !(log.old_data && !log.new_data)) return false;
      if (filters.diffMode === "after-only" && !(!log.old_data && log.new_data)) return false;
      if (filters.diffMode === "no-diff" && (log.old_data || log.new_data)) return false;

      if (fromTime !== null && (!log.timestampValue || log.timestampValue < fromTime)) return false;
      if (toTime !== null && (!log.timestampValue || log.timestampValue > toTime)) return false;

      return true;
    });
  }, [filters, normalizedLogs]);

  const stats = useMemo(() => {
    const uniqueRequests = new Set(filteredLogs.map((log) => log.leave_id).filter(Boolean)).size;
    const uniqueActors = new Set(filteredLogs.map((log) => log.performed_by).filter(Boolean)).size;

    return {
      totalEvents: filteredLogs.length,
      trackedRequests: uniqueRequests,
      uniqueActors,
    };
  }, [filteredLogs]);
  const handleFilterChange = (field, value) => {
    setFilters((previous) => ({ ...previous, [field]: value }));
  };

  const toggleExpand = (rowKey) => {
    setExpandedRows((previous) => ({ ...previous, [rowKey]: !previous[rowKey] }));
  };

  const exportLogs = () => {
    downloadCsv(
      `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "Timestamp",
        "Action",
        "Employee Name",
        "Employee Email",
        "Employee ID",
        "Department",
        "Designation",
        "Performed By",
        "Leave Type",
        "Status",
        "Start Date",
        "End Date",
        "Days",
        "Request ID",
        "Remarks",
        "Changed Fields",
        "Before",
        "After",
      ],
      filteredLogs.map((log) => [
        log.timestampLabel,
        log.action || "",
        log.employee_name || "",
        log.employee_email || "",
        log.employeeId || "",
        log.employee_department || "",
        log.employee_designation || "",
        log.performed_by || "",
        log.leaveType || "",
        log.status || "",
        log.startDate || "",
        log.endDate || "",
        log.days || "",
        log.leave_id || "",
        log.remarksText || "",
        log.changedFields.map(formatKey).join(" | "),
        log.oldSummary,
        log.newSummary,
      ])
    );
  };

  return (
    <section className="audit-workspace">
      <header className="admin-hero">
        <div className="admin-hero-copy">
          <div className="admin-section-overline">Audit Trail</div>
          <h1>Audit Logs</h1>
          <p>
            Trace actions, review history, and export audit evidence when needed.
          </p>
        </div>

        <div className="admin-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Primary View</span>
            <strong>Full audit table</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Best For</span>
            <strong>Trace and export</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Focus</span>
            <strong>Readable history</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Outcome</span>
            <strong>Confident review</strong>
          </div>
        </div>
      </header>

      <section className="audit-summary-grid">
        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Log Events</span>
            <History size={18} />
          </div>
          <div className="fiori-stat-value">{stats.totalEvents}</div>
          <div className="fiori-stat-note">Rows currently visible after all active filters</div>
        </article>

        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Requests Covered</span>
            <ClipboardList size={18} />
          </div>
          <div className="fiori-stat-value">{stats.trackedRequests}</div>
          <div className="fiori-stat-note">Unique leave request records in the active result set</div>
        </article>

        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Traceability</span>
            <ShieldCheck size={18} />
          </div>
          <div className="fiori-stat-value audit-stat-text">Enterprise</div>
          <div className="fiori-stat-note">Actor, status, data diffs, time, and export-ready logs</div>
        </article>
      </section>

      {loading ? (
        <div className="fiori-loading-card">
          <History size={28} />
          <div>
            <strong>Loading audit logs</strong>
            <p>Collecting recorded leave events and change history.</p>
          </div>
        </div>
      ) : error ? (
        <div className="admin-empty-state">
          <ClipboardList size={28} />
          <div>
            <strong>{error}</strong>
            <p>Try refreshing the page after the audit service is available again.</p>
          </div>
        </div>
      ) : normalizedLogs.length === 0 ? (
        <div className="admin-empty-state">
          <ClipboardList size={28} />
          <div>
            <strong>No audit logs yet</strong>
            <p>Leave workflow changes will appear here once activity is recorded.</p>
          </div>
        </div>
      ) : (
        <>
          <section className="fiori-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Audit Filters</h3>
                <p>Use as many filters as needed to narrow down a precise set of change events.</p>
              </div>
              <div className="audit-toolbar">
                <button className="fiori-button secondary" onClick={fetchLogs}>
                  <RefreshCw size={16} />
                  <span>Refresh</span>
                </button>
                <button className="fiori-button secondary" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>
                  <FileSearch size={16} />
                  <span>Reset filters</span>
                </button>
                <button className="fiori-button primary" onClick={exportLogs} disabled={!filteredLogs.length}>
                  <Download size={16} />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            <div className="employee-directory-filters employee-directory-filters-extended audit-filter-grid">
              <label className="employee-filter-field employee-filter-search">
                <span>Global Search</span>
                <ValueHelpSearch
                  value={filters.search}
                  onChange={(value) => handleFilterChange("search", value)}
                  suggestions={searchSuggestions}
                  placeholder="Search employee, actor, remarks, request, status, action, changed data"
                />
              </label>

              <label className="employee-filter-field">
                <span>Request ID</span>
                <ValueHelpSearch
                  value={filters.requestId}
                  onChange={(value) => handleFilterChange("requestId", value)}
                  suggestions={requestIdSuggestions}
                  placeholder="Filter by leave request ID"
                />
              </label>

              <label className="employee-filter-field">
                <span>Employee Name</span>
                <ValueHelpSearch
                  value={filters.employeeName}
                  onChange={(value) => handleFilterChange("employeeName", value)}
                  suggestions={employeeNameSuggestions}
                  placeholder="Filter by employee name"
                />
              </label>

              <label className="employee-filter-field">
                <span>Employee Email</span>
                <ValueHelpSearch
                  value={filters.employeeEmail}
                  onChange={(value) => handleFilterChange("employeeEmail", value)}
                  suggestions={emailSuggestions}
                  placeholder="Filter by email"
                />
              </label>

              <label className="employee-filter-field">
                <span>Employee ID</span>
                <ValueHelpSearch
                  value={filters.employeeId}
                  onChange={(value) => handleFilterChange("employeeId", value)}
                  suggestions={employeeIdSuggestions}
                  placeholder="Filter by employee ID"
                />
              </label>

              <label className="employee-filter-field">
                <span>Department</span>
                <ValueHelpSelect
                  value={filters.department}
                  onChange={(value) => handleFilterChange("department", value)}
                  options={departmentOptions}
                  placeholder="All departments"
                  searchPlaceholder="Search departments"
                />
              </label>

              <label className="employee-filter-field">
                <span>Designation</span>
                <ValueHelpSelect
                  value={filters.designation}
                  onChange={(value) => handleFilterChange("designation", value)}
                  options={designationOptions}
                  placeholder="All designations"
                  searchPlaceholder="Search designations"
                />
              </label>

              <label className="employee-filter-field">
                <span>Action</span>
                <ValueHelpSelect
                  value={filters.action}
                  onChange={(value) => handleFilterChange("action", value)}
                  options={actionOptions}
                  placeholder="All actions"
                  searchPlaceholder="Search actions"
                />
              </label>

              <label className="employee-filter-field">
                <span>Performed By</span>
                <ValueHelpSelect
                  value={filters.performedBy}
                  onChange={(value) => handleFilterChange("performedBy", value)}
                  options={actorOptions}
                  placeholder="All actors"
                  searchPlaceholder="Search actors"
                />
              </label>

              <label className="employee-filter-field">
                <span>Leave Type</span>
                <ValueHelpSelect
                  value={filters.leaveType}
                  onChange={(value) => handleFilterChange("leaveType", value)}
                  options={leaveTypeOptions}
                  placeholder="All leave types"
                  searchPlaceholder="Search leave types"
                />
              </label>

              <label className="employee-filter-field">
                <span>Status</span>
                <ValueHelpSelect
                  value={filters.status}
                  onChange={(value) => handleFilterChange("status", value)}
                  options={statusOptions}
                  placeholder="All statuses"
                  searchPlaceholder="Search statuses"
                />
              </label>

              <label className="employee-filter-field">
                <span>Changed Field</span>
                <ValueHelpSelect
                  value={filters.changedField}
                  onChange={(value) => handleFilterChange("changedField", value)}
                  options={changedFieldOptions}
                  placeholder="All changed fields"
                  searchPlaceholder="Search changed fields"
                />
              </label>

              <label className="employee-filter-field">
                <span>Remarks</span>
                <ValueHelpSelect
                  value={filters.remarks}
                  onChange={(value) => handleFilterChange("remarks", value)}
                  options={[
                    { value: "all", label: "All remarks states" },
                    { value: "with-remarks", label: "With remarks" },
                    { value: "without-remarks", label: "Without remarks" },
                  ]}
                  placeholder="All remarks states"
                  searchPlaceholder="Search remarks filter"
                />
              </label>

              <label className="employee-filter-field">
                <span>Diff Mode</span>
                <ValueHelpSelect
                  value={filters.diffMode}
                  onChange={(value) => handleFilterChange("diffMode", value)}
                  options={[
                    { value: "all", label: "All diff types" },
                    { value: "before-after", label: "Before and after" },
                    { value: "before-only", label: "Before only" },
                    { value: "after-only", label: "After only" },
                    { value: "no-diff", label: "No diff payload" },
                  ]}
                  placeholder="All diff types"
                  searchPlaceholder="Search diff types"
                />
              </label>

              <label className="employee-filter-field">
                <span>Logged From</span>
                <input
                  className="input"
                  type="datetime-local"
                  value={filters.dateFrom}
                  onChange={(event) => handleFilterChange("dateFrom", event.target.value)}
                />
              </label>

              <label className="employee-filter-field">
                <span>Logged To</span>
                <input
                  className="input"
                  type="datetime-local"
                  value={filters.dateTo}
                  onChange={(event) => handleFilterChange("dateTo", event.target.value)}
                />
              </label>
            </div>
          </section>

          {filteredLogs.length === 0 ? (
            <div className="admin-empty-state">
              <Search size={24} />
              <div>
                <strong>No audit logs match the current filters</strong>
                <p>Reset or widen the filters to bring more events back into the result table.</p>
              </div>
            </div>
          ) : (
            <section className="fiori-panel">
              <div className="fiori-panel-header">
                <div>
                  <h3>Audit Log Table</h3>
                  <p>Scrollable horizontally and vertically for dense audit review without leaving the page.</p>
                </div>
                <span className="fiori-status-pill is-neutral">{filteredLogs.length} rows</span>
              </div>

              <div className="fiori-table-shell audit-table-shell">
                <table className="fiori-table audit-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Action</th>
                      <th>Employee</th>
                      <th>Employee ID</th>
                      <th>Department</th>
                      <th>Designation</th>
                      <th>Performed By</th>
                      <th>Leave Type</th>
                      <th>Status</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Days</th>
                      <th>Request ID</th>
                      <th>Changed Fields</th>
                      <th>Remarks</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((log) => {
                      const isExpanded = Boolean(expandedRows[log.rowKey]);

                      return (
                        <React.Fragment key={log.rowKey}>
                          <tr>
                            <td>{log.timestampLabel}</td>
                            <td>{log.action || "—"}</td>
                            <td>
                              <div className="fiori-primary-cell">
                                <strong>{log.employee_name || "Unknown employee"}</strong>
                                <span>{log.employee_email || "No email available"}</span>
                              </div>
                            </td>
                            <td>{log.employeeId || "—"}</td>
                            <td>{log.employee_department || "—"}</td>
                            <td>{log.employee_designation || "—"}</td>
                            <td>{log.performed_by || "Unknown actor"}</td>
                            <td>{log.leaveType || "—"}</td>
                            <td>{log.status || "—"}</td>
                            <td>{log.startDate || "—"}</td>
                            <td>{log.endDate || "—"}</td>
                            <td>{log.days || "—"}</td>
                            <td className="audit-table-request-id">{log.leave_id || "—"}</td>
                            <td>
                              {log.changedFields.length ? (
                                <div className="audit-chip-list">
                                  {log.changedFields.map((field) => (
                                    <span key={`${log.rowKey}-${field}`} className="audit-chip">
                                      {formatKey(field)}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="audit-table-remarks">{log.remarksText || "—"}</td>
                            <td>
                              <button
                                className="fiori-button secondary"
                                type="button"
                                onClick={() => toggleExpand(log.rowKey)}
                              >
                                <UserRound size={16} />
                                <span>{isExpanded ? "Hide" : "View"}</span>
                              </button>
                            </td>
                          </tr>

                          {isExpanded ? (
                            <tr className="audit-detail-row">
                              <td colSpan={16}>
                                <div className="audit-detail-panel">
                                  <div className="audit-log-meta">
                                    <span>Logged: {log.timestampLabel}</span>
                                    <span>Actor: {log.performed_by || "Unknown actor"}</span>
                                    <span>Request: {log.leave_id || "N/A"}</span>
                                  </div>

                                  {log.remarksText ? (
                                    <div className="audit-log-remarks">{log.remarksText}</div>
                                  ) : null}

                                  {(log.old_data || log.new_data) ? (
                                    <div className={`audit-log-diff-grid ${log.old_data && log.new_data ? "" : "is-single"}`}>
                                      {log.old_data ? (
                                        <div className="audit-log-diff-card is-before">
                                          <strong>Before</strong>
                                          {Object.entries(log.old_data)
                                            .map(([key, value]) => {
                                              const formatted = formatValue(key, value);
                                              if (formatted === null) return null;

                                              return (
                                                <div key={`${log.rowKey}-old-${key}`} className="audit-log-diff-row">
                                                  <span>{formatKey(key)}</span>
                                                  <b>{formatted}</b>
                                                </div>
                                              );
                                            })
                                            .filter(Boolean)}
                                        </div>
                                      ) : null}

                                      {log.new_data ? (
                                        <div className="audit-log-diff-card is-after">
                                          <strong>After</strong>
                                          {Object.entries(log.new_data)
                                            .map(([key, value]) => {
                                              const formatted = formatValue(key, value);
                                              if (formatted === null) return null;

                                              return (
                                                <div key={`${log.rowKey}-new-${key}`} className="audit-log-diff-row">
                                                  <span>{formatKey(key)}</span>
                                                  <b>{formatted}</b>
                                                </div>
                                              );
                                            })
                                            .filter(Boolean)}
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <div className="audit-detail-empty">No before/after payload recorded for this event.</div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}
