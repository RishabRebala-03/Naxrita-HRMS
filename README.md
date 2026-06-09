# Naxrita - Human Resource Management System

Enterprise-grade HRMS platform designed to centralize workforce management, employee operations, leave workflows, timesheets, payroll administration, policy management, and internal office services.

---

## Overview

NaxHR provides a unified workspace for employees, managers, and administrators to manage day-to-day HR operations through a single platform.

The system streamlines employee lifecycle management, attendance and leave workflows, timesheet approvals, expense management, payroll distribution, policy governance, project tracking, and organizational reporting.

---

## Core Modules

### Employee Management

* Employee onboarding and setup
* Employee directory and global search
* Employee profiles and assignments
* Organization hierarchy visualization
* Reporting manager relationships

### Leave Management

* Leave application and approval workflows
* Multiple leave categories
* Working-day leave calculations
* Escalation and automation workflows
* Leave calendar and holiday planning

### Timesheets & Expenses

* Daily work logging
* Approval workflows
* Charge code management
* Expense claims and document uploads
* Time and expense reporting

### Payroll Management

* Payslip generation
* Bulk payroll imports
* PDF payslip distribution
* Payroll history tracking

### Project Management

* Project creation and staffing
* Resource allocation
* Risk indicators
* Leave impact analysis
* Assignment tracking

### Governance & Compliance

* Audit trails
* Policy management
* Activity tracking
* Exportable reports

### Office Operations

* Tea & Coffee Ordering Module
* Service availability management
* Demand tracking and reporting

---

## User Roles

* Employee
* Manager
* Administrator

---

## Business Value

NaxHR consolidates HR operations into a single platform, reducing administrative overhead while improving workforce visibility, compliance, employee experience, and operational efficiency.

---

## Technology Stack

### Frontend

* React 19
* JavaScript (ES6+)
* Create React App (`react-scripts`)
* CSS

### UI & Visualization

* Lucide React
* Recharts

### Backend

* Python Flask
* Flask-CORS
* APScheduler

### Database

* MongoDB
* PyMongo
* Flask-PyMongo

### Security & Authentication

* Werkzeug
* Cryptography

### Document & Report Generation

* ReportLab (PDF Generation)
* OpenPyXL (Excel Processing)

### API Communication

* Axios

### Deployment & Infrastructure

* Docker
* Docker Compose
* Gunicorn
* Node-based Static Hosting

### Testing

* React Testing Library
* Jest

---

## Architecture

```text
Frontend (React)
        │
        ▼
Backend API (Flask)
        │
        ▼
MongoDB Database
```

### High-Level Architecture

* React frontend for employee, manager, and administrator portals
* Flask REST APIs powering HR workflows and business logic
* MongoDB for employee, leave, payroll, project, and operational data
* Scheduled background jobs using APScheduler
* PDF and Excel generation for reports, exports, and payroll documents
* Dockerized deployment for portability and scalability

---

## Technical Highlights

* Role-Based Access Control (RBAC)
* Automated Leave Accrual & Escalation
* Timesheet Approval Workflows
* Expense Management System
* Payroll Document Generation
* Audit Logging & Compliance Tracking
* Organization Hierarchy Management
* Exportable Reporting & Analytics
* Mobile-Friendly User Experience

