import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  CheckCircle2,
  Mail,
  RefreshCw,
  RotateCcw,
  Send,
  Settings,
} from "lucide-react";
import { buildRequesterHeaders } from "../utils/requester";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "";
const MAIL_API = `${API_BASE}/api/mail`;

const DEFAULT_SETTINGS = {
  provider: "gmail",
  smtp_host: "smtp.gmail.com",
  smtp_port: 587,
  smtp_user: "noreply.naxrita@gmail.com",
  smtp_password: "",
  encryption: "starttls",
  from_email: "noreply.naxrita@gmail.com",
  from_name: "Naxrita HRMS",
  is_active: true,
};

const formatDateTime = (value) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusClass = (status) => {
  if (status === "sent") return "is-success";
  if (status === "failed") return "is-danger";
  if (status === "retrying" || status === "queued" || status === "processing") return "is-warning";
  return "is-neutral";
};

export default function MailAdmin({ user }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [logs, setLogs] = useState([]);
  const [testEmail, setTestEmail] = useState(user?.email || "");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const requesterHeaders = useMemo(() => buildRequesterHeaders(user), [user]);

  const fetchSettings = useCallback(async () => {
    const response = await axios.get(`${MAIL_API}/settings`, { headers: requesterHeaders });
    setSettings({
      ...DEFAULT_SETTINGS,
      ...response.data,
      smtp_password: "",
    });
  }, [requesterHeaders]);

  const fetchLogs = useCallback(async () => {
    const response = await axios.get(`${MAIL_API}/logs?limit=150`, { headers: requesterHeaders });
    setLogs(Array.isArray(response.data) ? response.data : []);
  }, [requesterHeaders]);

  const refreshAll = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      await Promise.all([fetchSettings(), fetchLogs()]);
    } catch (refreshError) {
      setError(refreshError.response?.data?.error || "Failed to load mail admin data");
    } finally {
      setLoading(false);
    }
  }, [fetchLogs, fetchSettings]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const stats = useMemo(() => {
    return logs.reduce(
      (acc, log) => {
        acc.total += 1;
        if (log.status === "sent") acc.sent += 1;
        if (log.status === "failed") acc.failed += 1;
        if (["queued", "retrying", "processing"].includes(log.status)) acc.pending += 1;
        return acc;
      },
      { total: 0, sent: 0, failed: 0, pending: 0 }
    );
  }, [logs]);

  const updateSetting = (field, value) => {
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setStatus("");
      setError("");
      const payload = { ...settings };
      if (!payload.smtp_password) {
        delete payload.smtp_password;
      }
      const response = await axios.put(`${MAIL_API}/settings`, payload, { headers: requesterHeaders });
      setSettings({ ...DEFAULT_SETTINGS, ...response.data.settings, smtp_password: "" });
      setStatus("SMTP settings saved");
    } catch (saveError) {
      setError(saveError.response?.data?.error || "Failed to save SMTP settings");
    } finally {
      setSaving(false);
    }
  };

  const sendTestMail = async () => {
    try {
      setStatus("");
      setError("");
      await axios.post(`${MAIL_API}/test`, { to_email: testEmail }, { headers: requesterHeaders });
      setStatus("Test mail sent");
      await fetchLogs();
    } catch (testError) {
      setError(testError.response?.data?.error || "Test mail failed");
      await fetchLogs();
    }
  };

  const checkHealth = async () => {
    try {
      setStatus("");
      setError("");
      const response = await axios.get(`${MAIL_API}/health`, { headers: requesterHeaders });
      setStatus(`SMTP health: ${response.data.status}`);
    } catch (healthError) {
      setError(healthError.response?.data?.error || "SMTP health check failed");
    }
  };

  const retryMail = async (logId) => {
    try {
      setStatus("");
      setError("");
      await axios.post(
        `${MAIL_API}/retry`,
        logId ? { log_id: logId } : { retry_all: true },
        { headers: requesterHeaders }
      );
      setStatus("Retry queued");
      await fetchLogs();
    } catch (retryError) {
      setError(retryError.response?.data?.error || "Retry failed");
    }
  };

  return (
    <section className="mail-admin-workspace">
      <header className="admin-hero">
        <div className="admin-hero-copy">
          <div className="admin-section-overline">Mail Admin</div>
          <h1>Mail Notifications</h1>
          <p>SMTP configuration, delivery status, and retries.</p>
        </div>

        <div className="admin-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Total</span>
            <strong>{stats.total}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Sent</span>
            <strong>{stats.sent}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Pending</span>
            <strong>{stats.pending}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Failed</span>
            <strong>{stats.failed}</strong>
          </div>
        </div>
      </header>

      {status ? (
        <div className="mail-admin-banner is-success">
          <CheckCircle2 size={17} />
          <span>{status}</span>
        </div>
      ) : null}

      {error ? (
        <div className="mail-admin-banner is-danger">
          <AlertTriangle size={17} />
          <span>{error}</span>
        </div>
      ) : null}

      <section className="mail-admin-grid">
        <div className="fiori-panel">
          <div className="fiori-panel-header">
            <div>
              <h3>SMTP Settings</h3>
              <p>Gmail, Outlook, or Office365.</p>
            </div>
            <Settings size={20} />
          </div>

          <div className="mail-admin-form-grid">
            <label className="employee-filter-field">
              <span>Provider</span>
              <select
                className="input"
                value={settings.provider || "office365"}
                onChange={(event) => updateSetting("provider", event.target.value)}
              >
                <option value="office365">Office365</option>
                <option value="outlook">Outlook</option>
                <option value="gmail">Gmail</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label className="employee-filter-field">
              <span>SMTP Host</span>
              <input
                className="input"
                value={settings.smtp_host || ""}
                onChange={(event) => updateSetting("smtp_host", event.target.value)}
              />
            </label>

            <label className="employee-filter-field">
              <span>SMTP Port</span>
              <input
                className="input"
                type="number"
                min="1"
                value={settings.smtp_port || 587}
                onChange={(event) => updateSetting("smtp_port", Number(event.target.value))}
              />
            </label>

            <label className="employee-filter-field">
              <span>Encryption</span>
              <select
                className="input"
                value={settings.encryption || "starttls"}
                onChange={(event) => updateSetting("encryption", event.target.value)}
              >
                <option value="starttls">STARTTLS</option>
                <option value="ssl">SSL</option>
                <option value="none">None</option>
              </select>
            </label>

            <label className="employee-filter-field">
              <span>SMTP User</span>
              <input
                className="input"
                type="email"
                value={settings.smtp_user || ""}
                onChange={(event) => updateSetting("smtp_user", event.target.value)}
              />
            </label>

            <label className="employee-filter-field">
              <span>SMTP Password</span>
              <input
                className="input"
                type="password"
                placeholder={settings._id ? "Leave blank to keep current password" : ""}
                value={settings.smtp_password || ""}
                onChange={(event) => updateSetting("smtp_password", event.target.value)}
              />
            </label>

            <label className="employee-filter-field">
              <span>From Email</span>
              <input
                className="input"
                type="email"
                value={settings.from_email || ""}
                onChange={(event) => updateSetting("from_email", event.target.value)}
              />
            </label>

            <label className="employee-filter-field">
              <span>From Name</span>
              <input
                className="input"
                value={settings.from_name || ""}
                onChange={(event) => updateSetting("from_name", event.target.value)}
              />
            </label>

            <label className="mail-admin-toggle">
              <input
                type="checkbox"
                checked={settings.is_active !== false}
                onChange={(event) => updateSetting("is_active", event.target.checked)}
              />
              <span>Active</span>
            </label>
          </div>

          <div className="mail-admin-actions">
            <button className="fiori-button primary" type="button" onClick={saveSettings} disabled={saving}>
              <Settings size={16} />
              <span>{saving ? "Saving" : "Save Settings"}</span>
            </button>
            <button className="fiori-button secondary" type="button" onClick={checkHealth}>
              <CheckCircle2 size={16} />
              <span>Health Check</span>
            </button>
          </div>
        </div>

        <div className="fiori-panel">
          <div className="fiori-panel-header">
            <div>
              <h3>Test Mail</h3>
              <p>Send a live SMTP test.</p>
            </div>
            <Mail size={20} />
          </div>

          <label className="employee-filter-field">
            <span>Recipient Email</span>
            <input
              className="input"
              type="email"
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
            />
          </label>

          <div className="mail-admin-actions">
            <button className="fiori-button primary" type="button" onClick={sendTestMail} disabled={!testEmail}>
              <Send size={16} />
              <span>Send Test</span>
            </button>
            <button className="fiori-button secondary" type="button" onClick={refreshAll} disabled={loading}>
              <RefreshCw size={16} />
              <span>{loading ? "Refreshing" : "Refresh"}</span>
            </button>
            <button className="fiori-button secondary" type="button" onClick={() => retryMail(null)} disabled={!stats.failed}>
              <RotateCcw size={16} />
              <span>Retry Failed</span>
            </button>
          </div>
        </div>
      </section>

      <section className="fiori-panel">
        <div className="fiori-panel-header">
          <div>
            <h3>Mail Logs</h3>
            <p>{logs.length} recent records.</p>
          </div>
          <button className="fiori-button secondary" type="button" onClick={fetchLogs}>
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="fiori-table-shell mail-admin-table-shell">
          <table className="fiori-table">
            <thead>
              <tr>
                <th>Created</th>
                <th>Type</th>
                <th>Recipients</th>
                <th>CC</th>
                <th>Status</th>
                <th>Retries</th>
                <th>Error</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={8}>No mail logs yet.</td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log._id}>
                    <td>{formatDateTime(log.created_at)}</td>
                    <td>{log.mail_type || "general"}</td>
                    <td>{(log.recipients || []).join(", ") || "N/A"}</td>
                    <td>{(log.cc || []).join(", ") || "N/A"}</td>
                    <td>
                      <span className={`fiori-status-pill ${statusClass(log.status)}`}>
                        {log.status || "unknown"}
                      </span>
                    </td>
                    <td>{log.retry_count || 0}</td>
                    <td className="mail-admin-error-cell">{log.error_message || "N/A"}</td>
                    <td>
                      <button
                        className="fiori-button secondary"
                        type="button"
                        onClick={() => retryMail(log._id)}
                        disabled={log.status !== "failed"}
                      >
                        <RotateCcw size={15} />
                        <span>Retry</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
