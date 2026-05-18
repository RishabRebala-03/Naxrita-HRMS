// Timesheets.js — Production-grade, matches the existing codebase architecture
import { Children, useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  parseISO, subMonths,
} from 'date-fns';
import {
  Plus, Trash2, AlertCircle,
  CheckCircle, CheckCircle2, XCircle, Clock, Eye,
  Download, TrendingUp, BarChart3, UserCheck,
  FileText, Calendar, RefreshCw, CircleHelp, Users, Building2,
  LayoutGrid, ChevronLeft, ChevronRight, Upload, Paperclip,
  Save,
} from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import ValueHelpSelect from './ValueHelpSelect';
import ValueHelpSearch from './ValueHelpSearch';
import './TimesheetsPortal.css';

const API_BASE = process.env.REACT_APP_BACKEND_URL
  ? `${process.env.REACT_APP_BACKEND_URL}/api`
  : 'http://localhost:5000/api';
const DAILY_WORK_HOUR_LIMIT = 9;

// ─── Design tokens (matches leave/user colour system exactly) ────────────────
const C = {
  purple:       '#6b5b7a',
  purpleDark:   '#5a4a69',
  purpleLight:  '#f3f0f7',
  purpleBorder: '#c8bfd4',
  purpleMid:    '#8b7a99',
  green:        '#4a7c59',
  greenLight:   '#f0f7f0',
  greenBorder:  '#b8d4bc',
  red:          '#c1666b',
  redLight:     '#fef3f3',
  redBorder:    '#e8c4c6',
  amber:        '#d97706',
  amberLight:   '#fff4e6',
  amberBorder:  '#fcd34d',
  holiday:      '#fef3c7',
  holidayText:  '#92400e',
  text:         '#32363a',
  textMid:      '#6a6d70',
  bg:           '#f8f8f8',
  white:        '#ffffff',
  border:       '#e0e0e0',
  borderLight:  '#f0f0f0',
  rowAlt:       '#fcfcfc',
  headerBg:     '#fafafa',
  totalBg:      '#f9f8fb',
  totalBorder:  '#e0dae6',
};

// ─── Shared style objects ────────────────────────────────────────────────────
const S = {
  page:        { background: C.bg, width: '100%', boxSizing: 'border-box', minWidth: 0 },
  inner:       { padding: '14px 12px' },
  maxW:        { maxWidth: '100%', margin: '0 auto', boxSizing: 'border-box' },
  pageHeader:  { marginBottom: '14px' },
  pageTitle:   { fontSize: '22px', fontWeight: '400', color: C.text, margin: '0 0 4px 0' },
  pageSub:     { fontSize: '13px', color: C.textMid, margin: 0 },

  card: {
    background: C.white, borderRadius: '6px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: `1px solid ${C.border}`,
  },
  cardPad:   { padding: '14px' },
  cardPadSm: { padding: '12px' },

  statsGrid:  { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '14px' },
  statsGrid5: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '14px' },

  statCard: {
    background: C.white, borderRadius: '6px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: `1px solid ${C.border}`,
    padding: '12px',
  },
  statLabel: { fontSize: '12px', color: C.textMid, margin: '0 0 6px 0', fontWeight: '500' },
  statValue: { fontSize: '22px', fontWeight: '600', color: C.text, margin: '0 0 3px 0' },
  statSub:   { fontSize: '12px', color: C.textMid, margin: 0 },
  statRow:   { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' },

  row:        { display: 'flex', alignItems: 'center' },
  rowBetween: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' },
  rowGap4:    { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  rowGap2:    { display: 'flex', alignItems: 'center', gap: '8px' },

  select: {
    appearance: 'none', background: C.white, border: `1px solid ${C.border}`,
    borderRadius: '5px', padding: '8px 36px 8px 12px', fontSize: '14px',
    color: C.text, cursor: 'pointer', outline: 'none',
  },
  selectWrap: { position: 'relative', display: 'inline-block' },
  chevron:    { position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: C.textMid },

  input: {
    border: `1px solid ${C.border}`, borderRadius: '5px',
    padding: '8px 12px', fontSize: '14px', color: C.text, outline: 'none', background: C.white,
  },
  searchWrap: { position: 'relative' },
  searchIcon: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: C.textMid },

  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '8px 16px', background: C.purple, color: C.white,
    border: 'none', borderRadius: '5px', fontSize: '14px', fontWeight: '500',
    cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
  },
  btnSecondary: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '8px 14px', background: C.white, color: C.text,
    border: `1px solid #b0b0b0`, borderRadius: '5px', fontSize: '14px',
    fontWeight: '500', cursor: 'pointer',
  },
  btnGreen: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '8px 16px', background: C.green, color: C.white,
    border: 'none', borderRadius: '5px', fontSize: '14px', fontWeight: '500', cursor: 'pointer',
  },
  btnDisabled: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '8px 16px', background: '#d1d5db', color: '#9ca3af',
    border: 'none', borderRadius: '5px', fontSize: '14px', fontWeight: '500', cursor: 'not-allowed',
  },
  btnIcon: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '6px', background: 'transparent', border: 'none',
    borderRadius: '4px', cursor: 'pointer', color: C.textMid,
  },

  table:    { width: '100%', borderCollapse: 'collapse' },
  thead:    { background: C.headerBg, borderBottom: `1px solid ${C.border}` },
  th:       { padding: '9px 12px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: C.text, whiteSpace: 'nowrap' },
  thRight:  { padding: '9px 12px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: C.text },
  thCenter: { padding: '9px 12px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: C.text },
  td:       { padding: '10px 12px', fontSize: '13px', color: C.text, borderBottom: `1px solid ${C.borderLight}` },
  tdMid:    { padding: '10px 12px', fontSize: '13px', color: C.textMid, borderBottom: `1px solid ${C.borderLight}` },
  tdRight:  { padding: '10px 12px', fontSize: '13px', color: C.text, textAlign: 'right', borderBottom: `1px solid ${C.borderLight}` },
  tdCenter: { padding: '10px 12px', textAlign: 'center', borderBottom: `1px solid ${C.borderLight}` },
  trEven:   { background: C.white },
  trOdd:    { background: C.rowAlt },

  badge: {
    display: 'inline-flex', alignItems: 'center', gap: '4px',
    padding: '4px 10px', borderRadius: '20px', fontSize: '12px',
    fontWeight: '500', border: '1px solid',
  },
  tag: {
    display: 'inline-flex', alignItems: 'center',
    padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '500',
  },

  infoBox: {
    padding: '10px 12px', borderRadius: '6px',
    border: `1px solid ${C.totalBorder}`, background: C.totalBg, marginTop: '12px',
  },
  infoTitle: { fontSize: '13px', fontWeight: '600', color: C.purple, margin: '0 0 6px 0' },
  infoList:  { listStyle: 'none', margin: 0, padding: 0 },
  infoItem:  { fontSize: '13px', color: C.textMid, marginBottom: '4px' },

  tableScroll: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
};

// ─── fetchAPI ────────────────────────────────────────────────────────────────
const fetchAPI = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    let errMsg = 'API request failed';
    try { const e = await response.json(); errMsg = e.error || errMsg; } catch (_) {}
    throw new Error(errMsg);
  }
  return response.json();
};

const uploadAPI = async (endpoint, formData) => {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    let errMsg = 'Upload failed';
    try { const e = await response.json(); errMsg = e.error || errMsg; } catch (_) {}
    throw new Error(errMsg);
  }
  return response.json();
};

const getUserId = (user) => user?._id || user?.id || user?.user_id || '';

// ─── Status config ───────────────────────────────────────────────────────────
const STATUS_STYLES = {
  draft:               { bg: '#f9fafb', color: '#6b7280', border: '#d1d5db' },
  pending_lead:        { bg: C.purpleLight, color: C.purple, border: C.purpleBorder },
  pending_manager:     { bg: C.amberLight,  color: C.amber,  border: C.amberBorder  },
  approved:            { bg: C.greenLight,  color: C.green,  border: C.greenBorder  },
  rejected_by_lead:    { bg: C.redLight,    color: C.red,    border: C.redBorder    },
  rejected_by_manager: { bg: C.redLight,    color: C.red,    border: C.redBorder    },
};
const STATUS_LABELS = {
  draft:               'Draft',
  pending_lead:        'Pending Approval',
  pending_manager:     'Pending Manager',
  approved:            'Approved',
  rejected_by_lead:    'Rejected',
  rejected_by_manager: 'Rejected by Manager',
};

// ─── Shared components ────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const st = STATUS_STYLES[status] || STATUS_STYLES.draft;
  return (
    <span style={{ ...S.badge, background: st.bg, color: st.color, borderColor: st.border }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function SelectWrap({ value, onChange, children, style = {} }) {
  const options = Children.toArray(children).map((child) => ({
    value: String(child.props.value ?? ''),
    label: child.props.children,
  }));

  return (
    <ValueHelpSelect
      value={value}
      onChange={(nextValue) => onChange({ target: { value: nextValue } })}
      options={options}
      style={{ minWidth: '180px', ...style }}
      searchPlaceholder="Search suggestions"
    />
  );
}

function ChargeCodeSelector({ chargeCodes, selectedId, onChange, disabled, selectedIds = [] }) {
  const unavailableIds = new Set(selectedIds.filter((id) => id && id !== selectedId));

  return (
    <ValueHelpSelect
      value={selectedId}
      onChange={onChange}
      disabled={disabled}
      placeholder="Select charge code"
      searchPlaceholder="Search charge codes"
      options={[
        { value: '', label: 'Select charge code' },
        ...chargeCodes
          .filter((cc) => !unavailableIds.has(cc.charge_code_id))
          .map((cc) => ({
            value: cc.charge_code_id,
            label: `${cc.charge_code} - ${cc.charge_code_name}`,
            description: cc.charge_code_id,
          })),
      ]}
    />
  );
}

const blankDateRange = { start: '', end: '' };

const getAvailablePeriods = (referenceDate = new Date()) => {
  const periods = [];
  const currentYear = referenceDate.getFullYear();

  for (let month = 0; month < 12; month += 1) {
    const monthStart = new Date(currentYear, month, 1);
    if (monthStart > referenceDate) continue;

    const lastDay = endOfMonth(monthStart).getDate();
    periods.push({
      value: `${currentYear}-${String(month + 1).padStart(2, '0')}-1st`,
      label: `${format(monthStart, 'MMMM yyyy')} – 1st Half (1–15)`,
      shortLabel: `${String(month + 1).padStart(2, '0')}/15/${currentYear}`,
      start: format(monthStart, 'yyyy-MM-dd'),
      end: format(new Date(currentYear, month, 15), 'yyyy-MM-dd'),
    });

    const sixteenth = new Date(currentYear, month, 16);
    if (sixteenth <= referenceDate) {
      periods.push({
        value: `${currentYear}-${String(month + 1).padStart(2, '0')}-2nd`,
        label: `${format(monthStart, 'MMMM yyyy')} – 2nd Half (16–${lastDay})`,
        shortLabel: `${String(month + 1).padStart(2, '0')}/${lastDay}/${currentYear}`,
        start: format(sixteenth, 'yyyy-MM-dd'),
        end: format(endOfMonth(monthStart), 'yyyy-MM-dd'),
      });
    }
  }

  return periods.reverse();
};

const isTimesheetInRange = (timesheet, dateRange) => {
  if (!dateRange.start && !dateRange.end) return true;
  const start = timesheet.period_start?.slice(0, 10);
  const end = timesheet.period_end?.slice(0, 10) || start;
  if (!start) return false;
  if (dateRange.start && end < dateRange.start) return false;
  if (dateRange.end && start > dateRange.end) return false;
  return true;
};

const timesheetHasEntryType = (timesheet, typeFilter) => {
  if (typeFilter === 'all') return true;
  return (timesheet.entries || []).some((entry) => (entry.entry_type || 'work') === typeFilter);
};

const uniqSuggestions = (items, fields) => {
  const seen = new Set();
  return items.flatMap((item) =>
    fields
      .map((field) => {
        const value = typeof field === 'function' ? field(item) : item[field];
        if (!value) return null;
        const label = String(value).trim();
        const key = label.toLowerCase();
        if (!label || seen.has(key)) return null;
        seen.add(key);
        return { value: label, label };
      })
      .filter(Boolean)
  );
};

const getTimesheetAssignmentMeta = (source = {}) => {
  const assignedLocation = source.employee_work_location || source.workLocation || '';
  const explicitAssignedLocation = (
    source.employee_assigned_location
    || source.assignedLocation
    || source.costCenter
    || assignedLocation
    || ''
  );
  const companyCode = source.employee_company_code || source.companyCode || '';
  const costCenter = source.employee_cost_center || source.costCenter || '';
  const companyCostCenter = companyCode || costCenter;

  return {
    workLocation: assignedLocation || 'Not assigned',
    assignedLocation: explicitAssignedLocation || 'Not assigned',
    companyCode,
    costCenter,
    companyCostCenter: companyCostCenter || 'Not assigned',
  };
};

const LEAVE_CODE_MAP = {
  planned: 'PL',
  sick: 'SL',
  optional: 'OL',
  lwp: 'LWP',
  lop: 'LWP',
  'early logout': 'EL',
};

const normalizeDateKey = (value) => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

const getLeaveCode = (leaveType) => {
  const key = String(leaveType || '').trim().toLowerCase();
  return LEAVE_CODE_MAP[key] || String(leaveType || 'LV').slice(0, 3).toUpperCase();
};

const getLeaveDisplayLabel = (leaveType) => {
  const label = String(leaveType || 'Leave').trim();
  return label ? `${label} Leave` : 'Leave';
};

const buildApprovedLeaveEntries = (approvedLeaves = [], dates = []) => {
  if (!dates.length) return [];

  const dateSet = new Set(dates);
  const leaveByDate = new Map();

  approvedLeaves.forEach((leave) => {
    const start = normalizeDateKey(leave.approved_start_date || leave.start_date);
    const end = normalizeDateKey(leave.approved_end_date || leave.end_date || start);
    if (!start || !end) return;

    eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).forEach((dateValue) => {
      const dateKey = format(dateValue, 'yyyy-MM-dd');
      const dayOfWeek = dateValue.getDay();
      if (!dateSet.has(dateKey) || dayOfWeek === 0 || dayOfWeek === 6 || leaveByDate.has(dateKey)) return;

      const code = getLeaveCode(leave.leave_type);
      const isHalfDay = Boolean(leave.is_half_day);
      const hours = isHalfDay ? DAILY_WORK_HOUR_LIMIT / 2 : DAILY_WORK_HOUR_LIMIT;

      leaveByDate.set(dateKey, {
        date: dateKey,
        code,
        hours,
        leaveType: leave.leave_type || 'Leave',
        label: getLeaveDisplayLabel(leave.leave_type),
        isHalfDay,
        halfDayPeriod: leave.half_day_period || '',
        leaveId: leave._id || leave.id || '',
      });
    });
  });

  return Array.from(leaveByDate.values()).sort((a, b) => a.date.localeCompare(b.date));
};

const isWeekendDate = (dateStr) => {
  const day = parseISO(dateStr).getDay();
  return day === 0 || day === 6;
};

const getDefaultWorkEntryValue = (dateStr, defaultHoursByDate = {}) => {
  const defaultHours = Number(defaultHoursByDate[dateStr] || 0);
  if (!Number.isFinite(defaultHours) || defaultHours <= 0) return '0';
  return Number.isInteger(defaultHours)
    ? String(defaultHours)
    : String(parseFloat(defaultHours.toFixed(2)));
};

const createEmptyWorkEntries = (dates, lockedDateSet = new Set(), defaultHoursByDate = {}) =>
  dates.map((date) => ({
    date,
    hours: lockedDateSet.has(date) ? 0 : Number(defaultHoursByDate[date] || 0),
    value: lockedDateSet.has(date) ? '' : getDefaultWorkEntryValue(date, defaultHoursByDate),
    entry_type: 'work',
    locked: lockedDateSet.has(date),
  }));

const createEmptyWorkRow = (id, dates, lockedDateSet = new Set(), defaultHoursByDate = {}) => ({
  id,
  chargeCodeId: '',
  entries: createEmptyWorkEntries(dates, lockedDateSet, defaultHoursByDate),
});

const CHARGE_CODE_DISPLAY_EVENT = 'mte-charge-code-display-change';

const getChargeCodeDisplayStorageKey = (userId) => `mte_charge_code_display_${userId}`;

const getChargeCodeDisplayKeys = (item = {}) => Array.from(new Set([
  item.charge_code_id,
  item._id,
  item.id,
  item.code,
  item.charge_code,
  item.chargeCode,
].filter(Boolean).map(String)));

const readChargeCodeDisplayPreferences = (userId) => {
  if (!userId || typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(getChargeCodeDisplayStorageKey(userId)) || '{}') || {};
  } catch (_) {
    return {};
  }
};

const writeChargeCodeDisplayPreferences = (userId, displayRows) => {
  if (!userId || typeof localStorage === 'undefined') return;
  localStorage.setItem(getChargeCodeDisplayStorageKey(userId), JSON.stringify(displayRows || {}));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHARGE_CODE_DISPLAY_EVENT, { detail: { userId } }));
  }
};

const isChargeCodeDisplayed = (item = {}, displayRows = {}) => {
  const keys = getChargeCodeDisplayKeys(item);
  if (keys.some((key) => displayRows[key] === false)) return false;
  if (keys.some((key) => displayRows[key] === true)) return true;
  return item.is_active !== false;
};

const applyChargeCodeDisplayPreferences = (items = [], userId) => {
  const displayRows = readChargeCodeDisplayPreferences(userId);
  return items.filter((item) => isChargeCodeDisplayed(item, displayRows));
};

const buildGroupedLeaveRows = (approvedLeaveEntries = []) => {
  const grouped = new Map();

  approvedLeaveEntries.forEach((leave) => {
    const key = `${leave.code || 'LV'}|${leave.label || 'Leave'}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        code: leave.code,
        label: leave.label,
        hoursByDate: {},
        totalHours: 0,
      });
    }

    const row = grouped.get(key);
    const hours = Number(leave.hours || 0);
    row.hoursByDate[leave.date] = (row.hoursByDate[leave.date] || 0) + hours;
    row.totalHours += hours;
  });

  return Array.from(grouped.values());
};

const buildLiveSummaryEntries = ({
  rows = [],
  chargeCodes = [],
  approvedLeaveEntries = [],
  holidays = [],
}) => {
  const chargeCodeById = Object.fromEntries(
    chargeCodes.map((chargeCode) => [chargeCode.charge_code_id, chargeCode])
  );
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));

  const workEntries = rows.flatMap((row) => {
    const chargeCode = chargeCodeById[row.chargeCodeId] || {};
    return row.entries.flatMap((entry) => {
      const rawValue = entry.value !== undefined ? entry.value : String(entry.hours ?? '');
      const hours = parseFloat(rawValue);
      if (!Number.isFinite(hours) || hours <= 0) return [];

      return [{
        date: entry.date,
        entry_type: 'work',
        charge_code_id: row.chargeCodeId || '',
        charge_code: chargeCode.charge_code || '',
        charge_code_name: chargeCode.charge_code_name || '',
        hours,
        description: '',
      }];
    });
  });

  const leaveEntries = approvedLeaveEntries
    .filter((leave) => !holidayDates.has(leave.date))
    .map((leave) => ({
      date: leave.date,
      entry_type: 'leave',
      leave_type: leave.leaveType,
      leave_code: leave.code,
      charge_code: leave.code,
      charge_code_name: leave.label,
      hours: Number(leave.hours || 0),
      description: leave.label,
      leave_id: leave.leaveId,
      is_half_day: leave.isHalfDay,
      half_day_period: leave.halfDayPeriod,
    }));

  const holidayEntries = holidays.map((holiday) => ({
    date: holiday.date,
    entry_type: 'holiday',
    holiday_name: holiday.holiday_name || holiday.name || '',
    code: holiday.code || 'PH',
    hours: Number(holiday.hours || DAILY_WORK_HOUR_LIMIT),
    description: holiday.description || `Public Holiday: ${holiday.holiday_name || holiday.name || 'Holiday'}`,
  }));

  return [...workEntries, ...leaveEntries, ...holidayEntries];
};

// ─── TimesheetGrid ────────────────────────────────────────────────────────────
function TimesheetGrid({
  dates, rows, chargeCodes, onRowUpdate, onRowAdd, onRowDelete,
  readOnly = false, approvedLeaves = [], holidays = [],
  assignmentMeta = {},
}) {
  const WORKDAY_HOURS = DAILY_WORK_HOUR_LIMIT;
  const getEntry = (row, dateStr) =>
    row.entries.find((e) => e.date === dateStr) || { date: dateStr, hours: 0, entry_type: 'work' };

  const isHoliday = (d) => holidays.some((h) => h.date === d);

  const numericVal = (e) => {
    const v = e.value !== undefined ? e.value : String(e.hours ?? '');
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  const getColTotal = (dateStr) =>
    rows.reduce((s, row) => s + numericVal(getEntry(row, dateStr)), 0);

  const getRowTotal = (row) =>
    row.entries.reduce((s, e) => s + numericVal(e), 0);

  const holidayByDate = Object.fromEntries((holidays || []).map((holiday) => [holiday.date, holiday]));
  const approvedLeaveEntries = useMemo(
    () => buildApprovedLeaveEntries(approvedLeaves, dates)
      .filter((leave) => !holidayByDate[leave.date]),
    [approvedLeaves, dates, holidayByDate]
  );
  const groupedLeaveRows = useMemo(
    () => buildGroupedLeaveRows(approvedLeaveEntries),
    [approvedLeaveEntries]
  );
  const leaveByDate = Object.fromEntries(approvedLeaveEntries.map((leave) => [leave.date, leave]));
  const holidayDates = Object.keys(holidayByDate);
  const isWeekday = (dateStr) => {
    const day = parseISO(dateStr).getDay();
    return day >= 1 && day <= 5;
  };
  const formatHoursValue = (hours) => {
    const numericHours = Number(hours);
    if (!Number.isFinite(numericHours)) return '';
    return Number.isInteger(numericHours)
      ? String(numericHours)
      : String(parseFloat(numericHours.toFixed(2)));
  };
  const displayHours = (hours, showZero = false) => {
    if (!hours && showZero) return '0';
    return hours ? formatHoursValue(hours) : '';
  };
  const holidayHoursForDate = (dateStr) => (holidayByDate[dateStr] ? WORKDAY_HOURS : 0);
  const leaveHoursForDate = (dateStr) => (leaveByDate[dateStr]?.hours || 0);
  const workHourLimitForDate = (dateStr) =>
    Math.max(0, WORKDAY_HOURS - holidayHoursForDate(dateStr) - leaveHoursForDate(dateStr));
  const maxHoursForRowOnDate = (rowId, dateStr) => {
    const otherRowHours = rows.reduce((sum, currentRow) => {
      if (currentRow.id === rowId) return sum;
      return sum + numericVal(getEntry(currentRow, dateStr));
    }, 0);
    return Math.max(0, workHourLimitForDate(dateStr) - otherRowHours);
  };
  const totalHoursForDate = (dateStr) => getColTotal(dateStr) + holidayHoursForDate(dateStr) + leaveHoursForDate(dateStr);
  const workScheduleForDate = (dateStr) => (isWeekday(dateStr) ? WORKDAY_HOURS : 0);
  const holidayPayoutHoursForDate = (dateStr) => (isWeekendDate(dateStr) ? getColTotal(dateStr) : 0);
  const supportCheckboxRows = [
    'Shift Allowance – Shift Type B',
    'Shift Allowance – Shift Type C',
    'On Call – Primary Support',
    'On Call – Secondary Support',
    'On Call – Support By Unassigned',
  ];

  const thStyle = (isHol) => ({
    padding: '10px 8px', textAlign: 'center', fontSize: '12px', fontWeight: '600',
    minWidth: '90px', borderLeft: `1px solid ${C.borderLight}`,
    background: isHol ? C.holiday : C.headerBg,
    color:      isHol ? C.holidayText : C.text,
    position: 'relative', zIndex: 1,
  });

  const stickyThStyle = {
    padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600',
    color: C.text,
    position: 'sticky', left: 0,
    background: C.headerBg,
    zIndex: 20,
    minWidth: '260px',
    boxShadow: '2px 0 4px rgba(0,0,0,0.06)',
  };

  const {
    workLocation = 'Not assigned',
    assignedLocation = 'Not assigned',
    companyCostCenter = 'Not assigned',
  } = assignmentMeta;
  const selectedChargeCodeIds = rows.map((row) => row.chargeCodeId).filter(Boolean);

  return (
    <div className="mte-sheet-card" style={{ ...S.card, overflow: 'visible' }}>
      <div className="mte-sheet-scroll" style={{ overflowX: 'auto', overflowY: 'visible', WebkitOverflowScrolling: 'touch', position: 'relative' }}>
        <table className="mte-sheet-table" style={{ ...S.table, minWidth: 'max-content' }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.headerBg }}>
              <th style={stickyThStyle}>Charge Codes</th>

              {dates.map((d) => {
                const isHol = isHoliday(d);
                return (
                  <th key={d} style={thStyle(isHol)} className="mte-sheet-date-head">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <span style={{ fontSize: '11px', color: isHol ? C.holidayText : C.textMid }}>
                        {format(parseISO(d), 'EEE')}
                      </span>
                      <span>{format(parseISO(d), 'MMM d')}</span>
                      {isHol && <span style={{ fontSize: '10px' }}>PH</span>}
                    </div>
                  </th>
                );
              })}

              <th style={{
                padding: '12px 16px', textAlign: 'center', fontSize: '13px',
                fontWeight: '600', color: C.purple, background: C.totalBg,
                minWidth: '80px', borderLeft: `1px solid ${C.border}`,
                position: 'relative', zIndex: 1,
              }}>
                Total
              </th>
              {!readOnly && (
                <th style={{
                  padding: '12px', background: C.headerBg,
                  position: 'sticky', right: 0, zIndex: 15,
                  borderLeft: `1px solid ${C.borderLight}`, width: '50px',
                  boxShadow: '-2px 0 4px rgba(0,0,0,0.04)',
                }} />
              )}
            </tr>
          </thead>

          <tbody>
            <tr className="mte-sheet-meta-row">
              <td className="mte-sheet-meta-label" style={{
                padding: '10px 16px',
                position: 'sticky', left: 0,
                background: C.white,
                zIndex: 9,
                borderRight: `1px solid ${C.borderLight}`,
              }}>
                <span className="mte-sheet-meta-link">Work Location</span>
              </td>
              {dates.map((d) => (
                <td key={`work-location-${d}`} className="mte-sheet-meta-cell">{workLocation}</td>
              ))}
              <td className="mte-sheet-meta-total" />
              {!readOnly && <td className="mte-sheet-sticky-end" />}
            </tr>

            <tr className="mte-sheet-meta-row">
              <td className="mte-sheet-meta-label" style={{
                padding: '10px 16px',
                position: 'sticky', left: 0,
                background: C.white,
                zIndex: 9,
                borderRight: `1px solid ${C.borderLight}`,
              }}>
                Assigned Location
              </td>
              {dates.map((d) => (
                <td key={`assigned-location-${d}`} className="mte-sheet-meta-cell">{assignedLocation}</td>
              ))}
              <td className="mte-sheet-meta-total">{assignedLocation}</td>
              {!readOnly && <td className="mte-sheet-sticky-end" />}
            </tr>

            <tr className="mte-sheet-meta-row mte-sheet-meta-row-last">
              <td className="mte-sheet-meta-label" style={{
                padding: '10px 16px',
                position: 'sticky', left: 0,
                background: C.white,
                zIndex: 9,
                borderRight: `1px solid ${C.borderLight}`,
              }}>
                Company Code/Cost Center
              </td>
              {dates.map((d) => (
                <td key={`cost-center-${d}`} className="mte-sheet-meta-cell">{companyCostCenter}</td>
              ))}
              <td className="mte-sheet-meta-total">{companyCostCenter}</td>
              {!readOnly && <td className="mte-sheet-sticky-end" />}
            </tr>

            <tr className="mte-sheet-spacer-row">
              <td style={{
                padding: '14px 16px',
                position: 'sticky', left: 0,
                background: C.white,
                zIndex: 9,
                borderRight: `1px solid ${C.borderLight}`,
              }} />
              {dates.map((d) => <td key={`spacer-${d}`} />)}
              <td />
              {!readOnly && <td className="mte-sheet-sticky-end" />}
            </tr>

            {rows.map((row, ri) => {
              const rowBg = ri % 2 === 0 ? C.white : C.rowAlt;

              return (
                <tr
                  key={row.id}
                  className="mte-sheet-entry-row"
                  style={{ background: rowBg, borderBottom: `1px solid ${C.borderLight}` }}
                >
                  <td style={{
                    padding: '10px 16px',
                    position: 'sticky', left: 0,
                    background: rowBg,
                    zIndex: 10,
                    borderRight: `1px solid ${C.borderLight}`,
                    boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
                    overflow: 'visible',
                  }}>
                    <ChargeCodeSelector
                      chargeCodes={chargeCodes}
                      selectedId={row.chargeCodeId}
                      onChange={(id) => onRowUpdate(row.id, { chargeCodeId: id })}
                      disabled={readOnly}
                      selectedIds={selectedChargeCodeIds}
                    />
                  </td>

                  {dates.map((d) => {
                    const isHol = isHoliday(d);
                    const leaveEntry = leaveByDate[d];
                    const entry = getEntry(row, d);
                    const isFullDayLeave = leaveEntry && !leaveEntry.isHalfDay;
                    const rowHourLimit = maxHoursForRowOnDate(row.id, d);
                    return (
                      <td key={d} style={{
                        padding: '8px', textAlign: 'center',
                        borderLeft: `1px solid ${C.borderLight}`,
                        background: isHol ? '#fffbeb' : leaveEntry ? C.purpleLight : 'transparent',
                      }}>
                        {isHol || isFullDayLeave ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              minWidth: '44px',
                              justifyContent: 'center',
                              padding: '5px 6px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: '700',
                              border: `1px solid ${isHol ? C.amberBorder : C.purpleBorder}`,
                              background: isHol ? '#fff7d6' : C.white,
                              color: isHol ? C.holidayText : C.purple,
                            }}
                            title={isHol
                              ? holidayByDate[d]?.holiday_name || 'Public holiday'
                              : `${leaveEntry.label}${leaveEntry.isHalfDay && leaveEntry.halfDayPeriod ? ` (${leaveEntry.halfDayPeriod})` : ''}`}
                          >
                            {isHol ? 'PH' : leaveEntry.code}
                          </span>
                        ) : (
                          <input
                            className="mte-sheet-hour-input"
                            type="number"
                            min="0"
                            max={rowHourLimit}
                            step="0.25"
                            value={entry.value ?? ''}
                            disabled={readOnly}
                            title={leaveEntry ? `${leaveEntry.label} covers ${displayHours(leaveEntry.hours)} hours on this date` : undefined}
                            onFocus={(event) => {
                              if (event.target.value === '0') event.target.select();
                            }}
                            onChange={(e) => {
                              const typedValue = e.target.value;
                              const typedHours = parseFloat(typedValue);
                              const cappedHours = Number.isFinite(typedHours)
                                ? Math.min(Math.max(typedHours, 0), rowHourLimit)
                                : 0;
                              const nextValue = typedValue === ''
                                ? ''
                                : String(cappedHours);
                              onRowUpdate(row.id, {
                                entries: row.entries.map((ent) =>
                                  ent.date === d
                                    ? { ...ent, value: nextValue, hours: cappedHours, entry_type: 'work' }
                                    : ent
                                ),
                              });
                            }}
                            style={{
                              width: '52px', padding: '4px 6px',
                              border: `1px solid ${C.border}`, borderRadius: '4px',
                              textAlign: 'center', fontSize: '13px', outline: 'none',
                              background: readOnly ? C.headerBg : C.white,
                              color: C.text,
                            }}
                          />
                        )}
                      </td>
                    );
                  })}

                  <td style={{
                    padding: '10px 16px', textAlign: 'center', fontWeight: '600',
                    background: C.totalBg, borderLeft: `1px solid ${C.border}`, color: C.purple,
                  }}>
                    {getRowTotal(row)}h
                  </td>

                  {!readOnly && (
                    <td style={{
                      padding: '10px', textAlign: 'center',
                      position: 'sticky', right: 0,
                      background: rowBg,
                      zIndex: 10,
                      borderLeft: `1px solid ${C.borderLight}`,
                      boxShadow: '-2px 0 4px rgba(0,0,0,0.04)',
                    }}>
                      <button onClick={() => onRowDelete(row.id)} style={{ ...S.btnIcon, color: C.red }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}

            {groupedLeaveRows.map((leave) => (
              <tr key={`leave-${leave.key}`} className="mte-sheet-static-row">
                <td className="mte-sheet-static-label" style={{
                  padding: '10px 16px',
                  position: 'sticky', left: 0,
                  background: C.white,
                  zIndex: 10,
                  borderRight: `1px solid ${C.borderLight}`,
                  boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
                }}>
                  <span className="mte-sheet-static-row-title">
                    {`${leave.label} (${leave.code})`}
                  </span>
                </td>
                {dates.map((d) => (
                  <td key={`leave-cell-${leave.key}-${d}`} className="mte-sheet-static-value-cell">
                    {displayHours(leave.hoursByDate[d] || 0, true)}
                  </td>
                ))}
                <td className="mte-sheet-static-total-cell">{displayHours(leave.totalHours)}</td>
                {!readOnly && <td className="mte-sheet-sticky-end" />}
              </tr>
            ))}

            {holidayDates.map((dateStr) => (
              <tr key={`holiday-${dateStr}`} className="mte-sheet-static-row">
                <td className="mte-sheet-static-label" style={{
                  padding: '10px 16px',
                  position: 'sticky', left: 0,
                  background: C.white,
                  zIndex: 10,
                  borderRight: `1px solid ${C.borderLight}`,
                  boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
                }}>
                  <span className="mte-sheet-static-row-title">{`${holidayByDate[dateStr].holiday_name || 'Public holiday'} (PH)`}</span>
                </td>
                {dates.map((d) => (
                  <td key={`holiday-cell-${dateStr}-${d}`} className="mte-sheet-static-value-cell">
                    {d === dateStr ? displayHours(WORKDAY_HOURS) : ''}
                  </td>
                ))}
                <td className="mte-sheet-static-total-cell">{displayHours(WORKDAY_HOURS)}</td>
                {!readOnly && <td className="mte-sheet-sticky-end" />}
              </tr>
            ))}

            <tr className="mte-sheet-static-row">
              <td className="mte-sheet-static-label" style={{
                padding: '10px 16px',
                position: 'sticky', left: 0,
                background: C.white,
                zIndex: 10,
                borderRight: `1px solid ${C.borderLight}`,
                boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
              }}>
                Total hours
              </td>
              {dates.map((d) => (
                <td key={`total-hours-${d}`} className="mte-sheet-static-value-cell">
                  {displayHours(totalHoursForDate(d), true)}
                </td>
              ))}
              <td className="mte-sheet-static-total-cell">{displayHours(dates.reduce((sum, dateStr) => sum + totalHoursForDate(dateStr), 0), true)}</td>
              {!readOnly && <td className="mte-sheet-sticky-end" />}
            </tr>

            <tr className="mte-sheet-static-row mte-sheet-static-divider-top">
              <td className="mte-sheet-static-label" style={{
                padding: '10px 16px',
                position: 'sticky', left: 0,
                background: C.white,
                zIndex: 10,
                borderRight: `1px solid ${C.borderLight}`,
                boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
              }}>
                Work Schedule
              </td>
              {dates.map((d) => (
                <td key={`work-schedule-${d}`} className="mte-sheet-static-value-cell">
                  {displayHours(workScheduleForDate(d), isWeekendDate(d))}
                </td>
              ))}
              <td className="mte-sheet-static-total-cell">{displayHours(dates.reduce((sum, dateStr) => sum + workScheduleForDate(dateStr), 0), true)}</td>
              {!readOnly && <td className="mte-sheet-sticky-end" />}
            </tr>

            <tr className="mte-sheet-static-row mte-sheet-static-divider-top">
              <td className="mte-sheet-static-label" style={{
                padding: '10px 16px',
                position: 'sticky', left: 0,
                background: C.white,
                zIndex: 10,
                borderRight: `1px solid ${C.borderLight}`,
                boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
              }}>
                Daily Overtime
              </td>
              {dates.map((d) => (
                <td key={`daily-overtime-${d}`} className="mte-sheet-static-value-cell" />
              ))}
              <td className="mte-sheet-static-total-cell">0</td>
              {!readOnly && <td className="mte-sheet-sticky-end" />}
            </tr>

            <tr className="mte-sheet-static-row">
              <td className="mte-sheet-static-label" style={{
                padding: '10px 16px',
                position: 'sticky', left: 0,
                background: C.white,
                zIndex: 10,
                borderRight: `1px solid ${C.borderLight}`,
                boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
              }}>
                Holiday Payout
              </td>
              {dates.map((d) => (
                <td key={`holiday-payout-${d}`} className="mte-sheet-static-value-cell">
                  {isWeekendDate(d) ? displayHours(holidayPayoutHoursForDate(d), true) : ''}
                </td>
              ))}
              <td className="mte-sheet-static-total-cell">
                {displayHours(dates.reduce((sum, dateStr) => sum + holidayPayoutHoursForDate(dateStr), 0), true)}
              </td>
              {!readOnly && <td className="mte-sheet-sticky-end" />}
            </tr>

            {supportCheckboxRows.map((label) => (
              <tr key={label} className="mte-sheet-static-row">
                <td className="mte-sheet-static-label" style={{
                  padding: '10px 16px',
                  position: 'sticky', left: 0,
                  background: C.white,
                  zIndex: 10,
                  borderRight: `1px solid ${C.borderLight}`,
                  boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
                }}>
                  {label}
                </td>
                {dates.map((d) => (
                  <td key={`${label}-${d}`} className="mte-sheet-checkbox-cell">
                    <input type="checkbox" className="mte-sheet-checkbox" disabled={readOnly} />
                  </td>
                ))}
                <td className="mte-sheet-static-total-cell">0</td>
                {!readOnly && <td className="mte-sheet-sticky-end" />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="mte-sheet-footer" style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, background: C.headerBg }}>
          <button onClick={onRowAdd} style={S.btnSecondary}>
            <Plus size={14} /> Add Charge Code
          </button>
        </div>
      )}
    </div>
  );
}

// ─── TimesheetPage (Employee) ─────────────────────────────────────────────────
function TimesheetPage({
  user,
  selectedPeriod,
  onSelectedPeriodChange,
  onSheetSnapshotChange,
  embedded = false,
}) {
  const availablePeriods = useMemo(() => getAvailablePeriods(), []);
  const [internalSelectedPeriod, setInternalSelectedPeriod] = useState(availablePeriods[0]?.value || '');
  const [timesheetStatus, setTimesheetStatus]   = useState('draft');
  const [rows, setRows]                         = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [chargeCodes, setChargeCodes]           = useState([]);
  const [approvedLeaves, setApprovedLeaves]     = useState([]);
  const [holidays, setHolidays]                 = useState([]);
  const [loading, setLoading]                   = useState(false);
  const [profile, setProfile]                   = useState(user || {});
  const [sheetLoaded, setSheetLoaded]           = useState(false);
  // FIX 2: reload trigger — incrementing forces the timesheet data useEffect to re-run
  const [reloadTrigger, setReloadTrigger]       = useState(0);
  const hasLocalTimesheetEditsRef = useRef(false);
  const saveDraftSilentlyRef = useRef(null);

  const userId = getUserId(user);
  const activePeriod = selectedPeriod ?? internalSelectedPeriod;
  const setActivePeriod = (nextPeriod) => {
    hasLocalTimesheetEditsRef.current = false;
    setSheetLoaded(false);
    (onSelectedPeriodChange ?? setInternalSelectedPeriod)(nextPeriod);
  };
  const selectedPeriodOption = availablePeriods.find((period) => period.value === activePeriod) || availablePeriods[0];
  const assignmentMeta = useMemo(() => getTimesheetAssignmentMeta(profile), [profile]);

  const dates = useMemo(() => {
    const period = availablePeriods.find((p) => p.value === activePeriod);
    if (!period) return [];
    return eachDayOfInterval({
      start: parseISO(period.start),
      end:   parseISO(period.end),
    }).map((d) => format(d, 'yyyy-MM-dd'));
  }, [activePeriod, availablePeriods]);
  const approvedLeaveEntries = useMemo(
    () => buildApprovedLeaveEntries(approvedLeaves, dates),
    [approvedLeaves, dates]
  );
  const holidayByDate = useMemo(
    () => Object.fromEntries((holidays || []).map((holiday) => [holiday.date, holiday])),
    [holidays]
  );
  const approvedLeaveByDate = useMemo(
    () => Object.fromEntries(
      approvedLeaveEntries
        .filter((leave) => !holidayByDate[leave.date])
        .map((leave) => [leave.date, leave])
    ),
    [approvedLeaveEntries, holidayByDate]
  );
  const lockedDateSet = useMemo(
    () => new Set([
      ...Object.keys(holidayByDate),
      ...Object.values(approvedLeaveByDate)
        .filter((leave) => !leave.isHalfDay)
        .map((leave) => leave.date),
    ]),
    [holidayByDate, approvedLeaveByDate]
  );
  const halfDayWorkDefaultsByDate = useMemo(
    () => Object.fromEntries(
      Object.entries(approvedLeaveByDate)
        .filter(([, leave]) => leave.isHalfDay && !holidayByDate[leave.date])
        .map(([date, leave]) => [date, Math.max(0, DAILY_WORK_HOUR_LIMIT - (leave.hours || 0))])
        .filter(([, remainingHours]) => remainingHours > 0)
    ),
    [approvedLeaveByDate, holidayByDate]
  );

  const loadTimesheetReferenceData = useCallback(() => {
    if (!userId) return;

    fetchAPI(`/charge_codes/employee/${userId}?active_only=true`)
      .then((data) => {
        const assignedCodes = Array.isArray(data) ? data : [];
        setChargeCodes(applyChargeCodeDisplayPreferences(assignedCodes, userId));
      })
      .catch((err) => { console.error('Charge codes error:', err); setChargeCodes([]); });

    fetchAPI(`/leaves/history/${userId}`)
      .then((d) => setApprovedLeaves(Array.isArray(d) ? d.filter((l) => l.status === 'Approved') : []))
      .catch(console.error);

    fetchAPI(`/users/${userId}`)
      .then((data) => setProfile(data))
      .catch(console.error);
  }, [userId]);

  useEffect(() => {
    loadTimesheetReferenceData();
    const refreshTimer = setInterval(loadTimesheetReferenceData, 30000);
    return () => clearInterval(refreshTimer);
  }, [loadTimesheetReferenceData]);

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return undefined;

    const refreshChargeCodes = (event) => {
      if (event.type === 'storage' && event.key !== getChargeCodeDisplayStorageKey(userId)) return;
      if (event.type === CHARGE_CODE_DISPLAY_EVENT && event.detail?.userId !== userId) return;
      loadTimesheetReferenceData();
    };

    window.addEventListener('storage', refreshChargeCodes);
    window.addEventListener(CHARGE_CODE_DISPLAY_EVENT, refreshChargeCodes);
    return () => {
      window.removeEventListener('storage', refreshChargeCodes);
      window.removeEventListener(CHARGE_CODE_DISPLAY_EVENT, refreshChargeCodes);
    };
  }, [loadTimesheetReferenceData, userId]);

  useEffect(() => {
    setProfile(user || {});
  }, [user]);

  useEffect(() => {
    if (!dates.length) return;
    fetchAPI('/timesheets/populate_holidays', {
      method: 'POST',
      body: JSON.stringify({ period_start: dates[0], period_end: dates[dates.length - 1] }),
    })
      .then((d) => setHolidays(d.holidays || []))
      .catch(console.error);
  }, [dates]);

  // FIX 2: Added reloadTrigger to deps so this re-runs after recall/submit
  useEffect(() => {
    if (!userId || !dates.length) return;
    if (hasLocalTimesheetEditsRef.current) return;

    setSheetLoaded(false);
    fetchAPI(`/timesheets/employee/${userId}`)
      .then((existing) => {
        const match = Array.isArray(existing)
          ? existing.find((ts) =>
              ts.period_start === dates[0] &&
              ts.period_end   === dates[dates.length - 1]
            )
          : null;

        if (match) {
          setTimesheetStatus(match.status || 'draft');

          // FIX 3: Build ccMap keyed by charge_code_id (or charge_code as fallback)
          // Store the full label (code + name) alongside entries
          const visibleChargeCodeKeys = new Set(chargeCodes.flatMap(getChargeCodeDisplayKeys));
          const ccMap = {};
          (match.entries || []).forEach((e) => {
            if (e.entry_type && e.entry_type !== 'work') return;
            if (!e.charge_code_id && !e.charge_code) return;
            const entryKeys = getChargeCodeDisplayKeys(e);
            if (!entryKeys.some((key) => visibleChargeCodeKeys.has(key))) return;
            // Use charge_code_id as the stable key to match against chargeCodes dropdown
            const ccId = e.charge_code_id || e.charge_code || '';
            if (!ccMap[ccId]) ccMap[ccId] = {};
            ccMap[ccId][e.date] = e;
          });
          const savedWorkTotalsByDate = {};
          Object.values(ccMap).forEach((byDate) => {
            Object.entries(byDate).forEach(([date, entry]) => {
              savedWorkTotalsByDate[date] = (savedWorkTotalsByDate[date] || 0) + Number(entry.hours || 0);
            });
          });

          const loadedRows = Object.entries(ccMap).map(([ccId, byDate], i) => {
            // Try to find the matching charge code in our loaded list to get the proper id
            // The chargeCodeId stored in the entry may be the ObjectId string
            const matchingCC = chargeCodes.find(
              (cc) => cc.charge_code_id === ccId || cc.charge_code === ccId
            );
            return {
              id: `loaded-${i}`,
              // Use the charge_code_id that matches the dropdown's option values
              chargeCodeId: matchingCC ? matchingCC.charge_code_id : ccId,
              entries: dates.map((d) => lockedDateSet.has(d)
                ? { date: d, hours: 0, value: '', entry_type: 'work', locked: true }
                : byDate[d]
                // FIX 3: Use hours as the display value, not description
                ? { date: d, hours: byDate[d].hours || 0, value: String(byDate[d].hours ?? getDefaultWorkEntryValue(d)), entry_type: 'work' }
                : {
                    date: d,
                    hours: i === 0 && !savedWorkTotalsByDate[d] ? Number(halfDayWorkDefaultsByDate[d] || 0) : 0,
                    value: i === 0 && !savedWorkTotalsByDate[d]
                      ? getDefaultWorkEntryValue(d, halfDayWorkDefaultsByDate)
                      : getDefaultWorkEntryValue(d),
                    entry_type: 'work',
                  }
              ),
            };
          });

          if (loadedRows.length === 0) {
            setRows([createEmptyWorkRow('row1', dates, lockedDateSet, halfDayWorkDefaultsByDate)]);
          } else {
            setRows(loadedRows);
          }
        } else {
          setTimesheetStatus('draft');
          setRows([createEmptyWorkRow('row1', dates, lockedDateSet, halfDayWorkDefaultsByDate)]);
        }
      })
      .catch(() => {
        setRows([createEmptyWorkRow('row1', dates, lockedDateSet, halfDayWorkDefaultsByDate)]);
      })
      .finally(() => setSheetLoaded(true));
  }, [userId, dates, chargeCodes, reloadTrigger, lockedDateSet, halfDayWorkDefaultsByDate]); // FIX 2: reloadTrigger added

  const validate = useCallback(() => {
    const errors = [];
    const hasSystemEntries = approvedLeaveEntries.length > 0 || holidays.length > 0;
    const rowsWithHours = rows.filter((row) =>
      row.entries.some((entry) => {
        const rawValue = entry?.value !== undefined ? entry.value : String(entry?.hours ?? '');
        const hours = parseFloat(rawValue);
        return !isNaN(hours) && hours > 0;
      })
    );
    if (rows.length === 0 && !hasSystemEntries) errors.push('Add at least one charge code row');
    if (rowsWithHours.some((row) => !row.chargeCodeId)) {
      errors.push(`${rowsWithHours.filter((row) => !row.chargeCodeId).length} row(s) missing a charge code`);
    }
    const duplicateChargeCodes = rows
      .map((row) => row.chargeCodeId)
      .filter(Boolean)
      .filter((chargeCodeId, index, chargeCodeIds) => chargeCodeIds.indexOf(chargeCodeId) !== index);
    if (duplicateChargeCodes.length > 0) {
      errors.push('Each charge code can be added only once in a timesheet');
    }
    if (rows.every((r) => r.entries.every((e) => !e.hours || e.hours === 0)) && !hasSystemEntries)
      errors.push('Enter hours for at least one row');
    dates.forEach((date) => {
      const total = rows.reduce((sum, row) => {
        const entry = row.entries.find((item) => item.date === date);
        const rawValue = entry?.value !== undefined ? entry.value : String(entry?.hours ?? '');
        const hours = parseFloat(rawValue);
        if (!isNaN(hours) && hours > DAILY_WORK_HOUR_LIMIT) {
          errors.push(`${date} has a charge code entry above ${DAILY_WORK_HOUR_LIMIT} hours`);
        }
        return sum + (isNaN(hours) ? 0 : hours);
      }, 0);
      const approvedLeave = approvedLeaveByDate[date];
      const systemHours = (approvedLeave?.hours || 0) + (holidayByDate[date] ? DAILY_WORK_HOUR_LIMIT : 0);
      if (approvedLeave && !approvedLeave.isHalfDay && total > 0) {
        errors.push(`${date} is already marked as ${approvedLeaveByDate[date].label} (${approvedLeaveByDate[date].code})`);
      }
      if (holidayByDate[date] && total > 0) {
        errors.push(`${date} is a holiday and cannot contain work hours`);
      }
      if (total + systemHours > DAILY_WORK_HOUR_LIMIT) {
        errors.push(
          `${date} has ${total + systemHours} total hours across all charge codes. `
          + `Maximum allowed is ${DAILY_WORK_HOUR_LIMIT} hours`
        );
      }
    });
    return errors;
  }, [rows, dates, approvedLeaveEntries.length, holidays.length, approvedLeaveByDate, holidayByDate]);

  useEffect(() => { setValidationErrors(validate()); }, [rows, validate]);

  const getTotalHours = () =>
    rows.reduce((t, row) =>
      t + row.entries.reduce((s, e) => {
        const v = e.value !== undefined ? e.value : String(e.hours ?? '');
        const n = parseFloat(v);
        return s + (isNaN(n) ? 0 : n);
      }, 0), 0)
    + approvedLeaveEntries
      .filter((leave) => !holidayByDate[leave.date])
      .reduce((sum, leave) => sum + (leave.hours || 0), 0)
    + holidays.reduce((sum, holiday) => sum + (holiday.hours || DAILY_WORK_HOUR_LIMIT), 0);

  const isReadOnly   = ['approved', 'pending_lead'].includes(timesheetStatus);
  const canSubmit    = timesheetStatus === 'draft' || timesheetStatus.startsWith('rejected');
  const errors       = validationErrors;

  const buildWorkEntries = useCallback(({ requireChargeCode = true, sourceRows = rows } = {}) => {
    const entries = [];
    const totalsByDate = {};

    sourceRows.forEach((row) => {
      row.entries.forEach((e) => {
        const rawVal = e.value !== undefined ? e.value : String(e.hours || '');
        const trimmed = String(rawVal).trim();
        const numHrs = parseFloat(trimmed);
        if (!trimmed || trimmed === '0' || isNaN(numHrs)) return;
        if (numHrs < 0) throw new Error(`Hours cannot be negative on ${e.date}`);
        if (numHrs > DAILY_WORK_HOUR_LIMIT) {
          throw new Error(`Working hours for any charge code cannot exceed ${DAILY_WORK_HOUR_LIMIT} hours on ${e.date}`);
        }
        if (lockedDateSet.has(e.date)) {
          const leaveEntry = approvedLeaveByDate[e.date];
          if (leaveEntry) throw new Error(`${e.date} is already marked as ${leaveEntry.label} (${leaveEntry.code})`);
          if (holidayByDate[e.date]) throw new Error(`${e.date} is a holiday and cannot contain work hours`);
        }
        if (requireChargeCode && !row.chargeCodeId) throw new Error(`Select a charge code for ${e.date}`);
        totalsByDate[e.date] = (totalsByDate[e.date] || 0) + numHrs;
        entries.push({
          date:           e.date,
          entry_type:     'work',
          charge_code_id: row.chargeCodeId,
          hours:          numHrs,
          description:    '',
        });
      });
    });

    const duplicateChargeCode = sourceRows
      .map((row) => row.chargeCodeId)
      .filter(Boolean)
      .find((chargeCodeId, index, chargeCodeIds) => chargeCodeIds.indexOf(chargeCodeId) !== index);
    if (duplicateChargeCode) {
      throw new Error('Each charge code can be added only once in a timesheet');
    }

    const overLimit = Object.entries(totalsByDate).find(([date, total]) => {
      const systemHours = (approvedLeaveByDate[date]?.hours || 0) + (holidayByDate[date] ? DAILY_WORK_HOUR_LIMIT : 0);
      return total + systemHours > DAILY_WORK_HOUR_LIMIT;
    });
    if (overLimit) {
      const [date, total] = overLimit;
      const systemHours = (approvedLeaveByDate[date]?.hours || 0) + (holidayByDate[date] ? DAILY_WORK_HOUR_LIMIT : 0);
      throw new Error(
        `${date} has ${total + systemHours} total hours across all charge codes. `
        + `Maximum allowed is ${DAILY_WORK_HOUR_LIMIT} hours`
      );
    }

    return entries;
  }, [approvedLeaveByDate, holidayByDate, lockedDateSet, rows]);

  const liveSummaryEntries = useMemo(
    () => buildLiveSummaryEntries({
      rows,
      chargeCodes,
      approvedLeaveEntries,
      holidays,
    }),
    [approvedLeaveEntries, chargeCodes, holidays, rows]
  );

  useEffect(() => {
    if (!onSheetSnapshotChange || !sheetLoaded || !activePeriod || !dates.length) return;

    onSheetSnapshotChange(activePeriod, {
      employee_id: userId,
      employee_name: profile.name || user?.name || '',
      employee_email: profile.email || user?.email || '',
      employee_department: profile.department || user?.department || '',
      period_start: dates[0],
      period_end: dates[dates.length - 1],
      entries: liveSummaryEntries,
      total_hours: liveSummaryEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
      work_hours: getEntriesWorkHours(liveSummaryEntries),
      status: timesheetStatus,
      employee_work_location: profile.workLocation || '',
      employee_assigned_location: profile.assignedLocation || profile.costCenter || profile.workLocation || '',
      employee_company_code: profile.companyCode || '',
      employee_cost_center: profile.costCenter || '',
    });
  }, [
    activePeriod,
    dates,
    liveSummaryEntries,
    onSheetSnapshotChange,
    profile,
    sheetLoaded,
    timesheetStatus,
    user,
    userId,
  ]);

  const saveDraftSilently = useCallback(async () => {
    if (!hasLocalTimesheetEditsRef.current || isReadOnly || !userId || !dates.length) return;

    try {
      const entries = buildWorkEntries();
      await fetchAPI('/timesheets/save_draft', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: userId,
          period_start: dates[0],
          period_end: dates[dates.length - 1],
          entries,
        }),
      });
      hasLocalTimesheetEditsRef.current = false;
    } catch (_) {
      // Silent autosave should never interrupt typing or replace validation.
    }
  }, [buildWorkEntries, dates, isReadOnly, userId]);

  useEffect(() => {
    if (!hasLocalTimesheetEditsRef.current || isReadOnly) return undefined;
    const autoSaveTimer = setTimeout(() => {
      saveDraftSilently();
    }, 1500);
    return () => clearTimeout(autoSaveTimer);
  }, [rows, saveDraftSilently, isReadOnly]);

  useEffect(() => {
    saveDraftSilentlyRef.current = saveDraftSilently;
  }, [saveDraftSilently]);

  useEffect(() => () => {
    saveDraftSilentlyRef.current?.();
  }, []);

  const findCurrentTimesheet = async () => {
    const existing = await fetchAPI(`/timesheets/employee/${userId}`);
    return Array.isArray(existing)
      ? existing.find((ts) =>
          ts.period_start === dates[0] &&
          ts.period_end   === dates[dates.length - 1]
        )
      : null;
  };

  // FIX 2: handleRecall now triggers a full reload via reloadTrigger
  const handleRecall = async () => {
    setLoading(true);
    try {
      const existing = await fetchAPI(`/timesheets/employee/${userId}`);
      const match = Array.isArray(existing)
        ? existing.find((ts) =>
            ts.period_start === dates[0] &&
            ts.period_end   === dates[dates.length - 1]
          )
        : null;

      if (match) {
        await fetchAPI(`/timesheets/recall/${match._id || match.id}`, { method: 'PUT' });
      }
      // FIX 2: increment trigger so the data useEffect re-fetches fresh rows
      hasLocalTimesheetEditsRef.current = false;
      setReloadTrigger((t) => t + 1);
    } catch (err) {
      // Even on error, reset to draft and reload
      setTimesheetStatus('draft');
      hasLocalTimesheetEditsRef.current = false;
      setReloadTrigger((t) => t + 1);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    const errors = validate();
    if (errors.length) { alert('Please fix:\n\n' + errors.join('\n')); return; }
    setLoading(true);
    try {
      const entries = buildWorkEntries();

      let existingId = null;
      try {
        const match = await findCurrentTimesheet();
        existingId = match ? (match._id || match.id) : null;
      } catch (_) {}

      if (existingId) {
        await fetchAPI(`/timesheets/update/${existingId}`, {
          method: 'PUT',
          body: JSON.stringify({ entries }),
        });
        await fetchAPI(`/timesheets/submit/${existingId}`, { method: 'PUT' });
      } else {
        await fetchAPI('/timesheets/create', {
          method: 'POST',
          body: JSON.stringify({
            employee_id:  userId,
            period_start: dates[0],
            period_end:   dates[dates.length - 1],
            entries,
          }),
        });
      }
      // FIX 2: reload after submit so lead sees fresh data and employee sees correct state
      hasLocalTimesheetEditsRef.current = false;
      setReloadTrigger((t) => t + 1);
      alert('Timesheet submitted successfully!');
    } catch (err) {
      alert(`Submission failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    if (isReadOnly) return;
    setLoading(true);
    try {
      const entries = buildWorkEntries();
      await fetchAPI('/timesheets/save_draft', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: userId,
          period_start: dates[0],
          period_end: dates[dates.length - 1],
          entries,
        }),
      });
      setTimesheetStatus('draft');
      hasLocalTimesheetEditsRef.current = false;
      setReloadTrigger((t) => t + 1);
      alert('Draft saved successfully');
    } catch (err) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTimesheet = async () => {
    if (isReadOnly) return;
    if (!window.confirm('Delete this draft timesheet for the selected period?')) return;
    setLoading(true);
    try {
      const match = await findCurrentTimesheet();
      if (match) {
        await fetchAPI(`/timesheets/delete/${match._id || match.id}`, { method: 'DELETE' });
      }
      setTimesheetStatus('draft');
      hasLocalTimesheetEditsRef.current = false;
      setRows([createEmptyWorkRow('row1', dates, lockedDateSet, halfDayWorkDefaultsByDate)]);
      setReloadTrigger((t) => t + 1);
      alert('Timesheet deleted successfully');
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const statusMessage = () => {
    const isPending  = timesheetStatus === 'pending_lead';
    const isApproved = timesheetStatus === 'approved';
    const isRejected = timesheetStatus.startsWith('rejected');
    const isLegacyPending = timesheetStatus === 'pending_manager';
    if (!isPending && !isApproved && !isRejected && !isLegacyPending) return null;

    const bg    = (isPending || isLegacyPending) ? C.purpleLight : isApproved ? C.greenLight : C.redLight;
    const brd   = (isPending || isLegacyPending) ? C.purpleBorder : isApproved ? C.greenBorder : C.redBorder;
    const color = (isPending || isLegacyPending) ? C.purple : isApproved ? C.green : C.red;

    const msg = isPending
      ? (<><strong>Pending Approval:</strong> Your timesheet is awaiting review from your reporting lead.</>)
      : isLegacyPending
      ? (<><strong>Pending Manager Approval:</strong> Awaiting final manager sign-off.</>)
      : isApproved
      ? (<><strong>Approved:</strong> This timesheet is permanently locked. Contact your lead for corrections.</>)
      : (<><strong>Rejected:</strong> Review the feedback, make corrections, and resubmit.</>);

    return (
      <div style={{ padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px', background: bg, border: `1px solid ${brd}`, color }}>
        {msg}
      </div>
    );
  };

  return (
    <div className={`mte-embedded-shell ${embedded ? 'is-embedded' : ''}`}>
      <div className="mte-date-toolbar">
        <div className="mte-date-picker-group">
          <button type="button" className="mte-ghost-icon" aria-label="Previous period">
            <ChevronLeft size={16} />
          </button>
          <div className="mte-date-select-shell">
            <Calendar size={15} />
            <select
              className="mte-native-select"
              value={activePeriod}
              onChange={(event) => {
                saveDraftSilentlyRef.current?.();
                setActivePeriod(event.target.value);
                setTimesheetStatus('draft');
              }}
            >
              {availablePeriods.map((period) => (
                <option key={period.value} value={period.value}>
                  {period.shortLabel || period.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="mte-ghost-icon" aria-label="Next period">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="mte-primary-actions">
          <span className="mte-link-action">New</span>
          {canSubmit ? (
            <button
              type="button"
              className="mte-submit-button"
              onClick={handleSubmit}
              disabled={errors.length > 0 || loading}
            >
              {loading ? 'Submitting' : 'Submit'}
            </button>
          ) : (
            <div className="mte-status-inline">
              <StatusBadge status={timesheetStatus} />
            </div>
          )}
        </div>
      </div>

      <div className="mte-action-toolbar">
        <button type="button" className="mte-tool-button" onClick={handleSaveDraft} disabled={isReadOnly || loading}>
          <Save size={18} />
          <span>Save</span>
        </button>
        <button
          type="button"
          className="mte-tool-button"
          onClick={handleDeleteTimesheet}
          disabled={isReadOnly || loading}
        >
          <Trash2 size={18} />
          <span>Delete</span>
        </button>
        <button type="button" className="mte-tool-button" onClick={() => {
          hasLocalTimesheetEditsRef.current = true;
          setRows((previous) => [...previous, {
            ...createEmptyWorkRow(`row${Date.now()}`, dates, lockedDateSet),
          }]);
        }}>
          <Plus size={18} />
          <span>Add New Row</span>
        </button>
        <button type="button" className="mte-tool-button">
          <CircleHelp size={18} />
          <span>Help</span>
        </button>
        <div className="mte-toolbar-summary">
          <strong>{selectedPeriodOption?.label || 'Current period'}</strong>
          <span>Total hours {getTotalHours()}h</span>
        </div>
      </div>

      {timesheetStatus === 'pending_lead' ? (
        <div className="mte-inline-banner">
          <span>Pending with your reporting lead.</span>
          <button type="button" className="mte-inline-banner-button" onClick={handleRecall} disabled={loading}>
            {loading ? 'Updating' : 'Edit Timesheet'}
          </button>
        </div>
      ) : null}

      {canSubmit && errors.length > 0 && (
        <div className="mte-error-banner">
          <AlertCircle size={16} />
          <div>
            <strong>Fix these items before you submit.</strong>
            <p>{errors.join(' • ')}</p>
          </div>
        </div>
      )}

      {statusMessage()}

      <div className="mte-grid-caption">
        <div>
          <strong>Charge Codes</strong>
          <span>Use your assigned codes and enter day-wise hours exactly as in the reference layout.</span>
        </div>
        <StatusBadge status={timesheetStatus} />
      </div>

      <TimesheetGrid
        dates={dates}
        rows={rows}
        chargeCodes={chargeCodes}
        onRowUpdate={(id, u) => {
          hasLocalTimesheetEditsRef.current = true;
          setRows((p) => p.map((r) => r.id === id ? { ...r, ...u } : r));
        }}
        onRowAdd={() => {
          hasLocalTimesheetEditsRef.current = true;
          setRows((p) => [...p, createEmptyWorkRow(`row${Date.now()}`, dates, lockedDateSet)]);
        }}
        onRowDelete={(id) => {
          hasLocalTimesheetEditsRef.current = true;
          setRows((p) => p.filter((r) => r.id !== id));
        }}
        readOnly={isReadOnly}
        approvedLeaves={approvedLeaves}
        holidays={holidays}
        assignmentMeta={assignmentMeta}
      />

      <div className="mte-bottom-note">
        <div>
          <strong>Portal behaviour</strong>
          <span>Select a charge code, enter hours, and submit for your reporting lead. Approved periods stay locked.</span>
        </div>
      </div>
    </div>
  );
}

// ─── useCcLookup — shared hook ────────────────────────────────────────────────
// Fetches all charge codes once and returns a lookup keyed by both ObjectId
// string and code string. Used by every component that renders timesheets so
// old DB records missing charge_code_name still display correctly.
function useCcLookup() {
  const [ccLookup, setCcLookup] = useState({});
  useEffect(() => {
    fetchAPI('/charge_codes/all')
      .then((codes) => {
        if (!Array.isArray(codes)) return;
        const lookup = {};
        codes.forEach((c) => {
          if (c._id)  lookup[c._id]  = { code: c.code, name: c.name };
          if (c.code) lookup[c.code] = { code: c.code, name: c.name };
        });
        setCcLookup(lookup);
      })
      .catch(console.error);
  }, []);
  return ccLookup;
}

// ─── csvRow — safe CSV cell escaping ─────────────────────────────────────────
// Wraps a value in quotes and escapes inner quotes so commas/newlines in
// charge code names don't corrupt the CSV.
function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}
function buildCsvRow(cols) { return cols.map(csvCell).join(','); }

// ─── buildChargeCodeMap ───────────────────────────────────────────────────────
// Shared helper for TimesheetDetailModal and TimesheetFullPageView.
// ccLookup: optional object keyed by charge_code_id → { code, name } for
// enriching old DB records that were saved before charge_code_name was stored.
function buildChargeCodeMap(entries, ccLookup = {}) {
  const chargeCodeMap = {};
  const holidaysByDate = {};

  (entries || []).forEach((e) => {
    if (e.entry_type === 'holiday') {
      holidaysByDate[e.date] = e;
      return;
    }
    const key = e.charge_code_id || e.charge_code || 'unknown';

    // Prefer fields stored on the entry; fall back to ccLookup for old records
    const looked = ccLookup[key] || ccLookup[e.charge_code_id] || ccLookup[e.charge_code] || {};
    const code  = e.charge_code      || looked.code || '';
    const cname = e.charge_code_name || looked.name || '';
    const label = [code, cname].filter((v) => v && v.trim() !== '').join(' – ') || 'Unknown';

    if (!chargeCodeMap[key]) {
      chargeCodeMap[key] = { label, byDate: {} };
    }
    chargeCodeMap[key].byDate[e.date] = e;
  });

  return { chargeCodeMap, holidaysByDate };
}

// ─── TimesheetDetailModal ─────────────────────────────────────────────────────
function TimesheetDetailModal({ timesheet, onClose, ccLookup = {} }) {
  if (!timesheet) return null;

  const period = timesheet.period_start && timesheet.period_end
    ? `${format(new Date(timesheet.period_start), 'MMM d')} – ${format(new Date(timesheet.period_end), 'MMM d, yyyy')}`
    : '—';

  const allDates = (() => {
    if (!timesheet.period_start || !timesheet.period_end) return [];
    const start = parseISO(timesheet.period_start);
    const end   = parseISO(timesheet.period_end);
    return eachDayOfInterval({ start, end }).map((d) => format(d, 'yyyy-MM-dd'));
  })();

  const { chargeCodeMap, holidaysByDate } = buildChargeCodeMap(timesheet.entries, ccLookup);
  const chargeCodeRows = Object.entries(chargeCodeMap);
  const assignmentMeta = getTimesheetAssignmentMeta(timesheet);

  const getDateTotal = (date) =>
    chargeCodeRows.reduce((s, [, cc]) => s + (cc.byDate[date]?.hours || 0), 0);

  const grandTotal = allDates.reduce((s, d) => s + getDateTotal(d), 0);

  const stickyLeft = {
    position: 'sticky', left: 0, zIndex: 10,
    boxShadow: '2px 0 4px rgba(0,0,0,0.06)',
  };

  const thDate = (date) => {
    const isHol = !!holidaysByDate[date];
    const isWkd = ['Sat', 'Sun'].includes(format(parseISO(date), 'EEE'));
    return {
      padding: '8px 6px', textAlign: 'center', fontSize: '11px', fontWeight: '600',
      minWidth: '72px', maxWidth: '72px', whiteSpace: 'nowrap',
      borderLeft: `1px solid ${C.borderLight}`,
      background: isHol ? C.holiday : isWkd ? '#f5f5f5' : C.headerBg,
      color:      isHol ? C.holidayText : isWkd ? C.textMid : C.text,
      position: 'sticky', top: 0, zIndex: 2,
    };
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.white, borderRadius: '8px',
          width: '100%', maxWidth: '1100px', maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(0,0,0,0.22)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '18px 24px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          background: C.headerBg, flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: '600', color: C.text }}>
              {timesheet.employee_name}
            </h2>
            <p style={{ margin: 0, fontSize: '13px', color: C.textMid }}>
              {timesheet.employee_email}
              <span style={{ margin: '0 8px', color: C.borderLight }}>|</span>
              Period: <strong style={{ color: C.text }}>{period}</strong>
              <span style={{ margin: '0 8px', color: C.borderLight }}>|</span>
              Total: <strong style={{ color: C.purple }}>{grandTotal}h</strong>
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <StatusBadge status={timesheet.status} />
            <button
              onClick={onClose}
              style={{
                background: 'none', border: `1px solid ${C.border}`, borderRadius: '5px',
                padding: '5px 10px', cursor: 'pointer', fontSize: '18px',
                color: C.textMid, lineHeight: 1,
              }}
            >×</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto', overflowY: 'auto', flex: 1, position: 'relative' }}>
          {allDates.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: C.textMid }}>
              No date range available for this timesheet.
            </div>
          ) : (
            <table style={{ borderCollapse: 'collapse', minWidth: 'max-content', width: '100%' }}>
              <thead>
                <tr style={{ background: C.headerBg, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{
                    ...stickyLeft,
                    padding: '12px 16px', textAlign: 'left', fontSize: '13px',
                    fontWeight: '600', color: C.text, background: C.headerBg,
                    minWidth: '220px', zIndex: 11,
                    borderRight: `1px solid ${C.borderLight}`,
                  }}>
                    Charge Code
                  </th>
                  {allDates.map((date) => {
                    const isHol = !!holidaysByDate[date];
                    const dow   = format(parseISO(date), 'EEE');
                    const isWkd = ['Sat', 'Sun'].includes(dow);
                    return (
                      <th key={date} style={thDate(date)}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                          <span style={{ fontSize: '10px', color: isHol ? C.holidayText : isWkd ? C.textMid : C.textMid, fontWeight: '400' }}>{dow}</span>
                          <span>{format(parseISO(date), 'MMM d')}</span>
                          {isHol && <span style={{ fontSize: '9px' }}>PH</span>}
                        </div>
                      </th>
                    );
                  })}
                  <th style={{
                    padding: '12px 10px', textAlign: 'center', fontSize: '12px',
                    fontWeight: '600', color: C.purple, background: C.totalBg,
                    minWidth: '68px', borderLeft: `1px solid ${C.border}`,
                    position: 'sticky', top: 0, zIndex: 2,
                  }}>
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="mte-sheet-meta-row">
                  <td style={{ ...stickyLeft, padding: '10px 16px', background: C.white, borderRight: `1px solid ${C.borderLight}` }}>
                    <span className="mte-sheet-meta-link">Work Location</span>
                  </td>
                  {allDates.map((date) => (
                    <td key={`detail-work-location-${date}`} className="mte-sheet-meta-cell">{assignmentMeta.workLocation}</td>
                  ))}
                  <td className="mte-sheet-meta-total" />
                </tr>
                <tr className="mte-sheet-meta-row">
                  <td style={{ ...stickyLeft, padding: '10px 16px', background: C.white, borderRight: `1px solid ${C.borderLight}` }}>
                    Assigned Location
                  </td>
                  {allDates.map((date) => (
                    <td key={`detail-assigned-location-${date}`} className="mte-sheet-meta-cell">{assignmentMeta.assignedLocation}</td>
                  ))}
                  <td className="mte-sheet-meta-total">{assignmentMeta.assignedLocation}</td>
                </tr>
                <tr className="mte-sheet-meta-row mte-sheet-meta-row-last">
                  <td style={{ ...stickyLeft, padding: '10px 16px', background: C.white, borderRight: `1px solid ${C.borderLight}` }}>
                    Company Code/Cost Center
                  </td>
                  {allDates.map((date) => (
                    <td key={`detail-cost-center-${date}`} className="mte-sheet-meta-cell">{assignmentMeta.companyCostCenter}</td>
                  ))}
                  <td className="mte-sheet-meta-total">{assignmentMeta.companyCostCenter}</td>
                </tr>
                {chargeCodeRows.length === 0 ? (
                  <tr>
                    <td colSpan={allDates.length + 2} style={{ padding: '32px', textAlign: 'center', color: C.textMid }}>
                      No entries recorded.
                    </td>
                  </tr>
                ) : (
                  <>
                    {/* FIX 1: use cc.label instead of the raw key */}
                    {chargeCodeRows.map(([key, cc], ri) => {
                      const rowTotal = allDates.reduce((s, d) => s + (cc.byDate[d]?.hours || 0), 0);
                      const rowBg    = ri % 2 === 0 ? C.white : C.rowAlt;
                      return (
                        <tr key={key} style={{ borderBottom: `1px solid ${C.borderLight}`, background: rowBg }}>
                          <td style={{
                            ...stickyLeft, padding: '10px 16px',
                            fontSize: '13px', fontWeight: '500', color: C.purple,
                            background: rowBg, borderRight: `1px solid ${C.borderLight}`,
                          }}>
                            {cc.label}
                          </td>
                          {allDates.map((date) => {
                            const entry = cc.byDate[date];
                            const isHol = !!holidaysByDate[date];
                            return (
                              <td key={date} style={{
                                padding: '10px 4px', textAlign: 'center',
                                borderLeft: `1px solid ${C.borderLight}`,
                                fontSize: '13px',
                                background: isHol ? '#fffbeb' : 'transparent',
                              }}>
                                {entry && entry.hours > 0
                                  ? <strong style={{ color: C.text }}>{entry.hours}h</strong>
                                  : <span style={{ color: C.textMid }}>0</span>}
                              </td>
                            );
                          })}
                          <td style={{
                            padding: '10px 10px', textAlign: 'center', fontWeight: '700',
                            background: C.totalBg, borderLeft: `1px solid ${C.border}`,
                            color: C.purple, fontSize: '13px',
                          }}>
                            {rowTotal}h
                          </td>
                        </tr>
                      );
                    })}

                    <tr style={{ background: C.totalBg, borderTop: `2px solid ${C.totalBorder}` }}>
                      <td style={{
                        ...stickyLeft, padding: '10px 16px',
                        fontWeight: '600', color: C.purple, fontSize: '13px',
                        background: C.totalBg, borderRight: `1px solid ${C.borderLight}`,
                      }}>
                        Daily Total
                      </td>
                      {allDates.map((date) => (
                        <td key={date} style={{
                          padding: '10px 4px', textAlign: 'center',
                          fontWeight: '700', color: C.purple, fontSize: '13px',
                          borderLeft: `1px solid ${C.borderLight}`,
                        }}>
                          {getDateTotal(date) > 0
                            ? `${getDateTotal(date)}h`
                            : <span style={{ color: C.textMid, fontWeight: '400' }}>0</span>}
                        </td>
                      ))}
                      <td style={{
                        padding: '10px 10px', textAlign: 'center', fontWeight: '700',
                        background: C.purpleLight, color: C.purple, fontSize: '14px',
                        borderLeft: `1px solid ${C.totalBorder}`,
                      }}>
                        {grandTotal}h
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          )}
        </div>

        {timesheet.approval_history && timesheet.approval_history.length > 0 && (
          <div style={{
            padding: '12px 24px', borderTop: `1px solid ${C.border}`,
            background: C.headerBg, flexShrink: 0,
          }}>
            <p style={{ margin: '0 0 6px 0', fontSize: '11px', fontWeight: '600', color: C.textMid, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Approval History
            </p>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {timesheet.approval_history.map((h, i) => (
                <div key={i} style={{ fontSize: '12px', color: C.textMid }}>
                  <span style={{ fontWeight: '600', color: h.action === 'approved' ? C.green : C.red }}>
                    {h.stage === 'lead' ? 'Lead' : 'Manager'} {h.action}
                  </span>
                  {' by '}{h.approver_name}
                  {h.timestamp && ` · ${format(new Date(h.timestamp), 'MMM d, yyyy')}`}
                  {h.comments && ` — "${h.comments}"`}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{
          padding: '12px 24px', borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'flex-end', background: C.white, flexShrink: 0,
        }}>
          <button onClick={onClose} style={S.btnSecondary}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── TimesheetFullPageView ────────────────────────────────────────────────────
function TimesheetFullPageView({ timesheet, onClose, onApprove, onReject, user, onNavigate, ccLookup = {} }) {
  if (!timesheet) return null;

  const role = user?.role;
  const roleKey = String(role || '').toLowerCase();
  const isPending  = timesheet.status === 'pending_lead';
  const isApprover = roleKey.includes('lead');
  const canAction  = isApprover && onApprove && isPending;

  const period = timesheet.period_start && timesheet.period_end
    ? `${format(new Date(timesheet.period_start), 'MMM d')} – ${format(new Date(timesheet.period_end), 'MMM d, yyyy')}`
    : '—';

  const isLegacyManagerPending = roleKey === 'manager' && timesheet.status === 'pending_manager' && onApprove;

  const allDates = (() => {
    if (!timesheet.period_start || !timesheet.period_end) return [];
    return eachDayOfInterval({
      start: parseISO(timesheet.period_start),
      end:   parseISO(timesheet.period_end),
    }).map((d) => format(d, 'yyyy-MM-dd'));
  })();

  // use shared helper with ccLookup for old records missing charge_code_name
  const { chargeCodeMap, holidaysByDate } = buildChargeCodeMap(timesheet.entries, ccLookup);
  const chargeCodeRows = Object.entries(chargeCodeMap);
  const assignmentMeta = getTimesheetAssignmentMeta(timesheet);

  const getDateTotal = (date) =>
    chargeCodeRows.reduce((s, [, cc]) => s + (cc.byDate[date]?.hours || 0), 0);
  const grandTotal = allDates.reduce((s, d) => s + getDateTotal(d), 0);

  const stickyLeft = {
    position: 'sticky', left: 0, zIndex: 10,
    boxShadow: '2px 0 4px rgba(0,0,0,0.06)',
  };

  const showActionButtons = canAction || isLegacyManagerPending;

  return (
    <div style={{ ...S.page, minHeight: '100vh' }}>
      <div style={{
        background: C.white, borderBottom: `1px solid ${C.border}`,
        padding: '14px 20px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={onClose} style={S.btnSecondary}>
            {onApprove ? '← Back to Approvals' : '← Back to History'}
          </button>
          <div>
            <span style={{ fontSize: '16px', fontWeight: '600', color: C.text }}>
              {timesheet.employee_name}
            </span>
            <span style={{ fontSize: '13px', color: C.textMid, marginLeft: '10px' }}>
              {timesheet.employee_email}
            </span>
          </div>
          <StatusBadge status={timesheet.status} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: C.textMid }}>
            Period: <strong style={{ color: C.text }}>{period}</strong>
          </span>
          <span style={{ fontSize: '13px', color: C.textMid }}>
            Total: <strong style={{ color: C.purple }}>{grandTotal}h</strong>
          </span>
          {showActionButtons && (
            <>
              <button onClick={onApprove} style={{ ...S.btnGreen, padding: '7px 16px' }}>
                <CheckCircle size={14} /> Approve
              </button>
              <button onClick={onReject} style={{ ...S.btnPrimary, background: C.red, padding: '7px 16px' }}>
                <XCircle size={14} /> Reject
              </button>
            </>
          )}
          {onNavigate && (timesheet.status === 'draft' || timesheet.status?.startsWith('rejected')) && (
            <button
              onClick={() => { onClose(); onNavigate('timesheet'); }}
              style={{ ...S.btnPrimary, padding: '7px 16px' }}
            >
              ✏️ Edit Timesheet
            </button>
          )}
        </div>
      </div>

      <div style={S.inner}>
        <div style={S.maxW}>
          {timesheet.status?.startsWith('rejected') && timesheet.rejection_reason && (
            <div style={{
              padding: '12px 16px', borderRadius: '6px', marginBottom: '16px',
              background: C.redLight, border: `1px solid ${C.redBorder}`,
              fontSize: '13px', color: C.red,
            }}>
              <strong>Rejection reason:</strong> {timesheet.rejection_reason}
            </div>
          )}

          <div style={{ ...S.card, overflow: 'hidden', marginBottom: '20px' }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', position: 'relative' }}>
              <table style={{ borderCollapse: 'collapse', minWidth: 'max-content', width: '100%' }}>
                <thead>
                  <tr style={{ background: C.headerBg, borderBottom: `1px solid ${C.border}` }}>
                    <th style={{
                      ...stickyLeft, padding: '12px 16px', textAlign: 'left',
                      fontSize: '13px', fontWeight: '600', color: C.text,
                      background: C.headerBg, minWidth: '220px', zIndex: 11,
                      borderRight: `1px solid ${C.borderLight}`,
                    }}>
                      Charge Code
                    </th>
                    {allDates.map((date) => {
                      const isHol = !!holidaysByDate[date];
                      const dow   = format(parseISO(date), 'EEE');
                      const isWkd = ['Sat', 'Sun'].includes(dow);
                      return (
                        <th key={date} style={{
                          padding: '8px 6px', textAlign: 'center', fontSize: '11px',
                          fontWeight: '600', minWidth: '72px', whiteSpace: 'nowrap',
                          borderLeft: `1px solid ${C.borderLight}`,
                          background: isHol ? C.holiday : isWkd ? '#f5f5f5' : C.headerBg,
                          color:      isHol ? C.holidayText : isWkd ? C.textMid : C.text,
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                            <span style={{ fontSize: '10px', fontWeight: '400', color: isHol ? C.holidayText : C.textMid }}>{dow}</span>
                            <span>{format(parseISO(date), 'MMM d')}</span>
                            {isHol && <span style={{ fontSize: '9px' }}>PH</span>}
                          </div>
                        </th>
                      );
                    })}
                    <th style={{
                      padding: '12px 10px', textAlign: 'center', fontSize: '12px',
                      fontWeight: '600', color: C.purple, background: C.totalBg,
                      minWidth: '68px', borderLeft: `1px solid ${C.border}`,
                    }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="mte-sheet-meta-row">
                    <td style={{ ...stickyLeft, padding: '10px 16px', background: C.white, borderRight: `1px solid ${C.borderLight}` }}>
                      <span className="mte-sheet-meta-link">Work Location</span>
                    </td>
                    {allDates.map((date) => (
                      <td key={`full-work-location-${date}`} className="mte-sheet-meta-cell">{assignmentMeta.workLocation}</td>
                    ))}
                    <td className="mte-sheet-meta-total" />
                  </tr>
                  <tr className="mte-sheet-meta-row">
                    <td style={{ ...stickyLeft, padding: '10px 16px', background: C.white, borderRight: `1px solid ${C.borderLight}` }}>
                      Assigned Location
                    </td>
                    {allDates.map((date) => (
                      <td key={`full-assigned-location-${date}`} className="mte-sheet-meta-cell">{assignmentMeta.assignedLocation}</td>
                    ))}
                    <td className="mte-sheet-meta-total">{assignmentMeta.assignedLocation}</td>
                  </tr>
                  <tr className="mte-sheet-meta-row mte-sheet-meta-row-last">
                    <td style={{ ...stickyLeft, padding: '10px 16px', background: C.white, borderRight: `1px solid ${C.borderLight}` }}>
                      Company Code/Cost Center
                    </td>
                    {allDates.map((date) => (
                      <td key={`full-cost-center-${date}`} className="mte-sheet-meta-cell">{assignmentMeta.companyCostCenter}</td>
                    ))}
                    <td className="mte-sheet-meta-total">{assignmentMeta.companyCostCenter}</td>
                  </tr>
                  {chargeCodeRows.length === 0 ? (
                    <tr>
                      <td colSpan={allDates.length + 2} style={{ padding: '40px', textAlign: 'center', color: C.textMid }}>
                        No entries recorded.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {/* FIX 1: use cc.label for display */}
                      {chargeCodeRows.map(([key, cc], ri) => {
                        const rowTotal = allDates.reduce((s, d) => s + (cc.byDate[d]?.hours || 0), 0);
                        const rowBg = ri % 2 === 0 ? C.white : C.rowAlt;
                        return (
                          <tr key={key} style={{ borderBottom: `1px solid ${C.borderLight}`, background: rowBg }}>
                            <td style={{
                              ...stickyLeft, padding: '10px 16px', fontSize: '13px',
                              fontWeight: '600', color: C.purple,
                              background: rowBg, borderRight: `1px solid ${C.borderLight}`,
                            }}>
                              {cc.label}
                            </td>
                            {allDates.map((date) => {
                              const entry = cc.byDate[date];
                              const isHol = !!holidaysByDate[date];
                              return (
                                <td key={date} style={{
                                  padding: '10px 4px', textAlign: 'center', fontSize: '13px',
                                  borderLeft: `1px solid ${C.borderLight}`,
                                  background: isHol ? '#fffbeb' : 'transparent',
                                }}>
                                  {entry && entry.hours > 0
                                    ? <strong style={{ color: C.text }}>{entry.hours}h</strong>
                                    : <span style={{ color: C.textMid }}>0</span>}
                                </td>
                              );
                            })}
                            <td style={{
                              padding: '10px 10px', textAlign: 'center', fontWeight: '700',
                              background: C.totalBg, borderLeft: `1px solid ${C.border}`,
                              color: C.purple, fontSize: '13px',
                            }}>
                              {rowTotal}h
                            </td>
                          </tr>
                        );
                      })}

                      <tr style={{ background: C.totalBg, borderTop: `2px solid ${C.totalBorder}` }}>
                        <td style={{ ...stickyLeft, padding: '10px 16px', fontWeight: '600', color: C.purple, fontSize: '13px', background: C.totalBg, borderRight: `1px solid ${C.borderLight}` }}>
                          Daily Total
                        </td>
                        {allDates.map((date) => (
                          <td key={date} style={{ padding: '10px 4px', textAlign: 'center', fontWeight: '700', color: C.purple, fontSize: '13px', borderLeft: `1px solid ${C.borderLight}` }}>
                            {getDateTotal(date) > 0
                              ? `${getDateTotal(date)}h`
                              : <span style={{ color: C.textMid, fontWeight: '400' }}>0</span>}
                          </td>
                        ))}
                        <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: '700', background: C.purpleLight, color: C.purple, fontSize: '14px', borderLeft: `1px solid ${C.totalBorder}` }}>
                          {grandTotal}h
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {timesheet.approval_history?.length > 0 && (
            <div style={{ ...S.card, ...S.cardPad }}>
              <p style={{ margin: '0 0 10px 0', fontSize: '13px', fontWeight: '600', color: C.text }}>
                Approval History
              </p>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                {timesheet.approval_history.map((h, i) => (
                  <div key={i} style={{ fontSize: '13px', color: C.textMid, padding: '8px 12px', background: h.action === 'approved' ? C.greenLight : C.redLight, borderRadius: '6px', border: `1px solid ${h.action === 'approved' ? C.greenBorder : C.redBorder}` }}>
                    <span style={{ fontWeight: '600', color: h.action === 'approved' ? C.green : C.red }}>
                      {h.stage === 'lead' ? 'Lead' : 'Manager'} {h.action}
                    </span>
                    {' by '}{h.approver_name}
                    {h.timestamp && ` · ${format(new Date(h.timestamp), 'MMM d, yyyy')}`}
                    {h.comments && <div style={{ marginTop: '4px', fontSize: '12px' }}>"{h.comments}"</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Approvals ────────────────────────────────────────────────────────────────
function Approvals({ user }) {
  const [searchTerm,          setSearchTerm]          = useState('');
  const [statusFilter,        setStatusFilter]        = useState('pending_lead');
  const [typeFilter,          setTypeFilter]          = useState('all');
  const [dateRange,           setDateRange]           = useState(blankDateRange);
  const [selectedTimesheets,  setSelectedTimesheets]  = useState([]);
  const [approvals,           setApprovals]           = useState([]);
  const [loading,             setLoading]             = useState(false);
  const [viewingTimesheet,    setViewingTimesheet]    = useState(null);
  const [fullPageView,        setFullPageView]        = useState(false);

  // shared hook — enriches old entries missing charge_code_name
  const ccLookup = useCcLookup();

  const role   = user?.role;
  const userId = getUserId(user);

  const loadApprovals = useCallback(() => {
    if (!userId) return;
    setLoading(true);

    const leadFetch    = fetchAPI(`/timesheets/pending/lead/${userId}`);
    const managerFetch = role === 'Manager'
      ? fetchAPI(`/timesheets/pending/manager/${userId}`)
      : Promise.resolve([]);

    Promise.all([leadFetch, managerFetch])
      .then(([leadData, managerData]) => {
        const combined = [
          ...(Array.isArray(leadData)    ? leadData    : []),
          ...(Array.isArray(managerData) ? managerData : []),
        ];
        const seen = new Set();
        const deduped = combined.filter((ts) => {
          const id = ts._id || ts.id;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        setApprovals(deduped);
      })
      .catch((err) => alert(`Failed to load approvals: ${err.message}`))
      .finally(() => setLoading(false));
  }, [userId, role]);

  useEffect(() => { loadApprovals(); }, [loadApprovals]);

  // Auto-refresh when the browser tab becomes visible again
  // (e.g. lead switches back after employee has resubmitted)
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') loadApprovals(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadApprovals]);

  const filtered = approvals.filter((a) => {
    const name  = (a.employee_name  || '').toLowerCase();
    const email = (a.employee_email || '').toLowerCase();
    const q     = searchTerm.toLowerCase();
    const matchSearch = name.includes(q) || email.includes(q);
    const matchStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchSearch && matchStatus && timesheetHasEntryType(a, typeFilter) && isTimesheetInRange(a, dateRange);
  });

  const pendingCount  = approvals.filter((a) => ['pending_lead', 'pending_manager'].includes(a.status)).length;
  const approvedCount = approvals.filter((a) => a.status === 'approved').length;
  const pendingHours  = approvals
    .filter((a) => ['pending_lead', 'pending_manager'].includes(a.status))
    .reduce((s, a) => s + (a.total_hours || 0), 0);
  const searchSuggestions = useMemo(
    () => uniqSuggestions(approvals, ['employee_name', 'employee_email']),
    [approvals]
  );

  const handleApprove = async (id, status) => {
    if (!window.confirm('Approve this timesheet?')) return;
    setLoading(true);
    const ep = status === 'pending_manager'
      ? `/timesheets/approve/manager/${id}`
      : `/timesheets/approve/lead/${id}`;
    try {
      await fetchAPI(ep, {
        method: 'PUT',
        body: JSON.stringify({ approved_by: userId, comments: '' }),
      });
      setApprovals((p) => p.filter((a) => (a._id || a.id) !== id));
      setSelectedTimesheets((p) => p.filter((x) => x !== id));
      alert('Timesheet approved successfully');
    } catch (err) {
      alert(`Approval failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (id, status) => {
    const reason = window.prompt('Please provide a reason for rejection:');
    if (!reason?.trim()) return;
    setLoading(true);
    const ep = status === 'pending_manager'
      ? `/timesheets/reject/manager/${id}`
      : `/timesheets/reject/lead/${id}`;
    try {
      await fetchAPI(ep, {
        method: 'PUT',
        body: JSON.stringify({ rejected_by: userId, rejection_reason: reason }),
      });
      setApprovals((p) => p.map((a) =>
        (a._id || a.id) === id
          ? { ...a, status: status === 'pending_manager' ? 'rejected_by_manager' : 'rejected_by_lead' }
          : a
      ));
    } catch (err) {
      alert(`Rejection failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={S.maxW}>
          <div style={S.pageHeader}>
            <h1 style={S.pageTitle}>Timesheet Approvals</h1>
            <p style={S.pageSub}>Review and action your direct reports' timesheets</p>
          </div>

          <div style={S.statsGrid}>
            {[
              { label: 'Pending Review', value: pendingCount,        sub: 'Awaiting your action', Icon: Clock,       color: C.text  },
              { label: 'Approved',       value: approvedCount,       sub: 'This period',           Icon: CheckCircle, color: C.green },
              { label: 'Hours Pending',  value: `${pendingHours}h`,  sub: 'Awaiting approval',     Icon: TrendingUp,  color: C.text  },
              { label: 'Your Role',      value: role || 'Lead',      sub: 'Approval authority',    Icon: UserCheck,   color: C.text  },
            ].map(({ label, value, sub, Icon, color }) => (
              <div key={label} style={S.statCard}>
                <div style={S.statRow}>
                  <span style={S.statLabel}>{label}</span>
                  <Icon size={18} style={{ color: C.purpleMid }} />
                </div>
                <div style={{ ...S.statValue, color }}>{value}</div>
                <div style={S.statSub}>{sub}</div>
              </div>
            ))}
          </div>

          <div className="mte-history-card mte-manager-filter-card">
            <div className="mte-history-filterbar mte-manager-filterbar">
              <div className="mte-history-filter-search">
                <ValueHelpSearch
                  value={searchTerm}
                  onChange={setSearchTerm}
                  suggestions={searchSuggestions}
                  placeholder="Search name or email"
                  style={{ width: '100%' }}
                />
              </div>
              <SelectWrap
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ width: '100%', minWidth: 0 }}
              >
                  <option value="all">All Statuses</option>
                  <option value="pending_lead">Pending Approval</option>
                  <option value="pending_manager">Pending Manager (Legacy)</option>
                  <option value="approved">Approved</option>
                  <option value="rejected_by_lead">Rejected</option>
                  <option value="rejected_by_manager">Rejected by Manager (Legacy)</option>
              </SelectWrap>
              <SelectWrap
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{ width: '100%', minWidth: 0 }}
              >
                  <option value="all">All Types</option>
                  <option value="work">Work</option>
                  <option value="holiday">Holiday</option>
                  <option value="leave">Leave</option>
              </SelectWrap>
              <input
                className="mte-history-date-input"
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((previous) => ({ ...previous, start: e.target.value }))}
                title="Period from"
              />
              <input
                className="mte-history-date-input"
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((previous) => ({ ...previous, end: e.target.value }))}
                title="Period to"
              />
              <button type="button" onClick={loadApprovals} className="mte-manager-filter-button" title="Refresh">
                <RefreshCw size={14} />
              </button>
              {selectedTimesheets.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const selected = approvals.filter((a) => selectedTimesheets.includes(a._id || a.id));
                    selected.forEach((a) => handleApprove(a._id || a.id, a.status));
                  }}
                  className="mte-manager-filter-button is-primary"
                >
                  <CheckCircle size={14} />
                  <span>Approve ({selectedTimesheets.length})</span>
                </button>
              )}
            </div>
          </div>

          {pendingCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 16px', borderRadius: '6px', marginBottom: '20px', border: `1px solid ${C.purpleBorder}`, background: C.purpleLight }}>
              <AlertCircle size={16} style={{ color: C.purple, flexShrink: 0, marginTop: '1px' }} />
              <div>
                <p style={{ fontSize: '13px', fontWeight: '600', color: C.purple, margin: '0 0 2px 0' }}>
                  {pendingCount} timesheet{pendingCount !== 1 ? 's' : ''} pending your approval
                </p>
                <p style={{ fontSize: '12px', color: C.textMid, margin: 0 }}>
                  Please review promptly to ensure timely payroll processing
                </p>
              </div>
            </div>
          )}

          <div style={{ ...S.card, overflow: 'hidden', marginBottom: '20px' }}>
            <div style={S.tableScroll}>
              <table style={{ ...S.table, minWidth: '850px' }}>
                <thead style={S.thead}>
                  <tr>
                    <th style={S.th}></th>
                    {['Employee', 'Period', 'Total Hours', 'Submitted', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={
                        h === 'Total Hours'                     ? S.thRight
                        : h === 'Status' || h === 'Actions'    ? S.thCenter
                        : S.th
                      }>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} style={{ ...S.tdMid, textAlign: 'center', padding: '40px' }}>Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={7} style={{ ...S.tdMid, textAlign: 'center', padding: '40px' }}>No timesheets found</td></tr>
                  ) : filtered.map((a, i) => {
                    const id        = a._id || a.id;
                    const isPending = ['pending_lead', 'pending_manager'].includes(a.status);
                    const period    = a.period_start && a.period_end
                      ? `${format(new Date(a.period_start), 'MMM d')} – ${format(new Date(a.period_end), 'MMM d, yyyy')}`
                      : '—';
                    return (
                      <tr key={id} style={i % 2 === 0 ? S.trEven : S.trOdd}>
                        <td style={S.td}>
                          {isPending && (
                            <input
                              type="checkbox"
                              checked={selectedTimesheets.includes(id)}
                              onChange={() =>
                                setSelectedTimesheets((p) =>
                                  p.includes(id) ? p.filter((x) => x !== id) : [...p, id]
                                )
                              }
                              style={{ width: '15px', height: '15px' }}
                            />
                          )}
                        </td>
                        <td style={S.td}>
                          <div style={{ fontWeight: '500' }}>{a.employee_name}</div>
                          <div style={{ fontSize: '12px', color: C.textMid }}>{a.employee_email}</div>
                        </td>
                        <td style={S.td}>{period}</td>
                        <td style={S.tdRight}><strong>{a.total_hours || 0}h</strong></td>
                        <td style={S.tdMid}>
                          {a.submitted_at ? format(new Date(a.submitted_at), 'MMM d, yyyy') : '—'}
                        </td>
                        <td style={S.tdCenter}><StatusBadge status={a.status} /></td>
                        <td style={S.tdCenter}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              style={{ ...S.btnIcon, color: C.purple }}
                              title="View full timesheet"
                              onClick={async () => {
                                try {
                                  const full = await fetchAPI(`/timesheets/${id}`);
                                  setViewingTimesheet(full);
                                  // FIX: update the list entry with fresh total_hours
                                  if (full && full.total_hours !== undefined) {
                                    setApprovals((prev) => prev.map((ts) =>
                                      (ts._id || ts.id) === id
                                        ? { ...ts, total_hours: full.total_hours }
                                        : ts
                                    ));
                                  }
                                } catch (_) {
                                  setViewingTimesheet(a);
                                }
                                setFullPageView(true);
                              }}
                            >
                              <Eye size={15} />
                            </button>
                            {isPending && (
                              <>
                                <button
                                  onClick={() => handleApprove(id, a.status)}
                                  disabled={loading}
                                  style={{ ...S.btnIcon, color: C.green }}
                                  title="Approve"
                                >
                                  <CheckCircle size={15} />
                                </button>
                                <button
                                  onClick={() => handleReject(id, a.status)}
                                  disabled={loading}
                                  style={{ ...S.btnIcon, color: C.red }}
                                  title="Reject"
                                >
                                  <XCircle size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {viewingTimesheet && fullPageView ? (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: C.bg, overflowY: 'auto' }}>
              <TimesheetFullPageView
                timesheet={viewingTimesheet}
                user={user}
                ccLookup={ccLookup}
                onClose={() => { setViewingTimesheet(null); setFullPageView(false); }}
                onApprove={async () => {
                  const id = viewingTimesheet._id || viewingTimesheet.id;
                  if (!window.confirm('Approve this timesheet?')) return;
                  try {
                    const ep = viewingTimesheet.status === 'pending_manager'
                      ? `/timesheets/approve/manager/${id}`
                      : `/timesheets/approve/lead/${id}`;
                    await fetchAPI(ep, {
                      method: 'PUT',
                      body: JSON.stringify({ approved_by: userId, comments: '' }),
                    });
                    alert('Timesheet approved successfully');
                    setViewingTimesheet(null);
                    setFullPageView(false);
                    loadApprovals();
                  } catch (err) {
                    alert(`Approval failed: ${err.message}`);
                  }
                }}
                onReject={async () => {
                  const id = viewingTimesheet._id || viewingTimesheet.id;
                  const reason = window.prompt('Please provide a reason for rejection:');
                  if (!reason?.trim()) return;
                  try {
                    const ep = viewingTimesheet.status === 'pending_manager'
                      ? `/timesheets/reject/manager/${id}`
                      : `/timesheets/reject/lead/${id}`;
                    await fetchAPI(ep, {
                      method: 'PUT',
                      body: JSON.stringify({ rejected_by: userId, rejection_reason: reason }),
                    });
                    alert('Timesheet rejected');
                    setViewingTimesheet(null);
                    setFullPageView(false);
                    loadApprovals();
                  } catch (err) {
                    alert(`Rejection failed: ${err.message}`);
                  }
                }}
              />
            </div>
          ) : viewingTimesheet ? (
            <TimesheetDetailModal
              timesheet={viewingTimesheet}
              ccLookup={ccLookup}
              onClose={() => setViewingTimesheet(null)}
            />
          ) : null}

          <div style={S.infoBox}>
            <p style={S.infoTitle}>Approval Guidelines</p>
            <ul style={S.infoList}>
              {[
                'You are the sole approver for your direct reports\' timesheets',
                'Review each timesheet for accuracy and completeness before approving',
                'Use the bulk approve checkbox to action multiple timesheets at once',
                'Rejected timesheets are returned to the employee for revision',
                'Aim to approve within 2 business days of submission',
              ].map((t, i) => <li key={i} style={S.infoItem}>• {t}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── History ──────────────────────────────────────────────────────────────────
function History({ user, onNavigate }) {
  const [searchQuery,      setSearchQuery]      = useState('');
  const [statusFilter,     setStatusFilter]     = useState('all');
  const [typeFilter,       setTypeFilter]       = useState('all');
  const [dateRange,        setDateRange]        = useState(blankDateRange);
  const [submissions,      setSubmissions]      = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [viewingTimesheet, setViewingTimesheet] = useState(null);

  const ccLookup = useCcLookup();
  const userId = getUserId(user);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetchAPI(`/timesheets/employee/${userId}`)
      .then((d) => setSubmissions(Array.isArray(d) ? d : []))
      .catch((err) => alert(`Failed to load history: ${err.message}`))
      .finally(() => setLoading(false));
  }, [userId]);

  const approved          = submissions.filter((s) => s.status === 'approved');
  const rejected          = submissions.filter((s) => s.status?.startsWith('rejected'));
  const totalApprovedHrs  = approved.reduce((s, x) => s + (x.total_hours || 0), 0);
  const rate              = submissions.length > 0
    ? Math.round((approved.length / submissions.length) * 100) : 0;

  const filtered = submissions.filter((s) => {
    const period = s.period_start
      ? `${format(new Date(s.period_start), 'MMM d')} – ${format(new Date(s.period_end), 'MMM d, yyyy')}`
      : '';
    const q = searchQuery.toLowerCase();
    const matchSearch = period.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'all'
      || (statusFilter === 'pending'  && ['pending_lead', 'pending_manager'].includes(s.status))
      || (statusFilter === 'approved' && s.status === 'approved')
      || (statusFilter === 'rejected' && s.status?.startsWith('rejected'));
    return matchSearch && matchStatus && timesheetHasEntryType(s, typeFilter) && isTimesheetInRange(s, dateRange);
  });
  const searchSuggestions = useMemo(
    () => uniqSuggestions(submissions, [
      (item) => item.period_start
        ? `${format(new Date(item.period_start), 'MMM d')} - ${format(new Date(item.period_end), 'MMM d, yyyy')}`
        : '',
    ]),
    [submissions]
  );

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={S.maxW}>
          <div style={S.pageHeader}>
            <h1 style={S.pageTitle}>Timesheet History</h1>
            <p style={S.pageSub}>View and download your past timesheet submissions</p>
          </div>

          <div style={S.statsGrid}>
            {[
              { label: 'Total Submissions', value: submissions.length, sub: 'All time',                Icon: Calendar,    color: C.text  },
              { label: 'Approved',          value: approved.length,    sub: `${rate}% approval rate`,  Icon: CheckCircle2, color: C.green },
              { label: 'Rejected',          value: rejected.length,    sub: 'Needs resubmission',       Icon: XCircle,     color: C.red   },
              { label: 'Approved Hours',    value: `${totalApprovedHrs}h`, sub: 'Total logged',         Icon: Clock,       color: C.text  },
            ].map(({ label, value, sub, Icon, color }) => (
              <div key={label} style={S.statCard}>
                <div style={S.statRow}>
                  <span style={S.statLabel}>{label}</span>
                  <Icon size={18} style={{ color: C.purpleMid }} />
                </div>
                <div style={{ ...S.statValue, color }}>{value}</div>
                <div style={S.statSub}>{sub}</div>
              </div>
            ))}
          </div>

          <div className="mte-history-card">
            <div className="mte-history-filterbar">
              <div className="mte-history-filter-search">
                <ValueHelpSearch
                  value={searchQuery}
                  onChange={setSearchQuery}
                  suggestions={searchSuggestions}
                  placeholder="Search period"
                  style={{ width: '100%' }}
                />
              </div>
              <SelectWrap
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ width: '100%', minWidth: 0 }}
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </SelectWrap>
              <SelectWrap
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{ width: '100%', minWidth: 0 }}
              >
                <option value="all">All Types</option>
                <option value="work">Work</option>
                <option value="holiday">Holiday</option>
                <option value="leave">Leave</option>
              </SelectWrap>
              <input
                className="mte-history-date-input"
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((previous) => ({ ...previous, start: e.target.value }))}
                title="Period from"
              />
              <input
                className="mte-history-date-input"
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((previous) => ({ ...previous, end: e.target.value }))}
                title="Period to"
              />
            </div>

            <div style={S.tableScroll}>
              <table style={{ ...S.table, minWidth: '700px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Period', 'Total Hours', 'Submitted', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={{
                        padding: '10px 16px', textAlign: 'left', fontSize: '12px',
                        fontWeight: '600', color: C.textMid,
                        textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} style={{ ...S.tdMid, textAlign: 'center', padding: '40px' }}>Loading history…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={5} style={{ ...S.tdMid, textAlign: 'center', padding: '40px' }}>No submissions found</td></tr>
                  ) : filtered.map((s, i) => {
                    const period     = s.period_start && s.period_end
                      ? `${format(new Date(s.period_start), 'MMM d')} – ${format(new Date(s.period_end), 'MMM d, yyyy')}`
                      : '—';
                    return (
                      <tr key={s._id || s.id} style={i % 2 === 0 ? S.trEven : S.trOdd}>
                        <td style={S.td}><strong>{period}</strong></td>
                        <td style={S.td}><strong>{s.total_hours || 0}h</strong></td>
                        <td style={S.tdMid}>
                          {s.submitted_at ? format(new Date(s.submitted_at), 'MMM d, yyyy') : '—'}
                        </td>
                        <td style={S.td}>
                          <StatusBadge status={s.status} />
                        </td>
                        <td style={S.td}>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button
                              onClick={async () => {
                                try {
                                  const full = await fetchAPI(`/timesheets/${s._id || s.id}`);
                                  setViewingTimesheet(full);
                                } catch (_) {
                                  setViewingTimesheet(s);
                                }
                              }}
                              style={{ ...S.btnSecondary, padding: '4px 10px', fontSize: '13px' }}
                            >
                              <Eye size={13} /> View
                            </button>
                            <button
                              onClick={() => {
                                const rows = (s.entries || []).map((e) => {
                                  const looked = ccLookup[e.charge_code_id] || ccLookup[e.charge_code] || {};
                                  const code  = e.charge_code      || looked.code || '';
                                  const cname = e.charge_code_name || looked.name || '';
                                  return buildCsvRow([
                                    s.employee_name  || user?.name  || '',
                                    s.employee_email || user?.email || '',
                                    s.period_start,
                                    s.period_end,
                                    e.date,
                                    e.entry_type,
                                    code,
                                    cname,
                                    e.hours || 0,
                                    e.description || '',
                                  ]);
                                });
                                const header = buildCsvRow(['Employee Name','Email','Period Start','Period End','Date','Type','Charge Code','Charge Code Name','Hours','Description']);
                                const csv    = [header, ...rows].join('\n');
                                const blob   = new Blob([csv], { type: 'text/csv' });
                                const url    = URL.createObjectURL(blob);
                                const a      = document.createElement('a');
                                a.href       = url;
                                a.download   = `timesheet_${s.period_start}_${s.period_end}.csv`;
                                a.click();
                                URL.revokeObjectURL(url);
                              }}
                              style={{ ...S.btnIcon, border: `1px solid ${C.border}`, borderRadius: '5px' }}
                            >
                              <Download size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {viewingTimesheet && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: '#f8f8f8', overflowY: 'auto' }}>
          <TimesheetFullPageView
            timesheet={viewingTimesheet}
            user={user}
            ccLookup={ccLookup}
            onClose={() => setViewingTimesheet(null)}
            onApprove={null}
            onReject={null}
            onNavigate={onNavigate}
          />
        </div>
      )}
    </div>
  );
}

// ─── Reports ──────────────────────────────────────────────────────────────────
const PIE_COLORS = [C.purple, C.purpleMid, '#a89db5', '#c5bfd1', '#e0dae6'];

// eslint-disable-next-line no-unused-vars
function Reports({ user }) {
  const userId = getUserId(user);

  const [dateRange,  setDateRange]  = useState({
    start: format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd'),
    end:   format(endOfMonth(new Date()), 'yyyy-MM-dd'),
  });
  const [timesheets, setTimesheets] = useState([]);
  const [loading,    setLoading]    = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetchAPI(`/timesheets/employee/${userId}`)
      .then((d) => setTimesheets(Array.isArray(d) ? d : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  const inRange = timesheets.filter((ts) => {
    if (ts.status !== 'approved') return false;
    const ps = ts.period_start || '';
    const pe = ts.period_end   || '';
    return ps >= dateRange.start && pe <= dateRange.end;
  });

  const monthlyMap = {};
  inRange.forEach((ts) => {
    const monthKey = ts.period_start ? format(new Date(ts.period_start), 'MMM yy') : 'Unknown';
    if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { month: monthKey, hours: 0, leave: 0 };
    if (Array.isArray(ts.entries)) {
      ts.entries.forEach((e) => {
        if (e.entry_type === 'holiday') return;
        monthlyMap[monthKey].hours += e.hours || 0;
      });
    } else {
      monthlyMap[monthKey].hours += ts.total_hours || 0;
    }
  });
  const monthlyData = Object.values(monthlyMap);

  const ccMap = {};
  inRange.forEach((ts) => {
    if (!Array.isArray(ts.entries)) return;
    ts.entries.forEach((e) => {
      if (e.entry_type !== 'work') return;
      const key = e.charge_code || e.charge_code_id || 'Unknown';
      if (!ccMap[key]) ccMap[key] = { code: key, name: key, hours: 0 };
      ccMap[key].hours += e.hours || 0;
    });
  });
  const ccData     = Object.values(ccMap).sort((a, b) => b.hours - a.hours);
  const totalHours = ccData.reduce((s, i) => s + i.hours, 0);
  const pieData    = ccData.map((c) => ({ project: c.code, hours: c.hours }));

  const totalApproved = inRange.reduce((s, ts) => s + (ts.total_hours || 0), 0);
  const weekCount     = monthlyData.length * 4 || 1;
  const avgPerWeek    = (totalApproved / weekCount).toFixed(1);
  const isEmpty       = !loading && inRange.length === 0;

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={S.maxW}>
          <div style={S.pageHeader}>
            <h1 style={S.pageTitle}>Reports & Analytics</h1>
            <p style={S.pageSub}>Your approved timesheet data for the selected date range</p>
          </div>

          <div style={{ ...S.card, ...S.cardPadSm, marginBottom: '20px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', minWidth: 'max-content' }}>
              <div style={S.rowGap4}>
                <Calendar size={15} style={{ color: C.textMid }} />
                <span style={{ fontSize: '13px', color: C.textMid }}>Date Range:</span>
                <input type="date" value={dateRange.start} onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })} style={S.input} />
                <span style={{ color: C.textMid }}>to</span>
                <input type="date" value={dateRange.end} onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })} style={S.input} />
              </div>
              <button onClick={() => alert('Export coming soon')} style={S.btnPrimary}>
                <Download size={14} /> Export Report
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: C.textMid }}>
              <div style={{ fontSize: '14px' }}>Loading report data…</div>
            </div>
          ) : isEmpty ? (
            <div style={{ ...S.card, ...S.cardPad, textAlign: 'center', padding: '60px 20px' }}>
              <BarChart3 size={40} style={{ color: C.purpleBorder, marginBottom: '12px' }} />
              <p style={{ fontSize: '16px', fontWeight: '500', color: C.text, margin: '0 0 8px 0' }}>
                No approved timesheets in this date range
              </p>
              <p style={{ fontSize: '14px', color: C.textMid, margin: 0 }}>
                Submit and get timesheets approved to see your analytics here.
              </p>
            </div>
          ) : (
            <>
              <div style={S.statsGrid}>
                {[
                  { label: 'Total Hours',       value: `${totalApproved}h`, sub: 'Approved hours',      Icon: Clock      },
                  { label: 'Avg / Week',         value: `${avgPerWeek}h`,    sub: 'Weekly average',      Icon: TrendingUp },
                  { label: 'Charge Codes Used',  value: ccData.length,       sub: 'Unique codes',        Icon: FileText   },
                  { label: 'Periods',            value: inRange.length,      sub: 'Approved timesheets', Icon: BarChart3  },
                ].map(({ label, value, sub, Icon }) => (
                  <div key={label} style={S.statCard}>
                    <div style={S.statRow}><span style={S.statLabel}>{label}</span><Icon size={18} style={{ color: C.purpleMid }} /></div>
                    <div style={S.statValue}>{value}</div>
                    <div style={S.statSub}>{sub}</div>
                  </div>
                ))}
              </div>

              {monthlyData.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                  <div style={{ ...S.card, padding: '20px' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: C.text, margin: '0 0 16px 0' }}>Monthly Hours Trend</h3>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} />
                        <XAxis dataKey="month" stroke={C.textMid} tick={{ fontSize: 12 }} />
                        <YAxis stroke={C.textMid} tick={{ fontSize: 12 }} />
                        <Tooltip contentStyle={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '13px' }} />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Bar dataKey="hours" fill={C.purple} name="Work Hours"  radius={[3, 3, 0, 0]} />
                        <Bar dataKey="leave" fill="#c5bfd1"  name="Leave Hours" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {pieData.length > 0 && (
                    <div style={{ ...S.card, padding: '20px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', color: C.text, margin: '0 0 16px 0' }}>Time by Charge Code</h3>
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="hours"
                            label={({ name, value }) => `${name}: ${value}h`} labelLine={false}>
                            {pieData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '4px', fontSize: '13px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}

              {ccData.length > 0 && (
                <div style={{ ...S.card, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: C.text, margin: '0 0 4px 0' }}>Hours by Charge Code</h3>
                    <p style={{ fontSize: '13px', color: C.textMid, margin: 0 }}>Breakdown of your approved work hours</p>
                  </div>
                  <div style={S.tableScroll}>
                    <table style={{ ...S.table, minWidth: '500px' }}>
                      <thead style={S.thead}>
                        <tr>
                          {['Code', 'Total Hours', 'Percentage'].map((h, i) => (
                            <th key={h} style={i >= 1 ? S.thRight : S.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ccData.map((item, i) => (
                          <tr key={item.code} style={i % 2 === 0 ? S.trEven : S.trOdd}>
                            <td style={{ ...S.td, fontWeight: '500', color: C.purple }}>{item.code}</td>
                            <td style={S.tdRight}><strong>{item.hours}h</strong></td>
                            <td style={S.tdRight}>
                              {totalHours > 0 ? ((item.hours / totalHours) * 100).toFixed(1) : '0'}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: C.totalBg, borderTop: `2px solid ${C.totalBorder}` }}>
                          <td style={{ padding: '12px 16px', fontWeight: '600', color: C.purple }}>Total</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: C.purple }}>{totalHours}h</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', color: C.purple }}>100%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TeamTimesheets ───────────────────────────────────────────────────────────
function TeamTimesheets({ user }) {
  const [timesheets,       setTimesheets]       = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [searchTerm,       setSearchTerm]       = useState('');
  const [statusFilter,     setStatusFilter]     = useState('all');
  const [typeFilter,       setTypeFilter]       = useState('all');
  const [dateRange,        setDateRange]        = useState(blankDateRange);
  const [viewingTimesheet, setViewingTimesheet] = useState(null);

  const ccLookup  = useCcLookup();
  const userEmail = user?.email;
  const userId = getUserId(user);

  const loadTeamTimesheets = useCallback(() => {
    if (!userEmail) return;
    setLoading(true);
    fetchAPI(`/timesheets/team/${userEmail}`)
      .then((d) => setTimesheets(Array.isArray(d) ? d : []))
      .catch((err) => { console.error(err); setTimesheets([]); })
      .finally(() => setLoading(false));
  }, [userEmail]);

  useEffect(() => {
    loadTeamTimesheets();
  }, [loadTeamTimesheets]);

  const handleApprove = async (timesheet) => {
    const id = timesheet?._id || timesheet?.id;
    if (!id || !window.confirm('Approve this timesheet?')) return;
    const ep = timesheet.status === 'pending_manager'
      ? `/timesheets/approve/manager/${id}`
      : `/timesheets/approve/lead/${id}`;
    setLoading(true);
    try {
      await fetchAPI(ep, {
        method: 'PUT',
        body: JSON.stringify({ approved_by: userId, comments: '' }),
      });
      alert('Timesheet approved successfully');
      setViewingTimesheet(null);
      loadTeamTimesheets();
    } catch (err) {
      alert(`Approval failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (timesheet) => {
    const id = timesheet?._id || timesheet?.id;
    const reason = window.prompt('Please provide a reason for rejection:');
    if (!id || !reason?.trim()) return;
    const ep = timesheet.status === 'pending_manager'
      ? `/timesheets/reject/manager/${id}`
      : `/timesheets/reject/lead/${id}`;
    setLoading(true);
    try {
      await fetchAPI(ep, {
        method: 'PUT',
        body: JSON.stringify({ rejected_by: userId, rejection_reason: reason }),
      });
      alert('Timesheet rejected');
      setViewingTimesheet(null);
      loadTeamTimesheets();
    } catch (err) {
      alert(`Rejection failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filtered = timesheets.filter((ts) => {
    const name  = (ts.employee_name  || '').toLowerCase();
    const email = (ts.employee_email || '').toLowerCase();
    const q     = searchTerm.toLowerCase();
    return (name.includes(q) || email.includes(q))
      && (statusFilter === 'all' || ts.status === statusFilter)
      && timesheetHasEntryType(ts, typeFilter)
      && isTimesheetInRange(ts, dateRange);
  });

  const stats = {
    total:    timesheets.length,
    pending:  timesheets.filter((t) => t.status?.startsWith('pending')).length,
    approved: timesheets.filter((t) => t.status === 'approved').length,
    rejected: timesheets.filter((t) => t.status?.startsWith('rejected')).length,
  };
  const searchSuggestions = useMemo(
    () => uniqSuggestions(timesheets, ['employee_name', 'employee_email']),
    [timesheets]
  );

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={S.maxW}>
          <div style={S.pageHeader}>
            <h1 style={S.pageTitle}>Team Timesheets</h1>
            <p style={S.pageSub}>View timesheets from your direct reports</p>
          </div>

          <div style={S.statsGrid}>
            {[
              { label: 'Total',    value: stats.total,    sub: 'All time',          Icon: FileText    },
              { label: 'Pending',  value: stats.pending,  sub: 'Awaiting approval', Icon: Clock       },
              { label: 'Approved', value: stats.approved, sub: 'Completed',         Icon: CheckCircle },
              { label: 'Rejected', value: stats.rejected, sub: 'Needs revision',    Icon: XCircle     },
            ].map(({ label, value, sub, Icon }) => (
              <div key={label} style={S.statCard}>
                <div style={S.statRow}><span style={S.statLabel}>{label}</span><Icon size={18} style={{ color: C.purpleMid }} /></div>
                <div style={S.statValue}>{value}</div>
                <div style={S.statSub}>{sub}</div>
              </div>
            ))}
          </div>

          <div className="mte-history-card mte-manager-filter-card">
            <div className="mte-history-filterbar mte-manager-filterbar">
              <div className="mte-history-filter-search">
              <ValueHelpSearch
                value={searchTerm}
                onChange={setSearchTerm}
                suggestions={searchSuggestions}
                placeholder="Search employee or email"
                style={{ width: '100%' }}
              />
              </div>
              <SelectWrap
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ width: '100%', minWidth: 0 }}
              >
                <option value="all">All Statuses</option>
                <option value="pending_lead">Pending Approval</option>
                <option value="pending_manager">Pending Manager (Legacy)</option>
                <option value="approved">Approved</option>
                <option value="rejected_by_lead">Rejected</option>
                <option value="rejected_by_manager">Rejected by Manager (Legacy)</option>
              </SelectWrap>
              <SelectWrap
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                style={{ width: '100%', minWidth: 0 }}
              >
                <option value="all">All Types</option>
                <option value="work">Work</option>
                <option value="holiday">Holiday</option>
                <option value="leave">Leave</option>
              </SelectWrap>
              <input
                className="mte-history-date-input"
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((previous) => ({ ...previous, start: e.target.value }))}
                title="Period from"
              />
              <input
                className="mte-history-date-input"
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((previous) => ({ ...previous, end: e.target.value }))}
                title="Period to"
              />
            </div>
          </div>

          <div style={{ ...S.card, overflow: 'hidden' }}>
            <div style={S.tableScroll}>
              <table style={{ ...S.table, minWidth: '650px' }}>
                <thead style={S.thead}>
                  <tr>
                    {['Employee', 'Period', 'Total Hours', 'Submitted', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={
                        h === 'Total Hours'                  ? S.thRight
                        : h === 'Status' || h === 'Actions' ? S.thCenter
                        : S.th
                      }>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={6} style={{ ...S.tdMid, textAlign: 'center', padding: '40px' }}>Loading…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={6} style={{ ...S.tdMid, textAlign: 'center', padding: '40px' }}>No timesheets found</td></tr>
                  ) : filtered.map((ts, i) => {
                    const isPending = ['pending_lead', 'pending_manager'].includes(ts.status);
                    const period = ts.period_start && ts.period_end
                      ? `${format(new Date(ts.period_start), 'MMM d')} – ${format(new Date(ts.period_end), 'MMM d, yyyy')}`
                      : '—';
                    return (
                      <tr key={ts._id} style={i % 2 === 0 ? S.trEven : S.trOdd}>
                        <td style={S.td}>
                          <div style={{ fontWeight: '500' }}>{ts.employee_name}</div>
                          <div style={{ fontSize: '12px', color: C.textMid }}>{ts.employee_email}</div>
                        </td>
                        <td style={S.td}>{period}</td>
                        <td style={S.tdRight}><strong>{ts.total_hours || 0}h</strong></td>
                        <td style={S.tdMid}>
                          {ts.submitted_at ? format(new Date(ts.submitted_at), 'MMM d, yyyy') : '—'}
                        </td>
                        <td style={S.tdCenter}><StatusBadge status={ts.status} /></td>
                        <td style={S.tdCenter}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                            <button
                              onClick={async () => {
                                try {
                                  const full = await fetchAPI(`/timesheets/${ts._id}`);
                                  setViewingTimesheet(full);
                                } catch (_) {
                                  setViewingTimesheet(ts);
                                }
                              }}
                              style={S.btnIcon}
                              title="View full timesheet"
                            >
                              <Eye size={15} />
                            </button>
                            {isPending && (
                              <>
                                <button
                                  onClick={() => handleApprove(ts)}
                                  disabled={loading}
                                  style={{ ...S.btnIcon, color: C.green }}
                                  title="Approve"
                                >
                                  <CheckCircle size={15} />
                                </button>
                                <button
                                  onClick={() => handleReject(ts)}
                                  disabled={loading}
                                  style={{ ...S.btnIcon, color: C.red }}
                                  title="Reject"
                                >
                                  <XCircle size={15} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      {viewingTimesheet && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: C.bg, overflowY: 'auto' }}>
          <TimesheetFullPageView
            timesheet={viewingTimesheet}
            user={user}
            ccLookup={ccLookup}
            onClose={() => setViewingTimesheet(null)}
            onApprove={['pending_lead', 'pending_manager'].includes(viewingTimesheet.status) ? () => handleApprove(viewingTimesheet) : null}
            onReject={['pending_lead', 'pending_manager'].includes(viewingTimesheet.status) ? () => handleReject(viewingTimesheet) : null}
          />
        </div>
      )}
    </div>
  );
}

const getLeadApprovalMeta = (timesheet) => {
  const history = Array.isArray(timesheet?.approval_history) ? timesheet.approval_history : [];
  const leadApproval = [...history]
    .reverse()
    .find((entry) => entry.stage === 'lead' && entry.action === 'approved');

  return {
    name: leadApproval?.approver_name || timesheet?.lead_approved_by || '',
    timestamp: leadApproval?.timestamp || timesheet?.lead_approved_at || '',
  };
};

const getReportingLeadLabel = (timesheet) =>
  timesheet.reporting_lead_name
  || getLeadApprovalMeta(timesheet).name
  || 'Unassigned lead';

// ─── AdminTimesheets ──────────────────────────────────────────────────────────
function AdminTimesheets() {
  const [timesheets,       setTimesheets]       = useState([]);
  const [employees,        setEmployees]        = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [searchTerm,       setSearchTerm]       = useState('');
  const [statusFilter,     setStatusFilter]     = useState('approved');
  const [typeFilter,       setTypeFilter]       = useState('all');
  const [dateRange,        setDateRange]        = useState(blankDateRange);
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [leadFilter,       setLeadFilter]       = useState('all');
  const [groupMode,        setGroupMode]        = useState('department');
  const [viewingTimesheet, setViewingTimesheet] = useState(null);
  const [fullPageView,     setFullPageView]     = useState(false);

  const ccLookup = useCcLookup();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchAPI('/timesheets/all'),
      fetchAPI('/users/get_all_employees'),
    ])
      .then(([ts, emps]) => {
        setTimesheets(Array.isArray(ts)   ? ts   : []);
        setEmployees( Array.isArray(emps) ? emps : []);
      })
      .catch((err) => { console.error('AdminTimesheets error:', err); alert(`Failed: ${err.message}`); })
      .finally(() => setLoading(false));
  }, []);

  const filtered = timesheets.filter((ts) => {
    const name  = (ts.employee_name  || '').toLowerCase();
    const email = (ts.employee_email || '').toLowerCase();
    const department = ts.employee_department || 'Unassigned';
    const leadLabel = getReportingLeadLabel(ts).toLowerCase();
    const leadKey = ts.reporting_lead_id || getLeadApprovalMeta(ts).name || 'Unassigned';
    const q     = searchTerm.toLowerCase();
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'pending' && ts.status?.startsWith('pending'))
      || (statusFilter === 'rejected' && ts.status?.startsWith('rejected'))
      || ts.status === statusFilter;
    return (name.includes(q) || email.includes(q) || department.toLowerCase().includes(q) || leadLabel.includes(q))
      && matchesStatus
      && (selectedEmployee === 'all' || ts.employee_id === selectedEmployee)
      && (departmentFilter === 'all' || department === departmentFilter)
      && (leadFilter === 'all' || leadKey === leadFilter)
      && timesheetHasEntryType(ts, typeFilter)
      && isTimesheetInRange(ts, dateRange);
  });

  const departmentOptions = useMemo(
    () => Array.from(
      new Set(timesheets.map((item) => item.employee_department || 'Unassigned'))
    ).sort((first, second) => first.localeCompare(second)),
    [timesheets]
  );

  const leadOptions = useMemo(() => {
    const map = new Map();
    timesheets.forEach((item) => {
      const leadKey = item.reporting_lead_id || getLeadApprovalMeta(item).name || 'Unassigned';
      const label = getReportingLeadLabel(item);
      if (!map.has(leadKey)) {
        map.set(leadKey, label);
      }
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((first, second) => first.label.localeCompare(second.label));
  }, [timesheets]);

  const groupedTimesheets = useMemo(() => {
    if (groupMode === 'flat') {
      return [{ key: 'all', label: 'All filtered timesheets', items: filtered }];
    }

    const groups = new Map();
    filtered.forEach((timesheet) => {
      const key = groupMode === 'team'
        ? (timesheet.reporting_lead_id || getLeadApprovalMeta(timesheet).name || 'Unassigned')
        : (timesheet.employee_department || 'Unassigned');
      const label = groupMode === 'team'
        ? getReportingLeadLabel(timesheet)
        : (timesheet.employee_department || 'Unassigned');
      if (!groups.has(key)) {
        groups.set(key, { key, label, items: [] });
      }
      groups.get(key).items.push(timesheet);
    });

    return Array.from(groups.values())
      .sort((first, second) => first.label.localeCompare(second.label));
  }, [filtered, groupMode]);

  const stats = {
    total:    timesheets.length,
    pending:  timesheets.filter((t) => t.status?.startsWith('pending')).length,
    approved: timesheets.filter((t) => t.status === 'approved').length,
    rejected: timesheets.filter((t) => t.status?.startsWith('rejected')).length,
    approvedHours: timesheets
      .filter((t) => t.status === 'approved')
      .reduce((s, t) => s + (t.total_hours || 0), 0),
    departments: departmentOptions.length,
    leads: leadOptions.length,
  };
  const searchSuggestions = useMemo(
    () => uniqSuggestions(timesheets, ['employee_name', 'employee_email', 'employee_department', 'reporting_lead_name']),
    [timesheets]
  );
  const activeFilterCount = [
    searchTerm.trim(),
    selectedEmployee !== 'all',
    departmentFilter !== 'all',
    leadFilter !== 'all',
    statusFilter !== 'approved',
    typeFilter !== 'all',
    dateRange.start,
    dateRange.end,
  ].filter(Boolean).length;

  const resetAdminFilters = () => {
    setSearchTerm('');
    setSelectedEmployee('all');
    setDepartmentFilter('all');
    setLeadFilter('all');
    setStatusFilter('approved');
    setTypeFilter('all');
    setDateRange({ ...blankDateRange });
  };

  const renderTimesheetTable = (rows) => (
    <div style={{ ...S.card, overflow: 'hidden', marginBottom: '20px' }}>
      <div style={S.tableScroll}>
        <table style={{ ...S.table, minWidth: '1060px' }}>
          <thead style={S.thead}>
            <tr>
              {['Employee', 'Department', 'Reporting Lead', 'Period', 'Total Hours', 'Submitted', 'Status', 'Lead Approval', 'Actions'].map((h) => (
                <th key={h} style={
                  h === 'Total Hours'                  ? S.thRight
                  : h === 'Status' || h === 'Actions' ? S.thCenter
                  : S.th
                }>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ ...S.tdMid, textAlign: 'center', padding: '40px' }}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} style={{ ...S.tdMid, textAlign: 'center', padding: '40px' }}>No timesheets found</td></tr>
            ) : rows.map((ts, i) => {
              const period = ts.period_start && ts.period_end
                ? `${format(new Date(ts.period_start), 'MMM d')} – ${format(new Date(ts.period_end), 'MMM d, yyyy')}`
                : '—';
              const leadApproval = getLeadApprovalMeta(ts);
              return (
                <tr key={ts._id} style={i % 2 === 0 ? S.trEven : S.trOdd}>
                  <td style={S.td}>
                    <div style={{ fontWeight: '500' }}>{ts.employee_name}</div>
                    <div style={{ fontSize: '12px', color: C.textMid }}>{ts.employee_email}</div>
                  </td>
                  <td style={S.tdMid}>{ts.employee_department || 'Unassigned'}</td>
                  <td style={S.td}>
                    <div style={{ fontWeight: '500' }}>{getReportingLeadLabel(ts)}</div>
                    <div style={{ fontSize: '12px', color: C.textMid }}>{ts.reporting_lead_email || '—'}</div>
                  </td>
                  <td style={S.td}>{period}</td>
                  <td style={S.tdRight}><strong>{ts.total_hours || 0}h</strong></td>
                  <td style={S.tdMid}>
                    {ts.submitted_at ? format(new Date(ts.submitted_at), 'MMM d, yyyy') : '—'}
                  </td>
                  <td style={S.tdCenter}><StatusBadge status={ts.status} /></td>
                  <td style={S.td}>
                    {leadApproval.name ? (
                      <>
                        <div style={{ fontWeight: '500' }}>{leadApproval.name}</div>
                        <div style={{ fontSize: '12px', color: C.textMid }}>
                          {leadApproval.timestamp ? format(new Date(leadApproval.timestamp), 'MMM d, yyyy') : 'Date unavailable'}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: C.textMid }}>
                        {ts.status === 'pending_lead' ? `Awaiting ${getReportingLeadLabel(ts)}` : '—'}
                      </span>
                    )}
                  </td>
                  <td style={S.tdCenter}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      <button
                        onClick={async () => {
                          try {
                            const full = await fetchAPI(`/timesheets/${ts._id}`);
                            setViewingTimesheet(full);
                          } catch (_) {
                            setViewingTimesheet(ts);
                          }
                          setFullPageView(true);
                        }}
                        style={S.btnIcon}
                        title="View full timesheet"
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        onClick={() => {
                          const rows = (ts.entries || []).map(e => {
                            const looked = ccLookup[e.charge_code_id] || ccLookup[e.charge_code] || {};
                            const code  = e.charge_code      || looked.code || '';
                            const cname = e.charge_code_name || looked.name || '';
                            return buildCsvRow([
                              ts.employee_name  || '',
                              ts.employee_email || '',
                              ts.employee_department || '',
                              getReportingLeadLabel(ts),
                              leadApproval.name || '',
                              leadApproval.timestamp || '',
                              ts.period_start,
                              ts.period_end,
                              e.date,
                              e.entry_type,
                              code,
                              cname,
                              e.hours || 0,
                              e.description || '',
                            ]);
                          });
                          const header = buildCsvRow([
                            'Employee Name',
                            'Email',
                            'Department',
                            'Reporting Lead',
                            'Approved By Lead',
                            'Lead Approved At',
                            'Period Start',
                            'Period End',
                            'Date',
                            'Type',
                            'Charge Code',
                            'Charge Code Name',
                            'Hours',
                            'Description',
                          ]);
                          const csv = [header, ...rows].join('\n');
                          const blob = new Blob([csv], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `timesheet_${ts.employee_name?.replace(/\s+/g, '_')}_${ts.period_start}.csv`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        style={S.btnIcon}
                        title="Export this timesheet"
                      >
                        <Download size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  const exportFilteredTimesheets = () => {
    const rows = filtered.flatMap((timesheet) => {
      const leadApproval = getLeadApprovalMeta(timesheet);
      return (timesheet.entries || []).map((entry) => {
        const looked = ccLookup[entry.charge_code_id] || ccLookup[entry.charge_code] || {};
        const code = entry.charge_code || looked.code || '';
        const chargeCodeName = entry.charge_code_name || looked.name || '';
        return buildCsvRow([
          timesheet.employee_name || '',
          timesheet.employee_email || '',
          timesheet.employee_department || '',
          getReportingLeadLabel(timesheet),
          leadApproval.name || '',
          leadApproval.timestamp || '',
          timesheet.period_start,
          timesheet.period_end,
          entry.date,
          entry.entry_type,
          code,
          chargeCodeName,
          entry.hours || 0,
          entry.description || '',
        ]);
      });
    });

    const header = buildCsvRow([
      'Employee Name',
      'Email',
      'Department',
      'Reporting Lead',
      'Approved By Lead',
      'Lead Approved At',
      'Period Start',
      'Period End',
      'Date',
      'Type',
      'Charge Code',
      'Charge Code Name',
      'Hours',
      'Description',
    ]);
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `admin_timesheets_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={{ ...S.maxW, maxWidth: '1800px' }}>
          <div style={S.pageHeader}>
            <h1 style={S.pageTitle}>Admin Timesheet Review</h1>
            <p style={S.pageSub}>Review lead-approved employee timesheets by department or reporting team</p>
          </div>

          <div style={S.statsGrid5}>
            {[
              { label: 'Approved',    value: stats.approved,    sub: 'Lead-approved',    Icon: CheckCircle },
              { label: 'Departments', value: stats.departments, sub: 'With timesheets',  Icon: FileText    },
              { label: 'Teams',       value: stats.leads,       sub: 'Reporting leads',  Icon: UserCheck   },
              { label: 'Total Hours', value: `${stats.approvedHours}h`, sub: 'Approved only',    Icon: TrendingUp  },
              { label: 'Pending',     value: stats.pending,     sub: 'Still in queue',   Icon: Clock       },
            ].map(({ label, value, sub, Icon }) => (
              <div key={label} style={S.statCard}>
                <div style={S.statRow}><span style={S.statLabel}>{label}</span><Icon size={18} style={{ color: C.purpleMid }} /></div>
                <div style={S.statValue}>{value}</div>
                <div style={S.statSub}>{sub}</div>
              </div>
            ))}
          </div>

          <div className="mte-admin-review-filters">
            <div className="mte-admin-review-filters-head">
              <div>
                <h3>Review Filters</h3>
                <p>
                  Showing {filtered.length} of {timesheets.length} timesheets
                  {activeFilterCount ? ` with ${activeFilterCount} filter${activeFilterCount === 1 ? '' : 's'} applied` : ''}
                </p>
              </div>

              <div className="mte-admin-review-view" role="group" aria-label="Timesheet review view">
                {[
                  { key: 'department', label: 'Department-wise', Icon: Building2 },
                  { key: 'team', label: 'Team-wise', Icon: Users },
                  { key: 'flat', label: 'Flat table', Icon: LayoutGrid },
                ].map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    className={groupMode === key ? 'is-active' : ''}
                    onClick={() => setGroupMode(key)}
                    aria-pressed={groupMode === key}
                  >
                    <Icon size={14} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mte-admin-review-filter-grid">
              <label className="mte-admin-review-filter-field mte-admin-review-filter-search">
                <span>Search</span>
                <ValueHelpSearch
                  value={searchTerm}
                  onChange={setSearchTerm}
                  suggestions={searchSuggestions}
                  placeholder="Employee, email, department, or lead"
                />
              </label>

              <label className="mte-admin-review-filter-field">
                <span>Employee</span>
                <SelectWrap value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} style={{ width: '100%' }}>
                  <option value="all">All Employees</option>
                  {employees.map((e) => (
                    <option key={e._id} value={e._id}>{e.name}</option>
                  ))}
                </SelectWrap>
              </label>

              <label className="mte-admin-review-filter-field">
                <span>Department</span>
                <SelectWrap value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} style={{ width: '100%' }}>
                  <option value="all">All Departments</option>
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </SelectWrap>
              </label>

              <label className="mte-admin-review-filter-field">
                <span>Lead</span>
                <SelectWrap value={leadFilter} onChange={(e) => setLeadFilter(e.target.value)} style={{ width: '100%' }}>
                  <option value="all">All Leads</option>
                  {leadOptions.map((lead) => (
                    <option key={lead.value} value={lead.value}>{lead.label}</option>
                  ))}
                </SelectWrap>
              </label>

              <label className="mte-admin-review-filter-field">
                <span>Status</span>
                <SelectWrap value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: '100%' }}>
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </SelectWrap>
              </label>

              <label className="mte-admin-review-filter-field">
                <span>Entry Type</span>
                <SelectWrap value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: '100%' }}>
                  <option value="all">All Types</option>
                  <option value="work">Work</option>
                  <option value="holiday">Holiday</option>
                  <option value="leave">Leave</option>
                </SelectWrap>
              </label>

              <label className="mte-admin-review-filter-field">
                <span>Period From</span>
                <input
                  type="date"
                  value={dateRange.start}
                  onChange={(e) => setDateRange((previous) => ({ ...previous, start: e.target.value }))}
                  className="mte-admin-review-date"
                />
              </label>

              <label className="mte-admin-review-filter-field">
                <span>Period To</span>
                <input
                  type="date"
                  value={dateRange.end}
                  onChange={(e) => setDateRange((previous) => ({ ...previous, end: e.target.value }))}
                  className="mte-admin-review-date"
                />
              </label>

              <div className="mte-admin-review-actions">
                <button type="button" className="mte-admin-review-btn" onClick={resetAdminFilters}>
                  <RefreshCw size={14} />
                  <span>Reset</span>
                </button>
                <button type="button" className="mte-admin-review-btn is-primary" onClick={exportFilteredTimesheets}>
                  <Download size={14} />
                  <span>Export</span>
                </button>
              </div>
            </div>
          </div>

          {groupedTimesheets.length === 0 ? (
            renderTimesheetTable([])
          ) : (
            groupedTimesheets.map((group) => (
              <section key={group.key} style={{ marginBottom: '20px' }}>
                {groupMode !== 'flat' ? (
                  <div style={{ ...S.card, ...S.cardPadSm, marginBottom: '10px' }}>
                    <div style={S.rowBetween}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: C.text }}>{group.label}</div>
                        <div style={{ fontSize: '12px', color: C.textMid }}>
                          {group.items.length} timesheet{group.items.length !== 1 ? 's' : ''} ·{' '}
                          {group.items.reduce((sum, item) => sum + (item.total_hours || 0), 0)}h
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                {renderTimesheetTable(group.items)}
              </section>
            ))
          )}

          {viewingTimesheet && fullPageView && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: C.bg, overflowY: 'auto' }}>
              <TimesheetFullPageView
                timesheet={viewingTimesheet}
                user={{ role: 'Admin' }}
                ccLookup={ccLookup}
                onClose={() => { setViewingTimesheet(null); setFullPageView(false); }}
                onApprove={null}
                onReject={null}
              />
            </div>
          )}

          <div style={S.infoBox}>
            <p style={S.infoTitle}>Admin View</p>
            <ul style={S.infoList}>
              {[
                'Lead-approved timesheets are shown by default for payroll-ready review',
                'Switch between department-wise, team-wise, and flat views',
                'Filter by employee, department, reporting lead, status, entry type, or period',
                'Lead approval name and date are visible directly in the admin grid',
              ].map((t, i) => <li key={i} style={S.infoItem}>• {t}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function getChargeCodeGridRow(item = {}, index = 0) {
  const code = item.code || item.charge_code || item.chargeCode || '';
  const description = item.description || item.charge_code_name || item.name || item.project_name || '-';
  const client = item.client || item.project_name || item.client_name || '-';
  const country = item.country || item.countryRegion || item.country_region || '-';
  const type = item.type || item.charge_type || '-';
  const subType = item.subType || item.sub_type || item.subtype || '-';
  const owner = item.owner_name || item.owner || item.created_by_name || item.assigned_by_name || '-';
  const ownerEmail = item.owner_email || '';

  return {
    id: item._id || item.charge_code_id || code || `charge-code-${index}`,
    code,
    description,
    client,
    country,
    type,
    subType,
    owner,
    ownerEmail,
    active: item.is_active !== false,
    raw: item,
  };
}

function ChargeCodesWorkspace({ user, adminMode = false }) {
  const userId = getUserId(user);
  const [codes, setCodes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);
  const [displayRows, setDisplayRows] = useState({});
  const emptyChargeCodeForm = {
    code: '',
    type: '',
    subType: '',
    client: '',
    country: '',
    description: '',
    ownerId: '',
  };
  const [chargeCodeForm, setChargeCodeForm] = useState(emptyChargeCodeForm);
  const [filter, setFilter] = useState('All');
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadCodes = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    const endpoint = adminMode
      ? '/charge_codes/all'
      : `/charge_codes/employee/${userId}?active_only=true`;
    fetchAPI(endpoint)
      .then((data) => {
        const items = Array.isArray(data) ? data : [];
        setCodes(items);
        const savedDisplayRows = adminMode ? {} : readChargeCodeDisplayPreferences(userId);
        setDisplayRows({
          ...items.reduce((acc, item, index) => {
            const row = getChargeCodeGridRow(item, index);
            getChargeCodeDisplayKeys(row.raw).forEach((key) => {
              acc[key] = row.active;
            });
            return acc;
          }, {}),
          ...savedDisplayRows,
        });
      })
      .catch((err) => alert(`Failed to load charge codes: ${err.message}`))
      .finally(() => setLoading(false));
  }, [adminMode, userId]);

  useEffect(() => {
    loadCodes();
  }, [loadCodes]);

  useEffect(() => {
    if (!adminMode) return;
    fetchAPI('/users/get_all_employees')
      .then((data) => setEmployees(Array.isArray(data) ? data : []))
      .catch(console.error);
  }, [adminMode]);

  const rows = useMemo(() => {
    const normalized = codes.map(getChargeCodeGridRow);
    if (filter === 'Displayed') return normalized.filter((row) => isChargeCodeDisplayed(row.raw, displayRows));
    if (filter === 'Selected') return normalized.filter((row) => selectedRows.includes(row.id));
    return normalized;
  }, [codes, displayRows, filter, selectedRows]);
  const chargeCodeStats = useMemo(() => {
    const normalized = codes.map(getChargeCodeGridRow);
    const owners = new Set(
      normalized
        .map((row) => row.owner)
        .filter((owner) => owner && owner !== '-')
    );

    return {
      total: normalized.length,
      active: normalized.filter((row) => row.active).length,
      displayed: normalized.filter((row) => isChargeCodeDisplayed(row.raw, displayRows)).length,
      selected: selectedRows.length,
      owners: owners.size,
      selectedEmployees: selectedEmployees.length,
    };
  }, [codes, displayRows, selectedEmployees.length, selectedRows.length]);
  const summaryCards = adminMode
    ? [
        { label: 'Charge Codes', value: chargeCodeStats.total, sub: 'Created records', Icon: FileText },
        { label: 'Active', value: chargeCodeStats.active, sub: 'Available for assignment', Icon: CheckCircle },
        { label: 'Owners', value: chargeCodeStats.owners, sub: 'Named charge-code owners', Icon: UserCheck },
        { label: 'Selected', value: chargeCodeStats.selected, sub: 'Ready to assign', Icon: Users },
      ]
    : [
        { label: 'Assigned', value: chargeCodeStats.total, sub: 'Available charge codes', Icon: FileText },
        { label: 'Displayed', value: chargeCodeStats.displayed, sub: 'Visible in timesheets', Icon: Eye },
        { label: 'Selected', value: chargeCodeStats.selected, sub: 'Marked in this view', Icon: CheckCircle },
        { label: 'Active', value: chargeCodeStats.active, sub: 'Currently enabled', Icon: UserCheck },
      ];

  const toggleSelectedRow = (rowId) => {
    setSelectedRows((previous) =>
      previous.includes(rowId)
        ? previous.filter((id) => id !== rowId)
        : [...previous, rowId]
    );
  };

  const toggleDisplayRow = (row) => {
    const nextDisplayed = !isChargeCodeDisplayed(row.raw, displayRows);
    setDisplayRows((previous) => {
      const next = { ...previous };
      getChargeCodeDisplayKeys(row.raw).forEach((key) => {
        next[key] = nextDisplayed;
      });
      if (!adminMode) writeChargeCodeDisplayPreferences(userId, next);
      return next;
    });
  };

  const handleAddCode = async () => {
    const code = chargeCodeForm.code.trim();
    if (!code) {
      alert('Enter a charge code');
      return;
    }
    if (!adminMode) {
      alert('Only admins can add charge codes');
      return;
    }
    if (!userId) {
      alert('User not loaded properly');
      return;
    }

    setLoading(true);
    try {
      await fetchAPI('/charge_codes/create', {
        method: 'POST',
        body: JSON.stringify({
          code,
          name: chargeCodeForm.description.trim() || code,
          description: chargeCodeForm.description.trim(),
          project_name: chargeCodeForm.client.trim(),
          type: chargeCodeForm.type.trim(),
          sub_type: chargeCodeForm.subType.trim(),
          client: chargeCodeForm.client.trim(),
          country: chargeCodeForm.country.trim(),
          owner_id: chargeCodeForm.ownerId || '',
          is_active: true,
          created_by: userId,
        }),
      });
      setChargeCodeForm(emptyChargeCodeForm);
      loadCodes();
    } catch (err) {
      alert(`Failed to add charge code: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!adminMode) {
      writeChargeCodeDisplayPreferences(userId, displayRows);
      alert('Charge code display preferences saved');
      return;
    }

    if (selectedEmployees.length === 0 || selectedRows.length === 0) {
      alert('Select at least one employee and one charge code');
      return;
    }

    setLoading(true);
    try {
      const selectedCodes = rows
        .filter((row) => selectedRows.includes(row.id))
        .map((row) => row.raw._id || row.raw.charge_code_id)
        .filter(Boolean);

      const results = await Promise.allSettled(
        selectedEmployees.map((employeeId) =>
          fetchAPI('/charge_codes/assign', {
            method: 'POST',
            body: JSON.stringify({
              employee_id: employeeId,
              charge_code_ids: selectedCodes,
              assigned_by: userId,
            }),
          })
        )
      );
      const succeeded = results.filter((result) => result.status === 'fulfilled').length;
      const failed = results.length - succeeded;
      alert(failed ? `Assigned to ${succeeded}, failed for ${failed}` : `Assigned to ${succeeded} employee${succeeded !== 1 ? 's' : ''}`);
      setSelectedRows([]);
      setSelectedEmployees([]);
    } catch (err) {
      alert(`Failed to submit charge code assignment: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mte-chargecodes-shell">
      <div className="mte-chargecodes-summary-grid">
        {summaryCards.map(({ label, value, sub, Icon }) => (
          <article className="mte-chargecodes-summary-card" key={label}>
            <div className="mte-chargecodes-summary-topline">
              <span>{label}</span>
              <Icon size={17} />
            </div>
            <strong>{value}</strong>
            <small>{sub}</small>
          </article>
        ))}
      </div>

      <div className={`mte-chargecodes-topbar ${adminMode ? '' : 'is-employee'}`}>
        {adminMode ? (
          <section className="mte-chargecodes-card mte-chargecodes-create-card">
            <div className="mte-chargecodes-card-header">
              <div>
                <h3>Create Charge Code</h3>
                <p>Add charge-code details and choose a clear owner.</p>
              </div>
            </div>
            <div className="mte-chargecodes-add-grid">
              <label className="mte-chargecodes-field">
                <span>Charge Code</span>
                <input
                  value={chargeCodeForm.code}
                  onChange={(event) => setChargeCodeForm((previous) => ({ ...previous, code: event.target.value }))}
                  placeholder="Enter charge code"
                  disabled={loading}
                />
              </label>
              <label className="mte-chargecodes-field">
                <span>Type</span>
                <input
                  value={chargeCodeForm.type}
                  onChange={(event) => setChargeCodeForm((previous) => ({ ...previous, type: event.target.value }))}
                  placeholder="Enter type"
                  disabled={loading}
                />
              </label>
              <label className="mte-chargecodes-field">
                <span>Subtype</span>
                <input
                  value={chargeCodeForm.subType}
                  onChange={(event) => setChargeCodeForm((previous) => ({ ...previous, subType: event.target.value }))}
                  placeholder="Enter subtype"
                  disabled={loading}
                />
              </label>
              <label className="mte-chargecodes-field">
                <span>Client</span>
                <input
                  value={chargeCodeForm.client}
                  onChange={(event) => setChargeCodeForm((previous) => ({ ...previous, client: event.target.value }))}
                  placeholder="Enter client"
                  disabled={loading}
                />
              </label>
              <label className="mte-chargecodes-field">
                <span>Country</span>
                <input
                  value={chargeCodeForm.country}
                  onChange={(event) => setChargeCodeForm((previous) => ({ ...previous, country: event.target.value }))}
                  placeholder="Enter country"
                  disabled={loading}
                />
              </label>
              <label className="mte-chargecodes-field">
                <span>Description</span>
                <input
                  value={chargeCodeForm.description}
                  onChange={(event) => setChargeCodeForm((previous) => ({ ...previous, description: event.target.value }))}
                  placeholder="Enter description"
                  disabled={loading}
                />
              </label>
              <div className="mte-chargecodes-field mte-chargecodes-owner-field">
                <span>Owner Name</span>
                <ValueHelpSelect
                  value={chargeCodeForm.ownerId}
                  onChange={(ownerId) => setChargeCodeForm((previous) => ({ ...previous, ownerId }))}
                  placeholder="Select owner name"
                  searchPlaceholder="Search owner name"
                  options={[
                    { value: '', label: 'Select owner name' },
                    ...employees.map((employee) => ({
                      value: employee._id,
                      label: `${employee.name} - ${employee.email}`,
                      description: employee.department || employee.employeeId,
                    })),
                  ]}
                />
              </div>
            </div>
            <div className="mte-chargecodes-add-actions">
              <button type="button" onClick={handleAddCode} disabled={loading}>
                <Plus size={14} />
                <span>{loading ? 'Adding...' : 'Add Charge Code'}</span>
              </button>
            </div>
          </section>
        ) : null}

        <section className={`mte-chargecodes-card mte-chargecodes-assign-card ${adminMode ? '' : 'is-display-preferences-card'}`}>
          <div className="mte-chargecodes-card-header">
            <div>
              <h3>{adminMode ? 'Assign Charge Codes' : 'Display Preferences'}</h3>
              <p>
                {adminMode
                  ? 'Select employees and assign the selected charge codes.'
                  : 'Choose which charge codes should remain visible.'}
              </p>
            </div>
          </div>

          {adminMode ? (
            <div className="mte-chargecodes-employee-pick">
              <span>Assign to employee</span>
              <ValueHelpSelect
                value=""
                onChange={(employeeId) => {
                  if (!employeeId) return;
                  setSelectedEmployees((previous) =>
                    previous.includes(employeeId) ? previous : [...previous, employeeId]
                  );
                }}
                placeholder={selectedEmployees.length ? `${selectedEmployees.length} employee(s) selected` : 'Select employee'}
                searchPlaceholder="Search employees"
                options={[
                  { value: '', label: 'Select employee' },
                  ...employees.map((employee) => ({
                    value: employee._id,
                    label: `${employee.name} - ${employee.email}`,
                    description: employee.department || employee.employeeId,
                  })),
                ]}
              />
            </div>
          ) : null}

          {adminMode ? (
            <label className="mte-chargecodes-filter-field mte-chargecodes-view-field">
              <span>View</span>
              <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                <option>All</option>
                <option>Displayed</option>
                <option>Selected</option>
              </select>
            </label>
          ) : null}

          {selectedEmployees.length > 0 ? (
            <div className="mte-chargecodes-selected-employees">
              {selectedEmployees.map((employeeId) => {
                const employee = employees.find((item) => item._id === employeeId);
                return (
                  <button
                    key={employeeId}
                    type="button"
                    onClick={() => setSelectedEmployees((previous) => previous.filter((id) => id !== employeeId))}
                  >
                    {employee?.name || employeeId}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="mte-chargecodes-actions">
            {!adminMode ? (
              <label className="mte-chargecodes-filter-field mte-chargecodes-view-field">
                <span>View</span>
                <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option>All</option>
                  <option>Displayed</option>
                  <option>Selected</option>
                </select>
              </label>
            ) : null}
            <button type="button" onClick={() => {
              setChargeCodeForm(emptyChargeCodeForm);
              setSelectedRows([]);
              setFilter('All');
            }}>
              <RefreshCw size={14} />
              <span>Reset</span>
            </button>
            <button type="button" className="is-primary" onClick={handleSubmit} disabled={loading}>
              {adminMode ? <UserCheck size={14} /> : <Save size={14} />}
              <span>{adminMode ? 'Assign Selected' : 'Save Preferences'}</span>
            </button>
          </div>
        </section>
      </div>

      <div className="mte-chargecodes-table-wrap">
        <table className="mte-chargecodes-table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Display <span className="mte-chargecodes-info">i</span></th>
              <th>Type</th>
              <th>SubType</th>
              <th>Client</th>
              <th>Country</th>
              <th>Description</th>
              <th>Charge Code</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={9}>Loading charge codes...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9}>No charge codes found</td></tr>
            ) : rows.map((row) => {
              const selected = selectedRows.includes(row.id);
              const displayed = isChargeCodeDisplayed(row.raw, displayRows);
              return (
                <tr key={row.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleSelectedRow(row.id)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`mte-chargecodes-toggle ${displayed ? 'is-on' : ''}`}
                      aria-pressed={displayed}
                      onClick={() => toggleDisplayRow(row)}
                    >
                      <span />
                    </button>
                  </td>
                  <td title={row.type}>{row.type}</td>
                  <td title={row.subType}>{row.subType}</td>
                  <td title={row.client}>{row.client}</td>
                  <td title={row.country}>{row.country}</td>
                  <td title={row.description}>{row.description}</td>
                  <td className={selected ? 'is-selected-code' : ''} title={row.code || '-'}>
                    {row.code || '-'}
                  </td>
                  <td title={row.owner}>
                    <span className="mte-chargecodes-owner-dot" />
                    {row.owner}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ChargeCodeAdmin ──────────────────────────────────────────────────────────
function ChargeCodeAdmin({ user }) {
  return <ChargeCodesWorkspace user={user} adminMode />;
}

// eslint-disable-next-line no-unused-vars
function LegacyChargeCodeAdmin({ user }) {
  const [codes,             setCodes]             = useState([]);
  const [employees,         setEmployees]         = useState([]);
  const [newCode,           setNewCode]           = useState({ charge_code: '', charge_code_name: '' });
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [selectedCode,      setSelectedCode]      = useState('');
  const [loading,           setLoading]           = useState(false);

  const userId = getUserId(user);

  const loadCodes = () => {
    fetchAPI('/charge_codes/all')
      .then((d) => setCodes(Array.isArray(d) ? d : []))
      .catch(console.error);
  };

  useEffect(() => {
    loadCodes();
    fetchAPI('/users/get_all_employees')
      .then((d) => setEmployees(Array.isArray(d) ? d : []))
      .catch(console.error);
  }, []);

  const handleCreate = async () => {
    if (!newCode.charge_code || !newCode.charge_code_name) {
      alert('Please enter both a code and a name');
      return;
    }
    if (!userId) { alert('User not loaded properly'); return; }
    setLoading(true);
    try {
      await fetchAPI('/charge_codes/create', {
        method: 'POST',
        body: JSON.stringify({
          code:         newCode.charge_code.trim(),
          name:         newCode.charge_code_name.trim(),
          description:  '',
          project_name: '',
          is_active:    true,
          created_by:   userId,
        }),
      });
      alert('Charge code created successfully');
      setNewCode({ charge_code: '', charge_code_name: '' });
      loadCodes();
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (selectedEmployees.length === 0 || !selectedCode) {
      alert('Please select at least one employee and a charge code');
      return;
    }
    if (!userId) { alert('User not loaded properly'); return; }
    setLoading(true);
    try {
      const results = await Promise.allSettled(
        selectedEmployees.map((empId) =>
          fetchAPI('/charge_codes/assign', {
            method: 'POST',
            body: JSON.stringify({
              employee_id:     empId,
              charge_code_ids: [selectedCode],
              assigned_by:     userId,
            }),
          })
        )
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed    = results.length - succeeded;
      alert(
        failed === 0
          ? `Charge code assigned to ${succeeded} employee${succeeded !== 1 ? 's' : ''} successfully`
          : `Assigned to ${succeeded}, failed for ${failed} employee${failed !== 1 ? 's' : ''}`
      );
      setSelectedEmployees([]);
      setSelectedCode('');
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={S.maxW}>
          <div style={S.pageHeader}>
            <h1 style={S.pageTitle}>Charge Code Management</h1>
            <p style={S.pageSub}>Create and assign project charge codes to employees</p>
          </div>

          <div style={{ ...S.card, ...S.cardPad, marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: C.text, margin: '0 0 16px 0' }}>
              Create Charge Code
            </h3>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', color: C.textMid, fontWeight: '500' }}>Code</label>
                <input
                  placeholder="e.g. PROJ-001"
                  value={newCode.charge_code}
                  onChange={(e) => setNewCode({ ...newCode, charge_code: e.target.value })}
                  style={{ ...S.input, width: '160px' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: '200px' }}>
                <label style={{ fontSize: '13px', color: C.textMid, fontWeight: '500' }}>Name</label>
                <input
                  placeholder="e.g. Website Redesign"
                  value={newCode.charge_code_name}
                  onChange={(e) => setNewCode({ ...newCode, charge_code_name: e.target.value })}
                  style={{ ...S.input, width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <button onClick={handleCreate} disabled={loading} style={loading ? S.btnDisabled : S.btnPrimary}>
                <Plus size={14} /> Create
              </button>
            </div>
          </div>

          <div style={{ ...S.card, ...S.cardPad, marginBottom: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: C.text, margin: '0 0 16px 0' }}>
              Assign Charge Code to Employee
            </h3>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '240px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ fontSize: '13px', color: C.textMid, fontWeight: '500' }}>
                    Employees
                    {selectedEmployees.length > 0 && (
                      <span style={{ marginLeft: '6px', color: C.purple, fontWeight: '600' }}>
                        ({selectedEmployees.length} selected)
                      </span>
                    )}
                  </label>
                  <button
                    onClick={() =>
                      setSelectedEmployees(
                        selectedEmployees.length === employees.length
                          ? []
                          : employees.map((e) => e._id)
                      )
                    }
                    style={{
                      fontSize: '12px', color: C.purple, background: 'none',
                      border: 'none', cursor: 'pointer', fontWeight: '500',
                      padding: '0', marginLeft: '12px',
                    }}
                  >
                    {selectedEmployees.length === employees.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div style={{
                  border: `1px solid ${C.border}`, borderRadius: '5px',
                  maxHeight: '160px', overflowY: 'auto', background: C.white,
                }}>
                  {employees.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: '13px', color: C.textMid }}>
                      No employees found
                    </div>
                  ) : employees.map((emp) => {
                    const isChecked = selectedEmployees.includes(emp._id);
                    return (
                      <label key={emp._id} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                        background: isChecked ? C.purpleLight : 'transparent',
                        borderBottom: `1px solid ${C.borderLight}`,
                        color: C.text,
                      }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() =>
                            setSelectedEmployees((prev) =>
                              isChecked
                                ? prev.filter((id) => id !== emp._id)
                                : [...prev, emp._id]
                            )
                          }
                          style={{ width: '14px', height: '14px', accentColor: C.purple, flexShrink: 0 }}
                        />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {emp.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', color: C.textMid, fontWeight: '500' }}>Charge Code</label>
                <ValueHelpSelect
                  value={selectedCode}
                  onChange={setSelectedCode}
                  placeholder="Select charge code"
                  searchPlaceholder="Search charge codes"
                  style={{ minWidth: '220px' }}
                  options={[
                    { value: '', label: 'Select Charge Code' },
                    ...codes.map((c) => ({ value: c._id, label: `${c.code} - ${c.name}` })),
                  ]}
                />
                <button
                  onClick={handleAssign}
                  disabled={loading}
                  style={loading ? S.btnDisabled : S.btnGreen}
                >
                  <UserCheck size={14} /> Assign
                </button>
              </div>
            </div>
          </div>

          <div style={{ ...S.card, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: C.text, margin: 0 }}>
                All Charge Codes ({codes.length})
              </h3>
            </div>
            <div style={S.tableScroll}>
              <table style={{ ...S.table, minWidth: '500px' }}>
                <thead style={S.thead}>
                  <tr>
                    {['Code', 'Name', 'Status', 'Created'].map((h) => (
                      <th key={h} style={h === 'Status' ? S.thCenter : S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {codes.length === 0 ? (
                    <tr><td colSpan={4} style={{ ...S.tdMid, textAlign: 'center', padding: '40px' }}>No charge codes found</td></tr>
                  ) : codes.map((c, i) => (
                    <tr key={c._id} style={i % 2 === 0 ? S.trEven : S.trOdd}>
                      <td style={{ ...S.td, fontWeight: '600', color: C.purple }}>{c.code}</td>
                      <td style={S.td}>{c.name}</td>
                      <td style={S.tdCenter}>
                        <span style={{
                          ...S.badge,
                          background:  c.is_active ? C.greenLight : '#f3f4f6',
                          color:       c.is_active ? C.green      : '#6b7280',
                          borderColor: c.is_active ? C.greenBorder : '#d1d5db',
                        }}>
                          {c.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={S.tdMid}>
                        {c.created_at ? format(new Date(c.created_at), 'MMM d, yyyy') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssignmentAdmin({ user }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingEmployeeId, setSavingEmployeeId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [drafts, setDrafts] = useState({});

  const loadEmployees = useCallback(() => {
    setLoading(true);
    fetchAPI('/users/get_all_employees')
      .then((data) => {
        const items = Array.isArray(data) ? data : [];
        setEmployees(items);
        setDrafts(
          items.reduce((acc, employee) => {
            acc[employee._id] = {
              workLocation: employee.workLocation || '',
              companyCode: employee.companyCode || '',
              assignedLocation: employee.assignedLocation || employee.costCenter || '',
            };
            return acc;
          }, {})
        );
      })
      .catch((err) => {
        console.error(err);
        alert(`Failed to load employees: ${err.message}`);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  const filteredEmployees = employees.filter((employee) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;

    return [
      employee.name,
      employee.email,
      employee.employeeId,
      employee.department,
      employee.workLocation,
      employee.assignedLocation,
      employee.companyCode,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });

  const searchSuggestions = useMemo(
    () => uniqSuggestions(employees, [
      'name',
      'email',
      'employeeId',
      'department',
      'workLocation',
      'assignedLocation',
      'companyCode',
    ]),
    [employees]
  );

  const assignedCount = employees.filter(
    (employee) => employee.workLocation || employee.companyCode || employee.assignedLocation || employee.costCenter
  ).length;

  const handleDraftChange = (employeeId, field, value) => {
    setDrafts((previous) => ({
      ...previous,
      [employeeId]: {
        ...previous[employeeId],
        [field]: value,
      },
    }));
  };

  const handleSaveAssignment = async (employee) => {
    const employeeId = employee._id;
    const draft = drafts[employeeId] || {
      workLocation: '',
      companyCode: '',
      assignedLocation: '',
    };

    setSavingEmployeeId(employeeId);
    try {
      await fetchAPI(`/users/update_user/${employeeId}`, {
        method: 'PUT',
        body: JSON.stringify({
          workLocation: draft.workLocation.trim(),
          companyCode: draft.companyCode.trim(),
          assignedLocation: draft.assignedLocation.trim(),
          costCenter: draft.assignedLocation.trim(),
        }),
      });

      setEmployees((previous) =>
        previous.map((item) =>
          item._id === employeeId
            ? {
                ...item,
                workLocation: draft.workLocation.trim(),
                companyCode: draft.companyCode.trim(),
                assignedLocation: draft.assignedLocation.trim(),
                costCenter: draft.assignedLocation.trim(),
              }
            : item
        )
      );
    } catch (err) {
      alert(`Failed to save assignment for ${employee.name}: ${err.message}`);
    } finally {
      setSavingEmployeeId('');
    }
  };

  return (
    <div style={S.page}>
      <div style={S.inner}>
        <div style={S.maxW}>
          <div style={S.pageHeader}>
            <h1 style={S.pageTitle}>Employee Assignments</h1>
            <p style={S.pageSub}>Assign work location, company code, and cost center for timesheet use</p>
          </div>

          <div style={S.statsGrid}>
            {[
              { label: 'Employees', value: employees.length, sub: 'Available for assignment', Icon: Users, color: C.text },
              { label: 'Assigned', value: assignedCount, sub: 'Have at least one value set', Icon: CheckCircle2, color: C.green },
              { label: 'Missing', value: Math.max(employees.length - assignedCount, 0), sub: 'Need admin review', Icon: AlertCircle, color: C.red },
              { label: 'Visible In Time', value: '3 fields', sub: 'Location, code, assigned location', Icon: Building2, color: C.text },
            ].map(({ label, value, sub, Icon, color }) => (
              <div key={label} style={S.statCard}>
                <div style={S.statRow}>
                  <span style={S.statLabel}>{label}</span>
                  <Icon size={18} style={{ color: C.purpleMid }} />
                </div>
                <div style={{ ...S.statValue, color }}>{value}</div>
                <div style={S.statSub}>{sub}</div>
              </div>
            ))}
          </div>

          <div style={{ ...S.card, ...S.cardPadSm, marginBottom: '20px' }}>
            <div style={S.rowBetween}>
              <ValueHelpSearch
                value={searchTerm}
                onChange={setSearchTerm}
                suggestions={searchSuggestions}
                placeholder="Search by employee, email, department, or assignment..."
                style={{ flex: 1, minWidth: '260px' }}
              />
              <button type="button" onClick={loadEmployees} style={S.btnSecondary}>
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          </div>

          <div style={{ ...S.card, overflow: 'hidden' }}>
            <div style={S.tableScroll}>
              <table style={{ ...S.table, minWidth: '1120px' }}>
                <thead style={S.thead}>
                  <tr>
                    {['Employee', 'Department', 'Work Location', 'Company Code', 'Assigned Location', 'Status', 'Action'].map((header) => (
                      <th
                        key={header}
                        style={header === 'Status' || header === 'Action' ? S.thCenter : S.th}
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} style={{ ...S.tdMid, textAlign: 'center', padding: '40px' }}>Loading employees…</td>
                    </tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ ...S.tdMid, textAlign: 'center', padding: '40px' }}>No employees match the current search</td>
                    </tr>
                  ) : filteredEmployees.map((employee, index) => {
                    const draft = drafts[employee._id] || {
                      workLocation: '',
                      companyCode: '',
                      assignedLocation: '',
                    };
                    const isComplete = draft.workLocation.trim() && draft.companyCode.trim() && draft.assignedLocation.trim();
                    const isSaving = savingEmployeeId === employee._id;

                    return (
                      <tr key={employee._id} style={index % 2 === 0 ? S.trEven : S.trOdd}>
                        <td style={S.td}>
                          <div style={{ fontWeight: '600' }}>{employee.name}</div>
                          <div style={{ fontSize: '12px', color: C.textMid }}>{employee.email}</div>
                          <div style={{ fontSize: '12px', color: C.textMid }}>{employee.employeeId || 'No employee ID'}</div>
                        </td>
                        <td style={S.td}>{employee.department || 'Not assigned'}</td>
                        <td style={S.td}>
                          <input
                            className="input"
                            value={draft.workLocation}
                            onChange={(event) => handleDraftChange(employee._id, 'workLocation', event.target.value)}
                            placeholder="Assign location"
                            style={{ ...S.input, width: '100%' }}
                          />
                        </td>
                        <td style={S.td}>
                          <input
                            className="input"
                            value={draft.companyCode}
                            onChange={(event) => handleDraftChange(employee._id, 'companyCode', event.target.value)}
                            placeholder="Assign company code"
                            style={{ ...S.input, width: '100%' }}
                          />
                        </td>
                        <td style={S.td}>
                          <input
                            className="input"
                            value={draft.assignedLocation}
                            onChange={(event) => handleDraftChange(employee._id, 'assignedLocation', event.target.value)}
                            placeholder="Assign location"
                            style={{ ...S.input, width: '100%' }}
                          />
                        </td>
                        <td style={S.tdCenter}>
                          <span
                            style={{
                              ...S.badge,
                              background: isComplete ? C.greenLight : C.amberLight,
                              color: isComplete ? C.green : C.amber,
                              borderColor: isComplete ? C.greenBorder : C.amberBorder,
                            }}
                          >
                            {isComplete ? 'Complete' : 'Incomplete'}
                          </span>
                        </td>
                        <td style={S.tdCenter}>
                          <button
                            type="button"
                            onClick={() => handleSaveAssignment(employee)}
                            disabled={isSaving}
                            style={isSaving ? S.btnDisabled : S.btnPrimary}
                          >
                            {isSaving ? 'Saving' : 'Save'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={S.infoBox}>
            <p style={S.infoTitle}>Assignment Rules</p>
            <ul style={S.infoList}>
              {[
                'These values are maintained by admin and are reused by employee and lead timesheet views.',
                'New submissions snapshot the current assignment values onto the timesheet for approval history consistency.',
                'Employees with incomplete assignments will still save, but the timesheet UI will show missing metadata until completed.',
              ].map((item, index) => (
                <li key={index} style={S.infoItem}>• {item}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssignedChargeCodesPanel({ user }) {
  return <ChargeCodesWorkspace user={user} />;
}

function ExpensesPanel({ user }) {
  const isAdmin = user?.role === 'Admin';
  const userId = getUserId(user);
  const today = format(new Date(), 'yyyy-MM-dd');
  const fileInputRef = useRef(null);
  const expenseCategories = [
    'Travel',
    'Meals',
    'Lodging',
    'Laptop / Desktop Hardware',
    'Software Subscription',
    'Cloud / Hosting',
    'Internet / Mobile Reimbursement',
    'Office Supplies',
    'IT Accessories',
    'Training / Certification',
    'Client Meeting',
    'Courier / Shipping',
    'Parking / Cab',
    'Other',
  ];
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState({
    expense_date: today,
    category: 'Travel',
    amount: '',
    description: '',
    documentFile: null,
  });
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(false);

  const loadExpenses = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    fetchAPI(`/expenses?employee_id=${userId}&role=${encodeURIComponent(user?.role || '')}`)
      .then((data) => setExpenses(Array.isArray(data) ? data : []))
      .catch((err) => alert(`Failed to load expenses: ${err.message}`))
      .finally(() => setLoading(false));
  }, [userId, user?.role]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const resetForm = () => {
    setEditingId('');
    setForm({ expense_date: today, category: 'Travel', amount: '', description: '', documentFile: null });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveExpense = async () => {
    if (!userId) {
      alert('User not loaded properly');
      return;
    }
    if (!form.expense_date || !form.category || !form.amount || Number(form.amount) <= 0) {
      alert('Enter date, category, and an amount greater than zero');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        employee_id: userId,
        expense_date: form.expense_date,
        category: form.category,
        amount: Number(form.amount),
        description: form.description,
      };
      let savedExpense = null;
      if (editingId) {
        savedExpense = await fetchAPI(`/expenses/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        savedExpense = await fetchAPI('/expenses', { method: 'POST', body: JSON.stringify(payload) });
      }
      if (form.documentFile && savedExpense?._id) {
        const documentData = new FormData();
        documentData.append('document', form.documentFile);
        await uploadAPI(`/expenses/${savedExpense._id}/document`, documentData);
      }
      resetForm();
      loadExpenses();
    } catch (err) {
      alert(`Failed to save expense: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditExpense = (expense) => {
    setEditingId(expense._id);
    setForm({
      expense_date: expense.expense_date || today,
      category: expense.category || 'Travel',
      amount: String(expense.amount || ''),
      description: expense.description || '',
      documentFile: null,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm('Delete this expense?')) return;
    setLoading(true);
    try {
      await fetchAPI(`/expenses/${expenseId}`, { method: 'DELETE' });
      if (editingId === expenseId) resetForm();
      loadExpenses();
    } catch (err) {
      alert(`Failed to delete expense: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mte-module-card">
      <div className="mte-module-toolbar">
        <button
          type="button"
          className="mte-select-shell"
          onClick={handleSaveExpense}
          disabled={loading}
        >
          <span>{editingId ? 'Edit Expense' : 'Add Expense'}</span>
          <ChevronRight size={14} />
        </button>
        <button type="button" className="mte-icon-text-button" onClick={resetForm}>
          <LayoutGrid size={16} />
          <span>Clear</span>
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <input
          className="input"
          type="date"
          value={form.expense_date}
          onChange={(event) => setForm({ ...form, expense_date: event.target.value })}
        />
        <select
          className="input"
          value={form.category}
          onChange={(event) => setForm({ ...form, category: event.target.value })}
        >
          {expenseCategories.map((category) => <option key={category}>{category}</option>)}
        </select>
        <input
          className="input"
          type="number"
          min="0"
          step="0.01"
          placeholder="Amount"
          value={form.amount}
          onChange={(event) => setForm({ ...form, amount: event.target.value })}
        />
        <input
          className="input"
          placeholder="Description"
          value={form.description}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
        <div className="mte-expense-upload">
          <button
            type="button"
            className="mte-icon-text-button"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} />
            <span>{form.documentFile ? 'Change Document' : 'Upload Document'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.gif,.webp,.ppt,.pptx,.zip,.msg,.eml"
            onChange={(event) => setForm({ ...form, documentFile: event.target.files?.[0] || null })}
          />
          {form.documentFile ? <span title={form.documentFile.name}>{form.documentFile.name}</span> : null}
        </div>
        <button type="button" className="mte-submit-button" onClick={handleSaveExpense} disabled={loading}>
          <Save size={16} />
          <span>{editingId ? 'Update Expense' : 'Save Expense'}</span>
        </button>
      </div>
      <div className="mte-simple-table-wrap">
        <table className="mte-simple-table">
          <thead>
            <tr>
              {['Date', ...(isAdmin ? ['Employee'] : []), 'Category', 'Description', 'Amount', 'Document', 'Action'].map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && expenses.length === 0 ? (
              <tr><td colSpan={isAdmin ? 7 : 6}>Loading expenses...</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={isAdmin ? 7 : 6}>No expenses added yet.</td></tr>
            ) : expenses.map((expense) => (
              <tr key={expense._id}>
                <td>{expense.expense_date}</td>
                {isAdmin ? <td>{expense.employee_name || 'Employee'}</td> : null}
                <td>{expense.category}</td>
                <td>{expense.description || '-'}</td>
                <td>{Number(expense.amount || 0).toFixed(2)}</td>
                <td>
                  {expense.document?.url ? (
                    <span className="mte-document-cell">
                      <Paperclip size={14} />
                      <a href={expense.document.url} target="_blank" rel="noreferrer">
                        {expense.document.name || 'Document'}
                      </a>
                      <a className="mte-document-view" href={expense.document.url} target="_blank" rel="noreferrer" title="View document">
                        <Eye size={14} />
                      </a>
                    </span>
                  ) : '-'}
                </td>
                <td>
                  <button type="button" style={S.btnIcon} onClick={() => handleEditExpense(expense)} title="Edit expense">
                    <FileText size={14} />
                  </button>
                  <button type="button" style={{ ...S.btnIcon, color: C.red }} onClick={() => handleDeleteExpense(expense._id)} title="Delete expense">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LocationsPanel({ selectedPeriod, periods, user }) {
  const userId = getUserId(user);
  const [profile, setProfile] = useState(user || {});
  const [country, setCountry] = useState(user?.countryRegion || user?.country || 'India');
  const [locationOne, setLocationOne] = useState(user?.workLocation || '');
  const [locationTwo, setLocationTwo] = useState(user?.assignedLocation || user?.costCenter || '');
  const [dailyLocations, setDailyLocations] = useState({});
  const [selectedDates, setSelectedDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const period = periods.find((item) => item.value === selectedPeriod) || periods[0];
  const dates = period
    ? eachDayOfInterval({ start: parseISO(period.start), end: parseISO(period.end) })
    : [];
  const assignmentMeta = getTimesheetAssignmentMeta(profile);

  useEffect(() => {
    if (!userId) return;
    fetchAPI(`/users/${userId}`)
      .then((data) => {
        setProfile({ ...user, ...data });
        setCountry(data.countryRegion || data.country || 'India');
        setLocationOne(data.workLocation || '');
        setLocationTwo(data.assignedLocation || data.costCenter || '');
      })
      .catch(() => setProfile(user || {}));
  }, [userId, user]);

  useEffect(() => {
    if (!userId || !period) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`mte_locations_${userId}_${period.value}`) || '{}');
      setDailyLocations(saved.dailyLocations || {});
      setSelectedDates([]);
      if (saved.country) setCountry(saved.country);
      if (saved.locationOne) setLocationOne(saved.locationOne);
      if (saved.locationTwo) setLocationTwo(saved.locationTwo);
    } catch (_) {
      setDailyLocations({});
    }
  }, [period, userId]);

  const locationOptions = useMemo(() => {
    const values = [
      profile.workLocation,
      profile.assignedLocation,
      profile.costCenter,
      'Hyderabad',
      'Bengaluru',
      'Chennai',
      'Mumbai',
      'Pune',
      'Gurugram',
      'Remote',
      'Client Site',
    ].filter(Boolean);
    return Array.from(new Set(values));
  }, [profile]);

  const persistLocations = async ({ submit = false } = {}) => {
    if (!userId) return;
    if (!country || !locationOne) {
      alert('Select country/region and location one');
      return;
    }

    const nextDailyLocations = dates.reduce((acc, day) => {
      const key = format(day, 'yyyy-MM-dd');
      acc[key] = dailyLocations[key] || locationOne;
      return acc;
    }, {});

    setLoading(true);
    try {
      localStorage.setItem(`mte_locations_${userId}_${period.value}`, JSON.stringify({
        country,
        locationOne,
        locationTwo,
        dailyLocations: nextDailyLocations,
      }));
      await fetchAPI(`/users/update_user/${userId}`, {
        method: 'PUT',
        body: JSON.stringify({
          workLocation: locationOne,
          assignedLocation: locationTwo || locationOne,
          costCenter: locationTwo || locationOne,
        }),
      });
      setProfile((previous) => ({
        ...previous,
        workLocation: locationOne,
        assignedLocation: locationTwo || locationOne,
        costCenter: locationTwo || locationOne,
      }));
      setDailyLocations(nextDailyLocations);
      alert(submit ? 'Locations submitted successfully' : 'Locations saved successfully');
    } catch (err) {
      alert(`Failed to save locations: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocation = () => {
    if (!country || !locationOne) {
      alert('Select country/region and location one');
      return;
    }
    const targetDates = selectedDates.length
      ? selectedDates
      : dates.map((day) => format(day, 'yyyy-MM-dd'));
    const nextDailyLocations = {
      ...dailyLocations,
      ...targetDates.reduce((acc, dateKey) => {
        acc[dateKey] = locationOne;
        return acc;
      }, {}),
    };
    setDailyLocations(nextDailyLocations);
    setSelectedDates([]);
  };

  const toggleSelectedDate = (dateKey) => {
    setSelectedDates((previous) => (
      previous.includes(dateKey)
        ? previous.filter((item) => item !== dateKey)
        : [...previous, dateKey]
    ));
  };

  const updateDailyLocation = (dateKey, value) => {
    setDailyLocations((previous) => ({ ...previous, [dateKey]: value }));
  };

  return (
    <div className="mte-locations-shell">
      <div className="mte-locations-actions">
        <button type="button" onClick={() => persistLocations()} disabled={loading}>
          <Save size={22} />
          <span>Save</span>
        </button>
        <button type="button">
          <CircleHelp size={24} />
          <span>Help</span>
        </button>
        <div className="mte-locations-submit">
          <button type="button" onClick={() => {
            setDailyLocations({});
            setLocationOne('');
            setLocationTwo('');
          }}>
            New
          </button>
          <button type="button" className="is-primary" onClick={() => persistLocations({ submit: true })} disabled={loading}>
            Submit
          </button>
        </div>
      </div>

      <div className="mte-locations-date-strip">
        <div />
        {dates.map((day) => (
          <div key={day.toISOString()} className={format(day, 'EEE') === 'Sat' || format(day, 'EEE') === 'Sun' ? 'is-weekend' : ''}>
            <span>{format(day, 'EEE')}</span>
            <strong>{format(day, 'dd')}</strong>
          </div>
        ))}
      </div>

      <div className="mte-locations-add-row">
        <label>Datewise Locations</label>
        <button type="button" onClick={handleAddLocation}>
          <span>{selectedDates.length ? `Apply to ${selectedDates.length} date${selectedDates.length === 1 ? '' : 's'}` : 'Apply to All'}</span>
          <ChevronRight size={15} />
        </button>
        <p>Select dates below, choose a location, then apply it to those dates.</p>
      </div>

      <div className="mte-locations-body">
        <aside className="mte-locations-card">
          <label>
            <span>Country</span>
            <select value={country} onChange={(event) => setCountry(event.target.value)}>
              <option value="">Select a country/region</option>
              <option>India</option>
              <option>Italy</option>
              <option>United States</option>
              <option>United Kingdom</option>
              <option>Germany</option>
            </select>
          </label>

          <label>
            <span>Location One</span>
            <select value={locationOne} onChange={(event) => setLocationOne(event.target.value)}>
              <option value="">Select a location</option>
              {locationOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>

          <label>
            <span>Location Two</span>
            <select value={locationTwo} onChange={(event) => setLocationTwo(event.target.value)}>
              <option value="">Select a secondary location</option>
              {locationOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>

          <button type="button" onClick={handleAddLocation}>Add</button>
        </aside>

        <section className="mte-locations-info">
          <div className="mte-locations-date-grid">
            {dates.map((day) => {
              const key = format(day, 'yyyy-MM-dd');
              const isSelected = selectedDates.includes(key);
              return (
                <article key={key} className={isSelected ? 'is-selected' : ''}>
                  <button type="button" onClick={() => toggleSelectedDate(key)}>
                    <span>{format(day, 'EEE')}</span>
                    <strong>{format(day, 'dd MMM')}</strong>
                  </button>
                  <select
                    value={dailyLocations[key] || assignmentMeta.workLocation || ''}
                    onChange={(event) => updateDailyLocation(key, event.target.value)}
                  >
                    <option value="">Select location</option>
                    {locationOptions.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function AdjustmentsPanel({ user }) {
  return (
    <div className="mte-module-card">
      <div className="mte-module-card-header">
        <div>
          <h3>Adjustments</h3>
          <p>Keep correction requests, overrides, and manual payroll adjustments in the same visual shell.</p>
        </div>
      </div>
      <div className="mte-adjustments-list">
        <article>
          <strong>Manual overtime correction</strong>
          <span>Use this area for approved exception handling and retro changes.</span>
        </article>
        <article>
          <strong>Holiday payout review</strong>
          <span>Pair this view with payroll exports when exception payouts need sign-off.</span>
        </article>
        <article>
          <strong>{user?.role === 'Admin' ? 'Admin exception queue' : 'My exception requests'}</strong>
          <span>Designed so your real adjustment data can drop into the same rows later.</span>
        </article>
      </div>
    </div>
  );
}

function PreferencesPanel({ user }) {
  const reviewer = user?.reportsToEmail || user?.reportsTo || user?.managerEmail || '';
  const email = user?.email || '';

  return (
    <div className="mte-module-card mte-preferences-shell">
      <div className="mte-preferences-grid">
        <div className="mte-pref-field">
          <label>Time Report Reviewer(s):</label>
          <input className="input" defaultValue="" placeholder="e.g. john.a.smith" />
        </div>
        <div className="mte-pref-arrow">›</div>
        <div className="mte-pref-field">
          <label>Selected Reviewers:</label>
          <textarea className="input" defaultValue={reviewer} rows={3} />
        </div>
        <div className="mte-pref-field">
          <label>Theme:</label>
          <select className="input" defaultValue="Default">
            <option>Default</option>
            <option>Classic</option>
          </select>
        </div>

        <div className="mte-pref-field">
          <label>Notify of Submission:</label>
          <input className="input" defaultValue="" placeholder="e.g. john.a.smith@company.com" />
        </div>
        <div className="mte-pref-arrow">›</div>
        <div className="mte-pref-field">
          <label>Selected Notifications:</label>
          <textarea className="input" defaultValue={email} rows={3} />
        </div>
        <div />

        <div className="mte-pref-field">
          <label>Delegate(s):</label>
          <input className="input" defaultValue="" placeholder="e.g. john.a.smith" />
        </div>
        <div className="mte-pref-arrow">›</div>
        <div className="mte-pref-field">
          <label>Selected Delegates:</label>
          <textarea className="input" defaultValue="" rows={3} />
        </div>
        <div />

        <div className="mte-pref-field">
          <label>Approver(s):</label>
          <input className="input" defaultValue="" placeholder="e.g. john.a.smith" />
        </div>
        <div className="mte-pref-arrow">›</div>
        <div className="mte-pref-field">
          <label>Selected Approvers:</label>
          <textarea className="input" defaultValue={reviewer} rows={3} />
        </div>
        <div />
      </div>
    </div>
  );
}

function PortalTimeWorkspace({
  user,
  selectedPeriod,
  onSelectedPeriodChange,
  onSheetSnapshotChange,
}) {
  const hasTeamScope = Boolean(user?.role === 'Lead' || user?.role === 'Manager' || user?.reportsTo);
  const isAdmin = user?.role === 'Admin';
  const defaultView = isAdmin ? 'all' : 'entry';
  const [activeView, setActiveView] = useState(defaultView);

  useEffect(() => {
    setActiveView(defaultView);
  }, [defaultView]);

  const views = isAdmin
    ? [{ key: 'all', label: 'All Timesheets' }]
    : [
        { key: 'entry', label: 'My Timesheet' },
        ...(hasTeamScope ? [{ key: 'approvals', label: 'Approvals' }, { key: 'team', label: 'Team History' }] : []),
        { key: 'history', label: 'Past Timesheets' },
      ];

  return (
    <div className="mte-module-stack">
      <div className="mte-subtabs">
        {views.map((view) => (
          <button
            key={view.key}
            type="button"
            className={activeView === view.key ? 'is-active' : ''}
            onClick={() => setActiveView(view.key)}
          >
            {view.label}
          </button>
        ))}
      </div>

      {activeView === 'entry' ? (
        <TimesheetPage
          user={user}
          selectedPeriod={selectedPeriod}
          onSelectedPeriodChange={onSelectedPeriodChange}
          onSheetSnapshotChange={onSheetSnapshotChange}
          embedded
        />
      ) : null}
      {activeView === 'approvals' ? <Approvals user={user} /> : null}
      {activeView === 'team' ? <TeamTimesheets user={user} /> : null}
      {activeView === 'history' ? <History user={user} onNavigate={() => setActiveView('entry')} /> : null}
      {activeView === 'all' ? <AdminTimesheets user={user} /> : null}
    </div>
  );
}

function getEntriesWorkHours(entries = []) {
  return entries
    .filter((entry) => (entry.entry_type || 'work') === 'work')
    .reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
}

function getEffectiveSummaryEntries(entries = []) {
  const absenceByDate = {};
  entries.forEach((entry) => {
    if (!['leave', 'holiday'].includes(entry.entry_type)) return;
    const date = entry.date;
    if (!date) return;
    absenceByDate[date] = (absenceByDate[date] || 0) + Number(entry.hours || 0);
  });

  const usedWorkByDate = {};
  return entries.map((entry) => {
    if ((entry.entry_type || 'work') !== 'work') return entry;
    const date = entry.date;
    const absenceHours = absenceByDate[date] || 0;
    if (!date || absenceHours <= 0) return entry;

    const remaining = Math.max(DAILY_WORK_HOUR_LIMIT - absenceHours - (usedWorkByDate[date] || 0), 0);
    const adjustedHours = Math.min(Number(entry.hours || 0), remaining);
    usedWorkByDate[date] = (usedWorkByDate[date] || 0) + adjustedHours;
    return { ...entry, hours: adjustedHours };
  });
}

function MyTimeSummaryWorkspace({ user, selectedPeriod, periods, liveTimesheetSnapshot }) {
  const userId = getUserId(user);
  const isAdmin = user?.role === 'Admin';
  const period = periods.find((item) => item.value === selectedPeriod) || periods[0];
  const [timesheet, setTimesheet] = useState(null);
  const [allTimesheets, setAllTimesheets] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [profile, setProfile] = useState(user || {});
  const [loading, setLoading] = useState(false);
  const [summaryFilters, setSummaryFilters] = useState({
    search: '',
    department: 'all',
    metric: 'all',
  });

  const dates = useMemo(() => {
    if (!period) return [];
    return eachDayOfInterval({ start: parseISO(period.start), end: parseISO(period.end) });
  }, [period]);

  const loadSummary = useCallback(() => {
    if (!userId || !period) return;
    setLoading(true);
    if (isAdmin) {
      Promise.allSettled([
        fetchAPI('/timesheets/all'),
        fetchAPI('/expenses?role=Admin'),
      ])
        .then(([timesheetResult, expenseResult]) => {
          const periodTimesheets = timesheetResult.status === 'fulfilled' && Array.isArray(timesheetResult.value)
            ? timesheetResult.value.filter((item) => item.period_start === period.start && item.period_end === period.end)
            : [];
          setAllTimesheets(periodTimesheets);
          setTimesheet(null);
          setExpenses(expenseResult.status === 'fulfilled' && Array.isArray(expenseResult.value)
            ? expenseResult.value.filter((expense) =>
                !expense.expense_date || (expense.expense_date >= period.start && expense.expense_date <= period.end)
              )
            : []);
          setProfile(user || {});
        })
        .finally(() => setLoading(false));
      return;
    }
    Promise.allSettled([
      fetchAPI(`/timesheets/employee/${userId}`),
      fetchAPI(`/expenses?employee_id=${userId}&role=${encodeURIComponent(user?.role || '')}`),
      fetchAPI(`/users/${userId}`),
    ])
      .then(([timesheetResult, expenseResult, profileResult]) => {
        const timesheets = timesheetResult.status === 'fulfilled' && Array.isArray(timesheetResult.value)
          ? timesheetResult.value
          : [];
        setTimesheet(timesheets.find((item) =>
          item.period_start === period.start && item.period_end === period.end
        ) || null);

        setExpenses(expenseResult.status === 'fulfilled' && Array.isArray(expenseResult.value)
          ? expenseResult.value.filter((expense) =>
              !expense.expense_date || (expense.expense_date >= period.start && expense.expense_date <= period.end)
            )
          : []);

        if (profileResult.status === 'fulfilled') setProfile(profileResult.value);
      })
      .finally(() => setLoading(false));
  }, [isAdmin, period, user, userId]);

  useEffect(() => {
    loadSummary();
    const refreshTimer = setInterval(loadSummary, 30000);
    return () => clearInterval(refreshTimer);
  }, [loadSummary]);

  const liveTimesheet = !isAdmin
    && liveTimesheetSnapshot?.period_start === period?.start
    && liveTimesheetSnapshot?.period_end === period?.end
    ? liveTimesheetSnapshot
    : null;
  const summaryTimesheet = liveTimesheet || timesheet;
  const entries = getEffectiveSummaryEntries(summaryTimesheet?.entries || []);
  const workEntries = entries.filter((entry) => (entry.entry_type || 'work') === 'work');
  const absenceEntries = entries.filter((entry) => ['leave', 'holiday'].includes(entry.entry_type));
  const expenseTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const workHours = workEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
  const absenceHours = absenceEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
  const weekdayCount = dates.filter((date) => {
    const day = date.getDay();
    return day >= 1 && day <= 5;
  }).length;
  const workSchedule = weekdayCount * DAILY_WORK_HOUR_LIMIT;
  const standardAvailable = Math.max(workSchedule - absenceHours, 0);
  const overtime = Math.max(workHours - standardAvailable, 0);
  const availablePercent = standardAvailable ? Math.round((workHours / standardAvailable) * 100) : 0;
  const assignmentMeta = getTimesheetAssignmentMeta({ ...profile, ...summaryTimesheet });
  const country = profile.countryRegion || profile.country || 'India';
  const location = assignmentMeta.workLocation === 'Not assigned' ? country : assignmentMeta.workLocation;

  const chargeRows = useMemo(() => {
    const grouped = {};
    workEntries.forEach((entry) => {
      const key = entry.charge_code || entry.charge_code_id || 'Unassigned';
      if (!grouped[key]) {
        grouped[key] = {
          label: `${entry.charge_code_name || entry.description || 'Charge Code'} (${entry.charge_code || key})`,
          hours: 0,
          expenses: 0,
        };
      }
      grouped[key].hours += Number(entry.hours || 0);
    });
    if (absenceHours > 0) {
      grouped.absence = {
        label: 'Public holiday / Absence',
        hours: 0,
        expenses: 0,
        absence: absenceHours,
      };
    }
    return Object.values(grouped);
  }, [absenceHours, workEntries]);

  const summaryRows = useMemo(() => [
    ...chargeRows,
    { label: 'Total', hours: workHours, expenses: expenseTotal, absence: absenceHours, isTotal: true },
    { label: 'Work Schedule', hours: workSchedule, expenses: '', absence: '', isMeta: true },
    { label: 'Overtime', hours: overtime || '', expenses: '', absence: '', isMeta: true },
    { label: 'Standard Available Hours', hours: standardAvailable || '', expenses: '', absence: '', isMeta: true },
    { label: 'Percentage of Standard Available Hours', hours: standardAvailable ? `${availablePercent}%` : '', expenses: '', absence: '', isMeta: true },
  ], [absenceHours, availablePercent, chargeRows, expenseTotal, overtime, standardAvailable, workHours, workSchedule]);

  const leaveBalance = profile.leaveBalance || {};
  const earnedLeave = Number(leaveBalance.earned ?? leaveBalance.earnedLeave ?? 0);
  const sickLeave = Number(leaveBalance.sick ?? leaveBalance.sickLeave ?? 0);
  const casualLeave = Number(leaveBalance.casual ?? leaveBalance.casualLeave ?? 0);
  const summaryCell = (value, decimals = 1) => {
    if (value === '' || value === undefined || value === null) return '';
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue.toFixed(decimals) : value;
  };

  const adminEmployeeRows = useMemo(() => {
    if (!isAdmin) return [];
    const grouped = {};
    allTimesheets.forEach((item) => {
      const key = item.employee_id || item.employee_email || item.employee_name || 'unknown';
      if (!grouped[key]) {
        grouped[key] = {
          employee: item.employee_name || 'Employee',
          email: item.employee_email || '',
          department: item.employee_department || 'Unassigned',
          hours: 0,
          expenses: 0,
          documents: [],
        };
      }
      grouped[key].hours += getEntriesWorkHours(getEffectiveSummaryEntries(item.entries || []));
    });
    expenses.forEach((expense) => {
      const key = expense.employee_id || expense.employee_email || expense.employee_name || 'unknown';
      if (!grouped[key]) {
        grouped[key] = {
          employee: expense.employee_name || 'Employee',
          email: expense.employee_email || '',
          department: expense.employee_department || 'Unassigned',
          hours: 0,
          expenses: 0,
          documents: [],
        };
      }
      grouped[key].expenses += Number(expense.amount || 0);
      if (expense.document?.url) grouped[key].documents.push(expense.document);
    });
    return Object.values(grouped).sort((a, b) => a.employee.localeCompare(b.employee));
  }, [allTimesheets, expenses, isAdmin]);
  const summaryDepartmentOptions = useMemo(
    () => Array.from(new Set(adminEmployeeRows.map((row) => row.department || 'Unassigned')))
      .sort((first, second) => first.localeCompare(second)),
    [adminEmployeeRows]
  );
  const summarySearch = summaryFilters.search.trim().toLowerCase();
  const filteredAdminEmployeeRows = useMemo(() => {
    if (!isAdmin) return [];
    return adminEmployeeRows.filter((row) => {
      const matchesSearch = !summarySearch
        || [row.employee, row.email, row.department]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(summarySearch));
      const matchesDepartment = summaryFilters.department === 'all'
        || row.department === summaryFilters.department;
      const matchesMetric = summaryFilters.metric === 'all'
        || (summaryFilters.metric === 'hours' && row.hours > 0)
        || (summaryFilters.metric === 'expenses' && row.expenses > 0)
        || (summaryFilters.metric === 'documents' && row.documents.length > 0);
      return matchesSearch && matchesDepartment && matchesMetric;
    });
  }, [adminEmployeeRows, isAdmin, summaryFilters.department, summaryFilters.metric, summarySearch]);

  const adminDepartmentRows = useMemo(() => {
    if (!isAdmin) return [];
    const grouped = {};
    filteredAdminEmployeeRows.forEach((row) => {
      const key = row.department || 'Unassigned';
      if (!grouped[key]) grouped[key] = { department: key, employees: 0, hours: 0, expenses: 0, documents: [] };
      grouped[key].employees += 1;
      grouped[key].hours += row.hours;
      grouped[key].expenses += row.expenses;
      grouped[key].documents.push(...row.documents);
    });
    return Object.values(grouped).sort((a, b) => a.department.localeCompare(b.department));
  }, [filteredAdminEmployeeRows, isAdmin]);
  const filteredSummaryRows = useMemo(() => {
    if (isAdmin) return [];
    return summaryRows.filter((row) => {
      if (!summarySearch) return true;
      return String(row.label || '').toLowerCase().includes(summarySearch);
    });
  }, [isAdmin, summaryRows, summarySearch]);
  const resetSummaryFilters = () => {
    setSummaryFilters({ search: '', department: 'all', metric: 'all' });
  };
  const exportSummary = () => {
    const rowsForExport = isAdmin
      ? [
          buildCsvRow(['Employee Wise Summary']),
          buildCsvRow(['Employee', 'Email', 'Department', 'Hours', 'Expenses', 'Documents']),
          ...filteredAdminEmployeeRows.map((row) => buildCsvRow([
            row.employee,
            row.email || '',
            row.department,
            row.hours.toFixed(2),
            row.expenses.toFixed(2),
            row.documents.map((document) => document.name || document.url || 'Document').join('; '),
          ])),
          buildCsvRow([]),
          buildCsvRow(['Department Wise Summary']),
          buildCsvRow(['Department', 'Employees', 'Hours', 'Expenses', 'Documents']),
          ...adminDepartmentRows.map((row) => buildCsvRow([
            row.department,
            row.employees,
            row.hours.toFixed(2),
            row.expenses.toFixed(2),
            row.documents.map((document) => document.name || document.url || 'Document').join('; '),
          ])),
        ]
      : [
          buildCsvRow(['Charge Code', 'Hours', 'Expenses', 'Chargeable', 'Absences']),
          ...filteredSummaryRows.map((row) => buildCsvRow([
            row.label,
            summaryCell(row.hours),
            summaryCell(row.expenses, 2),
            !row.isMeta ? summaryCell(row.hours) : '',
            row.absence ? Number(row.absence).toFixed(1) : '',
          ])),
        ];
    const csv = rowsForExport.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `summary_${period?.start || format(new Date(), 'yyyy-MM-dd')}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const summaryFilterCard = (
    <section className="mte-summary-filter-card">
      <div className="mte-summary-filter-head">
        <div>
          <h3>Summary Filters</h3>
          <p>{isAdmin ? 'Find employees by name, email, department, or records with hours, expenses, and documents.' : 'Find summary rows by charge code or category name.'}</p>
        </div>
        <div className="mte-summary-filter-actions">
          <button type="button" onClick={resetSummaryFilters}>
            <RefreshCw size={14} />
            <span>Reset</span>
          </button>
          <button type="button" className="is-primary" onClick={exportSummary}>
            <Download size={14} />
            <span>Export</span>
          </button>
        </div>
      </div>
      <div className={`mte-summary-filter-grid ${isAdmin ? '' : 'is-employee'}`}>
        <label className="mte-summary-filter-field mte-summary-filter-search">
          <span>Search</span>
          <input
            value={summaryFilters.search}
            onChange={(event) => setSummaryFilters((previous) => ({ ...previous, search: event.target.value }))}
            placeholder={isAdmin ? 'Employee, email, or department' : 'Charge code or summary row'}
          />
        </label>
        {isAdmin ? (
          <>
            <label className="mte-summary-filter-field">
              <span>Department</span>
              <select
                value={summaryFilters.department}
                onChange={(event) => setSummaryFilters((previous) => ({ ...previous, department: event.target.value }))}
              >
                <option value="all">All Departments</option>
                {summaryDepartmentOptions.map((department) => (
                  <option key={department} value={department}>{department}</option>
                ))}
              </select>
            </label>
            <label className="mte-summary-filter-field">
              <span>Metric</span>
              <select
                value={summaryFilters.metric}
                onChange={(event) => setSummaryFilters((previous) => ({ ...previous, metric: event.target.value }))}
              >
                <option value="all">All Records</option>
                <option value="hours">With Hours</option>
                <option value="expenses">With Expenses</option>
                <option value="documents">With Documents</option>
              </select>
            </label>
          </>
        ) : null}
      </div>
    </section>
  );

  if (isAdmin) {
    return (
      <div className="mte-summary-shell">
        {summaryFilterCard}

        <section className="mte-summary-group">
          <div className="mte-summary-group-header">
            <h3>Employee Wise Summary</h3>
            <span>{filteredAdminEmployeeRows.length} of {adminEmployeeRows.length} employees · {period?.label}</span>
          </div>
          <div className="mte-summary-table-wrap is-admin-employee-summary">
            <table className="mte-simple-table">
              <thead>
                <tr>
                  {['Employee', 'Email', 'Department', 'Hours', 'Expenses', 'Documents'].map((header) => <th key={header}>{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6}>Loading summary...</td></tr>
                ) : filteredAdminEmployeeRows.length === 0 ? (
                  <tr><td colSpan={6}>No employee data found for this period.</td></tr>
                ) : filteredAdminEmployeeRows.map((row) => (
                  <tr key={`${row.employee}-${row.email}`}>
                    <td title={row.employee}>{row.employee}</td>
                    <td title={row.email || '-'}>{row.email || '-'}</td>
                    <td title={row.department}>{row.department}</td>
                    <td>{row.hours.toFixed(2)}</td>
                    <td>{row.expenses.toFixed(2)}</td>
                    <td>
                      {row.documents.length ? row.documents.map((document) => (
                        <a key={document.url} className="mte-summary-document-link" href={document.url} target="_blank" rel="noreferrer" title={document.name || 'Document'}>
                          {document.name || 'Document'}
                        </a>
                      )) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mte-summary-group">
          <div className="mte-summary-group-header">
            <h3>Department Wise Summary</h3>
            <span>{adminDepartmentRows.length} department{adminDepartmentRows.length === 1 ? '' : 's'} in view</span>
          </div>
          <div className="mte-summary-table-wrap is-admin-department-summary">
            <table className="mte-simple-table">
              <thead>
                <tr>
                  {['Department', 'Employees', 'Hours', 'Expenses', 'Documents'].map((header) => <th key={header}>{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {adminDepartmentRows.length === 0 ? (
                  <tr><td colSpan={5}>No department data found for this period.</td></tr>
                ) : adminDepartmentRows.map((row) => (
                  <tr key={row.department}>
                    <td title={row.department}>{row.department}</td>
                    <td>{row.employees}</td>
                    <td>{row.hours.toFixed(2)}</td>
                    <td>{row.expenses.toFixed(2)}</td>
                    <td>
                      {row.documents.length ? row.documents.map((document) => (
                        <a key={document.url} className="mte-summary-document-link" href={document.url} target="_blank" rel="noreferrer" title={document.name || 'Document'}>
                          {document.name || 'Document'}
                        </a>
                      )) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mte-summary-shell">
      {summaryFilterCard}

      <div className="mte-summary-table-wrap is-employee-summary">
        <table className="mte-summary-table">
          <colgroup>
            <col className="mte-summary-charge-col" />
            {Array.from({ length: 10 }).map((_, index) => (
              <col key={`summary-metric-col-${index}`} className="mte-summary-metric-col" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>Charge Code</th>
              <th colSpan={2}>Current Time Report <span>i</span></th>
              <th colSpan={6}>Projected Productivity Metrics <span>i</span></th>
              <th colSpan={2}>Adjustments <span>i</span></th>
            </tr>
            <tr>
              <th>Hours</th>
              <th>Expenses</th>
              <th>Chargeable <span>i</span></th>
              <th>Client Facing <span>i</span></th>
              <th>Market Facing <span>i</span></th>
              <th>Recovery <span>i</span></th>
              <th>Other <span>i</span></th>
              <th>Absences <span>i</span></th>
              <th>Hours</th>
              <th>Expenses</th>
            </tr>
          </thead>
          <tbody>
            {loading && !summaryTimesheet ? (
              <tr><td colSpan={11}>Loading summary...</td></tr>
            ) : filteredSummaryRows.length === 0 ? (
              <tr><td colSpan={11}>No summary rows match the current filters.</td></tr>
            ) : filteredSummaryRows.map((row) => (
              <tr key={row.label} className={row.isTotal || row.isMeta ? 'is-summary-row' : ''}>
                <td title={row.label}>{row.label}</td>
                <td>{summaryCell(row.hours)}</td>
                <td>{summaryCell(row.expenses, 2)}</td>
                <td>{!row.isMeta ? summaryCell(row.hours) : ''}</td>
                <td />
                <td />
                <td />
                <td />
                <td>{row.absence ? Number(row.absence).toFixed(1) : ''}</td>
                <td />
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <table className="mte-summary-location-table">
        <thead>
          <tr>
            <th>Country/Region ↑</th>
            <th>Location</th>
            <th>Hours</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{country}</td>
            <td>{location}</td>
            <td>{workHours.toFixed(2)}</td>
          </tr>
          <tr>
            <td />
            <td>Total</td>
            <td>{workHours.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mte-summary-leave-copy">
        <p><strong>Annual Chargeability Contribution:</strong> {availablePercent || 100}% <span>i</span></p>
        <p>As of {period?.end ? format(parseISO(period.end), 'M/d/yyyy') : format(new Date(), 'M/d/yyyy')}, you have the following leave balances:</p>
        <p>Earned Leave: {(earnedLeave * DAILY_WORK_HOUR_LIMIT).toFixed(2)} hours or {earnedLeave.toFixed(2)} days</p>
        <p>Sick & Wellness Leave: {(sickLeave * DAILY_WORK_HOUR_LIMIT).toFixed(2)} hours or {sickLeave.toFixed(2)} days</p>
        <p>Casual Leave: {(casualLeave * DAILY_WORK_HOUR_LIMIT).toFixed(2)} hours or {casualLeave.toFixed(2)} days</p>
        <p>Sick & Wellness and Casual Leave: 0.00 hours or 0.00 days</p>
      </div>
    </div>
  );
}

function PortalSummaryWorkspace({ user, selectedPeriod, periods, liveTimesheetSnapshot }) {
  return (
    <MyTimeSummaryWorkspace
      user={user}
      selectedPeriod={selectedPeriod}
      periods={periods}
      liveTimesheetSnapshot={liveTimesheetSnapshot}
    />
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function Timesheets({ user }) {
  const periods = useMemo(() => getAvailablePeriods(), []);
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0]?.value || '');
  const [activeModule, setActiveModule] = useState('time');
  const [liveTimesheetSnapshots, setLiveTimesheetSnapshots] = useState({});
  const handleSheetSnapshotChange = useCallback((periodValue, snapshot) => {
    setLiveTimesheetSnapshots((previous) => ({
      ...previous,
      [periodValue]: snapshot,
    }));
  }, []);

  const modules = [
    { key: 'time', label: 'TIME' },
    { key: 'expenses', label: 'EXPENSES' },
    { key: 'locations', label: 'LOCATIONS' },
    { key: 'charge_codes', label: 'CHARGE CODES' },
    ...(user?.role === 'Admin' ? [{ key: 'assignments', label: 'ASSIGNMENTS' }] : []),
    { key: 'adjustments', label: 'ADJUSTMENTS' },
    { key: 'summary', label: 'SUMMARY' },
    { key: 'preferences', label: 'PREFERENCES' },
  ];

  const renderActiveModule = () => {
    switch (activeModule) {
      case 'time':
        return (
          <PortalTimeWorkspace
            user={user}
            selectedPeriod={selectedPeriod}
            onSelectedPeriodChange={setSelectedPeriod}
            onSheetSnapshotChange={handleSheetSnapshotChange}
          />
        );
      case 'expenses':
        return <ExpensesPanel user={user} />;
      case 'locations':
        return <LocationsPanel selectedPeriod={selectedPeriod} periods={periods} user={user} />;
      case 'charge_codes':
        return user?.role === 'Admin' ? <ChargeCodeAdmin user={user} /> : <AssignedChargeCodesPanel user={user} />;
      case 'assignments':
        return user?.role === 'Admin'
          ? <AssignmentAdmin user={user} />
          : (
            <PortalTimeWorkspace
              user={user}
              selectedPeriod={selectedPeriod}
              onSelectedPeriodChange={setSelectedPeriod}
              onSheetSnapshotChange={handleSheetSnapshotChange}
            />
          );
      case 'adjustments':
        return <AdjustmentsPanel user={user} />;
      case 'summary':
        return (
          <PortalSummaryWorkspace
            user={user}
            selectedPeriod={selectedPeriod}
            periods={periods}
            liveTimesheetSnapshot={liveTimesheetSnapshots[selectedPeriod]}
          />
        );
      case 'preferences':
        return <PreferencesPanel user={user} />;
      default:
        return (
          <PortalTimeWorkspace
            user={user}
            selectedPeriod={selectedPeriod}
            onSelectedPeriodChange={setSelectedPeriod}
            onSheetSnapshotChange={handleSheetSnapshotChange}
          />
        );
    }
  };

  return (
    <div className="mte-portal-shell">
      <div className="mte-portal-tabs">
        {modules.map((module) => (
          <button
            type="button"
            key={module.key}
            className={activeModule === module.key ? 'is-active' : ''}
            onClick={() => setActiveModule(module.key)}
          >
            {module.label}
          </button>
        ))}
      </div>

      <div className="mte-portal-content">
        {renderActiveModule()}
      </div>
    </div>
  );
}
