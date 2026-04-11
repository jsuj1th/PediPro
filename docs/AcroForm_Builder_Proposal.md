# AcroForm Builder Feature Proposal (Integrated Into PediForm)

Status: Proposed (awaiting approval)  
Version: 0.2  
Date: 2026-03-17  
Owner: Product + Engineering

## 1. Objective

Implement AcroForm Builder as a **feature inside PediForm itself** (not a separate app), so staff admins can:

1. Upload/import a base PDF.
2. Visually place and configure form fields.
3. Generate and publish an AcroForm-fillable template.
4. Use the published template in existing submission PDF export.

## 2. Product Decision

AcroForm Builder will be embedded into the current platform:

- Same frontend app (`apps/web`)
- Same backend API (`apps/api`)
- Same auth/session model
- Same deployment pipeline

No additional standalone application (`apps/acroform-builder`) will be created.

## 3. In-Product Scope

## 3.1 In Scope (Phase 1)

- New admin/staff feature area in existing staff portal:
- `/staff/templates`
- `/staff/templates/:id/editor`
- PDF upload/import.
- Visual page editor for field placement.
- Field types:
- text
- multiline text
- checkbox
- radio group
- dropdown
- date
- signature placeholder
- Field properties:
- unique `field_name`
- display label
- required/optional
- default value
- max length
- alignment/font size
- canonical `data_path` mapping (example: `payload.patient.child.first_name`)
- Save draft template metadata.
- Generate AcroForm PDF from editor state.
- Publish template version.
- Existing endpoint `GET /api/staff/submissions/:id/pdf` switched to published-template fill path.

## 3.2 Out of Scope (Phase 1)

- OCR auto-detection of fields.
- Real-time multi-user collaboration in template editor.
- Advanced conditional rendering logic in builder.

## 4. Architecture (Integrated)

## 4.1 Frontend Changes (`apps/web`)

- Add Template Management pages under staff routes.
- Add visual editor module using PDF.js canvas layer.
- Add field list + property panel + mapping validation UI.

## 4.2 Backend Changes (`apps/api`)

- Add template CRUD and publish endpoints under existing `/api/staff/templates/*` namespace.
- Add AcroForm generation service using `pdf-lib`.
- Update existing PDF export path to fill published AcroForm by field-name mappings.

## 4.3 Storage

- Store source and generated template PDFs in existing project storage strategy.
- Start local (consistent with current setup), keep abstraction for future S3/Supabase.

## 5. Data Model Additions

`pdf_templates`
- id
- practice_id (nullable for global template)
- template_key (example: `new_patient_registration`)
- version
- source_pdf_path
- acroform_pdf_path
- mapping_json
- status (`draft`, `published`, `archived`)
- created_by
- created_at
- updated_at

`pdf_template_fields`
- id
- template_id
- field_name
- field_type
- page_number
- x
- y
- width
- height
- required
- data_path
- options_json

## 6. API Endpoints (Integrated)

- `POST /api/staff/templates/upload-source`
- `POST /api/staff/templates/:id/fields`
- `PATCH /api/staff/templates/:id/fields/:fieldId`
- `DELETE /api/staff/templates/:id/fields/:fieldId`
- `POST /api/staff/templates/:id/generate-acroform`
- `POST /api/staff/templates/:id/publish`
- `GET /api/staff/templates`
- `GET /api/staff/templates/:id`

Existing export behavior update:

- `GET /api/staff/submissions/:id/pdf`
1. load active published template
2. map canonical JSON paths to AcroForm field names
3. fill + flatten AcroForm
4. download with existing filename convention (`patientname_patientregistration.pdf`)

## 7. UX (Inside Staff Portal)

## 7.1 Template List (`/staff/templates`)

- Create template
- Duplicate template
- View status/version/history
- Publish/Archive actions

## 7.2 Template Editor (`/staff/templates/:id/editor`)

- Left: page thumbnails
- Center: PDF canvas with draggable/resizable fields
- Right: field properties + data mapping
- Top actions: Save Draft, Preview Fill, Validate, Publish

## 7.3 Preview & Validation

- Test-fill with sample patient JSON.
- Flag duplicate field names.
- Flag missing mappings for required business fields.

## 8. Validation Rules Before Publish

- No duplicate field names.
- Required business fields are mapped.
- `data_path` values validate against canonical payload schema.
- Preview fill completes without runtime errors.

## 9. Security and Permissions

- Staff role: read-only template access.
- Admin role: create/edit/publish/archive templates.
- Audit events for template create/edit/publish and PDF export usage.

## 10. Delivery Plan

## Phase A: Foundation (1 week)

- DB schema additions
- backend template CRUD
- storage abstraction

## Phase B: Editor MVP (2 weeks)

- integrated `/staff/templates` UI
- visual placement and resize
- field property panel

## Phase C: Generate + Publish (1 week)

- AcroForm generation pipeline
- publish workflow + validation

## Phase D: Export Integration (1 week)

- replace coordinate overlay with published-template fill path
- fallback strategy if no template exists

## 11. Acceptance Criteria

- Admin can create and publish AcroForm templates from source PDFs within PediForm staff portal.
- Existing staff PDF export uses published template field-fill path.
- Output alignment is stable across Adobe Reader and Apple Preview.
- Download filename remains `patientname_patientregistration.pdf`.

## 12. Risks and Mitigations

Risk: field placement inaccuracies.  
Mitigation: zoom, keyboard nudge, snap grid, preview fill.

Risk: template changes breaking exports.  
Mitigation: versioned publish, rollback to previous published version.

Risk: mapping drift from canonical schema.  
Mitigation: schema validation gate before publish.

## 13. Approval Request

Approve this **integrated feature approach** for AcroForm Builder inside PediForm.

After approval, implementation starts directly in current codebase:

1. schema + API scaffolding,
2. staff template UI routes,
3. first end-to-end publish + export flow.
