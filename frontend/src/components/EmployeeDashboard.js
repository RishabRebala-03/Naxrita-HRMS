import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ArrowRight,
  CalendarDays,
  ChartColumn,
  Clock3,
  GitBranch,
  PieChart as PieChartIcon,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import OrganizationHierarchy from "./OrganizationHierarchy";
import LeaveStatusDot from "./LeaveStatusDot";

const CHART_COLORS = ["#0a6ed1", "#188918", "#d97706", "#bb0000", "#7c3aed"];

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

const statusToneMap = {
  Approved: "is-approved",
  Rejected: "is-rejected",
  Cancelled: "is-neutral",
  Pending: "is-pending",
};

const EmployeeDashboard = ({ user, setSection }) => {
  const [stats, setStats] = useState({
    totalLeaves: 0,
    pendingLeaves: 0,
    approvedLeaves: 0,
    rejectedLeaves: 0,
    totalTeamMembers: 0,
  });
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [leaveHistory, setLeaveHistory] = useState([]);
  const [recentLeaves, setRecentLeaves] = useState([]);
  const [managerInfo, setManagerInfo] = useState(null);
  const [upcomingHolidays, setUpcomingHolidays] = useState([]);
  const [showHierarchy, setShowHierarchy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const openSection = useCallback(
    (sectionName, payload = null) => {
      setSection?.(sectionName, payload);
    },
    [setSection]
  );

  const openLeaves = useCallback(
    (payload = {}) => {
      openSection("leaves", payload);
    },
    [openSection]
  );

  const fetchEmployeeData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [
        balanceResult,
        historyResult,
        profileResult,
        usersResult,
        holidaysResult,
        teamResult,
      ] = await Promise.allSettled([
        axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/balance/${user.id}`),
        axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/history/${user.id}`),
        axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/users/${user.id}`),
        axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/users/`),
        axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/holidays/`),
        axios.get(
          `${process.env.REACT_APP_BACKEND_URL}/api/users/get_employees_by_manager/${encodeURIComponent(user.email)}`
        ),
      ]);

      if (balanceResult.status === "fulfilled") {
        setLeaveBalance(balanceResult.value.data);
      } else {
        setLeaveBalance({
          sick: 0,
          sickTotal: 6,
          planned: 0,
          plannedTotal: 12,
          optional: 0,
          optionalTotal: 2,
          lwp: 0,
        });
      }

      const leaves =
        historyResult.status === "fulfilled" && Array.isArray(historyResult.value.data)
          ? historyResult.value.data
          : [];

      const sortedLeaves = [...leaves].sort(
        (first, second) =>
          new Date(second.applied_on || second.start_date || 0) -
          new Date(first.applied_on || first.start_date || 0)
      );

      setLeaveHistory(sortedLeaves);
      setRecentLeaves(sortedLeaves.slice(0, 3));
      setStats((previous) => ({
        ...previous,
        totalLeaves: leaves.length,
        pendingLeaves: leaves.filter((item) => item.status === "Pending").length,
        approvedLeaves: leaves.filter((item) => item.status === "Approved").length,
        rejectedLeaves: leaves.filter((item) => item.status === "Rejected").length,
      }));

      const userProfile = profileResult.status === "fulfilled" ? profileResult.value.data : null;
      const allUsers = usersResult.status === "fulfilled" ? usersResult.value.data : [];
      let resolvedManager = null;

      if (userProfile?.reportsToEmail) {
        resolvedManager = allUsers.find(
          (item) => item.email?.toLowerCase() === userProfile.reportsToEmail.toLowerCase()
        );
      }

      if (!resolvedManager && userProfile?.reportsTo) {
        try {
          const managerResponse = await axios.get(
            `${process.env.REACT_APP_BACKEND_URL}/api/users/${userProfile.reportsTo}`
          );
          resolvedManager = managerResponse.data;
        } catch {
          resolvedManager = null;
        }
      }

      setManagerInfo(resolvedManager);

      const allHolidays =
        holidaysResult.status === "fulfilled" && Array.isArray(holidaysResult.value.data)
          ? holidaysResult.value.data
          : [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      setUpcomingHolidays(
        allHolidays
          .filter((holiday) => new Date(holiday.date) >= today)
          .sort((first, second) => new Date(first.date) - new Date(second.date))
          .slice(0, 3)
      );

      const teamCount =
        teamResult.status === "fulfilled" && Array.isArray(teamResult.value.data)
          ? teamResult.value.data.length
          : 0;
      setStats((previous) => ({ ...previous, totalTeamMembers: teamCount }));
    } catch (fetchError) {
      console.error("Error loading employee dashboard:", fetchError);
      setError("We could not load your employee workspace right now.");
    } finally {
      setLoading(false);
    }
  }, [user.email, user.id]);

  useEffect(() => {
    if (user?.id && user?.email) {
      fetchEmployeeData();
    }
  }, [fetchEmployeeData, user?.email, user?.id]);

  const totalBalance = useMemo(() => {
    if (!leaveBalance) return 0;
    return (leaveBalance.sick || 0) + (leaveBalance.planned || 0);
  }, [leaveBalance]);

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    []
  );

  const leaveBalanceCards = useMemo(() => {
    if (!leaveBalance) return [];

    return [
      {
        label: "Sick balance",
        value: leaveBalance.sick || 0,
        note: `${leaveBalance.sickTotal || 6} allocated`,
        payload: { source: "dashboard-balance", historyFilterType: "sick" },
      },
      {
        label: "Planned balance",
        value: leaveBalance.planned || 0,
        note: `${leaveBalance.plannedTotal || 12} allocated`,
        payload: { source: "dashboard-balance", historyFilterType: "planned" },
      },
      {
        label: "LOP used",
        value: leaveBalance.lwp || 0,
        note: "Tracks unpaid leave days",
        payload: { source: "dashboard-balance", historyFilterType: "lop" },
      },
    ];
  }, [leaveBalance]);

  const statusChartData = useMemo(
    () => [
      { name: "Pending", value: stats.pendingLeaves, fill: "#d97706", filterStatus: "pending" },
      { name: "Approved", value: stats.approvedLeaves, fill: "#188918", filterStatus: "approved" },
      { name: "Rejected", value: stats.rejectedLeaves, fill: "#bb0000", filterStatus: "rejected" },
    ],
    [stats.approvedLeaves, stats.pendingLeaves, stats.rejectedLeaves]
  );

  const leaveTypeData = useMemo(() => {
    const counts = leaveHistory
      .concat()
      .reduce((accumulator, leave) => {
        const key = leave.leave_type || "Other";
        accumulator[key] = (accumulator[key] || 0) + 1;
        return accumulator;
      }, {});

    return Object.entries(counts)
      .map(([name, value], index) => ({
        name,
        value,
        fill: CHART_COLORS[index % CHART_COLORS.length],
      }))
      .sort((first, second) => second.value - first.value);
  }, [leaveHistory]);

  const monthlyLeaveData = useMemo(() => {
    const monthMap = new Map();
    const today = new Date();

    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date(today.getFullYear(), today.getMonth() - index, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, {
        key,
        month: date.toLocaleDateString("en-IN", { month: "short" }),
        applied: 0,
        approved: 0,
      });
    }

    leaveHistory.forEach((leave) => {
      const baseDate = leave.start_date || leave.applied_on;
      const date = new Date(baseDate);
      if (Number.isNaN(date.getTime())) return;

      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthMap.has(key)) return;

      const bucket = monthMap.get(key);
      bucket.applied += Number(leave.days) || 1;
      if (leave.status === "Approved") {
        bucket.approved += Number(leave.approved_days || leave.days) || 1;
      }
    });

    return Array.from(monthMap.values());
  }, [leaveHistory]);

  const approvedUpcomingLeaves = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return leaveHistory
      .filter((leave) => leave.status === "Approved")
      .filter((leave) => new Date(leave.end_date || leave.start_date) >= today)
      .sort((first, second) => new Date(first.start_date) - new Date(second.start_date))
      .slice(0, 3);
  }, [leaveHistory]);

  const overviewCards = useMemo(
    () => [
      {
        label: "Balance",
        value: totalBalance,
        note: `${leaveBalanceCards.length} leave categories tracked`,
        icon: CalendarDays,
        action: () => openLeaves({ source: "dashboard-overview" }),
        linkLabel: "Open leave balance",
      },
      {
        label: "Pending review",
        value: stats.pendingLeaves,
        note: stats.pendingLeaves ? "Awaiting approval action" : "No action needed",
        icon: Clock3,
        action: () => openLeaves({ source: "dashboard-overview", historyFilterStatus: "pending" }),
        linkLabel: "Open pending leaves",
      },
      {
        label: "Next holiday",
        value: upcomingHolidays.length
          ? formatDate(upcomingHolidays[0].date).split(" ").slice(0, 2).join(" ")
          : "-",
        note: upcomingHolidays.length ? upcomingHolidays[0].name || "Upcoming holiday" : "No upcoming holidays listed",
        icon: ShieldCheck,
        action: () =>
          openSection("calendar", {
            focusYear: upcomingHolidays.length
              ? new Date(upcomingHolidays[0].date).getFullYear()
              : new Date().getFullYear(),
            focusDate: upcomingHolidays[0]?.date,
          }),
        linkLabel: "Open calendar",
      },
      {
        label: "Team view",
        value: stats.totalTeamMembers,
        note: stats.totalTeamMembers ? "Direct reportees visible" : "Individual contributor",
        icon: Users,
        action: () => setShowHierarchy(true),
        linkLabel: "Open hierarchy",
      },
    ],
    [leaveBalanceCards.length, openLeaves, openSection, stats, totalBalance, upcomingHolidays]
  );

  if (loading) {
    return (
      <div className="admin-dashboard employee-workspace">
        <div className="fiori-loading-card">
          <Clock3 size={24} />
          <div>
            <strong>Loading employee workspace</strong>
            <p>Your dashboard metrics and leave activity are being prepared.</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-dashboard employee-workspace">
        <div className="admin-empty-state">
          <ShieldCheck size={24} />
          <div>
            <strong>{error}</strong>
            <p>Please refresh the page and try again.</p>
          </div>
          <button className="fiori-button secondary" onClick={fetchEmployeeData}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard employee-workspace">
      <header className="admin-hero employee-dashboard-hero">
        <div className="employee-hero-copy">
          <div className="employee-hero-kicker-row">
            <div className="admin-section-overline">Employee workspace</div>
            <span className="employee-hero-kicker-pill">{todayLabel}</span>
          </div>
          <h1>
            <span className="employee-hero-greeting">{getTimeBasedGreeting()},</span>{" "}
            <span className="employee-hero-name">{user?.name?.split(" ")[0] || "there"}</span>
          </h1>
        </div>
      </header>

      <div className="admin-dashboard-grid admin-dashboard-grid-compact">
        {overviewCards.map((card) => {
          const Icon = card.icon;

          return (
            <article
              key={card.label}
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
                <span className="fiori-stat-label">{card.label}</span>
                <Icon size={18} />
              </div>
              <div className="fiori-stat-value">{card.value}</div>
              <div className="fiori-stat-note">{card.note}</div>
              <div className="fiori-inline-link">{card.linkLabel}</div>
            </article>
          );
        })}
      </div>

      <div className="employee-dashboard-layout employee-dashboard-layout-wide">
        <div className="employee-dashboard-primary">
          <section className="fiori-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Leave analytics</h3>
                <p>Use the charts to jump into the exact leave records behind the trend.</p>
              </div>
            </div>

            <div className="employee-analytics-grid">
              <article
                className="fiori-stat-card fiori-chart-card"
                onClick={() => openLeaves({ source: "dashboard-chart" })}
              >
                <div className="fiori-stat-topline">
                  <span className="fiori-stat-label">Monthly leave trend</span>
                  <ChartColumn size={18} />
                </div>
                <div className="fiori-chart-shell employee-chart-shell">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyLeaveData}>
                      <XAxis dataKey="month" axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="applied" fill="#0a6ed1" radius={[8, 8, 0, 0]} name="Applied" />
                      <Bar dataKey="approved" fill="#188918" radius={[8, 8, 0, 0]} name="Approved" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="fiori-card-link">Open leave history</div>
              </article>

              <article
                className="fiori-stat-card fiori-chart-card"
                onClick={() => openLeaves({ source: "dashboard-chart", historyFilterStatus: "approved" })}
              >
                <div className="fiori-stat-topline">
                  <span className="fiori-stat-label">Approval breakdown</span>
                  <PieChartIcon size={18} />
                </div>
                <div className="fiori-chart-shell employee-chart-shell">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusChartData.filter((item) => item.value > 0)}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={84}
                        paddingAngle={3}
                      >
                        {statusChartData
                          .filter((item) => item.value > 0)
                          .map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="employee-chart-legend">
                  {statusChartData.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      className="employee-chart-legend-item"
                      onClick={(event) => {
                        event.stopPropagation();
                        openLeaves({
                          source: "dashboard-chart",
                          historyFilterStatus: item.filterStatus,
                        });
                      }}
                    >
                      <i style={{ backgroundColor: item.fill }} />
                      <span>{item.name}</span>
                      <strong>{item.value}</strong>
                    </button>
                  ))}
                </div>
              </article>
            </div>
          </section>

          <section className="fiori-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Leave balance snapshot</h3>
                <p>Each balance card is clickable and opens the matching filtered leave list.</p>
              </div>
            </div>

            <div className="admin-dashboard-grid admin-dashboard-grid-compact">
              {leaveBalanceCards.map((card) => (
                <article
                  key={card.label}
                  className="fiori-stat-card is-actionable employee-balance-card"
                  onClick={() => openLeaves(card.payload)}
                >
                  <div className="fiori-stat-label">{card.label}</div>
                  <div className="fiori-stat-value">{card.value}</div>
                  <div className="fiori-stat-note">{card.note}</div>
                </article>
              ))}
            </div>
          </section>

          <section className="fiori-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Recent leave activity</h3>
                <p>Open any request directly in the leave workspace.</p>
              </div>
              <button className="fiori-button secondary" onClick={() => openLeaves()}>
                View all
              </button>
            </div>

            {recentLeaves.length === 0 ? (
              <div className="admin-empty-state">
                <CalendarDays size={24} />
                <div>
                  <strong>No leave applications yet</strong>
                  <p>Your requests will start appearing here once you submit them.</p>
                </div>
              </div>
            ) : (
              <div className="employee-recent-leave-list employee-recent-leave-grid">
                {recentLeaves.map((leave) => (
                  <article
                    key={leave._id}
                    className="employee-recent-leave-card is-clickable"
                    onClick={() =>
                      openLeaves({
                        source: "dashboard-recent",
                        focusDate: leave.start_date,
                        historyFilterStatus: leave.status?.toLowerCase(),
                      })
                    }
                  >
                    <div className="admin-approval-card-header">
                      <div>
                        <h4>{leave.leave_type || "Leave request"}</h4>
                        <p>
                          {formatDate(leave.start_date)} to {formatDate(leave.end_date)}
                        </p>
                      </div>
                      <span className={`fiori-status-pill ${statusToneMap[leave.status] || "is-neutral"}`}>
                        {leave.status || "Pending"}
                      </span>
                    </div>

                    <div className="admin-approval-metadata">
                      <span>{leave.days || 0} day(s)</span>
                      <span>Applied {formatDate(leave.applied_on)}</span>
                      {leave.is_half_day ? <span>Half day: {leave.half_day_period || "Selected"}</span> : null}
                    </div>

                    <div className="admin-approval-details">
                      <div className="is-wide">
                        <span>Reason</span>
                        <strong>{leave.reason || "No reason shared"}</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="employee-dashboard-secondary">
          <section className="fiori-panel is-clickable" onClick={() => setShowHierarchy(true)}>
            <div className="fiori-panel-header">
              <div>
                <h3>Reporting line</h3>
                <p>Open your organization hierarchy and reporting structure.</p>
              </div>
              <GitBranch size={18} color="#0a6ed1" />
            </div>

            {managerInfo ? (
              <div className="employee-manager-card">
                <div className="employee-manager-avatar">
                  <span>{managerInfo.name?.charAt(0) || "M"}</span>
                  <div className="employee-manager-dot">
                    <LeaveStatusDot userId={managerInfo._id} size={14} />
                  </div>
                </div>
                <div className="employee-manager-copy">
                  <strong>{managerInfo.name || "Reporting manager"}</strong>
                  <span>{managerInfo.designation || "Designation not set"}</span>
                  <small>{managerInfo.email || "Email unavailable"}</small>
                </div>
              </div>
            ) : (
              <div className="admin-empty-state">
                <UserRound size={22} />
                <div>
                  <strong>No reporting manager assigned</strong>
                  <p>You can still open the organization hierarchy from here.</p>
                </div>
              </div>
            )}
          </section>

          <section className="fiori-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Upcoming approved leave</h3>
                <p>Jump from upcoming approved dates into the calendar or leave list.</p>
              </div>
            </div>

            {approvedUpcomingLeaves.length === 0 ? (
              <div className="admin-empty-state">
                <ShieldCheck size={22} />
                <div>
                  <strong>No upcoming approved leave</strong>
                  <p>Approved time away will appear here as soon as it is cleared.</p>
                </div>
              </div>
            ) : (
              <div className="employee-holiday-list">
                {approvedUpcomingLeaves.map((leave) => (
                  <button
                    key={`approved-${leave._id}`}
                    type="button"
                    className="employee-quick-action"
                    onClick={() =>
                      openSection("calendar", {
                        focusYear: new Date(leave.start_date).getFullYear(),
                        focusDate: leave.start_date,
                      })
                    }
                  >
                    <div>
                      <strong>{leave.leave_type}</strong>
                      <span>
                        {formatDate(leave.start_date)} to {formatDate(leave.end_date)}
                      </span>
                    </div>
                    <ArrowRight size={16} />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="fiori-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Upcoming holidays</h3>
                <p>Closest company and optional holidays relevant to your planning.</p>
              </div>
            </div>

            {upcomingHolidays.length === 0 ? (
              <div className="admin-empty-state">
                <CalendarDays size={22} />
                <div>
                  <strong>No upcoming holidays listed</strong>
                  <p>The holiday calendar has no future entries at the moment.</p>
                </div>
              </div>
            ) : (
              <div className="employee-holiday-list">
                {upcomingHolidays.map((holiday) => (
                  <article
                    key={`${holiday.name}-${holiday.date}`}
                    className="employee-holiday-card is-clickable"
                    onClick={() =>
                      openSection("calendar", {
                        focusYear: new Date(holiday.date).getFullYear(),
                        focusDate: holiday.date,
                      })
                    }
                  >
                    <div>
                      <strong>{holiday.name || "Holiday"}</strong>
                      <span>{formatDate(holiday.date)}</span>
                    </div>
                    <span className="fiori-status-pill is-neutral">{holiday.type || "Holiday"}</span>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="fiori-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Quick actions</h3>
                <p>Navigate straight to the places employees use most.</p>
              </div>
            </div>

            <div className="employee-quick-action-list">
              <button className="employee-quick-action" onClick={() => openLeaves()}>
                <div>
                  <strong>Submit or manage leave</strong>
                  <span>Open your leave form, history, and approvals.</span>
                </div>
                <ArrowRight size={16} />
              </button>
              <button
                className="employee-quick-action"
                onClick={() => openSection("calendar", { focusYear: new Date().getFullYear() })}
              >
                <div>
                  <strong>Check calendar</strong>
                  <span>Review holidays and approved leave dates in the yearly view.</span>
                </div>
                <ArrowRight size={16} />
              </button>
              <button
                className="employee-quick-action"
                onClick={() => openLeaves({ historyFilterStatus: "approved" })}
              >
                <div>
                  <strong>See approved leaves</strong>
                  <span>Open the leave page filtered to approved requests.</span>
                </div>
                <ArrowRight size={16} />
              </button>
            </div>
          </section>

          {leaveTypeData.length > 0 ? (
            <section className="fiori-panel">
              <div className="fiori-panel-header">
                <div>
                  <h3>Leave type split</h3>
                  <p>Breakdown of the leave categories used in your recent requests.</p>
                </div>
              </div>

              <div className="employee-mini-chart">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={leaveTypeData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={36}
                      outerRadius={64}
                      paddingAngle={2}
                    >
                      {leaveTypeData.map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="employee-chart-legend employee-chart-legend-compact">
                {leaveTypeData.map((item) => (
                  <button
                    key={item.name}
                    type="button"
                    className="employee-chart-legend-item"
                    onClick={() =>
                      openLeaves({
                        source: "dashboard-type",
                        historyFilterType: item.name.toLowerCase(),
                      })
                    }
                  >
                    <i style={{ backgroundColor: item.fill }} />
                    <span>{item.name}</span>
                    <strong>{item.value}</strong>
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      {showHierarchy ? (
        <OrganizationHierarchy user={user} onClose={() => setShowHierarchy(false)} />
      ) : null}
    </div>
  );
};

export default EmployeeDashboard;
