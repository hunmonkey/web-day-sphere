import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createHash,
  pbkdf2Sync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { AuthUser, UserRole } from "@/lib/auth-types";

type StoredUser = AuthUser & {
  salt: string;
  passwordHash: string;
};

type StoredSession = {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

type AuthDb = {
  users: StoredUser[];
  sessions: StoredSession[];
};

type NewUserInput = {
  email: string;
  name: string;
  password: string;
  role: UserRole;
};

const DATA_DIR =
  process.env.DAY_SPHERE_DATA_DIR ?? path.join(process.cwd(), ".day-sphere");
const DB_FILE = path.join(DATA_DIR, "auth.json");
const SESSION_DAYS = 7;

function emptyDb(): AuthDb {
  return { users: [], sessions: [] };
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function safeUser(user: StoredUser): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const passwordHash = pbkdf2Sync(password, salt, 310000, 32, "sha256").toString(
    "hex",
  );
  return { salt, passwordHash };
}

function passwordMatches(password: string, user: StoredUser) {
  const candidate = hashPassword(password, user.salt).passwordHash;
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(user.passwordHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function assertPassword(password: string) {
  if (password.length < 8) {
    throw new Error("비밀번호는 8자 이상이어야 합니다.");
  }
}

async function readDb(): Promise<AuthDb> {
  try {
    const raw = await readFile(DB_FILE, "utf8");
    const data = JSON.parse(raw) as AuthDb;
    return {
      users: Array.isArray(data.users) ? data.users : [],
      sessions: Array.isArray(data.sessions) ? data.sessions : [],
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyDb();
    throw error;
  }
}

async function writeDb(db: AuthDb) {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  await writeFile(tmp, `${JSON.stringify(db, null, 2)}\n`, "utf8");
  await rename(tmp, DB_FILE);
}

function removeExpiredSessions(db: AuthDb) {
  const now = Date.now();
  db.sessions = db.sessions.filter((s) => Date.parse(s.expiresAt) > now);
}

function assertUniqueEmail(db: AuthDb, email: string, exceptId?: string) {
  const exists = db.users.some((u) => u.email === email && u.id !== exceptId);
  if (exists) throw new Error("이미 등록된 이메일입니다.");
}

function assertActiveAdminRemains(db: AuthDb) {
  const count = db.users.filter((u) => u.role === "admin" && u.active).length;
  if (count < 1) throw new Error("활성 관리자 계정은 최소 1개 필요합니다.");
}

export async function hasUsers() {
  const db = await readDb();
  return db.users.length > 0;
}

export async function listUsers() {
  const db = await readDb();
  return db.users.map(safeUser);
}

export async function createInitialAdmin(input: Omit<NewUserInput, "role">) {
  const db = await readDb();
  if (db.users.length > 0) throw new Error("초기 설정은 이미 완료되었습니다.");
  return createUserInternal(db, { ...input, role: "admin" });
}

export async function createUser(input: NewUserInput) {
  const db = await readDb();
  return createUserInternal(db, input);
}

async function createUserInternal(db: AuthDb, input: NewUserInput) {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (!email) throw new Error("이메일을 입력해 주세요.");
  if (!name) throw new Error("이름을 입력해 주세요.");
  assertPassword(input.password);
  assertUniqueEmail(db, email);

  const now = nowIso();
  const { salt, passwordHash } = hashPassword(input.password);
  const user: StoredUser = {
    id: randomUUID(),
    email,
    name,
    role: input.role,
    active: true,
    salt,
    passwordHash,
    createdAt: now,
    updatedAt: now,
  };
  db.users.push(user);
  await writeDb(db);
  return safeUser(user);
}

export async function login(emailInput: string, password: string) {
  const email = normalizeEmail(emailInput);
  const db = await readDb();
  removeExpiredSessions(db);
  const user = db.users.find((u) => u.email === email);
  if (!user || !user.active || !passwordMatches(password, user)) {
    await writeDb(db);
    return null;
  }

  const token = randomBytes(32).toString("base64url");
  const createdAt = nowIso();
  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  db.sessions.push({
    tokenHash: tokenHash(token),
    userId: user.id,
    createdAt,
    expiresAt,
  });
  await writeDb(db);
  return { token, user: safeUser(user) };
}

export async function getSessionUser(token?: string | null) {
  if (!token) return null;
  const db = await readDb();
  removeExpiredSessions(db);
  const session = db.sessions.find((s) => s.tokenHash === tokenHash(token));
  const user = session ? db.users.find((u) => u.id === session.userId) : null;
  await writeDb(db);
  if (!user || !user.active) return null;
  return safeUser(user);
}

export async function logout(token?: string | null) {
  if (!token) return;
  const db = await readDb();
  db.sessions = db.sessions.filter((s) => s.tokenHash !== tokenHash(token));
  await writeDb(db);
}

export async function updateUser(
  id: string,
  patch: Partial<Pick<AuthUser, "email" | "name" | "role" | "active">>,
) {
  const db = await readDb();
  const user = db.users.find((u) => u.id === id);
  if (!user) throw new Error("사용자를 찾을 수 없습니다.");

  if (patch.email !== undefined) {
    const email = normalizeEmail(patch.email);
    if (!email) throw new Error("이메일을 입력해 주세요.");
    assertUniqueEmail(db, email, id);
    user.email = email;
  }
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("이름을 입력해 주세요.");
    user.name = name;
  }
  if (patch.role !== undefined) user.role = patch.role;
  if (patch.active !== undefined) user.active = patch.active;
  user.updatedAt = nowIso();

  assertActiveAdminRemains(db);
  await writeDb(db);
  return safeUser(user);
}

export async function resetPassword(id: string, password: string) {
  assertPassword(password);
  const db = await readDb();
  const user = db.users.find((u) => u.id === id);
  if (!user) throw new Error("사용자를 찾을 수 없습니다.");
  const { salt, passwordHash } = hashPassword(password);
  user.salt = salt;
  user.passwordHash = passwordHash;
  user.updatedAt = nowIso();
  db.sessions = db.sessions.filter((s) => s.userId !== id);
  await writeDb(db);
  return safeUser(user);
}

export async function deleteUser(id: string) {
  const db = await readDb();
  const exists = db.users.some((u) => u.id === id);
  if (!exists) throw new Error("사용자를 찾을 수 없습니다.");
  db.users = db.users.filter((u) => u.id !== id);
  db.sessions = db.sessions.filter((s) => s.userId !== id);
  assertActiveAdminRemains(db);
  await writeDb(db);
}

export { SESSION_DAYS };
