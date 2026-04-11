import { randomUUID } from 'node:crypto';
import { db, nowIso, stringifyJson } from './database.js';
import { hashPassword } from '../lib/auth.js';

export function seedDefaults(): void {
  const existingPractice = db.prepare('select id from practices where slug = ?').get('sunshine-pediatrics') as
    | { id: string }
    | undefined;

  let practiceId = existingPractice?.id;
  if (!practiceId) {
    practiceId = randomUUID();
    db.prepare(
      `insert into practices (id, name, slug, logo_url, settings_json, created_at)
       values (?, ?, ?, ?, ?, ?)`,
    ).run(
      practiceId,
      'Sunshine Pediatrics',
      'sunshine-pediatrics',
      null,
      stringifyJson({
        enabled_visit_types: ['new_patient', 'well_child', 'sick', 'follow_up'],
      }),
      nowIso(),
    );
  }

  const existingStaff = db.prepare('select id from staff_users where email = ?').get('admin@sunshineclinic.com') as
    | { id: string }
    | undefined;

  if (!existingStaff) {
    db.prepare(
      `insert into staff_users (id, email, password_hash, practice_id, role, is_active, created_at)
       values (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      'admin@sunshineclinic.com',
      hashPassword('Admin@12345'),
      practiceId,
      'admin',
      1,
      nowIso(),
    );
  }
}
