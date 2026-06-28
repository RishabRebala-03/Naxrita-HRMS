# HRMS Local Smoke Test Cases

Date: 2026-06-28

## Payslips

1. Admin can see draft and published payslips in the display list.
2. Employee can only see their own published payslips.
3. Employee cannot see their own draft payslips before publish.
4. Manager cannot see reportee payslips in the list.
5. Manager cannot download a reportee payslip PDF directly.
6. Publish action makes selected draft payslips visible to the correct employee.
7. Bulk delete removes selected payslips.
8. Excel upload returns layman-friendly failed row details.

## Timesheets

1. Admin with timesheet access can load pending lead approvals.
2. Admin approval is blocked when `approver_name` is missing.
3. Admin approval succeeds when `approver_name` is provided.
4. Approval history stores the entered approver name.
5. Admin rejection is blocked when `approver_name` is missing.
6. Admin rejection succeeds when `approver_name` and rejection reason are provided.
7. Rejection history stores the entered approver name and reason.

## UI / Manual follow-up

1. Payslips display tab shows select-all, publish, and delete flows.
2. Confirm modal appears before publish/delete.
3. Toast appears in the top-right for success and error outcomes.
4. Timesheet tables show timestamps for submitted and approval activity.
5. Leave management tables show timestamps where dates are displayed.
6. Admin timesheet summary cards update after filters change.
7. Fortnight sections collapse and expand correctly.
