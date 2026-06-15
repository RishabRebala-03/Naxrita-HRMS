import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
} from "lucide-react";

const ROLE_CONFIG = {
  Admin: {
    badge: "Admin orchestration",
    title: "Naxrita HRMS AI Assistant",
    subtitle: "Handle approvals, payroll context, policy questions, people operations tasks, and cross-portal actions with a plain-language request.",
    accentClass: "enterprise-assistant--admin",
    icon: ShieldCheck,
    suggestions: [
      "Show pending approvals I should review today",
      "Help me find payroll or leave-related actions faster",
      "Summarize the latest workforce updates in this portal",
    ],
  },
  Manager: {
    badge: "Manager enablement",
    title: "Naxrita HRMS AI Assistant",
    subtitle: "Move faster through team approvals, people information, calendars, and timesheet follow-ups with natural language.",
    accentClass: "enterprise-assistant--manager",
    icon: UsersRound,
    suggestions: [
      "Take me to my team leave approvals",
      "Help me review team timesheets and pending actions",
      "What can I do faster from the manager workspace?",
    ],
  },
  Employee: {
    badge: "Employee self-service",
    title: "Naxrita HRMS AI Assistant",
    subtitle: "Get help with leaves, payslips, profile details, policy lookup, and everyday HR tasks using plain language.",
    accentClass: "enterprise-assistant--employee",
    icon: UserRound,
    suggestions: [
      "I need to download my latest payslip",
      "Help me apply for leave quickly",
      "Where can I update my profile information?",
    ],
  },
};

const getAssistantReply = ({ role, text, userName }) => {
  const normalized = text.toLowerCase();

  if (normalized.includes("payslip")) {
    return `I can guide you straight to Payslips and help narrow the period you need${role === "Admin" ? " for a selected employee or payroll batch" : ""}.`;
  }

  if (normalized.includes("leave")) {
    return role === "Admin"
      ? "I can help with leave administration, employee leave actions, and approvals across the portal."
      : role === "Manager"
        ? "I can help you open team leave approvals, review balances, and follow the next action quickly."
        : "I can help you apply for leave, check balances, or review your leave history.";
  }

  if (normalized.includes("policy")) {
    return "I can point you toward the policy area and help you phrase what you are looking for before we connect this to live documents.";
  }

  if (normalized.includes("timesheet") || normalized.includes("expense")) {
    return role === "Employee"
      ? "I can help you jump into MyTimeAndExpenses and suggest the next step for submitting or checking entries."
      : "I can help you reach MyTimeAndExpenses and highlight the actions that usually matter first.";
  }

  if (normalized.includes("approval") || normalized.includes("approve")) {
    return role === "Employee"
      ? "Approvals are usually handled by your reporting chain, but I can still help you find the status and related records."
      : "I can help you get to approval-heavy workflows faster and eventually automate multi-step actions from one request.";
  }

  return `I can help ${userName ? userName.split(" ")[0] : "you"} move through the portal faster. This frontend version is ready for role-aware guidance, and the next step is wiring it to real actions.`;
};

const EnterpriseAssistant = ({ user }) => {
  const role = user?.role || "Employee";
  const config = ROLE_CONFIG[role] || ROLE_CONFIG.Employee;
  const AccentIcon = config.icon || BriefcaseBusiness;

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState(() => [
    {
      id: "welcome",
      type: "assistant",
      tone: "highlight",
      text: `${config.title} is ready${user?.name ? ` for ${user.name.split(" ")[0]}` : ""}.`,
    },
    {
      id: "context",
      type: "assistant",
      text: config.subtitle,
    },
  ]);
  const listRef = useRef(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, isOpen]);

  const submitQuery = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const userMessage = {
      id: `user-${Date.now()}`,
      type: "user",
      text: trimmed,
    };

    const assistantMessage = {
      id: `assistant-${Date.now() + 1}`,
      type: "assistant",
      text: getAssistantReply({
        role,
        text: trimmed,
        userName: user?.name,
      }),
    };

    setMessages((previous) => [...previous, userMessage, assistantMessage]);
    setQuery("");
    setIsOpen(true);
  };

  return (
    <div className={`enterprise-assistant ${config.accentClass} ${isOpen ? "is-open" : ""}`}>
      <button
        type="button"
        className="enterprise-assistant-launcher"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={isOpen ? "Collapse assistant" : "Open assistant"}
      >
        <div className="enterprise-assistant-launcher__glow" />
        <div className="enterprise-assistant-launcher__icon">
          <Bot size={20} strokeWidth={1.9} />
        </div>
        <div className="enterprise-assistant-launcher__copy">
          <span className="enterprise-assistant-launcher__eyebrow">AI Assistant</span>
          <strong>{config.title}</strong>
        </div>
        <ChevronDown
          size={18}
          className={`enterprise-assistant-launcher__chevron ${isOpen ? "rotated" : ""}`}
        />
      </button>

      {isOpen && (
        <section className="enterprise-assistant-panel" aria-label="AI assistant">
          <div className="enterprise-assistant-panel__hero">
            <div className="enterprise-assistant-panel__orb">
              <AccentIcon size={20} strokeWidth={2} />
            </div>

            <div className="enterprise-assistant-panel__hero-copy">
              <div className="enterprise-assistant-panel__badge">
                <Sparkles size={14} />
                <span>{config.badge}</span>
              </div>
              <h3>{config.title}</h3>
              <p>{config.subtitle}</p>
            </div>
          </div>

          <div className="enterprise-assistant-panel__suggestions">
            {config.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="enterprise-assistant-chip"
                onClick={() => submitQuery(suggestion)}
              >
                <MessageSquareText size={14} />
                <span>{suggestion}</span>
              </button>
            ))}
          </div>

          <div className="enterprise-assistant-thread" ref={listRef}>
            {messages.map((message) => (
              <article
                key={message.id}
                className={`enterprise-assistant-message enterprise-assistant-message--${message.type} ${message.tone ? `enterprise-assistant-message--${message.tone}` : ""}`}
              >
                <div className="enterprise-assistant-message__meta">
                  {message.type === "assistant" ? "Assistant" : "You"}
                </div>
                <div className="enterprise-assistant-message__body">{message.text}</div>
              </article>
            ))}
          </div>

          <form
            className="enterprise-assistant-composer"
            onSubmit={(event) => {
              event.preventDefault();
              submitQuery(query);
            }}
          >
            <label className="enterprise-assistant-composer__field">
              <span className="sr-only">Ask the assistant</span>
              <textarea
                rows={2}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ask anything about the portal..."
              />
            </label>

            <button type="submit" className="enterprise-assistant-composer__send" aria-label="Send">
              <ArrowUp size={16} strokeWidth={2.4} />
            </button>
          </form>
        </section>
      )}
    </div>
  );
};

export default EnterpriseAssistant;
