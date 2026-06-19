import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { CalendarDays, MapPin, Plus, Sparkles } from "lucide-react";
import { buildRequesterHeaders } from "../utils/requester";

const handleCardKeyDown = (event, action) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
};

const AdminHolidays = ({ user }) => {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    date: "",
    type: "company",
    region: "",
    is_optional: false,
    description: "",
  });

  const load = async () => {
    try {
      setLoading(true);
      const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/holidays/`);
      setItems(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Error loading holidays:", error);
      setMessage("Failed to load holidays");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const change = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((previous) => ({
      ...previous,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const reset = () => {
    setForm({
      name: "",
      date: "",
      type: "company",
      region: "",
      is_optional: false,
      description: "",
    });
    setEditing(null);
  };

  const showToast = (nextMessage) => {
    setMessage(nextMessage);
    window.setTimeout(() => setMessage(""), 3000);
  };

  const save = async () => {
    if (!form.name || !form.date) {
      showToast("Name and date are required");
      return;
    }

    try {
      if (editing) {
        await axios.put(
          `${process.env.REACT_APP_BACKEND_URL}/api/holidays/update/${editing}`,
          form,
          { headers: buildRequesterHeaders(user) }
        );
        showToast("Holiday updated successfully");
      } else {
        await axios.post(`${process.env.REACT_APP_BACKEND_URL}/api/holidays/add`, form, {
          headers: buildRequesterHeaders(user),
        });
        showToast("Holiday added successfully");
      }

      reset();
      load();
    } catch (error) {
      console.error("Error saving holiday:", error);
      showToast("Failed to save holiday");
    }
  };

  const editRow = (row) => {
    setEditing(row._id);
    setForm({
      name: row.name || "",
      date: row.date || "",
      type: row.type || "company",
      region: row.region || "",
      is_optional: !!row.is_optional,
      description: row.description || "",
    });
  };

  const del = async (id) => {
    if (!window.confirm("Delete this holiday?")) return;

    try {
      await axios.delete(`${process.env.REACT_APP_BACKEND_URL}/api/holidays/delete/${id}`, {
        headers: buildRequesterHeaders(user),
      });
      load();
      showToast("Holiday deleted successfully");
    } catch (error) {
      console.error("Error deleting holiday:", error);
      showToast("Failed to delete holiday");
    }
  };

  const summary = useMemo(() => {
    const optional = items.filter((item) => item.type === "optional" || item.is_optional).length;
    const publicCount = items.filter((item) => item.type === "public").length;
    const companyCount = items.filter((item) => item.type === "company").length;
    return { optional, publicCount, companyCount };
  }, [items]);

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="holiday-admin-workspace">
      <header className="admin-hero">
        <div>
          <div className="admin-section-overline">Holiday Administration</div>
          <h1>Holiday Calendar</h1>
        </div>

        <div className="admin-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Total holidays</span>
            <strong>{items.length}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Optional holidays</span>
            <strong>{summary.optional}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Mode</span>
            <strong>{editing ? "Editing" : "Adding"}</strong>
          </div>
        </div>
      </header>

      <section className="holiday-summary-grid">
        <article
          className="fiori-stat-card is-actionable"
          onClick={() => scrollToSection("holiday-directory")}
          onKeyDown={(event) => handleCardKeyDown(event, () => scrollToSection("holiday-directory"))}
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Public</span>
            <CalendarDays size={18} />
          </div>
          <div className="fiori-stat-value">{summary.publicCount}</div>
          <div className="fiori-stat-note">Public holidays visible across the calendar</div>
        </article>

        <article
          className="fiori-stat-card is-actionable"
          onClick={() => scrollToSection("holiday-directory")}
          onKeyDown={(event) => handleCardKeyDown(event, () => scrollToSection("holiday-directory"))}
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Company</span>
            <Sparkles size={18} />
          </div>
          <div className="fiori-stat-value">{summary.companyCount}</div>
          <div className="fiori-stat-note">Company events and org-wide closure days</div>
        </article>

        <article
          className="fiori-stat-card is-actionable"
          onClick={() => scrollToSection("holiday-directory")}
          onKeyDown={(event) => handleCardKeyDown(event, () => scrollToSection("holiday-directory"))}
          role="button"
          tabIndex={0}
        >
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Optional</span>
            <Plus size={18} />
          </div>
          <div className="fiori-stat-value">{summary.optional}</div>
          <div className="fiori-stat-note">Optional holidays employees can opt into</div>
        </article>
      </section>

      <section className="holiday-admin-grid">
        <section className="fiori-panel" id="holiday-directory">
          <div className="fiori-panel-header">
            <div>
              <h3>{editing ? "Edit Holiday" : "Add Holiday"}</h3>
              <p>Create or update a holiday entry used by the calendar</p>
            </div>
          </div>

          <div className="holiday-form-grid">
            <label className="fiori-form-field">
              <label>Holiday Name</label>
              <input className="input" name="name" value={form.name} onChange={change} />
            </label>

            <label className="fiori-form-field">
              <label>Date</label>
              <input className="input" name="date" type="date" value={form.date} onChange={change} />
            </label>

            <label className="fiori-form-field">
              <label>Type</label>
              <select className="input" name="type" value={form.type} onChange={change}>
                <option value="public">Public</option>
                <option value="optional">Optional</option>
                <option value="company">Company</option>
              </select>
            </label>

            <label className="fiori-form-field">
              <label>Region</label>
              <input
                className="input"
                name="region"
                placeholder="Region or office"
                value={form.region}
                onChange={change}
              />
            </label>

            <label className="fiori-form-field holiday-form-wide">
              <label>Description</label>
              <input
                className="input"
                name="description"
                placeholder="Additional context for the holiday"
                value={form.description}
                onChange={change}
              />
            </label>

            <label className="holiday-toggle-row">
              <input
                type="checkbox"
                name="is_optional"
                checked={form.is_optional}
                onChange={change}
              />
              <span>Mark as optional holiday</span>
            </label>
          </div>

          <div className="admin-modal-actions">
            {editing && (
              <button className="fiori-button secondary" onClick={reset}>
                Cancel edit
              </button>
            )}
            <button className="fiori-button primary" onClick={save}>
              {editing ? "Update holiday" : "Add holiday"}
            </button>
          </div>
        </section>

        <section className="fiori-panel">
          <div className="fiori-panel-header">
            <div>
              <h3>Holiday Directory</h3>
              <p>Review and maintain the current holiday list</p>
            </div>
          </div>

          {loading ? (
            <div className="fiori-loading-card">
              <CalendarDays size={24} />
              <div>
                <strong>Loading holiday directory</strong>
                <p>Preparing existing holiday records.</p>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="admin-empty-state">
              <CalendarDays size={24} />
              <div>
                <strong>No holidays added yet</strong>
                <p>Add the first holiday entry to make it available in the calendar.</p>
              </div>
            </div>
          ) : (
            <div className="fiori-table-shell">
              <table className="fiori-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Region</th>
                    <th>Optional</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((holiday) => (
                    <tr key={holiday._id}>
                      <td>{holiday.date}</td>
                      <td>
                        <div className="fiori-primary-cell">
                          <strong>{holiday.name}</strong>
                          {holiday.description ? <span>{holiday.description}</span> : null}
                        </div>
                      </td>
                      <td>
                        <span className="fiori-status-pill is-neutral">{holiday.type}</span>
                      </td>
                      <td>
                        {holiday.region ? (
                          <span className="holiday-region-cell">
                            <MapPin size={14} />
                            <span>{holiday.region}</span>
                          </span>
                        ) : (
                          "Not set"
                        )}
                      </td>
                      <td>{holiday.is_optional ? "Yes" : "No"}</td>
                      <td>
                        <div className="holiday-table-actions">
                          <button className="fiori-button secondary" onClick={() => editRow(holiday)}>
                            Edit
                          </button>
                          <button
                            className="fiori-button secondary danger"
                            onClick={() => del(holiday._id)}
                          >
                            Delete
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
      </section>

      {message && (
        <div
          className={`admin-toast ${
            message.toLowerCase().includes("failed") || message.toLowerCase().includes("required")
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

export default AdminHolidays;
