import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Building2,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GitBranch,
  ShieldCheck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import OrganizationHierarchy from "./OrganizationHierarchy";
import { buildRequesterHeaders } from "../utils/requester";

const statusToneMap = {
  Approved: "is-approved",
  Rejected: "is-rejected",
  Cancelled: "is-neutral",
  Pending: "is-pending",
};

const fioriChartPalette = ["#0a6ed1", "#5b738b", "#8fb5d9", "#d1e3f8", "#0f2742", "#91c8f6"];

const getTimeBasedGreeting = () => {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
};

const formatDate = (dateStr) => {
  if (!dateStr) return "Not available";

  try {
    const value = typeof dateStr === "object" && dateStr.$date ? dateStr.$date : dateStr;
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

const shortLabel = (value, max = 12) => {
  if (!value) return "Unassigned";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

const leaveCoverageForToday = (leave) => {
  if (leave.status !== "Approved") return false;

  const today = new Date().toISOString().split("T")[0];

  if (leave.is_partial_approval) {
    return leave.approved_start_date <= today && leave.approved_end_date >= today;
  }

  return leave.start_date <= today && leave.end_date >= today;
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="fiori-chart-tooltip">
      {label ? <div className="fiori-chart-tooltip-label">{label}</div> : null}
      {payload.map((entry) => (
        <div key={entry.name} className="fiori-chart-tooltip-row">
          <span>{entry.name}</span>
          <strong>{entry.value}</strong>
        </div>
      ))}
    </div>
  );
};

const OnLeaveEmployeesModal = ({ employees, onClose }) => {
  const groupedByType = employees.reduce((accumulator, employee) => {
    const type = employee.leave_type || "Other";
    accumulator[type] = accumulator[type] || [];
    accumulator[type].push(employee);
    return accumulator;
  }, {});

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal-wide" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <div className="admin-section-overline">Daily workforce status</div>
            <h2>Employees on approved leave today</h2>
            <p>
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <button className="fiori-button secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="admin-dashboard-grid admin-dashboard-grid-compact">
          {Object.entries(groupedByType).map(([type, members]) => (
            <article key={type} className="fiori-stat-card">
              <div className="fiori-stat-label">{type}</div>
              <div className="fiori-stat-value">{members.length}</div>
              <div className="fiori-stat-note">Approved leave records</div>
            </article>
          ))}
        </div>

        <div className="fiori-panel">
          <div className="fiori-panel-header">
            <div>
              <h3>Leave roster</h3>
              <p>Current day absences with role and leave details</p>
            </div>
          </div>

          {employees.length === 0 ? (
            <div className="admin-empty-state">
              <CheckCircle2 size={28} />
              <div>
                <strong>No employees are on leave today</strong>
                <p>The workforce is fully available for the current day.</p>
              </div>
            </div>
          ) : (
            <div className="fiori-table-shell">
              <table className="fiori-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Leave Type</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee._id}>
                      <td>
                        <div className="fiori-primary-cell">
                          <strong>{employee.employee_name || "Unknown employee"}</strong>
                          <span>{employee.employee_email || "No email"}</span>
                        </div>
                      </td>
                      <td>{employee.employee_department || "Unassigned"}</td>
                      <td>{employee.leave_type || "Not specified"}</td>
                      <td>{formatDate(employee.start_date)}</td>
                      <td>{formatDate(employee.end_date)}</td>
                      <td>{employee.days || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const AdminDashboard = ({ user, onNavigate }) => {
  const [stats, setStats] = useState({
    totalEmployees: 0,
    pendingLeaves: 0,
    onLeaveToday: 0,
    workingToday: 0,
  });
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [recentActions, setRecentActions] = useState([]);
  const [expandedLeave, setExpandedLeave] = useState(null);
  const [rejectModal, setRejectModal] = useState({ show: false, leaveId: null, reason: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showHierarchy, setShowHierarchy] = useState(false);
  const [showOnLeaveModal, setShowOnLeaveModal] = useState(false);
  const [employeesOnLeave, setEmployeesOnLeave] = useState([]);
  const [allEmployees, setAllEmployees] = useState([]);
  const [allLeaves, setAllLeaves] = useState([]);

  const handleNavigate = useCallback((target) => {
    if (target) {
      onNavigate?.(target);
    }
  }, [onNavigate]);

  const fetchAdminData = async () => {
    try {
      setLoading(true);

      const employeesRes = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/get_all_employees`,
        { headers: buildRequesterHeaders(user) }
      );
      const employees = Array.isArray(employeesRes.data)
        ? employeesRes.data.filter((employee) => employee && employee._id)
        : [];

      const adminsRes = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/users/`);
      const adminIds = (adminsRes.data || [])
        .filter((admin) => admin.role === "Admin")
        .map((admin) => admin._id);

      const allLeavesRes = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/all`);
      const leaves = allLeavesRes.data || [];

      const pending = leaves.filter(
        (leave) => adminIds.includes(leave.current_approver_id) && leave.status === "Pending"
      );
      const recent = leaves
        .filter((leave) => leave.status !== "Pending")
        .sort((first, second) => {
          const firstDate = first.approved_on || first.rejected_on || first.applied_on;
          const secondDate = second.approved_on || second.rejected_on || second.applied_on;
          return new Date(secondDate) - new Date(firstDate);
        })
        .slice(0, 6);
      const onLeaveToday = leaves.filter(leaveCoverageForToday);

      setAllEmployees(employees);
      setAllLeaves(leaves);
      setPendingLeaves(pending);
      setRecentActions(recent);
      setEmployeesOnLeave(onLeaveToday);
      setStats({
        totalEmployees: employees.length,
        pendingLeaves: pending.length,
        onLeaveToday: onLeaveToday.length,
        workingToday: Math.max(0, employees.length - onLeaveToday.length),
      });
    } catch (error) {
      setMessage("Unable to load administration dashboard data.");
      setStats({
        totalEmployees: 0,
        pendingLeaves: 0,
        onLeaveToday: 0,
        workingToday: 0,
      });
      setAllEmployees([]);
      setAllLeaves([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, []);

  const summaryCards = useMemo(
    () => [
      {
        title: "Working Today",
        value: stats.workingToday,
        note: "Available workforce for current operations",
        icon: ShieldCheck,
        linkLabel: "Review employee roster",
        action: () => handleNavigate("employees"),
      },
      {
        title: "On Leave Today",
        value: stats.onLeaveToday,
        note: "Approved absences for the current day",
        icon: CalendarRange,
        linkLabel: "Open leave workspace",
        action: () => handleNavigate("leaves"),
      },
      {
        title: "Pending Approvals",
        value: stats.pendingLeaves,
        note: "Requests awaiting administration review",
        icon: Clock3,
        linkLabel: "Review pending requests",
        action: () => handleNavigate("leaves"),
      },
    ],
    [stats, handleNavigate]
  );

  const departmentHeadcountData = useMemo(() => {
    const counts = allEmployees.reduce((accumulator, employee) => {
      const department = employee.department || "Unassigned";
      accumulator[department] = (accumulator[department] || 0) + 1;
      return accumulator;
    }, {});

    return Object.entries(counts)
      .map(([name, value]) => ({ name: shortLabel(name), fullName: name, value }))
      .sort((first, second) => second.value - first.value)
      .slice(0, 6);
  }, [allEmployees]);

  const leaveStatusData = useMemo(() => {
    const statusOrder = ["Pending", "Approved", "Rejected", "Cancelled"];
    const counts = allLeaves.reduce((accumulator, leave) => {
      const status = leave.status || "Pending";
      accumulator[status] = (accumulator[status] || 0) + 1;
      return accumulator;
    }, {});

    return statusOrder
      .filter((status) => counts[status])
      .map((status, index) => ({
        name: status,
        value: counts[status],
        color: fioriChartPalette[index % fioriChartPalette.length],
      }));
  }, [allLeaves]);

  const approvedLeavesCount = useMemo(
    () => allLeaves.filter((leave) => leave.status === "Approved").length,
    [allLeaves]
  );

  const monthlyTrendData = useMemo(() => {
    const months = [];
    const today = new Date();

    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        key,
        name: date.toLocaleDateString("en-IN", { month: "short" }),
        requests: 0,
        approved: 0,
      });
    }

    const monthMap = months.reduce((accumulator, month) => {
      accumulator[month.key] = month;
      return accumulator;
    }, {});

    allLeaves.forEach((leave) => {
      const appliedDate = new Date(leave.applied_on || leave.start_date);
      if (!Number.isNaN(appliedDate.getTime())) {
        const appliedKey = `${appliedDate.getFullYear()}-${String(appliedDate.getMonth() + 1).padStart(2, "0")}`;
        if (monthMap[appliedKey]) {
          monthMap[appliedKey].requests += 1;
        }
      }

      const approvalDate = new Date(leave.approved_on || "");
      if (!Number.isNaN(approvalDate.getTime())) {
        const approvalKey = `${approvalDate.getFullYear()}-${String(approvalDate.getMonth() + 1).padStart(2, "0")}`;
        if (monthMap[approvalKey] && leave.status === "Approved") {
          monthMap[approvalKey].approved += 1;
        }
      }
    });

    return months;
  }, [allLeaves]);

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const updateStatus = async (leaveId, status, rejectionReason = "") => {
    try {
      const payload = {
        status,
        approved_by: user?.name || user?.email || "Administrator",
      };

      if (status === "Rejected") {
        payload.rejection_reason = rejectionReason;
      }

      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_URL}/api/leaves/update_status/${leaveId}`,
        payload
      );

      if (response.status === 200) {
        setMessage(response.data?.message || `Leave ${status.toLowerCase()} successfully.`);
        setRejectModal({ show: false, leaveId: null, reason: "" });
        fetchAdminData();
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (error) {
      setMessage(error.response?.data?.error || "Unable to update leave status.");
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const confirmReject = async () => {
    if (!rejectModal.reason.trim()) {
      setMessage("A rejection reason is required.");
      setTimeout(() => setMessage(""), 3000);
      return;
    }

    await updateStatus(rejectModal.leaveId, "Rejected", rejectModal.reason);
  };

  if (loading) {
    return (
      <section className="admin-dashboard admin-dashboard-loading">
        <div className="fiori-loading-card">
          <Clock3 size={28} />
          <div>
            <strong>Loading administration workspace</strong>
            <p>Preparing workforce metrics and approval data.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-dashboard">
      <header className="admin-hero admin-hero-command">
        <div className="admin-hero-copy">
          <div className="admin-section-overline">Administration Overview</div>
          <h1>
            {getTimeBasedGreeting()}, {user?.name?.split(" ")[0] || "Administrator"}
          </h1>
          <p>
            Centralize leave decisions, workforce visibility, and governance signals from one
            executive-style operations workspace.
          </p>

          <div className="admin-hero-pill-row">
            <button className="admin-hero-pill" onClick={() => handleNavigate("leaves")}>
              <Clock3 size={14} />
              <span>{stats.pendingLeaves} pending approvals</span>
            </button>
            <button className="admin-hero-pill" onClick={() => handleNavigate("employees")}>
              <ShieldCheck size={14} />
              <span>{stats.workingToday} working today</span>
            </button>
            <button className="admin-hero-pill" onClick={() => setShowOnLeaveModal(true)}>
              <CalendarRange size={14} />
              <span>{stats.onLeaveToday} on leave today</span>
            </button>
          </div>

          <div className="admin-hero-actions">
            <button className="fiori-button primary" onClick={() => handleNavigate("leaves")}>
              Review approvals
            </button>
            <button className="fiori-button secondary" onClick={() => handleNavigate("employees")}>
              Open employee directory
            </button>
            <button className="fiori-button secondary" onClick={() => setShowHierarchy(true)}>
              View organization hierarchy
            </button>
          </div>
        </div>

        <div className="admin-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Role</span>
            <strong>{user?.designation || "Administrator"}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Department</span>
            <strong>{user?.department || "Human Resources"}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Date</span>
            <strong>{today}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Approved leaves</span>
            <strong>{approvedLeavesCount}</strong>
          </div>
        </div>
      </header>

      <div className="admin-dashboard-grid admin-overview-grid">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.title}
              className="fiori-stat-card is-actionable"
              onClick={card.action}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  card.action();
                }
              }}
            >
              <div className="fiori-stat-topline">
                <span className="fiori-stat-label">{card.title}</span>
                <Icon size={18} />
              </div>
              <div className="fiori-stat-value">{card.value}</div>
              <div className="fiori-stat-note">{card.note}</div>
              <div className="fiori-inline-link">{card.linkLabel}</div>
            </article>
          );
        })}
      </div>

      <div className="admin-analytics-grid">
        <article className="fiori-panel fiori-chart-card is-clickable" onClick={() => handleNavigate("employees")}>
          <div className="fiori-panel-header">
            <div>
              <h3>Department headcount</h3>
              <p>Headcount distribution across the largest departments</p>
            </div>
            <div className="fiori-card-link">Open employee directory</div>
          </div>
          <div className="fiori-chart-shell">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departmentHeadcountData} barCategoryGap={18}>
                <CartesianGrid stroke="#e8edf3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#0a6ed1" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="fiori-panel fiori-chart-card is-clickable" onClick={() => handleNavigate("leaves")}>
          <div className="fiori-panel-header">
            <div>
              <h3>Leave status breakdown</h3>
              <p>Current distribution of request outcomes across the system</p>
            </div>
            <div className="fiori-card-link">Open leave workspace</div>
          </div>
          <div className="fiori-chart-shell">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={leaveStatusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={94}
                  paddingAngle={3}
                >
                  {leaveStatusData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="fiori-panel fiori-chart-card is-clickable" onClick={() => handleNavigate("logs")}>
          <div className="fiori-panel-header">
            <div>
              <h3>Monthly leave activity</h3>
              <p>Submitted versus approved requests over the last six months</p>
            </div>
            <div className="fiori-card-link">Open audit logs</div>
          </div>
          <div className="fiori-chart-shell">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyTrendData}>
                <CartesianGrid stroke="#e8edf3" vertical={false} />
                <XAxis dataKey="name" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="requests"
                  stroke="#0a6ed1"
                  fill="rgba(10, 110, 209, 0.18)"
                  strokeWidth={2}
                  name="Requests"
                />
                <Area
                  type="monotone"
                  dataKey="approved"
                  stroke="#5b738b"
                  fill="rgba(91, 115, 139, 0.14)"
                  strokeWidth={2}
                  name="Approved"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      <div className="admin-dashboard-layout">
        <div className="admin-dashboard-primary">
          <section className="fiori-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Pending leave approvals</h3>
                <p>Administration-level requests escalated for action</p>
              </div>
              <div className="fiori-counter">{pendingLeaves.length}</div>
            </div>

            {pendingLeaves.length === 0 ? (
              <div className="admin-empty-state">
                <CheckCircle2 size={28} />
                <div>
                  <strong>No pending leave approvals</strong>
                  <p>All escalated requests have been processed.</p>
                </div>
              </div>
            ) : (
              <div className="admin-approval-list">
                {pendingLeaves.map((leave) => (
                  <article
                    key={leave._id}
                    className="admin-approval-card is-clickable"
                    onClick={() => handleNavigate("leaves")}
                  >
                    <div className="admin-approval-card-header">
                      <div>
                        <h4>{leave.employee_name || "Unknown employee"}</h4>
                        <p>
                          {leave.employee_designation || "Role not set"} |{" "}
                          {leave.employee_department || "Department not set"}
                        </p>
                      </div>
                      <button
                        className="fiori-inline-button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpandedLeave(expandedLeave === leave._id ? null : leave._id);
                        }}
                      >
                        {expandedLeave === leave._id ? "Hide details" : "Show details"}
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    <div className="admin-approval-metadata">
                      <span>{leave.leave_type || "Leave"}</span>
                      <span>{leave.days} day(s)</span>
                      <span>{formatDate(leave.start_date)} to {formatDate(leave.end_date)}</span>
                    </div>

                    {expandedLeave === leave._id && (
                      <div className="admin-approval-details">
                        <div>
                          <span>Requested On</span>
                          <strong>{formatDate(leave.applied_on)}</strong>
                        </div>
                        <div>
                          <span>Escalation Level</span>
                          <strong>{leave.escalation_level ?? 0}</strong>
                        </div>
                        <div className="is-wide">
                          <span>Reason</span>
                          <strong>{leave.reason || "No reason provided"}</strong>
                        </div>
                      </div>
                    )}

                    <div className="admin-approval-actions">
                      <button
                        className="fiori-button primary"
                        onClick={(event) => {
                          event.stopPropagation();
                          updateStatus(leave._id, "Approved");
                        }}
                      >
                        Approve
                      </button>
                      <button
                        className="fiori-button secondary danger"
                        onClick={(event) => {
                          event.stopPropagation();
                          setRejectModal({ show: true, leaveId: leave._id, reason: "" });
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="fiori-panel is-clickable" onClick={() => handleNavigate("logs")}>
            <div className="fiori-panel-header">
              <div>
                <h3>Recent decision log</h3>
                <p>Latest approved and rejected leave actions</p>
              </div>
              <div className="fiori-card-link">Open audit logs</div>
            </div>

            {recentActions.length === 0 ? (
              <div className="admin-empty-state">
                <GitBranch size={28} />
                <div>
                  <strong>No recent leave decisions</strong>
                  <p>Approved and rejected requests will appear here.</p>
                </div>
              </div>
            ) : (
              <div className="fiori-table-shell">
                <table className="fiori-table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Leave Type</th>
                      <th>Period</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentActions.map((action) => (
                      <tr key={action._id}>
                        <td>
                          <div className="fiori-primary-cell">
                            <strong>{action.employee_name || "Unknown employee"}</strong>
                            <span>{formatDate(action.approved_on || action.rejected_on || action.applied_on)}</span>
                          </div>
                        </td>
                        <td>{action.leave_type || "Leave"}</td>
                        <td>
                          {formatDate(action.start_date)} to {formatDate(action.end_date)}
                        </td>
                        <td>
                          <span className={`fiori-status-pill ${statusToneMap[action.status] || "is-neutral"}`}>
                            {action.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="admin-dashboard-secondary">
          <section className="fiori-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Administration priorities</h3>
                <p>Operational indicators for daily review</p>
              </div>
            </div>

            <div className="admin-priority-list">
              <div className="admin-priority-item is-clickable" onClick={() => handleNavigate("employees")}>
                <Building2 size={18} />
                <div>
                  <strong>Workforce availability</strong>
                  <p>{stats.workingToday} employees are currently available for allocation.</p>
                </div>
              </div>
              <div className="admin-priority-item is-clickable" onClick={() => handleNavigate("leaves")}>
                <Clock3 size={18} />
                <div>
                  <strong>Approval queue</strong>
                  <p>{stats.pendingLeaves} requests require review at the administration layer.</p>
                </div>
              </div>
              <div className="admin-priority-item is-clickable" onClick={() => setShowOnLeaveModal(true)}>
                <CalendarRange size={18} />
                <div>
                  <strong>Approved absences</strong>
                  <p>{stats.onLeaveToday} employees are marked unavailable for the current day.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="fiori-panel is-clickable" onClick={() => setShowHierarchy(true)}>
            <div className="fiori-panel-header">
              <div>
                <h3>Organization governance</h3>
                <p>Access the enterprise reporting structure</p>
              </div>
              <div className="fiori-card-link">Open organization hierarchy</div>
            </div>
            <button
              className="fiori-button primary full-width"
              onClick={(event) => {
                event.stopPropagation();
                setShowHierarchy(true);
              }}
            >
              Open organization hierarchy
            </button>
          </section>
        </aside>
      </div>

      {message && (
        <div
          className={`admin-toast ${message.toLowerCase().includes("unable") || message.toLowerCase().includes("required") ? "is-error" : "is-success"}`}
        >
          {message}
        </div>
      )}

      {showHierarchy && <OrganizationHierarchy user={user} onClose={() => setShowHierarchy(false)} />}

      {showOnLeaveModal && (
        <OnLeaveEmployeesModal
          employees={employeesOnLeave}
          onClose={() => setShowOnLeaveModal(false)}
        />
      )}

      {rejectModal.show && (
        <div
          className="admin-modal-overlay"
          onClick={() => setRejectModal({ show: false, leaveId: null, reason: "" })}
        >
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-section-overline">Leave action</div>
                <h2>Reject leave request</h2>
                <p>Provide a clear audit reason for the decision.</p>
              </div>
              <button
                className="fiori-button secondary"
                onClick={() => setRejectModal({ show: false, leaveId: null, reason: "" })}
              >
                Cancel
              </button>
            </div>

            <div className="fiori-form-field">
              <label htmlFor="reject-reason">Rejection reason</label>
              <textarea
                id="reject-reason"
                placeholder="Enter the business reason for rejection"
                value={rejectModal.reason}
                onChange={(event) =>
                  setRejectModal((previous) => ({ ...previous, reason: event.target.value }))
                }
                rows={6}
              />
            </div>

            <div className="admin-modal-actions">
              <button
                className="fiori-button secondary"
                onClick={() => setRejectModal({ show: false, leaveId: null, reason: "" })}
              >
                Dismiss
              </button>
              <button
                className="fiori-button primary danger"
                onClick={confirmReject}
                disabled={!rejectModal.reason.trim()}
              >
                Confirm rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default AdminDashboard;
