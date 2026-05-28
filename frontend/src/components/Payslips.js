import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownAZ,
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Download,
  Pencil,
  FileSpreadsheet,
  FileText,
  Filter,
  Search,
  Trash2,
  Upload,
  X,
  Users,
} from "lucide-react";

const API_BASE = process.env.REACT_APP_BACKEND_URL
  ? `${process.env.REACT_APP_BACKEND_URL}/api`
  : "http://localhost:5000/api";

const C = {
  text: "#32363a",
  textMid: "#6a6d70",
  bg: "#f8f8f8",
  white: "#ffffff",
  border: "#e0e0e0",
  borderLight: "#f0f0f0",
  purple: "#6b5b7a",
  purpleDark: "#5a4a69",
  purpleLight: "#f3f0f7",
  purpleBorder: "#c8bfd4",
  green: "#4a7c59",
  greenLight: "#f0f7f0",
  greenBorder: "#b8d4bc",
  red: "#c1666b",
  redLight: "#fef3f3",
  redBorder: "#e8c4c6",
  amber: "#d97706",
  amberLight: "#fff4e6",
  amberBorder: "#fcd34d",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const YEARS = ["2024", "2025", "2026", "2027", "2028"];
const SORT_OPTIONS = [
  { value: "period_desc", label: "Newest period first" },
  { value: "period_asc", label: "Oldest period first" },
  { value: "employee_asc", label: "Employee A-Z" },
  { value: "employee_desc", label: "Employee Z-A" },
  { value: "net_desc", label: "Highest net pay" },
  { value: "net_asc", label: "Lowest net pay" },
  { value: "generated_desc", label: "Recently stored" },
  { value: "generated_asc", label: "Oldest stored first" },
];

const S = {
  page: { background: C.bg, width: "100%", minWidth: 0, boxSizing: "border-box" },
  inner: { padding: "14px 12px" },
  header: { marginBottom: 14 },
  title: { fontSize: 22, fontWeight: 400, color: C.text, margin: "0 0 4px 0" },
  sub: { fontSize: 13, color: C.textMid, margin: 0 },
  card: {
    background: C.white,
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  },
  cardPad: { padding: 16 },
  tabRow: { display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 },
  tab: {
    padding: "8px 14px",
    borderRadius: 999,
    border: `1px solid ${C.border}`,
    background: C.white,
    color: C.text,
    fontSize: 13,
    cursor: "pointer",
  },
  tabActive: {
    background: C.purple,
    borderColor: C.purple,
    color: C.white,
  },
  grid3: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 14 },
  stat: {
    background: C.white,
    borderRadius: 10,
    border: `1px solid ${C.border}`,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    padding: 14,
  },
  statLabel: { fontSize: 12, color: C.textMid, marginBottom: 6 },
  statValue: { fontSize: 24, color: C.text, fontWeight: 600, marginBottom: 4 },
  statSub: { fontSize: 12, color: C.textMid },
  info: {
    background: C.amberLight,
    border: `1px solid ${C.amberBorder}`,
    borderRadius: 10,
    padding: 14,
    color: C.text,
    marginBottom: 14,
  },
  successInfo: {
    background: C.greenLight,
    border: `1px solid ${C.greenBorder}`,
    borderRadius: 10,
    padding: 14,
    color: C.text,
    marginBottom: 14,
  },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 16 },
  filterGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, color: C.textMid, fontWeight: 600 },
  input: {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "10px 12px",
    fontSize: 14,
    color: C.text,
    background: C.white,
  },
  searchWrap: { position: "relative" },
  searchIcon: { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.textMid },
  searchInput: {
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "10px 12px 10px 38px",
    fontSize: 14,
    color: C.text,
    background: C.white,
    width: "100%",
    boxSizing: "border-box",
  },
  uploadArea: {
    border: `1.5px dashed ${C.purple}`,
    borderRadius: 14,
    padding: 28,
    textAlign: "center",
    background: "linear-gradient(135deg, #fbfaff 0%, #f6f8fb 100%)",
    cursor: "pointer",
    marginBottom: 16,
  },
  uploadAreaActive: { background: "#f2eff7" },
  rowBetween: { display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" },
  rowGap: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },
  btnPrimary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 14px",
    borderRadius: 8,
    border: "none",
    background: C.purple,
    color: C.white,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  btnSecondary: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 14px",
    borderRadius: 8,
    border: `1px solid ${C.border}`,
    background: C.white,
    color: C.text,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  btnDisabled: { opacity: 0.55, cursor: "not-allowed" },
  tableWrap: { overflowX: "auto" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: {
    padding: "12px 10px",
    borderBottom: `1px solid ${C.border}`,
    textAlign: "left",
    fontSize: 12,
    color: C.text,
    background: "#fafafa",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "12px 10px",
    borderBottom: `1px solid ${C.borderLight}`,
    fontSize: 13,
    color: C.text,
    verticalAlign: "top",
  },
  banner: { borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13 },
  group: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 },
  uploadSummaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 14 },
  miniCard: { background: "#fcfcfe", border: `1px solid ${C.border}`, borderRadius: 10, padding: 12 },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
    padding: "14px 16px",
    background: "linear-gradient(135deg, #faf8fd 0%, #ffffff 100%)",
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    cursor: "pointer",
  },
  groupMeta: { display: "flex", gap: 10, flexWrap: "wrap", color: C.textMid, fontSize: 12, marginTop: 4 },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    background: C.purpleLight,
    border: `1px solid ${C.purpleBorder}`,
    color: C.purpleDark,
    fontSize: 12,
    fontWeight: 700,
  },
  payslipCard: {
    background: C.white,
    borderRadius: 12,
    border: `1px solid ${C.border}`,
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    padding: 16,
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(20, 22, 26, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 1000,
  },
  modalCard: {
    width: "min(920px, 100%)",
    maxHeight: "90vh",
    overflowY: "auto",
    background: C.white,
    borderRadius: 14,
    border: `1px solid ${C.border}`,
    boxShadow: "0 18px 50px rgba(0,0,0,0.18)",
    padding: 18,
  },
  lineItemRow: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 140px", gap: 10, marginBottom: 10 },
  dangerTextButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px",
    borderRadius: 8,
    border: `1px solid ${C.redBorder}`,
    background: C.redLight,
    color: C.red,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  empty: { textAlign: "center", padding: "34px 16px", color: C.textMid },
};

const currency = (value) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value || 0));

const monthIndex = (month) => MONTHS.findIndex((item) => item === month) + 1;

const fetchJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || "Request failed");
  return data;
};

function Payslips({ user }) {
  const isAdmin = user?.role === "Admin";
  const userId = user?._id || user?.id || "";
  const [activeTab, setActiveTab] = useState(isAdmin ? "upload" : "display");
  const [month, setMonth] = useState(MONTHS[new Date().getMonth()]);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [uploadedData, setUploadedData] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [history, setHistory] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPayslips, setLoadingPayslips] = useState(false);
  const [generatingRow, setGeneratingRow] = useState(null);
  const [storingAll, setStoringAll] = useState(false);
  const [message, setMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [selectedStorageStatus, setSelectedStorageStatus] = useState("all");
  const [sortBy, setSortBy] = useState("period_desc");
  const [expandedGroups, setExpandedGroups] = useState({});
  const [editingPayslip, setEditingPayslip] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingPayslipId, setDeletingPayslipId] = useState("");
  const fileInputRef = useRef(null);

  const openEditModal = (item) => {
    const profile = item.employee_profile || {};
    setEditingPayslip(item);
    setEditForm({
      employee_id: item.employee_id || "",
      month: item.month || "",
      year: item.year || "",
      lop_days: String(item.lop_days ?? ""),
      std_days: String(item.std_days ?? ""),
      worked_days: String(item.worked_days ?? ""),
      bank: profile.bank || item.bank || "",
      bank_account_no: profile.bank_account_no || item.bank_account_no || "",
      doj: profile.doj || item.doj || "",
      pf_no: profile.pf_no || item.pf_no || "",
      location: profile.location || item.location || "",
      department: profile.department || item.department || "",
      management_level: profile.management_level || item.management_level || "",
      facility: profile.facility || item.facility || "",
      entity: profile.entity || item.entity || "",
      pf_uan: profile.pf_uan || item.pf_uan || "",
      earnings: (item.earnings || []).map((line) => ({ key: line.key || "", label: line.label || "", amount: String(line.amount ?? "") })),
      deductions: (item.deductions || []).map((line) => ({ key: line.key || "", label: line.label || "", amount: String(line.amount ?? "") })),
    });
  };

  const closeEditModal = () => {
    setEditingPayslip(null);
    setEditForm(null);
    setSavingEdit(false);
  };

  const loadVisiblePayslips = async () => {
    if (!userId) return;
    setLoadingPayslips(true);
    try {
      const [payslipResult, historyResult] = await Promise.all([
        fetchJson(`/payslips?user_id=${encodeURIComponent(userId)}`),
        isAdmin ? fetchJson("/payslips/upload-history") : Promise.resolve({ history: [] }),
      ]);
      const items = Array.isArray(payslipResult.payslips) ? payslipResult.payslips : [];
      setPayslips(items);
      setHistory(Array.isArray(historyResult.history) ? historyResult.history : []);
      setExpandedGroups((previous) => {
        const next = { ...previous };
        items.forEach((item) => {
          const key = item.period_key || `${item.year}-${String(item.month_number || monthIndex(item.month)).padStart(2, "0")}`;
          if (!(key in next)) next[key] = Object.keys(previous).length === 0;
        });
        return next;
      });
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
    } finally {
      setLoadingPayslips(false);
    }
  };

  useEffect(() => {
    loadVisiblePayslips();
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadedRowsWithStatus = useMemo(() => {
    const existingKeys = new Set(
      payslips.map((item) => `${item.employee_id}__${item.period_key || `${item.year}-${String(item.month_number || monthIndex(item.month)).padStart(2, "0")}`}`)
    );
    return uploadedData.map((row) => {
      const key = `${row.employee_id}__${row.year}-${String(monthIndex(row.month)).padStart(2, "0")}`;
      const missing = !row.employee_id || !row.name;
      const inHrms = !missing;
      const alreadyStored = existingKeys.has(key);
      return {
        ...row,
        row_key: key,
        storage_status: missing ? "invalid" : alreadyStored ? "stored" : "ready",
        alreadyStored,
        inHrms,
      };
    });
  }, [uploadedData, payslips]);

  const uploadSummary = useMemo(() => {
    const employees = new Set(uploadedRowsWithStatus.map((item) => item.employee_id).filter(Boolean)).size;
    const ready = uploadedRowsWithStatus.filter((item) => item.storage_status === "ready").length;
    const stored = uploadedRowsWithStatus.filter((item) => item.storage_status === "stored").length;
    const invalid = uploadedRowsWithStatus.filter((item) => item.storage_status === "invalid").length;
    return { employees, ready, stored, invalid };
  }, [uploadedRowsWithStatus]);

  const handleFile = async (file) => {
    if (!file) return;
    setLoading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const result = await fetchJson("/payslips/upload-excel", { method: "POST", body: formData });
      const normalized = (result.data || []).map((row) => ({ ...row, month, year }));
      setUploadedData(normalized);
      if (result.missing_users?.length) {
        setMessage({
          tone: "warn",
          text: `Parsed ${normalized.length} rows. Missing HRMS employee IDs: ${result.missing_users.join(", ")}`,
        });
      } else {
        setMessage({ tone: "success", text: `${result.message} (${month} ${year})` });
      }
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleGenerate = async (row, index) => {
    setGeneratingRow(index);
    setMessage(null);
    try {
      const result = await fetchJson("/payslips/generate-payslip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      setMessage({ tone: "success", text: result.message || "Payslip added to storage successfully" });
      await loadVisiblePayslips();
      window.open(`${API_BASE}/payslips/download/${result.payslip._id}?user_id=${encodeURIComponent(userId)}`, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
    } finally {
      setGeneratingRow(null);
    }
  };

  const handleStoreAll = async () => {
    const rows = uploadedRowsWithStatus.filter((item) => item.storage_status === "ready");
    if (!rows.length) {
      setMessage({ tone: "warn", text: "No new payslips are ready to add to storage." });
      return;
    }

    setStoringAll(true);
    setMessage(null);
    try {
      const result = await fetchJson("/payslips/bulk-store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      setMessage({
        tone: result.failed_count ? "warn" : "success",
        text: result.message,
      });
      await loadVisiblePayslips();
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
    } finally {
      setStoringAll(false);
    }
  };

  const handleDownload = (payslipId) => {
    window.open(`${API_BASE}/payslips/download/${payslipId}?user_id=${encodeURIComponent(userId)}`, "_blank", "noopener,noreferrer");
  };

  const handleLineItemChange = (kind, index, field, value) => {
    setEditForm((previous) => ({
      ...previous,
      [kind]: previous[kind].map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)),
    }));
  };

  const handleSaveEdit = async () => {
    if (!editingPayslip || !editForm) return;
    setSavingEdit(true);
    setMessage(null);
    try {
      const payload = {
        employee_id: editForm.employee_id,
        month: editForm.month,
        year: editForm.year,
        lop_days: Number(editForm.lop_days || 0),
        std_days: Number(editForm.std_days || 0),
        worked_days: Number(editForm.worked_days || 0),
        employee_profile: {
          name: editingPayslip.employee_name,
          bank: editForm.bank,
          bank_account_no: editForm.bank_account_no,
          doj: editForm.doj,
          pf_no: editForm.pf_no,
          location: editForm.location,
          department: editForm.department,
          management_level: editForm.management_level,
          facility: editForm.facility,
          entity: editForm.entity,
          pf_uan: editForm.pf_uan,
        },
        earnings: editForm.earnings.map((item) => ({ ...item, amount: Number(item.amount || 0) })),
        deductions: editForm.deductions.map((item) => ({ ...item, amount: Number(item.amount || 0) })),
      };
      const result = await fetchJson(`/payslips/${editingPayslip._id}?user_id=${encodeURIComponent(userId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setMessage({ tone: "success", text: result.message || "Payslip updated successfully" });
      closeEditModal();
      await loadVisiblePayslips();
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
      setSavingEdit(false);
    }
  };

  const handleDeletePayslip = async (item) => {
    if (!window.confirm(`Delete payslip for ${item.employee_name} - ${item.month} ${item.year}?`)) return;
    setDeletingPayslipId(item._id);
    setMessage(null);
    try {
      const result = await fetchJson(`/payslips/${item._id}?user_id=${encodeURIComponent(userId)}`, { method: "DELETE" });
      setMessage({ tone: "success", text: result.message || "Payslip deleted successfully" });
      await loadVisiblePayslips();
    } catch (error) {
      setMessage({ tone: "error", text: error.message });
    } finally {
      setDeletingPayslipId("");
    }
  };

  const filterOptions = useMemo(() => {
    const years = Array.from(new Set(payslips.map((item) => item.year).filter(Boolean))).sort((a, b) => Number(b) - Number(a));
    const employees = Array.from(new Set(
      payslips.map((item) => `${item.employee_id}||${item.employee_name}`).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));
    return { years, employees };
  }, [payslips]);

  const filteredPayslips = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filtered = payslips.filter((item) => {
      const matchesSearch = !normalizedSearch || [
        item.employee_name,
        item.employee_id,
        item.month,
        item.year,
        item.period_key,
      ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));

      const matchesYear = selectedYear === "all" || item.year === selectedYear;
      const matchesMonth = selectedMonth === "all" || item.month === selectedMonth;
      const employeeKey = `${item.employee_id}||${item.employee_name}`;
      const matchesEmployee = selectedEmployee === "all" || employeeKey === selectedEmployee;

      return matchesSearch && matchesYear && matchesMonth && matchesEmployee;
    });

    const withPeriod = filtered.map((item) => ({
      ...item,
      _sortMonth: item.month_number || monthIndex(item.month),
      _sortYear: Number(item.year || 0),
      _sortGenerated: item.generated_at ? new Date(item.generated_at).getTime() : 0,
    }));

    withPeriod.sort((a, b) => {
      switch (sortBy) {
        case "period_asc":
          return a._sortYear - b._sortYear || a._sortMonth - b._sortMonth || a.employee_name.localeCompare(b.employee_name);
        case "employee_asc":
          return a.employee_name.localeCompare(b.employee_name) || a.employee_id.localeCompare(b.employee_id);
        case "employee_desc":
          return b.employee_name.localeCompare(a.employee_name) || b.employee_id.localeCompare(a.employee_id);
        case "net_desc":
          return Number(b.net_pay || 0) - Number(a.net_pay || 0);
        case "net_asc":
          return Number(a.net_pay || 0) - Number(b.net_pay || 0);
        case "generated_asc":
          return a._sortGenerated - b._sortGenerated;
        case "generated_desc":
          return b._sortGenerated - a._sortGenerated;
        case "period_desc":
        default:
          return b._sortYear - a._sortYear || b._sortMonth - a._sortMonth || a.employee_name.localeCompare(b.employee_name);
      }
    });

    return withPeriod;
  }, [payslips, searchTerm, selectedYear, selectedMonth, selectedEmployee, sortBy]);

  const groupedPayslips = useMemo(() => {
    const map = new Map();
    filteredPayslips.forEach((item) => {
      const key = item.period_key || `${item.year}-${String(item._sortMonth).padStart(2, "0")}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: `${item.month} ${item.year}`,
          year: item.year,
          month: item.month,
          monthNumber: item._sortMonth,
          items: [],
        });
      }
      map.get(key).items.push(item);
    });
    return Array.from(map.values()).sort((a, b) => Number(b.year) - Number(a.year) || b.monthNumber - a.monthNumber);
  }, [filteredPayslips]);

  const displaySummary = useMemo(() => ({
    visible: filteredPayslips.length,
    employees: new Set(filteredPayslips.map((item) => item.employee_id)).size,
    periods: groupedPayslips.length,
  }), [filteredPayslips, groupedPayslips]);

  const messageStyle =
    message?.tone === "success"
      ? { ...S.banner, background: C.greenLight, border: `1px solid ${C.greenBorder}`, color: C.green }
      : message?.tone === "error"
        ? { ...S.banner, background: C.redLight, border: `1px solid ${C.redBorder}`, color: C.red }
        : { ...S.banner, background: C.amberLight, border: `1px solid ${C.amberBorder}`, color: C.amber };

  const toggleGroup = (key) => {
    setExpandedGroups((previous) => ({ ...previous, [key]: !previous[key] }));
  };

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={S.header}>
          <h1 style={S.title}>Payslips</h1>
          <p style={S.sub}>
            {isAdmin
              ? "Upload payroll sheets, review them, add payslips to storage, and manage a month-wise archive."
              : user?.role === "Manager"
                ? "Search, group, and download stored payslips for you and your direct reports."
                : "Search and download your stored payslips from a clean month-wise archive."}
          </p>
        </div>

        <div style={S.grid3}>
          <div style={S.stat}>
            <div style={S.statLabel}>Visible Payslips</div>
            <div style={S.statValue}>{displaySummary.visible || payslips.length}</div>
            <div style={S.statSub}>Records matching current filters</div>
          </div>
          <div style={S.stat}>
            <div style={S.statLabel}>Covered Employees</div>
            <div style={S.statValue}>{displaySummary.employees || new Set(payslips.map((item) => item.employee_id)).size}</div>
            <div style={S.statSub}>Unique employees in the archive view</div>
          </div>
          <div style={S.stat}>
            <div style={S.statLabel}>Stored Periods</div>
            <div style={S.statValue}>{displaySummary.periods || new Set(payslips.map((item) => item.period_key)).size}</div>
            <div style={S.statSub}>Organized by year and month</div>
          </div>
        </div>

        {isAdmin ? (
          <div style={S.tabRow}>
            <button type="button" style={{ ...S.tab, ...(activeTab === "upload" ? S.tabActive : {}) }} onClick={() => setActiveTab("upload")}>Upload</button>
            <button type="button" style={{ ...S.tab, ...(activeTab === "display" ? S.tabActive : {}) }} onClick={() => setActiveTab("display")}>Display</button>
          </div>
        ) : null}

        {message ? <div style={messageStyle}>{message.text}</div> : null}

        {isAdmin && activeTab === "upload" ? (
          <>
            <div style={S.info}>
              <strong>Excel upload flow</strong>
              <div style={{ marginTop: 8, lineHeight: 1.6 }}>
                Upload stays the same as the attached plugin. The difference now is the admin can review the parsed rows first,
                then use <strong>Add to Storage</strong> to persist the batch before it appears in the display archive.
              </div>
            </div>

            <div style={{ ...S.card, ...S.cardPad, marginBottom: 14 }}>
              <div style={S.formGrid}>
                <div style={S.field}>
                  <label style={S.label}>Select Month</label>
                  <select style={S.input} value={month} onChange={(event) => setMonth(event.target.value)}>
                    {MONTHS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Select Year</label>
                  <select style={S.input} value={year} onChange={(event) => setYear(event.target.value)}>
                    {YEARS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
              </div>

              <div
                style={{ ...S.uploadArea, ...(dragging ? S.uploadAreaActive : {}) }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  handleFile(event.dataTransfer.files?.[0]);
                }}
              >
                <Upload size={34} color={C.purple} />
                <div style={{ fontSize: 18, color: C.text, fontWeight: 600, marginTop: 10 }}>Click to upload or drag and drop</div>
                <div style={{ fontSize: 13, color: C.textMid, marginTop: 6 }}>Excel files only (.xlsx, .xls)</div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: "none" }}
                onChange={(event) => handleFile(event.target.files?.[0])}
              />
            </div>

            {uploadedRowsWithStatus.length ? (
              <div style={{ ...S.successInfo }}>
                <div style={S.uploadSummaryGrid}>
                  <div style={S.miniCard}>
                    <div style={S.statLabel}>Parsed Rows</div>
                    <div style={{ ...S.statValue, fontSize: 20 }}>{uploadedRowsWithStatus.length}</div>
                  </div>
                  <div style={S.miniCard}>
                    <div style={S.statLabel}>Employees</div>
                    <div style={{ ...S.statValue, fontSize: 20 }}>{uploadSummary.employees}</div>
                  </div>
                  <div style={S.miniCard}>
                    <div style={S.statLabel}>Ready to Store</div>
                    <div style={{ ...S.statValue, fontSize: 20 }}>{uploadSummary.ready}</div>
                  </div>
                  <div style={S.miniCard}>
                    <div style={S.statLabel}>Already Stored</div>
                    <div style={{ ...S.statValue, fontSize: 20 }}>{uploadSummary.stored}</div>
                  </div>
                </div>

                <div style={S.rowBetween}>
                  <div style={{ fontSize: 13, color: C.textMid }}>
                    Selected period: <strong style={{ color: C.text }}>{month} {year}</strong>. Only new rows will be added to storage.
                  </div>
                  <button
                    type="button"
                    style={{ ...S.btnPrimary, ...(storingAll ? S.btnDisabled : {}) }}
                    disabled={storingAll}
                    onClick={handleStoreAll}
                  >
                    <FileText size={15} />
                    {storingAll ? "Adding to Storage..." : "Add Payslips to Storage"}
                  </button>
                </div>
              </div>
            ) : null}

            <div style={{ ...S.card, ...S.cardPad }}>
              <div style={S.rowBetween}>
                <div>
                  <div style={{ fontSize: 16, color: C.text, fontWeight: 600 }}>Uploaded Employee Data</div>
                  <div style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>
                    Review row status before storing or generating a single PDF immediately.
                  </div>
                </div>
                {loading ? <div style={{ fontSize: 13, color: C.textMid }}>Processing upload...</div> : null}
              </div>

              <div style={{ ...S.filterGrid, marginTop: 14 }}>
                <div style={S.field}>
                  <label style={S.label}>Filter Uploaded Rows</label>
                  <select style={S.input} value={selectedStorageStatus} onChange={(event) => setSelectedStorageStatus(event.target.value)}>
                    <option value="all">All rows</option>
                    <option value="ready">Ready to store</option>
                    <option value="stored">Already stored</option>
                    <option value="invalid">Needs attention</option>
                  </select>
                </div>
              </div>

              <div style={S.tableWrap}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Employee ID</th>
                      <th style={S.th}>Name</th>
                      <th style={S.th}>Period</th>
                      <th style={S.th}>Net Pay</th>
                      <th style={S.th}>Storage Status</th>
                      <th style={S.th}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {uploadedRowsWithStatus.filter((row) => selectedStorageStatus === "all" || row.storage_status === selectedStorageStatus).length
                      ? uploadedRowsWithStatus
                        .filter((row) => selectedStorageStatus === "all" || row.storage_status === selectedStorageStatus)
                        .map((row, index) => (
                          <tr key={`${row.row_key}-${index}`}>
                            <td style={S.td}>{row.employee_id}</td>
                            <td style={S.td}>{row.name}</td>
                            <td style={S.td}>{row.month} {row.year}</td>
                            <td style={S.td}>{currency(row.net_pay ?? Number(row.basic || 0) + Number(row.hra || 0) + Number(row.conveyance || 0) - Number(row.pf_deduction || 0) - Number(row.professional_tax || 0) - Number(row.esi || 0))}</td>
                            <td style={S.td}>
                              <span style={S.badge}>
                                {row.storage_status === "ready" ? "Ready to store" : row.storage_status === "stored" ? "Already stored" : "Needs attention"}
                              </span>
                            </td>
                            <td style={S.td}>
                              <button
                                type="button"
                                style={{ ...S.btnSecondary, ...(generatingRow === index ? S.btnDisabled : {}) }}
                                disabled={generatingRow === index}
                                onClick={() => handleGenerate(row, index)}
                              >
                                <Download size={15} />
                                {generatingRow === index ? "Working..." : row.alreadyStored ? "Open PDF" : "Store & Open PDF"}
                              </button>
                            </td>
                          </tr>
                        ))
                      : (
                        <tr>
                          <td style={S.td} colSpan={6}>Upload an Excel file to preview rows here.</td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}

        {(!isAdmin || activeTab === "display") ? (
          <>
            {isAdmin ? (
              <div style={{ ...S.card, ...S.cardPad, marginBottom: 14 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 6 }}>Recent Uploads</div>
                <div style={{ fontSize: 12, color: C.textMid, marginBottom: 10 }}>Track the latest payroll files loaded by admin.</div>
                <div style={S.group}>
                  {(history.length ? history.slice(0, 4) : []).map((item) => (
                    <div key={item._id} style={{ ...S.payslipCard, background: "#fcfcfe" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <FileSpreadsheet size={18} color={C.purple} />
                        <strong style={{ color: C.text }}>{item.filename}</strong>
                      </div>
                      <div style={{ fontSize: 13, color: C.textMid }}>Rows parsed: {item.records_uploaded || 0}</div>
                      <div style={{ fontSize: 13, color: C.textMid, marginTop: 4 }}>
                        Uploaded: {item.uploaded_at ? new Date(item.uploaded_at).toLocaleString("en-IN") : "Unavailable"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div style={{ ...S.card, ...S.cardPad }}>
              <div style={S.rowBetween}>
                <div>
                  <div style={{ fontSize: 16, color: C.text, fontWeight: 600 }}>Payslip Archive</div>
                  <div style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>
                    Organized into expandable month-wise sections with fast filters and sorting.
                  </div>
                </div>
                <div style={S.rowGap}>
                  <button type="button" style={S.btnSecondary} onClick={() => setExpandedGroups(Object.fromEntries(groupedPayslips.map((group) => [group.key, true])))}>
                    <ChevronDown size={15} />
                    Expand All
                  </button>
                  <button type="button" style={S.btnSecondary} onClick={() => setExpandedGroups(Object.fromEntries(groupedPayslips.map((group) => [group.key, false])))}>
                    <ChevronRight size={15} />
                    Collapse All
                  </button>
                  <button type="button" style={S.btnSecondary} onClick={loadVisiblePayslips}>
                    <CalendarRange size={15} />
                    Refresh
                  </button>
                </div>
              </div>

              <div style={{ ...S.filterGrid, marginTop: 16 }}>
                <div style={S.field}>
                  <label style={S.label}>Search</label>
                  <div style={S.searchWrap}>
                    <Search size={16} style={S.searchIcon} />
                    <input
                      style={S.searchInput}
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search by employee, ID, month, year..."
                    />
                  </div>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Year</label>
                  <select style={S.input} value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)}>
                    <option value="all">All years</option>
                    {filterOptions.years.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Month</label>
                  <select style={S.input} value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
                    <option value="all">All months</option>
                    {MONTHS.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Employee</label>
                  <select style={S.input} value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)}>
                    <option value="all">All employees</option>
                    {filterOptions.employees.map((item) => {
                      const [employeeId, employeeName] = item.split("||");
                      return <option key={item} value={item}>{employeeName} ({employeeId})</option>;
                    })}
                  </select>
                </div>
                <div style={S.field}>
                  <label style={S.label}>Sort</label>
                  <select style={S.input} value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                    {SORT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>
              </div>

              <div style={S.rowGap}>
                <span style={S.badge}><Filter size={13} style={{ marginRight: 6 }} />{displaySummary.visible} filtered result{displaySummary.visible !== 1 ? "s" : ""}</span>
                <span style={S.badge}><Users size={13} style={{ marginRight: 6 }} />{displaySummary.employees} employee{displaySummary.employees !== 1 ? "s" : ""}</span>
                <span style={S.badge}><ArrowDownAZ size={13} style={{ marginRight: 6 }} />{groupedPayslips.length} month group{groupedPayslips.length !== 1 ? "s" : ""}</span>
              </div>

              {loadingPayslips ? (
                <div style={S.empty}>Loading payslips...</div>
              ) : groupedPayslips.length ? (
                <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
                  {groupedPayslips.map((group) => {
                    const totalNet = group.items.reduce((sum, item) => sum + Number(item.net_pay || 0), 0);
                    const isExpanded = expandedGroups[group.key] !== false;
                    return (
                      <div key={group.key}>
                        <button type="button" style={S.sectionHeader} onClick={() => toggleGroup(group.key)}>
                          <div style={{ textAlign: "left" }}>
                            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                              {isExpanded ? <ChevronDown size={18} color={C.purpleDark} /> : <ChevronRight size={18} color={C.purpleDark} />}
                              <strong style={{ fontSize: 16, color: C.text }}>{group.label}</strong>
                              <span style={S.badge}>{group.items.length} payslip{group.items.length !== 1 ? "s" : ""}</span>
                            </div>
                            <div style={S.groupMeta}>
                              <span>{new Set(group.items.map((item) => item.employee_id)).size} employee scope</span>
                              <span>Total net pay: {currency(totalNet)}</span>
                            </div>
                          </div>
                          <div style={{ fontSize: 12, color: C.textMid }}>
                            Period key: {group.key}
                          </div>
                        </button>

                        {isExpanded ? (
                          <div style={{ ...S.group, marginTop: 12 }}>
                            {group.items.map((item) => (
                              <article key={item._id} style={S.payslipCard}>
                                <div style={S.rowBetween}>
                                  <div>
                                    <div style={{ fontSize: 16, color: C.text, fontWeight: 700 }}>{item.employee_name}</div>
                                    <div style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>{item.employee_id}</div>
                                  </div>
                                  <div style={S.badge}>{item.month} {item.year}</div>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 14 }}>
                                  <div>
                                    <div style={{ fontSize: 12, color: C.textMid }}>Net Pay</div>
                                    <div style={{ fontSize: 16, color: C.text, fontWeight: 700 }}>{currency(item.net_pay)}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 12, color: C.textMid }}>Generated</div>
                                    <div style={{ fontSize: 13, color: C.text }}>{item.generated_at ? new Date(item.generated_at).toLocaleDateString("en-IN") : "Unavailable"}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 12, color: C.textMid }}>Gross Earnings</div>
                                    <div style={{ fontSize: 13, color: C.text }}>{currency(item.gross_earnings)}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 12, color: C.textMid }}>Deductions</div>
                                    <div style={{ fontSize: 13, color: C.text }}>{currency(item.gross_deductions)}</div>
                                  </div>
                                </div>

                                <div style={S.rowBetween}>
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.textMid, fontSize: 12, marginTop: 16 }}>
                                    {isAdmin ? <Users size={14} /> : <FileText size={14} />}
                                    Stored under {item.period_key || `${item.year}-${String(item.month_number || monthIndex(item.month)).padStart(2, "0")}`}
                                  </div>
                                  <div style={{ ...S.rowGap, marginTop: 16 }}>
                                    {isAdmin ? (
                                      <>
                                        <button type="button" style={S.btnSecondary} onClick={() => openEditModal(item)}>
                                          <Pencil size={15} />
                                          Edit
                                        </button>
                                        <button
                                          type="button"
                                          style={{ ...S.dangerTextButton, ...(deletingPayslipId === item._id ? S.btnDisabled : {}) }}
                                          disabled={deletingPayslipId === item._id}
                                          onClick={() => handleDeletePayslip(item)}
                                        >
                                          <Trash2 size={15} />
                                          {deletingPayslipId === item._id ? "Deleting..." : "Delete"}
                                        </button>
                                      </>
                                    ) : null}
                                    <button type="button" style={S.btnPrimary} onClick={() => handleDownload(item._id)}>
                                      <Download size={15} />
                                      Download PDF
                                    </button>
                                  </div>
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={S.empty}>
                  <FileText size={30} style={{ marginBottom: 10 }} />
                  <div>No payslips match the current filters.</div>
                </div>
              )}
            </div>
          </>
        ) : null}

        {isAdmin && editingPayslip && editForm ? (
          <div style={S.modalBackdrop} onClick={closeEditModal}>
            <div style={S.modalCard} onClick={(event) => event.stopPropagation()}>
              <div style={S.rowBetween}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Edit Payslip</div>
                  <div style={{ fontSize: 12, color: C.textMid, marginTop: 4 }}>{editingPayslip.employee_name} • {editingPayslip.employee_id}</div>
                </div>
                <button type="button" style={S.btnSecondary} onClick={closeEditModal}>
                  <X size={15} />
                  Close
                </button>
              </div>

              <div style={{ ...S.formGrid, marginTop: 16 }}>
                <div style={S.field}><label style={S.label}>Employee ID</label><input style={S.input} value={editForm.employee_id} onChange={(event) => setEditForm((previous) => ({ ...previous, employee_id: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>Month</label><input style={S.input} value={editForm.month} onChange={(event) => setEditForm((previous) => ({ ...previous, month: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>Year</label><input style={S.input} value={editForm.year} onChange={(event) => setEditForm((previous) => ({ ...previous, year: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>LOP Days</label><input style={S.input} value={editForm.lop_days} onChange={(event) => setEditForm((previous) => ({ ...previous, lop_days: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>STD Days</label><input style={S.input} value={editForm.std_days} onChange={(event) => setEditForm((previous) => ({ ...previous, std_days: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>Worked Days</label><input style={S.input} value={editForm.worked_days} onChange={(event) => setEditForm((previous) => ({ ...previous, worked_days: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>Bank</label><input style={S.input} value={editForm.bank} onChange={(event) => setEditForm((previous) => ({ ...previous, bank: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>Bank A/c No</label><input style={S.input} value={editForm.bank_account_no} onChange={(event) => setEditForm((previous) => ({ ...previous, bank_account_no: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>DOJ</label><input style={S.input} value={editForm.doj} onChange={(event) => setEditForm((previous) => ({ ...previous, doj: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>PF NO</label><input style={S.input} value={editForm.pf_no} onChange={(event) => setEditForm((previous) => ({ ...previous, pf_no: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>Location</label><input style={S.input} value={editForm.location} onChange={(event) => setEditForm((previous) => ({ ...previous, location: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>Department</label><input style={S.input} value={editForm.department} onChange={(event) => setEditForm((previous) => ({ ...previous, department: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>Management Level</label><input style={S.input} value={editForm.management_level} onChange={(event) => setEditForm((previous) => ({ ...previous, management_level: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>Facility</label><input style={S.input} value={editForm.facility} onChange={(event) => setEditForm((previous) => ({ ...previous, facility: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>Entity</label><input style={S.input} value={editForm.entity} onChange={(event) => setEditForm((previous) => ({ ...previous, entity: event.target.value }))} /></div>
                <div style={S.field}><label style={S.label}>PF - UAN</label><input style={S.input} value={editForm.pf_uan} onChange={(event) => setEditForm((previous) => ({ ...previous, pf_uan: event.target.value }))} /></div>
              </div>

              <div style={{ ...S.formGrid, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>Earnings</div>
                  {editForm.earnings.map((item, index) => (
                    <div key={`earning-${item.key || index}`} style={S.lineItemRow}>
                      <input style={S.input} value={item.label} onChange={(event) => handleLineItemChange("earnings", index, "label", event.target.value)} />
                      <input style={S.input} value={item.amount} onChange={(event) => handleLineItemChange("earnings", index, "amount", event.target.value)} />
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 10 }}>Deductions</div>
                  {editForm.deductions.map((item, index) => (
                    <div key={`deduction-${item.key || index}`} style={S.lineItemRow}>
                      <input style={S.input} value={item.label} onChange={(event) => handleLineItemChange("deductions", index, "label", event.target.value)} />
                      <input style={S.input} value={item.amount} onChange={(event) => handleLineItemChange("deductions", index, "amount", event.target.value)} />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ ...S.rowBetween, marginTop: 18 }}>
                <div style={{ fontSize: 12, color: C.textMid }}>Saving recalculates gross earnings, deductions, and net pay automatically.</div>
                <div style={S.rowGap}>
                  <button type="button" style={S.btnSecondary} onClick={closeEditModal}>Cancel</button>
                  <button type="button" style={{ ...S.btnPrimary, ...(savingEdit ? S.btnDisabled : {}) }} disabled={savingEdit} onClick={handleSaveEdit}>
                    <Pencil size={15} />
                    {savingEdit ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default Payslips;
