import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { CalendarRange, ChevronDown, ChevronUp, Clock3, Download, Filter, History, RefreshCw, Save, ShieldCheck, Trash2, Unlock, UserCog } from "lucide-react";

import { buildRequesterHeaders, getRequesterId } from "../utils/requester";
import ValueHelpSearch from "./ValueHelpSearch";
import ValueHelpSelect from "./ValueHelpSelect";

const API_BASE = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000";

const getReportingLeadLabel = (item = {}) =>
  item.reportingLeadName ||
  item.reporting_manager_name ||
  item.reportingManagerName ||
  item.reportingLead ||
  item.reporting_manager ||
  item.reportingManager ||
  item.managerName ||
  item.manager ||
  "";

const normalizeValue = (value) => String(value || "").trim().toLowerCase();

const getFortnightBounds = (monthValue, half) => {
  if (!/^\d{4}-\d{2}$/.test(monthValue || "")) return null;
  const [year, month] = monthValue.split("-").map(Number);
  const monthEnd = new Date(year, month, 0).getDate();
  const prefix = `${monthValue}-`;
  return half === "second"
    ? { start: `${prefix}16`, end: `${prefix}${String(monthEnd).padStart(2, "0")}` }
    : { start: `${prefix}01`, end: `${prefix}15` };
};

const getCurrentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const mergeEmployeeOverridesIntoHistory = (history, overrides) => {
  const records = Array.isArray(history) ? [...history] : [];
  const existingKeys = new Set(records.map((item) => [item.employee_id, item.effective_start, item.effective_end, item.notes].join("|")));
  (Array.isArray(overrides) ? overrides : []).forEach((item) => {
    const key = [item.employee_id, item.effective_start, item.effective_end, item.notes].join("|");
    if (existingKeys.has(key)) return;
    records.push({
      ...item,
      action: "created",
      scope: "employee",
      changed_at: item.updated_at || item.created_at || null,
      changed_by_name: item.updated_by_name || "",
      changed_by_email: item.updated_by_email || "",
    });
    existingKeys.add(key);
  });
  return records;
};

const sortUsers = (items, sortBy) => {
  const ranked = [...items];
  ranked.sort((first, second) => {
    switch (sortBy) {
      case "name_desc":
        return normalizeValue(second.name).localeCompare(normalizeValue(first.name));
      case "department":
        return normalizeValue(first.department).localeCompare(normalizeValue(second.department))
          || normalizeValue(first.name).localeCompare(normalizeValue(second.name));
      case "role":
        return normalizeValue(first.role).localeCompare(normalizeValue(second.role))
          || normalizeValue(first.name).localeCompare(normalizeValue(second.name));
      case "designation":
        return normalizeValue(first.designation).localeCompare(normalizeValue(second.designation))
          || normalizeValue(first.name).localeCompare(normalizeValue(second.name));
      case "menu_count_desc":
        return ((second.adminMenuAccess || []).length - (first.adminMenuAccess || []).length)
          || normalizeValue(first.name).localeCompare(normalizeValue(second.name));
      case "menu_count_asc":
        return ((first.adminMenuAccess || []).length - (second.adminMenuAccess || []).length)
          || normalizeValue(first.name).localeCompare(normalizeValue(second.name));
      case "recent_status":
        return Number(Boolean(second.is_active)) - Number(Boolean(first.is_active))
          || normalizeValue(first.name).localeCompare(normalizeValue(second.name));
      case "name_asc":
      default:
        return normalizeValue(first.name).localeCompare(normalizeValue(second.name));
    }
  });
  return ranked;
};

const formatHistoryTime = (value) => {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getHistoryActionLabel = (item) => {
  if (item.module === "admin-access") {
    const action = item.action || "updated";
    return `Admin access ${action}`;
  }
  if (item.module === "workflow-preferences") {
    return `Workflow preferences ${item.action || "updated"}`;
  }
  const scope = item.scope === "global" ? "Global rule" : "Employee rule";
  const action = item.action || "updated";
  return `${scope} ${action}`;
};

const getHistoryDetails = (item) => {
  if (item.module === "admin-access") {
    return [...(item.granted_menu_labels || []).map((label) => `+ ${label}`), ...(item.removed_menu_labels || []).map((label) => `- ${label}`)].join(", ") || "No menu changes";
  }
  if (item.module === "workflow-preferences") {
    return [
      `Timesheet approvers: ${(item.timesheet_approvers || []).join(", ") || "None"}`,
      `Timesheet notifiers: ${(item.timesheet_notifiers || []).join(", ") || "None"}`,
      `Leave approvers: ${(item.leave_approvers || []).join(", ") || "None"}`,
      `Leave notifiers: ${(item.leave_notifiers || []).join(", ") || "None"}`,
    ];
  }
  return [`First: Day ${item.first_fortnight_block_day || "—"}`, `Second: Day ${item.second_fortnight_block_day || "—"}`];
};

const AccessManagement = ({ user }) => {
  const [activeTab, setActiveTab] = useState("admin-access");
  const [options, setOptions] = useState([]);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [roleFilter, setRoleFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [designationFilter, setDesignationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [accessTypeFilter, setAccessTypeFilter] = useState("all");
  const [menuFilter, setMenuFilter] = useState("all");
  const [emailDomainFilter, setEmailDomainFilter] = useState("all");
  const [employeeIdFilter, setEmployeeIdFilter] = useState("all");
  const [reportingLeadFilter, setReportingLeadFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name_asc");
  const [savingUserId, setSavingUserId] = useState("");
  const [blockSettings, setBlockSettings] = useState({
    first_fortnight_block_day: 14,
    second_fortnight_block_day: 28,
    effective_start: "",
    effective_end: "",
  });
  const [employeeBlockOverrides, setEmployeeBlockOverrides] = useState([]);
  const [adminAccessHistory, setAdminAccessHistory] = useState([]);
  const [blockHistory, setBlockHistory] = useState([]);
  const [overrideDraft, setOverrideDraft] = useState({
    _id: "",
    employee_id: "",
    first_fortnight_block_day: 14,
    second_fortnight_block_day: 28,
    effective_start: "",
    effective_end: "",
    notes: "",
  });
  const [periodUnlockDraft, setPeriodUnlockDraft] = useState({
    employee_id: "",
    month: getCurrentMonthValue(),
    half: "first",
    notes: "",
  });
  const [overrideSearch, setOverrideSearch] = useState("");
  const [overrideDateFilter, setOverrideDateFilter] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyModuleFilter, setHistoryModuleFilter] = useState("all");
  const [historyScopeFilter, setHistoryScopeFilter] = useState("all");
  const [historyActionFilter, setHistoryActionFilter] = useState("all");
  const [historyChangedByFilter, setHistoryChangedByFilter] = useState("all");
  const [historyDepartmentFilter, setHistoryDepartmentFilter] = useState("all");
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");
  const [historyFirstDayFilter, setHistoryFirstDayFilter] = useState("all");
  const [historySecondDayFilter, setHistorySecondDayFilter] = useState("all");
  const [historySortBy, setHistorySortBy] = useState("newest");
  const [historyHasRun, setHistoryHasRun] = useState(false);
  const [savingBlockSettings, setSavingBlockSettings] = useState(false);
  const [workflowPreferences, setWorkflowPreferences] = useState([]);
  const [workflowHistory, setWorkflowHistory] = useState([]);
  const [workflowEmployeeIds, setWorkflowEmployeeIds] = useState([]);
  const [workflowDraft, setWorkflowDraft] = useState({
    timesheet: { approver_ids: [], notifier_ids: [] },
    leave: { approver_ids: [], notifier_ids: [] },
  });
  const [savingWorkflow, setSavingWorkflow] = useState(false);
  const [workflowRuleFilters, setWorkflowRuleFilters] = useState({
    search: "", employee: "all", department: "all", timesheetApprover: "all", timesheetNotifier: "all", leaveApprover: "all", leaveNotifier: "all", updatedBy: "all", from: "", to: "", sort: "updated_desc",
  });
  const [workflowRulePendingDelete, setWorkflowRulePendingDelete] = useState(null);
  const [deletingWorkflowRule, setDeletingWorkflowRule] = useState(false);
  const [workflowRuleEditing, setWorkflowRuleEditing] = useState(null);
  const [savingWorkflowRuleEdit, setSavingWorkflowRuleEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const requesterHeaders = useMemo(() => buildRequesterHeaders(user), [user]);
  const requesterId = getRequesterId(user);

  const loadWorkspace = async () => {
    try {
      setLoading(true);
      setMessage("");
      const response = await axios.get(`${API_BASE}/api/users/access-management`, {
        headers: requesterHeaders,
      });
      const [blockSettingsResponse, workflowResponse] = await Promise.all([axios.get(`${API_BASE}/api/timesheets/block-settings`, {
        headers: requesterHeaders,
      }), axios.get(`${API_BASE}/api/users/access-management/workflow-preferences`, { headers: requesterHeaders })]);
      setOptions(Array.isArray(response.data?.options) ? response.data.options : []);
      setUsers(Array.isArray(response.data?.users) ? response.data.users : []);
      setAdminAccessHistory(Array.isArray(response.data?.history) ? response.data.history : []);
      const globalSettings = blockSettingsResponse.data?.global || blockSettingsResponse.data || {};
      setBlockSettings({
        first_fortnight_block_day: Number(globalSettings.first_fortnight_block_day || 14),
        second_fortnight_block_day: Number(globalSettings.second_fortnight_block_day || 28),
        effective_start: globalSettings.effective_start || "",
        effective_end: globalSettings.effective_end || "",
      });
      const employeeOverrides = Array.isArray(blockSettingsResponse.data?.employee_overrides)
        ? blockSettingsResponse.data.employee_overrides
        : [];
      const savedHistory = Array.isArray(blockSettingsResponse.data?.history)
        ? blockSettingsResponse.data.history
        : [];
      setEmployeeBlockOverrides(employeeOverrides);
      setBlockHistory(mergeEmployeeOverridesIntoHistory(savedHistory, employeeOverrides));
      setWorkflowPreferences(Array.isArray(workflowResponse.data?.preferences) ? workflowResponse.data.preferences : []);
      setWorkflowHistory(Array.isArray(workflowResponse.data?.history) ? workflowResponse.data.history : []);
    } catch (error) {
      console.error("Failed to load access management data", error);
      setMessage(error.response?.data?.error || "Failed to load access management data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!requesterId) return;
    loadWorkspace();
  }, [requesterId]); // eslint-disable-line react-hooks/exhaustive-deps

  const roleOptions = useMemo(
    () => Array.from(new Set(users.map((item) => item.role).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [users]
  );

  const departmentOptions = useMemo(
    () => Array.from(new Set(users.map((item) => item.department).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [users]
  );

  const designationOptions = useMemo(
    () => Array.from(new Set(users.map((item) => item.designation).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [users]
  );

  const reportingLeadOptions = useMemo(
    () => Array.from(new Set(users.map((item) => getReportingLeadLabel(item)).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [users]
  );

  const workflowPeopleOptions = useMemo(() => users
    .filter((item) => item.is_active !== false)
    .map((item) => ({
      value: item._id,
      label: item.name || item.email || item.employeeId || item._id,
      description: [item.email, item.employeeId, item.department, item.designation].filter(Boolean).join(" • "),
    })), [users]);

  useEffect(() => {
    if (workflowEmployeeIds.length !== 1) return;
    const saved = workflowPreferences.find((item) => item.employee_id === workflowEmployeeIds[0]);
    setWorkflowDraft(saved ? {
      timesheet: saved.timesheet || { approver_ids: [], notifier_ids: [] },
      leave: saved.leave || { approver_ids: [], notifier_ids: [] },
    } : {
      timesheet: { approver_ids: [], notifier_ids: [] },
      leave: { approver_ids: [], notifier_ids: [] },
    });
  }, [workflowEmployeeIds, workflowPreferences]);

  const updateWorkflowDraft = (module, field, value) => {
    setWorkflowDraft((current) => ({ ...current, [module]: { ...current[module], [field]: value } }));
  };

  const renderWorkflowSelection = (selectedIds, onRemove, emptyLabel) => {
    const selectedPeople = (selectedIds || [])
      .map((id) => workflowPeopleOptions.find((item) => item.value === id))
      .filter(Boolean);
    if (!selectedPeople.length) return <small className="workflow-selection-empty">{emptyLabel}</small>;
    return (
      <div className="workflow-selection-chips" aria-label={emptyLabel}>
        {selectedPeople.map((person) => (
          <button type="button" key={person.value} onClick={() => onRemove(person.value)} title={`Remove ${person.label}`}>
            <span>{person.label}</span>
            <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>
    );
  };

  const saveWorkflowPreferences = async () => {
    if (!workflowEmployeeIds.length) {
      setMessage("Select one or more employees first");
      return;
    }
    setSavingWorkflow(true);
    setMessage("");
    try {
      const response = await axios.put(`${API_BASE}/api/users/access-management/workflow-preferences`, {
        employee_ids: workflowEmployeeIds,
        timesheet: workflowDraft.timesheet,
        leave: workflowDraft.leave,
      }, { headers: requesterHeaders });
      const updated = response.data?.preferences || [];
      setWorkflowPreferences((current) => [
        ...current.filter((item) => !workflowEmployeeIds.includes(item.employee_id)),
        ...updated,
      ]);
      setWorkflowHistory(Array.isArray(response.data?.history) ? response.data.history : workflowHistory);
      setMessage(`Workflow preferences saved for ${workflowEmployeeIds.length} employee${workflowEmployeeIds.length === 1 ? "" : "s"}`);
    } catch (error) {
      setMessage(error.response?.data?.error || "Failed to save workflow preferences");
    } finally {
      setSavingWorkflow(false);
    }
  };

  const workflowRules = useMemo(() => workflowPreferences.map((preference) => {
    const employee = users.find((item) => item._id === preference.employee_id) || {};
    const labels = (ids) => (ids || []).map((id) => workflowPeopleOptions.find((item) => item.value === id)?.label || id);
    return {
      ...preference,
      employeeName: employee.name || employee.email || preference.employee_id,
      employeeEmail: employee.email || "",
      department: employee.department || "",
      timesheetApprovers: labels(preference.timesheet?.approver_ids),
      timesheetNotifiers: labels(preference.timesheet?.notifier_ids),
      leaveApprovers: labels(preference.leave?.approver_ids),
      leaveNotifiers: labels(preference.leave?.notifier_ids),
    };
  }), [users, workflowPeopleOptions, workflowPreferences]);

  const workflowRuleOptions = useMemo(() => {
    const optionSet = (values) => Array.from(new Set(values.flat().filter(Boolean))).sort((a, b) => a.localeCompare(b)).map((value) => ({ value, label: value }));
    return {
      employees: workflowRules.map((item) => ({ value: item.employee_id, label: item.employeeName, description: item.employeeEmail })),
      departments: optionSet(workflowRules.map((item) => [item.department])),
      timesheetApprovers: optionSet(workflowRules.map((item) => item.timesheetApprovers)),
      timesheetNotifiers: optionSet(workflowRules.map((item) => item.timesheetNotifiers)),
      leaveApprovers: optionSet(workflowRules.map((item) => item.leaveApprovers)),
      leaveNotifiers: optionSet(workflowRules.map((item) => item.leaveNotifiers)),
      updatedBy: optionSet(workflowRules.map((item) => [item.updated_by_name])),
    };
  }, [workflowRules]);

  const filteredWorkflowRules = useMemo(() => {
    const filters = workflowRuleFilters;
    const query = normalizeValue(filters.search);
    return workflowRules.filter((item) => {
      const updated = item.updated_at ? new Date(item.updated_at).getTime() : 0;
      const text = [item.employeeName, item.employeeEmail, item.department, item.updated_by_name, ...item.timesheetApprovers, ...item.timesheetNotifiers, ...item.leaveApprovers, ...item.leaveNotifiers].join(" ").toLowerCase();
      return (!query || text.includes(query))
        && (filters.employee === "all" || item.employee_id === filters.employee)
        && (filters.department === "all" || item.department === filters.department)
        && (filters.timesheetApprover === "all" || item.timesheetApprovers.includes(filters.timesheetApprover))
        && (filters.timesheetNotifier === "all" || item.timesheetNotifiers.includes(filters.timesheetNotifier))
        && (filters.leaveApprover === "all" || item.leaveApprovers.includes(filters.leaveApprover))
        && (filters.leaveNotifier === "all" || item.leaveNotifiers.includes(filters.leaveNotifier))
        && (filters.updatedBy === "all" || item.updated_by_name === filters.updatedBy)
        && (!filters.from || updated >= new Date(`${filters.from}T00:00:00`).getTime())
        && (!filters.to || updated <= new Date(`${filters.to}T23:59:59`).getTime());
    }).sort((first, second) => filters.sort === "employee_asc"
      ? first.employeeName.localeCompare(second.employeeName)
      : new Date(second.updated_at || 0) - new Date(first.updated_at || 0));
  }, [workflowRuleFilters, workflowRules]);

  const updateWorkflowRuleFilter = (field, value) => setWorkflowRuleFilters((current) => ({ ...current, [field]: value }));

  const exportWorkflowRulesToCsv = () => {
    const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = filteredWorkflowRules.map((rule) => [
      rule.employeeName,
      rule.employeeEmail,
      rule.department,
      rule.timesheetApprovers.join(", "),
      rule.timesheetNotifiers.join(", "),
      rule.leaveApprovers.join(", "),
      rule.leaveNotifiers.join(", "),
      rule.updated_by_name,
      formatHistoryTime(rule.updated_at),
    ]);
    const csv = [["Employee", "Email", "Department", "Timesheet Approvers", "Timesheet Notifiers", "Leave Approvers", "Leave Notifiers", "Updated By", "Last Updated"], ...rows]
      .map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "leave-timesheet-routing-rules.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const editWorkflowRule = (rule) => {
    setWorkflowRuleEditing({
      ...rule,
      timesheet: rule.timesheet || { approver_ids: [], notifier_ids: [] },
      leave: rule.leave || { approver_ids: [], notifier_ids: [] },
    });
  };

  const updateWorkflowRuleEdit = (module, field, value) => {
    setWorkflowRuleEditing((current) => ({ ...current, [module]: { ...current[module], [field]: value } }));
  };

  const saveWorkflowRuleEdit = async () => {
    if (!workflowRuleEditing) return;
    if (!(workflowRuleEditing.timesheet?.approver_ids || []).length || !(workflowRuleEditing.leave?.approver_ids || []).length) {
      setMessage("Select at least one approver for both timesheets and leaves");
      return;
    }
    setSavingWorkflowRuleEdit(true);
    try {
      const response = await axios.put(`${API_BASE}/api/users/access-management/workflow-preferences`, {
        employee_ids: [workflowRuleEditing.employee_id],
        timesheet: workflowRuleEditing.timesheet,
        leave: workflowRuleEditing.leave,
      }, { headers: requesterHeaders });
      setWorkflowPreferences((current) => [
        ...current.filter((item) => item.employee_id !== workflowRuleEditing.employee_id),
        ...(response.data?.preferences || []),
      ]);
      setWorkflowHistory(Array.isArray(response.data?.history) ? response.data.history : workflowHistory);
      setWorkflowRuleEditing(null);
      setMessage("Routing rule updated");
    } catch (error) {
      setMessage(error.response?.data?.error || "Failed to update routing rule");
    } finally {
      setSavingWorkflowRuleEdit(false);
    }
  };

  const deleteWorkflowRule = async () => {
    if (!workflowRulePendingDelete) return;
    setDeletingWorkflowRule(true);
    try {
      const response = await axios.delete(`${API_BASE}/api/users/access-management/workflow-preferences/${workflowRulePendingDelete.employee_id}`, { headers: requesterHeaders });
      setWorkflowPreferences((current) => current.filter((item) => item.employee_id !== workflowRulePendingDelete.employee_id));
      setWorkflowHistory(Array.isArray(response.data?.history) ? response.data.history : workflowHistory);
      setWorkflowEmployeeIds((current) => current.filter((item) => item !== workflowRulePendingDelete.employee_id));
      setMessage("Routing rule removed");
      setWorkflowRulePendingDelete(null);
    } catch (error) {
      setMessage(error.response?.data?.error || "Failed to remove routing rule");
    } finally {
      setDeletingWorkflowRule(false);
    }
  };

  const emailDomainOptions = useMemo(
    () =>
      Array.from(
        new Set(
          users
            .map((item) => String(item.email || "").split("@")[1] || "")
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [users]
  );

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = users.filter((item) => {
      const menuAccess = Array.isArray(item.adminMenuAccess) ? item.adminMenuAccess : [];
      const reportingLead = getReportingLeadLabel(item);
      const emailDomain = String(item.email || "").split("@")[1] || "";
      const matchesSearch = !query || [
        item.name,
        item.email,
        item.role,
        item.department,
        item.designation,
        item.employeeId,
        reportingLead,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      const matchesRole = roleFilter === "all" || (item.role || "") === roleFilter;
      const matchesDepartment = departmentFilter === "all" || (item.department || "") === departmentFilter;
      const matchesDesignation = designationFilter === "all" || (item.designation || "") === designationFilter;
      const matchesStatus = statusFilter === "all"
        || (statusFilter === "active" && item.is_active !== false)
        || (statusFilter === "inactive" && item.is_active === false)
        || (statusFilter === "full_admin" && item.hasFullAdminAccess)
        || (statusFilter === "delegated" && !item.hasFullAdminAccess && menuAccess.length > 0)
        || (statusFilter === "no_delegation" && !item.hasFullAdminAccess && menuAccess.length === 0);
      const matchesAccessType = accessTypeFilter === "all"
        || (accessTypeFilter === "admins_only" && item.hasFullAdminAccess)
        || (accessTypeFilter === "delegated_only" && !item.hasFullAdminAccess && menuAccess.length > 0)
        || (accessTypeFilter === "eligible_only" && !item.hasFullAdminAccess)
        || (accessTypeFilter === "without_access" && !item.hasFullAdminAccess && menuAccess.length === 0);
      const matchesMenu = menuFilter === "all" || menuAccess.includes(menuFilter);
      const matchesEmailDomain = emailDomainFilter === "all" || emailDomain === emailDomainFilter;
      const matchesEmployeeId = employeeIdFilter === "all"
        || (employeeIdFilter === "present" && Boolean(item.employeeId))
        || (employeeIdFilter === "missing" && !item.employeeId);
      const matchesReportingLead = reportingLeadFilter === "all" || reportingLead === reportingLeadFilter;

      return matchesSearch
        && matchesRole
        && matchesDepartment
        && matchesDesignation
        && matchesStatus
        && matchesAccessType
        && matchesMenu
        && matchesEmailDomain
        && matchesEmployeeId
        && matchesReportingLead;
    });

    return sortUsers(filtered, sortBy);
  }, [
    accessTypeFilter,
    departmentFilter,
    designationFilter,
    emailDomainFilter,
    employeeIdFilter,
    menuFilter,
    reportingLeadFilter,
    roleFilter,
    search,
    sortBy,
    statusFilter,
    users,
  ]);

  const stats = useMemo(
    () => ({
      people: users.filter((item) => !item.hasFullAdminAccess).length,
      delegated: users.filter((item) => (item.adminMenuAccess || []).length > 0).length,
      admins: users.filter((item) => item.hasFullAdminAccess).length,
    }),
    [users]
  );

  const searchSuggestions = useMemo(() => {
    const seen = new Set();
    return users.flatMap((item) => {
      const values = [
        {
          value: item.name || "",
          label: item.name || "",
          description: item.email || item.department || item.role || "",
        },
        {
          value: item.email || "",
          label: item.email || "",
          description: item.name || item.department || item.role || "",
        },
        {
          value: item.employeeId || "",
          label: item.employeeId || "",
          description: item.name || item.email || "",
        },
        {
          value: item.department || "",
          label: item.department || "",
          description: "Department",
        },
        {
          value: item.role || "",
          label: item.role || "",
          description: "Role",
        },
        {
          value: getReportingLeadLabel(item) || "",
          label: getReportingLeadLabel(item) || "",
          description: "Reporting lead",
        },
      ].filter((entry) => entry.value);

      return values.filter((entry) => {
        const key = `${entry.value}`.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
  }, [users]);

  const roleFilterOptions = useMemo(
    () => [
      { value: "all", label: "All roles" },
      ...roleOptions.map((option) => ({ value: option, label: option })),
    ],
    [roleOptions]
  );
  const departmentFilterOptions = useMemo(
    () => [
      { value: "all", label: "All departments" },
      ...departmentOptions.map((option) => ({ value: option, label: option })),
    ],
    [departmentOptions]
  );
  const designationFilterOptions = useMemo(
    () => [
      { value: "all", label: "All designations" },
      ...designationOptions.map((option) => ({ value: option, label: option })),
    ],
    [designationOptions]
  );
  const statusFilterOptions = useMemo(
    () => [
      { value: "all", label: "All statuses" },
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "full_admin", label: "Full Admin" },
      { value: "delegated", label: "Delegated Access" },
      { value: "no_delegation", label: "No Delegation" },
    ],
    []
  );
  const accessTypeFilterOptions = useMemo(
    () => [
      { value: "all", label: "All access types" },
      { value: "admins_only", label: "Full admins only" },
      { value: "delegated_only", label: "Delegated users only" },
      { value: "eligible_only", label: "Eligible non-admin users" },
      { value: "without_access", label: "Without delegated access" },
    ],
    []
  );
  const menuFilterOptions = useMemo(
    () => [
      { value: "all", label: "All menus" },
      ...options.map((option) => ({
        value: option.key,
        label: option.label,
        description: option.description || "",
      })),
    ],
    [options]
  );
  const emailDomainFilterOptions = useMemo(
    () => [
      { value: "all", label: "All domains" },
      ...emailDomainOptions.map((option) => ({ value: option, label: option })),
    ],
    [emailDomainOptions]
  );
  const employeeIdFilterOptions = useMemo(
    () => [
      { value: "all", label: "Any employee ID state" },
      { value: "present", label: "Has employee ID" },
      { value: "missing", label: "Missing employee ID" },
    ],
    []
  );
  const reportingLeadFilterOptions = useMemo(
    () => [
      { value: "all", label: "All reporting leads" },
      ...reportingLeadOptions.map((option) => ({ value: option, label: option })),
    ],
    [reportingLeadOptions]
  );
  const sortByOptions = useMemo(
    () => [
      { value: "name_asc", label: "Name A-Z" },
      { value: "name_desc", label: "Name Z-A" },
      { value: "department", label: "Department" },
      { value: "role", label: "Role" },
      { value: "designation", label: "Designation" },
      { value: "menu_count_desc", label: "Most grants first" },
      { value: "menu_count_asc", label: "Least grants first" },
      { value: "recent_status", label: "Active users first" },
    ],
    []
  );
  const employeeBlockOptions = useMemo(
    () => users
      .filter((item) => !item.hasFullAdminAccess)
      .map((item) => ({
        value: item._id,
        label: item.name || item.email || item.employeeId || item._id,
        description: [item.employeeId, item.email, item.department].filter(Boolean).join(" • "),
      })),
    [users]
  );
  const filteredEmployeeBlockOverrides = useMemo(() => {
    const query = overrideSearch.trim().toLowerCase();
    return employeeBlockOverrides.filter((item) => {
      const matchesSearch = !query || [
        item.employee_name,
        item.employee_email,
        item.employee_id,
        item.notes,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
      const matchesDate = !overrideDateFilter
        || (
          (!item.effective_start || item.effective_start <= overrideDateFilter)
          && (!item.effective_end || item.effective_end >= overrideDateFilter)
        );
      return matchesSearch && matchesDate;
    });
  }, [employeeBlockOverrides, overrideDateFilter, overrideSearch]);

  const combinedHistory = useMemo(
    () => [
      ...adminAccessHistory.map((item) => ({
        ...item,
        module: item.module || "admin-access",
        scope: item.scope || "admin-access",
      })),
      ...blockHistory.map((item) => ({
        ...item,
        module: "timesheet-access",
      })),
      ...workflowHistory.map((item) => ({ ...item, module: "workflow-preferences", scope: "employee" })),
    ],
    [adminAccessHistory, blockHistory, workflowHistory]
  );

  const historyActionOptions = useMemo(() => {
    const actions = Array.from(new Set(combinedHistory.map((item) => item.action).filter(Boolean)));
    return [
      { value: "all", label: "All actions" },
      ...actions.sort((a, b) => a.localeCompare(b)).map((action) => ({
        value: action,
        label: action.charAt(0).toUpperCase() + action.slice(1),
      })),
    ];
  }, [combinedHistory]);

  const historyFirstDayOptions = useMemo(
    () => [
      { value: "all", label: "Any first day" },
      ...Array.from({ length: 31 }, (_, index) => index + 1).map((day) => ({
        value: String(day),
        label: `Day ${day}`,
      })),
    ],
    []
  );

  const historySecondDayOptions = useMemo(
    () => [
      { value: "all", label: "Any second day" },
      ...Array.from({ length: 31 }, (_, index) => index + 1).map((day) => ({
        value: String(day),
        label: `Day ${day}`,
      })),
    ],
    []
  );

  const historyScopeOptions = useMemo(
    () => [
      { value: "all", label: "All scopes" },
      { value: "admin-access", label: "Admin access changes" },
      { value: "global", label: "Global rules" },
      { value: "employee", label: "Employee rules" },
    ],
    []
  );

  const historyModuleOptions = useMemo(
    () => [
      { value: "all", label: "All history" },
      { value: "admin-access", label: "Admin Access" },
      { value: "timesheet-access", label: "Timesheet Access" },
      { value: "workflow-preferences", label: "Leave/Timesheets Preferences" },
    ],
    []
  );

  const historySortOptions = useMemo(
    () => [
      { value: "newest", label: "Newest first" },
      { value: "oldest", label: "Oldest first" },
      { value: "scope", label: "Scope" },
      { value: "module", label: "Module" },
      { value: "action", label: "Action" },
      { value: "employee", label: "Employee" },
    ],
    []
  );

  const historySearchSuggestions = useMemo(() => {
    const seen = new Set();
    return combinedHistory.flatMap((item) => {
      const values = [
        item.employee_name,
        item.employee_email,
        item.changed_by_name,
        item.changed_by_email,
        item.notes,
        item.employee_code,
        item.role,
        item.department,
        item.designation,
        ...(item.granted_menu_labels || []),
        ...(item.removed_menu_labels || []),
        ...(item.resulting_access_labels || []),
        ...(item.timesheet_approvers || []),
        ...(item.timesheet_notifiers || []),
        ...(item.leave_approvers || []),
        ...(item.leave_notifiers || []),
        item.action,
        item.scope,
        item.module,
      ].flat().filter(Boolean);

      return values.map((value) => String(value)).filter((value) => {
        const key = value.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).map((value) => ({
        value,
        label: value,
        description: "History",
      }));
    });
  }, [combinedHistory]);

  const historyChangedByOptions = useMemo(() => {
    const admins = Array.from(new Set(combinedHistory.map((item) => item.changed_by_email || item.changed_by_name).filter(Boolean)));
    return [
      { value: "all", label: "All admins" },
      ...admins.sort((a, b) => a.localeCompare(b)).map((admin) => ({ value: admin, label: admin })),
    ];
  }, [combinedHistory]);

  const historyDepartmentOptions = useMemo(() => {
    const departments = Array.from(new Set(combinedHistory.map((item) => item.department).filter(Boolean)));
    return [
      { value: "all", label: "All departments" },
      ...departments.sort((a, b) => a.localeCompare(b)).map((department) => ({ value: department, label: department })),
    ];
  }, [combinedHistory]);

  const filteredBlockHistory = useMemo(() => {
    const query = historySearch.trim().toLowerCase();
    const startTime = historyFromDate ? new Date(`${historyFromDate}T00:00:00`).getTime() : null;
    const endTime = historyToDate ? new Date(`${historyToDate}T23:59:59`).getTime() : null;

    const filtered = combinedHistory.filter((item) => {
      const changedTime = item.changed_at ? new Date(item.changed_at).getTime() : null;
      const matchesSearch = !query || [
        item.employee_name,
        item.employee_email,
        item.employee_code,
        item.role,
        item.department,
        item.designation,
        item.changed_by_name,
        item.changed_by_email,
        item.notes,
        ...(item.granted_menu_labels || []),
        ...(item.removed_menu_labels || []),
        ...(item.resulting_access_labels || []),
        ...(item.timesheet_approvers || []),
        ...(item.timesheet_notifiers || []),
        ...(item.leave_approvers || []),
        ...(item.leave_notifiers || []),
        item.action,
        item.scope,
        item.module,
        getHistoryActionLabel(item),
      ].flat().filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
      const matchesModule = historyModuleFilter === "all" || item.module === historyModuleFilter;
      const matchesScope = historyScopeFilter === "all" || item.scope === historyScopeFilter;
      const matchesAction = historyActionFilter === "all" || item.action === historyActionFilter;
      const changedBy = item.changed_by_email || item.changed_by_name || "";
      const matchesChangedBy = historyChangedByFilter === "all" || changedBy === historyChangedByFilter;
      const matchesDepartment = historyDepartmentFilter === "all" || item.department === historyDepartmentFilter;
      const matchesFirstDay = historyFirstDayFilter === "all"
        || item.module === "admin-access"
        || String(item.first_fortnight_block_day || "") === historyFirstDayFilter;
      const matchesSecondDay = historySecondDayFilter === "all"
        || item.module === "admin-access"
        || String(item.second_fortnight_block_day || "") === historySecondDayFilter;
      const matchesStart = !startTime || (changedTime && changedTime >= startTime);
      const matchesEnd = !endTime || (changedTime && changedTime <= endTime);

      return matchesSearch
        && matchesModule
        && matchesScope
        && matchesAction
        && matchesChangedBy
        && matchesDepartment
        && matchesFirstDay
        && matchesSecondDay
        && matchesStart
        && matchesEnd;
    });

    filtered.sort((first, second) => {
      const firstTime = first.changed_at ? new Date(first.changed_at).getTime() : 0;
      const secondTime = second.changed_at ? new Date(second.changed_at).getTime() : 0;
      switch (historySortBy) {
        case "oldest":
          return firstTime - secondTime;
        case "scope":
          return normalizeValue(first.scope).localeCompare(normalizeValue(second.scope)) || secondTime - firstTime;
        case "action":
          return normalizeValue(first.action).localeCompare(normalizeValue(second.action)) || secondTime - firstTime;
        case "employee":
          return normalizeValue(first.employee_name || first.employee_email).localeCompare(normalizeValue(second.employee_name || second.employee_email)) || secondTime - firstTime;
        case "module":
          return normalizeValue(first.module).localeCompare(normalizeValue(second.module)) || secondTime - firstTime;
        case "newest":
        default:
          return secondTime - firstTime;
      }
    });

    return filtered;
  }, [
    combinedHistory,
    historyActionFilter,
    historyChangedByFilter,
    historyDepartmentFilter,
    historyFirstDayFilter,
    historyFromDate,
    historyModuleFilter,
    historyScopeFilter,
    historySearch,
    historySecondDayFilter,
    historySortBy,
    historyToDate,
  ]);

  const historyActiveFilterCount = useMemo(
    () => [
      historySearch.trim(),
      historyModuleFilter !== "all",
      historyScopeFilter !== "all",
      historyActionFilter !== "all",
      historyChangedByFilter !== "all",
      historyDepartmentFilter !== "all",
      historyFromDate,
      historyToDate,
      historyFirstDayFilter !== "all",
      historySecondDayFilter !== "all",
      historySortBy !== "newest",
    ].filter(Boolean).length,
    [
      historyActionFilter,
      historyChangedByFilter,
      historyDepartmentFilter,
      historyFirstDayFilter,
      historyFromDate,
      historyScopeFilter,
      historySearch,
      historyModuleFilter,
      historySecondDayFilter,
      historySortBy,
      historyToDate,
    ]
  );

  const activeFilterCount = useMemo(
    () => [
      search.trim(),
      roleFilter !== "all",
      departmentFilter !== "all",
      designationFilter !== "all",
      statusFilter !== "all",
      accessTypeFilter !== "all",
      menuFilter !== "all",
      emailDomainFilter !== "all",
      employeeIdFilter !== "all",
      reportingLeadFilter !== "all",
      sortBy !== "name_asc",
    ].filter(Boolean).length,
    [
      accessTypeFilter,
      departmentFilter,
      designationFilter,
      emailDomainFilter,
      employeeIdFilter,
      menuFilter,
      reportingLeadFilter,
      roleFilter,
      search,
      sortBy,
      statusFilter,
    ]
  );

  const resetFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setDepartmentFilter("all");
    setDesignationFilter("all");
    setStatusFilter("all");
    setAccessTypeFilter("all");
    setMenuFilter("all");
    setEmailDomainFilter("all");
    setEmployeeIdFilter("all");
    setReportingLeadFilter("all");
    setSortBy("name_asc");
  };

  const resetHistoryFilters = () => {
    setHistorySearch("");
    setHistoryModuleFilter("all");
    setHistoryScopeFilter("all");
    setHistoryActionFilter("all");
    setHistoryChangedByFilter("all");
    setHistoryDepartmentFilter("all");
    setHistoryFromDate("");
    setHistoryToDate("");
    setHistoryFirstDayFilter("all");
    setHistorySecondDayFilter("all");
    setHistorySortBy("newest");
    setHistoryHasRun(false);
  };

  const exportHistoryToCsv = () => {
    const escapeCsv = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = filteredBlockHistory.map((item) => [
      formatHistoryTime(item.changed_at),
      getHistoryActionLabel(item),
      item.scope === "global" ? "All employees" : item.employee_name || item.employee_email || "Employee",
      Array.isArray(getHistoryDetails(item)) ? getHistoryDetails(item).join("; ") : getHistoryDetails(item),
      ["admin-access", "workflow-preferences"].includes(item.module) ? "—" : `${item.effective_start || "Any start"} to ${item.effective_end || "Any end"}`,
      item.changed_by_name || item.changed_by_email || "Unknown admin",
      item.notes || "No note",
    ]);
    const csv = [
      ["Changed", "Action", "Employee / scope", "Access details", "Effective period", "Changed by", "Note"],
      ...rows,
    ].map((row) => row.map(escapeCsv).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "access-management-history.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const togglePermission = async (targetUser, menuKey) => {
    if (targetUser.hasFullAdminAccess) return;

    const currentAccess = Array.isArray(targetUser.adminMenuAccess) ? targetUser.adminMenuAccess : [];
    const nextAccess = currentAccess.includes(menuKey)
      ? currentAccess.filter((key) => key !== menuKey)
      : [...currentAccess, menuKey];

    try {
      setSavingUserId(targetUser._id);
      setMessage("");

      const response = await axios.put(
        `${API_BASE}/api/users/access-management/${targetUser._id}`,
        { adminMenuAccess: nextAccess },
        { headers: requesterHeaders }
      );

      setUsers((current) =>
        current.map((item) => (item._id === targetUser._id ? response.data.user : item))
      );
      setAdminAccessHistory(Array.isArray(response.data?.history) ? response.data.history : adminAccessHistory);
      setMessage(`Updated access for ${targetUser.name}`);
    } catch (error) {
      console.error("Failed to update delegated access", error);
      setMessage(error.response?.data?.error || "Failed to update delegated access");
    } finally {
      setSavingUserId("");
      window.setTimeout(() => setMessage(""), 3000);
    }
  };

  const updateBlockSetting = (key, value) => {
    setBlockSettings((current) => ({
      ...current,
      [key]: key.includes("_day") ? Number(value) : value,
    }));
  };

  const updateOverrideDraft = (key, value) => {
    setOverrideDraft((current) => ({
      ...current,
      [key]: key.includes("_day") ? Number(value) : value,
    }));
  };

  const resetOverrideDraft = () => {
    setOverrideDraft({
      _id: "",
      employee_id: "",
      first_fortnight_block_day: 14,
      second_fortnight_block_day: 28,
      effective_start: "",
      effective_end: "",
      notes: "",
    });
  };

  const saveBlockSettings = async () => {
    try {
      setSavingBlockSettings(true);
      setMessage("");
      const response = await axios.put(
        `${API_BASE}/api/timesheets/block-settings`,
        blockSettings,
        { headers: requesterHeaders }
      );
      const globalSettings = response.data?.global || response.data || {};
      setBlockSettings({
        first_fortnight_block_day: Number(globalSettings.first_fortnight_block_day || 14),
        second_fortnight_block_day: Number(globalSettings.second_fortnight_block_day || 28),
        effective_start: globalSettings.effective_start || "",
        effective_end: globalSettings.effective_end || "",
      });
      setEmployeeBlockOverrides(Array.isArray(response.data?.employee_overrides) ? response.data.employee_overrides : employeeBlockOverrides);
      setBlockHistory(mergeEmployeeOverridesIntoHistory(response.data?.history, response.data?.employee_overrides || employeeBlockOverrides));
      setMessage("Updated timesheet block dates for all employees");
    } catch (error) {
      console.error("Failed to update timesheet block dates", error);
      setMessage(error.response?.data?.error || "Failed to update timesheet block dates");
    } finally {
      setSavingBlockSettings(false);
      window.setTimeout(() => setMessage(""), 3000);
    }
  };

  const saveEmployeeBlockOverride = async () => {
    if (!overrideDraft.employee_id) {
      setMessage("Select an employee for the specific block rule");
      window.setTimeout(() => setMessage(""), 3000);
      return;
    }

    try {
      setSavingBlockSettings(true);
      setMessage("");
      const response = await axios.post(
        `${API_BASE}/api/timesheets/block-settings/employee-overrides`,
        overrideDraft,
        { headers: requesterHeaders }
      );
      const savedOverride = response.data?.override;
      if (savedOverride) {
        setEmployeeBlockOverrides((current) => [
          savedOverride,
          ...current.filter((item) => item._id !== savedOverride._id),
        ]);
      }
      setBlockHistory(mergeEmployeeOverridesIntoHistory(
        response.data?.history,
        savedOverride ? [savedOverride] : employeeBlockOverrides,
      ));
      resetOverrideDraft();
      setActiveTab("history");
      setMessage("Saved employee-specific access rule to History");
    } catch (error) {
      console.error("Failed to save employee-specific block rule", error);
      setMessage(error.response?.data?.error || "Failed to save employee-specific block rule");
    } finally {
      setSavingBlockSettings(false);
      window.setTimeout(() => setMessage(""), 3000);
    }
  };

  const savePeriodUnlock = async () => {
    const period = getFortnightBounds(periodUnlockDraft.month, periodUnlockDraft.half);
    if (!periodUnlockDraft.employee_id || !period) {
      setMessage("Select an employee, month, and fortnight to unblock");
      return;
    }

    try {
      setSavingBlockSettings(true);
      setMessage("");
      await axios.put(`${API_BASE}/api/timesheets/period-unlocks`, {
        employee_id: periodUnlockDraft.employee_id,
        period_start: period.start,
        period_end: period.end,
        unlocked: true,
        notes: periodUnlockDraft.notes,
      }, { headers: requesterHeaders });
      setMessage(`Unblocked ${period.start} to ${period.end} for the selected employee`);
      setPeriodUnlockDraft((current) => ({ ...current, notes: "" }));
    } catch (error) {
      console.error("Failed to unblock employee fortnight", error);
      setMessage(error.response?.data?.error || "Failed to unblock employee fortnight");
    } finally {
      setSavingBlockSettings(false);
      window.setTimeout(() => setMessage(""), 3000);
    }
  };

  const editEmployeeBlockOverride = (item) => {
    setOverrideDraft({
      _id: item._id || "",
      employee_id: item.employee_id || "",
      first_fortnight_block_day: Number(item.first_fortnight_block_day || 14),
      second_fortnight_block_day: Number(item.second_fortnight_block_day || 28),
      effective_start: item.effective_start || "",
      effective_end: item.effective_end || "",
      notes: item.notes || "",
    });
  };

  const deleteEmployeeBlockOverride = async (item) => {
    if (!item?._id) return;
    try {
      setSavingBlockSettings(true);
      setMessage("");
      const response = await axios.delete(`${API_BASE}/api/timesheets/block-settings/employee-overrides/${item._id}`, {
        headers: requesterHeaders,
      });
      setEmployeeBlockOverrides((current) => current.filter((entry) => entry._id !== item._id));
      setBlockHistory(Array.isArray(response.data?.history) ? response.data.history : blockHistory);
      if (overrideDraft._id === item._id) resetOverrideDraft();
      setMessage("Removed employee-specific timesheet block rule");
    } catch (error) {
      console.error("Failed to remove employee-specific block rule", error);
      setMessage(error.response?.data?.error || "Failed to remove employee-specific block rule");
    } finally {
      setSavingBlockSettings(false);
      window.setTimeout(() => setMessage(""), 3000);
    }
  };

  if (loading) {
    return (
      <section className="access-management-workspace">
        <div className="fiori-loading-card">
          <Filter size={28} />
          <div>
            <strong>Loading access management</strong>
            <p>Preparing delegated admin controls and user assignments.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="access-management-workspace">
      <header className="admin-hero access-management-hero">
        <div className="admin-hero-copy">
          <div className="admin-section-overline">Security Administration</div>
          <h1>Access Management</h1>
          <p>Grant individual admin sidebar workspaces without turning someone into a full admin.</p>
        </div>

        <div className="admin-hero-meta access-management-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Eligible people</span>
            <strong>{stats.people}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Delegated users</span>
            <strong>{stats.delegated}</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Full admins</span>
            <strong>{stats.admins}</strong>
          </div>
        </div>
      </header>

      <nav className="page-subtab-strip access-management-tab-strip" role="tablist" aria-label="Access management sections">
        <button
          type="button"
          className={`page-subtab-button ${activeTab === "admin-access" ? "is-active" : ""}`}
          onClick={() => setActiveTab("admin-access")}
          role="tab"
          aria-selected={activeTab === "admin-access"}
        >
          Admin Access
        </button>
        <button
          type="button"
          className={`page-subtab-button ${activeTab === "timesheet-access" ? "is-active" : ""}`}
          onClick={() => setActiveTab("timesheet-access")}
          role="tab"
          aria-selected={activeTab === "timesheet-access"}
        >
          Timesheet Access
        </button>
        <button
          type="button"
          className={`page-subtab-button ${activeTab === "workflow-preferences" ? "is-active" : ""}`}
          onClick={() => setActiveTab("workflow-preferences")}
          role="tab"
          aria-selected={activeTab === "workflow-preferences"}
        >
          Leave/Timesheets Preferences
        </button>
        <button
          type="button"
          className={`page-subtab-button ${activeTab === "history" ? "is-active" : ""}`}
          onClick={() => setActiveTab("history")}
          role="tab"
          aria-selected={activeTab === "history"}
        >
          History
        </button>
      </nav>

      {activeTab === "admin-access" ? (
        <>
          <section className="fiori-panel employee-filter-panel access-management-filter-panel">
            <div className="fiori-panel-header employee-filter-panel-header">
              <div>
                <h3>Access Assignment</h3>
                <p>Filter people deeply, then enable only the admin workspaces they should see and use.</p>
              </div>
              <div className="employee-filter-actions">
                <button
                  type="button"
                  className="fiori-button secondary"
                  onClick={() => setShowFilters((current) => !current)}
                >
                  <Filter size={16} />
                  <span>{showFilters ? "Hide Filters" : "Show Filters"}</span>
                  {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
                <button type="button" className="fiori-button secondary" onClick={loadWorkspace}>
                  <RefreshCw size={16} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {showFilters ? (
              <div className="employee-directory-filters employee-directory-filters-extended">
                <label className="employee-filter-field employee-filter-search">
                  <span>Search people</span>
                  <ValueHelpSearch
                    value={search}
                    onChange={setSearch}
                    suggestions={searchSuggestions}
                    placeholder="Search by name, email, employee ID, role, department, designation, or reporting lead"
                    className="access-management-search-help"
                  />
                </label>

            <label className="employee-filter-field">
              <span>Role</span>
              <ValueHelpSelect
                value={roleFilter}
                onChange={setRoleFilter}
                options={roleFilterOptions}
                placeholder="All roles"
                searchPlaceholder="Search roles"
              />
            </label>

            <label className="employee-filter-field">
              <span>Department</span>
              <ValueHelpSelect
                value={departmentFilter}
                onChange={setDepartmentFilter}
                options={departmentFilterOptions}
                placeholder="All departments"
                searchPlaceholder="Search departments"
              />
            </label>

            <label className="employee-filter-field">
              <span>Designation</span>
              <ValueHelpSelect
                value={designationFilter}
                onChange={setDesignationFilter}
                options={designationFilterOptions}
                placeholder="All designations"
                searchPlaceholder="Search designations"
              />
            </label>

            <label className="employee-filter-field">
              <span>Status</span>
              <ValueHelpSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={statusFilterOptions}
                placeholder="All statuses"
                searchPlaceholder="Search statuses"
              />
            </label>

            <label className="employee-filter-field">
              <span>Access type</span>
              <ValueHelpSelect
                value={accessTypeFilter}
                onChange={setAccessTypeFilter}
                options={accessTypeFilterOptions}
                placeholder="All access types"
                searchPlaceholder="Search access types"
              />
            </label>

            <label className="employee-filter-field">
              <span>Granted menu</span>
              <ValueHelpSelect
                value={menuFilter}
                onChange={setMenuFilter}
                options={menuFilterOptions}
                placeholder="All menus"
                searchPlaceholder="Search granted menus"
              />
            </label>

            <label className="employee-filter-field">
              <span>Email domain</span>
              <ValueHelpSelect
                value={emailDomainFilter}
                onChange={setEmailDomainFilter}
                options={emailDomainFilterOptions}
                placeholder="All domains"
                searchPlaceholder="Search email domains"
              />
            </label>

            <label className="employee-filter-field">
              <span>Employee ID</span>
              <ValueHelpSelect
                value={employeeIdFilter}
                onChange={setEmployeeIdFilter}
                options={employeeIdFilterOptions}
                placeholder="Any employee ID state"
                searchPlaceholder="Search employee ID states"
              />
            </label>

            <label className="employee-filter-field">
              <span>Reporting lead</span>
              <ValueHelpSelect
                value={reportingLeadFilter}
                onChange={setReportingLeadFilter}
                options={reportingLeadFilterOptions}
                placeholder="All reporting leads"
                searchPlaceholder="Search reporting leads"
              />
            </label>

            <label className="employee-filter-field">
              <span>Sort by</span>
              <ValueHelpSelect
                value={sortBy}
                onChange={setSortBy}
                options={sortByOptions}
                placeholder="Sort users"
                searchPlaceholder="Search sort options"
              />
            </label>

            <div className="employee-filter-actions">
              <button type="button" className="fiori-button secondary" onClick={resetFilters}>
                Reset Filters
              </button>
              <div className="employee-directory-filter-meta">
                <strong>{activeFilterCount}</strong>
                <span>active filter{activeFilterCount === 1 ? "" : "s"}</span>
              </div>
            </div>
              </div>
            ) : null}
          </section>

          <section className="fiori-panel access-management-matrix-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Delegated Access Matrix</h3>
                <p>{filteredUsers.length} visible user{filteredUsers.length === 1 ? "" : "s"} in the current view.</p>
              </div>
              <div className="access-management-matrix-meta">
                <span>{options.length} admin menu{options.length === 1 ? "" : "s"}</span>
              </div>
            </div>

            <div className="fiori-table-shell access-management-table-shell">
              <table className="fiori-table access-management-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Role</th>
                    <th>Status</th>
                    {options.map((option) => (
                      <th key={option.key}>{option.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((item) => {
                    const isSaving = savingUserId === item._id;

                    return (
                      <tr
                        key={item._id}
                        className={item.hasFullAdminAccess ? "is-full-admin-row" : ""}
                      >
                        <td className="access-management-person-cell">
                          <div className="fiori-primary-cell access-management-primary-cell">
                            <strong>{item.name || "Unnamed user"}</strong>
                            <span>{item.email || "No email"}</span>
                            <span>{item.employeeId || item._id}</span>
                          </div>
                        </td>
                        <td className="access-management-role-cell">
                          <div className="fiori-primary-cell access-management-primary-cell">
                            <strong>{item.role || "Employee"}</strong>
                            <span>{item.designation || "No designation"}</span>
                            <span>{item.department || "No department"}</span>
                          </div>
                        </td>
                        <td className="access-management-status-cell">
                          <span
                            className={`fiori-status-pill ${
                              item.hasFullAdminAccess
                                ? "is-neutral"
                                : item.is_active === false
                                  ? "is-rejected"
                                  : "is-approved"
                            }`}
                          >
                            {item.hasFullAdminAccess
                              ? "Full Admin"
                              : item.is_active === false
                                ? "Inactive"
                                : "Active"}
                          </span>
                        </td>
                        {options.map((option) => {
                          const checked = (item.adminMenuAccess || []).includes(option.key);

                          return (
                            <td key={option.key} className="access-management-permission-cell">
                              <label
                                className="access-management-toggle"
                                title={option.description || option.label}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={item.hasFullAdminAccess || isSaving}
                                  onChange={() => togglePermission(item, option.key)}
                                />
                                <span>{item.hasFullAdminAccess ? "Included" : checked ? "Granted" : "Off"}</span>
                              </label>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {!filteredUsers.length ? (
                    <tr>
                      <td colSpan={3 + options.length} className="access-management-empty-state">
                        No users match the current search.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "timesheet-access" ? (
        <section className="timesheet-access-workspace">
          <div className="timesheet-access-summary">
            <div className="timesheet-access-stat">
              <CalendarRange size={18} />
              <div>
                <span>First fortnight</span>
                <strong>Day {blockSettings.first_fortnight_block_day}</strong>
              </div>
            </div>
            <div className="timesheet-access-stat">
              <ShieldCheck size={18} />
              <div>
                <span>Second fortnight</span>
                <strong>Day {blockSettings.second_fortnight_block_day}</strong>
              </div>
            </div>
            <div className="timesheet-access-stat">
              <UserCog size={18} />
              <div>
                <span>Employee exceptions</span>
                <strong>{employeeBlockOverrides.length}</strong>
              </div>
            </div>
            <button type="button" className="timesheet-access-refresh" onClick={loadWorkspace}>
              <RefreshCw size={16} />
              <span>Refresh</span>
            </button>
          </div>

          <section className="fiori-panel access-management-block-panel timesheet-access-card">
            <div className="fiori-panel-header">
              <div>
                <h3>Global Rule</h3>
                <p>These dates apply to everyone unless an employee-specific rule is active for the period.</p>
              </div>
              <div className="access-management-matrix-meta">
                <CalendarRange size={18} />
                <span>Default cutoff</span>
              </div>
            </div>

          <div className="access-management-block-grid is-global">
            <label className="access-management-block-field">
              <span>First Fortnight</span>
              <select
                className="input"
                value={blockSettings.first_fortnight_block_day}
                onChange={(event) => updateBlockSetting("first_fortnight_block_day", event.target.value)}
              >
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </label>

            <label className="access-management-block-field">
              <span>Second Fortnight</span>
              <select
                className="input"
                value={blockSettings.second_fortnight_block_day}
                onChange={(event) => updateBlockSetting("second_fortnight_block_day", event.target.value)}
              >
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={day}>{day}</option>
                ))}
              </select>
            </label>

            <label className="access-management-block-field">
              <span>Effective From</span>
              <input
                className="input"
                type="date"
                value={blockSettings.effective_start}
                onChange={(event) => updateBlockSetting("effective_start", event.target.value)}
              />
            </label>

            <label className="access-management-block-field">
              <span>Effective To</span>
              <input
                className="input"
                type="date"
                value={blockSettings.effective_end}
                onChange={(event) => updateBlockSetting("effective_end", event.target.value)}
              />
            </label>

            <div className="access-management-block-chip">
              <strong>{blockSettings.first_fortnight_block_day}</strong>
              <span>blocks 1-15 periods</span>
            </div>

          <div className="access-management-block-chip">
            <strong>{blockSettings.second_fortnight_block_day}</strong>
            <span>blocks 16-31 periods</span>
          </div>

            <div className="access-management-block-actions">
              <button
                type="button"
                className="fiori-button primary"
                onClick={saveBlockSettings}
                disabled={savingBlockSettings}
              >
                <Save size={16} />
                <span>{savingBlockSettings ? "Saving" : "Save Global Rule"}</span>
              </button>
            </div>
          </div>
          </section>

          <section className="fiori-panel access-management-block-panel timesheet-access-card employee-unblocking-card">
            <div className="fiori-panel-header">
              <div>
                <h3>Unblock a Specific Fortnight</h3>
                <p>Use this for a missed or already locked timesheet. It creates an actual access grant for this employee and period.</p>
              </div>
              <div className="access-management-matrix-meta">
                <Unlock size={18} />
                <span>One employee · one fortnight</span>
              </div>
            </div>

            <div className="access-management-block-grid is-employee">
              <label className="access-management-block-field is-wide">
                <span>Employee</span>
                <ValueHelpSelect
                  value={periodUnlockDraft.employee_id}
                  onChange={(value) => setPeriodUnlockDraft((current) => ({ ...current, employee_id: value }))}
                  options={employeeBlockOptions}
                  placeholder="Select employee"
                  searchPlaceholder="Search employees"
                />
              </label>
              <label className="access-management-block-field">
                <span>Month</span>
                <input className="input" type="month" value={periodUnlockDraft.month} onChange={(event) => setPeriodUnlockDraft((current) => ({ ...current, month: event.target.value }))} />
              </label>
              <label className="access-management-block-field">
                <span>Fortnight</span>
                <select className="input" value={periodUnlockDraft.half} onChange={(event) => setPeriodUnlockDraft((current) => ({ ...current, half: event.target.value }))}>
                  <option value="first">1st–15th</option>
                  <option value="second">16th–month end</option>
                </select>
              </label>
              <label className="access-management-block-field is-wide">
                <span>Notes</span>
                <input className="input" value={periodUnlockDraft.notes} onChange={(event) => setPeriodUnlockDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Reason for unblocking (optional)" />
              </label>
              <div className="access-management-block-actions">
                <button type="button" className="fiori-button primary" onClick={savePeriodUnlock} disabled={savingBlockSettings || !periodUnlockDraft.employee_id || !periodUnlockDraft.month}>
                  <Unlock size={16} />
                  <span>{savingBlockSettings ? "Saving" : "Unblock Fortnight"}</span>
                </button>
              </div>
            </div>
          </section>

          <section className="fiori-panel access-management-block-panel timesheet-access-card employee-unblocking-card">
            <div className="fiori-panel-header">
              <div>
                <h3>Employee-Specific Access Rule</h3>
                <p>Set the final day this employee can edit each fortnight. The selected day remains editable; access closes the following day.</p>
              </div>
              <div className="access-management-matrix-meta">
                <UserCog size={18} />
                <span>{filteredEmployeeBlockOverrides.length} visible rule{filteredEmployeeBlockOverrides.length === 1 ? "" : "s"}</span>
              </div>
            </div>

          <div className="access-management-block-grid is-employee">
            <label className="access-management-block-field is-wide">
              <span>Employee</span>
              <ValueHelpSelect
                value={overrideDraft.employee_id}
                onChange={(value) => updateOverrideDraft("employee_id", value)}
                options={employeeBlockOptions}
                placeholder="Select employee"
                searchPlaceholder="Search employees"
              />
            </label>

            <label className="access-management-block-field">
              <span>First Fortnight</span>
              <select className="input" value={overrideDraft.first_fortnight_block_day} onChange={(event) => updateOverrideDraft("first_fortnight_block_day", event.target.value)}>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </label>

            <label className="access-management-block-field">
              <span>Second Fortnight</span>
              <select className="input" value={overrideDraft.second_fortnight_block_day} onChange={(event) => updateOverrideDraft("second_fortnight_block_day", event.target.value)}>
                {Array.from({ length: 31 }, (_, index) => index + 1).map((day) => <option key={day} value={day}>{day}</option>)}
              </select>
            </label>

            <label className="access-management-block-field">
              <span>From</span>
              <input className="input" type="date" value={overrideDraft.effective_start} onChange={(event) => updateOverrideDraft("effective_start", event.target.value)} />
            </label>

            <label className="access-management-block-field">
              <span>To</span>
              <input className="input" type="date" value={overrideDraft.effective_end} onChange={(event) => updateOverrideDraft("effective_end", event.target.value)} />
            </label>

            <label className="access-management-block-field is-wide">
              <span>Notes</span>
              <input className="input" value={overrideDraft.notes} onChange={(event) => updateOverrideDraft("notes", event.target.value)} placeholder="Optional note" />
            </label>

            <div className="access-management-block-actions">
              <button type="button" className="fiori-button secondary" onClick={resetOverrideDraft} disabled={savingBlockSettings}>
                Clear
              </button>
              <button type="button" className="fiori-button primary" onClick={saveEmployeeBlockOverride} disabled={savingBlockSettings || !overrideDraft.employee_id}>
                <Save size={16} />
                <span>{overrideDraft._id ? "Update Rule" : "Add Rule"}</span>
              </button>
            </div>
          </div>

          <div className="access-management-block-filter-row employee-unblocking-record-filter">
            <label className="access-management-block-field">
              <span>Search Unblocking Records</span>
              <input className="input" value={overrideSearch} onChange={(event) => setOverrideSearch(event.target.value)} placeholder="Search employee or note" />
            </label>
            <label className="access-management-block-field">
              <span>Active On</span>
              <input className="input" type="date" value={overrideDateFilter} onChange={(event) => setOverrideDateFilter(event.target.value)} />
            </label>
          </div>

          <div className="access-management-block-rule-list employee-unblocking-record-list">
            {filteredEmployeeBlockOverrides.map((item) => (
              <article key={item._id} className="access-management-block-rule">
                <div>
                  <strong>{item.employee_name || item.employee_email}</strong>
                  <span>{item.employee_email}</span>
                </div>
                <div className="access-management-block-rule-days">
                  <span>First: Day {item.first_fortnight_block_day}</span>
                  <span>Second: Day {item.second_fortnight_block_day}</span>
                </div>
                <div className="access-management-block-rule-range">
                  <span>{item.effective_start || "Any start"} to {item.effective_end || "Any end"}</span>
                  {item.notes ? <small>{item.notes}</small> : null}
                </div>
                <div className="access-management-block-rule-actions">
                  <button type="button" className="fiori-button secondary" onClick={() => editEmployeeBlockOverride(item)}>Edit</button>
                  <button type="button" className="fiori-button secondary danger" onClick={() => deleteEmployeeBlockOverride(item)} disabled={savingBlockSettings}>
                    <Trash2 size={15} />
                    <span>Remove</span>
                  </button>
                </div>
              </article>
            ))}
            {!filteredEmployeeBlockOverrides.length ? (
              <div className="access-management-block-empty">No employee-specific rules match the current filters.</div>
            ) : null}
          </div>
          </section>

        </section>
      ) : null}

      {activeTab === "history" ? (
        <section className="timesheet-access-workspace">
          <section className="fiori-panel access-management-block-panel timesheet-access-card">
            <div className="fiori-panel-header">
              <div>
                <h3>History</h3>
                <p>Recent admin access grants, timesheet access rules, and leave/timesheet routing preference changes.</p>
              </div>
              <div className="history-header-actions">
                <div className="access-management-matrix-meta">
                  <Clock3 size={18} />
                  <span>{filteredBlockHistory.length} of {combinedHistory.length} change{combinedHistory.length === 1 ? "" : "s"}</span>
                </div>
                <button type="button" className="fiori-button secondary history-export-button" onClick={exportHistoryToCsv} disabled={!historyHasRun || !filteredBlockHistory.length}>
                  <Download size={16} />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            <div className="timesheet-access-history-filters">
              <label className="access-management-block-field is-history-search">
                <span>Search History</span>
                <ValueHelpSearch
                  value={historySearch}
                  onChange={setHistorySearch}
                  suggestions={historySearchSuggestions}
                  placeholder="Search history records"
                />
              </label>
              <label className="access-management-block-field">
                <span>Module</span>
                <ValueHelpSelect
                  value={historyModuleFilter}
                  onChange={setHistoryModuleFilter}
                  options={historyModuleOptions}
                  placeholder="All history"
                  searchPlaceholder="Search history types"
                />
              </label>
              <label className="access-management-block-field">
                <span>Scope</span>
                <ValueHelpSelect
                  value={historyScopeFilter}
                  onChange={setHistoryScopeFilter}
                  options={historyScopeOptions}
                  placeholder="All scopes"
                  searchPlaceholder="Search scopes"
                />
              </label>
              <label className="access-management-block-field">
                <span>Action</span>
                <ValueHelpSelect
                  value={historyActionFilter}
                  onChange={setHistoryActionFilter}
                  options={historyActionOptions}
                  placeholder="All actions"
                  searchPlaceholder="Search actions"
                />
              </label>
              <label className="access-management-block-field">
                <span>Changed By</span>
                <ValueHelpSelect
                  value={historyChangedByFilter}
                  onChange={setHistoryChangedByFilter}
                  options={historyChangedByOptions}
                  placeholder="All admins"
                  searchPlaceholder="Search admins"
                />
              </label>
              <label className="access-management-block-field">
                <span>Department</span>
                <ValueHelpSelect
                  value={historyDepartmentFilter}
                  onChange={setHistoryDepartmentFilter}
                  options={historyDepartmentOptions}
                  placeholder="All departments"
                  searchPlaceholder="Search departments"
                />
              </label>
              <label className="access-management-block-field">
                <span>From Date</span>
                <input
                  className="input"
                  type="date"
                  value={historyFromDate}
                  onChange={(event) => setHistoryFromDate(event.target.value)}
                />
              </label>
              <label className="access-management-block-field">
                <span>To Date</span>
                <input
                  className="input"
                  type="date"
                  value={historyToDate}
                  onChange={(event) => setHistoryToDate(event.target.value)}
                />
              </label>
              <label className="access-management-block-field">
                <span>First Day</span>
                <ValueHelpSelect
                  value={historyFirstDayFilter}
                  onChange={setHistoryFirstDayFilter}
                  options={historyFirstDayOptions}
                  placeholder="Any first day"
                  searchPlaceholder="Search first days"
                />
              </label>
              <label className="access-management-block-field">
                <span>Second Day</span>
                <ValueHelpSelect
                  value={historySecondDayFilter}
                  onChange={setHistorySecondDayFilter}
                  options={historySecondDayOptions}
                  placeholder="Any second day"
                  searchPlaceholder="Search second days"
                />
              </label>
              <label className="access-management-block-field">
                <span>Sort By</span>
                <ValueHelpSelect
                  value={historySortBy}
                  onChange={setHistorySortBy}
                  options={historySortOptions}
                  placeholder="Sort history"
                  searchPlaceholder="Search sort options"
                />
              </label>
              <div className="timesheet-access-history-filter-actions">
                <button
                  type="button"
                  className="fiori-button primary"
                  onClick={() => setHistoryHasRun(true)}
                >
                  Go
                </button>
                <button
                  type="button"
                  className="fiori-button secondary"
                  onClick={resetHistoryFilters}
                  disabled={historyActiveFilterCount === 0}
                >
                  Reset Filters
                </button>
                <div className="employee-directory-filter-meta">
                  <strong>{historyActiveFilterCount}</strong>
                  <span>active filter{historyActiveFilterCount === 1 ? "" : "s"}</span>
                </div>
              </div>
            </div>

            {historyHasRun ? <div className="timesheet-access-history-table-shell">
              <table className="timesheet-access-history-table">
                <thead>
                  <tr>
                    <th>Changed</th>
                    <th>Action</th>
                    <th>Employee / scope</th>
                    <th>Access details</th>
                    <th>Effective period</th>
                    <th>Changed by / note</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBlockHistory.map((item) => (
                    <tr key={item._id}>
                      <td className="history-date-cell">{formatHistoryTime(item.changed_at)}</td>
                      <td>
                        <div className="history-action-cell">
                          <History size={16} />
                          <strong>{getHistoryActionLabel(item)}</strong>
                        </div>
                        <span className="history-module-label">{item.module === "admin-access" ? "Admin access" : item.module === "workflow-preferences" ? "Leave/Timesheets preferences" : "Timesheet access"}</span>
                      </td>
                      <td>
                        <strong>{item.scope === "global" ? "All employees" : item.employee_name || item.employee_email || "Employee"}</strong>
                        <span>{item.module === "admin-access" ? [item.employee_email, item.department].filter(Boolean).join(" • ") || "Delegated admin access" : item.module === "workflow-preferences" ? item.employee_email || "Employee routing" : item.scope === "global" ? "Default rule" : item.employee_email || "Employee override"}</span>
                      </td>
                      <td>
                        {item.module === "admin-access" ? (
                          <span>{getHistoryDetails(item)}</span>
                        ) : item.module === "workflow-preferences" ? (
                          <div className="history-detail-stack">{getHistoryDetails(item).map((detail) => <span key={detail}>{detail}</span>)}</div>
                        ) : (
                          <div className="history-detail-stack">
                            <span>First: Day {item.first_fortnight_block_day || "—"}</span>
                            <span>Second: Day {item.second_fortnight_block_day || "—"}</span>
                          </div>
                        )}
                      </td>
                      <td>{["admin-access", "workflow-preferences"].includes(item.module) ? "—" : `${item.effective_start || "Any start"} to ${item.effective_end || "Any end"}`}</td>
                      <td>
                        <strong>{item.changed_by_name || item.changed_by_email || "Unknown admin"}</strong>
                        <span>{item.notes || "No note"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!filteredBlockHistory.length ? (
                <div className="access-management-block-empty">
                  {combinedHistory.length === 0
                    ? "No access management history is available yet."
                    : "No history records match the current filters."}
                </div>
              ) : null}
            </div> : null}
          </section>

          {false ? <section className="fiori-panel workflow-rules-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Saved routing rules</h3>
                <p>{filteredWorkflowRules.length} of {workflowRules.length} employee rule{workflowRules.length === 1 ? "" : "s"}. Select a row’s employee above to review or update it.</p>
              </div>
            </div>
            <div className="workflow-rules-filters">
              <label className="access-management-block-field workflow-rules-search"><span>Search</span><ValueHelpSearch value={workflowRuleFilters.search} onChange={(value) => updateWorkflowRuleFilter("search", value)} suggestions={workflowPeopleOptions} placeholder="Employee or selected person" /></label>
              <label className="access-management-block-field"><span>Employee</span><ValueHelpSelect value={workflowRuleFilters.employee} onChange={(value) => updateWorkflowRuleFilter("employee", value)} options={[{ value: "all", label: "All employees" }, ...workflowRuleOptions.employees]} /></label>
              <label className="access-management-block-field"><span>Department</span><ValueHelpSelect value={workflowRuleFilters.department} onChange={(value) => updateWorkflowRuleFilter("department", value)} options={[{ value: "all", label: "All departments" }, ...workflowRuleOptions.departments]} /></label>
              <label className="access-management-block-field"><span>Timesheet approver</span><ValueHelpSelect value={workflowRuleFilters.timesheetApprover} onChange={(value) => updateWorkflowRuleFilter("timesheetApprover", value)} options={[{ value: "all", label: "All approvers" }, ...workflowRuleOptions.timesheetApprovers]} /></label>
              <label className="access-management-block-field"><span>Timesheet notifier</span><ValueHelpSelect value={workflowRuleFilters.timesheetNotifier} onChange={(value) => updateWorkflowRuleFilter("timesheetNotifier", value)} options={[{ value: "all", label: "All notifiers" }, ...workflowRuleOptions.timesheetNotifiers]} /></label>
              <label className="access-management-block-field"><span>Leave approver</span><ValueHelpSelect value={workflowRuleFilters.leaveApprover} onChange={(value) => updateWorkflowRuleFilter("leaveApprover", value)} options={[{ value: "all", label: "All approvers" }, ...workflowRuleOptions.leaveApprovers]} /></label>
              <label className="access-management-block-field"><span>Leave notifier</span><ValueHelpSelect value={workflowRuleFilters.leaveNotifier} onChange={(value) => updateWorkflowRuleFilter("leaveNotifier", value)} options={[{ value: "all", label: "All notifiers" }, ...workflowRuleOptions.leaveNotifiers]} /></label>
              <label className="access-management-block-field"><span>Updated by</span><ValueHelpSelect value={workflowRuleFilters.updatedBy} onChange={(value) => updateWorkflowRuleFilter("updatedBy", value)} options={[{ value: "all", label: "All admins" }, ...workflowRuleOptions.updatedBy]} /></label>
              <label className="access-management-block-field"><span>Updated from</span><input className="input" type="date" value={workflowRuleFilters.from} onChange={(event) => updateWorkflowRuleFilter("from", event.target.value)} /></label>
              <label className="access-management-block-field"><span>Updated to</span><input className="input" type="date" value={workflowRuleFilters.to} onChange={(event) => updateWorkflowRuleFilter("to", event.target.value)} /></label>
              <label className="access-management-block-field"><span>Sort</span><ValueHelpSelect value={workflowRuleFilters.sort} onChange={(value) => updateWorkflowRuleFilter("sort", value)} options={[{ value: "updated_desc", label: "Recently updated" }, { value: "employee_asc", label: "Employee A–Z" }]} /></label>
              <div className="access-management-block-actions"><button type="button" className="fiori-button secondary" onClick={() => setWorkflowRuleFilters({ search: "", employee: "all", department: "all", timesheetApprover: "all", timesheetNotifier: "all", leaveApprover: "all", leaveNotifier: "all", updatedBy: "all", from: "", to: "", sort: "updated_desc" })}>Reset filters</button></div>
            </div>
            <div className="fiori-table-shell workflow-rules-table-shell">
              <table className="fiori-table workflow-rules-table"><thead><tr><th>Employee</th><th>Department</th><th>Timesheet approvers</th><th>Timesheet notifiers</th><th>Leave approvers</th><th>Leave notifiers</th><th>Updated by</th><th>Last updated</th></tr></thead>
                <tbody>{filteredWorkflowRules.map((rule) => <tr key={rule.employee_id}><td><strong>{rule.employeeName}</strong><small>{rule.employeeEmail}</small></td><td>{rule.department || "—"}</td><td>{rule.timesheetApprovers.join(", ") || "—"}</td><td>{rule.timesheetNotifiers.join(", ") || "—"}</td><td>{rule.leaveApprovers.join(", ") || "—"}</td><td>{rule.leaveNotifiers.join(", ") || "—"}</td><td>{rule.updated_by_name || "—"}</td><td>{formatHistoryTime(rule.updated_at)}</td></tr>)}</tbody>
              </table>
              {!filteredWorkflowRules.length ? <div className="access-management-block-empty">No saved routing rules match the selected filters.</div> : null}
            </div>
          </section> : null}
        </section>
      ) : null}

      {activeTab === "workflow-preferences" ? (
        <section className="workflow-preferences-workspace">
          <section className="fiori-panel access-management-block-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Leave and Timesheet Routing</h3>
                <p>Assign the people who receive approval requests and notifications. Reporting leads are not used for new leave or timesheet submissions.</p>
              </div>
              <div className="access-management-matrix-meta">
                <span>{workflowPreferences.length} employee rule{workflowPreferences.length === 1 ? "" : "s"}</span>
              </div>
            </div>

            <div className="workflow-preferences-grid">
              <label className="access-management-block-field workflow-preferences-employees">
                <span>Employees</span>
                <ValueHelpSelect
                  multiple
                  value={workflowEmployeeIds}
                  onChange={setWorkflowEmployeeIds}
                  options={workflowPeopleOptions}
                  placeholder="Select one or more employees"
                  searchPlaceholder="Search employees by name, email, ID, department, or designation"
                />
                {renderWorkflowSelection(
                  workflowEmployeeIds,
                  (id) => setWorkflowEmployeeIds((current) => current.filter((item) => item !== id)),
                  "No employees selected"
                )}
                <small>Select multiple employees to apply the same routing in one save.</small>
              </label>
            </div>

            <div className="workflow-preferences-modules">
              {[
                { key: "timesheet", title: "Timesheet preferences", description: "Selected approvers receive the approval workflow in the displayed order." },
                { key: "leave", title: "Leave preferences", description: "Selected approvers receive the leave approval workflow in the displayed order." },
              ].map((module) => (
                <section key={module.key} className="workflow-preferences-module">
                  <div>
                    <h4>{module.title}</h4>
                    <p>{module.description}</p>
                  </div>
                  <div className="workflow-preferences-grid">
                    <label className="access-management-block-field">
                      <span>Approvers</span>
                      <ValueHelpSelect
                        multiple
                        value={workflowDraft[module.key].approver_ids}
                        onChange={(value) => updateWorkflowDraft(module.key, "approver_ids", value)}
                        options={workflowPeopleOptions}
                        placeholder="Select approvers"
                        searchPlaceholder="Search approvers"
                      />
                      {renderWorkflowSelection(
                        workflowDraft[module.key].approver_ids,
                        (id) => updateWorkflowDraft(module.key, "approver_ids", workflowDraft[module.key].approver_ids.filter((item) => item !== id)),
                        "No approvers selected"
                      )}
                    </label>
                    <label className="access-management-block-field">
                      <span>Notifiers</span>
                      <ValueHelpSelect
                        multiple
                        value={workflowDraft[module.key].notifier_ids}
                        onChange={(value) => updateWorkflowDraft(module.key, "notifier_ids", value)}
                        options={workflowPeopleOptions}
                        placeholder="Select notification recipients"
                        searchPlaceholder="Search notification recipients"
                      />
                      {renderWorkflowSelection(
                        workflowDraft[module.key].notifier_ids,
                        (id) => updateWorkflowDraft(module.key, "notifier_ids", workflowDraft[module.key].notifier_ids.filter((item) => item !== id)),
                        "No notifiers selected"
                      )}
                    </label>
                  </div>
                </section>
              ))}
            </div>

            <div className="access-management-block-actions workflow-preferences-actions">
              <button type="button" className="fiori-button secondary" onClick={() => {
                setWorkflowEmployeeIds([]);
                setWorkflowDraft({ timesheet: { approver_ids: [], notifier_ids: [] }, leave: { approver_ids: [], notifier_ids: [] } });
              }}>
                Clear
              </button>
              <button type="button" className="fiori-button primary" onClick={saveWorkflowPreferences} disabled={savingWorkflow}>
                <Save size={16} />
                <span>{savingWorkflow ? "Saving" : "Save Preferences"}</span>
              </button>
            </div>
          </section>

          <section className="fiori-panel workflow-rules-panel">
            <div className="fiori-panel-header"><div><h3>Saved routing rules</h3><p>{filteredWorkflowRules.length} of {workflowRules.length} active employee rule{workflowRules.length === 1 ? "" : "s"}.</p></div><button type="button" className="fiori-button secondary" onClick={exportWorkflowRulesToCsv} disabled={!filteredWorkflowRules.length}><Download size={16} /><span>Export CSV</span></button></div>
            <div className="workflow-rules-filters">
              <label className="access-management-block-field workflow-rules-search"><span>Search employee or recipient</span><ValueHelpSearch value={workflowRuleFilters.search} onChange={(value) => updateWorkflowRuleFilter("search", value)} suggestions={workflowPeopleOptions} placeholder="Search people" /></label>
              <label className="access-management-block-field"><span>Employee</span><ValueHelpSelect value={workflowRuleFilters.employee} onChange={(value) => updateWorkflowRuleFilter("employee", value)} options={[{ value: "all", label: "All employees" }, ...workflowRuleOptions.employees]} /></label>
              <label className="access-management-block-field"><span>Department</span><ValueHelpSelect value={workflowRuleFilters.department} onChange={(value) => updateWorkflowRuleFilter("department", value)} options={[{ value: "all", label: "All departments" }, ...workflowRuleOptions.departments]} /></label>
              <label className="access-management-block-field"><span>Timesheet approver</span><ValueHelpSelect value={workflowRuleFilters.timesheetApprover} onChange={(value) => updateWorkflowRuleFilter("timesheetApprover", value)} options={[{ value: "all", label: "All approvers" }, ...workflowRuleOptions.timesheetApprovers]} /></label>
              <label className="access-management-block-field"><span>Timesheet notifier</span><ValueHelpSelect value={workflowRuleFilters.timesheetNotifier} onChange={(value) => updateWorkflowRuleFilter("timesheetNotifier", value)} options={[{ value: "all", label: "All notifiers" }, ...workflowRuleOptions.timesheetNotifiers]} /></label>
              <label className="access-management-block-field"><span>Leave approver</span><ValueHelpSelect value={workflowRuleFilters.leaveApprover} onChange={(value) => updateWorkflowRuleFilter("leaveApprover", value)} options={[{ value: "all", label: "All approvers" }, ...workflowRuleOptions.leaveApprovers]} /></label>
              <label className="access-management-block-field"><span>Leave notifier</span><ValueHelpSelect value={workflowRuleFilters.leaveNotifier} onChange={(value) => updateWorkflowRuleFilter("leaveNotifier", value)} options={[{ value: "all", label: "All notifiers" }, ...workflowRuleOptions.leaveNotifiers]} /></label>
              <label className="access-management-block-field"><span>Updated by</span><ValueHelpSelect value={workflowRuleFilters.updatedBy} onChange={(value) => updateWorkflowRuleFilter("updatedBy", value)} options={[{ value: "all", label: "All admins" }, ...workflowRuleOptions.updatedBy]} /></label>
              <label className="access-management-block-field"><span>From</span><input className="input" type="date" value={workflowRuleFilters.from} onChange={(event) => updateWorkflowRuleFilter("from", event.target.value)} /></label>
              <label className="access-management-block-field"><span>To</span><input className="input" type="date" value={workflowRuleFilters.to} onChange={(event) => updateWorkflowRuleFilter("to", event.target.value)} /></label>
              <label className="access-management-block-field"><span>Sort</span><ValueHelpSelect value={workflowRuleFilters.sort} onChange={(value) => updateWorkflowRuleFilter("sort", value)} options={[{ value: "updated_desc", label: "Recently updated" }, { value: "employee_asc", label: "Employee A–Z" }]} /></label>
            </div>
            <div className="fiori-table-shell workflow-rules-table-shell"><table className="fiori-table workflow-rules-table"><thead><tr><th>Employee</th><th>Department</th><th>Timesheet approvers</th><th>Timesheet notifiers</th><th>Leave approvers</th><th>Leave notifiers</th><th>Updated by</th><th>Last updated</th><th>Actions</th></tr></thead><tbody>{filteredWorkflowRules.map((rule) => <tr key={rule.employee_id}><td><strong>{rule.employeeName}</strong><small>{rule.employeeEmail}</small></td><td>{rule.department || "—"}</td><td>{rule.timesheetApprovers.join(", ") || "—"}</td><td>{rule.timesheetNotifiers.join(", ") || "—"}</td><td>{rule.leaveApprovers.join(", ") || "—"}</td><td>{rule.leaveNotifiers.join(", ") || "—"}</td><td>{rule.updated_by_name || "—"}</td><td>{formatHistoryTime(rule.updated_at)}</td><td><div className="workflow-rule-actions"><button type="button" className="fiori-button secondary" onClick={() => editWorkflowRule(rule)}>Edit</button><button type="button" className="fiori-button secondary danger" onClick={() => setWorkflowRulePendingDelete(rule)}>Delete</button></div></td></tr>)}</tbody></table>{!filteredWorkflowRules.length ? <div className="access-management-block-empty">No saved routing rules match these filters.</div> : null}</div>
          </section>
        </section>
      ) : null}

      {workflowRuleEditing ? (
        <div className="workflow-rule-confirm-overlay" role="presentation">
          <section className="workflow-rule-confirm-dialog workflow-rule-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-routing-rule-title">
            <h3 id="edit-routing-rule-title">Edit routing rule</h3>
            <p>Update routing for <strong>{workflowRuleEditing.employeeName}</strong>. Changes apply to new leave and timesheet submissions.</p>
            <div className="workflow-rule-edit-grid">
              {[
                { module: "timesheet", field: "approver_ids", label: "Timesheet approvers" },
                { module: "timesheet", field: "notifier_ids", label: "Timesheet notifiers" },
                { module: "leave", field: "approver_ids", label: "Leave approvers" },
                { module: "leave", field: "notifier_ids", label: "Leave notifiers" },
              ].map((item) => <label key={`${item.module}-${item.field}`} className="access-management-block-field"><span>{item.label}</span><ValueHelpSelect multiple value={workflowRuleEditing[item.module][item.field]} onChange={(value) => updateWorkflowRuleEdit(item.module, item.field, value)} options={workflowPeopleOptions} placeholder={`Select ${item.label.toLowerCase()}`} searchPlaceholder="Search people" /></label>)}
            </div>
            <div className="workflow-rule-confirm-actions">
              <button type="button" className="fiori-button secondary" onClick={() => setWorkflowRuleEditing(null)} disabled={savingWorkflowRuleEdit}>Cancel</button>
              <button type="button" className="fiori-button primary" onClick={saveWorkflowRuleEdit} disabled={savingWorkflowRuleEdit}>{savingWorkflowRuleEdit ? "Saving…" : "Save changes"}</button>
            </div>
          </section>
        </div>
      ) : null}

      {workflowRulePendingDelete ? (
        <div className="workflow-rule-confirm-overlay" role="presentation">
          <section className="workflow-rule-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-routing-rule-title">
            <h3 id="delete-routing-rule-title">Delete routing rule?</h3>
            <p>This removes the leave and timesheet routing for <strong>{workflowRulePendingDelete.employeeName}</strong>. New submissions for this employee cannot be routed until a new rule is saved.</p>
            <div className="workflow-rule-confirm-actions">
              <button type="button" className="fiori-button secondary" onClick={() => setWorkflowRulePendingDelete(null)} disabled={deletingWorkflowRule}>Cancel</button>
              <button type="button" className="fiori-button danger" onClick={deleteWorkflowRule} disabled={deletingWorkflowRule}>{deletingWorkflowRule ? "Deleting…" : "Delete rule"}</button>
            </div>
          </section>
        </div>
      ) : null}

      {message ? (
        <div
          className={`admin-toast ${
            message.toLowerCase().includes("failed") || message.toLowerCase().includes("error")
              ? "is-error"
              : "is-success"
          }`}
        >
          {message}
        </div>
      ) : null}
    </section>
  );
};

export default AccessManagement;
