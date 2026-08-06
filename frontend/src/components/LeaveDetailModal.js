import React from "react";
import { X, Calendar, Clock, User, FileText, CheckCircle2, XCircle, AlertCircle, RotateCcw } from "lucide-react";
import { formatDateIST, formatDateTimeIST } from "../utils/dateTime";

export default function LeaveDetailModal({ leave, onClose, onApprove, onReject, isAdminOrManager = false }) {
  if (!leave) return null;

  const formatDate = (dateStr) => formatDateIST(dateStr);
  const formatDateTime = (dateStr) => formatDateTimeIST(dateStr);

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case "Approved": return "is-approved";
      case "Rejected": return "is-rejected";
      case "Cancelled": return "is-neutral";
      case "Pending": return "is-pending";
      default: return "";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "Approved": return <CheckCircle2 size={16} style={{ color: '#16a34a' }} />;
      case "Rejected": return <XCircle size={16} style={{ color: '#dc2626' }} />;
      case "Cancelled": return <RotateCcw size={16} style={{ color: '#64748b' }} />;
      case "Pending": return <Clock size={16} style={{ color: '#d97706' }} />;
      default: return <AlertCircle size={16} />;
    }
  };

  const startDate = leave.start_date || leave.startDate || leave.approved_start_date;
  const endDate = leave.end_date || leave.endDate || leave.approved_end_date;
  const leaveType = leave.leave_type || leave.leaveType || leave.code || "Leave";
  const days = leave.days || leave.number_of_days || leave.duration || 1;
  const reason = leave.reason || leave.comments || leave.description || "No reason provided";
  const employeeName = leave.employee_name || leave.employeeName || leave.userName || leave.name || "Employee";
  const employeeId = leave.employee_id || leave.employeeId || leave.empId || "";
  const department = leave.department || leave.dept || "";
  const appliedOn = leave.applied_on || leave.appliedOn || leave.created_at;
  const approvedBy = leave.approved_by || leave.approvedBy || leave.manager_name;
  const rejectionReason = leave.rejection_reason || leave.rejectionReason || leave.admin_comments;

  return (
    <div className="leave-detail-overlay" onClick={onClose}>
      <div className="leave-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="leave-detail-header">
          <div className="leave-detail-header-left">
            <span className={`leave-detail-status-pill ${getStatusBadgeClass(leave.status)}`}>
              {getStatusIcon(leave.status)}
              <span>{leave.status || "Pending"}</span>
            </span>
            <h2 className="leave-detail-title">{leaveType}</h2>
          </div>
          <button type="button" className="leave-detail-close-btn" onClick={onClose} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        <div className="leave-detail-body">
          {(employeeName || employeeId || department) && (
            <div className="leave-detail-section">
              <span className="leave-detail-label">Employee Details</span>
              <div className="leave-detail-user-card">
                <div className="leave-detail-avatar">
                  <User size={20} />
                </div>
                <div className="leave-detail-user-info">
                  <strong>{employeeName}</strong>
                  <span>
                    {employeeId ? `ID: ${employeeId}` : ""} {department ? `• ${department}` : ""}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="leave-detail-grid">
            <div className="leave-detail-card">
              <Calendar size={18} className="leave-detail-card-icon" />
              <div>
                <span className="leave-detail-card-label">Start Date</span>
                <strong>{formatDate(startDate)}</strong>
              </div>
            </div>

            <div className="leave-detail-card">
              <Calendar size={18} className="leave-detail-card-icon" />
              <div>
                <span className="leave-detail-card-label">End Date</span>
                <strong>{formatDate(endDate)}</strong>
              </div>
            </div>

            <div className="leave-detail-card">
              <Clock size={18} className="leave-detail-card-icon" />
              <div>
                <span className="leave-detail-card-label">Duration</span>
                <strong>{days} {days === 1 ? "Day" : "Days"} {leave.is_half_day ? `(${leave.half_day_period || "Half Day"})` : ""}</strong>
              </div>
            </div>

            <div className="leave-detail-card">
              <FileText size={18} className="leave-detail-card-icon" />
              <div>
                <span className="leave-detail-card-label">Leave Type</span>
                <strong>{leaveType}</strong>
              </div>
            </div>
          </div>

          <div className="leave-detail-section">
            <span className="leave-detail-label">Reason / Comments</span>
            <div className="leave-detail-reason-box">
              {reason}
            </div>
          </div>

          {rejectionReason && (
            <div className="leave-detail-section">
              <span className="leave-detail-label" style={{ color: '#dc2626' }}>Rejection Reason</span>
              <div className="leave-detail-rejection-box">
                {rejectionReason}
              </div>
            </div>
          )}

          <div className="leave-detail-meta-list">
            {appliedOn && (
              <div className="leave-detail-meta-item">
                <span>Applied On:</span>
                <strong>{formatDateTime(appliedOn)}</strong>
              </div>
            )}
            {approvedBy && (
              <div className="leave-detail-meta-item">
                <span>Actioned By:</span>
                <strong>{approvedBy}</strong>
              </div>
            )}
          </div>
        </div>

        <div className="leave-detail-footer">
          {isAdminOrManager && leave.status === "Pending" && (
            <div className="leave-detail-actions-left">
              <button
                type="button"
                className="leave-detail-btn is-approve"
                onClick={() => { onApprove?.(leave); onClose(); }}
              >
                Approve
              </button>
              <button
                type="button"
                className="leave-detail-btn is-reject"
                onClick={() => { onReject?.(leave); onClose(); }}
              >
                Reject
              </button>
            </div>
          )}
          <button type="button" className="leave-detail-btn is-close" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
