// src/components/ManagerLeaves.js
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Send,
  ShieldAlert,
  Users,
  XCircle,
} from "lucide-react";
import ValueHelpSelect from "./ValueHelpSelect";
import ValueHelpSearch from "./ValueHelpSearch";

const statusToneMap = {
  Approved: "is-approved",
  Rejected: "is-rejected",
  Cancelled: "is-neutral",
  Pending: "is-pending",
};

const buildSearchSuggestions = (items) => {
  const seen = new Set();
  return items.flatMap((item) =>
    [item.employee_name, item.employee_email, item.employee_designation, item.employee_department]
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

const ManagerLeaves = ({ user }) => {
  const [activeTab, setActiveTab] = useState("pending");
  const [pendingLeaves, setPendingLeaves] = useState([]);
  const [myBalance, setMyBalance] = useState(null);
  const [myHistory, setMyHistory] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [rejectModal, setRejectModal] = useState({ show: false, leaveId: null, reason: "" });
  const [leave, setLeave] = useState({
    leave_type: "Casual",
    start_date: "",
    end_date: "",
    reason: "",
    logout_time: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  const handleCardKeyDown = (event, action) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  };

  const getMinDate = () => {
    const today = new Date();

    if (leave.leave_type === "Planned") {
      const minDate = new Date(today);
      minDate.setDate(today.getDate() + 7);
      return minDate.toISOString().split("T")[0];
    }

    if (leave.leave_type === "Early Logout") {
      return today.toISOString().split("T")[0];
    }

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow.toISOString().split("T")[0];
  };

  const fetchPendingLeaves = async () => {
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/leaves/pending/${encodeURIComponent(user.email)}`
      );
      setPendingLeaves(res.data || []);
    } catch (err) {
      console.error("Error fetching pending leaves:", err);
    }
  };

  const fetchMyLeaveData = async () => {
    try {
      const balanceRes = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/balance/${user.id}`);
      setMyBalance(balanceRes.data);

      const historyRes = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/history/${user.id}`);
      setMyHistory(historyRes.data || []);
    } catch (err) {
      console.error("Error fetching my leave data:", err);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/get_employees_by_manager/${encodeURIComponent(user.email)}`
      );
      setTeamMembers(res.data || []);
    } catch (err) {
      console.error("Error fetching team members:", err);
    }
  };

  useEffect(() => {
    if (user?.email && user?.id) {
      fetchPendingLeaves();
      fetchMyLeaveData();
      fetchTeamMembers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const applyLeave = async () => {
    if (!leave.start_date || !leave.end_date) {
      setMessage("Please select start and end dates");
      return;
    }

    if (leave.leave_type === "Early Logout" && !leave.logout_time) {
      setMessage("Logout time is mandatory for early logout");
      setTimeout(() => setMessage(""), 5000);
      return;
    }

    try {
      setLoading(true);
      const res = await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/apply`, {
        employee_id: user.id,
        leave_type: leave.leave_type,
        start_date: leave.start_date,
        end_date: leave.end_date,
        reason: leave.reason,
        logout_time: leave.logout_time || "",
      });

      if (res.status === 201) {
        setMessage("Leave applied successfully");
        setLeave({ leave_type: "Casual", start_date: "", end_date: "", reason: "", logout_time: "" });
        fetchMyLeaveData();
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (err) {
      console.error(err);
      setMessage(`Error: ${err.response?.data?.error || "Failed to apply leave"}`);
      setTimeout(() => setMessage(""), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = (leaveId) => {
    setRejectModal({ show: true, leaveId, reason: "" });
  };

  const confirmReject = async () => {
    if (!rejectModal.reason.trim()) {
      setMessage("Please enter a rejection reason");
      return;
    }
    await updateStatus(rejectModal.leaveId, "Rejected", rejectModal.reason);
  };

  const updateStatus = async (leaveId, status, rejectionReason = "") => {
    try {
      const payload = {
        status,
        approved_by: user.name || user.email,
      };

      if (status === "Rejected" && rejectionReason.trim()) {
        payload.rejection_reason = rejectionReason;
      }

      const res = await axios.put(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/update_status/${leaveId}`, payload);

      if (res.status === 200) {
        setMessage(`Leave ${status.toLowerCase()} successfully`);
        setRejectModal({ show: false, leaveId: null, reason: "" });
        fetchPendingLeaves();
        fetchTeamMembers();
        setTimeout(() => setMessage(""), 3000);
      }
    } catch (err) {
      console.error(err);
      setMessage("Error updating leave status");
      setTimeout(() => setMessage(""), 3000);
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    try {
      const dateValue = typeof dateStr === "object" && dateStr.$date ? dateStr.$date : dateStr;
      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return "N/A";
      return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "N/A";
    }
  };

  const isBirthdayLeave = (leaveRecord) => {
    if (!leaveRecord.employee_dateOfBirth) return false;
    try {
      const dob = new Date(leaveRecord.employee_dateOfBirth);
      const start = new Date(leaveRecord.start_date);
      return dob.getMonth() === start.getMonth() && dob.getDate() === start.getDate();
    } catch {
      return false;
    }
  };

  const displayLeaves = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filtered = normalizedSearch
      ? pendingLeaves.filter((leaveRecord) =>
          [
            leaveRecord.employee_name,
            leaveRecord.employee_email,
            leaveRecord.employee_designation,
            leaveRecord.employee_department,
          ]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(normalizedSearch))
        )
      : pendingLeaves;

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.applied_on) - new Date(b.applied_on);
        case "name":
          return (a.employee_name || "").localeCompare(b.employee_name || "");
        case "department":
          return (a.employee_department || "").localeCompare(b.employee_department || "");
        case "newest":
        default:
          return new Date(b.applied_on) - new Date(a.applied_on);
      }
    });
  }, [pendingLeaves, searchTerm, sortBy]);
  const searchSuggestions = useMemo(() => buildSearchSuggestions(pendingLeaves), [pendingLeaves]);

  const totalMyBalance = myBalance ? (myBalance.sick || 0) + (myBalance.planned || 0) : 0;
  const approvedHistory = myHistory.filter((item) => item.status === "Approved").length;
  const rejectedHistory = myHistory.filter((item) => item.status === "Rejected").length;

  const balanceCards = myBalance
    ? [
        { label: "Sick leave", value: myBalance.sick || 0, note: `${myBalance.sickTotal || 6} allocated` },
        { label: "Planned leave", value: myBalance.planned || 0, note: `${myBalance.plannedTotal || 12} allocated` },
        { label: "Optional leave", value: myBalance.optional || 0, note: `${myBalance.optionalTotal || 2} allocated` },
        { label: "LOP used", value: myBalance.lwp || 0, note: "Unpaid leave recorded" },
      ]
    : [];

  return (
    <div className="admin-dashboard leave-workspace manager-leave-workspace">
      <header className="admin-hero">
        <div>
          <div className="admin-section-overline">Manager leave workspace</div>
          <h1>Leave Management</h1>
          <p>Review team approvals, submit your own leave requests, and monitor direct report balances from one consistent workspace.</p>
        </div>

        <div className="admin-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Approval queue</span>
            <strong>{pendingLeaves.length} requests awaiting review</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>My balance</span>
            <strong>{totalMyBalance} days available</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Team size</span>
            <strong>{teamMembers.length} direct reports</strong>
          </div>
        </div>
      </header>

      <div className="admin-dashboard-grid admin-dashboard-grid-compact">
        <article
          className="fiori-stat-card is-actionable"
          onClick={() => setActiveTab("pending")}
          onKeyDown={(event) => handleCardKeyDown(event, () => setActiveTab("pending"))}
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Pending approvals</span>
            <ShieldAlert size={18} />
          </div>
          <div className="fiori-stat-value">{pendingLeaves.length}</div>
          <div className="fiori-stat-note">Requests currently assigned to you</div>
          <div className="fiori-inline-link">Open approval queue</div>
        </article>
        <article
          className="fiori-stat-card is-actionable"
          onClick={() => setActiveTab("myLeaves")}
          onKeyDown={(event) => handleCardKeyDown(event, () => setActiveTab("myLeaves"))}
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">My balance</span>
            <CalendarClock size={18} />
          </div>
          <div className="fiori-stat-value">{totalMyBalance}</div>
          <div className="fiori-stat-note">Sick and planned leave days available</div>
          <div className="fiori-inline-link">Open my leaves</div>
        </article>
        <article
          className="fiori-stat-card is-actionable"
          onClick={() => setActiveTab("myLeaves")}
          onKeyDown={(event) => handleCardKeyDown(event, () => setActiveTab("myLeaves"))}
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">My approvals</span>
            <CheckCircle2 size={18} />
          </div>
          <div className="fiori-stat-value">{approvedHistory}</div>
          <div className="fiori-stat-note">{rejectedHistory} rejected requests in your history</div>
          <div className="fiori-inline-link">Open my history</div>
        </article>
        <article
          className="fiori-stat-card is-actionable"
          onClick={() => setActiveTab("teamBalance")}
          onKeyDown={(event) => handleCardKeyDown(event, () => setActiveTab("teamBalance"))}
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Team members</span>
            <Users size={18} />
          </div>
          <div className="fiori-stat-value">{teamMembers.length}</div>
          <div className="fiori-stat-note">Direct reports with leave balances</div>
          <div className="fiori-inline-link">Open team balance</div>
        </article>
      </div>

      <section className="fiori-panel">
        <div className="leave-tab-strip" role="tablist" aria-label="Manager leave tabs">
          {[
            { id: "pending", label: `Pending Approvals (${pendingLeaves.length})` },
            { id: "myLeaves", label: `My Leaves (${myHistory.length})` },
            { id: "teamBalance", label: `Team Balance (${teamMembers.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`leave-tab-button ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {message ? <div className={`admin-toast ${message.includes("Error") ? "error" : "success"}`}>{message}</div> : null}

      {activeTab === "pending" ? (
        <section className="fiori-panel">
          <div className="fiori-panel-header">
            <div>
              <h3>Approval queue</h3>
              <p>Filter direct report requests and take approval action with full request context.</p>
            </div>
            <span className="fiori-status-pill is-pending">{displayLeaves.length} visible</span>
          </div>

          <div className="leave-filter-grid leave-filter-grid-compact manager-filter-grid">
            <label className="fiori-form-field">
              <span className="leave-field-label">Search</span>
              <ValueHelpSearch
                value={searchTerm}
                onChange={setSearchTerm}
                suggestions={searchSuggestions}
                placeholder="Search by employee, email, designation, or department"
              />
            </label>
            <label className="fiori-form-field">
              <span className="leave-field-label">Sort</span>
              <ValueHelpSelect
                value={sortBy}
                onChange={setSortBy}
                searchPlaceholder="Search sort options"
                options={[
                  { value: "newest", label: "Newest first" },
                  { value: "oldest", label: "Oldest first" },
                  { value: "name", label: "Name A-Z" },
                  { value: "department", label: "Department A-Z" },
                ]}
              />
            </label>
          </div>

          {displayLeaves.length === 0 ? (
            <div className="admin-empty-state">
              <CheckCircle2 size={28} />
              <div>
                <strong>{pendingLeaves.length === 0 ? "All caught up" : "No matching requests"}</strong>
                <p>{pendingLeaves.length === 0 ? "No pending leave requests are assigned to you." : "Adjust the search or sort options."}</p>
              </div>
            </div>
          ) : (
            <div className="fiori-table-shell">
              <table className="fiori-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Leave</th>
                    <th>Dates</th>
                    <th>Applied</th>
                    <th>Reason</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayLeaves.map((leaveRecord) => (
                    <tr key={leaveRecord._id}>
                      <td>
                        <div className="fiori-primary-cell">
                          <strong>{leaveRecord.employee_name || "Unknown employee"}</strong>
                          <span>
                            {leaveRecord.employee_designation || "Designation unavailable"} ·{" "}
                            {leaveRecord.employee_department || "Department unavailable"}
                          </span>
                          <span>{leaveRecord.employee_email || "Email unavailable"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="fiori-primary-cell">
                          <strong>{leaveRecord.leave_type} leave</strong>
                          <span>
                            {leaveRecord.days || 0} {leaveRecord.days === 1 ? "day" : "days"}
                          </span>
                          {isBirthdayLeave(leaveRecord) ? (
                            <span className="fiori-status-pill is-neutral">Birthday leave</span>
                          ) : null}
                        </div>
                      </td>
                      <td>{formatDate(leaveRecord.start_date)} to {formatDate(leaveRecord.end_date)}</td>
                      <td>
                        <div className="fiori-primary-cell">
                          <span>{formatDate(leaveRecord.applied_on)}</span>
                          <span>{leaveRecord.logout_time || "No logout time"}</span>
                        </div>
                      </td>
                      <td>{leaveRecord.reason || "No reason provided"}</td>
                      <td>
                        <div className="employee-table-actions">
                          <button className="fiori-button primary" onClick={() => updateStatus(leaveRecord._id, "Approved")}>
                            <CheckCircle2 size={16} />
                            Approve
                          </button>
                          <button className="fiori-button secondary danger" onClick={() => handleReject(leaveRecord._id)}>
                            <XCircle size={16} />
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "myLeaves" ? (
        <>
          <div className="admin-dashboard-grid admin-dashboard-grid-compact">
            {balanceCards.map((card) => (
              <article key={card.label} className="fiori-stat-card employee-balance-card">
                <div className="fiori-stat-label">{card.label}</div>
                <div className="fiori-stat-value">{card.value}</div>
                <div className="fiori-stat-note">{card.note}</div>
              </article>
            ))}
          </div>

          <div className="manager-leave-layout">
            <section className="fiori-panel">
              <div className="fiori-panel-header">
                <div>
                  <h3>Apply for leave</h3>
                  <p>Submit your request using the same form pattern as the employee workspace.</p>
                </div>
                <span className="fiori-status-pill is-neutral">Manager request</span>
              </div>

              <div className="employee-form-grid">
                <label className="fiori-form-field">
                  <span>Leave type</span>
                  <select
                    className="input"
                    value={leave.leave_type}
                    onChange={(event) =>
                      setLeave({ ...leave, leave_type: event.target.value, start_date: "", end_date: "", logout_time: "" })
                    }
                  >
                    <option>Casual</option>
                    <option>Sick</option>
                    <option>Planned</option>
                    <option>Optional</option>
                    <option>Early Logout</option>
                    <option>Earned</option>
                    <option>LOP</option>
                  </select>
                </label>
                <label className="fiori-form-field">
                  <span>Start date</span>
                  <input
                    className="input"
                    type="date"
                    value={leave.start_date}
                    min={getMinDate()}
                    onChange={(event) => setLeave({ ...leave, start_date: event.target.value })}
                  />
                </label>
                <label className="fiori-form-field">
                  <span>End date</span>
                  <input
                    className="input"
                    type="date"
                    value={leave.end_date}
                    min={leave.start_date || getMinDate()}
                    onChange={(event) => setLeave({ ...leave, end_date: event.target.value })}
                  />
                </label>
                {leave.leave_type === "Early Logout" ? (
                  <label className="fiori-form-field">
                    <span>Logout time</span>
                    <input
                      className="input"
                      type="time"
                      value={leave.logout_time || ""}
                      onChange={(event) => setLeave({ ...leave, logout_time: event.target.value })}
                    />
                  </label>
                ) : null}
              </div>

              <label className="fiori-form-field manager-reason-field">
                <span>Reason</span>
                <input
                  className="input"
                  placeholder={leave.leave_type === "Early Logout" ? "Reason for early logout" : "Reason for leave"}
                  value={leave.reason}
                  onChange={(event) => setLeave({ ...leave, reason: event.target.value })}
                />
              </label>

              <button
                className="fiori-button primary full-width"
                onClick={applyLeave}
                disabled={loading || !leave.start_date || !leave.end_date || (leave.leave_type === "Early Logout" && !leave.logout_time)}
              >
                <Send size={16} />
                {loading ? "Submitting..." : "Apply Leave"}
              </button>
            </section>

            <section className="fiori-panel">
              <div className="fiori-panel-header">
                <div>
                  <h3>My leave history</h3>
                  <p>{myHistory.length} requests submitted from your profile.</p>
                </div>
              </div>

              {myHistory.length === 0 ? (
                <div className="admin-empty-state">
                  <ClipboardList size={28} />
                  <div>
                    <strong>No leave applications yet</strong>
                    <p>Your submitted requests will appear here.</p>
                  </div>
                </div>
              ) : (
                <div className="fiori-table-shell">
                  <table className="fiori-table">
                    <thead>
                      <tr>
                        <th>Leave</th>
                        <th>Dates</th>
                        <th>Days</th>
                        <th>Status</th>
                        <th>Applied</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myHistory.map((historyItem) => (
                        <tr key={historyItem._id}>
                          <td>
                            <div className="fiori-primary-cell">
                              <strong>{historyItem.leave_type} Leave</strong>
                              <span>{historyItem.reason || "No reason provided"}</span>
                            </div>
                          </td>
                          <td>
                            {formatDate(historyItem.start_date)} to {formatDate(historyItem.end_date)}
                          </td>
                          <td>{historyItem.days || 0}</td>
                          <td>
                            <span className={`fiori-status-pill ${statusToneMap[historyItem.status] || "is-neutral"}`}>
                              {historyItem.status || "Pending"}
                            </span>
                          </td>
                          <td>{formatDate(historyItem.applied_on)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}

      {activeTab === "teamBalance" ? (
        <section className="fiori-panel">
          <div className="fiori-panel-header">
            <div>
              <h3>Team balance</h3>
              <p>Direct report balances shown in the same compact card format as the other leave views.</p>
            </div>
          </div>

          {teamMembers.length === 0 ? (
            <div className="admin-empty-state">
              <Users size={28} />
              <div>
                <strong>No team members</strong>
                <p>Your direct reports will appear here once assigned.</p>
              </div>
            </div>
          ) : (
            <div className="fiori-table-shell">
              <table className="fiori-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Sick</th>
                    <th>Planned</th>
                    <th>Optional</th>
                    <th>LOP</th>
                  </tr>
                </thead>
                <tbody>
                  {teamMembers.map((member) => (
                    <tr key={member._id}>
                      <td>
                        <div className="fiori-primary-cell">
                          <strong>{member.name || "Unknown employee"}</strong>
                          <span>{member.designation || "Designation unavailable"}</span>
                          <span>{member.email || "Email unavailable"}</span>
                        </div>
                      </td>
                      <td>
                        {member.leaveBalance
                          ? `${member.leaveBalance.sick || 0} / ${member.leaveBalance.sickTotal || 6}`
                          : "Unavailable"}
                      </td>
                      <td>
                        {member.leaveBalance
                          ? `${member.leaveBalance.planned || 0} / ${member.leaveBalance.plannedTotal || 12}`
                          : "Unavailable"}
                      </td>
                      <td>
                        {member.leaveBalance
                          ? `${member.leaveBalance.optional || 0} / ${member.leaveBalance.optionalTotal || 2}`
                          : "Unavailable"}
                      </td>
                      <td>{member.leaveBalance ? member.leaveBalance.lwp || 0 : "Unavailable"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {rejectModal.show ? (
        <div className="admin-modal-overlay" onClick={() => setRejectModal({ show: false, leaveId: null, reason: "" })}>
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-section-overline">Approval action</div>
                <h2>Reject leave request</h2>
                <p>Please provide a detailed rejection reason.</p>
              </div>
            </div>
            <textarea
              className="input manager-reject-textarea"
              placeholder="Enter detailed rejection reason"
              value={rejectModal.reason}
              onChange={(event) => setRejectModal({ ...rejectModal, reason: event.target.value })}
              rows={5}
              autoFocus
            />
            <div className="admin-modal-actions">
              <button className="fiori-button secondary" onClick={() => setRejectModal({ show: false, leaveId: null, reason: "" })}>
                Cancel
              </button>
              <button className="fiori-button danger" onClick={confirmReject} disabled={!rejectModal.reason.trim()}>
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default ManagerLeaves;
