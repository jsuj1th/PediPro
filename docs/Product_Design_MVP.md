# PediForm Pro MVP Product Design Proposal

Status: Proposed (awaiting approval)  
Version: 0.3  
Date: 2026-03-15  
Owner: Product + Engineering

## 1. Executive Summary

This updated Release 1 proposal defines PediForm Pro MVP as:

- New Patient Registration digital workflow only.
- Mandatory patient account creation using **Gmail address + password** after registration submission.
- Full data persistence with staff-facing edit workflows.
- Complete extraction of New Patient Paperwork into a template-driven structured digital format.
- Form system driven by JSON templates (new forms are added as new templates).
- Canonical submission output in JSON for future PDF reconstruction.
- ASQ-3, ASQ:SE-2, and M-CHAT-R deferred to Release 2.

The outcome is a production-ready core platform where parents submit once and continue as registered users, while staff can review and edit patient data across normalized tables.

## 2. Product Goals

## 2.1 Primary Goals

- Replace paper new-patient packet with a mobile-first digital experience.
- Create a persistent patient account at initial onboarding.
- Reduce staff manual scanning and transcription.
- Provide staff editable patient records with auditability.
- Maintain secure tenant-scoped data boundaries.

## 2.2 Non-Goals (Release 1)

- No ASQ/ASQ:SE/M-CHAT workflows in this release.
- No EMR integration in this release.
- No insurance eligibility checks in this release.
- No multilingual localization in this release.

## 3. Users and Jobs-to-be-Done

## 3.1 Parent/Guardian

Job: Complete the packet quickly and leave with an account for future interactions.

Needs:

- Simple form flow with clear progress.
- Reliable autosave and resume.
- Account creation with Gmail and password at end of intake.

## 3.2 Front Desk/Clinical Staff

Job: Find patient records fast, correct errors, and export structured documentation.

Needs:

- Searchable patient objects.
- Editable fields across multiple structured tables.
- Export canonical JSON after verification.

## 3.3 Practice Admin

Job: Manage settings, staff users, and governance.

Needs:

- Role-based controls.
- Practice branding settings.
- Audit visibility for edits and downloads.

## 4. Release 1 Scope Definition

## 4.1 In Scope

- Practice-specific parent URL (`/p/{practice-slug}`).
- New patient intake wizard with full packet extraction.
- Autosave and resume.
- Submission confirmation.
- Post-submission account creation using Gmail + password.
- Parent login route for returning users.
- Staff portal with patient listing, editing, and JSON exports.
- Data persistence with audit trails and version history for edits.

## 4.2 Out of Scope (Deferred to Release 2)

- ASQ/ASQ:SE/M-CHAT form assignment and scoring.
- Developmental score interpretation views.
- Clinical risk highlighting tied to screening outcomes.

## 4.3 Architecture Hooks Retained in Release 1

- `forms_to_complete` remains array-based for future form families.
- `form_data` remains keyed by `form_id` for modular additions.
- Route structure stays compatible with per-form wizard expansion.

## 5. Experience Principles

- Mobile-first for parent flow.
- Clear step progression and completion confidence.
- Account-first continuity after first submission.
- Structured data capture over free-form text where possible.
- Staff-first editability with controlled permissions.
- WCAG 2.1 AA baseline for parent and staff UIs.

## 6. End-to-End User Journeys

## 6.1 Parent Journey (Release 1)

1. Parent scans QR or opens practice URL.
2. Parent enters child identity and visit metadata.
3. Parent completes New Patient packet with autosave.
4. Parent submits packet and gets confirmation code.
5. Parent lands on account creation step.
6. Parent registers using Gmail address + password.
7. Parent can sign in later to review/update their patient profile.

## 6.2 Staff Journey (Release 1)

1. Staff logs into `/staff/login`.
2. Staff opens patient workspace table.
3. Staff opens patient record and edits structured sections.
4. System records who changed what and when.
5. Staff exports canonical JSON when record is ready.

## 7. Parent UX Specifications (Release 1)

## 7.1 Screen A: Welcome / Start

Route: `/p/{slug}`

Fields:

- Child first name (required)
- Child last name (required)
- Child DOB (required)
- Visit type (required)

Behavior:

- Continue creates draft submission with `status=in_progress`.
- New Patient packet assigned for Release 1.
- Returns `session_id` and moves to overview.

## 7.2 Screen B: Overview / What to Expect

Route: `/p/{slug}/session/{session_id}/overview`

Content:

- New Patient paperwork checklist.
- Expected completion time.
- Start CTA.

## 7.3 Screen C-N: New Patient Wizard

Route pattern: `/p/{slug}/session/{id}/form/new_patient_paperwork/step/{step}`

Sections:

1. Child Information
2. Guardian 1
3. Guardian 2
4. Insurance
5. Pharmacy
6. Medical History
7. Current Concerns
8. Allergies
9. Current Medications
10. Immunization History
11. Family History
12. Social History
13. Provider Preference
14. Consent & Signature

Interaction:

- Back/Next controls with step validation.
- Inline field errors.
- Autosave every 30 seconds and on step transition.
- Resume from latest draft.
- UI rendering is driven by `new_patient_paperwork.json` template metadata, not hardcoded fields.

## 7.4 Screen Final: Submission Confirmation

Route: `/p/{slug}/session/{id}/confirmation`

Content:

- Success message and confirmation code.
- Next-step CTA: `Create Your Account`.

## 7.5 Screen: Account Creation (New Requirement)

Route: `/p/{slug}/session/{id}/create-account`

Fields:

- Gmail address (`@gmail.com` required)
- Password
- Confirm password
- Accept terms/privacy checkbox

Behavior:

- Account links to submission and patient profile.
- If Gmail already exists, route to sign-in and account-link flow.
- On success, redirect to parent dashboard.

## 7.6 Screen: Parent Sign-In

Route: `/parent/login`

Fields:

- Gmail
- Password

Behavior:

- Returns user to parent dashboard with child profile summary.

## 8. Staff Portal UX Specifications (Release 1)

## 8.1 Authentication

- Email/password login for staff users.
- Roles: `admin` and `staff`.
- Session timeout after inactivity.

## 8.2 Patient Workspace (Editable Multi-Table Model)

Route: `/staff/patients`

Release 1 must support editing patient records as structured objects across multiple tables:

1. `patients` table (core demographics)
2. `guardians` table (contact + relationship)
3. `insurance_policies` table
4. `pharmacies` table
5. `medical_history` table
6. `allergies` table
7. `medications` table
8. `family_history` table
9. `social_history` table
10. `consents_signatures` table
11. `submission_events` table (audit trail, read-only in UI)

UI behaviors:

- Main patient list table with filters and sorting.
- Record detail page with tabbed sub-tables.
- Inline or modal editing per table.
- Save/cancel controls per table section.
- Edit audit chip showing last editor and timestamp.

## 8.3 Submission and Export

- Staff can open current and historical submissions for a patient.
- Staff can generate canonical JSON from latest approved data snapshot.
- Export actions are audited.
- PDF generation from this JSON is deferred to a later release.

## 8.4 Admin Settings

- Practice branding.
- Staff user management.
- Consent text template management.
- QR code for parent entry route.

## 9. New Patient Paperwork Complete Extraction Specification

Release 1 requires complete field extraction from paper form to digital schema.

## 9.1 Extraction Requirements

- Every field present in the paper packet must exist in digital capture.
- Field labels must preserve clinical/front-desk meaning.
- Field input type must match intent (text/date/select/checkbox/signature).
- Optional vs required status must be explicitly declared.
- Validation rules must be attached to each field definition.

## 9.2 Extraction Deliverables

- Field catalog (source page, section, label, field key, type, required flag).
- Canonical JSON template file for New Patient packet (`new_patient_paperwork.json`).
- UI mapping document: field key to wizard step and component type.
- Output mapping: field key to canonical submission JSON path.

## 9.3 Template-First Form Contract (New Requirement)

- Every form is defined as a JSON template containing field names and properties.
- Creating a new form means adding one new template JSON file, not building new hardcoded components.
- Minimum field properties per template entry:
- `field_id`
- `label`
- `input_type`
- `required`
- `options` (for select/radio/checkbox groups)
- `validation_rules`
- `default_value`
- `ui` (step, order, helper text, placeholder)
- `data_path` (where this field is stored in canonical output JSON)

Example (abbreviated):

```json
{
  "form_id": "new_patient_paperwork",
  "version": "1.0.0",
  "steps": [
    {
      "step_id": "child_information",
      "title": "Child Information",
      "fields": [
        {
          "field_id": "child_first_name",
          "label": "Child First Name",
          "input_type": "text",
          "required": true,
          "validation_rules": { "minLength": 1, "maxLength": 100 },
          "data_path": "patient.child.first_name"
        }
      ]
    }
  ]
}
```

## 9.4 Completion Gate for Extraction

- 100% of source-paper fields mapped.
- No orphan fields in template or output JSON.
- Staff review confirms digital form is functionally equivalent to paper packet.

## 10. Data Capture Model (Product-Level)

Release 1 moves from single blob-oriented capture to normalized patient records plus submission snapshots.

Core model:

- `patient_account` (Gmail credential identity)
- `patient_profile` (child and household context)
- structured clinical/admin sub-tables (see Section 8.2)
- `form_templates` repository (JSON template files, versioned)
- `submission_snapshot` for immutable point-in-time packet output
- `audit_events` for all edits, exports, and access operations

## 11. Compliance and Safety Requirements

- HTTPS only.
- PHI redaction in application logs.
- Tenant-level data isolation.
- Audit logs for create/read/update/export.
- Default retention policy with configurable window.
- Parent account password policy with minimum length and complexity.
- Parent account passwords must be securely hashed only (never stored or logged in plain text).
- Parent account lockout and password reset flows are required.

## 12. Analytics and Operational Metrics

Release 1 metrics:

- Form start/completion rate
- Step-level drop-off
- Autosave recovery rate
- Account creation conversion rate after submission
- Staff edit frequency by table
- JSON export latency and success rate

Success targets:

- >= 80% form completion among starts
- >= 70% account creation after submission
- < 500ms p95 API for common CRUD reads/writes

## 13. Acceptance Criteria (Release 1 Gate)

## 13.1 Parent Completion and Account Creation

- Parent completes packet on mobile browsers.
- Parent receives confirmation code.
- Parent creates Gmail+password account immediately after submission.
- Returning parent can sign in and access their profile.

## 13.2 Data Integrity

- Step autosave is deterministic.
- Submission snapshot is immutable after completion.
- Staff edits are versioned and auditable.

## 13.3 Staff Editable Multi-Table Experience

- Staff can edit each patient section in its respective table.
- Staff can see edit history metadata for each table update.
- Staff can export canonical JSON from approved snapshot.

## 13.4 New Patient Extraction Completeness

- All paper fields are represented digitally.
- Mapping validation report shows 100% coverage.
- Output JSON includes all mapped keys from template definitions.

## 13.5 Security Baseline

- Passwords are not stored in plain text.
- Tenant isolation tests pass.
- PHI redaction checks pass.

## 14. Release Plan

## 14.1 Release 1 (Updated Proposal)

- New Patient digital intake with complete paper extraction.
- Post-submission Gmail/password parent account creation.
- Staff editable patient records across multiple normalized tables.
- JSON template-driven form engine and canonical JSON output workflow.
- Audited persistence and JSON export workflows.

## 14.2 Release 2 (Planned)

- ASQ/ASQ:SE/M-CHAT assignment and scoring modules.
- Screening-specific interpretation and highlighting in staff view.
- PDF generation service from canonical JSON output.

## 15. Risks and Mitigations

Risk: Account creation increases drop-off after form completion.  
Mitigation: defer account creation to post-submit success step, one-screen minimal flow.

Risk: Multi-table edits can introduce data inconsistency.  
Mitigation: transaction-safe updates and strict validation per table.

Risk: Full extraction misses edge fields.  
Mitigation: explicit field inventory and sign-off checklist with practice staff.

Risk: Gmail-only requirement excludes some guardians.  
Mitigation: flag for product decision review if pilot feedback indicates high rejection.

## 16. Decision Request

Approve this updated Release 1 scope:

- Mandatory patient account creation via Gmail + password after submission.
- Parent and staff UX updates as defined above.
- Staff-editable patient records across multiple tables.
- Complete New Patient Paperwork extraction as a Release 1 deliverable.
- Template-driven form definitions in JSON and canonical JSON output for all submissions.
