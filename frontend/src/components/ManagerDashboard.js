// src/components/ManagerDashboard.js
import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Clock3,
  GitBranch,
  ShieldCheck,
  UserCheck,
  Users,
} from "lucide-react";
import OrganizationHierarchy from "./OrganizationHierarchy";
import LeaveStatusDot from "./LeaveStatusDot";

const statusToneMap = {
  Approved: "is-approved",
  Rejected: "is-rejected",
  Cancelled: "is-neutral",
  Pending: "is-pending",
};

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
  const [expandedLeave, setExpandedLeave] = useState(null);
  const [rejectModal, setRejectModal] = useState({ show: false, leaveId: null, reason: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [showHierarchy, setShowHierarchy] = useState(false);

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
      const teamIds = team.map((member) => member._id);
      const teamLeaves = allLeaves.filter((leave) => teamIds.includes(leave.employee_id));

      const recent = teamLeaves
        .filter((leave) => leave.status !== "Pending")
        .sort((a, b) => {
          const dateA = a.approved_on || a.rejected_on || a.applied_on;
          const dateB = b.approved_on || b.rejected_on || b.applied_on;
          return new Date(dateB) - new Date(dateA);
        })
        .slice(0, 6);
      setRecentActions(recent);

      const today = new Date().toISOString().split("T")[0];
      const onLeaveToday = teamLeaves.filter((leave) => {
        if (leave.status !== "Approved") return false;
        return leave.start_date <= today && leave.end_date >= today;
      });

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
        linkLabel: "Open leave workspace",
        action: () => handleNavigate("leaves"),
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
        payload
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
      <header className="admin-hero">
        <div>
          <div className="admin-section-overline">Manager workspace</div>
          <h1>
            {getTimeBasedGreeting()}, {user?.name?.split(" ")[0] || "Manager"}
          </h1>
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
        </div>
      </header>

      <div className="admin-dashboard-grid">
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
