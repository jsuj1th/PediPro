# PediForm Pro - Release 1 User Manual

## 1. What Release 1 Includes

Release 1 delivers an end-to-end intake platform inside the same FormFiller repository:

- In-app PDF template builder for staff
- AcroForm field authoring (field id, label, type, page, coordinates, size, options)
- Publishable template versions
- Parent registration flow rendered from published template fields
- Autosave + submission persistence in SQLite
- Parent account creation and login (Gmail + password)
- Staff patient workspace with editable normalized tables
- Export as canonical JSON and filled PDF

## 2. Prerequisites

- Node.js + npm installed
- Run from repository root: `FormFiller`

Install dependencies:

```bash
npm install
```

## 3. Start the Product

From repository root:

```bash
npm run dev
```

Apps:

- Web UI: `http://localhost:5173`
- API: `http://localhost:4000`
- Health check: `http://localhost:4000/health`

## 4. Default Staff Login

Seeded staff account:

- Email: `admin@sunshineclinic.com`
- Password: `Admin@12345`

Practice slug:

- `sunshine-pediatrics`

## 5. First-Time Setup (Required)

Before parents can submit forms, a **published** template must exist.

1. Login as staff.
2. Open `Staff -> Template Builder`.
3. In `Create New Template Version`:
   - Set `Template Key` to `patient_registration`
   - Enter a template name
   - Upload source PDF (example: `NEW PATIENT PAPERWORK.pdf`)
4. Click `Upload and Open Editor`.
5. Add fields (see section 6).
6. Click `Generate AcroForm`.
7. Click `Preview AcroForm` and verify field placement.
8. Click `Publish Version`.

Only published `patient_registration` template versions are used in parent intake.

## 6. Template Builder: Field Authoring

Each field needs:

- `field_id`: stable data key stored in submission JSON
- `field_name`: patient-facing label/question
- `field_type`: `text | textarea | checkbox | radio | select | date | signature`
- `acro_field_name`: name written into generated AcroForm
- `required`: whether parent must answer
- `section_key`: step grouping title in parent UI
- `display_order`: order within section
- `page_number`, `x`, `y`, `width`, `height`: PDF placement
- `options_json` (via comma-separated input): for `select` and `radio`
- `validation_json`: optional JSON object for future rules

Notes:

- Coordinates are PDF coordinates (origin at bottom-left of page).
- Use Source/AcroForm preview repeatedly to tune placement.
- Publishing a new version archives prior draft/published versions for the same template key.

## 7. Parent Intake Flow

1. Parent opens: `http://localhost:5173/p/sunshine-pediatrics`
2. Parent enters child basics and starts session.
3. Parent goes through sections generated from published template `section_key` groups.
4. Autosave runs every 30 seconds and on step navigation.
5. On submit, intake is marked complete and parent sees confirmation code.
6. Parent can create account (Gmail + password) and later login via `Parent Login`.

## 8. Staff Workspace Usage

Open `Staff -> Patients`:

- Search patients
- Open patient details
- Edit core patient fields
- Edit row-based tables (guardians, insurance, allergies, medications, family history)
- Edit one-to-one tables (pharmacy, medical/social history, concerns, preferences, consent)
- Save each section independently

## 9. Export Outputs

From a patient detail page (submission section):

- `Export JSON`: returns canonical JSON including:
  - submission metadata
  - `responses` keyed by `field_id`
  - normalized patient data snapshot
- `Export PDF`: downloads
  - filename format: `<patientfirst>_<patientlast>_patientregistration.pdf`
  - if submission has published AcroForm template, fields are filled by `field_id -> acro_field_name`
  - legacy fallback PDF renderer is used if template AcroForm is unavailable

## 10. Database Tools

From repository root:

```bash
npm run db:status
npm run db:tables
npm run db:counts
npm run db:schema -- submissions
npm run db:view -- submissions 10
npm run db:query -- "select id,status,created_at from submissions order by created_at desc limit 5"
npm run db:migrate
npm run db:seed
npm run db:reset -- --yes
```

`db:reset` deletes DB files and recreates schema + seed data.

## 11. Troubleshooting

### Error: No published patient registration template found

- Staff must upload, generate AcroForm, and publish a `patient_registration` template first.

### Error: Cannot find package `pdf-lib`

- Run `npm install` at repository root.

### PDF fields not appearing correctly

- Check field `page_number/x/y/width/height`
- Ensure correct `acro_field_name`
- Regenerate AcroForm and republish template version

### Parent cannot login

- Parent login only accepts Gmail addresses (`@gmail.com`)
- Verify account was created after submission confirmation
