import React, { useState } from "react";
import { Briefcase, Building2, ShieldCheck, UserPlus } from "lucide-react";
import { buildRequesterHeaders } from "../utils/requester";

const emptyForm = {
  employeeId: "",
  name: "",
  email: "",
  password: "",
  designation: "",
  role: "Employee",
  department: "",
  shiftTimings: "",
  projects: "",
  reportsToEmail: "",
  dateOfJoining: "",
  dateOfBirth: "",
  workLocation: "",
  companyCode: "",
  costCenter: "",
  peopleLeadEmail: "",
};

const UserForm = ({ currentUser, onSaved }) => {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const change = (event) =>
    setForm({ ...form, [event.target.name]: event.target.value });

  const resetForm = () => setForm(emptyForm);
  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const payload = {
      employeeId: form.employeeId,
      name: form.name,
      email: form.email,
      password: form.password,
      designation: form.designation,
      role: form.role,
      department: form.department,
      shiftTimings: form.shiftTimings,
      projects: form.projects ? form.projects.split(",").map((item) => item.trim()) : [],
      reportsToEmail: form.reportsToEmail || null,
      dateOfJoining: form.dateOfJoining
        ? new Date(form.dateOfJoining).toISOString()
        : new Date().toISOString(),
      dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth).toISOString() : null,
      workLocation: form.workLocation || "",
      companyCode: form.companyCode || "",
      costCenter: form.costCenter || "",
      peopleLeadEmail: form.peopleLeadEmail || null,
    };

    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/users/add_user`, {
        method: "POST",
        headers: buildRequesterHeaders(currentUser, { "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "Failed to add employee");
        return;
      }

      setMessage("Employee added successfully");
      resetForm();
      if (onSaved) onSaved();
    } catch (error) {
      console.error(error);
      setMessage("Network error");
    } finally {
      setLoading(false);
      window.setTimeout(() => setMessage(""), 3000);
    }
  };

  return (
    <section className="setup-workspace">
      <header className="admin-hero">
        <div className="admin-hero-copy">
          <div className="admin-section-overline">Workforce Setup</div>
          <h1>Employee Setup</h1>
          <p>
            Add identity, access, reporting, and assignment details for a new employee.
          </p>
        </div>

        <div className="admin-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Form Scope</span>
            <strong>Employee onboarding</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Includes</span>
            <strong>Profile and reporting data</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Action</span>
            <strong>Create workforce record</strong>
          </div>
        </div>
      </header>

      <section className="setup-summary-grid">
        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Identity</span>
            <UserPlus size={18} />
          </div>
          <div className="fiori-stat-value setup-stat-text">Profile</div>
          <div className="fiori-stat-note">Employee ID, contact information, password, and role</div>
        </article>

        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Organization</span>
            <Building2 size={18} />
          </div>
          <div className="fiori-stat-value setup-stat-text">Reporting</div>
          <div className="fiori-stat-note">Department, managers, people lead, and work location</div>
        </article>

        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Assignments</span>
            <Briefcase size={18} />
          </div>
          <div className="fiori-stat-value setup-stat-text">Projects</div>
          <div className="fiori-stat-note">Project list, shift timing, and joining timeline</div>
        </article>
      </section>

      <section className="fiori-panel">
        <div className="fiori-panel-header">
          <div>
            <h3>Create Employee Record</h3>
            <p>Fill the required fields first, then add optional org and profile information</p>
          </div>
          <span className="fiori-status-pill is-neutral">
            <ShieldCheck size={14} />
            Standard onboarding
          </span>
        </div>

        <form onSubmit={submit}>
          <div className="setup-form-grid">
            <label className="fiori-form-field">
              <label>Employee ID</label>
              <input
                className="input"
                name="employeeId"
                placeholder="EMP001"
                value={form.employeeId}
                onChange={change}
                required
              />
            </label>

            <label className="fiori-form-field">
              <label>Full Name</label>
              <input
                className="input"
                name="name"
                placeholder="Employee full name"
                value={form.name}
                onChange={change}
                required
              />
            </label>

            <label className="fiori-form-field">
              <label>Email</label>
              <input
                className="input"
                name="email"
                type="email"
                placeholder="employee@company.com"
                value={form.email}
                onChange={change}
                required
              />
            </label>

            <label className="fiori-form-field">
              <label>Password</label>
              <input
                className="input"
                name="password"
                type="password"
                placeholder="Temporary password"
                value={form.password}
                onChange={change}
                required
              />
            </label>

            <label className="fiori-form-field">
              <label>Designation</label>
              <input
                className="input"
                name="designation"
                placeholder="Software Engineer"
                value={form.designation}
                onChange={change}
                required
              />
            </label>

            <label className="fiori-form-field">
              <label>Role</label>
              <select className="input" name="role" value={form.role} onChange={change}>
                <option>Employee</option>
                <option>Manager</option>
                <option>Admin</option>
              </select>
            </label>

            <label className="fiori-form-field">
              <label>Department</label>
              <input
                className="input"
                name="department"
                placeholder="People Operations"
                value={form.department}
                onChange={change}
              />
            </label>

            <label className="fiori-form-field">
              <label>Shift Timings</label>
              <input
                className="input"
                name="shiftTimings"
                placeholder="9:00 AM - 6:00 PM"
                value={form.shiftTimings}
                onChange={change}
              />
            </label>

            <label className="fiori-form-field">
              <label>Date of Joining</label>
              <input
                className="input"
                name="dateOfJoining"
                type="date"
                value={form.dateOfJoining}
                onChange={change}
              />
            </label>

            <label className="fiori-form-field">
              <label>Date of Birth</label>
              <input
                className="input"
                name="dateOfBirth"
                type="date"
                value={form.dateOfBirth}
                onChange={change}
                max={new Date().toISOString().split("T")[0]}
              />
            </label>

            <label className="fiori-form-field setup-wide-field">
              <label>Projects</label>
              <input
                className="input"
                name="projects"
                placeholder="Project Alpha, Project Beta"
                value={form.projects}
                onChange={change}
              />
            </label>

            <label className="fiori-form-field">
              <label>Tech Lead Email</label>
              <input
                className="input"
                name="reportsToEmail"
                placeholder="manager@company.com"
                value={form.reportsToEmail}
                onChange={change}
              />
            </label>

            <label className="fiori-form-field">
              <label>People Lead Email</label>
              <input
                className="input"
                name="peopleLeadEmail"
                placeholder="hr@company.com"
                value={form.peopleLeadEmail}
                onChange={change}
              />
            </label>

            <label className="fiori-form-field">
              <label>Work Location</label>
              <input
                className="input"
                name="workLocation"
                placeholder="Hyderabad office or remote"
                value={form.workLocation}
                onChange={change}
              />
            </label>

            <label className="fiori-form-field">
              <label>Company Code</label>
              <input
                className="input"
                name="companyCode"
                placeholder="Company code assigned by admin"
                value={form.companyCode}
                onChange={change}
              />
            </label>

            <label className="fiori-form-field">
              <label>Cost Center</label>
              <input
                className="input"
                name="costCenter"
                placeholder="Cost center assigned by admin"
                value={form.costCenter}
                onChange={change}
              />
            </label>
          </div>

          <div className="admin-modal-actions">
            <button type="button" className="fiori-button secondary" onClick={resetForm}>
              Reset
            </button>
            <button type="submit" className="fiori-button primary" disabled={loading}>
              {loading ? "Creating..." : "Add employee"}
            </button>
          </div>
        </form>
      </section>

      {message && (
        <div
          className={`admin-toast ${
            message.toLowerCase().includes("failed") || message.toLowerCase().includes("error")
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

export default UserForm;
