import React, { useState } from "react";

const LeaveManagement = ({ user, role }) => {
  const [employeeId, setEmployeeId] = useState("");
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [leave, setLeave] = useState({ 
    leave_type: "Casual", 
    start_date: "", 
    end_date: "", 
    reason: "" 
  });
  const [managerEmail, setManagerEmail] = useState("");
  const [pending, setPending] = useState([]);
  const [message, setMessage] = useState("");
  const [expandedLeave, setExpandedLeave] = useState(null);
  const [rejectModal, setRejectModal] = useState({ show: false, leaveId: null, reason: "" });

  const getBalance = async () => {
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/balance/${employeeId}`);
      const data = await res.json();
      setBalance(data);
      setMessage("Balance loaded successfully");
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      console.error(err);
      setMessage("Failed to fetch balance");
    }
  };

  const getHistory = async () => {
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/history/${employeeId}`);
      const data = await res.json();
      setHistory(data);
      setMessage(`Loaded ${data.length} leave records`);
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      console.error(err);
      setMessage("Failed to fetch history");
    }
  };

  const applyLeave = async () => {
    if (!employeeId) {
      setMessage("Please enter Employee ID first");
      return;
    }
    if (leave.leave_type === "Compensatory Off" && !leave.reason.trim()) {
      setMessage("Reason is mandatory for Compensatory Off");
      return;
    }
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: employeeId,
          leave_type: leave.leave_type,
          start_date: leave.start_date,
          end_date: leave.end_date,
          reason: leave.reason
        })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage("Leave applied successfully ✓");
        setLeave({ leave_type: "Casual", start_date: "", end_date: "", reason: "" });
        if (history.length > 0 || employeeId) {
          getHistory();
        }
      } else {
        setMessage("Error: " + (data.error || "failed"));
      }
    } catch (err) {
      console.error(err);
      setMessage("Network error");
    }
  };

  const getPending = async () => {
    try {
      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/pending/${encodeURIComponent(managerEmail)}`);
      const data = await res.json();
      setPending(data);
      setMessage(`Found ${data.length} pending requests`);
      setTimeout(() => setMessage(""), 2000);
    } catch (err) {
      console.error(err);
      setMessage("Failed to load pending requests");
    }
  };

  const handleReject = (leaveId) => {
    console.log("Opening reject modal for leave:", leaveId);
    setRejectModal({ show: true, leaveId, reason: "" });
  };

  const confirmReject = () => {
    if (rejectModal.leaveId && rejectModal.reason.trim()) {
      updateStatus(rejectModal.leaveId, "Rejected", rejectModal.reason);
    } else {
      setMessage("Please enter a rejection reason");
    }
  };

  const updateStatus = async (id, status, rejectionReason = "") => {
    try {
      const payload = { status };
      if (status === "Rejected") {
        if (!rejectionReason.trim()) {
          setMessage("Rejection reason is required");
          return;
        }
        payload.rejection_reason = rejectionReason;
      }

      const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/update_status/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setMessage(`Leave ${status.toLowerCase()} successfully`);
        setRejectModal({ show: false, leaveId: null, reason: "" });
        getPending();
      } else {
        setMessage(data.error || "Failed to update");
      }
    } catch (err) {
      console.error(err);
      setMessage("Network error");
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Approved": return "#10b981";
      case "Rejected": return "#ef4444";
      default: return "#f59e0b";
    }
  };

  return (
    <>
      <div className="panel">
        <h3>Leave Management</h3>

        {/* Employee Lookup Section */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 140px", gap: 12 }}>
            <input
              className="input"
              placeholder="Employee ID"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            />
            <button className="btn" onClick={getBalance}>
              Get Balance
            </button>
            <button className="btn ghost" onClick={getHistory}>
              View History
            </button>
          </div>
        </div>

        {/* Leave Balance Card */}
        {balance && (
          <div style={{ marginBottom: 20 }} className="card small">
            <div className="card-title">Leave Balance</div>
            <div style={{ marginTop: 8 }}>
              <div className="kv">
                <div>Casual Leave</div>
                <div style={{ fontWeight: 600 }}>{balance.casual}</div>
              </div>
              <div className="kv">
                <div>Sick Leave</div>
                <div style={{ fontWeight: 600 }}>{balance.sick}</div>
              </div>
              <div className="kv">
                <div>Earned Leave</div>
                <div style={{ fontWeight: 600 }}>{balance.earned}</div>
              </div>
              <div className="kv">
                <div>LWP (Leave Without Pay)</div>
                <div style={{ fontWeight: 600 }}>{balance.lwp}</div>
              </div>
            </div>
          </div>
        )}

        <hr style={{ margin: "24px 0" }} />

        {/* Apply for Leave Section */}
        <h4>Apply for Leave</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <select
            className="input"
            value={leave.leave_type}
            onChange={(e) => setLeave({ ...leave, leave_type: e.target.value })}
          >
            <option>Casual</option>
            <option>Sick</option>
            <option>Earned</option>
            <option>LWP</option>
            <option>Compensatory Off</option>
          </select>
          <input
            className="input"
            type="date"
            placeholder="Start date"
            value={leave.start_date}
            onChange={(e) => setLeave({ ...leave, start_date: e.target.value })}
          />
          <input
            className="input"
            type="date"
            placeholder="End date"
            value={leave.end_date}
            onChange={(e) => setLeave({ ...leave, end_date: e.target.value })}
          />
          <input
            className="input"
            placeholder="Reason"
            value={leave.reason}
            onChange={(e) => setLeave({ ...leave, reason: e.target.value })}
          />
        </div>
        <button className="btn" onClick={applyLeave}>
          Apply Leave
        </button>

        {/* Leave History Section */}
        {history.length > 0 && (
          <>
            <hr style={{ margin: "24px 0" }} />
            <h4>Leave History</h4>
            <div style={{ marginTop: 12 }}>
              {history.map((h) => (
                <div
                  key={h._id}
                  className="card small"
                  style={{
                    marginBottom: 10,
                    border: `1px solid ${getStatusColor(h.status)}20`,
                    background: `${getStatusColor(h.status)}08`
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <strong style={{ fontSize: 15 }}>{h.leave_type} Leave</strong>
                      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                        {h.start_date} to {h.end_date} ({h.days} {h.days === 1 ? 'day' : 'days'})
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        className="badge"
                        style={{
                          background: getStatusColor(h.status),
                          color: "white",
                          fontWeight: 600
                        }}
                      >
                        {h.status}
                      </div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        Applied: {new Date(h.applied_on).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  {h.reason && (
                    <div style={{ marginTop: 8, padding: 8, background: "white", borderRadius: 6 }}>
                      <div className="muted" style={{ fontSize: 12 }}>Reason:</div>
                      <div style={{ fontSize: 13 }}>{h.reason}</div>
                    </div>
                  )}
                  {h.rejection_reason && (
                    <div style={{ marginTop: 8, padding: 8, background: "#fef2f2", borderRadius: 6, border: "1px solid #fecaca" }}>
                      <div className="muted" style={{ fontSize: 12, color: "#ef4444" }}>Rejection Reason:</div>
                      <div style={{ fontSize: 13, color: "#dc2626" }}>{h.rejection_reason}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <hr style={{ margin: "24px 0" }} />

        {/* Manager Section */}
        <h4>Manager: Pending Approval Requests</h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12, marginBottom: 12 }}>
          <input
            className="input"
            placeholder="Manager Email"
            value={managerEmail}
            onChange={(e) => setManagerEmail(e.target.value)}
          />
          <button className="btn ghost" onClick={getPending}>
            Get Pending
          </button>
        </div>

        {pending.length === 0 && managerEmail && (
          <div className="muted">No pending requests found</div>
        )}

        {pending.map((p) => (
          <div
            key={p._id}
            className="card small"
            style={{
              marginTop: 12,
              border: "1px solid #f59e0b20",
              background: "#fffbeb"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                  {p.employee_name || "Unknown Employee"}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {p.employee_designation} • {p.employee_department}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                  {p.employee_email}
                </div>
              </div>
              <button
                className="btn ghost"
                style={{ height: 32, padding: "0 12px", fontSize: 12 }}
                onClick={() => setExpandedLeave(expandedLeave === p._id ? null : p._id)}
              >
                {expandedLeave === p._id ? "Hide Details" : "View Details"}
              </button>
            </div>

            {expandedLeave === p._id && (
              <div
                style={{
                  marginBottom: 12,
                  padding: 12,
                  background: "white",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb"
                }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div className="muted" style={{ fontSize: 12 }}>Leave Type</div>
                    <div style={{ fontWeight: 600 }}>{p.leave_type}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 12 }}>Duration</div>
                    <div style={{ fontWeight: 600 }}>{p.days} {p.days === 1 ? 'day' : 'days'}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 12 }}>Start Date</div>
                    <div>{p.start_date}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 12 }}>End Date</div>
                    <div>{p.end_date}</div>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div className="muted" style={{ fontSize: 12 }}>Applied On</div>
                    <div>{new Date(p.applied_on).toLocaleString()}</div>
                  </div>
                  {p.reason && (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div className="muted" style={{ fontSize: 12 }}>Reason</div>
                      <div style={{ marginTop: 4, fontStyle: "italic" }}>{p.reason}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn"
                style={{ flex: 1, background: "#10b981" }}
                onClick={() => updateStatus(p._id, "Approved")}
              >
                ✓ Approve
              </button>
              <button
                className="btn"
                style={{ flex: 1, background: "#ef4444", color: "white" }}
                onClick={() => handleReject(p._id)}
              >
                ✗ Reject
              </button>
            </div>
          </div>
        ))}

        {message && (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              background: "#e6f0ff",
              borderRadius: 6,
              color: "#1f6feb",
              fontSize: 14
            }}
          >
            {message}
          </div>
        )}
      </div>

      {/* Rejection Reason Modal - Moved outside panel */}
      {rejectModal.show && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999
          }}
          onClick={() => setRejectModal({ show: false, leaveId: null, reason: "" })}
        >
          <div
            style={{
              background: "white",
              padding: 32,
              borderRadius: 12,
              maxWidth: 500,
              width: "90%",
              boxShadow: "0 25px 50px rgba(0, 0, 0, 0.4)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, marginBottom: 16, color: "#ef4444" }}>
              Reject Leave Request
            </h3>
            <p className="muted" style={{ marginBottom: 16, fontSize: 14 }}>
              Please provide a reason for rejecting this leave request (mandatory):
            </p>
            <textarea
              className="input"
              placeholder="Enter detailed rejection reason..."
              value={rejectModal.reason}
              onChange={(e) => setRejectModal({ ...rejectModal, reason: e.target.value })}
              rows={5}
              style={{
                width: "100%",
                resize: "vertical",
                fontFamily: "inherit",
                marginBottom: 20,
                padding: 12,
                fontSize: 14,
                border: "2px solid #e5e7eb",
                borderRadius: 8
              }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button
                className="btn ghost"
                onClick={() => setRejectModal({ show: false, leaveId: null, reason: "" })}
                style={{ minWidth: 100 }}
              >
                Cancel
              </button>
              <button
                className="btn"
                style={{ 
                  background: rejectModal.reason.trim() ? "#ef4444" : "#cbd5e1", 
                  color: "white",
                  minWidth: 150,
                  cursor: rejectModal.reason.trim() ? "pointer" : "not-allowed"
                }}
                onClick={confirmReject}
                disabled={!rejectModal.reason.trim()}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LeaveManagement;
