// src/components/ManagerDashboard.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  BriefcaseBusiness,
  CalendarRange,
  ChartColumn,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GitBranch,
  PieChart as PieChartIcon,
  ShieldCheck,
  UserCheck,
  Users,
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
import { buildRequesterHeaders } from "../utils/requester";
import OrganizationHierarchy from "./OrganizationHierarchy";
import LeaveStatusDot from "./LeaveStatusDot";

const statusToneMap = {
  Approved: "is-approved",
  Rejected: "is-rejected",
  Cancelled: "is-neutral",
  Pending: "is-pending",
};

const fioriChartPalette = ["#0a6ed1", "#188918", "#d97706", "#bb0000", "#5b738b", "#91c8f6"];
const statusOrder = ["Pending", "Approved", "Rejected", "Cancelled"];

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
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "Not available";
  }
};

const normalizeId = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (value.$oid) return value.$oid;
  if (value._id) return normalizeId(value._id);
  return String(value);
};

const toDateKey = (value) => {
  if (!value) return "";

  try {
    const rawValue = typeof value === "object" && value.$date ? value.$date : value;

    if (typeof rawValue === "string" && /^\d{4}-\d{2}-\d{2}/.test(rawValue)) {
      return rawValue.slice(0, 10);
    }

    const date = new Date(rawValue);
    if (Number.isNaN(date.getTime())) return "";

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  } catch {
    return "";
  }
};

const getLeaveStartKey = (leave) => {
  if (leave.is_partial_approval && leave.approved_start_date) {
    return toDateKey(leave.approved_start_date);
  }

  return toDateKey(leave.start_date);
};

const getLeaveEndKey = (leave) => {
  if (leave.is_partial_approval && leave.approved_end_date) {
    return toDateKey(leave.approved_end_date);
  }

  return toDateKey(leave.end_date || leave.start_date);
};

const leaveCoverageForToday = (leave) => {
  if (leave.status !== "Approved") return false;

  const today = toDateKey(new Date());
  const start = getLeaveStartKey(leave);
  const end = getLeaveEndKey(leave) || start;

  return Boolean(start && end && start <= today && end >= today);
};

const getLeaveDays = (leave) => {
  const value = Number(leave.approved_days ?? leave.days ?? 0);
  return Number.isFinite(value) ? value : 0;
};

const formatDays = (value) => {
  const numberValue = Number(value) || 0;
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(1);
};

const shortLabel = (value, max = 12) => {
  if (!value) return "Unassigned";
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="fiori-chart-tooltip">
      {label ? <div className="fiori-chart-tooltip-label">{label}</div> : null}
      {payload.map((entry) => (
        <div key={`${entry.name}-${entry.dataKey || entry.value}`} className="fiori-chart-tooltip-row">
          <span>{entry.name}</span>
          <strong>{entry.value}</strong>
        </div>
      ))}
    </div>
  );
};

const ManagerOnLeaveModal = ({ leaves, onClose }) => {
  const groupedByType = leaves.reduce((accumulator, leave) => {
    const type = leave.leave_type || "Other";
    accumulator[type] = accumulator[type] || [];
    accumulator[type].push(leave);
    return accumulator;
  }, {});

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal-wide" onClick={(event) => event.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <div className="admin-section-overline">Daily team coverage</div>
            <h2>Team members on approved leave today</h2>
            <p>
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>
          <button type="button" className="fiori-button secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {leaves.length > 0 ? (
          <div className="admin-dashboard-grid admin-dashboard-grid-compact manager-modal-summary-grid">
            {Object.entries(groupedByType).map(([type, members]) => (
              <article key={type} className="fiori-stat-card">
                <div className="fiori-stat-label">{type}</div>
                <div className="fiori-stat-value">{members.length}</div>
                <div className="fiori-stat-note">Approved leave record(s)</div>
              </article>
            ))}
          </div>
        ) : null}

        <div className="fiori-panel">
          <div className="fiori-panel-header">
            <div>
              <h3>Coverage roster</h3>
              <p>Current day absences for your direct reportees.</p>
            </div>
          </div>

          {leaves.length === 0 ? (
            <div className="admin-empty-state">
              <CheckCircle2 size={28} />
              <div>
                <strong>No team members are on leave today</strong>
                <p>Your direct team is fully available for the current day.</p>
              </div>
            </div>
          ) : (
            <div className="fiori-table-shell">
              <table className="fiori-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Leave Type</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((leave) => (
                    <tr key={leave._id}>
                      <td>
                        <div className="fiori-primary-cell">
                          <strong>{leave.employee_name || "Unknown employee"}</strong>
                          <span>{leave.employee_email || "No email"}</span>
                        </div>
                      </td>
                      <td>{leave.leave_type || "Leave"}</td>
                      <td>{formatDate(leave.approved_start_date || leave.start_date)}</td>
                      <td>{formatDate(leave.approved_end_date || leave.end_date)}</td>
                      <td>{formatDays(getLeaveDays(leave))}</td>
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

const ManagerDashboard = ({ user, onNavigate, onNavigateToProfile }) => {
  const [stats, setStats] = useState({
    totalTeamMembers: 0,
    pendingLeaves: 0,
    onLeaveToday: 0,
    workingToday: 0,
  });
  const [teamMembers, setTeamMembers] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [recentActions, setRecentActions] = useState([]);
  const [teamLeaves, setTeamLeaves] = useState([]);
  const [employeesOnLeave, setEmployeesOnLeave] = useState([]);
  const [upcomingHolidays, setUpcomingHolidays] = useState([]);
  const [expandedLeave, setExpandedLeave] = useState(null);
  const [rejectModal, setRejectModal] = useState({ show: false, leaveId: null, reason: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showHierarchy, setShowHierarchy] = useState(false);
  const [showOnLeaveModal, setShowOnLeaveModal] = useState(false);

  const handleNavigate = useCallback(
    (target) => {
      if (target) {
        onNavigate?.(target);
      }
    },
    [onNavigate]
  );

  const fetchManagerData = useCallback(async () => {
    if (!user?.email) return;

    try {
      setLoading(true);
      setMessage("");

      const teamRes = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/get_employees_by_manager/${encodeURIComponent(user.email)}`
      );

      let team = [];
      if (Array.isArray(teamRes.data)) {
        team = teamRes.data;
      } else if (teamRes.data && typeof teamRes.data === "object") {
        team = [teamRes.data];
      }

      team = team.filter((member) => member && member._id);
      setTeamMembers(team);

      const pendingRes = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/leaves/pending/${encodeURIComponent(user.email)}`
      );
      const pending = Array.isArray(pendingRes.data) ? pendingRes.data : [];
      setPendingLeaves(pending);

      const allLeavesRes = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/all`);
      const allLeaves = Array.isArray(allLeavesRes.data) ? allLeavesRes.data : [];
      const teamIds = new Set(team.map((member) => normalizeId(member._id)).filter(Boolean));
      const scopedTeamLeaves = allLeaves.filter((leave) => teamIds.has(normalizeId(leave.employee_id)));

      const recent = scopedTeamLeaves
        .filter((leave) => leave.status !== "Pending")
        .sort((a, b) => {
          const dateA = a.approved_on || a.rejected_on || a.applied_on;
          const dateB = b.approved_on || b.rejected_on || b.applied_on;
          return new Date(dateB) - new Date(dateA);
        })
        .slice(0, 6);
      setRecentActions(recent);

      const onLeaveToday = scopedTeamLeaves.filter(leaveCoverageForToday);
      setTeamLeaves(scopedTeamLeaves);
      setEmployeesOnLeave(onLeaveToday);

      try {
        const holidaysRes = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/holidays/`);
        const holidays = Array.isArray(holidaysRes.data) ? holidaysRes.data : [];
        const todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);

        setUpcomingHolidays(
          holidays
            .filter((holiday) => new Date(holiday.date) >= todayDate)
            .sort((first, second) => new Date(first.date) - new Date(second.date))
            .slice(0, 3)
        );
      } catch {
        setUpcomingHolidays([]);
      }

      setStats({
        totalTeamMembers: team.length,
        pendingLeaves: pending.length,
        onLeaveToday: onLeaveToday.length,
        workingToday: Math.max(0, team.length - onLeaveToday.length),
      });
    } catch (error) {
      setMessage(error.response?.data?.error || "Unable to load manager dashboard data.");
      setStats({
        totalTeamMembers: 0,
        pendingLeaves: 0,
        onLeaveToday: 0,
        workingToday: 0,
      });
      setTeamMembers([]);
      setPendingLeaves([]);
      setRecentActions([]);
      setTeamLeaves([]);
      setEmployeesOnLeave([]);
      setUpcomingHolidays([]);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    fetchManagerData();
  }, [fetchManagerData]);

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const summaryCards = useMemo(
    () => [
      {
        title: "Team members",
        value: stats.totalTeamMembers,
        note: "Direct reportees assigned to your workspace",
        icon: Users,
        linkLabel: "Open team directory",
        action: () => handleNavigate("employees"),
      },
      {
        title: "Working today",
        value: stats.workingToday,
        note: "Available team capacity for the day",
        icon: BriefcaseBusiness,
        linkLabel: "Review available team",
        action: () => handleNavigate("employees"),
      },
      {
        title: "On leave today",
        value: stats.onLeaveToday,
        note: "Approved leave overlapping today",
        icon: UserCheck,
        linkLabel: "View today's roster",
        action: () => setShowOnLeaveModal(true),
      },
      {
        title: "Pending approvals",
        value: stats.pendingLeaves,
        note: "Leave requests waiting for your decision",
        icon: Clock3,
        linkLabel: "Review approvals",
        action: () => handleNavigate("leaves"),
      },
    ],
    [handleNavigate, stats]
  );

  const managerMetrics = useMemo(() => {
    const approvedLeaves = teamLeaves.filter((leave) => leave.status === "Approved");
    const reviewedLeaves = teamLeaves.filter((leave) => ["Approved", "Rejected"].includes(leave.status));
    const approvedDays = approvedLeaves.reduce((total, leave) => total + getLeaveDays(leave), 0);
    const pendingDays = pendingLeaves.reduce((total, leave) => total + getLeaveDays(leave), 0);

    return {
      approvedLeaves: approvedLeaves.length,
      approvedDays,
      pendingDays,
      reviewedLeaves: reviewedLeaves.length,
      approvalRate: reviewedLeaves.length ? Math.round((approvedLeaves.length / reviewedLeaves.length) * 100) : 0,
      availabilityRate: stats.totalTeamMembers
        ? Math.round((stats.workingToday / stats.totalTeamMembers) * 100)
        : 0,
    };
  }, [pendingLeaves, stats.totalTeamMembers, stats.workingToday, teamLeaves]);

  const leaveStatusData = useMemo(() => {
    const counts = teamLeaves.reduce((accumulator, leave) => {
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
  }, [teamLeaves]);

  const leaveTypeData = useMemo(() => {
    const counts = teamLeaves.reduce((accumulator, leave) => {
      const type = leave.leave_type || "Other";
      accumulator[type] = (accumulator[type] || 0) + 1;
      return accumulator;
    }, {});

    return Object.entries(counts)
      .map(([name, value], index) => ({
        name,
        value,
        shortName: shortLabel(name, 14),
        color: fioriChartPalette[index % fioriChartPalette.length],
      }))
      .sort((first, second) => second.value - first.value)
      .slice(0, 6);
  }, [teamLeaves]);

  const monthlyTrendData = useMemo(() => {
    const months = [];
    const date = new Date();

    for (let index = 5; index >= 0; index -= 1) {
      const monthDate = new Date(date.getFullYear(), date.getMonth() - index, 1);
      const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        key,
        name: monthDate.toLocaleDateString("en-IN", { month: "short" }),
        requests: 0,
        approved: 0,
      });
    }

    const monthMap = months.reduce((accumulator, month) => {
      accumulator[month.key] = month;
      return accumulator;
    }, {});

    teamLeaves.forEach((leave) => {
      const requestedKey = toDateKey(leave.applied_on || leave.start_date).slice(0, 7);
      if (monthMap[requestedKey]) {
        monthMap[requestedKey].requests += 1;
      }

      const approvedKey = toDateKey(leave.approved_on || "").slice(0, 7);
      if (leave.status === "Approved" && monthMap[approvedKey]) {
        monthMap[approvedKey].approved += 1;
      }
    });

    return months;
  }, [teamLeaves]);

  const teamLeaveLoadData = useMemo(() => {
    const loadByEmployee = teamLeaves
      .filter((leave) => leave.status === "Approved")
      .reduce((accumulator, leave) => {
        const employeeId = normalizeId(leave.employee_id) || leave.employee_email || leave.employee_name;
        const employeeName = leave.employee_name || "Unknown employee";

        if (!accumulator[employeeId]) {
          accumulator[employeeId] = {
            name: shortLabel(employeeName, 12),
            fullName: employeeName,
            approvedDays: 0,
          };
        }

        accumulator[employeeId].approvedDays += getLeaveDays(leave);
        return accumulator;
      }, {});

    return Object.values(loadByEmployee)
      .sort((first, second) => second.approvedDays - first.approvedDays)
      .slice(0, 6);
  }, [teamLeaves]);

  const upcomingApprovedLeaves = useMemo(() => {
    const todayKey = toDateKey(new Date());

    return teamLeaves
      .filter((leave) => leave.status === "Approved")
      .filter((leave) => (getLeaveEndKey(leave) || getLeaveStartKey(leave)) >= todayKey)
      .sort((first, second) => getLeaveStartKey(first).localeCompare(getLeaveStartKey(second)))
      .slice(0, 4);
  }, [teamLeaves]);

  const updateStatus = async (leaveId, status, rejectionReason = "") => {
    try {
      const payload = {
        status,
        approved_by: user?.name || user?.email || "Manager",
      };

      if (status === "Rejected") {
        payload.rejection_reason = rejectionReason;
      }

      const response = await axios.put(
        `${process.env.REACT_APP_BACKEND_URL}/api/leaves/update_status/${leaveId}`,
        payload,
        { headers: buildRequesterHeaders(user) }
      );

      if (response.status === 200) {
        setMessage(response.data?.message || `Leave ${status.toLowerCase()} successfully.`);
        setRejectModal({ show: false, leaveId: null, reason: "" });
        fetchManagerData();
        window.dispatchEvent(new Event("refreshNotifications"));
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

  const messageIsError = ["unable", "error", "failed", "required"].some((term) =>
    message.toLowerCase().includes(term)
  );

  if (loading) {
    return (
      <section className="admin-dashboard admin-dashboard-loading">
        <div className="fiori-loading-card">
          <Clock3 size={28} />
          <div>
            <strong>Loading manager workspace</strong>
            <p>Preparing team metrics and approval data.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="admin-dashboard manager-workspace">
      <header className="admin-hero admin-hero-command manager-hero">
        <div className="admin-hero-copy">
          <div>
            <div className="admin-section-overline">Manager workspace</div>
            <h1>
              {getTimeBasedGreeting()}, {user?.name?.split(" ")[0] || "Manager"}
            </h1>
          </div>

          <div className="admin-hero-actions">
            <button type="button" className="fiori-button primary" onClick={() => handleNavigate("leaves")}>
              <Clock3 size={16} />
              Review approvals
            </button>
            <button type="button" className="fiori-button secondary" onClick={() => handleNavigate("employees")}>
              <Users size={16} />
              Team
            </button>
            <button type="button" className="fiori-button secondary" onClick={() => setShowHierarchy(true)}>
              <GitBranch size={16} />
              Hierarchy
            </button>
          </div>
        </div>

        <div className="admin-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Role</span>
            <strong>{user?.designation || "Manager"}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Department</span>
            <strong>{user?.department || "Department not set"}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Date</span>
            <strong>{today}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Approved days</span>
            <strong>{formatDays(managerMetrics.approvedDays)}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Decision rate</span>
            <strong>
              {managerMetrics.reviewedLeaves ? `${managerMetrics.approvalRate}% approved` : "No decisions yet"}
            </strong>
          </div>
        </div>
      </header>

      <div className="admin-dashboard-grid manager-summary-grid">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <article
              key={card.title}
              className="fiori-stat-card is-actionable"
              onClick={card.action}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  card.action();
                }
              }}
              role="button"
              tabIndex={0}
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

      <div className="admin-analytics-grid manager-analytics-grid">
        <article className="fiori-panel fiori-chart-card is-clickable" onClick={() => handleNavigate("leaves")}>
          <div className="fiori-panel-header">
            <div>
              <h3>Leave status breakdown</h3>
              <p>Current request outcomes across your direct team.</p>
            </div>
            <div className="fiori-card-link">Open leaves</div>
          </div>
          {leaveStatusData.length === 0 ? (
            <div className="manager-chart-empty">
              <PieChartIcon size={24} />
              <span>No leave requests yet</span>
            </div>
          ) : (
            <div className="fiori-chart-shell">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leaveStatusData}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={58}
                    outerRadius={88}
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
          )}
        </article>

        <article className="fiori-panel fiori-chart-card is-clickable" onClick={() => handleNavigate("leaves")}>
          <div className="fiori-panel-header">
            <div>
              <h3>Leave type mix</h3>
              <p>Request categories used most often by your team.</p>
            </div>
            <div className="fiori-card-link">Review types</div>
          </div>
          {leaveTypeData.length === 0 ? (
            <div className="manager-chart-empty">
              <PieChartIcon size={24} />
              <span>No leave type data</span>
            </div>
          ) : (
            <div className="fiori-chart-shell">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leaveTypeData} layout="vertical" margin={{ left: 8, right: 12 }}>
                  <CartesianGrid stroke="#e8edf3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="shortName" tickLine={false} axisLine={false} width={86} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Requests" radius={[0, 8, 8, 0]} fill="#0a6ed1" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>

        <article className="fiori-panel fiori-chart-card is-clickable" onClick={() => handleNavigate("leaves")}>
          <div className="fiori-panel-header">
            <div>
              <h3>Monthly leave activity</h3>
              <p>Submitted versus approved requests over the last six months.</p>
            </div>
            <div className="fiori-card-link">Open trend</div>
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
                  stroke="#188918"
                  fill="rgba(24, 137, 24, 0.12)"
                  strokeWidth={2}
                  name="Approved"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="fiori-panel fiori-chart-card is-clickable" onClick={() => handleNavigate("employees")}>
          <div className="fiori-panel-header">
            <div>
              <h3>Team leave load</h3>
              <p>Approved leave days by team member.</p>
            </div>
            <div className="fiori-card-link">Open team</div>
          </div>
          {teamLeaveLoadData.length === 0 ? (
            <div className="manager-chart-empty">
              <ChartColumn size={24} />
              <span>No approved leave days yet</span>
            </div>
          ) : (
            <div className="fiori-chart-shell">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={teamLeaveLoadData} barCategoryGap={16}>
                  <CartesianGrid stroke="#e8edf3" vertical={false} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="approvedDays" name="Approved days" radius={[8, 8, 0, 0]} fill="#5b738b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </article>
      </div>

      <div className="admin-dashboard-layout">
        <div className="admin-dashboard-primary">
          <section className="fiori-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Pending leave approvals</h3>
                <p>Requests from your direct reportees waiting for review.</p>
              </div>
              <div className="fiori-counter">{pendingLeaves.length}</div>
            </div>

            {pendingLeaves.length === 0 ? (
              <div className="admin-empty-state">
                <CheckCircle2 size={28} />
                <div>
                  <strong>No pending leave approvals</strong>
                  <p>All team requests have been processed.</p>
                </div>
              </div>
            ) : (
              <div className="admin-approval-list">
                {pendingLeaves.map((leave) => (
                  <article key={leave._id} className="admin-approval-card">
                    <div className="admin-approval-card-header">
                      <div>
                        <h4>{leave.employee_name || "Unknown employee"}</h4>
                        <p>
                          {leave.employee_designation || "Role not set"} |{" "}
                          {leave.employee_department || "Department not set"}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="fiori-inline-button"
                        onClick={() => setExpandedLeave(expandedLeave === leave._id ? null : leave._id)}
                      >
                        {expandedLeave === leave._id ? "Hide details" : "Show details"}
                        <ChevronRight size={16} />
                      </button>
                    </div>

                    <div className="admin-approval-metadata">
                      <span>{leave.leave_type || "Leave"}</span>
                      <span>{leave.days || 0} day(s)</span>
                      <span>
                        {formatDate(leave.start_date)} to {formatDate(leave.end_date)}
                      </span>
                    </div>

                    {expandedLeave === leave._id && (
                      <div className="admin-approval-details">
                        <div>
                          <span>Requested On</span>
                          <strong>{formatDate(leave.applied_on)}</strong>
                        </div>
                        <div>
                          <span>Email</span>
                          <strong>{leave.employee_email || "Not available"}</strong>
                        </div>
                        <div className="is-wide">
                          <span>Reason</span>
                          <strong>{leave.reason || "No reason provided"}</strong>
                        </div>
                      </div>
                    )}

                    <div className="admin-approval-actions">
                      <button className="fiori-button primary" onClick={() => updateStatus(leave._id, "Approved")}>
                        Approve
                      </button>
                      <button
                        className="fiori-button secondary danger"
                        onClick={() => setRejectModal({ show: true, leaveId: leave._id, reason: "" })}
                      >
                        Reject
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="fiori-panel is-clickable" onClick={() => handleNavigate("leaves")}>
            <div className="fiori-panel-header">
              <div>
                <h3>Recent team decisions</h3>
                <p>Latest approved and rejected leave actions for your team.</p>
              </div>
              <div className="fiori-card-link">Open leave workspace</div>
            </div>

            {recentActions.length === 0 ? (
              <div className="admin-empty-state">
                <ShieldCheck size={28} />
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
                            {action.status || "Updated"}
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
                <h3>Your team</h3>
                <p>Open a reportee profile or view the reporting hierarchy.</p>
              </div>
              <button type="button" className="fiori-button secondary" onClick={() => setShowHierarchy(true)}>
                <GitBranch size={16} />
                Hierarchy
              </button>
            </div>

            {teamMembers.length === 0 ? (
              <div className="admin-empty-state">
                <Users size={28} />
                <div>
                  <strong>No team members assigned</strong>
                  <p>Reportees assigned to you will appear here.</p>
                </div>
              </div>
            ) : (
              <div className="manager-team-list">
                {teamMembers.map((member) => {
                  const memberId =
                    typeof member._id === "string" ? member._id : member._id?._id || String(member._id);

                  return (
                    <button
                      key={memberId}
                      type="button"
                      className="manager-team-member"
                      onClick={() => onNavigateToProfile?.(memberId)}
                    >
                      <div className="manager-team-avatar">
                        {member.photoUrl ? (
                          <img src={member.photoUrl} alt="" />
                        ) : (
                          <span>{member.name?.charAt(0) || "E"}</span>
                        )}
                        <div className="manager-team-status-dot">
                          <LeaveStatusDot userId={memberId} size={12} />
                        </div>
                      </div>
                      <div className="manager-team-copy">
                        <strong>{member.name || "Team member"}</strong>
                        <span>{member.designation || "Designation not set"}</span>
                      </div>
                      <ChevronRight size={16} />
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="fiori-panel manager-planning-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Manager planning cards</h3>
                <p>Upcoming approved team leave and holidays.</p>
              </div>
            </div>

            <div className="manager-planning-grid">
              <div className="manager-planning-column">
                <div className="manager-planning-title">
                  <CalendarRange size={16} />
                  <span>Approved team leave</span>
                </div>

                {upcomingApprovedLeaves.length === 0 ? (
                  <div className="manager-planning-empty">No approved upcoming team leave.</div>
                ) : null}

                {upcomingApprovedLeaves.map((leave) => (
                  <button
                    key={`upcoming-${leave._id}`}
                    type="button"
                    className="manager-planning-card"
                    onClick={() => handleNavigate("leaves")}
                  >
                    <div>
                      <strong>{leave.employee_name || "Team member"}</strong>
                      <span>
                        {leave.leave_type || "Leave"} | {formatDate(leave.approved_start_date || leave.start_date)} to{" "}
                        {formatDate(leave.approved_end_date || leave.end_date)}
                      </span>
                    </div>
                    <span className="fiori-status-pill is-approved">{formatDays(getLeaveDays(leave))} day(s)</span>
                  </button>
                ))}
              </div>

              <div className="manager-planning-column">
                <div className="manager-planning-title">
                  <ShieldCheck size={16} />
                  <span>Upcoming holidays</span>
                </div>

                {upcomingHolidays.length === 0 ? (
                  <div className="manager-planning-empty">No upcoming holidays listed.</div>
                ) : null}

                {upcomingHolidays.map((holiday) => (
                  <button
                    key={`${holiday.name}-${holiday.date}`}
                    type="button"
                    className="manager-planning-card"
                    onClick={() => handleNavigate("calendar")}
                  >
                    <div>
                      <strong>{holiday.name || "Holiday"}</strong>
                      <span>{formatDate(holiday.date)}</span>
                    </div>
                    <span className="fiori-status-pill is-neutral">{holiday.type || "Holiday"}</span>
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="fiori-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Manager priorities</h3>
                <p>Daily indicators for quick review.</p>
              </div>
            </div>

            <div className="admin-priority-list">
              <div className="admin-priority-item is-clickable" onClick={() => handleNavigate("leaves")}>
                <Clock3 size={18} />
                <div>
                  <strong>Approval queue</strong>
                  <p>{stats.pendingLeaves} request(s) need a manager decision.</p>
                </div>
              </div>
              <div className="admin-priority-item is-clickable" onClick={() => handleNavigate("employees")}>
                <BriefcaseBusiness size={18} />
                <div>
                  <strong>Team capacity</strong>
                  <p>{stats.workingToday} team member(s) are currently available today.</p>
                </div>
              </div>
              <div className="admin-priority-item is-clickable" onClick={() => handleNavigate("leaves")}>
                <UserCheck size={18} />
                <div>
                  <strong>Leave coverage</strong>
                  <p>{stats.onLeaveToday} approved leave record(s) overlap today.</p>
                </div>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {message && (
        <div className={`admin-toast ${messageIsError ? "is-error" : "is-success"}`}>{message}</div>
      )}

      {showHierarchy && <OrganizationHierarchy user={user} onClose={() => setShowHierarchy(false)} />}

      {showOnLeaveModal && (
        <ManagerOnLeaveModal
          leaves={employeesOnLeave}
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
                <div className="admin-section-overline">Leave decision</div>
                <h2>Reject leave request</h2>
                <p>Please provide a reason before rejecting this leave request.</p>
              </div>
            </div>

            <div className="fiori-form-field">
              <label htmlFor="manager-rejection-reason">Rejection reason</label>
              <textarea
                id="manager-rejection-reason"
                placeholder="Enter rejection reason"
                value={rejectModal.reason}
                onChange={(event) => setRejectModal({ ...rejectModal, reason: event.target.value })}
                rows={5}
                autoFocus
              />
            </div>

            <div className="admin-modal-actions">
              <button
                type="button"
                className="fiori-button secondary"
                onClick={() => setRejectModal({ show: false, leaveId: null, reason: "" })}
              >
                Cancel
              </button>
              <button
                type="button"
                className="fiori-button danger"
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

export default ManagerDashboard;
