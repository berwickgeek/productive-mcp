# Productive.io API surface

Reference notes on the upstream API this server wraps. Docs: https://developer.productive.io/index.html. Recorded mid-2026; re-verify anything load-bearing against the docs before relying on it.

## Authentication

- Base URL: `https://api.productive.io/api/v2/`
- Headers: `X-Auth-Token`, `X-Organization-Id`, `Content-Type: application/vnd.api+json`
- Token-based only, no OAuth

## Rate limits

- 100 requests per 10 seconds, 4000 per 30 minutes, general
- 10 per 30 seconds for reports
- 1000 webhook deliveries per 5 minutes

## Common patterns (JSON:API)

- Pagination: `?page[number]=X&page[size]=Y` (max 200)
- Filtering: `?filter[field]=value` with operations (eq, not_eq, contains, gt, lt, and so on)
- Logical grouping: `filter[$op]=or` with indexed filters
- Sorting: `?sort=field` or `?sort=-field`
- Includes: `?include=relationship_name`. A relationship you did not include comes back as `{"meta": {"included": false}}`, not as `{"data": ...}`.
- Multi-currency: fields appear as base, `_default`, `_normalized`
- DateTime precision: send the `X-Feature-Flags: filteringSkipDatetimeCastToDate` header

## Endpoint inventory

- Project management: projects, tasks, task_lists, task_dependencies, folders (replaces boards), workflows, workflow_statuses, sections
- Time and resource: time_entries (with approve and reject), timers, timesheets, time_entry_versions, bookings (with approve), resource_requests, service_assignments, time_tracking_policies
- Financial: invoices (finalize, send, export), line_items (bulk generate), invoice_templates, invoice_attributions, payments, payment_reminder_sequences, expenses (approve, export, copy), bills, purchase_orders, tax_rates, bank_accounts, exchange_rates
- Deals and budgets: deals (one endpoint for both, distinguished by the `budget` boolean), deal_statuses, deal_cost_rates, contracts (recurring budgets with a generate action), lost_reasons, services, service_types, pipelines, prices
- People and organisation: people (invite, deactivate, archive, merge), users, companies, teams, team_memberships, memberships (access control), organization_memberships, subsidiaries, permission_sets, placeholders
- Documents: pages (move, copy), page_versions, document_types, document_styles, custom_domains, attachments (S3 presigned upload; see `attachments.md`)
- Absences: events (absence categories), entitlements, holiday_calendars, holidays
- Approvals: approval_policies, approval_policy_assignments, approval_workflows
- Collaboration: activities (audit log), comments (pin, react), discussions, emails, notifications, todos
- Custom data: custom_fields, custom_field_options, custom_field_sections, tags, filters (saved views), dashboards, widgets
- Reports: 23 types under `/reports/{type}_reports`: booking, budget, company, deal, entitlement, expense, financial_item, funnel, invoice, line_item, page, payment, payroll_item, person, price, project, proposal, salary, service, survey, task, time_entry, time
- Sales: proposals
- Integrations: webhooks, webhook_logs, integrations, integration_exporter_configs, sessions
- Other: overheads, deleted_items, surveys, revenue_distributions

## Webhooks

34 events across tasks, invoices, deals, budgets, projects, time_entries, bookings, expenses, people, companies and payments. Signed with `Productive-Signature` (HMAC-SHA256). Retries 11 times over 12 hours.

## Data model relationships

- Hierarchy: Organization > Company > Project > Folder > Task List > Task
- Deal and budget duality: the `deals` endpoint, with the `budget` boolean telling them apart
- Services belong to a deal or budget and define billing type (Fixed, T&M, Non-billable)
- Time entries link person + service + optional task. A time entry whose service is not in the same budget as its task is rejected, and the error blames the task attribute, not the service.
- Workflows contain workflow_statuses (categories: not_started, started, closed)
- Contracts are recurring budgets with an interval and a generate endpoint
- Custom fields: 7 types, applicable to 12 entity types
- Memberships control access at 5 levels (full, edit, view, comment, member)

## Coverage in this server

The authoritative tool inventory is `src/tools/annotations.ts` (72 tools at the time of writing). As of 2026-09-10 the server covers projects, companies, people, folders, task lists, tasks (including subtasks, dependencies, reposition, sprint, backlog), comments (including reactions and pinning), pages, todos, time entries (list, create, update, delete), services and deals, workflows, activities, and attachment reads.

Still absent, as API families: invoices and all financial endpoints, bookings and resource planning, absences, approvals, reports, custom fields, webhooks, contracts, proposals, surveys, dashboards, notifications, teams.
