import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  CalendarDays,
  ClipboardPenLine,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { buildRequesterHeaders } from "../utils/requester";

const handleCardKeyDown = (event, action) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
};

const AdminApplyLeave = ({ user }) => {
  const requesterHeaders = useMemo(() => buildRequesterHeaders(user), [user]);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [employeeBalance, setEmployeeBalance] = useState(null);
  const [leave, setLeave] = useState({
    leave_type: "Sick",
    start_date: "",
    end_date: "",
    reason: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [employeeLoading, setEmployeeLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchEmployees = useCallback(async () => {
    try {
      setEmployeeLoading(true);
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/get_all_employees`,
        { headers: requesterHeaders }
      );
      setEmployees(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error fetching employees:", error);
      setMessage("Failed to load employees");
    } finally {
      setEmployeeLoading(false);
    }
  }, [requesterHeaders]);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const fetchEmployeeBalance = async (employeeId) => {
    if (!employeeId) {
      setEmployeeBalance(null);
      return;
    }

    try {
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/leaves/balance/${employeeId}`,
        { headers: requesterHeaders }
      );
      setEmployeeBalance(response.data);
    } catch (error) {
      console.error("Error fetching balance:", error);
      setEmployeeBalance(null);
    }
  };

  const showToast = (nextMessage) => {
    setMessage(nextMessage);
    window.setTimeout(() => setMessage(""), 3500);
  };

  const handleEmployeeSelect = (employeeId) => {
    setSelectedEmployee(employeeId);
    fetchEmployeeBalance(employeeId);
    setMessage("");
  };

  const applyLeave = async () => {
    if (!selectedEmployee) {
      showToast("Please select an employee");
      return;
    }

    if (!leave.start_date || !leave.end_date) {
      showToast("Please select start and end dates");
      return;
    }

    if (leave.leave_type === "Planned") {
      const today = new Date();
      const startDate = new Date(leave.start_date);
      const daysDifference = Math.ceil((startDate - today) / (1000 * 60 * 60 * 24));

      if (daysDifference < 7) {
        showToast("Planned leave is usually submitted at least 7 days in advance");
      }
    }

    try {
      setLoading(true);
      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL}/api/leaves/apply`,
        {
          employee_id: selectedEmployee,
          leave_type: leave.leave_type,
          start_date: leave.start_date,
          end_date: leave.end_date,
          reason: leave.reason || `Applied by ${user.name} (${user.role})`,
        },
        { headers: requesterHeaders }
      );

      if (response.status === 201) {
        setLeave({ leave_type: "Sick", start_date: "", end_date: "", reason: "" });
        fetchEmployeeBalance(selectedEmployee);
        showToast("Leave applied successfully for the employee");
      }
    } catch (error) {
      console.error("Error applying leave:", error);
      showToast(error.response?.data?.error || "Failed to apply leave");
    } finally {
      setLoading(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    const normalizedSearch = searchTerm.toLowerCase();

    return employees.filter(
      (employee) =>
        employee.name?.toLowerCase().includes(normalizedSearch) ||
        employee.email?.toLowerCase().includes(normalizedSearch) ||
        employee.designation?.toLowerCase().includes(normalizedSearch) ||
        employee.department?.toLowerCase().includes(normalizedSearch)
    );
  }, [employees, searchTerm]);

  const selectedEmpData = employees.find((employee) => employee._id === selectedEmployee);

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const balanceCards = selectedEmpData && employeeBalance
    ? [
        {
          label: "Sick Balance",
          value: employeeBalance.sick ?? 0,
          note: `Total ${employeeBalance.sickTotal || 6}`,
        },
        {
          label: "Planned Balance",
          value: employeeBalance.planned ?? 0,
          note: `Total ${employeeBalance.plannedTotal || 12}`,
        },
      ]
    : [];
  return (
    <section className="apply-behalf-workspace">
      <header className="admin-hero">
        <div className="admin-hero-copy">
          <div className="admin-section-overline">Leave Action</div>
          <h1>Apply on Behalf</h1>
          <p>
            Create leave for an employee with balance and profile context close to the form.
          </p>
        </div>

        <div className="admin-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Primary View</span>
            <strong>Employee-led leave entry</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Built For</span>
            <strong>Assisted submissions</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Submitted by</span>
            <strong>{user?.role || "Admin"}</strong>
          </div>
        </div>
      </header>

      <section className="apply-behalf-summary">
        <article
          className="fiori-stat-card is-actionable"
          onClick={() => scrollToSection("apply-behalf-employee-list")}
          onKeyDown={(event) =>
            handleCardKeyDown(event, () => scrollToSection("apply-behalf-employee-list"))
          }
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Employee Scope</span>
            <Users size={18} />
          </div>
          <div className="fiori-stat-value">{employees.length}</div>
          <div className="fiori-stat-note">Employees available for admin leave actions</div>
        </article>

        <article
          className="fiori-stat-card is-actionable"
          onClick={() => scrollToSection("apply-behalf-employee-context")}
          onKeyDown={(event) =>
            handleCardKeyDown(event, () => scrollToSection("apply-behalf-employee-context"))
          }
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Selected Employee</span>
            <UserRound size={18} />
          </div>
          <div className="fiori-stat-value apply-behalf-stat-text">
            {selectedEmpData?.name || "None"}
          </div>
          <div className="fiori-stat-note">
            {selectedEmpData?.designation || "Choose an employee to continue"}
          </div>
        </article>

        <article
          className="fiori-stat-card is-actionable"
          onClick={() => scrollToSection("apply-behalf-leave-form")}
          onKeyDown={(event) =>
            handleCardKeyDown(event, () => scrollToSection("apply-behalf-leave-form"))
          }
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Approval Path</span>
            <ShieldCheck size={18} />
          </div>
          <div className="fiori-stat-value apply-behalf-stat-text">Auto Approved</div>
          <div className="fiori-stat-note">Requests created from this workflow are approved immediately</div>
        </article>
      </section>

      <div className="apply-behalf-layout">
        <section className="fiori-panel" id="apply-behalf-employee-list">
          <div className="fiori-panel-header">
            <div>
              <h3>Select Employee</h3>
              <p>Search by employee name, email, designation, or department</p>
            </div>
          </div>

          <label className="employee-filter-field employee-filter-search">
            <span>Search</span>
            <div className="employee-filter-input-shell">
              <Search size={16} />
              <input
                className="input"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search employees"
              />
            </div>
          </label>

          {employeeLoading ? (
            <div className="fiori-loading-card apply-behalf-loading">
              <Users size={24} />
              <div>
                <strong>Loading employee directory</strong>
                <p>Preparing employees for leave-on-behalf actions.</p>
              </div>
            </div>
          ) : filteredEmployees.length === 0 ? (
            <div className="admin-empty-state apply-behalf-empty">
              <UserRound size={24} />
              <div>
                <strong>No employees match the current search</strong>
                <p>Try a broader name, email, designation, or department query.</p>
              </div>
            </div>
          ) : (
            <div className="apply-behalf-employee-list">
              {filteredEmployees.map((employee) => (
                <button
                  key={employee._id}
                  type="button"
                  className={`apply-behalf-employee-card ${
                    selectedEmployee === employee._id ? "is-selected" : ""
                  }`}
                  onClick={() => handleEmployeeSelect(employee._id)}
                >
                  <div className="apply-behalf-employee-avatar">
                    {employee.name?.charAt(0) || "E"}
                  </div>
                  <div className="apply-behalf-employee-copy">
                    <strong>{employee.name}</strong>
                    <span>{employee.designation || "No designation"} • {employee.department || "No department"}</span>
                    <span>{employee.email}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="apply-behalf-main">
          {selectedEmpData ? (
            <>
              <section className="fiori-panel" id="apply-behalf-employee-context">
                <div className="fiori-panel-header">
                  <div>
                    <h3>Employee Context</h3>
                    <p>Quick summary and available balance before you submit the request</p>
                  </div>
                </div>

                <div className="apply-behalf-selected-card">
                  <div>
                    <strong>{selectedEmpData.name}</strong>
                    <p>
                      {selectedEmpData.email} • {selectedEmpData.designation || "No designation"}
                    </p>
                  </div>
                  <span className="fiori-status-pill is-neutral">
                    {selectedEmpData.role || "Employee"}
                  </span>
                </div>

                <div className="apply-behalf-balance-grid">
                  {balanceCards.map((card) => (
                    <article key={card.label} className="fiori-stat-card">
                      <div className="fiori-stat-label">{card.label}</div>
                      <div className="fiori-stat-value">{card.value}</div>
                      <div className="fiori-stat-note">{card.note}</div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="fiori-panel" id="apply-behalf-leave-form">
                <div className="fiori-panel-header">
                  <div>
                    <h3>Leave Details</h3>
                    <p>Capture the leave type, schedule, and supporting reason</p>
                  </div>
                </div>

                <div className="apply-behalf-form-grid">
                  <label className="fiori-form-field">
                    <label>Leave Type</label>
                    <select
                      className="input"
                      value={leave.leave_type}
                      onChange={(event) =>
                        setLeave({ ...leave, leave_type: event.target.value })
                      }
                    >
                      <option>Sick</option>
                      <option>Planned</option>
                    </select>
                  </label>

                  <label className="fiori-form-field">
                    <label>Start Date</label>
                    <input
                      className="input"
                      type="date"
                      value={leave.start_date}
                      onChange={(event) =>
                        setLeave({ ...leave, start_date: event.target.value })
                      }
                    />
                  </label>

                  <label className="fiori-form-field">
                    <label>End Date</label>
                    <input
                      className="input"
                      type="date"
                      value={leave.end_date}
                      onChange={(event) =>
                        setLeave({ ...leave, end_date: event.target.value })
                      }
                    />
                  </label>

                  <label className="fiori-form-field apply-behalf-reason-field">
                    <label>Reason</label>
                    <textarea
                      value={leave.reason}
                      onChange={(event) =>
                        setLeave({ ...leave, reason: event.target.value })
                      }
                      placeholder="Add context for the leave request"
                    />
                  </label>
                </div>

                <div className="apply-behalf-note">
                  <ShieldCheck size={16} />
                  <span>
                    Requests created from this workflow are submitted as already approved and are
                    attributed to {user?.name}.
                  </span>
                </div>

                <div className="admin-modal-actions">
                  <button
                    className="fiori-button primary full-width"
                    onClick={applyLeave}
                    disabled={loading || !leave.start_date || !leave.end_date}
                  >
                    <ClipboardPenLine size={16} />
                    <span>{loading ? "Applying..." : "Apply leave for employee"}</span>
                  </button>
                </div>
              </section>
            </>
          ) : (
            <div className="admin-empty-state apply-behalf-placeholder">
              <CalendarDays size={28} />
              <div>
                <strong>Select an employee to begin</strong>
                <p>Once an employee is selected, their balance and the leave form will appear here.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`admin-toast ${
            message.toLowerCase().includes("failed") || message.toLowerCase().includes("please")
              ? "is-error"
              : "is-success"
          }`}
        >
          {message}
        </div>
      )}
    </section>
  );
};

export default AdminApplyLeave;
