# PediForm Pro MVP Technical Implementation Proposal

Status: Proposed (awaiting approval)  
Version: 0.2  
Date: 2026-03-15  
Owner: Engineering

## 1. Technical Objective

Deliver a production-ready MVP platform for:

- New Patient Registration intake (parent-facing wizard).
- JSON template-driven form rendering and validation.
- Reliable data persistence (draft + completed lifecycle).
- Staff portal retrieval and canonical JSON export.

ASQ/ASQ:SE/M-CHAT and PDF generation are explicitly deferred to Release 2, but the architecture must avoid dead-end choices and support additive form modules.

## 2. Proposed Architecture

## 2.1 Logical Components

1. Parent Web App (public, mobile-first)
2. Staff Web App surface (same codebase, protected routes)
3. Backend API (REST)
4. PostgreSQL (Supabase)
5. Template registry (JSON files in repo, versioned)
6. Authentication provider (Supabase Auth for staff accounts)

## 2.2 Runtime Topology

- Frontend: Vercel (React + Vite static assets)
- Backend API: Railway (Node.js service)
- Database/Auth/Storage: Supabase

This split keeps deployment simple and preserves independent scaling of API vs static frontend.

## 2.3 Monorepo Layout (Proposed)

```text
/
  apps/
    web/                      # React app for parent + staff routes
    api/                      # Node/Express API
  packages/
    ui/                       # shared UI primitives
    types/                    # shared TS contracts
    validation/               # Zod schemas
    domain/                   # business rules (status transitions, form contracts)
  templates/
    forms/
      new_patient_paperwork.json
  docs/
    Product_Design_MVP.md
    Technical_Implementation_MVP.md
```

## 3. Stack Decisions

- `React 18 + Vite + TypeScript`: fast iteration and deploy pipeline.
- `Tailwind CSS`: quick, consistent component styling.
- `Node.js + Express + TypeScript`: explicit control over API contract/security middleware.
- `Supabase Postgres`: managed relational storage with RLS support.
- `Supabase Auth`: staff login + JWT flow without custom auth backend.
- `Zod`: shared runtime input validation.
- `TanStack Query` (frontend): request caching and retry strategy.

## 4. Domain Model (MVP)

## 4.1 Core Entities

`practice`
- tenant metadata and feature flags

`staff_user`
- auth-linked user scoped to one practice
- role-based permissions (`admin`, `staff`)

`submission`
- one parent session/intake packet
- lifecycle state machine

`form_template`
- JSON template file defining step structure, fields, and properties
- versioned so output payloads are reproducible

`submission_event`
- append-only audit records for access/download/security trail

## 4.2 Submission Status State Machine

`in_progress -> completed -> exported`

Rules:

- New submissions always start `in_progress`.
- Only explicit complete endpoint can set `completed`.
- First JSON export marks as `exported` and sets timestamps/user metadata.
- No endpoint supports reverting to earlier state.

## 5. Database Schema (SQL Proposal)

```sql
create table if not exists practices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists staff_users (
  id uuid primary key references auth.users(id) on delete cascade,
  practice_id uuid not null references practices(id) on delete restrict,
  role text not null check (role in ('admin', 'staff')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  practice_id uuid not null references practices(id) on delete restrict,
  child_first_name text not null,
  child_last_name text not null,
  child_dob date not null,
  child_age_months integer not null check (child_age_months >= 0),
  visit_type text not null check (visit_type in ('new_patient','well_child','sick','follow_up')),
  forms_to_complete text[] not null default '{}',
  forms_completed text[] not null default '{}',
  template_version text not null,
  form_data jsonb not null default '{}'::jsonb,
  confirmation_code text not null unique,
  status text not null check (status in ('in_progress','completed','exported')) default 'in_progress',
  submitted_at timestamptz,
  exported_at timestamptz,
  exported_by uuid references staff_users(id),
  ip_address inet,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists submission_events (
  id bigserial primary key,
  submission_id uuid not null references submissions(id) on delete cascade,
  practice_id uuid not null references practices(id) on delete restrict,
  actor_type text not null check (actor_type in ('parent','staff','system')),
  actor_id uuid,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
```

## 5.1 Indexing Strategy

```sql
create index if not exists idx_submissions_practice_created
  on submissions(practice_id, created_at desc);

create index if not exists idx_submissions_practice_status
  on submissions(practice_id, status);

create index if not exists idx_submissions_practice_visit_type
  on submissions(practice_id, visit_type);

create index if not exists idx_submissions_name_search
  on submissions using gin (to_tsvector('simple', child_first_name || ' ' || child_last_name));
```

## 5.2 Row-Level Security

- Staff users can `select` submissions only for their `practice_id`.
- Public/anonymous can `insert` draft submissions and `patch` their own session payload only through API layer; direct `select` denied.
- All mutating staff actions flow through service role API with explicit permission checks and audit event writes.

## 6. API Contract (MVP)

## 6.1 Public Endpoints (Parent)

### `GET /api/practices/:slug`
- Returns practice branding and allowed visit types.

### `GET /api/forms/:form_id/template`
- Returns active JSON template with version and field definitions.

### `POST /api/submissions`
- Creates draft session.
- Request:

```json
{
  "practice_id": "uuid",
  "child_first_name": "Jane",
  "child_last_name": "Doe",
  "child_dob": "2023-05-04",
  "visit_type": "new_patient"
}
```

- Behavior:
- computes age in months
- sets `forms_to_complete = ["new_patient_paperwork"]` for MVP
- resolves active `template_version` for the form
- generates confirmation code
- writes `submission_created` event

### `PATCH /api/submissions/:id/autosave`
- Upserts section data into `form_data.new_patient_paperwork`.
- Request:

```json
{
  "form_id": "new_patient_paperwork",
  "step": 6,
  "data": {
    "medical_history": {
      "hospitalizations": "none"
    }
  }
}
```

- Behavior:
- deep merge by form section
- update `updated_at`
- write `autosave` event (sampled to avoid event noise if desired)

### `POST /api/submissions/:id/complete`
- Validates required sections and consent artifacts.
- sets `forms_completed`, `status=completed`, `submitted_at=now()`
- returns confirmation payload

## 6.2 Protected Endpoints (Staff)

### `POST /api/staff/login` (if proxying auth) or direct Supabase auth in frontend

### `GET /api/staff/submissions`
- Query: `date_from`, `date_to`, `status`, `visit_type`, `search`, `page`, `page_size`
- Returns paginated rows with summary metadata.

### `GET /api/staff/submissions/:id`
- Returns full structured payload for New Patient packet.

### `GET /api/staff/submissions/:id/json`
- Returns canonical JSON payload for the selected submission.
- First export stamps `exported_at`, `exported_by`, `status=exported`.

### `GET/PATCH /api/staff/practice`
- Admin-only settings.

### `GET/POST/DELETE /api/staff/users`
- Admin-only staff lifecycle management.

## 7. Validation, Error Handling, and Contracts

- Use shared Zod schemas in `packages/validation`.
- Strict DTO versioning via `v1` namespace in API route path or headers (decision at implementation kickoff).
- Centralized error envelope:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "child_dob is required",
    "field_errors": {
      "child_dob": "Required"
    },
    "request_id": "..."
  }
}
```

- Ensure all endpoints return consistent status codes (`400`, `401`, `403`, `404`, `409`, `422`, `500`).

## 8. Frontend Technical Design

## 8.1 Parent App

- Route groups:
- `/p/:slug` start
- `/p/:slug/session/:sessionId/overview`
- `/p/:slug/session/:sessionId/form/new_patient_paperwork/step/:step`
- `/p/:slug/session/:sessionId/confirmation`

- Form engine:
- `react-hook-form` for local step state
- Zod resolver for step validation
- template-driven step/field generation from JSON template
- local storage/session storage backup snapshot
- autosave timer every 30s + on step transition

- Recovery logic:
- on load, detect local draft newer than server snapshot
- offer parent one-click resume

## 8.2 Staff App

- Protected route shell `/staff/*`.
- Dashboard uses TanStack Query with polling (60s).
- Server-side pagination/filtering.
- Detail drawer/page with normalized rendering of sectioned payload.
- Edit controls operate on normalized patient tables and preserve template-linked field keys.

## 9. Template and Output Design

## 9.1 Form Template JSON Contract

- Location: `templates/forms/{form_id}.json`
- Must include:
- `form_id`
- `version`
- `steps[]`
- `fields[]` with `field_id`, `label`, `input_type`, `required`, `validation_rules`, `data_path`

Example (abbreviated):

```json
{
  "form_id": "new_patient_paperwork",
  "version": "1.0.0",
  "steps": [
    {
      "step_id": "child_information",
      "fields": [
        {
          "field_id": "child_first_name",
          "input_type": "text",
          "required": true,
          "data_path": "patient.child.first_name"
        }
      ]
    }
  ]
}
```

## 9.2 Canonical Output JSON Contract

- All saved answers are emitted in one canonical JSON object keyed by stable domain paths.
- Response includes metadata for reproducibility:
- `submission_id`
- `practice_id`
- `form_id`
- `template_version`
- `status`
- `submitted_at`
- `payload`

Example (abbreviated):

```json
{
  "submission_id": "uuid",
  "form_id": "new_patient_paperwork",
  "template_version": "1.0.0",
  "status": "completed",
  "payload": {
    "patient": {
      "child": {
        "first_name": "Jane"
      }
    }
  }
}
```

This canonical JSON is the sole Release 1 export artifact and the source for Release 2 PDF rendering.

## 10. Security and Compliance Implementation

- TLS-only deployment and HSTS headers.
- CSP baseline header and XSS hardening.
- CSRF protection for cookie-based state mutations (if cookies used).
- API-level rate limiting:
- parent create submission: 10/hour/IP
- autosave: burst with sane window limit
- PHI log redaction middleware:
- suppress names, DOB, free-text fields from request logs
- full audit events for staff access and JSON export operations.
- retention job (daily cron):
- soft-delete/archive or hard-delete records older than configured threshold (default 90 days).

## 11. Observability and Operations

- Structured logs with request IDs.
- Sentry on frontend + backend.
- Basic metrics:
- API latency p50/p95
- error rates by endpoint
- completion funnel
- JSON export generation time

- Alert conditions:
- elevated 5xx > threshold
- database connection saturation
- high autosave failure rate

## 12. Testing Strategy

## 12.1 Unit Tests

- Age-in-month calculation utility.
- Submission state transitions.
- Form section validation schemas.
- Template loader/validator functions.
- Canonical JSON transformation functions.

## 12.2 Integration Tests

- Public submission flow from start to complete.
- Staff auth + filtered listing.
- JSON export endpoints and audit record creation.
- tenant isolation and RLS guard scenarios.

## 12.3 E2E Tests (Playwright)

- Parent complete flow on mobile viewport.
- Parent interruption + resume flow.
- Staff login -> view -> JSON export flow.

## 12.4 Accessibility Tests

- axe checks on all parent steps and staff key pages.

## 13. Delivery Plan (Phased)

## Phase 1: Foundation

- Repository scaffolding, auth wiring, DB migrations, shared types/validation.

## Phase 2: Parent Intake MVP

- Welcome/overview/wizard/confirmation screens.
- Autosave + completion endpoints.

## Phase 3: Staff Portal MVP

- Dashboard, filters, detail view, role checks.

## Phase 4: Export + Hardening

- Canonical JSON export endpoint hardening.
- audit events, retention job, monitoring, production checklist.

## 14. Definition of Done (MVP)

- All critical acceptance tests pass.
- Security checklist completed.
- No cross-tenant data exposure in tests.
- End-to-end parent submission completed on real iOS/Android devices.
- Staff JSON export verified for at least 20 representative submissions.
- Observability dashboards and alerts active in production.

## 15. Release 2 Readiness (ASQ/M-CHAT)

The following will already be in place after MVP:

- generic `forms_to_complete` and `form_data` keyed by `form_id`
- per-form route pattern and render abstractions
- template versioning and canonical JSON outputs for reproducible rendering
- audit and tenant controls reusable for screening forms

This allows Release 2 to focus mainly on:

- routing logic for age/visit-based form assignment
- scoring engines
- PDF generation from canonical JSON payloads
- UI and staff interpretation surfaces

## 16. Approval Request

Approve this technical implementation plan to begin execution of:

1. Core platform infrastructure.
2. JSON template-based New Patient Registration wizard.
3. Persistent storage + staff retrieval + canonical JSON export.
4. Release 2-compatible architecture without implementing ASQ/M-CHAT or PDF rendering in MVP.
