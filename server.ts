import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const db = new Database("prison_management.sqlite");
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = -16000'); // 16MB cache
db.pragma('temp_store = MEMORY');
const JWT_SECRET = "super-secret-prison-key";
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

// Global Name Pools for Seeding
const ugandaFirstNames = [
    'Moses', 'Brian', 'Florence', 'Sarah', 'Joseph', 'Mary', 'Robert', 'Joy', 'David', 'Hope', 'Peter', 'Peace', 'James', 'Faith', 'Andrew', 'Grace', 'Emmanuel', 'Priscilla', 'Simon', 'Judith', 'Timothy', 'Dorothy', 'Samuel', 'Esther', 
    'John', 'Paul', 'Ruth', 'Naomi', 'Ibrahim', 'Isaac', 'Fatuma', 'Aisha', 'Hassan', 'Musa', 'Yasin', 'Sulaiman', 'Zainab', 'Khadija', 'Rashid', 'Umru', 'Sowali', 'Hamid', 'Stephen', 'Victor', 'Rose', 'Agnes', 'Charles', 'Patrick', 'Francis', 'George',
    'Arthur', 'Benjamin', 'Caleb', 'Daniel', 'Elijah', 'Felix', 'Gideon', 'Henry', 'Ivan', 'Joel', 'Kaleb', 'Luke', 'Matthew', 'Nathan', 'Oscar', 'Philip', 'Quentin', 'Richard', 'Silas', 'Thomas', 'Uri', 'Vincent', 'Walter', 'Xavier', 'Yoram', 'Zaitun'
];
const ugandaSurnames = [
    'Mukasa', 'Katumba', 'Namaste', 'Okello', 'Muwanga', 'Ssekitoleko', 'Nakitende', 'Lwanga', 'Kiggundu', 'Musoke', 'Nsubuga', 'Kiberu', 'Kizito', 'Mbabazi', 'Tumwesigye', 'Byaruhanga', 'Baguma', 'Kyebambe', 'Nambatya', 'Ssebunya', 'Lule', 'Kato', 'Wasswa', 'Mayanja', 'Ssemwogerere',
    'Mugerwa', 'Kato', 'Wasswa', 'Ssenyonjo', 'Lule', 'Ssemwanga', 'Kyeyune', 'Mubiru', 'Lubega', 'Nakamya', 'Namubiru', 'Naluwooza', 'Namatovu', 'Ssekandi', 'Mugisha', 'Atwiine', 'Tumusiime', 'Busingye', 'Kyomugisha', 'Ninsiima', 'Mwesigye', 'Byaruhanga', 'Twinomugisha', 'Baguma', 'Kansiime', 'Arinda', 'Kabasinguzi', 'Okello', 'Owaraga', 'Anywar', 'Odoch', 'Akello', 'Auma', 'Adong', 'Apio', 'Odongo', 'Otim', 'Okot', 'Ojok', 'Lanyero', 'Alur', 'Lugoba', 'Nsubuga', 'Kibuuka', 'Mulema', 'Wandera', 'Ochieng', 'Bukenya', 'Kaggwa',
    'Bwanika', 'Kigozi', 'Kasirye', 'Musisi', 'Mutebi', 'Nanyonga', 'Namwanje', 'Nansubuga', 'Kavuma', 'Nambi', 'Namagembe', 'Akol', 'Ariet', 'Ikoit', 'Okurut', 'Omoit', 'Engola', 'Ayebare', 'Tumwesigye', 'Mwijukye'
];
const middleInitial = ['A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'H.', 'I.', 'J.', 'K.', 'L.', 'M.', 'N.', 'O.', 'P.', 'Q.', 'R.', 'S.', 'T.', 'U.', 'V.', 'W.', 'X.', 'Y.', 'Z.'];

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    full_name TEXT,
    email TEXT
  );

  CREATE TABLE IF NOT EXISTS inmates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inmate_number TEXT UNIQUE,
    full_name TEXT UNIQUE,
    crime TEXT,
    sentence_start TEXT,
    sentence_end TEXT,
    cell_id INTEGER,
    status TEXT DEFAULT 'active',
    risk_level TEXT,
    biometrics JSON,
    mugshot_url TEXT,
    gang_affiliation TEXT,
    behavioral_history TEXT,
    parole_status TEXT,
    residence TEXT,
    apprehending_station TEXT,
    arresting_officers TEXT,
    district_of_arrest TEXT,
    former_criminal_history TEXT,
    marital_status TEXT,
    family_members TEXT,
    sentencing_court TEXT,
    sentencing_judge TEXT,
    deleted_at TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_number TEXT UNIQUE,
    full_name TEXT,
    role TEXT,
    shift TEXT,
    contact TEXT,
    status TEXT DEFAULT 'active',
    termination_reason TEXT DEFAULT NULL,
    deleted_at TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS cells (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cell_number TEXT UNIQUE,
    capacity INTEGER,
    current_occupancy INTEGER DEFAULT 0,
    unit TEXT,
    status TEXT DEFAULT 'open',
    deleted_at TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS visitors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inmate_id INTEGER,
    visitor_name TEXT,
    relation TEXT,
    visit_date TEXT,
    status TEXT DEFAULT 'scheduled',
    deleted_at TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT,
    description TEXT,
    inmates_involved JSON,
    staff_involved JSON,
    date TEXT,
    severity TEXT,
    deleted_at TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS counseling_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inmate_id INTEGER,
    counsellor_id INTEGER,
    session_date TEXT,
    session_type TEXT, -- 'physical' or 'virtual'
    location_or_link TEXT,
    topic TEXT,
    notes TEXT,
    status TEXT DEFAULT 'scheduled',
    deleted_at TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS medical_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inmate_id INTEGER,
    condition TEXT,
    treatment TEXT,
    date TEXT,
    doctor_id INTEGER,
    deleted_at TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS court_hearings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inmate_id INTEGER,
    case_number TEXT,
    hearing_date TEXT,
    hearing_type TEXT, -- 'physical' or 'virtual'
    location_or_link TEXT,
    status TEXT DEFAULT 'pending',
    deleted_at TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    sender_name TEXT,
    content TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    action TEXT,
    resource TEXT,
    resource_id INTEGER,
    details TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    message TEXT,
    type TEXT,
    is_read INTEGER DEFAULT 0,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ai_risk_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inmate_id INTEGER,
    assessment_details TEXT,
    recommended_actions TEXT,
    risk_level TEXT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_inmates_number ON inmates(inmate_number, full_name) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_inmates_full_name ON inmates(full_name, inmate_number) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_inmates_cell_id ON inmates(cell_id) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_incidents_date ON incidents(date) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_staff_full_name ON staff(full_name) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_visitors_date ON visitors(visit_date) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_counseling_date ON counseling_sessions(session_date) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_court_date ON court_hearings(hearing_date) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(is_read, timestamp);
`);

// Migration: Ensure full_name is UNIQUE in inmates
try {
  // Check for duplicates first and fix them to avoid index creation failure
  const duplicates = db.prepare(`
    SELECT full_name, COUNT(*) as count 
    FROM inmates 
    GROUP BY full_name 
    HAVING count > 1
  `).all() as any[];

  if (duplicates.length > 0) {
    console.log(`Cleaning up ${duplicates.length} duplicate inmate names before enforcing uniqueness...`);
    for (const dup of duplicates) {
      const records = db.prepare(`SELECT id, inmate_number FROM inmates WHERE full_name = ?`).all(dup.full_name) as any[];
      // Keep the first one, rename the others
      for (let i = 1; i < records.length; i++) {
        const newName = `${dup.full_name} (${records[i].inmate_number})`;
        db.prepare(`UPDATE inmates SET full_name = ? WHERE id = ?`).run(newName, records[i].id);
      }
    }
  }

  // Add unique index if table already existed without UNIQUE constraint
  db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inmates_full_name ON inmates(full_name)`).run();
  console.log(`Ensured unique full_name index on inmates`);
} catch (e) {
  console.error(`Migration error for unique full_name index:`, e);
}

// Migration: Ensure termination_reason exists in staff
try {
  const columns = db.prepare(`PRAGMA table_info(staff)`).all() as any[];
  if (!columns.some(c => c.name === 'termination_reason')) {
    db.prepare(`ALTER TABLE staff ADD COLUMN termination_reason TEXT DEFAULT NULL`).run();
    console.log(`Migrated staff: added termination_reason column`);
  }
} catch (e) {
  console.error(`Migration error for staff.termination_reason:`, e);
}

// Migration: Ensure all profiling columns exist
const inmateColumns = [
  'mugshot_url', 'gang_affiliation', 'behavioral_history', 'parole_status', 'biometrics',
  'residence', 'apprehending_station', 'arresting_officers', 'district_of_arrest',
  'former_criminal_history', 'marital_status', 'family_members', 'sentencing_court', 'sentencing_judge'
];
inmateColumns.forEach(col => {
  try {
    const columns = db.prepare(`PRAGMA table_info(inmates)`).all() as any[];
    if (!columns.some(c => c.name === col)) {
      db.prepare(`ALTER TABLE inmates ADD COLUMN ${col} TEXT DEFAULT NULL`).run();
      console.log(`Migrated inmates: added ${col} column`);
    }
  } catch (e) {
    console.error(`Migration error for inmates.${col}:`, e);
  }
});

// Migration: Ensure counseling_sessions has location_or_link
try {
  const columns = db.prepare(`PRAGMA table_info(counseling_sessions)`).all() as any[];
  if (!columns.some(c => c.name === 'location_or_link')) {
    db.prepare(`ALTER TABLE counseling_sessions ADD COLUMN location_or_link TEXT DEFAULT NULL`).run();
    console.log(`Migrated counseling_sessions: added location_or_link column`);
  }
} catch (e) {
  console.error(`Migration error for counseling_sessions.location_or_link:`, e);
}

// Migration: Ensure deleted_at column exists in all relevant tables
const tablesToMigrate = ['inmates', 'staff', 'cells', 'visitors', 'incidents', 'medical_records', 'court_hearings', 'counseling_sessions'];
tablesToMigrate.forEach(table => {
  try {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
    const hasDeletedAt = columns.some(col => col.name === 'deleted_at');
    if (!hasDeletedAt) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT DEFAULT NULL`).run();
      console.log(`Migrated ${table}: added deleted_at column`);
    }
  } catch (e) {
    console.error(`Migration error for ${table}:`, e);
  }
});

// --- Seed Data Helper ---
const seedData = () => {
    try {
        // Staff first so we have IDs for other tables
        const existingStaff = db.prepare("SELECT COUNT(*) as count FROM staff").get() as any;
        if (existingStaff && existingStaff.count < 6) {
            const staff = [
                ['STF-001', 'Captain Sarah Miller', 'Security Chief', '06:00 - 14:00', '+256-772-0001'],
                ['STF-002', 'Dr. Aris Thorne', 'Medical Officer', '08:00 - 16:00', '+256-772-0002'],
                ['STF-003', 'Officer Kevin Hart', 'Patrol Officer', '14:00 - 22:00', '+256-772-0003'],
                ['STF-004', 'Counsellor Alice Nambi', 'Counsellor', '09:00 - 17:00', '+256-772-0004'],
                ['STF-005', 'Counsellor Robert Okello', 'Counsellor', '09:00 - 17:00', '+256-772-0005'],
                ['STF-006', 'Intelligence Analyst', 'Intelligence', 'Flexible', '+256-772-0006'],
            ];
            const stmt = db.prepare("INSERT OR IGNORE INTO staff (staff_number, full_name, role, shift, contact) VALUES (?, ?, ?, ?, ?)");
            staff.forEach(row => stmt.run(...row));
            console.log("Seeded Staff");
        }

        // Inmates
        const existingInmates = db.prepare("SELECT COUNT(*) as count FROM inmates").get() as any;
        if (existingInmates && existingInmates.count < 300) {
            const crimes = ['Armed Robbery', 'Cyber Espionage', 'Financial Fraud', 'Theft', 'Assault', 'Burglary', 'Narcotics', 'Defilement', 'Manslaughter', 'Treason'];
            const risks = ['Low', 'Medium', 'High'];

            const stmt = db.prepare("INSERT OR IGNORE INTO inmates (inmate_number, full_name, crime, sentence_start, sentence_end, cell_id, risk_level, residence, district_of_arrest, marital_status, former_criminal_history, family_members) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            
            for (let i = 0; i < 300; i++) {
                const fname = ugandaFirstNames[i % ugandaFirstNames.length];
                const sname = ugandaSurnames[(i * 2) % ugandaSurnames.length];
                const mid = middleInitial[i % middleInitial.length];
                const fullName = `${fname} ${mid} ${sname}`;
                const num = `PMS-${1000 + i}`;
                const crime = crimes[Math.floor(Math.random() * crimes.length)];
                const risk = risks[Math.floor(Math.random() * risks.length)];
                const start = '2024-01-01';
                const end = '2030-01-01';
                const districts = ['Kampala', 'Wakiso', 'Mbarara', 'Gulu', 'Jinja', 'Entebbe'];
                const district = districts[Math.floor(Math.random() * districts.length)];
                const mStatus = ['Single', 'Married', 'Divorced'][Math.floor(Math.random() * 3)];
                const history = Math.random() > 0.7 ? 'Prior conviction for minor theft (2021).' : 'NONE';
                stmt.run(num, fullName, crime, start, end, Math.floor(Math.random() * 8) + 1, risk, `${district} District`, district, mStatus, history, 'Next of kin record synced.');
            }
            console.log("Seeded 300 unique Ugandan Inmates");
        }

        // Get actual IDs for relationships
        const allInmates = db.prepare("SELECT id FROM inmates LIMIT 300").all() as any[];
        const counsellorIds = db.prepare("SELECT id FROM staff WHERE role = 'Counsellor'").all() as any[];
        const docIds = db.prepare("SELECT id FROM staff WHERE role = 'Medical Officer'").all() as any[];

        if (allInmates.length > 0) {
            // Visitors
            const existingVisitors = db.prepare("SELECT COUNT(*) as count FROM visitors").get() as any;
            if (existingVisitors && existingVisitors.count < 29) {
                const relations = ['Mother', 'Father', 'Spouse', 'Sibling', 'Legal Representative', 'Friend'];
                const stmt = db.prepare("INSERT INTO visitors (inmate_id, visitor_name, relation, visit_date, status) VALUES (?, ?, ?, ?, ?)");
                for (let i = 0; i < 29; i++) {
                    const inmate = allInmates[i % allInmates.length];
                    const fname = ugandaFirstNames[Math.floor(Math.random() * ugandaFirstNames.length)];
                    const sname = ugandaSurnames[Math.floor(Math.random() * ugandaSurnames.length)];
                    const fullName = `${fname} ${sname}`;
                    const relation = relations[Math.floor(Math.random() * relations.length)];
                    stmt.run(inmate.id, fullName, relation, new Date(Date.now() - Math.random() * 500000000).toISOString(), 'completed');
                }
                console.log("Seeded 29 Ugandan Visitors");
            }

            // Counseling Sessions
            const existingSessions = db.prepare("SELECT COUNT(*) as count FROM counseling_sessions").get() as any;
            if (existingSessions && existingSessions.count < 40 && counsellorIds.length > 0) {
                const topics = ['Anger Management', 'Rehabilitation', 'Mental Health Support', 'Grief Counseling', 'Conflict Resolution', 'Trauma Recovery', 'Substance Abuse Recovery'];
                const stmt = db.prepare("INSERT INTO counseling_sessions (inmate_id, counsellor_id, session_date, session_type, location_or_link, topic, status) VALUES (?, ?, ?, ?, ?, ?, ?)");
                for (let i = 0; i < 40; i++) {
                    const inmate = allInmates[i % allInmates.length];
                    const counsellor = counsellorIds[i % counsellorIds.length];
                    const type = Math.random() > 0.5 ? 'physical' : 'virtual';
                    const status = Math.random() > 0.3 ? 'completed' : 'scheduled';
                    const link = type === 'virtual' ? `https://meet.google.com/pms-${Math.random().toString(36).substring(7)}` : 'Archive Room';
                    stmt.run(inmate.id, counsellor.id, new Date(Date.now() + (Math.random() * 2000000000 - 1000000000)).toISOString(), type, link, topics[i % topics.length], status);
                }
                console.log("Seeded 40 Counseling Sessions");
            }

            // Medical Records
            const existingMedical = db.prepare("SELECT COUNT(*) as count FROM medical_records").get() as any;
            if (existingMedical && existingMedical.count < 20 && docIds.length > 0) {
                const conditions = ['Hypertension', 'Malaria', 'Respiratory Infection', 'Skin Rash', 'Compound Fracture', 'Psychotic Episode', 'Chronic Back Pain'];
                const treatments = ['Administered prescribed medication', 'Fluid replacement therapy', 'Isolation and observation', 'Topical ointment applied', 'Referral to external hospital', 'Psychiatric evaluation conducted', 'Physical therapy session'];
                const stmt = db.prepare("INSERT INTO medical_records (inmate_id, condition, treatment, date, doctor_id) VALUES (?, ?, ?, ?, ?)");
                for (let i = 0; i < 20; i++) {
                    const inmate = allInmates[i % allInmates.length];
                    const doc = docIds[i % docIds.length];
                    stmt.run(inmate.id, conditions[i % conditions.length], treatments[i % treatments.length], new Date(Date.now() - Math.random() * 5000000000).toISOString(), doc.id);
                }
                console.log("Seeded 20 Medical Records");
            }

            // Court Hearings
            const existingCourt = db.prepare("SELECT COUNT(*) as count FROM court_hearings").get() as any;
            if (existingCourt && existingCourt.count < 100) {
                const hTypes = ['physical', 'virtual'];
                const courtNames = [
                    'High Court of Uganda - Criminal Division',
                    'Buganda Road Magistrate Court',
                    'Makindye Magistrate Court',
                    'Nakawa Chief Magistrates Court',
                    'Anti-Corruption Court - Kololo'
                ];
                const stmt = db.prepare("INSERT INTO court_hearings (inmate_id, case_number, hearing_date, hearing_type, location_or_link, status) VALUES (?, ?, ?, ?, ?, ?)");
                
                // Add specific high-visibility hearings for the user
                const highVisibilityHearings = [
                    { type: 'virtual', case: 'UG-CRIM-VIRT-2026-001', link: 'https://meet.google.com/sentinel-main-court-001' },
                    { type: 'virtual', case: 'UG-CRIM-VIRT-2026-002', link: 'https://meet.google.com/sentinel-branch-court-002' },
                    { type: 'physical', case: 'UG-CRIM-PHYS-2026-001', loc: 'Kampala High Court, Chamber 12' },
                    { type: 'physical', case: 'UG-CRIM-PHYS-2026-002', loc: 'Supreme Court, Annex B' }
                ];

                highVisibilityHearings.forEach((h, idx) => {
                    const inmate = allInmates[idx % allInmates.length];
                    const futureDate = new Date();
                    futureDate.setDate(futureDate.getDate() + 1 + idx);
                    futureDate.setHours(10, 0, 0, 0);
                    stmt.run(inmate.id, h.case, futureDate.toISOString(), h.type, h.type === 'virtual' ? h.link : h.loc, 'pending');
                });

                // Add more variety
                for (let i = 0; i < 46; i++) {
                    const inmate = allInmates[(i + 4) % allInmates.length];
                    const hType = hTypes[i % 2];
                    const court = courtNames[Math.floor(Math.random() * courtNames.length)];
                    const loc = hType === 'physical' ? `${court}, Room #${Math.floor(Math.random() * 5) + 1}` : `https://meet.google.com/pms-${Math.random().toString(36).substring(7)}-${Math.random().toString(36).substring(3)}`;
                    const futureDate = new Date();
                    futureDate.setDate(futureDate.getDate() + Math.floor(Math.random() * 30));
                    futureDate.setHours(9 + Math.floor(Math.random() * 8), 0, 0, 0);
                    
                    stmt.run(inmate.id, `UG-CASE-${202400 + i + existingCourt.count}`, futureDate.toISOString(), hType, loc, 'pending');
                }

                // Add past ones
                for (let i = 50; i < 70; i++) {
                    const inmate = allInmates[i % allInmates.length];
                    const hType = hTypes[Math.random() > 0.5 ? 0 : 1];
                    const court = courtNames[Math.floor(Math.random() * courtNames.length)];
                    const loc = hType === 'physical' ? `${court}, Room #${Math.floor(Math.random() * 5) + 1}` : `https://meet.google.com/court-${Math.random().toString(36).substring(7)}`;
                    const pastDate = new Date();
                    pastDate.setDate(pastDate.getDate() - Math.floor(Math.random() * 60));
                    
                    stmt.run(inmate.id, `UG-ARCHIVE-${202300 + i}`, pastDate.toISOString(), hType, loc, 'completed');
                }
                console.log("Seeded 100+ Court Hearings");
            }
        }

        // Cells
        const existingCells = db.prepare("SELECT COUNT(*) as count FROM cells").get() as any;
        if (existingCells && existingCells.count < 8) {
            const cells = [
                ['A-101', 4, 1, 'Block A'],
                ['A-102', 4, 2, 'Block A'],
                ['B-201', 2, 1, 'Block B'],
                ['C-301', 10, 5, 'Block C'],
                ['D-401', 1, 0, 'Solitary'],
                ['A-201', 4, 0, 'Block A'],
                ['B-101', 4, 0, 'Block B'],
                ['C-101', 8, 0, 'Block C'],
            ];
            const stmt = db.prepare("INSERT OR IGNORE INTO cells (cell_number, capacity, current_occupancy, unit) VALUES (?, ?, ?, ?)");
            cells.forEach(row => stmt.run(...row));
            console.log("Seeded Cells");
        }

        // --- MASSIVE HISTORY SEEDING ENGINE ---
        const seedHistory = () => {
            const ugandaSurnames = [
                'Mukasa', 'Katumba', 'Namaste', 'Okello', 'Muwanga', 'Ssekitoleko', 'Nakitende', 'Lwanga', 'Kiggundu', 'Musoke', 
                'Nsubuga', 'Kiberu', 'Kizito', 'Mbabazi', 'Tumwesigye', 'Byaruhanga', 'Baguma', 'Kyebambe', 'Nambatya', 'Ssebunya',
                'Kato', 'Wasswa', 'Baryamureeba', 'Besigye', 'Muntu', 'Kyagulanyi', 'Mayanja', 'Chameleone', 'Kenzo', 'Bebe',
                'Zari', 'Nabatanzi', 'Nantaba', 'Kamya', 'Anite', 'Amongine', 'Tayebwa', 'Kibalama', 'Bobi', 'Wine'
            ];
            const ugandaFirstNames = [
                'Moses', 'Brian', 'Florence', 'Sarah', 'Joseph', 'Mary', 'Robert', 'Joy', 'David', 'Hope', 
                'Peter', 'Peace', 'James', 'Faith', 'Andrew', 'Grace', 'Emmanuel', 'Priscilla', 'Simon', 'Judith',
                'Aggrey', 'Alice', 'Arthur', 'Beatrice', 'Charles', 'Doreen', 'Edward', 'Ester', 'Francis', 'Goretti',
                'Henry', 'Immaculate', 'John', 'Juliet', 'Kenneth', 'Lillian', 'Michael', 'Noeline', 'Oscar', 'Rose'
            ];
            
            // 1. Former Staff (Target: 2000)
            const staffCountResult = db.prepare("SELECT COUNT(*) as count FROM staff WHERE deleted_at IS NOT NULL").get() as any;
            const staffTarget = 2000;
            if (staffCountResult.count < staffTarget) {
                const remaining = staffTarget - staffCountResult.count;
                console.log(`Seeding ${remaining} Historical Staff Records...`);
                const stmt = db.prepare("INSERT OR IGNORE INTO staff (staff_number, full_name, role, shift, contact, status, termination_reason, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
                const roles = ['Security Officer', 'Guard', 'Warden', 'Counsellor', 'Medical Nurse', 'Clerk', 'Logistics Analyst', 'Internal Auditor'];
                const statuses = ['Resigned', 'Laid Off', 'Deceased', 'Retired'];
                const reasons = {
                  'Resigned': ['Voluntary departure for career growth', 'Personal family reasons', 'Relocation to another district'],
                  'Laid Off': ['Structural reorganization', 'Budgetary constraints', 'Reduced staffing requirements'],
                  'Deceased': ['Natural causes', 'Medical illness', 'Accidental circumstances'],
                  'Retired': ['Reached mandatory retirement age', 'Years of service completion']
                };
                
                const transaction = db.transaction((startIndex, count) => {
                    for (let i = 0; i < count; i++) {
                        const globalIndex = startIndex + i;
                        const fname = ugandaFirstNames[globalIndex % ugandaFirstNames.length];
                        const sname = ugandaSurnames[(globalIndex + 5) % ugandaSurnames.length];
                        const role = roles[globalIndex % roles.length];
                        const status = statuses[globalIndex % statuses.length];
                        const reasonList = reasons[status as keyof typeof reasons] || ['Not specified'];
                        const reason = reasonList[globalIndex % reasonList.length];

                        const deletedAt = new Date(Date.now() - (Math.random() * 94608000000)).toISOString(); // Past 3 years
                        stmt.run(
                            `HIST-STF-${2000 + globalIndex}`, 
                            `${fname} ${sname}`, 
                            role, 
                            'Former Staff', 
                            '+256-000-0000', 
                            status, 
                            reason,
                            deletedAt
                        );
                    }
                });
                transaction(staffCountResult.count, remaining);
            }

            // 2. Visitors (100)
            const visitorCount = db.prepare("SELECT COUNT(*) as count FROM visitors").get() as any;
            if (visitorCount.count < 100) {
                console.log("Seeding 100 Historical Visitors...");
                const stmt = db.prepare("INSERT INTO visitors (inmate_id, visitor_name, relation, visit_date, status) VALUES (?, ?, ?, ?, ?)");
                const inmates = db.prepare("SELECT id FROM inmates LIMIT 20").all() as any[];
                if (inmates.length > 0) {
                    const relations = ['Mother', 'Father', 'Spouse', 'Sibling', 'Legal Rep', 'Friend'];
                    const transaction = db.transaction((count) => {
                        for (let i = 0; i < count; i++) {
                            const inmateId = inmates[Math.floor(Math.random() * inmates.length)].id;
                            const fname = ugandaFirstNames[Math.floor(Math.random() * ugandaFirstNames.length)];
                            const sname = ugandaSurnames[Math.floor(Math.random() * ugandaSurnames.length)];
                            const relation = relations[Math.floor(Math.random() * relations.length)];
                            const date = new Date(Date.now() - Math.random() * 50000000000).toISOString();
                            stmt.run(inmateId, `${fname} ${sname}`, relation, date, 'completed');
                        }
                    });
                    transaction(100 - visitorCount.count);
                }
            }

            // 3. Court Hearings (200)
            const courtCount = db.prepare("SELECT COUNT(*) as count FROM court_hearings").get() as any;
            if (courtCount.count < 200) {
                console.log("Seeding 200 Historical Court Hearings...");
                const stmt = db.prepare("INSERT INTO court_hearings (inmate_id, case_number, hearing_date, hearing_type, location_or_link, status) VALUES (?, ?, ?, ?, ?, ?)");
                const inmates = db.prepare("SELECT id FROM inmates LIMIT 20").all() as any[];
                if (inmates.length > 0) {
                    const transaction = db.transaction((count) => {
                        for (let i = 0; i < count; i++) {
                            const inmateId = inmates[Math.floor(Math.random() * inmates.length)].id;
                            const type = Math.random() > 0.5 ? 'physical' : 'virtual';
                            const link = type === 'virtual' ? `https://meet.google.com/court-archive-${Math.random().toString(36).substring(7)}` : `High Court Archive Box ${Math.floor(Math.random() * 500)}`;
                            const date = new Date(Date.now() - Math.random() * 80000000000).toISOString();
                            stmt.run(inmateId, `UG-ARCH-${100000 + i}`, date, type, link, 'concluded');
                        }
                    });
                    transaction(200 - courtCount.count);
                }
            }

            // 4. Incidents (200)
            const incidentCount = db.prepare("SELECT COUNT(*) as count FROM incidents").get() as any;
            if (incidentCount.count < 200) {
                console.log("Seeding 200 Historical Incidents...");
                const stmt = db.prepare("INSERT INTO incidents (type, description, severity, date) VALUES (?, ?, ?, ?)");
                const transaction = db.transaction((count) => {
                    const types = ['Fight', 'Contraband', 'Noise', 'Theft', 'Misconduct'];
                    const severities = ['Low', 'Medium', 'High'];
                    for (let i = 0; i < count; i++) {
                        const type = types[Math.floor(Math.random() * types.length)];
                        const sev = severities[Math.floor(Math.random() * severities.length)];
                        const date = new Date(Date.now() - Math.random() * 100000000000).toISOString();
                        stmt.run(type, `Historical archive record item #${i}`, sev, date);
                    }
                });
                transaction(200 - incidentCount.count);
            }

            // 5. Counseling Sessions (200)
            const sessionCount = db.prepare("SELECT COUNT(*) as count FROM counseling_sessions").get() as any;
            if (sessionCount.count < 200) {
                console.log("Seeding 200 Historical Counseling Sessions...");
                const stmt = db.prepare("INSERT INTO counseling_sessions (inmate_id, counsellor_id, session_date, session_type, location_or_link, topic, status) VALUES (?, ?, ?, ?, ?, ?, ?)");
                const inmates = db.prepare("SELECT id FROM inmates LIMIT 20").all() as any[];
                const counsellors = db.prepare("SELECT id FROM staff WHERE role LIKE '%Counsellor%'").all() as any[];
                if (inmates.length > 0 && counsellors.length > 0) {
                    const transaction = db.transaction((count) => {
                        const topics = ['Rehab', 'Anger', 'Crisis', 'Grief', 'Behavioral'];
                        for (let i = 0; i < count; i++) {
                            const inmateId = inmates[Math.floor(Math.random() * inmates.length)].id;
                            const counsellorId = counsellors[Math.floor(Math.random() * counsellors.length)].id;
                            const type = Math.random() > 0.5 ? 'physical' : 'virtual';
                            const link = type === 'virtual' ? `https://meet.google.com/pms-archive-${Math.random().toString(36).substring(7)}` : 'Archive Room';
                            const date = new Date(Date.now() - Math.random() * 100000000000).toISOString();
                            stmt.run(inmateId, counsellorId, date, type, link, topics[Math.floor(Math.random() * topics.length)], 'completed');
                        }
                    });
                    transaction(200 - sessionCount.count);
                }
            }

            // 6. Former Inmates (History Records) (Target: 40,000)
            const historicalInmateCount = db.prepare("SELECT COUNT(*) as count FROM inmates WHERE deleted_at IS NOT NULL").get() as any;
            const targetCount = 40000;
            if (historicalInmateCount.count < targetCount) {
                console.log(`MASSIVE SEED RE-INITIALIZATION: Synchronizing ${targetCount} Records to Historical Buffer...`);
                
                // Clear existing historical inmates to ensure consistency and profiling
                db.prepare("DELETE FROM inmates WHERE deleted_at IS NOT NULL").run();

                const stmt = db.prepare(`
                    INSERT INTO inmates (inmate_number, full_name, crime, sentence_start, sentence_end, status, deleted_at) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                
                const crimes = ['Armed Robbery', 'Cyber Espionage', 'Financial Fraud', 'Aggravated Assault', 'Narcotics Trafficking', 'Treason', 'Incitement to Violence', 'Industrial Theft', 'Manslaughter', 'Illegal Possession'];
                const statuses = ['Released', 'Released', 'Released', 'Deceased', 'Transferred', 'Released', 'Released'];
                
                const batchSize = 10000;
                const totalBatches = Math.ceil(targetCount / batchSize);
                
                const runner = db.transaction((startIndex, count) => {
                    for (let i = 0; i < count; i++) {
                        const globalIndex = startIndex + i;
                        
                        // Pick names from expanded pools
                        const fIndex = globalIndex % ugandaFirstNames.length;
                        const sIndex = Math.floor(globalIndex / ugandaFirstNames.length) % ugandaSurnames.length;
                        const mIndex = Math.floor(globalIndex / (ugandaFirstNames.length * ugandaSurnames.length)) % middleInitial.length;
                        const extraCycle = Math.floor(globalIndex / (ugandaFirstNames.length * ugandaSurnames.length * middleInitial.length));

                        const fname = ugandaFirstNames[fIndex];
                        const sname = ugandaSurnames[sIndex];
                        const mid = middleInitial[mIndex];
                        
                        // Construct a unique full name
                        let fullName = `${fname} ${mid} ${sname}`;
                        if (extraCycle > 0) {
                            fullName += ` ${extraCycle + 1}`;
                        }
                        
                        const crime = crimes[globalIndex % crimes.length];
                        const status = statuses[globalIndex % statuses.length];
                        const start = new Date(Date.now() - (Math.random() * 315360000000)).toISOString().split('T')[0];
                        const end = new Date(new Date(start).getTime() + (Math.random() * 315360000000)).toISOString().split('T')[0];
                        const deletedAt = new Date(Date.now() - (Math.random() * 94608000000)).toISOString();
                        
                        stmt.run(
                            `HIST-INM-${100000 + globalIndex}`, 
                            fullName, 
                            crime,
                            start,
                            end,
                            status,
                            deletedAt
                        );
                    }
                });

                for (let b = 0; b < totalBatches; b++) {
                    const count = Math.min(batchSize, targetCount - (b * batchSize));
                    console.log(`Processing Batch ${b + 1}/${totalBatches}...`);
                    runner(b * batchSize, count);
                }
                console.log(`SUCCESS: ${targetCount} Historical Inmates Persistent.`);
            }
            console.log("Historical Inmate Archive Ready.");
        };

        seedHistory();

    } catch (e) {
        console.error("Critical seeding error:", e);
    }
};
// Roles Seed based on Documentation
const staffRoles = [
    { role: 'admin', username: 'admin', name: 'System Administrator', email: 'admin@sentinel.pms' },
    { role: 'officer', username: 'officer', name: 'Senior Prison Officer', email: 'officer@sentinel.pms' },
    { role: 'medical', username: 'medical', name: 'Chief Medical Officer', email: 'medical@sentinel.pms' },
    { role: 'legal', username: 'legal', name: 'Legal Counsel', email: 'legal@sentinel.pms' },
    { role: 'intelligence', username: 'intel', name: 'Intelligence Analyst', email: 'intel@sentinel.pms' },
    { role: 'rehab', username: 'rehab', name: 'Rehabilitation Specialist', email: 'rehab@sentinel.pms' }
];

staffRoles.forEach(userProfile => {
    const exists = db.prepare("SELECT * FROM users WHERE username = ?").get(userProfile.username);
    if (!exists) {
        const password = bcrypt.hashSync(`${userProfile.username}123`, 10);
        db.prepare("INSERT INTO users (username, password, role, full_name, email) VALUES (?, ?, ?, ?, ?)")
          .run(userProfile.username, password, userProfile.role, userProfile.name, userProfile.email);
        console.log(`Seeded user: ${userProfile.username} (Role: ${userProfile.role})`);
    }
});

// --- Notification Log Helper ---
const notify = (title: string, message: string, type: string = 'info') => {
    db.prepare(`
        INSERT INTO notifications (title, message, type)
        VALUES (?, ?, ?)
    `).run(title, message, type);
};

// --- Audit Log Helper ---
const logAction = (user: any, action: string, resource: string, resourceId: number | null, details: string) => {
    db.prepare(`
        INSERT INTO audit_logs (user_id, username, action, resource, resource_id, details)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(user.id, user.username, action, resource, resourceId, details);

    // Also trigger a notification for the activity
    notify(`Activity Detect: ${action}`, `${user.username} performed ${action} on ${resource}`);
};

async function startServer() {
  // Execute seeding inside startServer
  seedData();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(cors());
  app.use(express.json());

  // --- Auth Middleware ---
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.sendStatus(403);
      req.user = user;
      next();
    });
  };

  // --- API Routes ---

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    // Allow login by username OR email
    const user = db.prepare("SELECT * FROM users WHERE username = ? OR email = ?").get(username, username) as any;
    
    if (user && bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET);
      logAction({ id: user.id, username: user.username }, 'LOGIN', 'auth', user.id, 'User logged into system');
      res.json({ token, user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name } });
    } else {
      res.status(401).json({ error: "Invalid credentials" });
    }
  });

  // Inmates
  app.get("/api/inmates", authenticateToken, (req: any, res: any) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : '%';
    const cellId = req.query.cell_id;

    let query = `
      SELECT * FROM inmates 
      WHERE deleted_at IS NULL 
      AND (full_name LIKE ? OR inmate_number LIKE ?)
    `;
    let countQuery = "SELECT COUNT(*) as count FROM inmates WHERE deleted_at IS NULL AND (full_name LIKE ? OR inmate_number LIKE ?)";
    let params: any[] = [search, search];

    if (cellId) {
      query += " AND cell_id = ?";
      countQuery += " AND cell_id = ?";
      params.push(cellId);
    }

    query += " ORDER BY full_name ASC LIMIT ? OFFSET ?";
    
    const inmates = db.prepare(query).all(...params, limit, offset);
    const total = db.prepare(countQuery).get(...params) as any;

    res.json({
      data: inmates,
      pagination: {
        total: total.count,
        page,
        limit,
        totalPages: Math.ceil(total.count / limit)
      }
    });
  });

  app.post("/api/inmates", authenticateToken, (req: any, res: any) => {
    const { 
      inmate_number, full_name, crime, sentence_start, sentence_end, 
      cell_id, risk_level, mugshot_url, gang_affiliation, behavioral_history, parole_status,
      residence, apprehending_station, arresting_officers, district_of_arrest,
      former_criminal_history, marital_status, family_members, sentencing_court, sentencing_judge
    } = req.body;

    try {
      // Check for unique name
      const existing = db.prepare("SELECT id FROM inmates WHERE full_name = ?").get(full_name);
      if (existing) {
        return res.status(400).json({ error: `An inmate with the name '${full_name}' is already registered in the system.` });
      }

      const result = db.prepare(`
        INSERT INTO inmates (
          inmate_number, full_name, crime, sentence_start, sentence_end, 
          cell_id, risk_level, mugshot_url, gang_affiliation, behavioral_history, parole_status,
          residence, apprehending_station, arresting_officers, district_of_arrest,
          former_criminal_history, marital_status, family_members, sentencing_court, sentencing_judge
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        inmate_number, full_name, crime, sentence_start, sentence_end, 
        cell_id, risk_level, mugshot_url, gang_affiliation, behavioral_history, parole_status,
        residence, apprehending_station, arresting_officers, district_of_arrest,
        former_criminal_history, marital_status, family_members, sentencing_court, sentencing_judge
      );
      logAction(req.user, 'CREATE', 'inmate', Number(result.lastInsertRowid), `Registered inmate ${full_name}`);
      res.json({ id: Number(result.lastInsertRowid) });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get("/api/inmates/:id", authenticateToken, (req: any, res: any) => {
    const inmate = db.prepare(`
      SELECT i.*, c.cell_number, c.unit, c.status as cell_status 
      FROM inmates i 
      LEFT JOIN cells c ON i.cell_id = c.id 
      WHERE i.id = ? AND i.deleted_at IS NULL
    `).get(req.params.id) as any;
    if (!inmate) return res.status(404).json({ error: "Inmate not found" });
    res.json(inmate);
  });

  app.patch("/api/inmates/:id", authenticateToken, (req: any, res: any) => {
    const fields = Object.keys(req.body);
    if (fields.length === 0) return res.status(400).json({ error: "No fields provided" });

    const setClause = fields.map(field => `${field} = ?`).join(', ');
    const values = [...Object.values(req.body), req.params.id];

    try {
      db.prepare(`UPDATE inmates SET ${setClause} WHERE id = ?`).run(...values);
      logAction(req.user, 'UPDATE', 'inmate', parseInt(req.params.id), `Updated fields: ${fields.join(', ')}`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete("/api/inmates/:id", authenticateToken, (req: any, res: any) => {
    db.prepare("UPDATE inmates SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), req.params.id);
    logAction(req.user, 'SOFT_DELETE', 'inmate', parseInt(req.params.id), 'Moved inmate to recycle bin');
    res.json({ success: true });
  });

  // Visitors
  app.get("/api/visitors", authenticateToken, (req: any, res: any) => {
    if (!['admin', 'officer', 'intelligence'].includes(req.user.role)) {
      return res.status(403).json({ error: "Unauthorized access to visitor logs" });
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const visitors = db.prepare(`
      SELECT v.*, i.full_name as inmate_name 
      FROM visitors v 
      LEFT JOIN inmates i ON v.inmate_id = i.id 
      WHERE v.deleted_at IS NULL
      ORDER BY v.visit_date DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
    
    const total = db.prepare("SELECT COUNT(*) as count FROM visitors WHERE deleted_at IS NULL").get() as any;

    res.json({
      data: visitors,
      pagination: {
        total: total.count,
        page,
        limit,
        totalPages: Math.ceil(total.count / limit)
      }
    });
  });

  app.post("/api/visitors", authenticateToken, (req: any, res: any) => {
    const { inmate_id, visitor_name, relation, visit_date } = req.body;
    const result = db.prepare(`
      INSERT INTO visitors (inmate_id, visitor_name, relation, visit_date)
      VALUES (?, ?, ?, ?)
    `).run(inmate_id, visitor_name, relation, visit_date);
    logAction(req.user, 'CREATE', 'visitor', Number(result.lastInsertRowid), `Scheduled visit for ${visitor_name}`);
    res.json({ id: Number(result.lastInsertRowid) });
  });

  // Staff
  app.get("/api/staff", authenticateToken, (req: any, res: any) => {
    if (req.user.role !== 'admin' && req.user.role !== 'intelligence') {
      return res.status(403).json({ error: "Access restricted to Administrators and Intelligence" });
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;
    const showAll = req.query.all === 'true';
    const search = req.query.search as string;

    let whereClause = showAll ? "WHERE 1=1" : "WHERE deleted_at IS NULL";
    const params: any[] = [];

    if (search) {
      whereClause += " AND (full_name LIKE ? OR staff_number LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    params.push(limit, offset);

    const staff = db.prepare(`SELECT * FROM staff ${whereClause} ORDER BY full_name ASC LIMIT ? OFFSET ?`).all(...params);
    const total = db.prepare(`SELECT COUNT(*) as count FROM staff ${whereClause}`).get(...params.slice(0, -2)) as any;

    res.json({
      data: staff,
      pagination: {
        total: total.count,
        page,
        limit,
        totalPages: Math.ceil(total.count / limit)
      }
    });
  });

  // Cells
  app.get("/api/cells", authenticateToken, (req: any, res: any) => {
    if (!['admin', 'officer', 'intelligence'].includes(req.user.role)) {
      return res.status(403).json({ error: "Unauthorized access to cell status" });
    }
    const cells = db.prepare("SELECT * FROM cells WHERE deleted_at IS NULL").all();
    res.json(cells);
  });

  // Medical
  app.get("/api/medical", authenticateToken, (req: any, res: any) => {
    if (!['admin', 'medical', 'intelligence'].includes(req.user.role)) {
      return res.status(403).json({ error: "Unauthorized access to medical records" });
    }
    const records = db.prepare(`
      SELECT m.*, i.full_name as inmate_name 
      FROM medical_records m 
      LEFT JOIN inmates i ON m.inmate_id = i.id 
      WHERE m.deleted_at IS NULL
    `).all();
    res.json(records);
  });

  app.post("/api/medical", authenticateToken, (req: any, res: any) => {
    const { inmate_id, condition, treatment, date } = req.body;
    const result = db.prepare(`
      INSERT INTO medical_records (inmate_id, condition, treatment, date)
      VALUES (?, ?, ?, ?)
    `).run(inmate_id, condition, treatment, date);
    logAction(req.user, 'CREATE', 'medical', Number(result.lastInsertRowid), 'Added medical record');
    res.json({ id: Number(result.lastInsertRowid) });
  });

  // Court Hearings
  app.get("/api/court-hearings", authenticateToken, (req: any, res: any) => {
    if (!['admin', 'legal', 'intelligence', 'officer'].includes(req.user.role)) {
      return res.status(403).json({ error: "Unauthorized access to legal proceedings" });
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const hearings = db.prepare(`
      SELECT c.*, i.full_name as inmate_name 
      FROM court_hearings c 
      LEFT JOIN inmates i ON c.inmate_id = i.id 
      WHERE c.deleted_at IS NULL
      ORDER BY c.hearing_date DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
    
    const total = db.prepare("SELECT COUNT(*) as count FROM court_hearings WHERE deleted_at IS NULL").get() as any;

    res.json({
      data: hearings,
      pagination: {
        total: total.count,
        page,
        limit,
        totalPages: Math.ceil(total.count / limit)
      }
    });
  });

  app.post("/api/court-hearings", authenticateToken, (req: any, res: any) => {
    let { inmate_id, case_number, hearing_date, hearing_type, location_or_link } = req.body;
    
    if (hearing_type === 'virtual' && !location_or_link) {
      location_or_link = `https://meet.google.com/court-${Math.random().toString(36).substring(7)}`;
    }

    const result = db.prepare(`
      INSERT INTO court_hearings (inmate_id, case_number, hearing_date, hearing_type, location_or_link)
      VALUES (?, ?, ?, ?, ?)
    `).run(inmate_id, case_number, hearing_date, hearing_type, location_or_link);
    logAction(req.user, 'CREATE', 'court', Number(result.lastInsertRowid), `Scheduled ${hearing_type} hearing`);
    res.json({ id: Number(result.lastInsertRowid) });
  });

  app.patch("/api/court-hearings/:id", authenticateToken, (req: any, res: any) => {
    const { hearing_type, location_or_link, status } = req.body;
    const fields: string[] = [];
    const values: any[] = [];

    if (hearing_type) { fields.push("hearing_type = ?"); values.push(hearing_type); }
    if (location_or_link !== undefined) { fields.push("location_or_link = ?"); values.push(location_or_link); }
    if (status) { fields.push("status = ?"); values.push(status); }

    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });

    values.push(req.params.id);
    db.prepare(`UPDATE court_hearings SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    
    logAction(req.user, 'UPDATE', 'court', parseInt(req.params.id), 'Updated court hearing details');
    res.json({ success: true });
  });

  app.post("/api/court-hearings/:id/generate-link", authenticateToken, (req: any, res: any) => {
    const hearing = db.prepare("SELECT * FROM court_hearings WHERE id = ?").get(req.params.id) as any;
    if (!hearing) return res.status(404).json({ error: "Hearing not found" });
    
    const newLink = `https://meet.google.com/court-${Math.random().toString(36).substring(7)}`;
    db.prepare("UPDATE court_hearings SET location_or_link = ?, hearing_type = 'virtual' WHERE id = ?").run(newLink, req.params.id);
    
    logAction(req.user, 'GENERATE_LINK', 'court', parseInt(req.params.id), 'Generated virtual hearing link');
    res.json({ link: newLink });
  });

  // Chat
  app.get("/api/chat", authenticateToken, (req: any, res: any) => {
    const messages = db.prepare("SELECT * FROM messages ORDER BY created_at DESC LIMIT 50").all();
    res.json(messages.reverse());
  });

  app.post("/api/chat", authenticateToken, (req: any, res: any) => {
    const { content } = req.body;
    const result = db.prepare("INSERT INTO messages (sender_id, sender_name, content) VALUES (?, ?, ?)")
      .run(req.user.id, req.user.username, content);
    logAction(req.user, 'CHAT_SEND', 'message', Number(result.lastInsertRowid), 'Sent secure message');
    res.json({ id: Number(result.lastInsertRowid) });
  });

  // Audit Logs
  app.get("/api/audit-logs", authenticateToken, (req: any, res: any) => {
    if (req.user.role !== 'admin' && req.user.role !== 'intelligence') {
      return res.status(403).json({ error: "Unauthorized access to audit logs" });
    }
    
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const logs = db.prepare("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?").all(limit, offset);
    const total = db.prepare("SELECT COUNT(*) as count FROM audit_logs").get() as any;

    logAction(req.user, 'ACCESS_AUDIT_LOGS', 'audit', null, `Accessed system audit logs (Page ${page})`);

    res.json({
      data: logs,
      pagination: {
        total: total.count,
        page,
        limit,
        totalPages: Math.ceil(total.count / limit)
      }
    });
  });

  // Notifications
  app.get("/api/notifications/all", authenticateToken, (req: any, res: any) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const notifications = db.prepare("SELECT * FROM notifications ORDER BY timestamp DESC LIMIT ? OFFSET ?").all(limit, offset);
    const total = db.prepare("SELECT COUNT(*) as count FROM notifications").get() as any;

    res.json({
      data: notifications,
      pagination: {
        total: total.count,
        page,
        limit,
        totalPages: Math.ceil(total.count / limit)
      }
    });
  });

  app.get("/api/notifications", authenticateToken, (req: any, res: any) => {
    const notifications = db.prepare("SELECT * FROM notifications WHERE is_read = 0 ORDER BY timestamp DESC LIMIT 10").all();
    res.json(notifications);
  });

  app.post("/api/notifications/:id/read", authenticateToken, (req: any, res: any) => {
    db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").run(req.params.id);
    logAction(req.user, 'NOTIFICATION_READ', 'notification', parseInt(req.params.id), 'Marked notification as read');
    res.json({ success: true });
  });

  // Recycle Bin
  // --- ARCHIVE ENGINE ---
  app.get("/api/archive", authenticateToken, (req: any, res: any) => {
    const type = req.query.type as string || 'inmate';
    const search = req.query.search as string || '';
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    let items;
    let total;

    if (type === 'staff') {
      const countResult = db.prepare(`
        SELECT COUNT(*) as count FROM staff 
        WHERE deleted_at IS NOT NULL 
        AND (full_name LIKE ? OR staff_number LIKE ?)
      `).get(`%${search}%`, `%${search}%`) as any;
      total = countResult.count;

      items = db.prepare(`
        SELECT * FROM staff 
        WHERE deleted_at IS NOT NULL 
        AND (full_name LIKE ? OR staff_number LIKE ?)
        ORDER BY deleted_at DESC
        LIMIT ? OFFSET ?
      `).all(`%${search}%`, `%${search}%`, limit, offset);
    } else {
      const countResult = db.prepare(`
        SELECT COUNT(*) as count FROM inmates 
        WHERE deleted_at IS NOT NULL 
        AND (full_name LIKE ? OR inmate_number LIKE ?)
      `).get(`%${search}%`, `%${search}%`) as any;
      total = countResult.count;

      items = db.prepare(`
        SELECT * FROM inmates 
        WHERE deleted_at IS NOT NULL 
        AND (full_name LIKE ? OR inmate_number LIKE ?)
        ORDER BY deleted_at DESC
        LIMIT ? OFFSET ?
      `).all(`%${search}%`, `%${search}%`, limit, offset);
    }

    res.json({
      data: items,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    });
  });

  app.get("/api/recycle-bin", authenticateToken, (req: any, res: any) => {
    if (!['admin', 'intelligence'].includes(req.user.role)) {
      return res.status(403).json({ error: "Unauthorized access to quarantine" });
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    // We primarily care about historical inmates if there are 400k of them
    const total = db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM inmates WHERE deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM staff WHERE deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM medical_records WHERE deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM counseling_sessions WHERE deleted_at IS NOT NULL) +
        (SELECT COUNT(*) FROM court_hearings WHERE deleted_at IS NOT NULL) as total
    `).get() as any;

    const items = db.prepare(`
      SELECT * FROM (
        SELECT id, full_name as name, 'inmate' as type, deleted_at FROM inmates WHERE deleted_at IS NOT NULL
        UNION ALL
        SELECT id, full_name as name, 'staff' as type, deleted_at FROM staff WHERE deleted_at IS NOT NULL
        UNION ALL
        SELECT id, condition as name, 'medical' as type, deleted_at FROM medical_records WHERE deleted_at IS NOT NULL
        UNION ALL
        SELECT id, topic as name, 'counseling' as type, deleted_at FROM counseling_sessions WHERE deleted_at IS NOT NULL
        UNION ALL
        SELECT id, case_number as name, 'court' as type, deleted_at FROM court_hearings WHERE deleted_at IS NOT NULL
      ) as combined
      ORDER BY deleted_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    res.json({
      data: items,
      pagination: {
        page,
        limit,
        totalPages: Math.ceil(total.total / limit),
        totalItems: total.total
      }
    });
  });

  app.post("/api/recycle-bin/restore", authenticateToken, (req: any, res: any) => {
    const { id, type, deleted_at } = req.body;
    
    // Check if within a year
    const deletedDate = new Date(deleted_at);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    
    if (deletedDate < oneYearAgo) {
      return res.status(403).json({ error: "Quarantine expired. Items older than 1 year cannot be restored." });
    }

    let table = 
      type === 'inmate' ? 'inmates' : 
      type === 'staff' ? 'staff' : 
      type === 'medical' ? 'medical_records' :
      type === 'counseling' ? 'counseling_sessions' : 'court_hearings';
    db.prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`).run(id);
    logAction(req.user, 'RESTORE', type, id, `Restored ${type} from recycle bin`);
    res.json({ success: true });
  });

  app.delete("/api/recycle-bin/permanent/:type/:id", authenticateToken, (req: any, res: any) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Only admins can perform permanent deletion" });
    const { id, type } = req.params;
    let table = 
      type === 'inmate' ? 'inmates' : 
      type === 'staff' ? 'staff' : 
      type === 'medical' ? 'medical_records' :
      type === 'counseling' ? 'counseling_sessions' : 'court_hearings';
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    logAction(req.user, 'PERMANENT_DELETE', type, parseInt(id), `Permanently deleted ${type}`);
    res.json({ success: true });
  });

  // Incidents
  app.get("/api/incidents", authenticateToken, (req: any, res: any) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const incidents = db.prepare(`
      SELECT * FROM incidents 
      WHERE deleted_at IS NULL 
      ORDER BY date DESC 
      LIMIT ? OFFSET ?
    `).all(limit, offset);
    const total = db.prepare("SELECT COUNT(*) as count FROM incidents WHERE deleted_at IS NULL").get() as any;

    res.json({
      data: incidents,
      pagination: {
        total: total.count,
        page,
        limit,
        totalPages: Math.ceil(total.count / limit)
      }
    });
  });

  // Dashboard Stats
  app.get("/api/stats", authenticateToken, (req: any, res: any) => {
    const inmate_count = db.prepare("SELECT COUNT(*) as count FROM inmates WHERE deleted_at IS NULL").get() as any;
    const staff_count = db.prepare("SELECT COUNT(*) as count FROM staff WHERE deleted_at IS NULL").get() as any;
    const cell_capacity = db.prepare("SELECT SUM(capacity) as total FROM cells WHERE deleted_at IS NULL").get() as any;
    const recent_incidents = db.prepare("SELECT * FROM incidents WHERE deleted_at IS NULL ORDER BY date DESC LIMIT 5").all();
    const recent_notifications = db.prepare("SELECT * FROM notifications ORDER BY timestamp DESC LIMIT 5").all();
    
    res.json({
      inmates: inmate_count.count,
      staff: staff_count.count,
      capacity: cell_capacity.total || 0,
      occupancy: inmate_count.count,
      incidents: recent_incidents,
      notifications: recent_notifications
    });
  });

  // AI Insights
  app.post("/api/ai/analyze-risk", authenticateToken, async (req: any, res: any) => {
    if (!ai) return res.status(503).json({ error: "AI Service not configured" });
    const { inmateData } = req.body;
    
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze the security risk of an inmate with the following profile: ${JSON.stringify(inmateData)}. Provide a brief risk assessment, predicted behavior, and recommended cell classification (Min, Med, Max Security). Format STRICTLY as JSON with keys: "details", "actions", "risk_level". Do not include markdown formatting or extra text.`,
      });
      
      const rawText = response.text || "";
      const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      let analysis;
      try {
        analysis = JSON.parse(cleaned);
      } catch (parseErr) {
        console.error("AI JSON Parse Error:", cleaned);
        analysis = {
          details: rawText.substring(0, 500),
          actions: "Manual review required due to formatting issues.",
          risk_level: "UNCERTAIN"
        };
      }
      
      // Save to history
      db.prepare(`
        INSERT INTO ai_risk_assessments (inmate_id, assessment_details, recommended_actions, risk_level)
        VALUES (?, ?, ?, ?)
      `).run(inmateData.id, analysis.details, analysis.actions, analysis.risk_level);
      
      logAction(req.user, 'AI_ASSESS', 'inmate', inmateData.id, `Generated risk assessment: ${analysis.risk_level}`);
      
      res.json({ analysis });
    } catch (e: any) {
      console.error("AI Generation Error:", e);
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/ai/risk-history/:inmateId", authenticateToken, (req: any, res: any) => {
    const history = db.prepare(`
      SELECT * FROM ai_risk_assessments 
      WHERE inmate_id = ? 
      ORDER BY timestamp DESC
    `).all(req.params.inmateId);
    res.json(history);
  });

  // counseling
  app.get("/api/counseling", authenticateToken, (req: any, res: any) => {
    if (!['admin', 'rehab', 'officer', 'intelligence'].includes(req.user.role)) {
      return res.status(403).json({ error: "Unauthorized access to records" });
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = (page - 1) * limit;

    const sessions = db.prepare(`
      SELECT cs.*, i.full_name as inmate_name, s.full_name as counsellor_name
      FROM counseling_sessions cs
      LEFT JOIN inmates i ON cs.inmate_id = i.id
      LEFT JOIN staff s ON cs.counsellor_id = s.id
      WHERE cs.deleted_at IS NULL
      ORDER BY cs.session_date DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);

    const total = db.prepare("SELECT COUNT(*) as count FROM counseling_sessions WHERE deleted_at IS NULL").get() as any;

    res.json({
      data: sessions,
      pagination: {
        total: total.count,
        page,
        limit,
        totalPages: Math.ceil(total.count / limit)
      }
    });
  });

  app.post("/api/counseling", authenticateToken, (req: any, res: any) => {
    const { inmate_id, counsellor_id, session_date, session_type, location_or_link, topic, notes } = req.body;
    
    if (!inmate_id || !session_date || !topic) {
      return res.status(400).json({ error: "Required fields missing: inmate_id, session_date, topic" });
    }

    const result = db.prepare(`
      INSERT INTO counseling_sessions (inmate_id, counsellor_id, session_date, session_type, location_or_link, topic, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(inmate_id, counsellor_id || null, session_date, session_type || 'physical', location_or_link || '', topic, notes || '');
    
    logAction(req.user, 'CREATE', 'counseling_session', Number(result.lastInsertRowid), `Scheduled ${session_type} session for inmate ${inmate_id}`);
    res.json({ id: Number(result.lastInsertRowid), success: true });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Sentinel PMS running at http://localhost:${PORT}`);
  });
}

startServer();
