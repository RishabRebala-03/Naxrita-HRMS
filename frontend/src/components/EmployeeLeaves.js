import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  CalendarCheck2,
  Clock3,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import ValueHelpSelect from "./ValueHelpSelect";
import ValueHelpSearch from "./ValueHelpSearch";
import { buildRequesterHeaders } from "../utils/requester";
import { formatDateIST, formatDateTimeIST, toDateKeyIST } from "../utils/dateTime";

const statusToneMap = {
  Approved: "is-approved",
  Rejected: "is-rejected",
  Cancelled: "is-neutral",
  Pending: "is-pending",
};

const formatDate = (dateStr) => {
  return formatDateIST(dateStr);
};

const formatDateTime = (dateStr) => {
  return formatDateTimeIST(dateStr);
};

const toDateKey = (value) => {
  return toDateKeyIST(value);
};

const isDateWithinRange = (dateStr, startDate, endDate) => {
  if (!dateStr || !startDate || !endDate) return false;
  return dateStr >= startDate && dateStr <= endDate;
};

const parseDateKey = (dateStr) => {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};

const isWeekendDate = (date) => [0, 6].includes(date.getDay());

const calculateWorkingLeaveDays = (startDate, endDate) => {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (!start || !end || end < start) return 0;

  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    if (!isWeekendDate(current)) count += 1;
    current.setDate(current.getDate() + 1);
  }
  return count;
};

const LEAVE_CANCELLATION_CUTOFF_HOURS = 48;

const getLeaveStartKey = (leave = {}) =>
  toDateKey(leave.approved_start_date || leave.start_date);

const getLeaveCancellationCutoff = (leave = {}) => {
  const startKey = getLeaveStartKey(leave);
  if (!startKey) return null;
  const startDate = parseDateKey(startKey);
  if (!startDate) return null;
  return new Date(startDate.getTime() - (LEAVE_CANCELLATION_CUTOFF_HOURS * 60 * 60 * 1000));
};

const canEmployeeCancelApprovedLeave = (leave = {}) => {
  if (leave.status !== "Approved") return false;
  const cutoff = getLeaveCancellationCutoff(leave);
  return Boolean(cutoff && Date.now() <= cutoff.getTime());
};

const canLeadCancelApprovedLeave = (leave = {}) => {
  if (leave.status !== "Approved") return false;
  const cutoff = getLeaveCancellationCutoff(leave);
  return Boolean(cutoff && Date.now() > cutoff.getTime());
};

const getCancellationCutoffLabel = (leave = {}) => {
  const cutoff = getLeaveCancellationCutoff(leave);
  if (!cutoff) return "Not available";
  return cutoff.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const leaveOverlapsRange = (item, dateRange) => {
  if (!dateRange.start && !dateRange.end) return true;
  const start = toDateKey(item.approved_start_date || item.start_date);
  const end = toDateKey(item.approved_end_date || item.end_date) || start;
  if (!start) return false;
  if (dateRange.start && end < dateRange.start) return false;
  if (dateRange.end && start > dateRange.end) return false;
  return true;
};

const normalizeLeaveTypeFilter = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return ["lop", "lwp", "leave without pay", "leave with loss of pay"].includes(normalized)
    ? "lop"
    : normalized;
};

const getLeaveTypeDisplayLabel = (value, fallback = "Leave") => {
  const normalized = String(value || "").trim();
  if (!normalized) return fallback;
  return normalizeLeaveTypeFilter(normalized) === "lop" ? "LOP" : normalized;
};

const getLeaveApproverLabel = (leave = {}) => {
  const approvedBy = String(leave.approved_by || "").trim();
  if (approvedBy) return approvedBy;

  const currentApproverName = String(
    leave.current_approver_name
    || leave.currentApproverName
    || leave.current_approver_email
    || leave.currentApproverEmail
    || ""
  ).trim();
  if (currentApproverName) return currentApproverName;

  if (leave.status === "Pending") return "Pending approval";
  return "Not available";
};

const matchesLeaveTypeFilter = (leaveType, selectedType) =>
  selectedType === "all" || normalizeLeaveTypeFilter(leaveType) === normalizeLeaveTypeFilter(selectedType);

const buildSuggestions = (items, fields) => {
  const seen = new Set();
  return items.flatMap((item) =>
    fields
      .map((field) => item[field])
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

const messageTone = (message) =>
  message.includes("Error") || message.includes("Failed") || message.includes("⚠️")
    ? "is-error"
    : "is-success";

const HISTORY_PAGE_SIZE = 6;

const handleCardKeyDown = (event, action) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
};

const EmployeeLeaves = ({ user, navigationState }) => {
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState([]);
  const [leave, setLeave] = useState({
    leave_type: "Sick",
    start_date: "",
    end_date: "",
    reason: "",
    logout_time: "",
    is_half_day: false,
    half_day_period: "",
  });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingLeave, setEditingLeave] = useState(null);
  const [hasReportees, setHasReportees] = useState(false);
  const [reportees, setReportees] = useState([]);
  const [teamPendingLeaves, setTeamPendingLeaves] = useState([]);
  const [teamDecisionHistory, setTeamDecisionHistory] = useState([]);
  const [teamHistoryLoading, setTeamHistoryLoading] = useState(false);
  const [rejectModal, setRejectModal] = useState({ show: false, leaveId: null, reason: "" });
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [historyFilterStatus, setHistoryFilterStatus] = useState("all");
  const [historyFilterType, setHistoryFilterType] = useState("all");
  const [historyDateRange, setHistoryDateRange] = useState({ start: "", end: "" });
  const [historySortBy, setHistorySortBy] = useState("newest");
  const [historyPage, setHistoryPage] = useState(1);
  const [activeTab, setActiveTab] = useState("my-leaves");
  const [calendarFocusDate, setCalendarFocusDate] = useState("");

  const isIntern = user?.employment_type === "Intern";
  const requestedLeaveDays = useMemo(() => {
    if (!leave.start_date || !leave.end_date || leave.leave_type === "Early Logout") return null;
    if (leave.is_half_day) return 0.5;
    return calculateWorkingLeaveDays(leave.start_date, leave.end_date);
  }, [leave.end_date, leave.is_half_day, leave.leave_type, leave.start_date]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [balanceRes, historyRes] = await Promise.all([
        axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/balance/${user.id}`),
        axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/history/${user.id}`),
      ]);

      setBalance(balanceRes.data);
      setHistory(Array.isArray(historyRes.data) ? historyRes.data : []);
    } catch (err) {
      console.error("Error fetching leave data:", err);
      setMessage("Failed to load leave data");
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  const checkForReportees = useCallback(async () => {
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/users/get_employees_by_manager/${encodeURIComponent(user.email)}`
      );
      const nextReportees = Array.isArray(res.data) ? res.data : [];
      setReportees(nextReportees);
      setHasReportees(nextReportees.length > 0);
    } catch (err) {
      console.error("Error checking reportees:", err);
      setReportees([]);
      setHasReportees(false);
    }
  }, [user.email]);

  const fetchTeamPendingLeaves = useCallback(async () => {
    try {
      const res = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/leaves/pending/${encodeURIComponent(user.email)}`
      );
      setTeamPendingLeaves(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Error fetching team pending leaves:", err);
      setTeamPendingLeaves([]);
    }
  }, [user.email]);

  const fetchTeamDecisionHistory = useCallback(async () => {
    if (!reportees.length) {
      setTeamDecisionHistory([]);
      return;
    }

    try {
      setTeamHistoryLoading(true);

      const historyResponses = await Promise.all(
        reportees.map(async (reportee) => {
          const employeeId = reportee._id || reportee.id;
          const response = await axios.get(
            `${process.env.REACT_APP_BACKEND_URL}/api/leaves/history/${employeeId}`
          );

          const records = Array.isArray(response.data) ? response.data : [];
          return records.map((record) => ({
            ...record,
            employee_name: reportee.name,
            employee_email: reportee.email,
            employee_department: reportee.department,
            employee_designation: reportee.designation,
          }));
        })
      );

      const flattened = historyResponses
        .flat()
        .filter((record) => ["Approved", "Rejected"].includes(record.status))
        .sort((first, second) => {
          const firstDate = new Date(first.approved_on || first.rejected_on || first.applied_on || 0);
          const secondDate = new Date(second.approved_on || second.rejected_on || second.applied_on || 0);
          return secondDate - firstDate;
        });

      setTeamDecisionHistory(flattened);
    } catch (err) {
      console.error("Error fetching team decision history:", err);
      setTeamDecisionHistory([]);
    } finally {
      setTeamHistoryLoading(false);
    }
  }, [reportees]);

  useEffect(() => {
    if (user?.id && user?.email) {
      fetchData();
      checkForReportees();
    }
  }, [checkForReportees, fetchData, user?.email, user?.id]);

  useEffect(() => {
    if (hasReportees && activeTab === "team-leaves") {
      fetchTeamPendingLeaves();
      fetchTeamDecisionHistory();
    }
  }, [activeTab, fetchTeamDecisionHistory, fetchTeamPendingLeaves, hasReportees]);

  useEffect(() => {
    if (!navigationState) return;

    if (navigationState.activeTab) {
      setActiveTab(navigationState.activeTab);
    }

    if (navigationState.historyFilterStatus) {
      setHistoryFilterStatus(navigationState.historyFilterStatus);
    }

    if (navigationState.historyFilterType) {
      setHistoryFilterType(navigationState.historyFilterType);
    }

    if (navigationState.historySearchTerm !== undefined) {
      setHistorySearchTerm(navigationState.historySearchTerm);
    }

    if (navigationState.focusDate) {
      setCalendarFocusDate(toDateKey(navigationState.focusDate));
      setHistoryFilterStatus("approved");
      setActiveTab("my-leaves");
    } else if (navigationState.source) {
      setCalendarFocusDate("");
      setActiveTab("my-leaves");
    }
  }, [navigationState]);

  const getMinDate = (leaveType) => {
    const type = (leaveType || leave.leave_type).toLowerCase();
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];

    if (type === "planned") {
      const minDate = new Date(today);
      minDate.setDate(today.getDate() + 8);
      return minDate.toISOString().split("T")[0];
    }

    return todayStr;
  };

  const getMaxDate = (leaveType) => {
    const type = (leaveType || leave.leave_type).toLowerCase();

    if (type === "sick") {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split("T")[0];
    }

    return undefined;
  };

  const handleHalfDayChange = (checked) => {
    setLeave((previous) => ({
      ...previous,
      is_half_day: checked,
      half_day_period: checked ? "morning" : "",
      end_date: checked ? previous.start_date : previous.end_date,
    }));
  };

  const handleStartDateChange = (value) => {
    setLeave((previous) => ({
      ...previous,
      start_date: value,
      end_date: previous.is_half_day ? value : previous.end_date,
    }));
  };

  const validateEditLeave = (editData) => {
    const { leave_type, start_date, end_date, is_half_day, half_day_period, logout_time } = editData;
    const type = leave_type.toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = parseDateKey(start_date);
    start.setHours(0, 0, 0, 0);

    const end = parseDateKey(end_date);
    end.setHours(0, 0, 0, 0);

    const daysDiff = Math.round((start - today) / (1000 * 60 * 60 * 24));

    if (end < start) return "End date cannot be before start date.";

    if (type === "planned") {
      if (daysDiff < 7) return "Planned leave must be applied at least 7 days in advance.";
    } else if (type === "sick") {
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      if (start < today) return `Sick leave cannot be applied for past dates (${start_date}).`;
      if (start > tomorrow) return "Sick leave can only be applied for today or tomorrow.";
      if (end > tomorrow) return "Sick leave end date cannot be beyond tomorrow.";
    } else if (type === "early logout") {
      if (start < today) return `Early logout cannot be applied for past dates (${start_date}).`;
      if (!logout_time || !logout_time.trim()) return "Logout time is mandatory for early logout.";
    } else {
      if (start < today) return `Cannot apply leave for past dates (${start_date}).`;
      if (end < today) return "End date cannot be before today.";
    }

    if (is_half_day) {
      if (start_date !== end_date) return "Half-day leave can only be applied for a single day.";
      if (isWeekendDate(start)) return "Half-day leave cannot be applied on weekends.";
      if (!half_day_period || !["morning", "afternoon"].includes(half_day_period)) {
        return "Please select half-day period (morning or afternoon).";
      }
    } else if (calculateWorkingLeaveDays(start_date, end_date) === 0) {
      return "Selected leave range has no working days. Weekends are not counted as leave.";
    }

    return null;
  };

  const applyLeave = async () => {
    if (!leave.start_date || !leave.end_date) {
      setMessage("Please select start and end dates");
      return;
    }

    if (!leave.reason || !leave.reason.trim()) {
      setMessage("⚠️ Reason is mandatory. Please provide a reason for your leave.");
      return;
    }

    if (leave.is_half_day && !leave.half_day_period) {
      setMessage("⚠️ Please select half-day period (morning or afternoon)");
      return;
    }

    if (leave.leave_type === "Early Logout" && !leave.logout_time) {
      setMessage("⚠️ Logout time is mandatory for early logout");
      return;
    }

    const validationError = validateEditLeave(leave);
    if (validationError) {
      setMessage(`⚠️ ${validationError}`);
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
        is_half_day: leave.is_half_day,
        half_day_period: leave.half_day_period || "",
      });

      if (res.status === 201) {
        setMessage("Leave applied successfully");
        setLeave({
          leave_type: "Sick",
          start_date: "",
          end_date: "",
          reason: "",
          logout_time: "",
          is_half_day: false,
          half_day_period: "",
        });
        fetchData();
      }
    } catch (err) {
      console.error(err);
      setMessage(`Error: ${err.response?.data?.error || "Failed to apply leave"}`);
    } finally {
      setLoading(false);
    }
  };

  const updateLeave = async () => {
    if (!editingLeave?.start_date || !editingLeave?.end_date) {
      setMessage("Please select start and end dates");
      return;
    }

    const validationError = validateEditLeave(editingLeave);
    if (validationError) {
      setMessage(`⚠️ ${validationError}`);
      return;
    }

    try {
      setLoading(true);
      const res = await axios.put(
        `${process.env.REACT_APP_BACKEND_URL}/api/leaves/update/${editingLeave._id}`,
        {
          leave_type: editingLeave.leave_type,
          start_date: editingLeave.start_date,
          end_date: editingLeave.end_date,
          reason: editingLeave.reason,
          logout_time: editingLeave.logout_time || "",
          is_half_day: editingLeave.is_half_day || false,
          half_day_period: editingLeave.half_day_period || "",
        }
      );

      if (res.status === 200) {
        setMessage("Leave updated successfully");
        setEditingLeave(null);
        fetchData();
      }
    } catch (err) {
      console.error(err);
      setMessage(`Error: ${err.response?.data?.error || "Failed to update leave"}`);
    } finally {
      setLoading(false);
    }
  };

  const cancelLeave = async (leaveId) => {
    const leaveRecord = history.find((record) => record._id === leaveId);
    const confirmationText = leaveRecord?.status === "Approved"
      ? "Cancel this approved leave? Your timesheet leave rows will refresh after cancellation."
      : "Are you sure you want to cancel this leave?";
    if (!window.confirm(confirmationText)) return;

    try {
      setLoading(true);
      const res = await axios.put(`${process.env.REACT_APP_BACKEND_URL}/api/leaves/cancel/${leaveId}`);

      if (res.status === 200) {
        setMessage("Leave cancelled successfully");
        fetchData();
      }
    } catch (err) {
      console.error(err);
      setMessage(`Error: ${err.response?.data?.error || "Failed to cancel leave"}`);
    } finally {
      setLoading(false);
    }
  };

  const updateTeamLeaveStatus = async (leaveId, status, rejectionReason = "") => {
    try {
      const payload = {
        status,
        approved_by: user.name || user.email,
      };

      if (status === "Rejected" && rejectionReason.trim()) {
        payload.rejection_reason = rejectionReason;
      }

      const res = await axios.put(
        `${process.env.REACT_APP_BACKEND_URL}/api/leaves/update_status/${leaveId}`,
        payload,
        { headers: buildRequesterHeaders(user) }
      );

      if (res.status === 200) {
        setMessage(`Leave ${status.toLowerCase()} successfully`);
        setRejectModal({ show: false, leaveId: null, reason: "" });
        fetchTeamPendingLeaves();
        window.dispatchEvent(new Event("refreshNotifications"));
      }
    } catch (err) {
      console.error(err);
      setMessage("Error updating leave status");
    }
  };

  const cancelTeamApprovedLeave = async (leaveId) => {
    if (!window.confirm("Cancel this approved leave for your reportee? The matching timesheet rows will refresh.")) return;

    try {
      setLoading(true);
      const res = await axios.put(
        `${process.env.REACT_APP_BACKEND_URL}/api/leaves/cancel_by_lead/${leaveId}`,
        {
          lead_id: user.id || user._id,
          lead_email: user.email,
          reason: "Cancelled by reporting lead after 48-hour employee cancellation window",
        }
      );

      if (res.status === 200) {
        setMessage("Approved leave cancelled successfully");
        fetchTeamPendingLeaves();
        fetchTeamDecisionHistory();
        fetchData();
        window.dispatchEvent(new Event("refreshNotifications"));
      }
    } catch (err) {
      console.error(err);
      setMessage(`Error: ${err.response?.data?.error || "Failed to cancel approved leave"}`);
    } finally {
      setLoading(false);
    }
  };

  const confirmTeamReject = async () => {
    if (!rejectModal.reason.trim()) {
      setMessage("Please enter a rejection reason");
      return;
    }

    await updateTeamLeaveStatus(rejectModal.leaveId, "Rejected", rejectModal.reason);
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

  const getFilteredAndSortedHistory = useCallback(
    (leaves) => {
      let filtered = [...leaves];

      if (historySearchTerm.trim()) {
        const normalizedHistorySearch = historySearchTerm.toLowerCase();
        filtered = filtered.filter(
          (item) =>
            (item.leave_type || "").toLowerCase().includes(normalizedHistorySearch) ||
            getLeaveTypeDisplayLabel(item.leave_type).toLowerCase().includes(normalizedHistorySearch) ||
            (item.reason || "").toLowerCase().includes(normalizedHistorySearch) ||
            (item.status || "").toLowerCase().includes(normalizedHistorySearch)
        );
      }

      if (historyFilterStatus !== "all") {
        filtered = filtered.filter(
          (item) => item.status?.toLowerCase() === historyFilterStatus.toLowerCase()
        );
      }

      if (historyFilterType !== "all") {
        filtered = filtered.filter((item) => matchesLeaveTypeFilter(item.leave_type, historyFilterType));
      }

      filtered = filtered.filter((item) => leaveOverlapsRange(item, historyDateRange));

      if (calendarFocusDate) {
        filtered = filtered.filter((item) =>
          isDateWithinRange(
            calendarFocusDate,
            toDateKey(item.approved_start_date || item.start_date),
            toDateKey(item.approved_end_date || item.end_date)
          )
        );
      }

      return [...filtered].sort((first, second) => {
        switch (historySortBy) {
          case "newest":
            return new Date(second.applied_on) - new Date(first.applied_on);
          case "oldest":
            return new Date(first.applied_on) - new Date(second.applied_on);
          case "start_date":
            return new Date(second.start_date) - new Date(first.start_date);
          case "status":
            return (first.status || "").localeCompare(second.status || "");
          case "type":
            return (first.leave_type || "").localeCompare(second.leave_type || "");
          default:
            return 0;
        }
      });
    },
    [calendarFocusDate, historyDateRange, historyFilterStatus, historyFilterType, historySearchTerm, historySortBy]
  );

  const getFilteredAndSortedTeamLeaves = useCallback(
    (leaves) => {
      let filtered = [...leaves];

      if (searchTerm.trim()) {
        filtered = filtered.filter(
          (item) =>
            (item.employee_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.employee_email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.employee_designation || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.employee_department || "").toLowerCase().includes(searchTerm.toLowerCase())
        );
      }

      return [...filtered].sort((first, second) => {
        switch (sortBy) {
          case "newest":
            return new Date(second.applied_on) - new Date(first.applied_on);
          case "oldest":
            return new Date(first.applied_on) - new Date(second.applied_on);
          case "name":
            return (first.employee_name || "").localeCompare(second.employee_name || "");
          case "department":
            return (first.employee_department || "").localeCompare(second.employee_department || "");
          default:
            return 0;
        }
      });
    },
    [searchTerm, sortBy]
  );

  const displayHistory = useMemo(() => getFilteredAndSortedHistory(history), [getFilteredAndSortedHistory, history]);
  useEffect(() => {
    setHistoryPage(1);
  }, [calendarFocusDate, historyDateRange, historyFilterStatus, historyFilterType, historySearchTerm, historySortBy]);

  const historyPageCount = Math.max(1, Math.ceil(displayHistory.length / HISTORY_PAGE_SIZE));
  const visibleHistory = displayHistory.slice(
    (historyPage - 1) * HISTORY_PAGE_SIZE,
    historyPage * HISTORY_PAGE_SIZE
  );
  useEffect(() => {
    const leaveId = navigationState?.leaveId;
    if (!leaveId || activeTab !== "my-leaves" || displayHistory.length === 0) return;

    const index = displayHistory.findIndex((item) => item._id === leaveId);
    if (index >= 0) {
      setHistoryPage(Math.floor(index / HISTORY_PAGE_SIZE) + 1);
    }
  }, [activeTab, displayHistory, navigationState]);

  useEffect(() => {
    const leaveId = navigationState?.leaveId;
    if (!leaveId) return;
    const target = document.getElementById(`employee-leave-${leaveId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [historyPage, navigationState, visibleHistory]);
  const historyPageNumbers = Array.from({ length: historyPageCount }, (_, index) => index + 1).filter(
    (page) => page === 1 || page === historyPageCount || Math.abs(page - historyPage) <= 1
  );
  const historySearchSuggestions = useMemo(
    () => buildSuggestions(history, ["leave_type", "reason", "status"]),
    [history]
  );
  const teamSearchSuggestions = useMemo(
    () => buildSuggestions(teamPendingLeaves, ["employee_name", "employee_email", "employee_designation", "employee_department"]),
    [teamPendingLeaves]
  );
  const displayTeamLeaves = useMemo(
    () => getFilteredAndSortedTeamLeaves(teamPendingLeaves),
    [getFilteredAndSortedTeamLeaves, teamPendingLeaves]
  );
  const totalBalance = balance ? (balance.sick || 0) + (balance.planned || 0) + (balance.optional || 0) : 0;

  const balanceCards = useMemo(() => {
    if (!balance) return [];

    const cards = [
      {
        label: "Sick leave",
        value: balance.sick || 0,
        note: `${balance.sickTotal || 6} allocated`,
      },
    ];

    if (!isIntern) {
      cards.push(
        {
          label: "Planned leave",
          value: balance.planned || 0,
          note: `${balance.plannedTotal || 12} allocated`,
        },
        {
          label: "Optional leave",
          value: balance.optional || 0,
          note: `${balance.optionalTotal || 2} allocated`,
        }
      );
    }

    cards.push({
      label: "LOP used",
      value: balance.lwp || 0,
      note: "Unpaid leave recorded",
    });

    return cards;
  }, [balance, isIntern]);

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openHistoryForType = (type) => {
    setActiveTab("my-leaves");
    setHistoryFilterType(type);
    scrollToSection("employee-leave-history");
  };

  return (
    <div className="admin-dashboard leave-workspace employee-workspace">
      <header className="admin-hero">
        <div>
          <div className="admin-section-overline">Employee leave workspace</div>
          <h1>{activeTab === "team-leaves" ? "Team Leave Approvals" : "Leave Management"}</h1>
          <p>
            {activeTab === "team-leaves"
              ? "Review pending requests from your direct reports using the same approval style as the admin workspace."
              : "Apply for leave, review balances, and track every request from one employee-focused workspace."}
          </p>
        </div>

        <div className="admin-hero-meta">
          <div className="admin-hero-meta-item">
            <span>Total balance</span>
            <strong>{isIntern ? balance?.sick || 0 : totalBalance} days</strong>
          </div>
          <div className="admin-hero-meta-item">
            <span>Pending requests</span>
            <strong>{history.filter((item) => item.status === "Pending").length} awaiting decisions</strong>
          </div>
        </div>
      </header>

      {hasReportees ? (
        <nav
          className="page-subtab-strip employee-leave-tab-strip"
          role="tablist"
          aria-label="Employee leave tabs"
        >
          <button
            type="button"
            className={`page-subtab-button employee-leave-tab-button ${activeTab === "my-leaves" ? "is-active" : ""}`}
            onClick={() => setActiveTab("my-leaves")}
            role="tab"
            aria-selected={activeTab === "my-leaves"}
          >
            My Leaves
          </button>
          <button
            type="button"
            className={`page-subtab-button employee-leave-tab-button ${activeTab === "team-leaves" ? "is-active" : ""}`}
            onClick={() => setActiveTab("team-leaves")}
            role="tab"
            aria-selected={activeTab === "team-leaves"}
          >
            Team Leaves {teamPendingLeaves.length ? `(${teamPendingLeaves.length})` : ""}
          </button>
        </nav>
      ) : null}

      {message ? <div className={`admin-toast ${messageTone(message)}`}>{message}</div> : null}

      <div className="admin-dashboard-grid admin-dashboard-grid-compact">
        {balanceCards.map((card) => (
          <article
            key={card.label}
            className="fiori-stat-card is-actionable employee-balance-card"
            onClick={() => openHistoryForType(card.label.toLowerCase().includes("sick")
              ? "sick"
              : card.label.toLowerCase().includes("planned")
                ? "planned"
                : card.label.toLowerCase().includes("optional")
                  ? "optional"
                  : "lop")}
            onKeyDown={(event) =>
              handleCardKeyDown(event, () =>
                openHistoryForType(card.label.toLowerCase().includes("sick")
                  ? "sick"
                  : card.label.toLowerCase().includes("planned")
                    ? "planned"
                    : card.label.toLowerCase().includes("optional")
                      ? "optional"
                      : "lop")
              )
            }
            role="button"
            tabIndex={0}
          >
            <div className="fiori-stat-label">{card.label}</div>
            <div className="fiori-stat-value">{card.value}</div>
            <div className="fiori-stat-note">{card.note}</div>
          </article>
        ))}
      </div>

      {activeTab === "my-leaves" ? (
        <div className="employee-leave-layout">
          <section className="fiori-panel employee-apply-panel">
            <div className="fiori-panel-header">
              <div>
                <h3>Apply for leave</h3>
                <p>Submit a request with the same field structure and card language as the admin workspace.</p>
              </div>
              <span className="fiori-status-pill is-neutral">{isIntern ? "Intern policy" : "Standard policy"}</span>
            </div>

            <div className="employee-form-grid">
              <div className="fiori-form-field">
                <label>Leave type</label>
                <select
                  className="input"
                  value={leave.leave_type}
                  onChange={(event) => {
                    const newType = event.target.value;
                    const allowsHalfDay = ["Sick", "LWP", "LOP"].includes(newType);
                    setLeave((previous) => ({
                      ...previous,
                      leave_type: newType,
                      is_half_day: allowsHalfDay ? previous.is_half_day : false,
                      half_day_period: allowsHalfDay ? previous.half_day_period : "",
                      start_date: "",
                      end_date: "",
                    }));
                  }}
                >
                  <option value="Sick">Sick Leave</option>
                  {isIntern ? null : <option value="Planned">Planned Leave</option>}
                  {isIntern ? null : <option value="Optional">Optional Holiday</option>}
                  <option value="LOP">Leave Without Pay (LOP)</option>
                  <option value="Early Logout">Early Logout</option>
                </select>
              </div>

              <div className="fiori-form-field">
                <label>Start date</label>
                <input
                  className="input"
                  type="date"
                  value={leave.start_date}
                  onChange={(event) => handleStartDateChange(event.target.value)}
                  min={getMinDate()}
                  max={getMaxDate()}
                />
              </div>

              <div className="fiori-form-field">
                <label>End date</label>
                <input
                  className="input"
                  type="date"
                  value={leave.end_date}
                  onChange={(event) => setLeave((previous) => ({ ...previous, end_date: event.target.value }))}
                  min={leave.start_date || getMinDate()}
                  max={leave.leave_type === "Sick" ? getMaxDate() : undefined}
                  disabled={leave.is_half_day}
                />
              </div>

              {leave.leave_type === "Early Logout" ? (
                <div className="fiori-form-field">
                  <label>Logout time</label>
                  <input
                    className="input"
                    type="time"
                    value={leave.logout_time}
                    onChange={(event) => setLeave((previous) => ({ ...previous, logout_time: event.target.value }))}
                  />
                </div>
              ) : null}
            </div>

            {leave.leave_type === "Planned" && !isIntern ? (
              <div className="employee-policy-callout warning">
                <TriangleAlert size={18} />
                <div>
                  <strong>Planned leave policy</strong>
                  <p>Planned leave must be applied at least 7 days in advance.</p>
                </div>
              </div>
            ) : null}

            {leave.leave_type === "Sick" ? (
              <div className="employee-policy-callout info">
                <ShieldCheck size={18} />
                <div>
                  <strong>Sick leave policy</strong>
                  <p>Sick leave can only be raised for today or tomorrow. Leaves above 3 days require documentation.</p>
                </div>
              </div>
            ) : null}

            {requestedLeaveDays !== null ? (
              <div className={`employee-policy-callout ${requestedLeaveDays > 0 ? "info" : "warning"}`}>
                <CalendarCheck2 size={18} />
                <div>
                  <strong>{requestedLeaveDays} leave day{requestedLeaveDays === 1 ? "" : "s"}</strong>
                  <p>Only Monday to Friday are counted. Saturday and Sunday are excluded automatically.</p>
                </div>
              </div>
            ) : null}

            {["Sick", "LWP", "LOP"].includes(leave.leave_type) ? (
              <div className="employee-halfday-panel">
                <label className="employee-checkbox-row">
                  <input
                    type="checkbox"
                    checked={leave.is_half_day}
                    onChange={(event) => handleHalfDayChange(event.target.checked)}
                  />
                  <span>This request is for a half day</span>
                </label>

                {leave.is_half_day ? (
                  <div className="employee-radio-row">
                    <label>
                      <input
                        type="radio"
                        name="half_day_period"
                        value="morning"
                        checked={leave.half_day_period === "morning"}
                        onChange={(event) =>
                          setLeave((previous) => ({ ...previous, half_day_period: event.target.value }))
                        }
                      />
                      <span>Morning</span>
                    </label>
                    <label>
                      <input
                        type="radio"
                        name="half_day_period"
                        value="afternoon"
                        checked={leave.half_day_period === "afternoon"}
                        onChange={(event) =>
                          setLeave((previous) => ({ ...previous, half_day_period: event.target.value }))
                        }
                      />
                      <span>Afternoon</span>
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="fiori-form-field">
              <label>Reason</label>
              <textarea
                rows={2}
                value={leave.reason}
                onChange={(event) => setLeave((previous) => ({ ...previous, reason: event.target.value }))}
                placeholder="Share the context for your request"
              />
            </div>

            <div className="admin-modal-actions">
              <button
                className="fiori-button primary full-width employee-apply-button"
                onClick={applyLeave}
                disabled={loading}
              >
                {loading ? "Submitting..." : "Apply for Leave"}
              </button>
            </div>
          </section>

          <section className="fiori-panel employee-history-panel" id="employee-leave-history">
            <div className="fiori-panel-header">
              <div>
                <h3>Leave history</h3>
                <p>Filter your requests by type, status, and application date.</p>
              </div>
              <span className="fiori-status-pill is-neutral">
                {displayHistory.length} of {history.length}
              </span>
            </div>

            <div className="leave-filter-grid leave-history-filter-grid">
              <div className="fiori-form-field employee-history-search">
                <label className="leave-field-label">Search</label>
                <ValueHelpSearch
                  value={historySearchTerm}
                  onChange={setHistorySearchTerm}
                  suggestions={historySearchSuggestions}
                  placeholder="Search by type, reason, or status"
                />
              </div>

              <div className="fiori-form-field">
                <label className="leave-field-label">Status</label>
                <ValueHelpSelect
                  value={historyFilterStatus}
                  onChange={setHistoryFilterStatus}
                  searchPlaceholder="Search statuses"
                  options={[
                    { value: "all", label: "All status" },
                    { value: "pending", label: "Pending" },
                    { value: "approved", label: "Approved" },
                    { value: "rejected", label: "Rejected" },
                    { value: "cancelled", label: "Cancelled" },
                  ]}
                />
              </div>

              <div className="fiori-form-field">
                <label className="leave-field-label">Type</label>
                <ValueHelpSelect
                  value={historyFilterType}
                  onChange={setHistoryFilterType}
                  searchPlaceholder="Search leave types"
                  options={[
                    { value: "all", label: "All types" },
                    { value: "sick", label: "Sick" },
                    ...(isIntern ? [] : [{ value: "planned", label: "Planned" }, { value: "optional", label: "Optional" }]),
                    { value: "lop", label: "LOP" },
                    { value: "early logout", label: "Early Logout" },
                  ]}
                />
              </div>

              <div className="fiori-form-field">
                <label className="leave-field-label">Sort by</label>
                <ValueHelpSelect
                  value={historySortBy}
                  onChange={setHistorySortBy}
                  searchPlaceholder="Search sort options"
                  options={[
                    { value: "newest", label: "Newest first" },
                    { value: "oldest", label: "Oldest first" },
                    { value: "start_date", label: "Start date" },
                    { value: "status", label: "Status" },
                    { value: "type", label: "Leave type" },
                  ]}
                />
              </div>

              <div className="fiori-form-field">
                <label className="leave-field-label">From</label>
                <input
                  className="input"
                  type="date"
                  value={historyDateRange.start}
                  onChange={(event) => setHistoryDateRange((previous) => ({ ...previous, start: event.target.value }))}
                />
              </div>

              <div className="fiori-form-field">
                <label className="leave-field-label">To</label>
                <input
                  className="input"
                  type="date"
                  value={historyDateRange.end}
                  onChange={(event) => setHistoryDateRange((previous) => ({ ...previous, end: event.target.value }))}
                />
              </div>
            </div>

            <div className="leave-results-bar employee-history-toolbar">
              <div className="leave-results-meta">
                <CalendarCheck2 size={16} />
                <span>
                  {calendarFocusDate
                    ? `Showing approved leave records for ${formatDate(calendarFocusDate)}.`
                    : "Request history and edit actions stay available here."}
                </span>
              </div>
              {calendarFocusDate ? (
                <button
                  type="button"
                  className="fiori-button secondary"
                  onClick={() => setCalendarFocusDate("")}
                >
                  Clear day filter
                </button>
              ) : null}
            </div>

            {loading ? (
              <div className="fiori-loading-card">
                <Clock3 size={20} />
                <div>
                  <strong>Loading history</strong>
                  <p>We are syncing your latest leave records.</p>
                </div>
              </div>
            ) : displayHistory.length === 0 ? (
              <div className="admin-empty-state">
                <CalendarCheck2 size={22} />
                <div>
                  <strong>{history.length === 0 ? "No leave history found" : "No records match these filters"}</strong>
                  <p>Try changing the filters or submit your first leave request.</p>
                </div>
              </div>
            ) : (
              <div className="fiori-table-shell employee-history-shell">
                <table className="fiori-table employee-history-table">
                  <thead>
                    <tr>
                      <th>Leave Type</th>
                      <th>Period</th>
                      <th>Days</th>
                      <th>Status</th>
                      <th>Approver</th>
                      <th>Applied On</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleHistory.map((item) => (
                      <tr
                        key={item._id}
                        id={`employee-leave-${item._id}`}
                        className={
                          navigationState?.leaveId === item._id
                            ? "employee-history-row-highlight"
                            : calendarFocusDate &&
                              isDateWithinRange(
                                calendarFocusDate,
                                toDateKey(item.approved_start_date || item.start_date),
                                toDateKey(item.approved_end_date || item.end_date)
                              )
                            ? "employee-history-row-highlight"
                            : ""
                        }
                      >
                        <td className="employee-history-type-cell">
                          <div className="fiori-primary-cell employee-history-primary">
                            <strong>{getLeaveTypeDisplayLabel(item.leave_type)}</strong>
                            <span className="employee-history-reason">{item.reason || "No reason shared"}</span>
                            {item.is_half_day ? <span>Half day: {item.half_day_period}</span> : null}
                          </div>
                        </td>
                        <td className="employee-history-period-cell">
                          <div className="employee-history-period">
                            <strong>{formatDate(item.start_date)}</strong>
                            <span>to</span>
                            <strong>{formatDate(item.end_date)}</strong>
                          </div>
                        </td>
                        <td className="employee-history-days-cell">
                          {item.leave_type === "Early Logout" ? `Logout ${item.logout_time || "N/A"}` : item.days}
                        </td>
                        <td>
                          <span className={`fiori-status-pill ${statusToneMap[item.status] || "is-neutral"}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="employee-history-approver-cell">
                          {getLeaveApproverLabel(item)}
                        </td>
                        <td>{formatDateTime(item.applied_on)}</td>
                        <td className="employee-history-actions-cell">
                          {item.status === "Pending" || canEmployeeCancelApprovedLeave(item) ? (
                            <div className="employee-table-actions">
                              {item.status === "Pending" ? (
                                <button
                                  className="fiori-button secondary"
                                  title="Edit leave request"
                                  onClick={() => setEditingLeave(item)}
                                >
                                  Edit request
                                </button>
                              ) : null}
                              <button
                                className="fiori-button secondary danger"
                                title="Cancel leave request"
                                onClick={() => cancelLeave(item._id)}
                              >
                                Cancel leave
                              </button>
                            </div>
                          ) : item.status === "Approved" ? (
                            <span className="fiori-stat-note employee-history-action-note">
                              Lead can cancel after {getCancellationCutoffLabel(item)}
                            </span>
                          ) : (
                            <span className="fiori-stat-note employee-history-action-note">No actions available</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {displayHistory.length > HISTORY_PAGE_SIZE ? (
              <div className="leave-history-pagination">
                <span>
                  Showing {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}-
                  {Math.min(historyPage * HISTORY_PAGE_SIZE, displayHistory.length)} of {displayHistory.length}
                </span>
                <div className="leave-history-page-controls">
                  <button
                    type="button"
                    className="fiori-button secondary"
                    onClick={() => setHistoryPage((page) => Math.max(1, page - 1))}
                    disabled={historyPage === 1}
                  >
                    Prev
                  </button>
                  {historyPageNumbers.map((page, index) => {
                    const previousPage = historyPageNumbers[index - 1];
                    return (
                      <React.Fragment key={page}>
                        {previousPage && page - previousPage > 1 ? (
                          <span className="leave-history-page-gap">...</span>
                        ) : null}
                        <button
                          type="button"
                          className={`leave-history-page-number ${historyPage === page ? "is-active" : ""}`}
                          onClick={() => setHistoryPage(page)}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    );
                  })}
                  <button
                    type="button"
                    className="fiori-button secondary"
                    onClick={() => setHistoryPage((page) => Math.min(historyPageCount, page + 1))}
                    disabled={historyPage === historyPageCount}
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : (
        <div className="employee-team-history-layout">
        <section className="fiori-panel">
          <div className="fiori-panel-header">
            <div>
              <h3>Pending team requests</h3>
              <p>Approve or reject requests from your reportees with the same workspace structure as admin.</p>
            </div>
            <span className="fiori-status-pill is-pending">{displayTeamLeaves.length} pending</span>
          </div>

          <div className="leave-filter-grid leave-filter-grid-compact">
            <div className="fiori-form-field">
              <label className="leave-field-label">Search employee</label>
              <ValueHelpSearch
                value={searchTerm}
                onChange={setSearchTerm}
                suggestions={teamSearchSuggestions}
                placeholder="Search by name, email, department, or role"
              />
            </div>

            <div className="fiori-form-field">
              <label className="leave-field-label">Sort by</label>
              <ValueHelpSelect
                value={sortBy}
                onChange={setSortBy}
                searchPlaceholder="Search sort options"
                options={[
                  { value: "newest", label: "Newest first" },
                  { value: "oldest", label: "Oldest first" },
                  { value: "name", label: "Employee name" },
                  { value: "department", label: "Department" },
                ]}
              />
            </div>
          </div>

          {displayTeamLeaves.length === 0 ? (
            <div className="admin-empty-state">
              <Users size={22} />
              <div>
                <strong>{teamPendingLeaves.length === 0 ? "No pending team requests" : "No requests match this search"}</strong>
                <p>Your approval queue is clear for now.</p>
              </div>
            </div>
          ) : (
            <div className="admin-approval-list">
              {displayTeamLeaves.map((teamLeave) => (
                <article
                  key={teamLeave._id}
                  className={`admin-approval-card ${isBirthdayLeave(teamLeave) ? "employee-approval-card-birthday" : ""}`}
                >
                  <div className="admin-approval-card-header">
                    <div>
                      <h4>{teamLeave.employee_name || "Unknown employee"}</h4>
                      <p>
                        {teamLeave.employee_email || "No email"}
                        {teamLeave.employee_designation ? ` • ${teamLeave.employee_designation}` : ""}
                        {teamLeave.employee_department ? ` • ${teamLeave.employee_department}` : ""}
                      </p>
                    </div>
                    {isBirthdayLeave(teamLeave) ? <span className="fiori-status-pill is-pending">Birthday</span> : null}
                  </div>

                  <div className="admin-approval-metadata">
                    <span>{teamLeave.leave_type}</span>
                    <span>
                      {formatDate(teamLeave.start_date)} to {formatDate(teamLeave.end_date)}
                    </span>
                    <span>
                      {teamLeave.leave_type === "Early Logout"
                        ? `Logout ${teamLeave.logout_time || "N/A"}`
                        : `${teamLeave.days || 0} day(s)`}
                    </span>
                  </div>

                  <div className="admin-approval-details">
                    <div className="is-wide">
                      <span>Reason</span>
                      <strong>{teamLeave.reason || "No reason shared"}</strong>
                    </div>
                    {teamLeave.is_half_day ? (
                      <div>
                        <span>Half day</span>
                        <strong>{teamLeave.half_day_period || "Selected"}</strong>
                      </div>
                    ) : null}
                    <div>
                      <span>Applied on</span>
                      <strong>{formatDateTime(teamLeave.applied_on)}</strong>
                    </div>
                  </div>

                  <div className="admin-approval-actions">
                    <button
                      className="fiori-button secondary danger"
                      onClick={() => setRejectModal({ show: true, leaveId: teamLeave._id, reason: "" })}
                    >
                      Reject
                    </button>
                    <button
                      className="fiori-button primary"
                      onClick={() => updateTeamLeaveStatus(teamLeave._id, "Approved")}
                    >
                      Approve
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="fiori-panel">
          <div className="fiori-panel-header">
            <div>
              <h3>Approval and rejection history</h3>
              <p>Recent decisions across your reportees so you can review what was actioned.</p>
            </div>
            <span className="fiori-status-pill is-neutral">{teamDecisionHistory.length} decisions</span>
          </div>

          {teamHistoryLoading ? (
            <div className="fiori-loading-card">
              <Clock3 size={20} />
              <div>
                <strong>Loading team decision history</strong>
                <p>We are compiling approvals and rejections from your reportees.</p>
              </div>
            </div>
          ) : teamDecisionHistory.length === 0 ? (
            <div className="admin-empty-state">
              <Users size={22} />
              <div>
                <strong>No team decisions recorded yet</strong>
                <p>Approvals and rejections will appear here once you start acting on requests.</p>
              </div>
            </div>
          ) : (
            <div className="admin-approval-list employee-team-history-list">
              {teamDecisionHistory.slice(0, 12).map((record) => (
                <article key={`${record._id}-${record.status}`} className="admin-approval-card employee-team-history-card">
                  <div className="admin-approval-card-header">
                    <div>
                      <h4>{record.employee_name || "Unknown employee"}</h4>
                      <p>
                        {record.employee_designation ? `${record.employee_designation} • ` : ""}
                        {record.employee_department || "Department not set"}
                      </p>
                    </div>
                    <span className={`fiori-status-pill ${statusToneMap[record.status] || "is-neutral"}`}>
                      {record.status}
                    </span>
                  </div>

                  <div className="admin-approval-metadata">
                    <span>{record.leave_type}</span>
                    <span>
                      {formatDate(record.start_date)} to {formatDate(record.end_date)}
                    </span>
                    <span>{record.days || 0} day(s)</span>
                    <span>{record.employee_email || "No email"}</span>
                  </div>

                  <div className="admin-approval-details">
                    <div>
                      <span>Applied on</span>
                      <strong>{formatDateTime(record.applied_on)}</strong>
                    </div>
                    <div>
                      <span>Resolved on</span>
                      <strong>{formatDateTime(record.approved_on || record.rejected_on)}</strong>
                    </div>
                    <div className="is-wide">
                      <span>Reason</span>
                      <strong>{record.reason || "No reason shared"}</strong>
                    </div>
                    {record.approved_by ? (
                      <div>
                        <span>Approved by</span>
                        <strong>{record.approved_by}</strong>
                      </div>
                    ) : null}
                    {record.rejection_reason ? (
                      <div className="is-wide">
                        <span>Rejection note</span>
                        <strong>{record.rejection_reason}</strong>
                      </div>
                    ) : null}
                  </div>
                  {canLeadCancelApprovedLeave(record) ? (
                    <div className="admin-approval-actions">
                      <button
                        className="fiori-button secondary danger"
                        onClick={() => cancelTeamApprovedLeave(record._id)}
                      >
                        Cancel Approved Leave
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
        </div>
      )}

      {editingLeave ? (
        <div className="admin-modal-overlay" onClick={() => setEditingLeave(null)}>
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-section-overline">Pending request</div>
                <h2>Edit leave request</h2>
                <p>Update dates or reason before your approver reviews it.</p>
              </div>
              <button className="fiori-button secondary" onClick={() => setEditingLeave(null)}>
                Close
              </button>
            </div>

            <div className="employee-edit-grid">
              <div className="fiori-form-field">
                <label>Leave type</label>
                <div className="input employee-readonly-field">{editingLeave.leave_type}</div>
              </div>

              <div className="fiori-form-field">
                <label>Start date</label>
                <input
                  className="input"
                  type="date"
                  value={editingLeave.start_date}
                  min={getMinDate(editingLeave.leave_type)}
                  max={getMaxDate(editingLeave.leave_type)}
                  onChange={(event) =>
                    setEditingLeave((previous) => ({
                      ...previous,
                      start_date: event.target.value,
                      end_date: previous.is_half_day ? event.target.value : previous.end_date,
                    }))
                  }
                />
              </div>

              <div className="fiori-form-field">
                <label>End date</label>
                <input
                  className="input"
                  type="date"
                  value={editingLeave.end_date}
                  min={editingLeave.start_date || getMinDate(editingLeave.leave_type)}
                  max={getMaxDate(editingLeave.leave_type)}
                  disabled={editingLeave.is_half_day}
                  onChange={(event) =>
                    setEditingLeave((previous) => ({ ...previous, end_date: event.target.value }))
                  }
                />
              </div>

              {editingLeave.leave_type === "Early Logout" ? (
                <div className="fiori-form-field">
                  <label>Logout time</label>
                  <input
                    className="input"
                    type="time"
                    value={editingLeave.logout_time || ""}
                    onChange={(event) =>
                      setEditingLeave((previous) => ({ ...previous, logout_time: event.target.value }))
                    }
                  />
                </div>
              ) : null}
            </div>

            <div className="fiori-form-field">
              <label>Reason</label>
              <textarea
                rows={4}
                value={editingLeave.reason || ""}
                onChange={(event) =>
                  setEditingLeave((previous) => ({ ...previous, reason: event.target.value }))
                }
              />
            </div>

            <div className="admin-modal-actions">
              <button className="fiori-button secondary" onClick={() => setEditingLeave(null)}>
                Cancel
              </button>
              <button className="fiori-button primary" onClick={updateLeave} disabled={loading}>
                {loading ? "Updating..." : "Update Leave"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rejectModal.show ? (
        <div
          className="admin-modal-overlay"
          onClick={() => setRejectModal({ show: false, leaveId: null, reason: "" })}
        >
          <div className="admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div>
                <div className="admin-section-overline">Approval action</div>
                <h2>Reject leave request</h2>
                <p>Provide a clear reason so the employee knows how to correct the request.</p>
              </div>
            </div>

            <div className="fiori-form-field">
              <label>Rejection reason</label>
              <textarea
                rows={4}
                value={rejectModal.reason}
                onChange={(event) =>
                  setRejectModal((previous) => ({ ...previous, reason: event.target.value }))
                }
                placeholder="Explain why this request cannot be approved"
                autoFocus
              />
            </div>

            <div className="admin-modal-actions">
              <button
                className="fiori-button secondary"
                onClick={() => setRejectModal({ show: false, leaveId: null, reason: "" })}
              >
                Cancel
              </button>
              <button
                className="fiori-button danger"
                onClick={confirmTeamReject}
                disabled={!rejectModal.reason.trim()}
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default EmployeeLeaves;
