import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

type TableCount = { table: string; count: number };

type CommandFn = (args: string[]) => Promise<void>;

const DB_FILES = ['', '-shm', '-wal'];

function printHelp(): void {
  // Keep output compact for terminal workflows.
  console.log(`PediForm DB Tools\n
Usage:
  npm run db:status -w apps/api
  npm run db:tables -w apps/api
  npm run db:counts -w apps/api
  npm run db:schema -w apps/api -- patients
  npm run db:view -w apps/api -- submissions 20
  npm run db:query -w apps/api -- "select * from submissions limit 5"
  npm run db:migrate -w apps/api
  npm run db:seed -w apps/api
  npm run db:reset -w apps/api -- --yes

Commands:
  status             Show DB path, size, tables, and row counts
  tables             List user tables
  counts             Show row count per user table
  schema <table>     Show columns, indexes, and foreign keys for a table
  view <table> [n]   Print first n rows from table (default 20)
  query <sql>        Execute SQL (SELECT/PRAGMA prints rows; others print run info)
  migrate            Run schema migrations
  seed               Seed default practice/staff data
  reset --yes        Delete DB files and recreate schema + seed data
  help               Show this help
`);
}

function dbExists(): boolean {
  return fs.existsSync(config.dbPath);
}

function dbSizeBytes(): number {
  if (!dbExists()) return 0;
  return fs.statSync(config.dbPath).size;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function openDb(fileMustExist = true): Database.Database {
  return new Database(config.dbPath, {
    fileMustExist,
  });
}

function getUserTables(db: Database.Database): string[] {
  const rows = db
    .prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name")
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function getTableCounts(db: Database.Database): TableCount[] {
  const tables = getUserTables(db);
  return tables.map((table) => {
    const row = db.prepare(`select count(*) as count from ${table}`).get() as { count: number };
    return { table, count: row.count };
  });
}

async function cmdStatus(): Promise<void> {
  console.log(`DB Path: ${config.dbPath}`);
  console.log(`Exists: ${dbExists() ? 'yes' : 'no'}`);
  console.log(`Size: ${formatBytes(dbSizeBytes())}`);

  if (!dbExists()) return;

  const db = openDb(true);
  try {
    const tables = getUserTables(db);
    console.log(`Tables (${tables.length}): ${tables.join(', ') || '(none)'}`);
    console.table(getTableCounts(db));
  } finally {
    db.close();
  }
}

async function cmdTables(): Promise<void> {
  if (!dbExists()) {
    console.log('Database does not exist. Run migrate or reset first.');
    return;
  }

  const db = openDb(true);
  try {
    const tables = getUserTables(db);
    tables.forEach((name) => console.log(name));
  } finally {
    db.close();
  }
}

async function cmdCounts(): Promise<void> {
  if (!dbExists()) {
    console.log('Database does not exist. Run migrate or reset first.');
    return;
  }

  const db = openDb(true);
  try {
    console.table(getTableCounts(db));
  } finally {
    db.close();
  }
}

async function cmdSchema(args: string[]): Promise<void> {
  const table = args[0];
  if (!table) {
    throw new Error('Usage: schema <table>');
  }

  if (!dbExists()) {
    console.log('Database does not exist. Run migrate or reset first.');
    return;
  }

  const db = openDb(true);
  try {
    const columns = db.prepare(`pragma table_info(${table})`).all();
    const indexes = db.prepare(`pragma index_list(${table})`).all();
    const foreignKeys = db.prepare(`pragma foreign_key_list(${table})`).all();

    console.log(`Table: ${table}`);
    console.log('Columns:');
    console.table(columns);
    console.log('Indexes:');
    console.table(indexes);
    console.log('Foreign Keys:');
    console.table(foreignKeys);
  } finally {
    db.close();
  }
}

async function cmdView(args: string[]): Promise<void> {
  const table = args[0];
  const limitRaw = args[1] ?? '20';
  const limit = Number(limitRaw);

  if (!table) {
    throw new Error('Usage: view <table> [limit]');
  }
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isInteger(limit)) {
    throw new Error('Limit must be a positive integer.');
  }

  if (!dbExists()) {
    console.log('Database does not exist. Run migrate or reset first.');
    return;
  }

  const db = openDb(true);
  try {
    const rows = db.prepare(`select * from ${table} limit ${limit}`).all();
    console.table(rows);
  } finally {
    db.close();
  }
}

async function cmdQuery(args: string[]): Promise<void> {
  const sql = args.join(' ').trim();
  if (!sql) {
    throw new Error('Usage: query <sql>');
  }

  const db = openDb(!/^(create|drop|alter|vacuum|attach|detach|pragma\s+journal_mode)/i.test(sql));
  try {
    const isRead = /^(select|pragma|with|explain)/i.test(sql);
    const stmt = db.prepare(sql);
    if (isRead) {
      const rows = stmt.all();
      console.table(rows);
    } else {
      const result = stmt.run();
      console.log(result);
    }
  } finally {
    db.close();
  }
}

async function runMigrateAndSeed(runSeed: boolean): Promise<void> {
  const migrateModule = await import('../db/migrate.js');
  const seedModule = await import('../db/seed.js');
  const dbModule = await import('../db/database.js');

  migrateModule.runMigrations();
  if (runSeed) {
    seedModule.seedDefaults();
  }

  dbModule.db.close();
}

function removeDbFiles(): void {
  for (const suffix of DB_FILES) {
    const candidate = `${config.dbPath}${suffix}`;
    if (fs.existsSync(candidate)) {
      fs.unlinkSync(candidate);
      console.log(`Deleted: ${candidate}`);
    }
  }
}

async function cmdMigrate(): Promise<void> {
  await runMigrateAndSeed(false);
  console.log('Migrations completed.');
}

async function cmdSeed(): Promise<void> {
  await runMigrateAndSeed(true);
  console.log('Seed completed.');
}

async function cmdReset(args: string[]): Promise<void> {
  if (!args.includes('--yes')) {
    throw new Error('Refusing reset without --yes. Example: reset --yes');
  }

  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  removeDbFiles();
  await runMigrateAndSeed(true);
  console.log('Database reset completed.');
}

const commands: Record<string, CommandFn> = {
  help: async () => printHelp(),
  status: async () => cmdStatus(),
  tables: async () => cmdTables(),
  counts: async () => cmdCounts(),
  schema: async (args) => cmdSchema(args),
  view: async (args) => cmdView(args),
  query: async (args) => cmdQuery(args),
  migrate: async () => cmdMigrate(),
  seed: async () => cmdSeed(),
  reset: async (args) => cmdReset(args),
};

async function main(): Promise<void> {
  const [command = 'help', ...args] = process.argv.slice(2);
  const handler = commands[command];

  if (!handler) {
    throw new Error(`Unknown command: ${command}`);
  }

  await handler(args);
}

main().catch((error) => {
  console.error(`DB tool error: ${(error as Error).message}`);
  process.exit(1);
});
