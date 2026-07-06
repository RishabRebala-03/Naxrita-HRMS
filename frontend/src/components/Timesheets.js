// Timesheets.js — Production-grade, matches the existing codebase architecture
import { Children, createContext, useContext, useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  parseISO, subMonths, startOfQuarter, endOfQuarter, subQuarters,
  startOfYear, endOfYear, subYears,
} from 'date-fns';
import {
  Plus, Trash2, AlertCircle,
  CheckCircle, CheckCircle2, XCircle, Clock, Eye,
  Download, TrendingUp, BarChart3, UserCheck,
	  FileText, Calendar, CalendarRange, RefreshCw, CircleHelp, Users, Building2,
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
import { buildRequesterHeaders } from '../utils/requester';
import { formatDateTimeIST } from '../utils/dateTime';

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

const TimesheetUiContext = createContext({
  notify: () => {},
  confirmAction: async () => false,
  promptAction: async () => null,
});

function useTimesheetUi() {
  return useContext(TimesheetUiContext);
}

function TimesheetUiProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const notify = useCallback((message, tone = 'info') => {
    setToast({ message, tone });
  }, []);

  const confirmAction = useCallback(({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary' }) => (
    new Promise((resolve) => {
      setDialog({
        type: 'confirm',
        title,
        message,
        confirmLabel,
        cancelLabel,
        tone,
        onConfirm: () => {
          setDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setDialog(null);
          resolve(false);
        },
      });
    })
  ), []);

  const promptAction = useCallback(({
    title,
    message,
    confirmLabel = 'Submit',
    cancelLabel = 'Cancel',
    tone = 'danger',
    placeholder = '',
    initialValue = '',
    multiline = false,
    required = false,
  }) => (
    new Promise((resolve) => {
      setDialog({
        type: 'prompt',
        title,
        message,
        confirmLabel,
        cancelLabel,
        tone,
        placeholder,
        initialValue,
        multiline,
        required,
        onConfirm: (value) => {
          setDialog(null);
          resolve(value);
        },
        onCancel: () => {
          setDialog(null);
          resolve(null);
        },
      });
    })
  ), []);

  return (
    <TimesheetUiContext.Provider value={{ notify, confirmAction, promptAction }}>
      {children}
      {toast ? <TimesheetToast toast={toast} onClose={() => setToast(null)} /> : null}
      {dialog ? <TimesheetDialog dialog={dialog} onDismiss={dialog.onCancel} /> : null}
    </TimesheetUiContext.Provider>
  );
}

function TimesheetToast({ toast, onClose }) {
  const tones = {
    success: { bg: C.greenLight, border: C.greenBorder, color: C.green },
    error: { bg: C.redLight, border: C.redBorder, color: C.red },
    warning: { bg: C.amberLight, border: C.amberBorder, color: C.amber },
    info: { bg: C.purpleLight, border: C.purpleBorder, color: C.purple },
  };
  const tone = tones[toast.tone] || tones.info;

  return (
    <div style={{
      position: 'fixed',
      top: '24px',
      right: '24px',
      zIndex: 11000,
      maxWidth: '380px',
      width: 'calc(100vw - 32px)',
    }}>
      <div style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        color: tone.color,
        borderRadius: '14px',
        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.14)',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
      }}>
        <div style={{ flex: 1, fontSize: '14px', lineHeight: 1.5, color: C.text }}>{toast.message}</div>
        <button type="button" onClick={onClose} style={{ ...S.btnIcon, color: tone.color }}>
          <XCircle size={16} />
        </button>
      </div>
    </div>
  );
}

function TimesheetDialog({ dialog, onDismiss }) {
  const [value, setValue] = useState(dialog.initialValue || '');
  const [touched, setTouched] = useState(false);

  const toneStyles = {
    primary: { buttonBg: C.purple, buttonColor: C.white, buttonBorder: C.purple },
    danger: { buttonBg: C.red, buttonColor: C.white, buttonBorder: C.red },
  };
  const tone = toneStyles[dialog.tone] || toneStyles.primary;
  const isInvalid = dialog.type === 'prompt' && dialog.required && !String(value || '').trim();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 12000,
        background: 'rgba(15, 23, 42, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onDismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        style={{
          width: 'min(560px, 100%)',
          background: C.white,
          borderRadius: '22px',
          border: `1px solid ${C.border}`,
          boxShadow: '0 28px 70px rgba(15, 23, 42, 0.24)',
          padding: '24px',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: C.text }}>{dialog.title}</h3>
          <p style={{ margin: '10px 0 0 0', fontSize: '14px', lineHeight: 1.6, color: C.textMid }}>{dialog.message}</p>
        </div>

        {dialog.type === 'prompt' ? (
          <div style={{ marginBottom: '18px' }}>
            {dialog.multiline ? (
              <textarea
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onBlur={() => setTouched(true)}
                placeholder={dialog.placeholder}
                rows={5}
                style={{ ...S.input, width: '100%', resize: 'vertical', minHeight: '120px' }}
              />
            ) : (
              <input
                value={value}
                onChange={(event) => setValue(event.target.value)}
                onBlur={() => setTouched(true)}
                placeholder={dialog.placeholder}
                style={{ ...S.input, width: '100%' }}
              />
            )}
            {touched && isInvalid ? (
              <div style={{ marginTop: '8px', fontSize: '12px', color: C.red }}>This field is required.</div>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
          <button type="button" onClick={dialog.onCancel} style={S.btnSecondary}>
            {dialog.cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              setTouched(true);
              if (isInvalid) return;
              dialog.onConfirm(dialog.type === 'prompt' ? String(value || '').trim() : true);
            }}
            style={{
              ...S.btnPrimary,
              background: tone.buttonBg,
              color: tone.buttonColor,
              border: `1px solid ${tone.buttonBorder}`,
            }}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── fetchAPI ────────────────────────────────────────────────────────────────
const fetchAPI = async (endpoint, options = {}) => {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: buildRequesterHeaders(null, { 'Content-Type': 'application/json', ...options.headers }),
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
    headers: buildRequesterHeaders(),
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
const formatDateTime = (value) => {
  return formatDateTimeIST(value, '—');
};
const getRoleKey = (user) => String(user?.role || '').trim().toLowerCase();
const isLeadUser = (user) => getRoleKey(user) === 'lead';
const isManagerUser = (user) => getRoleKey(user) === 'manager';
const isAdminUser = (user) => getRoleKey(user) === 'admin';

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
      className="mte-charge-code-picker"
      popoverClassName="mte-charge-code-popover"
      tableHeaders={['Code', 'Name', 'Client', 'Type']}
      options={[
        {
          value: '',
          label: 'No charge code selected',
          description: 'Clear this row',
          meta: { code: 'Clear', name: 'No charge code selected', client: '-', type: '-' },
        },
        ...chargeCodes
          .filter((cc) => !unavailableIds.has(cc.charge_code_id))
          .map((cc) => ({
            value: cc.charge_code_id,
            label: `${cc.charge_code} - ${cc.charge_code_name}`,
            description: [cc.client || cc.project_name, cc.type, cc.country].filter(Boolean).join(' • '),
            meta: {
              code: cc.charge_code,
              name: cc.charge_code_name,
              client: cc.client || cc.project_name || '-',
              type: cc.type || cc.sub_type || '-',
            },
          })),
      ]}
    />
  );
}

const blankDateRange = { start: '', end: '' };

const splitPreferenceEntries = (value = '') => String(value)
  .split(/[,\n;]+/)
  .map((item) => item.trim())
  .filter(Boolean);

const mergePreferenceEntries = (current = '', additions = []) => {
  const next = [];
  const seen = new Set();
  [...splitPreferenceEntries(current), ...additions].forEach((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    next.push(item);
  });
  return next.join('\n');
};

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
  const employeeId = source.employee_external_id || source.employeeId || source.employeeCode || source.employee_id || '';

  return {
    workLocation: assignedLocation || 'Not assigned',
    assignedLocation: explicitAssignedLocation || 'Not assigned',
    companyCode,
    costCenter,
    companyCostCenter: companyCostCenter || 'Not assigned',
    employeeId: employeeId || 'Not assigned',
  };
};

const SYSTEM_ABSENCE_CHARGE_CODES = [
  { key: 'adoption_leave', code: '955X06', name: 'Adoption Leave' },
  { key: 'bereavement_leave', code: '955X02', name: 'Bereavement Leave' },
  { key: 'casual_leave', code: '955X10', name: 'Casual leave' },
  { key: 'client_specific_holiday', code: '970X01', name: 'Client Specific holiday' },
  { key: 'compensatory_off', code: '970X01', name: 'Compensatory off' },
  { key: 'contingency_leave', code: '955X05', name: 'Contingency Leave' },
  { key: 'earned_leave', code: '900X00', name: 'Earned Leave' },
  { key: 'leave_with_loss_of_pay', code: '955X18', name: 'Leave with loss of pay' },
  { key: 'maternity_leave', code: '955X04', name: 'Maternity Leave' },
  { key: 'optional_holiday', code: '970X03', name: 'Optional holiday' },
  { key: 'other_approved_absence', code: '955X00', name: 'Other Approved Absence' },
  { key: 'overseas_holiday', code: '970X02', name: 'Overseas holiday' },
  { key: 'paternity_leave', code: '955X08', name: 'Paternity Leave' },
  { key: 'public_holiday', code: '970X00', name: 'Public holiday' },
  { key: 'secondary_caregiver_leave', code: '955X19', name: 'Secondary Caregiver Leave' },
  { key: 'sick_wellness_leave', code: '950X00', name: 'Sick & Wellness Leave' },
  { key: 'surrogacy_leave', code: '955X07', name: 'Surrogacy Leave' },
].map((item) => ({
  ...item,
  _id: `system-${item.key}`,
  charge_code_id: `system-${item.key}`,
  charge_code: item.code,
  charge_code_name: item.name,
  description: item.name,
  type: 'Training/Recruiting/At',
  sub_type: 'Absence',
  client: '',
  country: '',
  owner_name: 'naxrita',
  is_active: true,
  is_system: true,
}));

const SYSTEM_ABSENCE_BY_KEY = Object.fromEntries(
  SYSTEM_ABSENCE_CHARGE_CODES.map((item) => [item.key, item])
);

const LEAVE_TYPE_TO_ABSENCE_KEY = {
  adoption: 'adoption_leave',
  'adoption leave': 'adoption_leave',
  bereavement: 'bereavement_leave',
  'bereavement leave': 'bereavement_leave',
  casual: 'casual_leave',
  'casual leave': 'casual_leave',
  'client specific holiday': 'client_specific_holiday',
  'compensatory off': 'compensatory_off',
  contingency: 'contingency_leave',
  'contingency leave': 'contingency_leave',
  planned: 'earned_leave',
  earned: 'earned_leave',
  'earned leave': 'earned_leave',
  lwp: 'leave_with_loss_of_pay',
  lop: 'leave_with_loss_of_pay',
  'leave without pay': 'leave_with_loss_of_pay',
  'leave with loss of pay': 'leave_with_loss_of_pay',
  maternity: 'maternity_leave',
  'maternity leave': 'maternity_leave',
  optional: 'optional_holiday',
  'optional holiday': 'optional_holiday',
  'other approved absence': 'other_approved_absence',
  'overseas holiday': 'overseas_holiday',
  paternity: 'paternity_leave',
  'paternity leave': 'paternity_leave',
  'secondary caregiver': 'secondary_caregiver_leave',
  'secondary caregiver leave': 'secondary_caregiver_leave',
  sick: 'sick_wellness_leave',
  'sick leave': 'sick_wellness_leave',
  'sick wellness': 'sick_wellness_leave',
  'sick and wellness': 'sick_wellness_leave',
  'sick & wellness': 'sick_wellness_leave',
  'sick & wellness leave': 'sick_wellness_leave',
  surrogacy: 'surrogacy_leave',
  'surrogacy leave': 'surrogacy_leave',
};

const normalizeAbsenceLabel = (value) =>
  String(value || '')
    .replace(/&/g, ' and ')
    .replace(/[-_]/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');

const isEarlyLogoutLikeLeave = (leave = {}) => {
  const values = [
    leave?.leave_type,
    leave?.leaveType,
    leave?.charge_code_name,
    leave?.description,
    leave?.display_code,
    leave?.code,
    leave?.charge_code,
  ];
  return values.some((value) => {
    const normalized = normalizeAbsenceLabel(value);
    return normalized === 'early logout' || normalized === 'el';
  });
};

const getAbsenceChargeCode = (leaveType) => {
  const normalized = normalizeAbsenceLabel(leaveType);
  const referenceKey = LEAVE_TYPE_TO_ABSENCE_KEY[normalized];
  if (referenceKey && SYSTEM_ABSENCE_BY_KEY[referenceKey]) return SYSTEM_ABSENCE_BY_KEY[referenceKey];

  const exactReference = SYSTEM_ABSENCE_CHARGE_CODES.find(
    (item) => normalizeAbsenceLabel(item.name) === normalized
  );
  if (exactReference) return exactReference;

  const cleanType = String(leaveType || '').trim();
  if (cleanType) {
    return {
      key: `custom-${normalized || 'leave'}`,
      code: cleanType.slice(0, 3).toUpperCase(),
      name: cleanType.toLowerCase().includes('leave') ? cleanType : `${cleanType} Leave`,
    };
  }
  return SYSTEM_ABSENCE_BY_KEY.other_approved_absence;
};

const PUBLIC_HOLIDAY_CHARGE_CODE = SYSTEM_ABSENCE_BY_KEY.public_holiday;

const LEAVE_TYPE_DISPLAY_CODE_MAP = {
  casual: 'CL',
  'casual leave': 'CL',
  planned: 'PL',
  earned: 'PL',
  'earned leave': 'PL',
  sick: 'SL',
  'sick leave': 'SL',
  'sick wellness': 'SL',
  'sick and wellness': 'SL',
  'sick & wellness': 'SL',
  'sick & wellness leave': 'SL',
  optional: 'OL',
  'optional holiday': 'OL',
  lwp: 'LWP',
  lop: 'LWP',
  'leave without pay': 'LWP',
  'leave with loss of pay': 'LWP',
};

const getLeaveTypeDisplayCode = (leaveType) => {
  const normalized = normalizeAbsenceLabel(leaveType);
  return LEAVE_TYPE_DISPLAY_CODE_MAP[normalized] || getAbsenceChargeCode(leaveType).code;
};

const getTimesheetEntryDisplayCode = (entry = {}) => {
  if (entry.entry_type === 'holiday') return 'PH';
  if (entry.entry_type === 'leave') {
    return entry.display_code || getLeaveTypeDisplayCode(entry.leave_type || entry.charge_code_name || entry.description);
  }
  return '';
};

const normalizeDateKey = (value) => {
  if (!value) return '';
  return String(value).slice(0, 10);
};

const getLeaveCode = (leaveType) => {
  return getAbsenceChargeCode(leaveType).code;
};

const getLeaveDisplayLabel = (leaveType) => {
  return getAbsenceChargeCode(leaveType).name;
};

const buildApprovedLeaveEntries = (approvedLeaves = [], dates = []) => {
  if (!dates.length) return [];

  const dateSet = new Set(dates);
  const leaveByDate = new Map();

  approvedLeaves.forEach((leave) => {
    if (isEarlyLogoutLikeLeave(leave)) return;

    const start = normalizeDateKey(leave.approved_start_date || leave.start_date);
    const end = normalizeDateKey(leave.approved_end_date || leave.end_date || start);
    if (!start || !end) return;

    eachDayOfInterval({ start: parseISO(start), end: parseISO(end) }).forEach((dateValue) => {
      const dateKey = format(dateValue, 'yyyy-MM-dd');
      const dayOfWeek = dateValue.getDay();
      if (!dateSet.has(dateKey) || dayOfWeek === 0 || dayOfWeek === 6 || leaveByDate.has(dateKey)) return;

      const code = getLeaveCode(leave.leave_type);
      const displayCode = getLeaveTypeDisplayCode(leave.leave_type);
      const isHalfDay = Boolean(leave.is_half_day);
      const hours = isHalfDay ? DAILY_WORK_HOUR_LIMIT / 2 : DAILY_WORK_HOUR_LIMIT;

      leaveByDate.set(dateKey, {
        date: dateKey,
        startDate: start,
        endDate: end,
        start_date: leave.start_date,
        end_date: leave.end_date,
        approved_start_date: leave.approved_start_date,
        approved_end_date: leave.approved_end_date,
        code,
        displayCode,
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

const LEAVE_CANCELLATION_CUTOFF_HOURS = 48;

const getApprovedLeaveStartKey = (leave = {}) =>
  normalizeDateKey(leave.approved_start_date || leave.approvedStartDate || leave.startDate || leave.start_date || leave.start || leave.date);

const getApprovedLeaveCancellationCutoff = (leave = {}) => {
  const startKey = getApprovedLeaveStartKey(leave);
  if (!startKey) return null;
  const startDate = new Date(`${startKey}T00:00:00`);
  if (Number.isNaN(startDate.getTime())) return null;
  return new Date(startDate.getTime() - (LEAVE_CANCELLATION_CUTOFF_HOURS * 60 * 60 * 1000));
};

const canEmployeeCancelApprovedLeave = (leave = {}) => {
  const cutoff = getApprovedLeaveCancellationCutoff(leave);
  return Boolean(cutoff && Date.now() <= cutoff.getTime());
};

const normalizeAdjustmentPayload = (adjustments = {}) =>
  Object.fromEntries(
    Object.entries(adjustments || {})
      .filter(([date, value]) => {
        const hours = Number(value);
        return normalizeDateKey(date) && Number.isFinite(hours);
      })
      .map(([date, value]) => [normalizeDateKey(date), Math.min(Math.max(Number(value), 0), DAILY_WORK_HOUR_LIMIT)])
  );

const getDefaultWorkScheduleValue = (dateStr) => (isWeekendDate(dateStr) ? 0 : DAILY_WORK_HOUR_LIMIT);

const buildDefaultWorkSchedule = (dates = []) =>
  Object.fromEntries(dates.map((date) => [date, getDefaultWorkScheduleValue(date)]));

const getTimesheetWorkScheduleByDate = (source = {}, dates = []) => {
  const normalized = normalizeAdjustmentPayload(
    source.work_schedule_by_date
    || source.work_schedule
    || {}
  );
  return dates.reduce((acc, date) => {
    acc[date] = Object.prototype.hasOwnProperty.call(normalized, date)
      ? normalized[date]
      : getDefaultWorkScheduleValue(date);
    return acc;
  }, {});
};

const formatTimesheetHourValue = (hours) => {
  const numericHours = Number(hours);
  if (!Number.isFinite(numericHours) || numericHours <= 0) return '';
  return Number.isInteger(numericHours)
    ? String(numericHours)
    : String(parseFloat(numericHours.toFixed(2)));
};

const formatTimesheetHoursWithSuffix = (hours) => {
  const value = formatTimesheetHourValue(hours);
  return value ? `${value}h` : '';
};

const getDefaultWorkEntryValue = (dateStr, defaultHoursByDate = {}) => {
  const defaultHours = Number(defaultHoursByDate[dateStr] || 0);
  return formatTimesheetHourValue(defaultHours);
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

const LOCATION_STORAGE_EVENT = 'mte-locations-updated';

const getLocationStorageKey = (userId, periodValue) => `mte_locations_${userId}_${periodValue}`;

const normalizeLocationMap = (locations = {}, dates = []) => {
  const validDates = dates.length ? new Set(dates) : null;
  return Object.fromEntries(
    Object.entries(locations || {})
      .map(([date, location]) => [normalizeDateKey(date), String(location || '').trim()])
      .filter(([date, location]) => date && location && (!validDates || validDates.has(date)))
  );
};

const areLocationMapsEqual = (first = {}, second = {}) => {
  const firstKeys = Object.keys(first || {}).sort();
  const secondKeys = Object.keys(second || {}).sort();
  if (firstKeys.length !== secondKeys.length) return false;
  return firstKeys.every((key, index) => key === secondKeys[index] && first[key] === second[key]);
};

const getTimesheetWorkLocationsByDate = (source = {}, dates = []) =>
  normalizeLocationMap(
    source.employee_work_locations_by_date
    || source.work_locations_by_date
    || source.daily_locations,
    dates
  );

const getTimesheetAssignedLocationsByDate = (source = {}, dates = []) =>
  normalizeLocationMap(
    source.employee_assigned_locations_by_date
    || source.assigned_locations_by_date,
    dates
  );

const readSavedPeriodLocations = (userId, periodValue, dates = []) => {
  if (!userId || !periodValue || typeof localStorage === 'undefined') {
    return { dailyLocations: {}, assignedLocations: {} };
  }
  try {
    const saved = JSON.parse(localStorage.getItem(getLocationStorageKey(userId, periodValue)) || '{}') || {};
    return {
      ...saved,
      dailyLocations: normalizeLocationMap(saved.dailyLocations, dates),
      assignedLocations: normalizeLocationMap(saved.assignedLocations, dates),
    };
  } catch (_) {
    return { dailyLocations: {}, assignedLocations: {} };
  }
};

const writeSavedPeriodLocations = (userId, periodValue, payload) => {
  if (!userId || !periodValue || typeof localStorage === 'undefined') return;
  localStorage.setItem(getLocationStorageKey(userId, periodValue), JSON.stringify(payload || {}));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LOCATION_STORAGE_EVENT, {
      detail: { userId, periodValue, locations: payload || {} },
    }));
  }
};

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
        displayCode: leave.displayCode,
        label: leave.label,
        hoursByDate: {},
        leaveByDate: {},
        totalHours: 0,
      });
    }

    const row = grouped.get(key);
    const hours = Number(leave.hours || 0);
    row.hoursByDate[leave.date] = (row.hoursByDate[leave.date] || 0) + hours;
    row.leaveByDate[leave.date] = leave;
    row.totalHours += hours;
  });

  return Array.from(grouped.values());
};

const getTimesheetEntryChargeCodeMeta = (entry = {}, ccLookup = {}) => {
  if (entry.entry_type === 'holiday') {
    const storedCode = entry.charge_code || entry.code || '';
    return {
      code: storedCode && storedCode !== 'PH' ? storedCode : PUBLIC_HOLIDAY_CHARGE_CODE.code,
      name: entry.charge_code_name || PUBLIC_HOLIDAY_CHARGE_CODE.name,
    };
  }

  if (entry.entry_type === 'leave') {
    const reference = getAbsenceChargeCode(entry.leave_type || entry.charge_code_name || entry.description);
    const storedCode = entry.charge_code || entry.leave_code || '';
    const legacyCode = ['PL', 'SL', 'OL', 'LWP', 'EL'].includes(storedCode);
    return {
      code: storedCode && !legacyCode ? storedCode : reference.code,
      name: entry.charge_code_name && !legacyCode ? entry.charge_code_name : reference.name,
    };
  }

  const lookupKey = entry.charge_code_id || entry.charge_code || entry.code || '';
  const looked = ccLookup[lookupKey] || ccLookup[entry.charge_code_id] || ccLookup[entry.charge_code] || {};
  return {
    code: entry.charge_code || entry.code || looked.code || '',
    name: entry.charge_code_name || looked.name || entry.description || '',
  };
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
      display_code: leave.displayCode,
      charge_code: leave.code,
      charge_code_name: leave.label,
      hours: Number(leave.hours || 0),
      description: leave.label,
      leave_id: leave.leaveId,
      is_half_day: leave.isHalfDay,
      half_day_period: leave.halfDayPeriod,
    }));

  const holidayEntries = holidays.map((holiday) => {
    const reference = getTimesheetEntryChargeCodeMeta({ ...holiday, entry_type: 'holiday' });
    return {
      date: holiday.date,
      entry_type: 'holiday',
      holiday_name: holiday.holiday_name || holiday.name || '',
      code: reference.code,
      display_code: 'PH',
      charge_code: reference.code,
      charge_code_name: reference.name,
      hours: Number(holiday.hours || DAILY_WORK_HOUR_LIMIT),
      description: holiday.description || reference.name,
    };
  });

  return [...workEntries, ...leaveEntries, ...holidayEntries];
};

// ─── TimesheetGrid ────────────────────────────────────────────────────────────
function TimesheetGrid({
  dates, rows, chargeCodes, onRowUpdate,
  readOnly = false, approvedLeaves = [], holidays = [],
  assignmentMeta = {},
  workLocationsByDate = {},
  assignedLocationsByDate = {},
  workScheduleByDate = {},
  dailyOvertime = {},
  holidayPayout = {},
  onAdjustmentChange,
  onLeaveCancel,
  selectedRowId = '',
  onRowSelect,
}) {
  const { notify } = useTimesheetUi();
  const limitAlertRef = useRef('');
  const [editingCell, setEditingCell] = useState('');
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
  const holidayChargeCodeForDate = (dateStr) =>
    getTimesheetEntryChargeCodeMeta({ ...(holidayByDate[dateStr] || {}), entry_type: 'holiday' });
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
  const formatHoursValue = (hours) => {
    const numericHours = Number(hours);
    if (!Number.isFinite(numericHours)) return '';
    const roundedHours = Math.round(numericHours * 100) / 100;
    return Number.isInteger(roundedHours * 10)
      ? roundedHours.toFixed(1)
      : roundedHours.toFixed(2);
  };
  const displayHours = (hours, showZero = false) => {
    if (!hours && showZero) return '';
    return hours ? formatHoursValue(hours) : '';
  };
  const displayHoursWithSuffix = (hours) => {
    const value = displayHours(hours);
    return value ? `${value}h` : '';
  };
  const holidayHoursForDate = (dateStr) => (holidayByDate[dateStr] ? WORKDAY_HOURS : 0);
  const leaveHoursForDate = (dateStr) => (leaveByDate[dateStr]?.hours || 0);
  const workHourLimitForDate = (dateStr) =>
    Math.max(0, WORKDAY_HOURS - holidayHoursForDate(dateStr) - leaveHoursForDate(dateStr));
  const workScheduleForDate = (dateStr) => getAdjustmentValue(workScheduleByDate, dateStr, getDefaultWorkScheduleValue(dateStr));
  const maxHoursForRowOnDate = (rowId, dateStr) => {
    const otherRowHours = rows.reduce((sum, currentRow) => {
      if (currentRow.id === rowId) return sum;
      return sum + numericVal(getEntry(currentRow, dateStr));
    }, 0);
    return Math.max(0, workHourLimitForDate(dateStr) - otherRowHours);
  };
  const totalHoursForDate = (dateStr) => getColTotal(dateStr) + holidayHoursForDate(dateStr) + leaveHoursForDate(dateStr);
  const supportCheckboxRows = [
    'Shift Allowance – Shift Type A',
    'Shift Allowance – Shift Type B',
    'Shift Allowance – Shift Type C',
    'On Call – Primary Support',
    'On Call – Secondary Support',
    'On Call – Support By Unassigned',
  ];
  const getAdjustmentValue = (source, dateStr, fallback = 0) => (
    Object.prototype.hasOwnProperty.call(source || {}, dateStr)
      ? Number(source[dateStr] || 0)
      : fallback
  );
  const adjustmentInputValue = (source, dateStr, fallback = 0) => {
    const value = getAdjustmentValue(source, dateStr, fallback);
    if (!value) return '';
    return formatHoursValue(value);
  };
  const getAdjustmentLabel = (kind) => (
    kind === 'daily_overtime'
      ? 'Daily overtime'
      : kind === 'holiday_payout'
      ? 'Holiday payout'
      : 'Work schedule'
  );
  const setAdjustmentValue = (kind, dateStr, rawValue) => {
    const typedHours = parseFloat(rawValue);
    const cappedHours = Number.isFinite(typedHours)
      ? Math.min(Math.max(typedHours, 0), WORKDAY_HOURS)
      : 0;

    if (Number.isFinite(typedHours) && typedHours > WORKDAY_HOURS) {
      const alertKey = `${kind}-${dateStr}-${typedHours}`;
      if (limitAlertRef.current !== alertKey) {
        limitAlertRef.current = alertKey;
        notify(`Per-day ${getAdjustmentLabel(kind).toLowerCase()} cannot exceed ${WORKDAY_HOURS} hours on ${dateStr}.`, 'warning');
      }
    }

    onAdjustmentChange?.(kind, dateStr, rawValue === '' ? '' : cappedHours);
  };

  const renderAdjustmentCell = (kind, dateStr, source, fallback) => {
    const disabled = readOnly;
    const cellKey = `${kind}-${dateStr}`;
    const isEditing = editingCell === cellKey && !disabled;
    const value = getAdjustmentValue(source, dateStr, fallback);
    const displayValue = displayHours(value);

    if (isEditing) {
      return (
        <input
        className="mte-sheet-adjustment-input"
          type="number"
          min="0"
          max={WORKDAY_HOURS}
          step="0.25"
          value={adjustmentInputValue(source, dateStr, fallback)}
          disabled={disabled}
          autoFocus
          onBlur={() => setEditingCell('')}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              event.currentTarget.blur();
            }
          }}
          onChange={(event) => setAdjustmentValue(kind, dateStr, event.target.value)}
          onFocus={(event) => {
            if (event.target.value === '0') event.target.select();
          }}
          placeholder=""
        />
      );
    }

    return (
      <button
        type="button"
        className={`mte-sheet-edit-cell mte-sheet-adjustment-display ${displayValue ? 'has-value' : ''}`}
        disabled={disabled}
        onDoubleClick={() => setEditingCell(cellKey)}
        aria-label={`${getAdjustmentLabel(kind)} ${dateStr}`}
      >
        {displayValue}
      </button>
    );
  };

  const nonWorkingDayCellStyle = (dateStr) => (
    isWeekendDate(dateStr) || isHoliday(dateStr)
      ? { background: '#e5e7eb', color: C.textMid }
      : {}
  );
  const thStyle = (isHol, isWeekend) => ({
    padding: '10px 8px', textAlign: 'center', fontSize: '12px', fontWeight: '600',
    minWidth: '90px', borderLeft: `1px solid ${C.borderLight}`,
    background: isHol || isWeekend ? '#e5e7eb' : C.headerBg,
    color:      isHol || isWeekend ? '#4b5563' : C.text,
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
    employeeId = 'Not assigned',
  } = assignmentMeta;
  const workLocationForDate = (dateStr) => workLocationsByDate[dateStr] || workLocation;
  const assignedLocationForDate = (dateStr) => assignedLocationsByDate[dateStr] || assignedLocation;
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
                const isWeekend = isWeekendDate(d);
                return (
                  <th key={d} style={thStyle(isHol, isWeekend)} className="mte-sheet-date-head">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                      <span style={{ fontSize: '11px', color: isHol || isWeekend ? '#4b5563' : C.textMid }}>
                        {format(parseISO(d), 'EEE')}
                      </span>
                      <span>{format(parseISO(d), 'MMM d')}</span>
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
                <td key={`work-location-${d}`} className="mte-sheet-meta-cell" style={nonWorkingDayCellStyle(d)}>{workLocationForDate(d)}</td>
              ))}
              <td className="mte-sheet-meta-total" />
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
                <td key={`assigned-location-${d}`} className="mte-sheet-meta-cell" style={nonWorkingDayCellStyle(d)}>{assignedLocationForDate(d)}</td>
              ))}
              <td className="mte-sheet-meta-total">{assignedLocation}</td>
            </tr>

            <tr className="mte-sheet-meta-row">
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
                <td key={`cost-center-${d}`} className="mte-sheet-meta-cell" style={nonWorkingDayCellStyle(d)}>{companyCostCenter}</td>
              ))}
              <td className="mte-sheet-meta-total">{companyCostCenter}</td>
            </tr>

            <tr className="mte-sheet-meta-row mte-sheet-meta-row-last">
              <td className="mte-sheet-meta-label" style={{
                padding: '10px 16px',
                position: 'sticky', left: 0,
                background: C.white,
                zIndex: 9,
                borderRight: `1px solid ${C.borderLight}`,
              }}>
                Employee ID
              </td>
              {dates.map((d) => (
                <td key={`employee-id-${d}`} className="mte-sheet-meta-cell" style={nonWorkingDayCellStyle(d)}>{employeeId}</td>
              ))}
              <td className="mte-sheet-meta-total">{employeeId}</td>
            </tr>

            <tr className="mte-sheet-spacer-row">
              <td style={{
                padding: '14px 16px',
                position: 'sticky', left: 0,
                background: C.white,
                zIndex: 9,
                borderRight: `1px solid ${C.borderLight}`,
              }} />
              {dates.map((d) => <td key={`spacer-${d}`} style={nonWorkingDayCellStyle(d)} />)}
              <td />
            </tr>

            {rows.map((row, ri) => {
              const isSelected = selectedRowId === row.id;
              const rowBg = isSelected ? '#f2f6fb' : (ri % 2 === 0 ? C.white : C.rowAlt);

              return (
                <tr
                  key={row.id}
                  className={`mte-sheet-entry-row ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => {
                    if (!readOnly) onRowSelect?.(row.id);
                  }}
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
                    <div className="mte-charge-code-cell">
                      {!readOnly && (
                        <button
                          type="button"
                          className={`mte-row-selector ${isSelected ? 'is-selected' : ''}`}
                          aria-label="Select charge code row"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRowSelect?.(row.id);
                          }}
                        >
                          <CheckCircle2 size={14} />
                        </button>
                      )}
                      <ChargeCodeSelector
                        chargeCodes={chargeCodes}
                        selectedId={row.chargeCodeId}
                        onChange={(id) => {
                          onRowSelect?.(row.id);
                          onRowUpdate(row.id, { chargeCodeId: id });
                        }}
                        disabled={readOnly}
                        selectedIds={selectedChargeCodeIds}
                      />
                    </div>
                  </td>

                  {dates.map((d) => {
                    const isHol = isHoliday(d);
                    const isWeekend = isWeekendDate(d);
                    const leaveEntry = leaveByDate[d];
                    const entry = getEntry(row, d);
                    const isFullDayLeave = leaveEntry && !leaveEntry.isHalfDay;
                    const rowHourLimit = maxHoursForRowOnDate(row.id, d);
                    return (
                      <td key={d} style={{
                        padding: '8px', textAlign: 'center',
                        borderLeft: `1px solid ${C.borderLight}`,
                        background: isHol || isWeekend ? '#e5e7eb' : leaveEntry ? C.purpleLight : 'transparent',
                      }}>
                        {isHol ? null : isFullDayLeave ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              minWidth: '44px',
                              justifyContent: 'center',
                              padding: '5px 6px',
                              borderRadius: '999px',
                              fontSize: '11px',
                              fontWeight: '700',
                              border: `1px solid ${C.purpleBorder}`,
                              background: C.white,
                              color: C.purple,
                            }}
                            title={`${leaveEntry.label}${leaveEntry.isHalfDay && leaveEntry.halfDayPeriod ? ` (${leaveEntry.halfDayPeriod})` : ''}`}
                          >
                            {leaveEntry.displayCode}
                          </span>
                        ) : (() => {
                          const cellKey = `work-${row.id}-${d}`;
                          const isEditing = editingCell === cellKey && !readOnly;
                          const displayValue = displayHours(numericVal(entry));
                          const updateWorkHours = (typedValue) => {
                            const typedHours = parseFloat(typedValue);
                            if (Number.isFinite(typedHours) && typedHours > rowHourLimit) {
                              const alertKey = `work-${d}-${typedHours}`;
                              if (limitAlertRef.current !== alertKey) {
                                limitAlertRef.current = alertKey;
                                notify(
                                  `Per-day work hours cannot exceed ${DAILY_WORK_HOUR_LIMIT} hours. ${d} has ${formatHoursValue(rowHourLimit)} hour(s) available.`,
                                  'warning'
                                );
                              }
                            }
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
                          };

                          return isEditing ? (
                          <input
                            className="mte-sheet-hour-input"
                            type="number"
                            min="0"
                            max={rowHourLimit}
                            step="0.25"
                            value={entry.value ?? ''}
                            disabled={readOnly}
                            autoFocus
                            title={leaveEntry ? `${leaveEntry.label} covers ${displayHours(leaveEntry.hours)} hours on this date` : undefined}
                            onBlur={() => setEditingCell('')}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === 'Escape') {
                                event.currentTarget.blur();
                              }
                            }}
                            onFocus={(event) => {
                              onRowSelect?.(row.id);
                              if (event.target.value === '0') event.target.select();
                            }}
                            onChange={(e) => updateWorkHours(e.target.value)}
                            style={{
                              width: '52px', padding: '4px 6px',
                              border: `1px solid ${C.border}`, borderRadius: '4px',
                              textAlign: 'center', fontSize: '13px', outline: 'none',
                              background: readOnly ? C.headerBg : C.white,
                              color: C.text,
                            }}
                          />
                          ) : (
                            <button
                              type="button"
                              className={`mte-sheet-edit-cell ${displayValue ? 'has-value' : ''}`}
                              title={leaveEntry ? `${leaveEntry.label} covers ${displayHours(leaveEntry.hours)} hours on this date` : undefined}
                              onClick={() => onRowSelect?.(row.id)}
                              onDoubleClick={(event) => {
                                event.stopPropagation();
                                onRowSelect?.(row.id);
                                setEditingCell(cellKey);
                              }}
                              aria-label={`Work hours ${d}`}
                            >
                              {displayValue}
                            </button>
                          );
                        })()}
                      </td>
                    );
                  })}

                  <td style={{
                    padding: '10px 16px', textAlign: 'center', fontWeight: '600',
                    background: C.totalBg, borderLeft: `1px solid ${C.border}`, color: C.purple,
                  }}>
                    {displayHoursWithSuffix(getRowTotal(row))}
                  </td>
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
                {dates.map((d) => {
                  const leaveCell = leave.leaveByDate[d];
                  const canCancelLeave = leaveCell && canEmployeeCancelApprovedLeave(leaveCell);
                  return (
                    <td key={`leave-cell-${leave.key}-${d}`} className="mte-sheet-static-value-cell" style={nonWorkingDayCellStyle(d)}>
                      {leaveCell ? (
                        <span className="mte-sheet-leave-cell">
                          <span>{displayHours(leave.hoursByDate[d] || 0)}</span>
                          {canCancelLeave && onLeaveCancel ? (
                            <button
                              type="button"
                              onClick={() => onLeaveCancel(leaveCell)}
                              title="Cancel approved leave"
                            >
                              Cancel
                            </button>
                          ) : null}
                        </span>
                      ) : (
                        ''
                      )}
                    </td>
                  );
                })}
                <td className="mte-sheet-static-total-cell">{displayHours(leave.totalHours)}</td>
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
                  <span className="mte-sheet-static-row-title">
                    {`${holidayChargeCodeForDate(dateStr).name} (${holidayChargeCodeForDate(dateStr).code})`}
                  </span>
                </td>
                {dates.map((d) => (
                  <td key={`holiday-cell-${dateStr}-${d}`} className="mte-sheet-static-value-cell" style={nonWorkingDayCellStyle(d)}>
                    {d === dateStr ? displayHours(WORKDAY_HOURS) : ''}
                  </td>
                ))}
                <td className="mte-sheet-static-total-cell">{displayHours(WORKDAY_HOURS)}</td>
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
                Total working hours
              </td>
              {dates.map((d) => (
                <td key={`total-hours-${d}`} className="mte-sheet-static-value-cell" style={nonWorkingDayCellStyle(d)}>
                  {displayHours(totalHoursForDate(d))}
                </td>
              ))}
              <td className="mte-sheet-static-total-cell">{displayHours(dates.reduce((sum, dateStr) => sum + totalHoursForDate(dateStr), 0))}</td>
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
                <td key={`work-schedule-${d}`} className="mte-sheet-static-value-cell" style={nonWorkingDayCellStyle(d)}>
                  {renderAdjustmentCell('work_schedule', d, workScheduleByDate, getDefaultWorkScheduleValue(d))}
                </td>
              ))}
              <td className="mte-sheet-static-total-cell">{displayHours(dates.reduce((sum, dateStr) => sum + workScheduleForDate(dateStr), 0))}</td>
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
                <td key={`daily-overtime-${d}`} className="mte-sheet-static-value-cell" style={nonWorkingDayCellStyle(d)}>
                  {renderAdjustmentCell('daily_overtime', d, dailyOvertime, 0)}
                </td>
              ))}
              <td className="mte-sheet-static-total-cell">
                {displayHours(dates.reduce((sum, dateStr) => sum + getAdjustmentValue(dailyOvertime, dateStr, 0), 0))}
              </td>
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
                <td key={`holiday-payout-${d}`} className="mte-sheet-static-value-cell" style={nonWorkingDayCellStyle(d)}>
                  {renderAdjustmentCell('holiday_payout', d, holidayPayout, 0)}
                </td>
              ))}
              <td className="mte-sheet-static-total-cell">
                {displayHours(dates.reduce((sum, dateStr) => sum + getAdjustmentValue(holidayPayout, dateStr, 0), 0))}
              </td>
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
                  <td key={`${label}-${d}`} className="mte-sheet-checkbox-cell" style={nonWorkingDayCellStyle(d)}>
                    <input type="checkbox" className="mte-sheet-checkbox" disabled={readOnly} />
                  </td>
                ))}
                <td className="mte-sheet-static-total-cell" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
  const { notify, confirmAction } = useTimesheetUi();
  const availablePeriods = useMemo(() => getAvailablePeriods(), []);
  const [internalSelectedPeriod, setInternalSelectedPeriod] = useState(availablePeriods[0]?.value || '');
  const [timesheetStatus, setTimesheetStatus]   = useState('draft');
  const [rows, setRows]                         = useState([]);
  const [selectedRowId, setSelectedRowId]       = useState('');
  const [dailyOvertime, setDailyOvertime]       = useState({});
  const [holidayPayout, setHolidayPayout]       = useState({});
  const [workScheduleByDate, setWorkScheduleByDate] = useState({});
  const [validationErrors, setValidationErrors] = useState([]);
  const [chargeCodes, setChargeCodes]           = useState([]);
  const [approvedLeaves, setApprovedLeaves]     = useState([]);
  const [holidays, setHolidays]                 = useState([]);
  const [loading, setLoading]                   = useState(false);
  const [profile, setProfile]                   = useState(user || {});
  const [periodLocations, setPeriodLocations]   = useState({ dailyLocations: {}, assignedLocations: {} });
  const [timesheetLocationMaps, setTimesheetLocationMaps] = useState({
    workLocationsByDate: {},
    assignedLocationsByDate: {},
  });
  const [approvedEditWindowOpen, setApprovedEditWindowOpen] = useState(false);
  const [approvedEditWindowLabel, setApprovedEditWindowLabel] = useState('');
  const [isEmployeeEditable, setIsEmployeeEditable] = useState(true);
  const [hasSavedCurrentDraft, setHasSavedCurrentDraft] = useState(false);
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
    setSelectedRowId('');
    setDailyOvertime({});
    setHolidayPayout({});
    setWorkScheduleByDate({});
    setTimesheetLocationMaps({ workLocationsByDate: {}, assignedLocationsByDate: {} });
    setApprovedEditWindowOpen(false);
    setApprovedEditWindowLabel('');
    setIsEmployeeEditable(true);
    setHasSavedCurrentDraft(false);
    (onSelectedPeriodChange ?? setInternalSelectedPeriod)(nextPeriod);
  };
  const selectedPeriodOption = availablePeriods.find((period) => period.value === activePeriod) || availablePeriods[0];
  const activePeriodIndex = Math.max(0, availablePeriods.findIndex((period) => period.value === activePeriod));
  const canGoToPreviousPeriod = activePeriodIndex < availablePeriods.length - 1;
  const canGoToNextPeriod = activePeriodIndex > 0;
  const movePeriod = (direction) => {
    if (!availablePeriods.length) return;
    const nextIndex = Math.min(
      Math.max(activePeriodIndex + direction, 0),
      availablePeriods.length - 1
    );
    const nextPeriod = availablePeriods[nextIndex];
    if (!nextPeriod || nextPeriod.value === activePeriod) return;
    saveDraftSilentlyRef.current?.();
    setActivePeriod(nextPeriod.value);
    setTimesheetStatus('draft');
    setApprovedEditWindowOpen(false);
    setApprovedEditWindowLabel('');
    setIsEmployeeEditable(true);
  };
  const assignmentMeta = useMemo(() => getTimesheetAssignmentMeta(profile), [profile]);

  const dates = useMemo(() => {
    const period = availablePeriods.find((p) => p.value === activePeriod);
    if (!period) return [];
    return eachDayOfInterval({
      start: parseISO(period.start),
      end:   parseISO(period.end),
    }).map((d) => format(d, 'yyyy-MM-dd'));
  }, [activePeriod, availablePeriods]);

  const loadPeriodLocations = useCallback(() => {
    setPeriodLocations(readSavedPeriodLocations(userId, activePeriod, dates));
  }, [activePeriod, dates, userId]);

  useEffect(() => {
    loadPeriodLocations();
  }, [loadPeriodLocations]);

  useEffect(() => {
    if (!userId || !activePeriod || typeof window === 'undefined') return undefined;

    const refreshLocations = (event) => {
      if (event.type === 'storage' && event.key !== getLocationStorageKey(userId, activePeriod)) return;
      if (event.type === LOCATION_STORAGE_EVENT) {
        if (event.detail?.userId !== userId || event.detail?.periodValue !== activePeriod) return;
      }
      loadPeriodLocations();
      setHasSavedCurrentDraft(false);
    };

    window.addEventListener('storage', refreshLocations);
    window.addEventListener(LOCATION_STORAGE_EVENT, refreshLocations);
    return () => {
      window.removeEventListener('storage', refreshLocations);
      window.removeEventListener(LOCATION_STORAGE_EVENT, refreshLocations);
    };
  }, [activePeriod, loadPeriodLocations, userId]);

  const periodWorkLocationsByDate = useMemo(() => ({
    ...normalizeLocationMap(timesheetLocationMaps.workLocationsByDate, dates),
    ...normalizeLocationMap(periodLocations.dailyLocations, dates),
  }), [dates, periodLocations.dailyLocations, timesheetLocationMaps.workLocationsByDate]);

  const periodAssignedLocationsByDate = useMemo(() => ({
    ...normalizeLocationMap(timesheetLocationMaps.assignedLocationsByDate, dates),
    ...normalizeLocationMap(periodLocations.assignedLocations, dates),
  }), [dates, periodLocations.assignedLocations, timesheetLocationMaps.assignedLocationsByDate]);

  const buildLocationPayload = useCallback(() => ({
    employee_work_locations_by_date: periodWorkLocationsByDate,
    employee_assigned_locations_by_date: periodAssignedLocationsByDate,
  }), [periodAssignedLocationsByDate, periodWorkLocationsByDate]);
  const buildWorkSchedulePayload = useCallback(
    () => normalizeAdjustmentPayload(workScheduleByDate),
    [workScheduleByDate]
  );

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
      .then((d) => setApprovedLeaves(
        Array.isArray(d)
          ? d.filter((leave) => leave.status === 'Approved' && !isEarlyLogoutLikeLeave(leave))
          : []
      ))
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
          const matchedWorkLocationsByDate = getTimesheetWorkLocationsByDate(match, dates);
          const matchedAssignedLocationsByDate = getTimesheetAssignedLocationsByDate(match, dates);
          const savedPeriodLocations = readSavedPeriodLocations(userId, activePeriod, dates);
          const localWorkLocationsByDate = normalizeLocationMap(savedPeriodLocations.dailyLocations, dates);
          const localAssignedLocationsByDate = normalizeLocationMap(savedPeriodLocations.assignedLocations, dates);
          const hasUnsavedLocationChanges = (
            Object.keys(localWorkLocationsByDate).length > 0
            && !areLocationMapsEqual(localWorkLocationsByDate, matchedWorkLocationsByDate)
          ) || (
            Object.keys(localAssignedLocationsByDate).length > 0
            && !areLocationMapsEqual(localAssignedLocationsByDate, matchedAssignedLocationsByDate)
          );
          setTimesheetStatus(match.status || 'draft');
          setApprovedEditWindowOpen(Boolean(match.approved_edit_window_open));
          setApprovedEditWindowLabel(match.approved_edit_window_label || '');
          setIsEmployeeEditable(match.is_employee_editable !== false);
          setDailyOvertime(match.daily_overtime || {});
          setHolidayPayout(match.holiday_payout || {});
          setWorkScheduleByDate(getTimesheetWorkScheduleByDate(match, dates));
          setTimesheetLocationMaps({
            workLocationsByDate: matchedWorkLocationsByDate,
            assignedLocationsByDate: matchedAssignedLocationsByDate,
          });
          setHasSavedCurrentDraft(
            (
              ['draft', 'rejected_by_lead', 'rejected_by_manager'].includes(match.status || 'draft')
              || Boolean(match.approved_edit_window_open)
            )
            && !hasUnsavedLocationChanges
          );

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
                ? { date: d, hours: Number(byDate[d].hours || 0), value: formatTimesheetHourValue(byDate[d].hours), entry_type: 'work' }
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
          setApprovedEditWindowOpen(false);
          setApprovedEditWindowLabel('');
          setIsEmployeeEditable(true);
          setDailyOvertime({});
          setHolidayPayout({});
          setWorkScheduleByDate(buildDefaultWorkSchedule(dates));
          setTimesheetLocationMaps({ workLocationsByDate: {}, assignedLocationsByDate: {} });
          setHasSavedCurrentDraft(false);
          setRows([createEmptyWorkRow('row1', dates, lockedDateSet, halfDayWorkDefaultsByDate)]);
        }
      })
      .catch(() => {
        setApprovedEditWindowOpen(false);
        setApprovedEditWindowLabel('');
        setIsEmployeeEditable(true);
        setDailyOvertime({});
        setHolidayPayout({});
        setWorkScheduleByDate(buildDefaultWorkSchedule(dates));
        setTimesheetLocationMaps({ workLocationsByDate: {}, assignedLocationsByDate: {} });
        setHasSavedCurrentDraft(false);
        setRows([createEmptyWorkRow('row1', dates, lockedDateSet, halfDayWorkDefaultsByDate)]);
      })
      .finally(() => setSheetLoaded(true));
  }, [userId, activePeriod, dates, chargeCodes, reloadTrigger, lockedDateSet, halfDayWorkDefaultsByDate]); // FIX 2: reloadTrigger added

  const validate = useCallback(() => {
    const errors = [];
    const hasSystemEntries = approvedLeaveEntries.length > 0 || holidays.length > 0;
    const isEditableSubmitStatus = timesheetStatus === 'draft' || timesheetStatus.startsWith('rejected');
    if (isEditableSubmitStatus && !hasSavedCurrentDraft) {
      errors.push('Save the timesheet before submitting');
    }
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
  }, [
    rows,
    dates,
    approvedLeaveEntries.length,
    holidays.length,
    approvedLeaveByDate,
    holidayByDate,
    hasSavedCurrentDraft,
    timesheetStatus,
  ]);

  useEffect(() => { setValidationErrors(validate()); }, [rows, validate]);

  useEffect(() => {
    if (selectedRowId && !rows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId('');
    }
  }, [rows, selectedRowId]);

  const canEditApprovedTimesheet = timesheetStatus === 'approved' && approvedEditWindowOpen;
  const isReadOnly   = !isEmployeeEditable || timesheetStatus === 'pending_lead' || (timesheetStatus === 'approved' && !canEditApprovedTimesheet);
  const canSubmit    = isEmployeeEditable && (timesheetStatus === 'draft' || timesheetStatus.startsWith('rejected') || canEditApprovedTimesheet);
  const errors       = validationErrors;
  const submitDisabled = loading || errors.length > 0 || (!hasSavedCurrentDraft && !canEditApprovedTimesheet);
  const rowHasPositiveHours = useCallback((row) =>
    row.entries.some((entry) => {
      const rawValue = entry?.value !== undefined ? entry.value : String(entry?.hours ?? '');
      const hours = parseFloat(rawValue);
      return Number.isFinite(hours) && hours > 0;
    }), []);
  const hasSelectedRowsWithoutHours = useCallback((sourceRows = rows) =>
    sourceRows.some((row) => row.chargeCodeId && !rowHasPositiveHours(row)), [rowHasPositiveHours, rows]);

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
      daily_overtime: normalizeAdjustmentPayload(dailyOvertime),
      holiday_payout: normalizeAdjustmentPayload(holidayPayout),
      work_schedule_by_date: buildWorkSchedulePayload(),
      status: timesheetStatus,
      employee_external_id: profile.employeeId || '',
      employee_work_location: profile.workLocation || '',
      employee_assigned_location: profile.assignedLocation || profile.costCenter || profile.workLocation || '',
      employee_work_locations_by_date: periodWorkLocationsByDate,
      employee_assigned_locations_by_date: periodAssignedLocationsByDate,
      employee_company_code: profile.companyCode || '',
      employee_cost_center: profile.costCenter || '',
    });
  }, [
    activePeriod,
    buildWorkSchedulePayload,
    dailyOvertime,
    dates,
    holidayPayout,
    liveSummaryEntries,
    onSheetSnapshotChange,
    periodAssignedLocationsByDate,
    periodWorkLocationsByDate,
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
          daily_overtime: normalizeAdjustmentPayload(dailyOvertime),
          holiday_payout: normalizeAdjustmentPayload(holidayPayout),
          work_schedule_by_date: buildWorkSchedulePayload(),
          ...buildLocationPayload(),
        }),
      });
      if (!hasSelectedRowsWithoutHours()) {
        hasLocalTimesheetEditsRef.current = false;
      }
    } catch (_) {
      // Silent autosave should never interrupt typing or replace validation.
    }
  }, [buildLocationPayload, buildWorkEntries, buildWorkSchedulePayload, dailyOvertime, dates, hasSelectedRowsWithoutHours, holidayPayout, isReadOnly, userId]);

  useEffect(() => {
    if (!hasLocalTimesheetEditsRef.current || isReadOnly) return undefined;
    const autoSaveTimer = setTimeout(() => {
      saveDraftSilently();
    }, 1500);
    return () => clearTimeout(autoSaveTimer);
  }, [rows, dailyOvertime, holidayPayout, workScheduleByDate, periodWorkLocationsByDate, periodAssignedLocationsByDate, saveDraftSilently, isReadOnly]);

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
    if (errors.length) {
      notify(`Please fix these items before submitting: ${errors.join(' • ')}`, 'error');
      return;
    }
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
          body: JSON.stringify({
            entries,
            daily_overtime: normalizeAdjustmentPayload(dailyOvertime),
            holiday_payout: normalizeAdjustmentPayload(holidayPayout),
            work_schedule_by_date: buildWorkSchedulePayload(),
            ...buildLocationPayload(),
          }),
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
            daily_overtime: normalizeAdjustmentPayload(dailyOvertime),
            holiday_payout: normalizeAdjustmentPayload(holidayPayout),
            work_schedule_by_date: buildWorkSchedulePayload(),
            ...buildLocationPayload(),
          }),
        });
      }
      // FIX 2: reload after submit so lead sees fresh data and employee sees correct state
      hasLocalTimesheetEditsRef.current = false;
      setReloadTrigger((t) => t + 1);
      notify('Timesheet submitted successfully.', 'success');
    } catch (err) {
      notify(`Submission failed: ${err.message}`, 'error');
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
          daily_overtime: normalizeAdjustmentPayload(dailyOvertime),
          holiday_payout: normalizeAdjustmentPayload(holidayPayout),
          work_schedule_by_date: buildWorkSchedulePayload(),
          ...buildLocationPayload(),
        }),
      });
      setTimesheetStatus('draft');
      setHasSavedCurrentDraft(true);
      if (hasSelectedRowsWithoutHours()) {
        hasLocalTimesheetEditsRef.current = true;
      } else {
        hasLocalTimesheetEditsRef.current = false;
        setReloadTrigger((t) => t + 1);
      }
      if (canEditApprovedTimesheet) {
        setApprovedEditWindowOpen(false);
      }
      notify('Draft saved successfully.', 'success');
    } catch (err) {
      notify(`Save failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRow = () => {
    if (isReadOnly) return;
    const nextRow = createEmptyWorkRow(`row${Date.now()}`, dates, lockedDateSet);
    hasLocalTimesheetEditsRef.current = true;
    setHasSavedCurrentDraft(false);
    setRows((previous) => [...previous, nextRow]);
    setSelectedRowId(nextRow.id);
  };

  const handleDeleteSelectedRow = () => {
    if (isReadOnly) return;
    if (!selectedRowId) {
      notify('Select a charge code row to delete.', 'warning');
      return;
    }
    hasLocalTimesheetEditsRef.current = true;
    setHasSavedCurrentDraft(false);
    setRows((previous) => previous.filter((row) => row.id !== selectedRowId));
    setSelectedRowId('');
    notify('Charge code row removed.', 'success');
  };

  const handleAdjustmentChange = (kind, dateStr, value) => {
    hasLocalTimesheetEditsRef.current = true;
    setHasSavedCurrentDraft(false);
    const setter = kind === 'daily_overtime'
      ? setDailyOvertime
      : kind === 'holiday_payout'
      ? setHolidayPayout
      : setWorkScheduleByDate;
    setter((previous) => ({
      ...previous,
      [dateStr]: value === '' ? 0 : value,
    }));
  };

  const handleCancelApprovedLeaveFromTimesheet = async (leaveEntry) => {
    if (!leaveEntry?.leaveId) return;
    const shouldCancel = await confirmAction({
      title: 'Cancel Approved Leave',
      message: `Cancel approved leave from ${leaveEntry.startDate || leaveEntry.date} to ${leaveEntry.endDate || leaveEntry.date}? The matching timesheet rows will refresh after cancellation.`,
      confirmLabel: 'Cancel Leave',
      tone: 'danger',
    });
    if (!shouldCancel) return;

    setLoading(true);
    try {
      await fetchAPI(`/leaves/cancel/${leaveEntry.leaveId}`, {
        method: 'PUT',
        body: JSON.stringify({ cancelled_by: profile.name || user?.name || profile.email || user?.email || 'Employee' }),
      });
      notify('Approved leave cancelled and timesheet refreshed.', 'success');
      hasLocalTimesheetEditsRef.current = false;
      loadTimesheetReferenceData();
      setReloadTrigger((t) => t + 1);
    } catch (err) {
      notify(`Leave cancellation failed: ${err.message}`, 'error');
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
      ? canEditApprovedTimesheet
        ? (
          <>
            <strong>Approved:</strong> This timesheet is in the correction window.
            {' '}Make changes and resubmit it for lead approval again.
          </>
        )
        : (<><strong>Approved:</strong> This timesheet is permanently locked. Contact your lead for corrections.</>)
      : (<><strong>Rejected:</strong> Review the feedback, make corrections, and resubmit.</>);

    return (
      <div style={{ padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px', background: bg, border: `1px solid ${brd}`, color }}>
        {msg}
      </div>
    );
  };

  const periodStartDate = selectedPeriodOption?.start ? parseISO(selectedPeriodOption.start) : null;
  const periodAnchorLabel = periodStartDate ? format(periodStartDate, 'M/d/yyyy') : 'Select period';

  return (
    <div className={`mte-embedded-shell ${embedded ? 'is-embedded' : ''}`}>
      <div className="mte-date-toolbar mte-timesheet-submit-toolbar">
        <div className="mte-action-toolbar mte-action-toolbar-top">
          <button type="button" className="mte-tool-button" onClick={handleSaveDraft} disabled={isReadOnly || loading}>
            <Save size={18} />
            <span>Save</span>
          </button>
          <button
            type="button"
            className="mte-tool-button"
            onClick={handleDeleteSelectedRow}
            disabled={isReadOnly || loading || !selectedRowId}
            title={selectedRowId ? 'Delete selected charge code row' : 'Select a charge code row first'}
          >
            <Trash2 size={18} />
            <span>Delete</span>
          </button>
          <button type="button" className="mte-tool-button" onClick={handleAddRow} disabled={isReadOnly || loading}>
            <Plus size={18} />
            <span>New</span>
          </button>
          <button type="button" className="mte-tool-button">
            <CircleHelp size={18} />
            <span>Help</span>
          </button>
        </div>
        <div className="mte-timesheet-submit-stack">
          <div className="mte-timesheet-period-tools">
            <div className="mte-date-picker-group mte-period-calendar-control">
              <button
                type="button"
                className="mte-ghost-icon mte-period-nav-button"
                aria-label="Previous period"
                onClick={() => movePeriod(1)}
                disabled={!canGoToPreviousPeriod}
              >
                <ChevronLeft size={30} strokeWidth={2.4} />
              </button>
              <label className="mte-period-calendar-card">
                <span className="mte-period-anchor-copy">{periodAnchorLabel}</span>
                <span className="mte-period-calendar-chevron">
                  <ChevronRight size={18} />
                </span>
                <span className="mte-period-calendar-icon">
                  <Calendar size={18} />
                </span>
                <select
                  className="mte-period-calendar-select"
                  aria-label="Timesheet period"
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
              </label>
              <button
                type="button"
                className="mte-ghost-icon mte-period-nav-button"
                aria-label="Next period"
                onClick={() => movePeriod(-1)}
                disabled={!canGoToNextPeriod}
              >
                <ChevronRight size={30} strokeWidth={2.4} />
              </button>
            </div>
          </div>
          <div className="mte-primary-actions">
            {canSubmit ? (
              <button
                type="button"
                className="mte-submit-button"
                onClick={handleSubmit}
                disabled={submitDisabled}
                title={!hasSavedCurrentDraft && !canEditApprovedTimesheet ? 'Save the timesheet before submitting.' : undefined}
              >
                {loading ? 'Submitting' : canEditApprovedTimesheet ? 'Resubmit' : 'Submit'}
              </button>
            ) : (
              <div className="mte-status-inline">
                <StatusBadge status={timesheetStatus} />
              </div>
            )}
          </div>
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

      {canEditApprovedTimesheet ? (
        <div className="mte-inline-banner">
          <span>{approvedEditWindowLabel || 'This approved timesheet is temporarily editable during the correction window.'}</span>
          <button type="button" className="mte-inline-banner-button" onClick={handleSaveDraft} disabled={loading}>
            {loading ? 'Updating' : 'Save Revision'}
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

      <TimesheetGrid
        dates={dates}
        rows={rows}
        chargeCodes={chargeCodes}
        onRowUpdate={(id, u) => {
          hasLocalTimesheetEditsRef.current = true;
          setHasSavedCurrentDraft(false);
          setSelectedRowId(id);
          setRows((p) => p.map((r) => r.id === id ? { ...r, ...u } : r));
        }}
        readOnly={isReadOnly}
        approvedLeaves={approvedLeaves}
        holidays={holidays}
        assignmentMeta={assignmentMeta}
        workLocationsByDate={periodWorkLocationsByDate}
        assignedLocationsByDate={periodAssignedLocationsByDate}
        workScheduleByDate={workScheduleByDate}
        dailyOvertime={dailyOvertime}
        holidayPayout={holidayPayout}
        onAdjustmentChange={handleAdjustmentChange}
        onLeaveCancel={handleCancelApprovedLeaveFromTimesheet}
        selectedRowId={selectedRowId}
        onRowSelect={setSelectedRowId}
      />
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
        SYSTEM_ABSENCE_CHARGE_CODES.forEach((c) => {
          lookup[c._id] = { code: c.code, name: c.name };
          lookup[c.charge_code_id] = { code: c.code, name: c.name };
          lookup[c.code] = { code: c.code, name: c.name };
        });
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
    }
    const meta = getTimesheetEntryChargeCodeMeta(e, ccLookup);
    const key = e.charge_code_id || meta.code || e.charge_code || e.code || 'unknown';

    const label = [meta.code, meta.name].filter((v) => v && v.trim() !== '').join(' - ') || 'Unknown';

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
  const detailWorkLocationsByDate = getTimesheetWorkLocationsByDate(timesheet, allDates);
  const detailAssignedLocationsByDate = getTimesheetAssignedLocationsByDate(timesheet, allDates);

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
              Total: <strong style={{ color: C.purple }}>{formatTimesheetHoursWithSuffix(grandTotal)}</strong>
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
                          {isHol && <span style={{ fontSize: '9px' }}>{getTimesheetEntryDisplayCode(holidaysByDate[date])}</span>}
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
                    <td key={`detail-work-location-${date}`} className="mte-sheet-meta-cell">{detailWorkLocationsByDate[date] || assignmentMeta.workLocation}</td>
                  ))}
                  <td className="mte-sheet-meta-total" />
                </tr>
                <tr className="mte-sheet-meta-row">
                  <td style={{ ...stickyLeft, padding: '10px 16px', background: C.white, borderRight: `1px solid ${C.borderLight}` }}>
                    Assigned Location
                  </td>
                  {allDates.map((date) => (
                    <td key={`detail-assigned-location-${date}`} className="mte-sheet-meta-cell">{detailAssignedLocationsByDate[date] || assignmentMeta.assignedLocation}</td>
                  ))}
                  <td className="mte-sheet-meta-total">{assignmentMeta.assignedLocation}</td>
                </tr>
                <tr className="mte-sheet-meta-row">
                  <td style={{ ...stickyLeft, padding: '10px 16px', background: C.white, borderRight: `1px solid ${C.borderLight}` }}>
                    Company Code/Cost Center
                  </td>
                  {allDates.map((date) => (
                    <td key={`detail-cost-center-${date}`} className="mte-sheet-meta-cell">{assignmentMeta.companyCostCenter}</td>
                  ))}
                  <td className="mte-sheet-meta-total">{assignmentMeta.companyCostCenter}</td>
                </tr>
                <tr className="mte-sheet-meta-row mte-sheet-meta-row-last">
                  <td style={{ ...stickyLeft, padding: '10px 16px', background: C.white, borderRight: `1px solid ${C.borderLight}` }}>
                    Employee ID
                  </td>
                  {allDates.map((date) => (
                    <td key={`detail-employee-id-${date}`} className="mte-sheet-meta-cell">{assignmentMeta.employeeId}</td>
                  ))}
                  <td className="mte-sheet-meta-total">{assignmentMeta.employeeId}</td>
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
                                  ? <strong style={{ color: C.text }}>{formatTimesheetHoursWithSuffix(entry.hours)}</strong>
                                  : ''}
                              </td>
                            );
                          })}
                          <td style={{
                            padding: '10px 10px', textAlign: 'center', fontWeight: '700',
                            background: C.totalBg, borderLeft: `1px solid ${C.border}`,
                            color: C.purple, fontSize: '13px',
                          }}>
                            {formatTimesheetHoursWithSuffix(rowTotal)}
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
                          {formatTimesheetHoursWithSuffix(getDateTotal(date))}
                        </td>
                      ))}
                      <td style={{
                        padding: '10px 10px', textAlign: 'center', fontWeight: '700',
                        background: C.purpleLight, color: C.purple, fontSize: '14px',
                        borderLeft: `1px solid ${C.totalBorder}`,
                      }}>
                        {formatTimesheetHoursWithSuffix(grandTotal)}
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
                  {h.timestamp && ` · ${formatDateTime(h.timestamp)}`}
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
  const fullWorkLocationsByDate = getTimesheetWorkLocationsByDate(timesheet, allDates);
  const fullAssignedLocationsByDate = getTimesheetAssignedLocationsByDate(timesheet, allDates);

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
            Total: <strong style={{ color: C.purple }}>{formatTimesheetHoursWithSuffix(grandTotal)}</strong>
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
                            {isHol && <span style={{ fontSize: '9px' }}>{getTimesheetEntryDisplayCode(holidaysByDate[date])}</span>}
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
                      <td key={`full-work-location-${date}`} className="mte-sheet-meta-cell">{fullWorkLocationsByDate[date] || assignmentMeta.workLocation}</td>
                    ))}
                    <td className="mte-sheet-meta-total" />
                  </tr>
                  <tr className="mte-sheet-meta-row">
                    <td style={{ ...stickyLeft, padding: '10px 16px', background: C.white, borderRight: `1px solid ${C.borderLight}` }}>
                      Assigned Location
                    </td>
                    {allDates.map((date) => (
                      <td key={`full-assigned-location-${date}`} className="mte-sheet-meta-cell">{fullAssignedLocationsByDate[date] || assignmentMeta.assignedLocation}</td>
                    ))}
                    <td className="mte-sheet-meta-total">{assignmentMeta.assignedLocation}</td>
                  </tr>
                  <tr className="mte-sheet-meta-row">
                    <td style={{ ...stickyLeft, padding: '10px 16px', background: C.white, borderRight: `1px solid ${C.borderLight}` }}>
                      Company Code/Cost Center
                    </td>
                    {allDates.map((date) => (
                      <td key={`full-cost-center-${date}`} className="mte-sheet-meta-cell">{assignmentMeta.companyCostCenter}</td>
                    ))}
                    <td className="mte-sheet-meta-total">{assignmentMeta.companyCostCenter}</td>
                  </tr>
                  <tr className="mte-sheet-meta-row mte-sheet-meta-row-last">
                    <td style={{ ...stickyLeft, padding: '10px 16px', background: C.white, borderRight: `1px solid ${C.borderLight}` }}>
                      Employee ID
                    </td>
                    {allDates.map((date) => (
                      <td key={`full-employee-id-${date}`} className="mte-sheet-meta-cell">{assignmentMeta.employeeId}</td>
                    ))}
                    <td className="mte-sheet-meta-total">{assignmentMeta.employeeId}</td>
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
                                    ? <strong style={{ color: C.text }}>{formatTimesheetHoursWithSuffix(entry.hours)}</strong>
                                    : ''}
                                </td>
                              );
                            })}
                            <td style={{
                              padding: '10px 10px', textAlign: 'center', fontWeight: '700',
                              background: C.totalBg, borderLeft: `1px solid ${C.border}`,
                              color: C.purple, fontSize: '13px',
                            }}>
                              {formatTimesheetHoursWithSuffix(rowTotal)}
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
                            {formatTimesheetHoursWithSuffix(getDateTotal(date))}
                          </td>
                        ))}
                        <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: '700', background: C.purpleLight, color: C.purple, fontSize: '14px', borderLeft: `1px solid ${C.totalBorder}` }}>
                          {formatTimesheetHoursWithSuffix(grandTotal)}
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
                    {h.timestamp && ` · ${formatDateTime(h.timestamp)}`}
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
  const { notify, confirmAction, promptAction } = useTimesheetUi();
  const [activeSubtab,        setActiveSubtab]        = useState('queue');
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
      .catch((err) => notify(`Failed to load approvals: ${err.message}`, 'error'))
      .finally(() => setLoading(false));
  }, [notify, userId, role]);

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
    const shouldApprove = await confirmAction({
      title: 'Approve Timesheet',
      message: 'Approve this timesheet and lock it for the employee?',
      confirmLabel: 'Approve',
    });
    if (!shouldApprove) return;
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
      notify('Timesheet approved successfully.', 'success');
    } catch (err) {
      notify(`Approval failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (id, status) => {
    const reason = await promptAction({
      title: 'Reject Timesheet',
      message: 'Provide a reason for rejecting this timesheet. The employee will see this message.',
      confirmLabel: 'Reject Timesheet',
      tone: 'danger',
      placeholder: 'Enter rejection reason',
      multiline: true,
      required: true,
    });
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
      notify('Timesheet rejected.', 'success');
    } catch (err) {
      notify(`Rejection failed: ${err.message}`, 'error');
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

          <div style={{ ...S.card, ...S.cardPadSm, marginBottom: '14px' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setActiveSubtab('queue')}
                style={activeSubtab === 'queue' ? S.btnPrimary : S.btnSecondary}
              >
                Pending Queue
              </button>
              <button
                type="button"
                onClick={() => setActiveSubtab('history')}
                style={activeSubtab === 'history' ? S.btnPrimary : S.btnSecondary}
              >
                Approvals History
              </button>
            </div>
          </div>

          {activeSubtab === 'history' ? (
            <ApprovalsHistoryWorkspace user={user} />
          ) : (
            <>

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
                        <td style={S.tdRight}><strong>{formatTimesheetHoursWithSuffix(a.total_hours)}</strong></td>
                        <td style={S.tdMid}>
                          {formatDateTime(a.submitted_at)}
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
                  const shouldApprove = await confirmAction({
                    title: 'Approve Timesheet',
                    message: 'Approve this timesheet and close the review screen?',
                    confirmLabel: 'Approve',
                  });
                  if (!shouldApprove) return;
                  try {
                    const ep = viewingTimesheet.status === 'pending_manager'
                      ? `/timesheets/approve/manager/${id}`
                      : `/timesheets/approve/lead/${id}`;
                    await fetchAPI(ep, {
                      method: 'PUT',
                      body: JSON.stringify({ approved_by: userId, comments: '' }),
                    });
                    notify('Timesheet approved successfully.', 'success');
                    setViewingTimesheet(null);
                    setFullPageView(false);
                    loadApprovals();
                  } catch (err) {
                    notify(`Approval failed: ${err.message}`, 'error');
                  }
                }}
                onReject={async () => {
                  const id = viewingTimesheet._id || viewingTimesheet.id;
                  const reason = await promptAction({
                    title: 'Reject Timesheet',
                    message: 'Provide a reason for rejecting this timesheet.',
                    confirmLabel: 'Reject Timesheet',
                    tone: 'danger',
                    placeholder: 'Enter rejection reason',
                    multiline: true,
                    required: true,
                  });
                  if (!reason?.trim()) return;
                  try {
                    const ep = viewingTimesheet.status === 'pending_manager'
                      ? `/timesheets/reject/manager/${id}`
                      : `/timesheets/reject/lead/${id}`;
                    await fetchAPI(ep, {
                      method: 'PUT',
                      body: JSON.stringify({ rejected_by: userId, rejection_reason: reason }),
                    });
                    notify('Timesheet rejected.', 'success');
                    setViewingTimesheet(null);
                    setFullPageView(false);
                    loadApprovals();
                  } catch (err) {
                    notify(`Rejection failed: ${err.message}`, 'error');
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ApprovalsHistoryWorkspace({ user }) {
  const { notify } = useTimesheetUi();
  const [historyTimesheets, setHistoryTimesheets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [collapsedFortnights, setCollapsedFortnights] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [periodRange, setPeriodRange] = useState(blankDateRange);
  const [approvedRange, setApprovedRange] = useState(blankDateRange);
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [leadFilter, setLeadFilter] = useState('all');
  const [viewingTimesheet, setViewingTimesheet] = useState(null);
  const [fullPageView, setFullPageView] = useState(false);

  const ccLookup = useCcLookup();
  const userEmail = String(user?.email || '').trim();

  const loadHistory = useCallback(() => {
    if (!userEmail) return;
    setLoading(true);
    fetchAPI(`/timesheets/team/${encodeURIComponent(userEmail)}`)
      .then((data) => {
        const items = Array.isArray(data) ? data : [];
        setHistoryTimesheets(items.filter((timesheet) => timesheet.status === 'approved'));
      })
      .catch((err) => notify(`Failed to load approval history: ${err.message}`, 'error'))
      .finally(() => setLoading(false));
  }, [notify, userEmail]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const filtered = useMemo(() => historyTimesheets.filter((timesheet) => {
    const name = String(timesheet.employee_name || '').toLowerCase();
    const email = String(timesheet.employee_email || '').toLowerCase();
    const department = String(timesheet.employee_department || 'Unassigned');
    const leadLabel = getReportingLeadLabel(timesheet);
    const approvedAt = getApprovedTimestamp(timesheet);
    const fortnight = getTimesheetFortnightMeta(timesheet);
    const query = searchTerm.toLowerCase().trim();

    const matchesSearch = !query || [
      name,
      email,
      department.toLowerCase(),
      String(leadLabel || '').toLowerCase(),
      String(fortnight.label || '').toLowerCase(),
    ].some((value) => value.includes(query));

    return matchesSearch
      && (selectedEmployee === 'all' || (timesheet.employee_id || '') === selectedEmployee)
      && (departmentFilter === 'all' || department === departmentFilter)
      && (leadFilter === 'all' || (timesheet.reporting_lead_id || getReportingLeadLabel(timesheet)) === leadFilter)
      && timesheetHasEntryType(timesheet, typeFilter)
      && isTimesheetInRange(timesheet, periodRange)
      && (!approvedRange.start && !approvedRange.end ? true : isDateValueInRange(approvedAt, approvedRange));
  }), [
    approvedRange,
    departmentFilter,
    historyTimesheets,
    leadFilter,
    periodRange,
    searchTerm,
    selectedEmployee,
    typeFilter,
  ]);

  const departmentOptions = useMemo(
    () => Array.from(new Set(historyTimesheets.map((item) => item.employee_department || 'Unassigned')))
      .sort((a, b) => a.localeCompare(b)),
    [historyTimesheets]
  );

  const employeeOptions = useMemo(
    () => Array.from(new Map(
      historyTimesheets.map((item) => [
        item.employee_id || item.employee_email || item.employee_name,
        {
          value: item.employee_id || '',
          label: item.employee_name || item.employee_email || 'Unknown employee',
        },
      ])
    ).values()).sort((a, b) => a.label.localeCompare(b.label)),
    [historyTimesheets]
  );

  const leadOptions = useMemo(() => {
    const map = new Map();
    historyTimesheets.forEach((item) => {
      const value = item.reporting_lead_id || getReportingLeadLabel(item);
      if (!map.has(value)) {
        map.set(value, getReportingLeadLabel(item));
      }
    });
    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [historyTimesheets]);

  const searchSuggestions = useMemo(
    () => uniqSuggestions(historyTimesheets, ['employee_name', 'employee_email', 'employee_department', 'reporting_lead_name']),
    [historyTimesheets]
  );

  const groupedFortnights = useMemo(() => {
    const groups = new Map();
    filtered.forEach((timesheet) => {
      const fortnight = getTimesheetFortnightMeta(timesheet);
      if (!groups.has(fortnight.key)) {
        groups.set(fortnight.key, {
          key: fortnight.key,
          label: fortnight.label,
          sortKey: fortnight.sortKey,
          items: [],
        });
      }
      groups.get(fortnight.key).items.push(timesheet);
    });

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        items: [...group.items].sort((first, second) => (
          String(first.employee_name || '').localeCompare(String(second.employee_name || ''))
        )),
      }))
      .sort((first, second) => String(second.sortKey || '').localeCompare(String(first.sortKey || '')));
  }, [filtered]);

  const stats = useMemo(() => ({
    fortnights: groupedFortnights.length,
    timesheets: filtered.length,
    teamMembers: new Set(filtered.map((item) => item.employee_id || item.employee_email || item.employee_name)).size,
    hours: filtered.reduce((sum, item) => sum + Number(item.total_hours || 0), 0),
  }), [filtered, groupedFortnights]);

  useEffect(() => {
    setCollapsedFortnights((previous) => {
      const next = {};
      groupedFortnights.forEach((group, index) => {
        next[group.key] = Object.prototype.hasOwnProperty.call(previous, group.key)
          ? previous[group.key]
          : index !== 0;
      });
      return next;
    });
  }, [groupedFortnights]);

  const resetFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setPeriodRange({ ...blankDateRange });
    setApprovedRange({ ...blankDateRange });
    setSelectedEmployee('all');
    setDepartmentFilter('all');
    setLeadFilter('all');
  };

  return (
    <>
      <div style={S.statsGrid}>
        {[
          { label: 'Approved Fortnights', value: stats.fortnights, sub: 'Filtered periods', Icon: CalendarRange, color: C.text },
          { label: 'Timesheets', value: stats.timesheets, sub: 'Approved entries', Icon: FileText, color: C.green },
          { label: 'Team Members', value: stats.teamMembers, sub: 'Represented in view', Icon: Users, color: C.text },
          { label: 'Approved Hours', value: formatTimesheetHoursWithSuffix(stats.hours), sub: 'Across selected fortnights', Icon: TrendingUp, color: C.text },
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
              placeholder="Employee, email, department, lead, or fortnight"
              style={{ width: '100%' }}
            />
          </div>
          <SelectWrap value={selectedEmployee} onChange={(e) => setSelectedEmployee(e.target.value)} style={{ width: '100%', minWidth: 0 }}>
            <option value="all">All Employees</option>
            {employeeOptions.map((option) => (
              <option key={option.value || option.label} value={option.value}>{option.label}</option>
            ))}
          </SelectWrap>
          <SelectWrap value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} style={{ width: '100%', minWidth: 0 }}>
            <option value="all">All Departments</option>
            {departmentOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </SelectWrap>
          <SelectWrap value={leadFilter} onChange={(e) => setLeadFilter(e.target.value)} style={{ width: '100%', minWidth: 0 }}>
            <option value="all">All Reporting Leads</option>
            {leadOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </SelectWrap>
          <SelectWrap value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ width: '100%', minWidth: 0 }}>
            <option value="all">All Types</option>
            <option value="work">Work</option>
            <option value="holiday">Holiday</option>
            <option value="leave">Leave</option>
          </SelectWrap>
          <input
            className="mte-history-date-input"
            type="date"
            value={periodRange.start}
            onChange={(e) => setPeriodRange((previous) => ({ ...previous, start: e.target.value }))}
            title="Fortnight start from"
          />
          <input
            className="mte-history-date-input"
            type="date"
            value={periodRange.end}
            onChange={(e) => setPeriodRange((previous) => ({ ...previous, end: e.target.value }))}
            title="Fortnight end to"
          />
          <input
            className="mte-history-date-input"
            type="date"
            value={approvedRange.start}
            onChange={(e) => setApprovedRange((previous) => ({ ...previous, start: e.target.value }))}
            title="Approved from"
          />
          <input
            className="mte-history-date-input"
            type="date"
            value={approvedRange.end}
            onChange={(e) => setApprovedRange((previous) => ({ ...previous, end: e.target.value }))}
            title="Approved to"
          />
          <button type="button" onClick={loadHistory} className="mte-manager-filter-button" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button type="button" onClick={resetFilters} className="mte-manager-filter-button" title="Reset filters">
            Reset
          </button>
        </div>
      </div>

      {groupedFortnights.length === 0 ? (
        <div style={{ ...S.card, ...S.cardPad, textAlign: 'center', color: C.textMid }}>
          {loading ? 'Loading approval history…' : 'No approved fortnights match the current filters.'}
        </div>
      ) : (
        groupedFortnights.map((group) => {
          const totalHours = group.items.reduce((sum, item) => sum + Number(item.total_hours || 0), 0);
          const approvedDates = group.items
            .map((item) => getApprovedTimestamp(item))
            .filter(Boolean)
            .sort();
          const latestApproved = approvedDates.length ? approvedDates[approvedDates.length - 1] : '';
          const isCollapsed = collapsedFortnights[group.key];

          return (
            <div key={group.key} style={{ ...S.card, overflow: 'hidden', marginBottom: '18px' }}>
              <button
                type="button"
                onClick={() => setCollapsedFortnights((previous) => ({
                  ...previous,
                  [group.key]: !previous[group.key],
                }))}
                style={{
                  ...S.cardPadSm,
                  width: '100%',
                  border: 'none',
                  borderBottom: isCollapsed ? 'none' : `1px solid ${C.border}`,
                  background: C.headerBg,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={S.rowBetween}>
                  <div>
                    <div style={{ fontSize: '18px', fontWeight: '600', color: C.text }}>{group.label}</div>
                    <div style={{ fontSize: '12px', color: C.textMid, marginTop: '4px' }}>
                      {group.items.length} approved timesheet{group.items.length !== 1 ? 's' : ''} · {formatTimesheetHoursWithSuffix(totalHours)} · Latest approval {latestApproved ? formatDateTime(latestApproved) : '—'}
                    </div>
                  </div>
                  <div style={{ fontSize: '20px', color: C.purple, fontWeight: '600' }}>
                    {isCollapsed ? '+' : '-'}
                  </div>
                </div>
              </button>

              {!isCollapsed ? (
                <div style={S.tableScroll}>
                  <table style={{ ...S.table, minWidth: '1080px' }}>
                    <thead style={S.thead}>
                      <tr>
                        {['Employee', 'Department', 'Reporting Lead', 'Period', 'Total Hours', 'Submitted', 'Approved', 'Types', 'Actions'].map((header) => (
                          <th
                            key={header}
                            style={header === 'Total Hours' ? S.thRight : header === 'Actions' ? S.thCenter : S.th}
                          >
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((timesheet, index) => {
                        const id = timesheet._id || timesheet.id;
                        const approvedAt = getApprovedTimestamp(timesheet);
                        const hasWork = timesheetHasEntryType(timesheet, 'work');
                        const hasLeave = timesheetHasEntryType(timesheet, 'leave');
                        const hasHoliday = timesheetHasEntryType(timesheet, 'holiday');
                        const typeTokens = [
                          hasWork ? 'Work' : '',
                          hasLeave ? 'Leave' : '',
                          hasHoliday ? 'Holiday' : '',
                        ].filter(Boolean);

                        return (
                          <tr key={id} style={index % 2 === 0 ? S.trEven : S.trOdd}>
                            <td style={S.td}>
                              <div style={{ fontWeight: '500' }}>{timesheet.employee_name}</div>
                              <div style={{ fontSize: '12px', color: C.textMid }}>{timesheet.employee_email}</div>
                            </td>
                            <td style={S.td}>{timesheet.employee_department || 'Unassigned'}</td>
                            <td style={S.td}>{getReportingLeadLabel(timesheet)}</td>
                            <td style={S.td}>{getTimesheetFortnightMeta(timesheet).label}</td>
                            <td style={S.tdRight}><strong>{formatTimesheetHoursWithSuffix(timesheet.total_hours)}</strong></td>
                            <td style={S.tdMid}>{formatDateTime(timesheet.submitted_at)}</td>
                            <td style={S.tdMid}>{formatDateTime(approvedAt)}</td>
                            <td style={S.td}>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {typeTokens.map((token) => (
                                  <span key={token} style={{ ...S.tag, background: C.purpleLight, color: C.purple }}>{token}</span>
                                ))}
                              </div>
                            </td>
                            <td style={S.tdCenter}>
                              <button
                                type="button"
                                style={{ ...S.btnIcon, color: C.purple }}
                                title="View full timesheet"
                                onClick={async () => {
                                  try {
                                    const full = await fetchAPI(`/timesheets/${id}`);
                                    setViewingTimesheet(full);
                                  } catch (_) {
                                    setViewingTimesheet(timesheet);
                                  }
                                  setFullPageView(true);
                                }}
                              >
                                <Eye size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })
      )}

      {viewingTimesheet && fullPageView ? (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: C.bg, overflowY: 'auto' }}>
          <TimesheetFullPageView
            timesheet={viewingTimesheet}
            user={user}
            ccLookup={ccLookup}
            onClose={() => { setViewingTimesheet(null); setFullPageView(false); }}
          />
        </div>
      ) : null}
    </>
  );
}

// ─── History ──────────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
function History({ user, onNavigate }) {
  const { notify } = useTimesheetUi();
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
      .catch((err) => notify(`Failed to load history: ${err.message}`, 'error'))
      .finally(() => setLoading(false));
  }, [notify, userId]);

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
                        <td style={S.td}><strong>{formatTimesheetHoursWithSuffix(s.total_hours)}</strong></td>
                        <td style={S.tdMid}>
                          {formatDateTime(s.submitted_at)}
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
                                  const meta = getTimesheetEntryChargeCodeMeta(e, ccLookup);
                                  return buildCsvRow([
                                    s.employee_name  || user?.name  || '',
                                    s.employee_email || user?.email || '',
                                    s.period_start,
                                    s.period_end,
                                    e.date,
                                    e.entry_type,
                                    meta.code,
                                    meta.name,
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
  const { notify } = useTimesheetUi();
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
              <button onClick={() => notify('Export is coming soon.', 'info')} style={S.btnPrimary}>
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
// eslint-disable-next-line no-unused-vars
function TeamTimesheets({ user }) {
  const { notify, confirmAction, promptAction } = useTimesheetUi();
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
      .catch((err) => {
        console.error(err);
        setTimesheets([]);
        notify(`Failed to load team timesheets: ${err.message}`, 'error');
      })
      .finally(() => setLoading(false));
  }, [notify, userEmail]);

  useEffect(() => {
    loadTeamTimesheets();
  }, [loadTeamTimesheets]);

  const handleApprove = async (timesheet) => {
    const id = timesheet?._id || timesheet?.id;
    if (!id) return;
    const shouldApprove = await confirmAction({
      title: 'Approve Timesheet',
      message: 'Approve this team member’s timesheet and lock it?',
      confirmLabel: 'Approve',
    });
    if (!shouldApprove) return;
    const ep = timesheet.status === 'pending_manager'
      ? `/timesheets/approve/manager/${id}`
      : `/timesheets/approve/lead/${id}`;
    setLoading(true);
    try {
      await fetchAPI(ep, {
        method: 'PUT',
        body: JSON.stringify({ approved_by: userId, comments: '' }),
      });
      notify('Timesheet approved successfully.', 'success');
      setViewingTimesheet(null);
      loadTeamTimesheets();
    } catch (err) {
      notify(`Approval failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (timesheet) => {
    const id = timesheet?._id || timesheet?.id;
    const reason = await promptAction({
      title: 'Reject Timesheet',
      message: 'Provide a reason for rejecting this timesheet.',
      confirmLabel: 'Reject Timesheet',
      tone: 'danger',
      placeholder: 'Enter rejection reason',
      multiline: true,
      required: true,
    });
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
      notify('Timesheet rejected.', 'success');
      setViewingTimesheet(null);
      loadTeamTimesheets();
    } catch (err) {
      notify(`Rejection failed: ${err.message}`, 'error');
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
                        <td style={S.tdRight}><strong>{formatTimesheetHoursWithSuffix(ts.total_hours)}</strong></td>
                        <td style={S.tdMid}>
                          {formatDateTime(ts.submitted_at)}
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

const getTimesheetFortnightMeta = (timesheet) => {
  const start = timesheet?.period_start ? new Date(timesheet.period_start) : null;
  const end = timesheet?.period_end ? new Date(timesheet.period_end) : null;
  if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) {
    return { key: 'unknown', label: 'Unknown fortnight', sortKey: '' };
  }
  return {
    key: `${timesheet.period_start}__${timesheet.period_end}`,
    label: `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`,
    sortKey: timesheet.period_start,
  };
};

const getLatestApprovedEntry = (timesheet) => {
  const history = Array.isArray(timesheet?.approval_history) ? timesheet.approval_history : [];
  return [...history].reverse().find((entry) => entry.action === 'approved') || null;
};

const getApprovedTimestamp = (timesheet) =>
  getLatestApprovedEntry(timesheet)?.timestamp
  || timesheet?.manager_approved_at
  || timesheet?.lead_approved_at
  || '';

const isDateValueInRange = (value, range = blankDateRange) => {
  const dateKey = String(value || '').slice(0, 10);
  if (!dateKey) return false;
  if (range.start && dateKey < range.start) return false;
  if (range.end && dateKey > range.end) return false;
  return true;
};

// ─── AdminTimesheets ──────────────────────────────────────────────────────────
function AdminTimesheets() {
  const { notify, confirmAction, promptAction } = useTimesheetUi();
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
  const [collapsedGroups,  setCollapsedGroups]  = useState({});
  const [viewingTimesheet, setViewingTimesheet] = useState(null);
  const [fullPageView,     setFullPageView]     = useState(false);

  const ccLookup = useCcLookup();
  const userId = getUserId(JSON.parse(localStorage.getItem('user') || 'null') || {});
  const getFortnightMeta = (timesheet) => {
    const start = timesheet?.period_start ? new Date(timesheet.period_start) : null;
    const end = timesheet?.period_end ? new Date(timesheet.period_end) : null;
    if (!start || Number.isNaN(start.getTime()) || !end || Number.isNaN(end.getTime())) {
      return { key: 'unknown', label: 'Unknown fortnight' };
    }
    return {
      key: `${timesheet.period_start}__${timesheet.period_end}`,
      label: `${format(start, 'MMM d, yyyy')} – ${format(end, 'MMM d, yyyy')}`,
    };
  };

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
      .catch((err) => {
        console.error('AdminTimesheets error:', err);
        notify(`Failed to load admin timesheets: ${err.message}`, 'error');
      })
      .finally(() => setLoading(false));
  }, [notify]);

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
        : groupMode === 'fortnight'
          ? getFortnightMeta(timesheet).key
          : (timesheet.employee_department || 'Unassigned');
      const label = groupMode === 'team'
        ? getReportingLeadLabel(timesheet)
        : groupMode === 'fortnight'
          ? getFortnightMeta(timesheet).label
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
    total:    filtered.length,
    pending:  filtered.filter((t) => t.status?.startsWith('pending')).length,
    approved: filtered.filter((t) => t.status === 'approved').length,
    rejected: filtered.filter((t) => t.status?.startsWith('rejected')).length,
    approvedHours: filtered
      .filter((t) => t.status === 'approved')
      .reduce((s, t) => s + (t.total_hours || 0), 0),
    departments: new Set(filtered.map((item) => item.employee_department || 'Unassigned')).size,
    leads: new Set(filtered.map((item) => item.reporting_lead_id || getReportingLeadLabel(item) || 'Unassigned')).size,
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

  const requestAdminApproverName = async (actionLabel) => {
    const approverName = await promptAction({
      title: `${actionLabel} Timesheet`,
      message: `Enter the name that should be recorded for this admin ${actionLabel.toLowerCase()} action.`,
      confirmLabel: actionLabel,
      placeholder: 'Enter approver name',
      required: true,
    });
    return approverName?.trim() || '';
  };

  const handleAdminApprove = async (timesheet) => {
    const approverName = await requestAdminApproverName('Approve');
    if (!approverName) return;
    const shouldApprove = await confirmAction({
      title: 'Approve Timesheet',
      message: `Approve this timesheet as "${approverName}"?`,
      confirmLabel: 'Approve',
    });
    if (!shouldApprove) return;
    try {
      await fetchAPI(`/timesheets/approve/lead/${timesheet._id || timesheet.id}`, {
        method: 'PUT',
        body: JSON.stringify({ approved_by: userId, approver_name: approverName, comments: '' }),
      });
      notify('Timesheet approved successfully.', 'success');
      const approvedAt = new Date().toISOString();
      setTimesheets((previous) => previous.map((item) => (
        (item._id || item.id) !== (timesheet._id || timesheet.id)
          ? item
          : {
            ...item,
            status: 'approved',
            lead_approved_by: approverName,
            lead_approved_at: approvedAt,
            approval_history: [
              ...(Array.isArray(item.approval_history) ? item.approval_history : []),
              { stage: 'lead', action: 'approved', approver_name: approverName, timestamp: approvedAt, comments: '' },
            ],
          }
      )));
    } catch (err) {
      notify(`Approval failed: ${err.message}`, 'error');
    }
  };

  const handleAdminReject = async (timesheet) => {
    const approverName = await requestAdminApproverName('Reject');
    if (!approverName) return;
    const rejectionReason = await promptAction({
      title: 'Reject Timesheet',
      message: `Enter the rejection reason to record under "${approverName}".`,
      confirmLabel: 'Reject',
      tone: 'danger',
      placeholder: 'Enter rejection reason',
      multiline: true,
      required: true,
    });
    if (!rejectionReason?.trim()) return;
    try {
      await fetchAPI(`/timesheets/reject/lead/${timesheet._id || timesheet.id}`, {
        method: 'PUT',
        body: JSON.stringify({ rejected_by: userId, approver_name: approverName, rejection_reason: rejectionReason.trim() }),
      });
      notify('Timesheet rejected successfully.', 'success');
      const rejectedAt = new Date().toISOString();
      setTimesheets((previous) => previous.map((item) => (
        (item._id || item.id) !== (timesheet._id || timesheet.id)
          ? item
          : {
            ...item,
            status: 'rejected_by_lead',
            lead_rejected_by: approverName,
            rejection_reason: rejectionReason.trim(),
            approval_history: [
              ...(Array.isArray(item.approval_history) ? item.approval_history : []),
              { stage: 'lead', action: 'rejected', approver_name: approverName, timestamp: rejectedAt, comments: rejectionReason.trim() },
            ],
          }
      )));
    } catch (err) {
      notify(`Rejection failed: ${err.message}`, 'error');
    }
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
                  <td style={S.tdRight}><strong>{formatTimesheetHoursWithSuffix(ts.total_hours)}</strong></td>
                  <td style={S.tdMid}>
                    {formatDateTime(ts.submitted_at)}
                  </td>
                  <td style={S.tdCenter}><StatusBadge status={ts.status} /></td>
                  <td style={S.td}>
                    {leadApproval.name ? (
                      <>
                        <div style={{ fontWeight: '500' }}>{leadApproval.name}</div>
                        <div style={{ fontSize: '12px', color: C.textMid }}>
                          {leadApproval.timestamp ? formatDateTime(leadApproval.timestamp) : 'Date unavailable'}
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
                            const meta = getTimesheetEntryChargeCodeMeta(e, ccLookup);
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
                              meta.code,
                              meta.name,
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
                        {ts.status === 'pending_lead' && (
                          <>
                            <button
                              onClick={() => handleAdminApprove(ts)}
                              style={{ ...S.btnIcon, color: C.green }}
                              title="Approve as admin"
                            >
                              <CheckCircle size={15} />
                            </button>
                            <button
                              onClick={() => handleAdminReject(ts)}
                              style={{ ...S.btnIcon, color: C.red }}
                              title="Reject as admin"
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
  );

  const exportFilteredTimesheets = () => {
    const rows = filtered.flatMap((timesheet) => {
      const leadApproval = getLeadApprovalMeta(timesheet);
      return (timesheet.entries || []).map((entry) => {
        const meta = getTimesheetEntryChargeCodeMeta(entry, ccLookup);
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
          meta.code,
          meta.name,
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

  const toggleGroupCollapse = (groupKey) => {
    setCollapsedGroups((previous) => ({ ...previous, [groupKey]: !previous[groupKey] }));
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
                <div style={S.statSub}>{filtered.length === timesheets.length ? sub : `Filtered ${sub.toLowerCase()}`}</div>
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
                  { key: 'fortnight', label: 'Fortnight-wise', Icon: CalendarRange },
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
	                  <div
                      style={{ ...S.card, ...S.cardPadSm, marginBottom: '10px', cursor: 'pointer' }}
                      onClick={() => toggleGroupCollapse(group.key)}
                    >
	                    <div style={S.rowBetween}>
	                      <div>
	                        <div style={{ fontSize: '15px', fontWeight: '600', color: C.text }}>{group.label}</div>
	                        <div style={{ fontSize: '12px', color: C.textMid }}>
	                          {group.items.length} timesheet{group.items.length !== 1 ? 's' : ''} ·{' '}
	                          {formatTimesheetHoursWithSuffix(group.items.reduce((sum, item) => sum + (item.total_hours || 0), 0))}
	                        </div>
	                      </div>
                        <div style={{ fontSize: '12px', color: C.textMid }}>
                          {collapsedGroups[group.key] ? 'Show' : 'Collapse'}
                        </div>
	                    </div>
	                  </div>
	                ) : null}
	                {groupMode === 'flat' || !collapsedGroups[group.key] ? renderTimesheetTable(group.items) : null}
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
                'Switch between department-wise, team-wise, fortnight-wise, and flat views',
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
  const owner = item.owner_name || (item.is_reference || item.is_system ? 'naxrita' : '') || item.owner || item.created_by_name || item.assigned_by_name || '-';
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

function getEmployeeProjectNames(employee = {}) {
  const projectNames = new Set();
  if (Array.isArray(employee.projectNames)) {
    employee.projectNames.forEach((name) => {
      if (name) projectNames.add(String(name));
    });
  }
  if (Array.isArray(employee.projects)) {
    employee.projects.forEach((project) => {
      const name = project?.projectName || project?.name || project?.title || project?.project_name;
      if (name) projectNames.add(String(name));
    });
  }
  if (employee.project) projectNames.add(String(employee.project));
  return Array.from(projectNames);
}

function ChargeCodesWorkspace({ user, adminMode = false }) {
  const { notify } = useTimesheetUi();
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
  const [assignmentDepartment, setAssignmentDepartment] = useState('all');
  const [assignmentProject, setAssignmentProject] = useState('all');
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
      .catch((err) => notify(`Failed to load charge codes: ${err.message}`, 'error'))
      .finally(() => setLoading(false));
  }, [adminMode, notify, userId]);

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
  const allRows = useMemo(() => codes.map(getChargeCodeGridRow), [codes]);
  const visibleRowIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const allVisibleRowsSelected = useMemo(
    () => visibleRowIds.length > 0 && visibleRowIds.every((rowId) => selectedRows.includes(rowId)),
    [selectedRows, visibleRowIds]
  );
  const departmentOptions = useMemo(
    () => Array.from(new Set(employees.map((employee) => employee.department || 'Unassigned')))
      .sort((first, second) => first.localeCompare(second)),
    [employees]
  );
  const projectOptions = useMemo(
    () => Array.from(new Set(employees.flatMap(getEmployeeProjectNames)))
      .sort((first, second) => first.localeCompare(second)),
    [employees]
  );
  const assignmentScopedEmployees = useMemo(
    () => employees.filter((employee) => {
      const department = employee.department || 'Unassigned';
      const employeeProjects = getEmployeeProjectNames(employee);
      const matchesDepartment = assignmentDepartment === 'all' || department === assignmentDepartment;
      const matchesProject = assignmentProject === 'all' || employeeProjects.includes(assignmentProject);
      return matchesDepartment && matchesProject;
    }),
    [assignmentDepartment, assignmentProject, employees]
  );
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

  const toggleSelectedRow = (row) => {
    const rowId = row.id;
    setSelectedRows((previous) =>
      previous.includes(rowId)
        ? previous.filter((id) => id !== rowId)
        : [...previous, rowId]
    );
  };
  const toggleSelectAllVisibleRows = () => {
    if (visibleRowIds.length === 0) {
      notify('No charge codes found for the current view.', 'warning');
      return;
    }

    setSelectedRows((previous) => {
      if (visibleRowIds.every((rowId) => previous.includes(rowId))) {
        return previous.filter((rowId) => !visibleRowIds.includes(rowId));
      }
      return Array.from(new Set([...previous, ...visibleRowIds]));
    });
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
  const addEmployeeSelection = (employeeIds = []) => {
    const ids = employeeIds.filter(Boolean);
    if (ids.length === 0) {
      notify('No employees found for that selection.', 'warning');
      return;
    }
    setSelectedEmployees((previous) => Array.from(new Set([...previous, ...ids])));
  };
  const selectAllEmployees = () => {
    addEmployeeSelection(employees.map((employee) => employee._id));
  };
  const selectScopedEmployees = () => {
    addEmployeeSelection(assignmentScopedEmployees.map((employee) => employee._id));
  };

  const handleAddCode = async () => {
    const code = chargeCodeForm.code.trim();
    if (!code) {
      notify('Enter a charge code.', 'warning');
      return;
    }
    if (!adminMode) {
      notify('Only admins can add charge codes.', 'warning');
      return;
    }
    if (!userId) {
      notify('User not loaded properly.', 'error');
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
      notify('Charge code added successfully.', 'success');
    } catch (err) {
      notify(`Failed to add charge code: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!adminMode) {
      writeChargeCodeDisplayPreferences(userId, displayRows);
      notify('Charge code display preferences saved.', 'success');
      return;
    }

    if (selectedEmployees.length === 0 || selectedRows.length === 0) {
      notify('Select at least one employee and one charge code.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const selectedCodes = allRows
        .filter((row) => selectedRows.includes(row.id))
        .map((row) => row.raw._id || row.raw.charge_code_id)
        .filter(Boolean);

      if (selectedCodes.length === 0) {
        notify('Select at least one assignable charge code.', 'warning');
        setLoading(false);
        return;
      }

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
      notify(
        failed
          ? `Assigned to ${succeeded} employees, failed for ${failed}.`
          : `Assigned to ${succeeded} employee${succeeded !== 1 ? 's' : ''}.`,
        failed ? 'warning' : 'success'
      );
      setSelectedRows([]);
      setSelectedEmployees([]);
    } catch (err) {
      notify(`Failed to submit charge code assignment: ${err.message}`, 'error');
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
            <div className="mte-chargecodes-assignment-grid">
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
                      description: [employee.department, getEmployeeProjectNames(employee).join(', ') || employee.employeeId]
                        .filter(Boolean)
                        .join(' • '),
                    })),
                  ]}
                />
              </div>

              <label className="mte-chargecodes-filter-field">
                <span>Department</span>
                <select value={assignmentDepartment} onChange={(event) => setAssignmentDepartment(event.target.value)}>
                  <option value="all">All departments</option>
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
              </label>

              <label className="mte-chargecodes-filter-field">
                <span>Project</span>
                <select value={assignmentProject} onChange={(event) => setAssignmentProject(event.target.value)}>
                  <option value="all">All projects</option>
                  {projectOptions.map((project) => (
                    <option key={project} value={project}>{project}</option>
                  ))}
                </select>
              </label>

              <label className="mte-chargecodes-filter-field mte-chargecodes-view-field">
                <span>View</span>
                <select value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option>All</option>
                  <option>Displayed</option>
                  <option>Selected</option>
                </select>
              </label>
            </div>
          ) : null}

          {adminMode ? (
            <div className="mte-chargecodes-assignment-actions">
              <button type="button" onClick={selectAllEmployees}>
                <Users size={13} />
                <span>Select All</span>
              </button>
              <button type="button" onClick={selectScopedEmployees}>
                <Building2 size={13} />
                <span>Select Group</span>
              </button>
              <button type="button" onClick={toggleSelectAllVisibleRows}>
                <CheckCircle size={13} />
                <span>{allVisibleRowsSelected ? 'Clear Charge Codes' : 'Select All Charge Codes'}</span>
              </button>
              <span>{assignmentScopedEmployees.length} employee{assignmentScopedEmployees.length === 1 ? '' : 's'} match</span>
            </div>
          ) : null}

          {selectedEmployees.length > 0 ? (
            <div className="mte-chargecodes-selected-employees">
              {selectedEmployees.slice(0, 8).map((employeeId) => {
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
              {selectedEmployees.length > 8 ? (
                <span className="mte-chargecodes-selected-count">+{selectedEmployees.length - 8} more</span>
              ) : null}
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
            <button type="button" onClick={toggleSelectAllVisibleRows}>
              <CheckCircle size={14} />
              <span>{allVisibleRowsSelected ? 'Clear Charge Codes' : 'Select All Charge Codes'}</span>
            </button>
            <button type="button" onClick={() => {
              setChargeCodeForm(emptyChargeCodeForm);
              setSelectedRows([]);
              setSelectedEmployees([]);
              setFilter('All');
              setAssignmentDepartment('all');
              setAssignmentProject('all');
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
              <th>
                <label className="mte-chargecodes-header-select">
                  <input
                    type="checkbox"
                    checked={allVisibleRowsSelected}
                    onChange={toggleSelectAllVisibleRows}
                    aria-label={allVisibleRowsSelected ? 'Clear visible charge codes' : 'Select all visible charge codes'}
                  />
                  <span>Select</span>
                </label>
              </th>
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
                      onChange={() => toggleSelectedRow(row)}
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
  const { notify } = useTimesheetUi();
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
      notify('Please enter both a code and a name.', 'warning');
      return;
    }
    if (!userId) { notify('User not loaded properly.', 'error'); return; }
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
      notify('Charge code created successfully.', 'success');
      setNewCode({ charge_code: '', charge_code_name: '' });
      loadCodes();
    } catch (err) {
      notify(`Error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAssign = async () => {
    if (selectedEmployees.length === 0 || !selectedCode) {
      notify('Please select at least one employee and a charge code.', 'warning');
      return;
    }
    if (!userId) { notify('User not loaded properly.', 'error'); return; }
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
      notify(
        failed === 0
          ? `Charge code assigned to ${succeeded} employee${succeeded !== 1 ? 's' : ''} successfully`
          : `Assigned to ${succeeded}, failed for ${failed} employee${failed !== 1 ? 's' : ''}`
      , failed === 0 ? 'success' : 'warning');
      setSelectedEmployees([]);
      setSelectedCode('');
    } catch (err) {
      notify(`Error: ${err.message}`, 'error');
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
                        {formatDateTime(c.created_at)}
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
  const { notify } = useTimesheetUi();
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
        notify(`Failed to load employees: ${err.message}`, 'error');
      })
      .finally(() => setLoading(false));
  }, [notify]);

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
      notify(`Saved assignment for ${employee.name}.`, 'success');
    } catch (err) {
      notify(`Failed to save assignment for ${employee.name}: ${err.message}`, 'error');
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
                'Future submissions snapshot the current assignment values onto the timesheet for approval history consistency.',
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
  const { notify, confirmAction } = useTimesheetUi();
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
    client_code: '',
    amount: '',
    description: '',
    documentFile: null,
  });
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(false);
  const [expenseFilters, setExpenseFilters] = useState({
    search: '',
    department: 'all',
    category: 'all',
    clientCode: 'all',
    document: 'all',
    from: '',
    to: '',
  });

  const loadExpenses = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    const endpoint = isAdmin
      ? '/expenses?role=Admin'
      : `/expenses?employee_id=${userId}&role=${encodeURIComponent(user?.role || '')}`;
    fetchAPI(endpoint)
      .then((data) => setExpenses(Array.isArray(data) ? data : []))
      .catch((err) => notify(`Failed to load expenses: ${err.message}`, 'error'))
      .finally(() => setLoading(false));
  }, [isAdmin, notify, userId, user?.role]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  const resetForm = () => {
    setEditingId('');
    setForm({ expense_date: today, category: 'Travel', client_code: '', amount: '', description: '', documentFile: null });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSaveExpense = async () => {
    if (!userId) {
      notify('User not loaded properly.', 'error');
      return;
    }
    if (!form.expense_date || !form.category || !form.amount || Number(form.amount) <= 0) {
      notify('Enter date, category, and an amount greater than zero.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        employee_id: userId,
        expense_date: form.expense_date,
        category: form.category,
        client_code: form.client_code.trim(),
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
      notify(editingId ? 'Expense updated successfully.' : 'Expense saved successfully.', 'success');
    } catch (err) {
      notify(`Failed to save expense: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleEditExpense = (expense) => {
    setEditingId(expense._id);
    setForm({
      expense_date: expense.expense_date || today,
      category: expense.category || 'Travel',
      client_code: expense.client_code || '',
      amount: String(expense.amount || ''),
      description: expense.description || '',
      documentFile: null,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteExpense = async (expenseId) => {
    const shouldDelete = await confirmAction({
      title: 'Delete Expense',
      message: 'Delete this expense? This action cannot be undone.',
      confirmLabel: 'Delete Expense',
      tone: 'danger',
    });
    if (!shouldDelete) return;
    setLoading(true);
    try {
      await fetchAPI(`/expenses/${expenseId}`, { method: 'DELETE' });
      if (editingId === expenseId) resetForm();
      loadExpenses();
      notify('Expense deleted successfully.', 'success');
    } catch (err) {
      notify(`Failed to delete expense: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const expenseDepartmentOptions = useMemo(
    () => Array.from(new Set(expenses.map((expense) => expense.employee_department || 'Unassigned')))
      .sort((first, second) => first.localeCompare(second)),
    [expenses]
  );
  const expenseCategoryOptions = useMemo(
    () => Array.from(new Set(expenses.map((expense) => expense.category).filter(Boolean)))
      .sort((first, second) => first.localeCompare(second)),
    [expenses]
  );
  const expenseClientCodeOptions = useMemo(
    () => Array.from(new Set(expenses.map((expense) => expense.client_code || 'Unassigned')))
      .sort((first, second) => first.localeCompare(second)),
    [expenses]
  );
  const expenseSearchSuggestions = useMemo(
    () => uniqSuggestions(expenses, [
      'employee_name',
      'employee_email',
      'employee_department',
      'client_code',
      'category',
      'description',
    ]),
    [expenses]
  );
  const visibleExpenses = useMemo(() => {
    if (!isAdmin) return expenses;
    const query = expenseFilters.search.trim().toLowerCase();
    return expenses.filter((expense) => {
      const matchesSearch = !query || [
        expense.employee_name,
        expense.employee_email,
        expense.employee_department,
        expense.client_code,
        expense.category,
        expense.description,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      const matchesDepartment = expenseFilters.department === 'all'
        || (expense.employee_department || 'Unassigned') === expenseFilters.department;
      const matchesCategory = expenseFilters.category === 'all'
        || expense.category === expenseFilters.category;
      const matchesClientCode = expenseFilters.clientCode === 'all'
        || (expense.client_code || 'Unassigned') === expenseFilters.clientCode;
      const matchesDocument = expenseFilters.document === 'all'
        || (expenseFilters.document === 'with' && expense.document?.url)
        || (expenseFilters.document === 'without' && !expense.document?.url);
      const matchesFrom = !expenseFilters.from || !expense.expense_date || expense.expense_date >= expenseFilters.from;
      const matchesTo = !expenseFilters.to || !expense.expense_date || expense.expense_date <= expenseFilters.to;
      return matchesSearch && matchesDepartment && matchesCategory && matchesClientCode && matchesDocument && matchesFrom && matchesTo;
    });
  }, [expenseFilters, expenses, isAdmin]);
  const activeExpenseFilterCount = isAdmin
    ? [
        expenseFilters.search.trim(),
        expenseFilters.department !== 'all',
        expenseFilters.category !== 'all',
        expenseFilters.clientCode !== 'all',
        expenseFilters.document !== 'all',
        expenseFilters.from,
        expenseFilters.to,
      ].filter(Boolean).length
    : 0;
  const resetExpenseFilters = () => {
    setExpenseFilters({ search: '', department: 'all', category: 'all', clientCode: 'all', document: 'all', from: '', to: '' });
  };
  const totalExpenseAmount = visibleExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const attachedDocumentCount = visibleExpenses.filter((expense) => expense.document?.url).length;
  const expenseTableColSpan = isAdmin ? 8 : 7;

  return (
    <div className="mte-module-card mte-expense-shell">
      <div className="mte-expense-summary-grid">
        <article>
          <span>Total claims</span>
          <strong>{expenses.length}</strong>
        </article>
        <article>
          <span>Total amount</span>
          <strong>{totalExpenseAmount.toFixed(2)}</strong>
        </article>
        <article>
          <span>Documents</span>
          <strong>{attachedDocumentCount}</strong>
        </article>
      </div>

      {isAdmin ? (
        <section className="mte-expense-form-panel mte-expense-filter-card">
          <div className="mte-module-card-header">
            <div>
              <h3>Expense Review Filters</h3>
              <p>{visibleExpenses.length} of {expenses.length} claims{activeExpenseFilterCount ? ` with ${activeExpenseFilterCount} filter${activeExpenseFilterCount === 1 ? '' : 's'}` : ''}</p>
            </div>
            <button type="button" className="mte-icon-text-button" onClick={loadExpenses}>
              <RefreshCw size={16} />
              <span>Refresh</span>
            </button>
          </div>
          <div className="mte-expense-filter-grid">
            <label className="mte-expense-filter-field mte-expense-filter-search">
              <span>Search</span>
              <ValueHelpSearch
                value={expenseFilters.search}
                onChange={(value) => setExpenseFilters((previous) => ({ ...previous, search: value }))}
                suggestions={expenseSearchSuggestions}
                placeholder="Employee, email, department, client code, or category"
              />
            </label>
            <label className="mte-expense-filter-field">
              <span>Department</span>
              <select
                value={expenseFilters.department}
                onChange={(event) => setExpenseFilters((previous) => ({ ...previous, department: event.target.value }))}
              >
                <option value="all">All departments</option>
                {expenseDepartmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
              </select>
            </label>
            <label className="mte-expense-filter-field">
              <span>Category</span>
              <select
                value={expenseFilters.category}
                onChange={(event) => setExpenseFilters((previous) => ({ ...previous, category: event.target.value }))}
              >
                <option value="all">All categories</option>
                {expenseCategoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label className="mte-expense-filter-field">
              <span>Client / Charge Code</span>
              <select
                value={expenseFilters.clientCode}
                onChange={(event) => setExpenseFilters((previous) => ({ ...previous, clientCode: event.target.value }))}
              >
                <option value="all">All client codes</option>
                {expenseClientCodeOptions.map((clientCode) => <option key={clientCode} value={clientCode}>{clientCode}</option>)}
              </select>
            </label>
            <label className="mte-expense-filter-field">
              <span>Document</span>
              <select
                value={expenseFilters.document}
                onChange={(event) => setExpenseFilters((previous) => ({ ...previous, document: event.target.value }))}
              >
                <option value="all">All documents</option>
                <option value="with">With document</option>
                <option value="without">Without document</option>
              </select>
            </label>
            <label className="mte-expense-filter-field">
              <span>From</span>
              <input
                type="date"
                value={expenseFilters.from}
                onChange={(event) => setExpenseFilters((previous) => ({ ...previous, from: event.target.value }))}
              />
            </label>
            <label className="mte-expense-filter-field">
              <span>To</span>
              <input
                type="date"
                value={expenseFilters.to}
                onChange={(event) => setExpenseFilters((previous) => ({ ...previous, to: event.target.value }))}
              />
            </label>
            <div className="mte-expense-filter-actions">
              <button type="button" onClick={resetExpenseFilters}>
                <RefreshCw size={14} />
                <span>Reset</span>
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="mte-expense-form-panel">
          <div className="mte-module-card-header">
            <div>
              <h3>{editingId ? 'Edit Expense' : 'Add Expense'}</h3>
            </div>
            <button type="button" className="mte-icon-text-button" onClick={resetForm}>
              <LayoutGrid size={16} />
              <span>Clear</span>
            </button>
          </div>
          <div className="mte-expense-form-grid">
            <label>
              <span>Date</span>
              <input
                className="input"
                type="date"
                value={form.expense_date}
                onChange={(event) => setForm({ ...form, expense_date: event.target.value })}
              />
            </label>
            <label>
              <span>Category</span>
              <select
                className="input"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              >
                {expenseCategories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>
            <label>
              <span>Client / Charge Code</span>
              <input
                className="input"
                placeholder="Client or charge code"
                value={form.client_code}
                onChange={(event) => setForm({ ...form, client_code: event.target.value })}
              />
            </label>
            <label>
              <span>Amount</span>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Amount"
                value={form.amount}
                onChange={(event) => setForm({ ...form, amount: event.target.value })}
              />
            </label>
            <label className="mte-expense-description-field">
              <span>Description</span>
              <input
                className="input"
                placeholder="Description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </label>
            <div className="mte-expense-upload-field">
              <span>Document</span>
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
            </div>
            <button type="button" className="mte-submit-button mte-expense-save-button" onClick={handleSaveExpense} disabled={loading}>
              <Save size={16} />
              <span>{editingId ? 'Update Expense' : 'Save Expense'}</span>
            </button>
          </div>
        </section>
      )}
      <div className="mte-simple-table-wrap">
        <table className="mte-simple-table">
          <thead>
            <tr>
              {[
                'Date',
                ...(isAdmin ? ['Employee', 'Department'] : []),
                'Client / Charge Code',
                'Category',
                'Description',
                'Amount',
                'Document',
                ...(isAdmin ? [] : ['Action']),
              ].map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && visibleExpenses.length === 0 ? (
              <tr><td colSpan={expenseTableColSpan}>Loading expenses...</td></tr>
            ) : visibleExpenses.length === 0 ? (
              <tr><td colSpan={expenseTableColSpan}>{isAdmin ? 'No expense claims match the current filters.' : 'No expenses added yet.'}</td></tr>
            ) : visibleExpenses.map((expense) => (
              <tr key={expense._id}>
                <td>{expense.expense_date}</td>
                {isAdmin ? <td>{expense.employee_name || 'Employee'}</td> : null}
                {isAdmin ? <td>{expense.employee_department || 'Unassigned'}</td> : null}
                <td>{expense.client_code || '-'}</td>
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
                {!isAdmin ? (
                  <td>
                    <button type="button" style={S.btnIcon} onClick={() => handleEditExpense(expense)} title="Edit expense">
                      <FileText size={14} />
                    </button>
                    <button type="button" style={{ ...S.btnIcon, color: C.red }} onClick={() => handleDeleteExpense(expense._id)} title="Delete expense">
                      <Trash2 size={14} />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LocationsPanel({
  selectedPeriod,
  periods,
  user,
  onPreviousTimesheet,
  canPreviousTimesheet,
  onNextTimesheet,
  canNextTimesheet,
}) {
  const { notify } = useTimesheetUi();
  const userId = getUserId(user);
  const [profile, setProfile] = useState(user || {});
  const [country, setCountry] = useState(user?.countryRegion || user?.country || 'India');
  const [locationOne, setLocationOne] = useState(user?.workLocation || '');
  const [locationTwo, setLocationTwo] = useState(user?.assignedLocation || user?.costCenter || '');
  const [dailyLocations, setDailyLocations] = useState({});
  const [selectedDates, setSelectedDates] = useState([]);
  const [loading, setLoading] = useState(false);
  const period = useMemo(
    () => periods.find((item) => item.value === selectedPeriod) || periods[0],
    [periods, selectedPeriod]
  );
  const dates = useMemo(
    () => (period ? eachDayOfInterval({ start: parseISO(period.start), end: parseISO(period.end) }) : []),
    [period]
  );
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
    const saved = readSavedPeriodLocations(
      userId,
      period.value,
      dates.map((day) => format(day, 'yyyy-MM-dd'))
    );
    setDailyLocations(saved.dailyLocations || {});
    setSelectedDates([]);
    if (saved.country) setCountry(saved.country);
    if (saved.locationOne) setLocationOne(saved.locationOne);
    if (saved.locationTwo) setLocationTwo(saved.locationTwo);
  }, [dates, period, userId]);

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
      notify('Select country/region and location one.', 'warning');
      return;
    }

    const nextDailyLocations = dates.reduce((acc, day) => {
      const key = format(day, 'yyyy-MM-dd');
      acc[key] = dailyLocations[key] || locationOne;
      return acc;
    }, {});

    setLoading(true);
    try {
      writeSavedPeriodLocations(userId, period.value, {
        country,
        locationOne,
        locationTwo,
        dailyLocations: nextDailyLocations,
        assignedLocations: {},
      });
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
      notify(submit ? 'Locations submitted successfully.' : 'Locations saved successfully.', 'success');
    } catch (err) {
      notify(`Failed to save locations: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddLocation = () => {
    if (!country || !locationOne) {
      notify('Select country/region and location one.', 'warning');
      return;
    }
    const targetDates = selectedDates.length
      ? selectedDates
      : dates
        .map((day) => format(day, 'yyyy-MM-dd'));
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
            Draft
          </button>
          <button type="button" className="is-primary" onClick={() => persistLocations({ submit: true })} disabled={loading}>
            Submit
          </button>
        </div>
      </div>

      <div className="mte-locations-date-strip">
        <div className="mte-locations-date-strip-back">
          <div className="mte-locations-date-strip-back-controls">
            <button
              type="button"
              className="mte-locations-prev-timesheet"
              onClick={onPreviousTimesheet}
              disabled={!canPreviousTimesheet}
            >
              Previous Timesheet
            </button>
            <button
              type="button"
              className="mte-locations-next-timesheet"
              aria-label="Next timesheet"
              title="Next timesheet"
              onClick={onNextTimesheet}
              disabled={!canNextTimesheet}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
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
            <span>Work Location</span>
            <select value={country} onChange={(event) => setCountry(event.target.value)}>
              <option value="">Select a work location</option>
              <option>India</option>
              <option>Italy</option>
              <option>United States</option>
              <option>United Kingdom</option>
              <option>Germany</option>
            </select>
          </label>

          <label>
            <span>Assigned Location</span>
            <select value={locationOne} onChange={(event) => setLocationOne(event.target.value)}>
              <option value="">Select an assigned location</option>
              {locationOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>

          <label>
            <span>Company Code/ Cost Center</span>
            <select value={locationTwo} onChange={(event) => setLocationTwo(event.target.value)}>
              <option value="">Select a company code/cost center</option>
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
              const isWeekend = isWeekendDate(key);
              return (
                <article key={key} className={`${isSelected ? 'is-selected' : ''} ${isWeekend ? 'is-weekend' : ''}`.trim()}>
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

function PreferencesPanel({ user, periods, selectedPeriod }) {
  const { notify } = useTimesheetUi();
  const isAdmin = user?.role === 'Admin';
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedPeriodValue, setSelectedPeriodValue] = useState(selectedPeriod || periods?.[0]?.value || '');
  const [drafts, setDrafts] = useState({
    reviewer: '',
    notification: '',
    delegate: '',
    approver: '',
  });
  const [selected, setSelected] = useState({
    reviewers: '',
    notifications: '',
    delegates: '',
    approvers: '',
  });

  useEffect(() => {
    setSelectedPeriodValue(selectedPeriod || periods?.[0]?.value || '');
  }, [periods, selectedPeriod]);

  useEffect(() => {
    if (!isAdmin) return;
    fetchAPI('/users/get_all_employees')
      .then((data) => {
        const items = Array.isArray(data) ? data : [];
        setEmployees(items);
        if (!selectedEmployeeId && items[0]?._id) {
          setSelectedEmployeeId(items[0]._id);
        }
      })
      .catch((err) => notify(`Failed to load employees: ${err.message}`, 'error'));
  }, [isAdmin, notify, selectedEmployeeId]);

  const selectedPeriodOption = useMemo(
    () => periods.find((item) => item.value === selectedPeriodValue) || periods[0],
    [periods, selectedPeriodValue]
  );

  useEffect(() => {
    if (!isAdmin || !selectedEmployeeId || !selectedPeriodOption?.start || !selectedPeriodOption?.end) return;
    setLoading(true);
    fetchAPI(`/timesheets/preferences?employee_id=${selectedEmployeeId}&period_start=${selectedPeriodOption.start}&period_end=${selectedPeriodOption.end}`)
      .then((data) => {
        setSelected({
          reviewers: (data.reviewers || []).join('\n'),
          notifications: (data.notifications || []).join('\n'),
          delegates: (data.delegates || []).join('\n'),
          approvers: (data.approvers || []).join('\n'),
        });
      })
      .catch((err) => notify(`Failed to load workflow preferences: ${err.message}`, 'error'))
      .finally(() => setLoading(false));
  }, [isAdmin, notify, selectedEmployeeId, selectedPeriodOption]);

  const updateDraft = (key, value) => {
    setDrafts((previous) => ({ ...previous, [key]: value }));
  };

  const updateSelected = (key, value) => {
    setSelected((previous) => ({ ...previous, [key]: value }));
  };

  const addPreference = (draftKey, selectedKey) => {
    const additions = splitPreferenceEntries(drafts[draftKey]);
    if (!additions.length) return;
    setSelected((previous) => ({
      ...previous,
      [selectedKey]: mergePreferenceEntries(previous[selectedKey], additions),
    }));
    setDrafts((previous) => ({ ...previous, [draftKey]: '' }));
  };

  const savePreferences = async () => {
    if (!selectedEmployeeId || !selectedPeriodOption?.start || !selectedPeriodOption?.end) {
      notify('Select an employee and fortnight before saving workflow preferences.', 'warning');
      return;
    }

    setLoading(true);
    try {
      await fetchAPI('/timesheets/preferences', {
        method: 'PUT',
        body: JSON.stringify({
          employee_id: selectedEmployeeId,
          period_start: selectedPeriodOption.start,
          period_end: selectedPeriodOption.end,
          reviewers: splitPreferenceEntries(selected.reviewers),
          notifications: splitPreferenceEntries(selected.notifications),
          delegates: splitPreferenceEntries(selected.delegates),
          approvers: splitPreferenceEntries(selected.approvers),
        }),
      });
      notify('Timesheet workflow preferences saved.', 'success');
    } catch (err) {
      notify(`Failed to save workflow preferences: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="mte-module-card">
        <div className="mte-module-card-header">
          <div>
            <h3>Workflow Preferences</h3>
            <p>This module is managed by admins. Approvers, reviewers, delegates, and notification recipients are assigned centrally per employee and fortnight.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mte-module-card mte-preferences-shell">
      <div className="mte-module-card-header">
        <div>
          <h3>Admin Workflow Preferences</h3>
          <p>Select an employee and fortnight, then define the notification and approval routing moderated by admin.</p>
        </div>
        <button type="button" style={loading ? S.btnDisabled : S.btnPrimary} onClick={savePreferences} disabled={loading}>
          {loading ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>

      <div className="mte-preferences-grid" style={{ marginBottom: '18px' }}>
        <div className="mte-pref-field">
          <label>Employee:</label>
          <select className="input" value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)}>
            {employees.map((employee) => (
              <option key={employee._id} value={employee._id}>
                {employee.name || employee.email || employee._id}
              </option>
            ))}
          </select>
        </div>
        <div />
        <div className="mte-pref-field">
          <label>Fortnight:</label>
          <select className="input" value={selectedPeriodValue} onChange={(event) => setSelectedPeriodValue(event.target.value)}>
            {periods.map((period) => (
              <option key={period.value} value={period.value}>{period.label}</option>
            ))}
          </select>
        </div>
        <div className="mte-pref-field">
          <label>Mode:</label>
          <input className="input" value="Admin managed" readOnly />
        </div>
      </div>

      <div className="mte-preferences-grid">
        <div className="mte-pref-field">
          <label>Reviewer Email(s):</label>
          <input className="input" value={drafts.reviewer} onChange={(event) => updateDraft('reviewer', event.target.value)} placeholder="name@company.com" />
        </div>
        <button type="button" className="mte-pref-arrow" aria-label="Add reviewer" onClick={() => addPreference('reviewer', 'reviewers')} disabled={!drafts.reviewer.trim()}>
          <ChevronRight size={15} />
        </button>
        <div className="mte-pref-field">
          <label>Selected Reviewers:</label>
          <textarea className="input" value={selected.reviewers} onChange={(event) => updateSelected('reviewers', event.target.value)} rows={4} />
        </div>
        <div />

        <div className="mte-pref-field">
          <label>Notification Email(s):</label>
          <input className="input" value={drafts.notification} onChange={(event) => updateDraft('notification', event.target.value)} placeholder="notify@company.com" />
        </div>
        <button type="button" className="mte-pref-arrow" aria-label="Add notification" onClick={() => addPreference('notification', 'notifications')} disabled={!drafts.notification.trim()}>
          <ChevronRight size={15} />
        </button>
        <div className="mte-pref-field">
          <label>Selected Notifications:</label>
          <textarea className="input" value={selected.notifications} onChange={(event) => updateSelected('notifications', event.target.value)} rows={4} />
        </div>
        <div />

        <div className="mte-pref-field">
          <label>Delegate Email(s):</label>
          <input className="input" value={drafts.delegate} onChange={(event) => updateDraft('delegate', event.target.value)} placeholder="delegate@company.com" />
        </div>
        <button type="button" className="mte-pref-arrow" aria-label="Add delegate" onClick={() => addPreference('delegate', 'delegates')} disabled={!drafts.delegate.trim()}>
          <ChevronRight size={15} />
        </button>
        <div className="mte-pref-field">
          <label>Selected Delegates:</label>
          <textarea className="input" value={selected.delegates} onChange={(event) => updateSelected('delegates', event.target.value)} rows={4} />
        </div>
        <div />

        <div className="mte-pref-field">
          <label>Approver Email(s):</label>
          <input className="input" value={drafts.approver} onChange={(event) => updateDraft('approver', event.target.value)} placeholder="approver@company.com" />
        </div>
        <button type="button" className="mte-pref-arrow" aria-label="Add approver" onClick={() => addPreference('approver', 'approvers')} disabled={!drafts.approver.trim()}>
          <ChevronRight size={15} />
        </button>
        <div className="mte-pref-field">
          <label>Selected Approvers:</label>
          <textarea className="input" value={selected.approvers} onChange={(event) => updateSelected('approvers', event.target.value)} rows={4} />
        </div>
        <div />
      </div>
    </div>
  );
}

const REPORT_RANGE_OPTIONS = [
  { value: 'this_month', label: 'This Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'this_half_year', label: 'This Half Year' },
  { value: 'this_year', label: 'This Year' },
  { value: 'previous_month', label: 'Previous Month' },
  { value: 'previous_quarter', label: 'Previous Quarter' },
  { value: 'previous_half_year', label: 'Previous Half Year' },
  { value: 'previous_year', label: 'Previous Year' },
  { value: 'custom', label: 'Custom' },
];

function getHalfYearRange(date, offset = 0) {
  const year = date.getFullYear();
  const halfIndex = date.getMonth() < 6 ? 0 : 1;
  const absoluteHalf = year * 2 + halfIndex + offset;
  const targetYear = Math.floor(absoluteHalf / 2);
  const targetHalf = absoluteHalf % 2;
  return {
    start: new Date(targetYear, targetHalf === 0 ? 0 : 6, 1),
    end: new Date(targetYear, targetHalf === 0 ? 6 : 12, 0),
  };
}

function getReportRange(option, referenceDate = new Date()) {
  if (option === 'this_quarter') return { start: startOfQuarter(referenceDate), end: endOfQuarter(referenceDate) };
  if (option === 'previous_quarter') {
    const previous = subQuarters(referenceDate, 1);
    return { start: startOfQuarter(previous), end: endOfQuarter(previous) };
  }
  if (option === 'this_half_year') return getHalfYearRange(referenceDate);
  if (option === 'previous_half_year') return getHalfYearRange(referenceDate, -1);
  if (option === 'this_year') return { start: startOfYear(referenceDate), end: endOfYear(referenceDate) };
  if (option === 'previous_year') {
    const previous = subYears(referenceDate, 1);
    return { start: startOfYear(previous), end: endOfYear(previous) };
  }
  if (option === 'previous_month') {
    const previous = subMonths(referenceDate, 1);
    return { start: startOfMonth(previous), end: endOfMonth(previous) };
  }
  return { start: startOfMonth(referenceDate), end: endOfMonth(referenceDate) };
}

function buildReportQuery(filters) {
  const params = new URLSearchParams({
    start_date: filters.startDate,
    end_date: filters.endDate,
  });
  if (filters.department !== 'all') params.set('department', filters.department);
  if (filters.employeeStatus !== 'all') params.set('employee_status', filters.employeeStatus);
  if (filters.search.trim()) params.set('search', filters.search.trim());
  return params.toString();
}

function getReportRangeLabel(filters) {
  const selected = REPORT_RANGE_OPTIONS.find((option) => option.value === filters.range)?.label || 'Custom';
  if (!filters.startDate || !filters.endDate) return selected;
  return `${selected} (${filters.startDate} to ${filters.endDate})`;
}

function ReportsPanel() {
  const { notify } = useTimesheetUi();
  const initialRange = getReportRange('previous_month');
  const [filters, setFilters] = useState({
    range: 'previous_month',
    startDate: format(initialRange.start, 'yyyy-MM-dd'),
    endDate: format(initialRange.end, 'yyyy-MM-dd'),
    department: 'all',
    employeeStatus: 'all',
    search: '',
  });
  const [report, setReport] = useState(null);
  const [filterOptions, setFilterOptions] = useState({ departments: [], employees: [] });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const updateRange = (rangeValue) => {
    if (rangeValue === 'custom') {
      setFilters((previous) => ({ ...previous, range: rangeValue }));
      return;
    }
    const nextRange = getReportRange(rangeValue);
    setFilters((previous) => ({
      ...previous,
      range: rangeValue,
      startDate: format(nextRange.start, 'yyyy-MM-dd'),
      endDate: format(nextRange.end, 'yyyy-MM-dd'),
    }));
  };

  const loadReport = useCallback(async () => {
    if (!filters.startDate || !filters.endDate) return;
    setLoading(true);
    try {
      const data = await fetchAPI(`/timesheets/reports/lop-summary?${buildReportQuery(filters)}`);
      setReport(data);
      setSubmitted(true);
    } catch (err) {
      notify(`Failed to load report: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, notify]);

  useEffect(() => {
    fetchAPI('/timesheets/reports/lop-summary/filters')
      .then((data) => setFilterOptions({
        departments: Array.isArray(data.departments) ? data.departments : [],
        employees: Array.isArray(data.employees) ? data.employees : [],
      }))
      .catch(() => setFilterOptions({ departments: [], employees: [] }));
  }, []);

  const rows = useMemo(() => report?.rows || [], [report]);
  const departmentOptions = useMemo(() => [
    { value: 'all', label: 'All Departments' },
    ...filterOptions.departments.map((department) => ({ value: department, label: department })),
  ], [filterOptions.departments]);
  const statusOptions = [
    { value: 'all', label: 'All Employees' },
    { value: 'active', label: 'Active Employees' },
    { value: 'inactive', label: 'Inactive Employees' },
  ];

  const exportReport = async () => {
    setExporting(true);
    try {
      const response = await fetch(`${API_BASE}/timesheets/reports/lop-summary/export?${buildReportQuery(filters)}`);
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `lop_summary_${filters.startDate}_to_${filters.endDate}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify(`Failed to export report: ${err.message}`, 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mte-reports-shell">
      <section className="mte-report-topbar">
        <div className="mte-report-title-block">
          <FileText size={17} />
          <div>
            <span>Payroll Overview</span>
            <strong>Loss Of Pay Summary</strong>
          </div>
        </div>
        <button type="button" className="mte-report-export" onClick={exportReport} disabled={exporting}>
          <Download size={15} />
          <span>{exporting ? 'Exporting...' : 'Export as'}</span>
        </button>
      </section>

      <section className="mte-report-filters">
        <label className="mte-report-filter-field">
          <span>Date Range :</span>
          <ValueHelpSelect
            value={filters.range}
            onChange={updateRange}
            options={REPORT_RANGE_OPTIONS}
            placeholder="Select date range"
            searchPlaceholder="Search date ranges"
          />
        </label>
        <label className="mte-report-filter-field">
          <span>From</span>
          <input
            type="date"
            value={filters.startDate}
            onChange={(event) => setFilters((previous) => ({ ...previous, range: 'custom', startDate: event.target.value }))}
          />
        </label>
        <label className="mte-report-filter-field">
          <span>To</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(event) => setFilters((previous) => ({ ...previous, range: 'custom', endDate: event.target.value }))}
          />
        </label>
        <label className="mte-report-filter-field">
          <span>Department</span>
          <ValueHelpSelect
            value={filters.department}
            onChange={(value) => setFilters((previous) => ({ ...previous, department: value }))}
            options={departmentOptions}
            placeholder="All Departments"
            searchPlaceholder="Search departments"
          />
        </label>
        <label className="mte-report-filter-field">
          <span>Status</span>
          <ValueHelpSelect
            value={filters.employeeStatus}
            onChange={(value) => setFilters((previous) => ({ ...previous, employeeStatus: value }))}
            options={statusOptions}
            placeholder="All Employees"
            searchPlaceholder="Search statuses"
          />
        </label>
        <label className="mte-report-filter-field mte-report-search">
          <span>Employee Value Help</span>
          <ValueHelpSearch
            value={filters.search}
            onChange={(value) => setFilters((previous) => ({ ...previous, search: value }))}
            suggestions={filterOptions.employees}
            placeholder="Employee, email, ID, department"
          />
        </label>
        <div className="mte-report-submit-cell">
          <button type="button" className="mte-report-run" onClick={loadReport} disabled={loading}>
            {loading ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </section>

      <section className="mte-report-card">
        <div className="mte-report-table-header">
          <h3>Employee Wise Summary</h3>
          <span>{submitted ? rows.length : 0} of {submitted ? report?.totals?.employees || 0 : 0} employees · {getReportRangeLabel(filters)}</span>
        </div>
        <div className="mte-report-table-wrap">
          <table className="mte-report-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Email</th>
                <th>Department</th>
                <th>Status</th>
                <th>Working Days</th>
                <th>LOP Days</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}>Loading report...</td></tr>
              ) : !submitted ? (
                <tr><td colSpan={6}>Select filters and click Submit to view report data.</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6}>There are no LOP for employees during this period</td></tr>
              ) : rows.map((row) => (
                <tr key={`${row.employee_id}-${row.employee_email}`}>
                  <td>
                    <strong>{row.employee_name || '-'}</strong>
                    <small>{row.employee_id}</small>
                  </td>
                  <td>{row.employee_email}</td>
                  <td>{row.department || '-'}</td>
                  <td>{row.employee_status}</td>
                  <td>{row.working_days}</td>
                  <td>{Number(row.lop_days || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5}>Total Employees: {submitted ? report?.totals?.employees || 0 : 0}</td>
                <td>{Number(report?.totals?.lop_days || 0).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}

function PortalTimeWorkspace({
  user,
  selectedPeriod,
  onSelectedPeriodChange,
  onSheetSnapshotChange,
}) {
  const isAdmin = isAdminUser(user);
  const userEmail = String(user?.email || '').trim();
  const [hasTeamScope, setHasTeamScope] = useState(() => Boolean(isLeadUser(user) || isManagerUser(user)));
  const defaultView = isAdmin ? 'all' : 'entry';
  const [activeView, setActiveView] = useState(defaultView);

  useEffect(() => {
    if (isAdmin) {
      setHasTeamScope(false);
      return;
    }

    if (!userEmail) {
      setHasTeamScope(Boolean(isLeadUser(user) || isManagerUser(user)));
      return;
    }

    let isMounted = true;

    fetchAPI(`/users/get_employees_by_manager/${encodeURIComponent(userEmail)}`)
      .then((employees) => {
        if (!isMounted) return;
        setHasTeamScope(
          Boolean(isLeadUser(user) || isManagerUser(user) || (Array.isArray(employees) && employees.length > 0))
        );
      })
      .catch(() => {
        if (!isMounted) return;
        setHasTeamScope(Boolean(isLeadUser(user) || isManagerUser(user)));
      });

    return () => {
      isMounted = false;
    };
  }, [isAdmin, user, userEmail]);

  useEffect(() => {
    setActiveView(defaultView);
  }, [defaultView]);

  const views = useMemo(() => (
    isAdmin
      ? [{ key: 'all', label: 'All Timesheets' }]
      : [
          { key: 'entry', label: 'My Timesheet' },
          ...(hasTeamScope ? [{ key: 'approvals', label: 'Approvals' }] : []),
        ]
  ), [hasTeamScope, isAdmin]);

  useEffect(() => {
    if (!views.some((view) => view.key === activeView)) {
      setActiveView(defaultView);
    }
  }, [activeView, defaultView, views]);

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

const normalizeSummaryCode = (value) => String(value || '').trim().toLowerCase();

function formatClientCodeList(values = []) {
  const uniqueValues = Array.from(new Set(values.filter(Boolean).map(String)));
  return uniqueValues.length ? uniqueValues.sort((first, second) => first.localeCompare(second)).join(', ') : '-';
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
    clientCode: 'all',
    employee: '',
    periodFrom: '',
    periodTo: '',
    month: '',
  });
  const [appliedSummaryFilters, setAppliedSummaryFilters] = useState(summaryFilters);

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
  const workScheduleByDate = getTimesheetWorkScheduleByDate(summaryTimesheet || {}, dates.map((date) => format(date, 'yyyy-MM-dd')));
  const workSchedule = Object.values(workScheduleByDate).reduce((sum, value) => sum + Number(value || 0), 0);
  const explicitDailyOvertime = Object.values(summaryTimesheet?.daily_overtime || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const totalWorkingHours = workHours;
  const overtime = explicitDailyOvertime;
  const standardAvailable = workSchedule;
  const availablePercent = standardAvailable ? Math.round((workHours / standardAvailable) * 100) : 0;
  const assignmentMeta = getTimesheetAssignmentMeta({ ...profile, ...summaryTimesheet });
  const country = profile.countryRegion || profile.country || 'India';
  const location = assignmentMeta.workLocation === 'Not assigned' ? country : assignmentMeta.workLocation;

  const chargeRows = useMemo(() => {
    const grouped = {};
    const codeToKey = {};
    const ensureRow = (key, label, code = '') => {
      if (!grouped[key]) {
        grouped[key] = {
          key,
          label,
          code,
          clientCodes: [],
          clientCode: '-',
          hours: 0,
          expenses: 0,
          absence: 0,
        };
      }
      if (code) codeToKey[normalizeSummaryCode(code)] = key;
      codeToKey[normalizeSummaryCode(label)] = key;
      return grouped[key];
    };

    entries.forEach((entry) => {
      const meta = getTimesheetEntryChargeCodeMeta(entry);
      const key = meta.code || entry.charge_code_id || entry.charge_code || 'Unassigned';
      const row = ensureRow(
        key,
        meta.code ? `${meta.name || 'Charge Code'} (${meta.code})` : (meta.name || 'Charge Code'),
        meta.code || entry.charge_code || ''
      );
      if ((entry.entry_type || 'work') === 'work') {
        row.hours += Number(entry.hours || 0);
      } else if (['leave', 'holiday'].includes(entry.entry_type)) {
        row.absence += Number(entry.hours || 0);
      }
    });

    expenses.forEach((expense, index) => {
      const clientCode = String(expense.client_code || '').trim();
      const normalizedClientCode = normalizeSummaryCode(clientCode);
      const matchedKey = normalizedClientCode ? codeToKey[normalizedClientCode] : '';
      const key = matchedKey || clientCode || `expense-${expense._id || index}`;
      const row = ensureRow(
        key,
        clientCode ? `Expense (${clientCode})` : 'Expense (Unassigned)',
        clientCode
      );
      row.expenses += Number(expense.amount || 0);
      if (clientCode) row.clientCodes.push(clientCode);
    });

    return Object.values(grouped).map((row) => ({
      ...row,
      clientCode: formatClientCodeList(row.clientCodes),
      clientCodes: Array.from(new Set(row.clientCodes)),
    }));
  }, [entries, expenses]);

  const summaryRows = useMemo(() => {
    const clientCodeSummary = formatClientCodeList(chargeRows.flatMap((row) => row.clientCodes || []));
    return [
      ...chargeRows,
      { label: 'Total', clientCode: clientCodeSummary, hours: totalWorkingHours, expenses: expenseTotal, absence: absenceHours, isTotal: true },
      { label: 'Work Schedule', clientCode: '', hours: workSchedule, expenses: '', absence: '', isMeta: true },
      { label: 'Overtime', clientCode: '', hours: overtime || '', expenses: '', absence: '', isMeta: true },
      { label: 'Standard Available Hours', clientCode: '', hours: standardAvailable || '', expenses: '', absence: '', isMeta: true },
      { label: 'Percentage of Standard Available Hours', clientCode: '', hours: standardAvailable ? `${availablePercent}%` : '', expenses: '', absence: '', isMeta: true },
    ];
  }, [absenceHours, availablePercent, chargeRows, expenseTotal, overtime, standardAvailable, totalWorkingHours, workSchedule]);

  const leaveBalance = profile.leaveBalance || {};
  const earnedLeave = Number(leaveBalance.earned ?? leaveBalance.earnedLeave ?? 0);
  const sickLeave = Number(leaveBalance.sick ?? leaveBalance.sickLeave ?? 0);
  const casualLeave = Number(leaveBalance.casual ?? leaveBalance.casualLeave ?? 0);
  const summaryCell = (value, decimals = 1) => {
    if (value === '' || value === undefined || value === null) return '';
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue.toFixed(decimals) : value;
  };
  const summaryDateInRange = useCallback((dateValue) => {
    const dateKey = String(dateValue || '').slice(0, 10);
    if (!dateKey) return true;
    if (appliedSummaryFilters.month && !dateKey.startsWith(appliedSummaryFilters.month)) return false;
    if (appliedSummaryFilters.periodFrom && dateKey < appliedSummaryFilters.periodFrom) return false;
    if (appliedSummaryFilters.periodTo && dateKey > appliedSummaryFilters.periodTo) return false;
    return true;
  }, [appliedSummaryFilters.month, appliedSummaryFilters.periodFrom, appliedSummaryFilters.periodTo]);

  const adminEmployeeRows = useMemo(() => {
    if (!isAdmin) return [];
    const grouped = {};
    allTimesheets.forEach((item) => {
      const effectiveEntries = getEffectiveSummaryEntries(item.entries || []).filter((entry) => summaryDateInRange(entry.date));
      if (!effectiveEntries.length) return;
      const key = item.employee_id || item.employee_email || item.employee_name || 'unknown';
      if (!grouped[key]) {
        grouped[key] = {
          employee: item.employee_name || 'Employee',
          email: item.employee_email || '',
          department: item.employee_department || 'Unassigned',
          clientCodes: new Set(),
          hours: 0,
          expenses: 0,
          documents: [],
        };
      }
      grouped[key].hours += getEntriesWorkHours(effectiveEntries);
    });
    expenses.forEach((expense) => {
      if (!summaryDateInRange(expense.expense_date)) return;
      const key = expense.employee_id || expense.employee_email || expense.employee_name || 'unknown';
      if (!grouped[key]) {
        grouped[key] = {
          employee: expense.employee_name || 'Employee',
          email: expense.employee_email || '',
          department: expense.employee_department || 'Unassigned',
          clientCodes: new Set(),
          hours: 0,
          expenses: 0,
          documents: [],
        };
      }
      grouped[key].expenses += Number(expense.amount || 0);
      if (expense.client_code) grouped[key].clientCodes.add(String(expense.client_code));
      if (expense.document?.url) grouped[key].documents.push(expense.document);
    });
    return Object.values(grouped)
      .map((row) => ({
        ...row,
        clientCodes: Array.from(row.clientCodes),
        clientCodesText: formatClientCodeList(Array.from(row.clientCodes)),
      }))
      .sort((a, b) => a.employee.localeCompare(b.employee));
  }, [allTimesheets, expenses, isAdmin, summaryDateInRange]);
  const summaryDepartmentOptions = useMemo(
    () => Array.from(new Set(adminEmployeeRows.map((row) => row.department || 'Unassigned')))
      .sort((first, second) => first.localeCompare(second)),
    [adminEmployeeRows]
  );
  const summaryClientCodeOptions = useMemo(() => {
    const sourceRows = isAdmin ? adminEmployeeRows : summaryRows;
    return Array.from(new Set(sourceRows.flatMap((row) => row.clientCodes || (row.clientCode && row.clientCode !== '-' ? [row.clientCode] : []))))
      .filter(Boolean)
      .sort((first, second) => first.localeCompare(second));
  }, [adminEmployeeRows, isAdmin, summaryRows]);
  const summaryEmployeeSuggestions = useMemo(() => (
    adminEmployeeRows.map((row) => ({
      value: row.employee,
      label: row.employee,
      description: [row.email, row.department].filter(Boolean).join(' · '),
    }))
  ), [adminEmployeeRows]);
  const applySummaryFilters = () => {
    setAppliedSummaryFilters(summaryFilters);
  };
  const updateSummaryMonth = (value) => {
    if (!value) {
      setSummaryFilters((previous) => ({ ...previous, month: '' }));
      return;
    }
    const monthStart = `${value}-01`;
    const monthEnd = format(endOfMonth(parseISO(monthStart)), 'yyyy-MM-dd');
    setSummaryFilters((previous) => ({
      ...previous,
      month: value,
      periodFrom: monthStart,
      periodTo: monthEnd,
    }));
  };
  const summarySearch = appliedSummaryFilters.search.trim().toLowerCase();
  const filteredAdminEmployeeRows = useMemo(() => {
    if (!isAdmin) return [];
    return adminEmployeeRows.filter((row) => {
      const matchesSearch = !summarySearch
        || [row.employee, row.email, row.department, row.clientCodesText]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(summarySearch));
      const employeeQuery = appliedSummaryFilters.employee.trim().toLowerCase();
      const matchesEmployee = !employeeQuery
        || [row.employee, row.email]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(employeeQuery));
      const matchesDepartment = appliedSummaryFilters.department === 'all'
        || row.department === appliedSummaryFilters.department;
      const matchesMetric = appliedSummaryFilters.metric === 'all'
        || (appliedSummaryFilters.metric === 'hours' && row.hours > 0)
        || (appliedSummaryFilters.metric === 'expenses' && row.expenses > 0)
        || (appliedSummaryFilters.metric === 'documents' && row.documents.length > 0);
      const matchesClientCode = appliedSummaryFilters.clientCode === 'all'
        || row.clientCodes.includes(appliedSummaryFilters.clientCode);
      return matchesSearch && matchesEmployee && matchesDepartment && matchesMetric && matchesClientCode;
    });
  }, [adminEmployeeRows, appliedSummaryFilters.clientCode, appliedSummaryFilters.department, appliedSummaryFilters.employee, appliedSummaryFilters.metric, isAdmin, summarySearch]);

  const adminDepartmentRows = useMemo(() => {
    if (!isAdmin) return [];
    const grouped = {};
    filteredAdminEmployeeRows.forEach((row) => {
      const key = row.department || 'Unassigned';
      if (!grouped[key]) grouped[key] = { department: key, employees: 0, clientCodes: new Set(), hours: 0, expenses: 0, documents: [] };
      grouped[key].employees += 1;
      row.clientCodes.forEach((clientCode) => grouped[key].clientCodes.add(clientCode));
      grouped[key].hours += row.hours;
      grouped[key].expenses += row.expenses;
      grouped[key].documents.push(...row.documents);
    });
    return Object.values(grouped)
      .map((row) => ({
        ...row,
        clientCodes: Array.from(row.clientCodes),
        clientCodesText: formatClientCodeList(Array.from(row.clientCodes)),
      }))
      .sort((a, b) => a.department.localeCompare(b.department));
  }, [filteredAdminEmployeeRows, isAdmin]);
  const filteredSummaryRows = useMemo(() => {
    if (isAdmin) return [];
    return summaryRows.filter((row) => {
      const matchesSearch = !summarySearch || [row.label, row.clientCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(summarySearch));
      const matchesClientCode = appliedSummaryFilters.clientCode === 'all'
        || row.clientCodes?.includes?.(appliedSummaryFilters.clientCode)
        || row.clientCode === appliedSummaryFilters.clientCode;
      const matchesMetric = appliedSummaryFilters.metric === 'all'
        || (appliedSummaryFilters.metric === 'hours' && Number(row.hours || 0) > 0)
        || (appliedSummaryFilters.metric === 'expenses' && Number(row.expenses || 0) > 0)
        || (appliedSummaryFilters.metric === 'documents');
      return matchesSearch && matchesClientCode && matchesMetric;
    });
  }, [appliedSummaryFilters.clientCode, appliedSummaryFilters.metric, isAdmin, summaryRows, summarySearch]);
  const resetSummaryFilters = () => {
    const next = { search: '', department: 'all', metric: 'all', clientCode: 'all', employee: '', periodFrom: '', periodTo: '', month: '' };
    setSummaryFilters(next);
    setAppliedSummaryFilters(next);
  };
  const exportSummary = () => {
    const rowsForExport = isAdmin
      ? [
          buildCsvRow(['Employee Wise Summary']),
          buildCsvRow(['Employee', 'Email', 'Department', 'Client Codes', 'Hours', 'Expenses', 'Documents']),
          ...filteredAdminEmployeeRows.map((row) => buildCsvRow([
            row.employee,
            row.email || '',
            row.department,
            row.clientCodesText,
            row.hours.toFixed(2),
            row.expenses.toFixed(2),
            row.documents.map((document) => document.name || document.url || 'Document').join('; '),
          ])),
          buildCsvRow([]),
          buildCsvRow(['Department Wise Summary']),
          buildCsvRow(['Department', 'Employees', 'Client Codes', 'Hours', 'Expenses', 'Documents']),
          ...adminDepartmentRows.map((row) => buildCsvRow([
            row.department,
            row.employees,
            row.clientCodesText,
            row.hours.toFixed(2),
            row.expenses.toFixed(2),
            row.documents.map((document) => document.name || document.url || 'Document').join('; '),
          ])),
        ]
      : [
          buildCsvRow(['Charge Code', 'Client Code', 'Hours', 'Expenses', 'Chargeable', 'Absences']),
          ...filteredSummaryRows.map((row) => buildCsvRow([
            row.label,
            row.clientCode || '',
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
          <p>{isAdmin ? 'Find employees by name, email, department, client code, or records with hours, expenses, and documents.' : 'Find summary rows by charge code, client code, or category name.'}</p>
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
          <ValueHelpSearch
            value={summaryFilters.search}
            onChange={(value) => setSummaryFilters((previous) => ({ ...previous, search: value }))}
            suggestions={isAdmin ? summaryEmployeeSuggestions : summaryRows.map((row) => ({
              value: row.label,
              label: row.label,
              description: row.clientCode || '',
            }))}
            placeholder={isAdmin ? 'Employee, email, department, or client code' : 'Charge code, client code, or summary row'}
          />
        </label>
        {isAdmin ? (
          <>
            <label className="mte-summary-filter-field">
              <span>Employee</span>
              <ValueHelpSearch
                value={summaryFilters.employee}
                onChange={(value) => setSummaryFilters((previous) => ({ ...previous, employee: value }))}
                suggestions={summaryEmployeeSuggestions}
                placeholder="All Employees"
              />
            </label>
            <label className="mte-summary-filter-field">
              <span>Department</span>
              <ValueHelpSelect
                value={summaryFilters.department}
                onChange={(value) => setSummaryFilters((previous) => ({ ...previous, department: value }))}
                options={[
                  { value: 'all', label: 'All Departments' },
                  ...summaryDepartmentOptions.map((department) => ({ value: department, label: department })),
                ]}
                placeholder="All Departments"
                searchPlaceholder="Search departments"
              />
            </label>
          </>
        ) : null}
        <label className="mte-summary-filter-field">
          <span>Client Code</span>
          <ValueHelpSelect
            value={summaryFilters.clientCode}
            onChange={(value) => setSummaryFilters((previous) => ({ ...previous, clientCode: value }))}
            options={[
              { value: 'all', label: 'All Client Codes' },
              ...summaryClientCodeOptions.map((clientCode) => ({ value: clientCode, label: clientCode })),
            ]}
            placeholder="All Client Codes"
            searchPlaceholder="Search client codes"
          />
        </label>
        <label className="mte-summary-filter-field">
          <span>Metric</span>
          <ValueHelpSelect
            value={summaryFilters.metric}
            onChange={(value) => setSummaryFilters((previous) => ({ ...previous, metric: value }))}
            options={[
              { value: 'all', label: 'All Records' },
              { value: 'hours', label: 'With Hours' },
              { value: 'expenses', label: 'With Expenses' },
              ...(isAdmin ? [{ value: 'documents', label: 'With Documents' }] : []),
            ]}
            placeholder="All Records"
            searchPlaceholder="Search metrics"
          />
        </label>
        <label className="mte-summary-filter-field">
          <span>Month Wise</span>
          <input
            type="month"
            value={summaryFilters.month}
            onChange={(event) => updateSummaryMonth(event.target.value)}
          />
        </label>
        <label className="mte-summary-filter-field">
          <span>Period From</span>
          <input
            type="date"
            value={summaryFilters.periodFrom}
            onChange={(event) => setSummaryFilters((previous) => ({ ...previous, month: '', periodFrom: event.target.value }))}
          />
        </label>
        <label className="mte-summary-filter-field">
          <span>Period To</span>
          <input
            type="date"
            value={summaryFilters.periodTo}
            onChange={(event) => setSummaryFilters((previous) => ({ ...previous, month: '', periodTo: event.target.value }))}
          />
        </label>
        <div className="mte-summary-filter-submit-row">
          <button type="button" className="is-primary" onClick={applySummaryFilters}>
            <CheckCircle2 size={14} />
            <span>Submit</span>
          </button>
        </div>
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
                  {['Employee', 'Email', 'Department', 'Client Codes', 'Hours', 'Expenses', 'Documents'].map((header) => <th key={header}>{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7}>Loading summary...</td></tr>
                ) : filteredAdminEmployeeRows.length === 0 ? (
                  <tr><td colSpan={7}>No employee data found for this period.</td></tr>
                ) : filteredAdminEmployeeRows.map((row) => (
                  <tr key={`${row.employee}-${row.email}`}>
                    <td title={row.employee}>{row.employee}</td>
                    <td title={row.email || '-'}>{row.email || '-'}</td>
                    <td title={row.department}>{row.department}</td>
                    <td title={row.clientCodesText}>{row.clientCodesText}</td>
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
                  {['Department', 'Employees', 'Client Codes', 'Hours', 'Expenses', 'Documents'].map((header) => <th key={header}>{header}</th>)}
                </tr>
              </thead>
              <tbody>
                {adminDepartmentRows.length === 0 ? (
                  <tr><td colSpan={6}>No department data found for this period.</td></tr>
                ) : adminDepartmentRows.map((row) => (
                  <tr key={row.department}>
                    <td title={row.department}>{row.department}</td>
                    <td>{row.employees}</td>
                    <td title={row.clientCodesText}>{row.clientCodesText}</td>
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
            <col className="mte-summary-client-col" />
            {Array.from({ length: 10 }).map((_, index) => (
              <col key={`summary-metric-col-${index}`} className="mte-summary-metric-col" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>Charge Code</th>
              <th rowSpan={2}>Client Code</th>
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
              <tr><td colSpan={12}>Loading summary...</td></tr>
            ) : filteredSummaryRows.length === 0 ? (
              <tr><td colSpan={12}>No summary rows match the current filters.</td></tr>
            ) : filteredSummaryRows.map((row) => (
              <tr key={`${row.key || row.label}-${row.clientCode || ''}`} className={row.isTotal || row.isMeta ? 'is-summary-row' : ''}>
                <td title={row.label}>{row.label}</td>
                <td title={row.clientCode || '-'}>{row.clientCode || '-'}</td>
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
function TimesheetsContent({ user }) {
  const periods = useMemo(() => getAvailablePeriods(), []);
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0]?.value || '');
  const [activeModule, setActiveModule] = useState('time');
  const [liveTimesheetSnapshots, setLiveTimesheetSnapshots] = useState({});
  const selectedPeriodIndex = Math.max(0, periods.findIndex((period) => period.value === selectedPeriod));
  const canGoToPreviousTimesheet = selectedPeriodIndex < periods.length - 1;
  const canGoToNextTimesheet = selectedPeriodIndex > 0;
  const goToPreviousTimesheet = useCallback(() => {
    if (!periods.length) return;
    const previousPeriod = periods[Math.min(selectedPeriodIndex + 1, periods.length - 1)];
    if (!previousPeriod || previousPeriod.value === selectedPeriod) return;
    setSelectedPeriod(previousPeriod.value);
  }, [periods, selectedPeriod, selectedPeriodIndex]);
  const goToNextTimesheet = useCallback(() => {
    if (!periods.length) return;
    const nextPeriod = periods[Math.max(selectedPeriodIndex - 1, 0)];
    if (!nextPeriod || nextPeriod.value === selectedPeriod) return;
    setSelectedPeriod(nextPeriod.value);
  }, [periods, selectedPeriod, selectedPeriodIndex]);
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
    ...(user?.role === 'Admin' ? [{ key: 'reports', label: 'REPORTS' }] : []),
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
        return (
          <LocationsPanel
            selectedPeriod={selectedPeriod}
            periods={periods}
            user={user}
            onPreviousTimesheet={goToPreviousTimesheet}
            canPreviousTimesheet={canGoToPreviousTimesheet}
            onNextTimesheet={goToNextTimesheet}
            canNextTimesheet={canGoToNextTimesheet}
          />
        );
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
        return <PreferencesPanel user={user} periods={periods} selectedPeriod={selectedPeriod} />;
      case 'reports':
        return user?.role === 'Admin' ? <ReportsPanel user={user} /> : (
          <PortalTimeWorkspace
            user={user}
            selectedPeriod={selectedPeriod}
            onSelectedPeriodChange={setSelectedPeriod}
            onSheetSnapshotChange={handleSheetSnapshotChange}
          />
        );
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

export default function Timesheets({ user, adminView = false }) {
  const effectiveUser = adminView && user?.role !== 'Admin' ? { ...user, role: 'Admin' } : user;
  return (
    <TimesheetUiProvider>
      <TimesheetsContent user={effectiveUser} />
    </TimesheetUiProvider>
  );
}
