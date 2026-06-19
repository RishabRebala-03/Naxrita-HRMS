import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpenText,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Edit3,
  FileText,
  Filter,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import ValueHelpSelect from "./ValueHelpSelect";
import ValueHelpSearch from "./ValueHelpSearch";

const initialPolicies = [
  {
    id: "1001",
    title: "Leave Policy Guidelines",
    description:
      "Comprehensive policy document that outlines important guidelines for employee leave management including Earned Leave, Privileged Leave, Casual Leave, and Sick Leave.",
    category: "HR",
    status: "Active",
    updated: "01/01/2026",
    dateAdded: "29/12/2025",
    dateAmended: "01/01/2026",
    sections: [
      { id: "objective", title: "Earned Leave (EL) Objective" },
      { id: "cycle", title: "Leave Cycle" },
      { id: "carryforward", title: "Carry Forward" },
      { id: "application", title: "Leave Application Procedure" },
      { id: "planned", title: "Planned Leave" },
      { id: "unplanned", title: "Unplanned Leave" },
      { id: "supervisor", title: "Supervisor Authority" },
      { id: "notice", title: "Leave During Notice Period" },
      { id: "privileged", title: "Privileged Leave (PL)" },
      { id: "casual", title: "Casual Leave (CL) / Sick Leave (SL)" },
      { id: "lwp", title: "Leave Without Pay (LWP)" },
      { id: "summary", title: "Summary" },
    ],
    content: `
      <h2 id="objective">Earned Leave (EL) Objective</h2>
      <p>The objective of this leave policy is to ensure that all employees have adequate time away from work while managing the accrual of leave to prevent excessive buildup on the company's leave balance sheet.</p>

      <h2 id="cycle">Leave Cycle</h2>
      <ul>
        <li><strong>Cycle Duration:</strong> January 1st, 2026 to December 31st, 2026 of the following year.</li>
        <li><strong>Accrual:</strong> Employees are entitled to 1 day of paid leave for every month worked.</li>
      </ul>

      <h2 id="carryforward">Carry Forward</h2>
      <ul>
        <li>A maximum of 12 leaves may be carried forward into the next leave cycle.</li>
        <li>Any leaves exceeding 12 days will lapse.</li>
      </ul>

      <h2 id="application">Leave Application Procedure</h2>
      <ul>
        <li><strong>Scheduling:</strong> Leave must be scheduled in advance to balance individual needs with the company's requirement for adequate team coverage.</li>
        <li><strong>Approval:</strong> All leave requests must be approved via email by the employee's supervisor, with the HR team CC'd.</li>
      </ul>

      <h2 id="types">Types of Leave</h2>
      <h3 id="planned">1. Planned Leave</h3>
      <ul>
        <li>Leaves that are communicated and requested in advance via email will be classified as planned leave.</li>
        <li><strong>Example:</strong> For leave on Jan 12, 2024, notification should be given 1 week prior, and the email must be sent on or before Jan 5, 2024.</li>
      </ul>
      <h3 id="unplanned">2. Unplanned Leave</h3>
      <ul>
        <li>Leaves requested after the specified date will be considered unplanned.</li>
      </ul>

      <h2 id="supervisor">Supervisor Authority</h2>
      <ul>
        <li>Supervisors have the authority to approve leaves as paid or unpaid based on business requirements. Their decision will be communicated via email.</li>
      </ul>

      <h2 id="notice">Leave During Notice Period</h2>
      <ul>
        <li>No leave (Planned, Unplanned, PL, CL, or SL) will be approved during the employee's notice period.</li>
        <li>Any absence during the notice period will be treated as Leave Without Pay (LWP) unless otherwise approved by Management under exceptional circumstances.</li>
        <li>Employees serving notice are expected to ensure full knowledge transfer and business continuity.</li>
      </ul>

      <h3 id="privileged">Privileged Leave (PL)</h3>
      <ul>
        <li>Employees are entitled to 12 working days of Privileged Leave per year.</li>
        <li>A maximum of 7 working days can be taken at once; any additional leave will be treated as unpaid.</li>
        <li>Paid holidays and Sundays before, after, or during PL will not count as part of the leave.</li>
        <li>PL cannot be accumulated or encashed.</li>
      </ul>

      <h3 id="casual">Casual Leave (CL) / Sick Leave (SL)</h3>
      <ul>
        <li>Employees are entitled to 6 working days of CL/SL per year.</li>
        <li><strong>Sick Leave:</strong> A medical certificate is required for absences exceeding 2 working days.</li>
        <li>Any sick leave exceeding 2 days can be combined with PL, subject to prior approval.</li>
        <li><strong>Casual Leave:</strong> Any absence exceeding 2 working days will be classified as PL unless accompanied by a medical certificate.</li>
        <li>CL/SL cannot be accumulated or encashed and cannot be prefixed or suffixed to PL.</li>
      </ul>

      <h3 id="lwp">Leave Without Pay (LWP)</h3>
      <ul>
        <li>Leave Without Pay applies when paid balances are unavailable or leave falls outside the approved policy rules.</li>
        <li>LWP may also apply during notice period or for unapproved exceptions, subject to management decision.</li>
      </ul>

      <h2 id="summary">Summary</h2>
      <p>This policy aims to provide a structured approach to leave management, ensuring employees receive the necessary time off while maintaining operational efficiency.</p>
      <p>For any questions or clarifications, please contact the HR department.</p>
    `,
  },
];

const categories = ["All", "HR", "Finance", "Operations", "General", "Compliance", "Security"];
const statuses = ["All", "Active", "Draft", "Review"];

const statusToneMap = {
  Active: "is-approved",
  Draft: "is-neutral",
  Review: "is-pending",
};

const POLICY_SCROLL_OFFSET = 118;

const isWindowScrollContainer = (container) =>
  !container ||
  container === window ||
  container === document.scrollingElement ||
  container === document.documentElement ||
  container === document.body;

const getNearestScrollContainer = (element) => {
  let current = element?.parentElement;

  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const canScroll = current.scrollHeight > current.clientHeight + 1;
    const overflowY = style.overflowY;

    if (canScroll && ["auto", "scroll", "overlay"].includes(overflowY)) {
      return current;
    }

    current = current.parentElement;
  }

  return document.scrollingElement || window;
};

const getElementTopWithinContainer = (element, container) => {
  if (isWindowScrollContainer(container)) {
    return element.getBoundingClientRect().top + window.scrollY;
  }

  const containerRect = container.getBoundingClientRect();
  return element.getBoundingClientRect().top - containerRect.top + container.scrollTop;
};

const scrollPolicyElementIntoView = (element, container, behavior = "smooth") => {
  if (!element) return;

  const scrollContainer = container || getNearestScrollContainer(element);
  const targetTop = getElementTopWithinContainer(element, scrollContainer) - POLICY_SCROLL_OFFSET;

  if (isWindowScrollContainer(scrollContainer)) {
    window.scrollTo({ top: Math.max(targetTop, 0), behavior });
    return;
  }

  scrollContainer.scrollTo({ top: Math.max(targetTop, 0), behavior });
};

const getPolicySectionElement = (root, section) => {
  if (!root || !section) return null;

  const sectionId = String(section.id || "").trim();
  const exactMatch = sectionId ? root.ownerDocument.getElementById(sectionId) : null;

  if (exactMatch && root.contains(exactMatch)) {
    return exactMatch;
  }

  const sectionTitle = String(section.title || "").trim().toLowerCase();
  if (!sectionTitle) return null;

  const headingMatch = Array.from(root.querySelectorAll("h2, h3")).find(
    (heading) => heading.textContent.trim().toLowerCase() === sectionTitle
  );

  if (headingMatch && sectionId && !headingMatch.id) {
    headingMatch.id = sectionId;
  }

  return headingMatch || null;
};

const categoryDescriptions = {
  HR: "People practices, leave, and workplace guidelines",
  Finance: "Expense, payroll, and reimbursement rules",
  Operations: "Day-to-day process and delivery standards",
  General: "Company-wide expectations and reference material",
  Compliance: "Regulatory, audit, and legal obligations",
  Security: "Access, data handling, and protection measures",
};

const Policy = ({ user }) => {
  const [policies, setPolicies] = useState(initialPolicies);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedStatus, setSelectedStatus] = useState("All");
  const [expandedPolicy, setExpandedPolicy] = useState(null);
  const [activeSection, setActiveSection] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isOutlineCollapsed, setIsOutlineCollapsed] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const contentRootRef = useRef(null);
  const contentRefs = useRef({});
  const scrollContainerRef = useRef(null);
  const canUpdatePolicies = user?.role === "Admin";

  const policySearchSuggestions = useMemo(
    () =>
      policies.flatMap((policy) => [
        { value: policy.id, label: policy.id, description: policy.title },
        { value: policy.title, label: policy.title, description: policy.category },
        { value: policy.category, label: policy.category, description: "Category" },
        { value: policy.status, label: policy.status, description: "Status" },
      ]),
    [policies]
  );

  const filteredPolicies = useMemo(() => {
    return policies.filter((policy) => {
      const normalizedQuery = searchQuery.toLowerCase();
      const matchesSearch =
        policy.title.toLowerCase().includes(normalizedQuery) ||
        policy.id.toLowerCase().includes(normalizedQuery) ||
        policy.description.toLowerCase().includes(normalizedQuery);

      const matchesCategory =
        selectedCategory === "All" || policy.category === selectedCategory;
      const matchesStatus = selectedStatus === "All" || policy.status === selectedStatus;

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [policies, searchQuery, selectedCategory, selectedStatus]);

  const selectedPolicy = useMemo(
    () => policies.find((policy) => policy.id === expandedPolicy) || null,
    [expandedPolicy, policies]
  );

  const activePoliciesCount = policies.filter((policy) => policy.status === "Active").length;
  useEffect(() => {
    if (!selectedPolicy || !contentRootRef.current) {
      contentRefs.current = {};
      scrollContainerRef.current = null;
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      const nextRefs = {};
      scrollContainerRef.current = getNearestScrollContainer(contentRootRef.current);

      selectedPolicy.sections.forEach((section) => {
        const element = getPolicySectionElement(contentRootRef.current, section);
        if (element) {
          nextRefs[section.id] = element;
        }
      });

      contentRefs.current = nextRefs;
      const hashSectionId = window.location.hash.replace("#", "");
      const matchingHashSection = selectedPolicy.sections.find((section) => section.id === hashSectionId);

      if (matchingHashSection && nextRefs[matchingHashSection.id]) {
        setActiveSection(matchingHashSection.id);

        window.requestAnimationFrame(() => {
          scrollPolicyElementIntoView(
            nextRefs[matchingHashSection.id],
            scrollContainerRef.current,
            "auto"
          );
        });
      } else {
        setActiveSection(selectedPolicy.sections[0]?.id || null);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [selectedPolicy]);

  useEffect(() => {
    if (!selectedPolicy) {
      return undefined;
    }

    const handleScroll = () => {
      const scrollPosition = POLICY_SCROLL_OFFSET + 24;
      const scrollContainer = scrollContainerRef.current || getNearestScrollContainer(contentRootRef.current);
      let currentSection = selectedPolicy.sections[0]?.id || null;

      selectedPolicy.sections.forEach((section) => {
        const element = contentRefs.current[section.id];
        let elementTop = null;

        if (element) {
          if (isWindowScrollContainer(scrollContainer)) {
            elementTop = element.getBoundingClientRect().top;
          } else {
            elementTop =
              element.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top;
          }
        }

        if (element && typeof elementTop === "number" && elementTop <= scrollPosition) {
          currentSection = section.id;
        }
      });

      setActiveSection(currentSection);
    };

    const scrollContainer = scrollContainerRef.current || getNearestScrollContainer(contentRootRef.current);
    const scrollTarget = isWindowScrollContainer(scrollContainer) ? window : scrollContainer;

    scrollTarget.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => scrollTarget.removeEventListener("scroll", handleScroll);
  }, [selectedPolicy]);

  const openPolicy = (policyId) => {
    setExpandedPolicy(policyId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const closePolicy = () => {
    setExpandedPolicy(null);
    setActiveSection(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToSection = (sectionId) => {
    setActiveSection(sectionId);

    const section = selectedPolicy?.sections.find((item) => item.id === sectionId) || { id: sectionId };
    const element =
      contentRefs.current[sectionId] ||
      getPolicySectionElement(contentRootRef.current, section);

    if (!element) {
      return;
    }

    contentRefs.current[sectionId] = element;

    window.history.replaceState(null, "", `#${sectionId}`);
    element.setAttribute("tabindex", "-1");
    element.focus({ preventScroll: true });

    scrollPolicyElementIntoView(element, scrollContainerRef.current, "smooth");
  };

  const openEditModal = () => {
    if (!canUpdatePolicies || !selectedPolicy) {
      return;
    }

    setEditForm({
      title: selectedPolicy.title,
      description: selectedPolicy.description,
      category: selectedPolicy.category,
      status: selectedPolicy.status,
      updated: selectedPolicy.updated,
      dateAdded: selectedPolicy.dateAdded,
      dateAmended: selectedPolicy.dateAmended,
      content: selectedPolicy.content.trim(),
    });
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditForm(null);
  };

  const updateEditField = (field, value) => {
    setEditForm((previous) => ({ ...previous, [field]: value }));
  };

  const savePolicyUpdates = () => {
    if (!canUpdatePolicies || !selectedPolicy || !editForm) {
      return;
    }

    setPolicies((currentPolicies) =>
      currentPolicies.map((policy) =>
        policy.id === selectedPolicy.id
          ? {
              ...policy,
              title: editForm.title.trim() || policy.title,
              description: editForm.description.trim() || policy.description,
              category: editForm.category,
              status: editForm.status,
              updated: editForm.updated,
              dateAdded: editForm.dateAdded,
              dateAmended: editForm.dateAmended,
              content: editForm.content.trim() || policy.content,
            }
          : policy
      )
    );
    closeEditModal();
  };

  if (selectedPolicy) {
    return (
      <section className="policy-workspace">
        <header className="admin-hero policy-detail-hero">
          <div className="policy-hero-copy">
            <button className="fiori-button secondary policy-back-button" onClick={closePolicy}>
              <ArrowLeft size={16} />
              <span>Back to policies</span>
            </button>
            <div className="admin-section-overline">Policy Library</div>
            <h1>{selectedPolicy.title}</h1>
            <p>{selectedPolicy.description}</p>

            {canUpdatePolicies ? (
              <div className="policy-detail-actions">
                <button className="fiori-button primary" onClick={openEditModal}>
                  <Edit3 size={16} />
                  <span>Update policy</span>
                </button>
              </div>
            ) : null}
          </div>

          <div className="admin-hero-meta">
            <div className="admin-hero-meta-item">
              <span>Policy ID</span>
              <strong>{selectedPolicy.id}</strong>
            </div>
            <div className="admin-hero-meta-item">
              <span>Status</span>
              <strong>{selectedPolicy.status}</strong>
            </div>
            <div className="admin-hero-meta-item">
              <span>Updated</span>
              <strong>{selectedPolicy.updated}</strong>
            </div>
          </div>
        </header>

        <div className="policy-detail-main">
          <section className="policy-detail-meta-grid">
            <article className="fiori-stat-card">
              <div className="fiori-stat-topline">
                <span className="fiori-stat-label">Category</span>
                <ShieldCheck size={18} />
              </div>
              <div className="fiori-stat-value policy-detail-stat-value">
                {selectedPolicy.category}
              </div>
              <div className="fiori-stat-note">
                {categoryDescriptions[selectedPolicy.category] || "Reference documentation"}
              </div>
            </article>

            <article className="fiori-stat-card">
              <div className="fiori-stat-topline">
                <span className="fiori-stat-label">Published</span>
                <CalendarDays size={18} />
              </div>
              <div className="fiori-stat-value policy-detail-stat-value">
                {selectedPolicy.dateAdded}
              </div>
              <div className="fiori-stat-note">Initial publication date</div>
            </article>

            <article className="fiori-stat-card">
              <div className="fiori-stat-topline">
                <span className="fiori-stat-label">Amended</span>
                <Sparkles size={18} />
              </div>
              <div className="fiori-stat-value policy-detail-stat-value">
                {selectedPolicy.dateAmended}
              </div>
              <div className="fiori-stat-note">Most recent revision date</div>
            </article>
          </section>

          <div className={`policy-detail-layout ${isOutlineCollapsed ? "is-outline-collapsed" : ""}`}>
            <aside className={`fiori-panel policy-outline-panel ${isOutlineCollapsed ? "is-collapsed" : ""}`}>
              <div className="fiori-panel-header">
                <div>
                  <h3>Document Outline</h3>
                  <p>Jump between sections in the active policy</p>
                </div>
                <button
                  type="button"
                  className="policy-outline-toggle"
                  onClick={() => setIsOutlineCollapsed((previous) => !previous)}
                  aria-label={isOutlineCollapsed ? "Expand document outline" : "Collapse document outline"}
                  title={isOutlineCollapsed ? "Expand document outline" : "Collapse document outline"}
                >
                  {isOutlineCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
                </button>
              </div>

              {!isOutlineCollapsed ? (
                <div className="policy-outline-list">
                  {selectedPolicy.sections.map((section) => (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className={`policy-outline-item ${
                        activeSection === section.id ? "is-active" : ""
                      }`}
                      onClick={(event) => {
                        event.preventDefault();
                        scrollToSection(section.id);
                      }}
                      aria-current={activeSection === section.id ? "location" : undefined}
                    >
                      {section.title}
                    </a>
                  ))}
                </div>
              ) : null}
            </aside>

            <section className="fiori-panel policy-document-panel">
              <div className="fiori-panel-header">
                <div>
                  <h3>Policy Document</h3>
                  <p>Review the latest published guidance in one place</p>
                </div>
                <span className={`fiori-status-pill ${statusToneMap[selectedPolicy.status] || "is-neutral"}`}>
                  {selectedPolicy.status}
                </span>
              </div>

              <div
                ref={contentRootRef}
                className="policy-document-content"
                dangerouslySetInnerHTML={{ __html: selectedPolicy.content }}
              />
            </section>
          </div>
        </div>

        {canUpdatePolicies && isEditModalOpen && editForm ? (
          <div className="admin-modal-overlay" onClick={closeEditModal}>
            <div className="admin-modal admin-modal-wide" onClick={(event) => event.stopPropagation()}>
              <div className="admin-modal-header">
                <div>
                  <h2>Update Policy</h2>
                  <p>Edit the policy summary and published document content in one place.</p>
                </div>
                <button className="fiori-button secondary danger" onClick={closeEditModal}>
                  <X size={16} />
                  <span>Close</span>
                </button>
              </div>

              <div className="policy-edit-grid">
                <label className="fiori-form-field">
                  <label>Policy Title</label>
                  <input
                    className="input"
                    value={editForm.title}
                    onChange={(event) => updateEditField("title", event.target.value)}
                  />
                </label>

                <label className="fiori-form-field">
                  <label>Category</label>
                  <ValueHelpSelect
                    value={editForm.category}
                    onChange={(value) => updateEditField("category", value)}
                    searchPlaceholder="Search categories"
                    options={categories
                      .filter((category) => category !== "All")
                      .map((category) => ({ value: category, label: category }))}
                  />
                </label>

                <label className="fiori-form-field">
                  <label>Status</label>
                  <ValueHelpSelect
                    value={editForm.status}
                    onChange={(value) => updateEditField("status", value)}
                    searchPlaceholder="Search status"
                    options={statuses
                      .filter((status) => status !== "All")
                      .map((status) => ({ value: status, label: status }))}
                  />
                </label>

                <label className="fiori-form-field">
                  <label>Updated</label>
                  <input
                    className="input"
                    value={editForm.updated}
                    onChange={(event) => updateEditField("updated", event.target.value)}
                  />
                </label>

                <label className="fiori-form-field">
                  <label>Published</label>
                  <input
                    className="input"
                    value={editForm.dateAdded}
                    onChange={(event) => updateEditField("dateAdded", event.target.value)}
                  />
                </label>

                <label className="fiori-form-field">
                  <label>Amended</label>
                  <input
                    className="input"
                    value={editForm.dateAmended}
                    onChange={(event) => updateEditField("dateAmended", event.target.value)}
                  />
                </label>

                <label className="fiori-form-field policy-edit-field-wide">
                  <label>Description</label>
                  <textarea
                    value={editForm.description}
                    onChange={(event) => updateEditField("description", event.target.value)}
                    rows={3}
                  />
                </label>

                <label className="fiori-form-field policy-edit-field-wide">
                  <label>Policy Content (HTML)</label>
                  <textarea
                    value={editForm.content}
                    onChange={(event) => updateEditField("content", event.target.value)}
                    rows={18}
                  />
                </label>
              </div>

              <div className="admin-modal-actions">
                <button className="fiori-button secondary" onClick={closeEditModal}>
                  Cancel
                </button>
                <button className="fiori-button primary" onClick={savePolicyUpdates}>
                  Save changes
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="policy-workspace">
      <header className="admin-hero">
        <div className="admin-hero-copy">
          <h1>Policies</h1>
          <p>
            Manage, browse, and read policy documents from one clear workspace.
          </p>
        </div>
      </header>

      <section className="policy-summary-grid">
        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Library Size</span>
            <BookOpenText size={18} />
          </div>
          <div className="fiori-stat-value">{policies.length}</div>
          <div className="fiori-stat-note">Policies currently available in the workspace</div>
        </article>

        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Active Policies</span>
            <ShieldCheck size={18} />
          </div>
          <div className="fiori-stat-value">{activePoliciesCount}</div>
          <div className="fiori-stat-note">Published documents employees can rely on today</div>
        </article>

        <article className="fiori-stat-card">
          <div className="fiori-stat-topline">
            <span className="fiori-stat-label">Filtered View</span>
            <Filter size={18} />
          </div>
          <div className="fiori-stat-value">{filteredPolicies.length}</div>
          <div className="fiori-stat-note">Policies matching the current search and filters</div>
        </article>
      </section>

      <section className="fiori-panel">
        <div className="fiori-panel-header">
          <div>
            <h3>Search and Filter</h3>
            <p>Find a policy by title, reference number, category, or status</p>
          </div>
        </div>

        <div className="policy-filter-grid">
          <label className="employee-filter-field employee-filter-search">
            <span>Search</span>
            <ValueHelpSearch
              value={searchQuery}
              onChange={setSearchQuery}
              suggestions={policySearchSuggestions}
              placeholder="Search by ID, title, or description"
            />
          </label>

          <label className="employee-filter-field">
            <span>Category</span>
            <ValueHelpSelect
              value={selectedCategory}
              onChange={setSelectedCategory}
              searchPlaceholder="Search categories"
              options={categories.map((category) => ({
                value: category,
                label: category === "All" ? "All categories" : category,
              }))}
            />
          </label>

          <label className="employee-filter-field">
            <span>Status</span>
            <ValueHelpSelect
              value={selectedStatus}
              onChange={setSelectedStatus}
              searchPlaceholder="Search statuses"
              options={statuses.map((status) => ({
                value: status,
                label: status === "All" ? "All statuses" : status,
              }))}
            />
          </label>
        </div>
      </section>

      {filteredPolicies.length === 0 ? (
        <div className="admin-empty-state">
          <FileText size={28} />
          <div>
            <strong>No policies match the current filters</strong>
            <p>Try changing the search terms or reset a filter to broaden the library view.</p>
          </div>
        </div>
      ) : (
        <section className="fiori-panel">
          <div className="fiori-panel-header">
            <div>
              <h3>Policy Table</h3>
              <p>Published policies displayed in a structured SAP-style list.</p>
            </div>
          </div>

          <div className="fiori-table-shell">
            <table className="fiori-table">
              <thead>
                <tr>
                  <th>Policy</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Sections</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPolicies.map((policy) => (
                  <tr key={policy.id}>
                    <td>
                      <div className="fiori-primary-cell">
                        <strong>{policy.title}</strong>
                        <span>{policy.id}</span>
                        <span>{policy.description}</span>
                      </div>
                    </td>
                    <td>{policy.category}</td>
                    <td>
                      <span className={`fiori-status-pill ${statusToneMap[policy.status] || "is-neutral"}`}>
                        {policy.status}
                      </span>
                    </td>
                    <td>{policy.sections.length}</td>
                    <td>{policy.updated}</td>
                    <td>
                      <button className="fiori-button secondary" onClick={() => openPolicy(policy.id)}>
                        Open policy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
};

export default Policy;
