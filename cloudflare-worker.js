/**
 * Cloudflare Worker API — دبیرستان استعدادهای درخشان استاد شهریار
 *
 * سازگار کامل با داده‌های قبلی SCHOOL_KV:
 * - user:{id}, username:{username}, account-index:{role}:{id}
 * - session:{tokenHash}, activity:{timestamp}:{id}
 * - grade:{studentId}:{id}, attendance:{studentId}:{date}:{id}
 * - homework:{id}, announcement:{id}, school:settings
 *
 * و افزوده‌شده در نسخه کامل (v2):
 * - مدیریت کامل کاربران (ویرایش/حذف/نقش‌ها)، کلاس‌ها، دروس، برنامه هفتگی
 * - ثبت/ویرایش/حذف نمرات و حضور و غیاب (دسته جمعی و تکی) توسط مدیر و دبیر
 * - تحویل تکلیف توسط دانش‌آموز و نمره‌دهی توسط دبیر/مدیر
 * - آزمون‌های آنلاین با تصحیح خودکار
 * - چت زنده بین کاربران و پیام‌های مستقیم، اطلاعیه‌ها، برنامه‌ریز مطالعه، تقویم آموزشی، سوابق تحصیلی، درخواست تغییر پروفایل
 * - گزارش جامع داشبورد مدیر، دبیر و دانش‌آموز
 * - دستیار هوش مصنوعی (متصل به GEMINI_API_KEY در Worker Secrets)
 */

const SCHOOL_NAME = "دبیرستان استعدادهای درخشان استاد شهریار";
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days
const encoder = new TextEncoder();
const DEFAULT_AI_GATEWAY_URL = "https://mokhyar.ghaheri-maryam.workers.dev/v1/chat/completions";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://shahriar_school.stormkit.dev",
  "https://yashar-1392.github.io",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];

const DEFAULT_ROLES = [
  {
    role: "student",
    titleFa: "دانش‌آموز",
    descriptionFa: "دسترسی به کارنامه، تکالیف، برنامه هفتگی، آزمون‌ها و دستیار هوش مصنوعی",
    permissions: [
      "view_own_grades",
      "view_own_attendance",
      "view_own_assignments",
      "submit_assignments",
      "view_own_schedule",
      "view_announcements",
      "use_ai_student"
    ]
  },
  {
    role: "teacher",
    titleFa: "دبیر",
    descriptionFa: "مدیریت کلاس‌ها و دانش‌آموزان اختصاص‌یافته، ثبت نمرات، حضور و غیاب، تکالیف و طراحی آزمون",
    permissions: [
      "view_assigned_classes",
      "manage_assigned_grades",
      "manage_assigned_attendance",
      "manage_assigned_assignments",
      "send_class_announcements",
      "view_class_reports",
      "use_ai_teacher"
    ]
  },
  {
    role: "admin",
    titleFa: "مدیر سامانه",
    descriptionFa: "دسترسی کامل به مدیریت دانش‌آموزان، معلمان، کلاس‌ها، دروس، گزارش‌ها و تنظیمات مدرسه",
    permissions: [
      "manage_users",
      "manage_roles",
      "manage_classes",
      "manage_subjects",
      "manage_grades",
      "manage_attendance",
      "manage_assignments",
      "manage_schedules",
      "manage_announcements",
      "view_reports",
      "manage_settings",
      "view_audit_logs",
      "use_ai_admin"
    ]
  }
];

const DEFAULT_SETTINGS = {
  name: SCHOOL_NAME,
  schoolName: SCHOOL_NAME,
  academicYear: "۱۴۰۵-۱۴۰۶",
  principalName: "مدیر دبیرستان",
  currentTerm: "نوبت اول",
  passingScore: 12,
  aiEnabled: true,
  allowStudentAssignmentSubmission: true,
  grades: ["هفتم", "هشتم", "نهم"],
  classes: []
};

function corsHeaders(origin = "") {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cache-Control",
    "Vary": "Origin"
  };

  if (origin && origin !== "*") {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }

  return headers;
}

function json(data, status = 200, origin = "") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...corsHeaders(origin)
    }
  });
}

function getOrigin(request, env) {
  const rawOrigin = (request.headers.get("Origin") || "").trim().replace(/\/+$/, "");
  const envAllowed = (env.APP_ORIGIN || "")
    .split(",")
    .map(x => x.trim().replace(/\/+$/, ""))
    .filter(x => x && x !== "*");

  const allowed = Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...envAllowed]));

  if (!rawOrigin) {
    return "";
  }

  if (allowed.includes(rawOrigin)) {
    return rawOrigin;
  }

  try {
    const parsed = new URL(rawOrigin);
    if (
      parsed.protocol === "https:" &&
      (parsed.hostname.endsWith(".stormkit.dev") ||
        parsed.hostname.endsWith(".pages.dev") ||
        parsed.hostname.endsWith(".workers.dev") ||
        parsed.hostname.endsWith(".run.app"))
    ) {
      return rawOrigin;
    }
  } catch {
    return null;
  }

  return null;
}

function fail(message, status = 400, origin = "") {
  return json({ success: false, error: message }, status, origin);
}

async function body(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function randomHex(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(data, x => x.toString(16).padStart(2, "0")).join("");
}

async function sha256(value) {
  const result = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(result), x => x.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const result = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: encoder.encode(salt),
      iterations: 100000,
      hash: "SHA-256"
    },
    key,
    256
  );

  return Array.from(new Uint8Array(result), x => x.toString(16).padStart(2, "0")).join("");
}

function safeUser(user) {
  const fullName = user.name || user.fullName || user.username;
  return {
    id: user.id,
    name: fullName,
    fullName,
    username: user.username,
    role: user.role,
    grade: user.grade || user.gradeLevel || null,
    gradeLevel: user.gradeLevel || user.grade || undefined,
    className: user.className || user.classId || null,
    classId: user.classId || user.className || undefined,
    studentCode: user.studentCode || user.nationalId || null,
    nationalId: user.nationalId || user.studentCode || "",
    phone: user.phone || undefined,
    email: user.email || undefined,
    bio: user.bio || undefined,
    avatarUrl: user.avatarUrl || undefined,
    assignedClassIds: Array.isArray(user.assignedClassIds) ? user.assignedClassIds : [],
    assignedSubjectIds: Array.isArray(user.assignedSubjectIds) ? user.assignedSubjectIds : [],
    permissions: Array.isArray(user.permissions) ? user.permissions : undefined,
    preferredLanguage: user.preferredLanguage || undefined,
    preferredTheme: user.preferredTheme || undefined,
    coins: typeof user.coins === "number" ? user.coins : 0,
    active: user.active !== false,
    createdAt: user.createdAt
  };
}

async function getUser(env, id) {
  return env.SCHOOL_KV.get(`user:${id}`, "json");
}

async function saveUser(env, user) {
  await env.SCHOOL_KV.put(`user:${user.id}`, JSON.stringify(user));
}

async function authenticate(request, env) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return null;

  const token = header.slice(7).trim();
  if (!token) return null;

  const tokenHash = await sha256(token);
  const session = await env.SCHOOL_KV.get(`session:${tokenHash}`, "json");
  if (!session || session.expiresAt < Date.now()) return null;

  const user = await getUser(env, session.userId);
  if (!user || user.active === false) return null;

  return { user, tokenHash };
}

function requireRole(user, roles) {
  return roles.includes(user.role);
}

function isAdminOrDeputy(role) {
  return role === "admin";
}

function isStudentOrParent(role) {
  return role === "student";
}

async function resolveEffectiveStudent(env, user) {
  return user;
}

async function getRolesConfig(env) {
  const stored = await env.SCHOOL_KV.get("school:roles", "json");
  if (!Array.isArray(stored) || stored.length === 0) {
    return DEFAULT_ROLES;
  }
  const byRole = new Map(stored.filter(Boolean).map(r => [r.role, r]));
  return DEFAULT_ROLES.map(def => {
    const existing = byRole.get(def.role);
    if (!existing) return def;
    return {
      ...def,
      ...existing,
      permissions: Array.isArray(existing.permissions) ? existing.permissions : def.permissions
    };
  });
}

async function getUserPermissions(env, user) {
  if (isAdminOrDeputy(user.role)) {
    const adminDef = DEFAULT_ROLES.find(r => r.role === "admin");
    return new Set(adminDef ? adminDef.permissions : []);
  }
  if (Array.isArray(user.permissions)) {
    return new Set(user.permissions);
  }
  const roles = await getRolesConfig(env);
  const roleCfg = roles.find(r => r.role === user.role);
  return new Set(Array.isArray(roleCfg?.permissions) ? roleCfg.permissions : []);
}

async function hasPermission(env, user, ...perms) {
  if (isAdminOrDeputy(user.role)) return true;
  const set = await getUserPermissions(env, user);
  return perms.some(p => set.has(p));
}

function getTeacherAllowedClassIds(user, allClasses) {
  const set = new Set(Array.isArray(user.assignedClassIds) ? user.assignedClassIds : []);
  for (const c of allClasses) {
    if (
      (Array.isArray(c.teacherIds) && c.teacherIds.includes(user.id)) ||
      set.has(c.id) ||
      (c.name && set.has(c.name))
    ) {
      if (c.id) set.add(c.id);
      if (c.name) set.add(c.name);
    }
  }
  return set;
}

function matchesClassSet(rec, classSet) {
  return Boolean((rec?.classId && classSet.has(rec.classId)) || (rec?.className && classSet.has(rec.className)));
}

function matchesSingleClass(rec, cls) {
  return Boolean(
    (rec?.classId && (rec.classId === cls.id || (cls.name && rec.classId === cls.name))) ||
    (rec?.className && (rec.className === cls.id || (cls.name && rec.className === cls.name)))
  );
}

async function syncTeacherClassesInKV(env, teacherId, assignedClassIds) {
  const classes = await listValues(env, "class:");
  const assignedSet = new Set(Array.isArray(assignedClassIds) ? assignedClassIds : []);
  await Promise.all(
    classes.map(async c => {
      const prev = Array.isArray(c.teacherIds) ? c.teacherIds : [];
      const hasTeacher = prev.includes(teacherId);
      const shouldHave = assignedSet.has(c.id) || (c.name && assignedSet.has(c.name));
      if (shouldHave && !hasTeacher) {
        c.teacherIds = [...prev, teacherId];
        await env.SCHOOL_KV.put(`class:${c.id}`, JSON.stringify(c));
      } else if (!shouldHave && hasTeacher) {
        c.teacherIds = prev.filter(id => id !== teacherId);
        await env.SCHOOL_KV.put(`class:${c.id}`, JSON.stringify(c));
      }
    })
  );
}

async function syncClassTeachersInKV(env, classId, teacherIds) {
  const users = await getAllUsers(env);
  const teacherSet = new Set(Array.isArray(teacherIds) ? teacherIds : []);
  await Promise.all(
    users
      .filter(u => u.role === "teacher")
      .map(async u => {
        const prev = Array.isArray(u.assignedClassIds) ? u.assignedClassIds : [];
        const hasClass = prev.includes(classId);
        const shouldHave = teacherSet.has(u.id);
        if (shouldHave && !hasClass) {
          u.assignedClassIds = [...prev, classId];
          await saveUser(env, u);
        } else if (!shouldHave && hasClass) {
          u.assignedClassIds = prev.filter(id => id !== classId);
          await saveUser(env, u);
        }
      })
  );
}

async function callWorkerAI(env, systemPrompt, messages) {
  if (env.GEMINI_API_KEY) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: messages.map(m => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }]
            }))
          })
        }
      );
      const geminiData = await geminiRes.json();
      const txt = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (txt) return txt;
    } catch {
      // fall back below
    }
  }
  try {
    const res = await fetch(DEFAULT_AI_GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stream: false,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        max_tokens: 4096
      })
    });
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      if (parsed?.choices?.[0]?.message?.content) return parsed.choices[0].message.content;
    } catch {
      // ignore non-json
    }
    const lines = text.split("\n").filter(l => l.startsWith("data:")).map(l => l.slice(5).trim()).filter(l => l && l !== "[DONE]");
    let out = "";
    for (const l of lines) {
      try {
        const p = JSON.parse(l);
        out += p?.choices?.[0]?.delta?.content ?? p?.delta ?? "";
      } catch {}
    }
    if (out) return out;
  } catch {
    // ignore
  }
  return "پاسخی از سرویس هوش مصنوعی دریافت نشد.";
}

function extractWorkerJson(rawText) {
  const t = String(rawText || "").trim();
  const cands = [t];
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (f && f[1]) cands.unshift(f[1].trim());
  const a1 = t.indexOf("[");
  const a2 = t.lastIndexOf("]");
  if (a1 !== -1 && a2 > a1) cands.push(t.slice(a1, a2 + 1));
  const o1 = t.indexOf("{");
  const o2 = t.lastIndexOf("}");
  if (o1 !== -1 && o2 > o1) cands.push(t.slice(o1, o2 + 1));
  for (const c of cands) {
    try {
      return JSON.parse(c);
    } catch {}
  }
  return null;
}

async function listKeys(env, prefix) {
  const keys = [];
  let cursor;
  do {
    const result = await env.SCHOOL_KV.list({
      prefix,
      limit: 1000,
      ...(cursor ? { cursor } : {})
    });
    keys.push(...result.keys.map(k => k.name));
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);
  return keys;
}

async function listValues(env, prefix) {
  const output = [];
  let cursor;

  do {
    const result = await env.SCHOOL_KV.list({
      prefix,
      limit: 1000,
      ...(cursor ? { cursor } : {})
    });

    const values = await Promise.all(
      result.keys.map(item => env.SCHOOL_KV.get(item.name, "json"))
    );

    output.push(...values.filter(Boolean));
    cursor = result.list_complete ? undefined : result.cursor;
  } while (cursor);

  return output;
}

async function getAllUsers(env) {
  const [adminIdx, teacherIdx, studentIdx] = await Promise.all([
    listValues(env, "account-index:admin:"),
    listValues(env, "account-index:teacher:"),
    listValues(env, "account-index:student:")
  ]);
  const ids = Array.from(
    new Set([...adminIdx, ...teacherIdx, ...studentIdx].map(x => x.id).filter(Boolean))
  );
  const loaded = await Promise.all(ids.map(id => getUser(env, id)));
  return loaded.filter(Boolean);
}

async function getSchoolSettings(env) {
  const stored = await env.SCHOOL_KV.get("school:settings", "json");
  const merged = {
    ...DEFAULT_SETTINGS,
    ...(stored || {}),
    schoolName: (stored && (stored.schoolName || stored.name)) || SCHOOL_NAME,
    name: (stored && (stored.name || stored.schoolName)) || SCHOOL_NAME,
    academicYear: (stored && stored.academicYear) || DEFAULT_SETTINGS.academicYear,
    updatedAt: (stored && stored.updatedAt) || new Date().toISOString()
  };
  return merged;
}

async function createAccount(env, data, role, createdBy) {
  const name = String(data.name || data.fullName || "").trim();
  const username = String(data.username || "").trim().toLowerCase();
  const password = String(data.password || "");

  if (name.length < 2 || name.length > 80) {
    throw new Error("نام باید بین ۲ تا ۸۰ کاراکتر باشد");
  }

  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(username)) {
    throw new Error("نام کاربری باید ۳ تا ۳۲ کاراکتر انگلیسی باشد");
  }

  if (password.length < 8 || password.length > 128) {
    throw new Error("رمز عبور باید حداقل ۸ کاراکتر باشد");
  }

  const existing = await env.SCHOOL_KV.get(`username:${username}`);
  if (existing) {
    throw new Error("این نام کاربری قبلاً استفاده شده است");
  }

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const id = crypto.randomUUID();

  let gradeVal = role === "student" ? String(data.grade || data.gradeLevel || "هفتم").trim() : null;
  let classVal = role === "student" ? String(data.className || data.classId || "").trim() : null;

  const user = {
    id,
    name,
    fullName: name,
    username,
    salt,
    passwordHash,
    role,
    active: data.active !== false,
    grade: gradeVal,
    gradeLevel: gradeVal,
    className: classVal,
    classId: classVal,
    studentCode: role === "student"
      ? String(data.studentCode || data.nationalId || "").trim() || null
      : String(data.nationalId || "").trim() || null,
    nationalId: String(data.nationalId || data.studentCode || "").trim(),
    phone: String(data.phone || "").trim(),
    email: String(data.email || "").trim(),
    assignedClassIds: role === "teacher" && Array.isArray(data.assignedClassIds) ? data.assignedClassIds : [],
    assignedSubjectIds: role === "teacher" && Array.isArray(data.assignedSubjectIds) ? data.assignedSubjectIds : [],
    permissions: Array.isArray(data.permissions) ? data.permissions : undefined,
    coins: 0,
    createdBy,
    createdAt: new Date().toISOString()
  };

  if (role === "student" && !user.grade) {
    throw new Error("پایه تحصیلی دانش‌آموز مشخص نشده است");
  }

  await saveUser(env, user);
  await env.SCHOOL_KV.put(`username:${username}`, id);
  await env.SCHOOL_KV.put(
    `account-index:${role}:${id}`,
    JSON.stringify({ id, createdAt: user.createdAt })
  );
  if (role === "teacher" && user.assignedClassIds.length > 0) {
    await syncTeacherClassesInKV(env, id, user.assignedClassIds);
  }

  return safeUser(user);
}

async function logActivity(env, user, action, details = {}) {
  const id = crypto.randomUUID();
  await env.SCHOOL_KV.put(
    `activity:${Date.now()}:${id}`,
    JSON.stringify({
      id,
      userId: user?.id || null,
      username: user?.username || null,
      userName: user?.name || user?.fullName || user?.username || "سیستم",
      userRole: user?.role || "admin",
      action,
      target: details.target || "",
      details: typeof details === "string" ? details : JSON.stringify(details),
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString()
    })
  );
}

function normalizeGrade(g) {
  const subjectLabel = String(g.subject || g.subjectName || g.subjectId || "عمومی");
  const maxScore = Number(g.maxScore ?? 20) || 20;
  return {
    id: g.id,
    studentId: g.studentId,
    studentName: g.studentName || undefined,
    classId: g.classId || g.className || "",
    className: g.className || undefined,
    subjectId: g.subjectId || subjectLabel,
    subjectName: g.subjectName || subjectLabel,
    subject: subjectLabel,
    teacherId: g.teacherId || g.createdBy || "",
    term: g.term || "نوبت اول",
    title: g.title || g.description || subjectLabel,
    score: Number(g.score ?? 0),
    maxScore,
    date: g.date || g.createdAt || new Date().toISOString(),
    note: g.note || g.description || "",
    description: g.description || g.note || "",
    createdAt: g.createdAt || new Date().toISOString()
  };
}

function normalizeAttendance(a) {
  return {
    id: a.id,
    studentId: a.studentId,
    studentName: a.studentName || undefined,
    classId: a.classId || a.className || "",
    className: a.className || undefined,
    subjectId: a.subjectId || a.subject || undefined,
    subjectName: a.subjectName || a.subject || undefined,
    teacherId: a.teacherId || a.createdBy || "",
    date: a.date || (a.createdAt ? a.createdAt.slice(0, 10) : ""),
    status: ["present", "absent", "late", "excused"].includes(a.status) ? a.status : "present",
    note: a.note || a.description || "",
    description: a.description || a.note || "",
    createdAt: a.createdAt || new Date().toISOString()
  };
}

function normalizeHomework(h, teacherMap) {
  const subjectLabel = String(h.subjectName || h.subject || h.subjectId || "عمومی");
  const classLabel = String(h.className || h.classId || h.grade || "");
  const teacherId = String(h.teacherId || h.createdBy || "");
  return {
    id: h.id,
    title: h.title,
    description: h.description || "",
    classId: h.classId || classLabel,
    className: classLabel || undefined,
    grade: h.grade || "",
    subjectId: h.subjectId || subjectLabel,
    subjectName: subjectLabel,
    subject: subjectLabel,
    teacherId,
    teacherName: h.teacherName || (teacherMap && teacherMap.get(teacherId)?.name) || undefined,
    dueDate: h.dueDate || (h.createdAt ? h.createdAt.slice(0, 10) : ""),
    maxScore: Number(h.maxScore ?? 20) || 20,
    createdAt: h.createdAt || new Date().toISOString()
  };
}

function normalizeAnnouncement(a, userMap) {
  const authorId = String(a.authorId || a.createdBy || "");
  const author = userMap ? userMap.get(authorId) : null;
  const targetType = a.targetType ||
    (a.targetClass ? "class" : a.targetGrade === "students" ? "students" : a.targetGrade === "teachers" ? "teachers" : "all");
  return {
    id: a.id,
    title: a.title,
    body: a.body ?? a.message ?? "",
    message: a.message ?? a.body ?? "",
    authorId,
    authorName: a.authorName || author?.name || "مدیریت مدرسه",
    authorRole: a.authorRole || author?.role || "admin",
    targetType,
    targetClassId: a.targetClassId || a.targetClass || undefined,
    targetGrade: a.targetGrade || "",
    priority: a.priority || "normal",
    createdAt: a.createdAt || new Date().toISOString()
  };
}

function computeAttendanceStats(records) {
  return {
    total: records.length,
    present: records.filter(r => r.status === "present").length,
    absent: records.filter(r => r.status === "absent").length,
    late: records.filter(r => r.status === "late").length,
    excused: records.filter(r => r.status === "excused").length
  };
}

async function handle(request, env) {
  const origin = getOrigin(request, env);

  if (origin === null) {
    return new Response("Origin not allowed", {
      status: 403,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Vary": "Origin"
      }
    });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(origin),
        "Access-Control-Max-Age": "86400"
      }
    });
  }

  if (!env.SCHOOL_KV) {
    return json({ success: false, error: "KV binding SCHOOL_KV تنظیم نشده است" }, 500, origin);
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  // HEALTH
  if (path === "/api/health" && method === "GET") {
    return json({
      success: true,
      ok: true,
      server: "shahriar-school-api",
      apiVersion: 2,
      fullSupport: true,
      storage: "CLOUDFLARE_WORKER",
      school: SCHOOL_NAME,
      status: "online",
      aiConfigured: Boolean(env.GEMINI_API_KEY)
    }, 200, origin);
  }

  // FIRST ADMIN SETUP STATUS
  if ((path === "/api/setup/status" || path === "/api/auth/bootstrap-status") && method === "GET") {
    const admins = await env.SCHOOL_KV.list({ prefix: "account-index:admin:", limit: 1 });
    const hasAdmin = admins.keys.length > 0;
    const settings = await getSchoolSettings(env);

    return json({
      success: true,
      initialized: hasAdmin,
      hasAdmin,
      adminExists: hasAdmin,
      needsSetup: !hasAdmin,
      setupRequired: !hasAdmin,
      remoteReachable: true,
      schoolName: settings.schoolName || SCHOOL_NAME
    }, 200, origin);
  }

  // FIRST ADMIN SETUP & ADDITIONAL ADMIN CREATION
  if ((path === "/api/setup/admin" || path === "/api/setup/initialize") && method === "POST") {
    if (!env.ADMIN_SETUP_KEY) {
      return fail("کلید راه‌اندازی مدیر تنظیم نشده است", 500, origin);
    }

    const data = await body(request);
    if (!data) return fail("درخواست نامعتبر است", 400, origin);

    if (String(data.setupKey || "").trim() !== String(env.ADMIN_SETUP_KEY).trim()) {
      return fail("کلید راه‌اندازی اشتباه است", 403, origin);
    }

    if (path === "/api/setup/initialize") {
      const admins = await env.SCHOOL_KV.list({ prefix: "account-index:admin:", limit: 1 });
      if (admins.keys.length > 0) {
        return fail("حساب مدیر قبلاً ساخته شده است", 409, origin);
      }
    }

    try {
      const admin = await createAccount(env, data, "admin", "system");
      await logActivity(env, admin, "admin_created");

      const token = randomHex(32);
      const tokenHash = await sha256(token);
      const expiresAt = Date.now() + SESSION_TTL * 1000;
      await env.SCHOOL_KV.put(
        `session:${tokenHash}`,
        JSON.stringify({ userId: admin.id, expiresAt }),
        { expirationTtl: SESSION_TTL }
      );

      const settings = await getSchoolSettings(env);
      return json({
        success: true,
        message: "حساب مدیر با موفقیت ساخته شد",
        token,
        expiresAt,
        user: admin,
        settings
      }, 201, origin);
    } catch (error) {
      return fail(error.message, 400, origin);
    }
  }

  // LOGIN
  if (path === "/api/auth/login" && method === "POST") {
    const data = await body(request);
    if (!data) return fail("درخواست نامعتبر است", 400, origin);

    const username = String(data.username || data.identifier || "").trim().toLowerCase();
    const password = String(data.password || "");

    if (!username || !password) {
      return fail("لطفاً نام کاربری و رمز عبور خود را وارد کنید", 400, origin);
    }

    const userId = await env.SCHOOL_KV.get(`username:${username}`);
    if (!userId) {
      return fail("نام کاربری یا رمز عبور اشتباه است", 401, origin);
    }

    const user = await getUser(env, userId);
    if (!user || user.active === false) {
      return fail("حساب کاربری غیرفعال است", 403, origin);
    }

    const candidate = await hashPassword(password, user.salt);
    if (candidate !== user.passwordHash) {
      return fail("نام کاربری یا رمز عبور اشتباه است", 401, origin);
    }

    const token = randomHex(32);
    const tokenHash = await sha256(token);
    const expiresAt = Date.now() + SESSION_TTL * 1000;

    await env.SCHOOL_KV.put(
      `session:${tokenHash}`,
      JSON.stringify({ userId: user.id, expiresAt }),
      { expirationTtl: SESSION_TTL }
    );

    await logActivity(env, user, "login");
    const [settings, rolesCfg] = await Promise.all([getSchoolSettings(env), getRolesConfig(env)]);

    return json({
      success: true,
      token,
      expiresAt,
      user: safeUser(user),
      settings,
      roleConfig: rolesCfg.find(r => r.role === user.role) || null,
      message: `${user.name || user.username} عزیز، خوش آمدید.`
    }, 200, origin);
  }

  // ALL OTHER ROUTES REQUIRE LOGIN
  const auth = await authenticate(request, env);
  if (!auth) {
    return fail("برای استفاده از این بخش وارد حساب شوید", 401, origin);
  }

  const { user, tokenHash } = auth;

  // LOGOUT
  if (path === "/api/auth/logout" && method === "POST") {
    await env.SCHOOL_KV.delete(`session:${tokenHash}`);
    await logActivity(env, user, "logout");
    return json({ success: true, ok: true, message: "با موفقیت از حساب کاربری خارج شدید" }, 200, origin);
  }

  // CURRENT USER GET & PATCH
  if (path === "/api/auth/me" && method === "GET") {
    const [settings, rolesCfg] = await Promise.all([getSchoolSettings(env), getRolesConfig(env)]);
    return json({
      success: true,
      user: safeUser(user),
      settings,
      roleConfig: rolesCfg.find(r => r.role === user.role) || null
    }, 200, origin);
  }

  if (path === "/api/auth/me" && method === "PATCH") {
    const data = await body(request);
    if (!data) return fail("درخواست نامعتبر است", 400, origin);

    const updated = { ...user };
    if (data.preferredLanguage === "fa" || data.preferredLanguage === "en") {
      updated.preferredLanguage = data.preferredLanguage;
    }
    if (data.preferredTheme === "light" || data.preferredTheme === "dark") {
      updated.preferredTheme = data.preferredTheme;
    }
    if (typeof data.fullName === "string" && data.fullName.trim() && isAdminOrDeputy(user.role)) {
      updated.name = data.fullName.trim();
      updated.fullName = data.fullName.trim();
    }
    if (typeof data.age === "number" && isAdminOrDeputy(user.role)) updated.age = data.age;
    if (typeof data.phone === "string") updated.phone = data.phone.trim();
    if (typeof data.email === "string") updated.email = data.email.trim();
    if (typeof data.bio === "string") updated.bio = data.bio.trim();
    if (typeof data.avatarUrl === "string") updated.avatarUrl = data.avatarUrl.trim();

    if (typeof data.newPassword === "string" && data.newPassword.trim()) {
      if (data.newPassword.length < 6) {
        return fail("رمز عبور جدید باید حداقل ۶ کاراکتر باشد", 400, origin);
      }
      if (data.currentPassword) {
        const check = await hashPassword(String(data.currentPassword), user.salt);
        if (check !== user.passwordHash) {
          return fail("رمز عبور فعلی اشتباه است", 400, origin);
        }
      }
      const newSalt = randomHex(16);
      updated.salt = newSalt;
      updated.passwordHash = await hashPassword(data.newPassword, newSalt);
    }

    await saveUser(env, updated);
    return json({ success: true, user: safeUser(updated), message: "اطلاعات حساب ذخیره شد" }, 200, origin);
  }

  // ROLES
  if (path === "/api/roles" && method === "GET") {
    if (!requireRole(user, ["admin"])) return fail("دسترسی غیرمجاز", 403, origin);
    const roles = await getRolesConfig(env);
    return json({ success: true, roles }, 200, origin);
  }

  if (path === "/api/roles" && method === "PUT") {
    if (!requireRole(user, ["admin"])) return fail("دسترسی غیرمجاز", 403, origin);
    const data = await body(request);
    if (!Array.isArray(data?.roles)) return fail("فرمت نقش‌ها نامعتبر است", 400, origin);
    const roles = data.roles;
    await env.SCHOOL_KV.put("school:roles", JSON.stringify(roles));
    await logActivity(env, user, "roles_updated", { target: "school:roles" });
    return json({ success: true, roles, message: "تنظیمات نقش‌ها و مجوزها ذخیره شد" }, 200, origin);
  }

  // DASHBOARD STATS (Admin)
  if (path === "/api/dashboard/stats" && method === "GET") {
    if (!requireRole(user, ["admin"])) {
      return fail("دسترسی غیرمجاز", 403, origin);
    }

    const [admins, students, teachers, announcements, homework] = await Promise.all([
      env.SCHOOL_KV.list({ prefix: "account-index:admin:", limit: 1000 }),
      env.SCHOOL_KV.list({ prefix: "account-index:student:", limit: 1000 }),
      env.SCHOOL_KV.list({ prefix: "account-index:teacher:", limit: 1000 }),
      env.SCHOOL_KV.list({ prefix: "announcement:", limit: 1000 }),
      env.SCHOOL_KV.list({ prefix: "homework:", limit: 1000 })
    ]);

    return json({
      success: true,
      data: {
        admins: admins.keys.length,
        students: students.keys.length,
        teachers: teachers.keys.length,
        announcements: announcements.keys.length,
        homework: homework.keys.length
      }
    }, 200, origin);
  }

  // DIRECTORY TEACHERS (Any authenticated user)
  if (path === "/api/directory/teachers" && method === "GET") {
    const users = await getAllUsers(env);
    const teachers = users
      .filter(u => (u.role === "teacher" || isAdminOrDeputy(u.role)) && u.active !== false)
      .map(u => ({
        id: u.id,
        fullName: u.name || u.username,
        role: u.role,
        assignedSubjectIds: Array.isArray(u.assignedSubjectIds) ? u.assignedSubjectIds : [],
        assignedClassIds: Array.isArray(u.assignedClassIds) ? u.assignedClassIds : []
      }));
    return json({ success: true, teachers }, 200, origin);
  }

  // USERS LIST & MANAGEMENT
  if (path === "/api/users" && method === "GET") {
    const allUsers = await getAllUsers(env);
    if (isAdminOrDeputy(user.role)) {
      return json({ success: true, users: allUsers.map(safeUser) }, 200, origin);
    }
    if (user.role === "teacher") {
      if (await hasPermission(env, user, "manage_users")) {
        return json({ success: true, users: allUsers.filter(u => u.active !== false).map(safeUser) }, 200, origin);
      }
      const canSeeStudents = await hasPermission(
        env,
        user,
        "view_assigned_classes",
        "manage_assigned_grades",
        "manage_grades",
        "manage_assigned_attendance",
        "manage_attendance",
        "manage_assigned_assignments",
        "manage_assignments",
        "view_class_reports",
        "view_reports"
      );
      if (!canSeeStudents) {
        return json({ success: true, users: [safeUser(user)] }, 200, origin);
      }
      const classes = await listValues(env, "class:");
      const allowedClasses = getTeacherAllowedClassIds(user, classes);
      const hasSchoolWide = await hasPermission(env, user, "manage_grades", "manage_attendance", "manage_assignments", "view_reports");
      const scoped = allUsers.filter(
        u =>
          u.id === user.id ||
          (u.role === "student" && u.active !== false && (hasSchoolWide || matchesClassSet(u, allowedClasses)))
      );
      return json({ success: true, users: scoped.map(safeUser) }, 200, origin);
    }
    return json({ success: true, users: [safeUser(user)] }, 200, origin);
  }

  if (path === "/api/users" && method === "POST") {
    const canManageUsers = await hasPermission(env, user, "manage_users");
    if (!canManageUsers) {
      return fail("فقط مدیر یا معاون مدرسه مجاز به ایجاد کاربر جدید است", 403, origin);
    }
    const data = await body(request);
    if (!data) return fail("درخواست نامعتبر است", 400, origin);
    const role = ["student", "teacher", "admin"].includes(data.role) ? data.role : "student";
    try {
      const created = await createAccount(env, data, role, user.id);
      await logActivity(env, user, `${role}_created`, { target: created.username });
      return json({ success: true, user: created, message: "حساب کاربری جدید ایجاد شد" }, 201, origin);
    } catch (error) {
      return fail(error.message, 400, origin);
    }
  }

  const userIdMatch = path.match(/^\/api\/users\/([^/]+)$/);
  if (userIdMatch) {
    const canManageUsers = await hasPermission(env, user, "manage_users");
    if (!canManageUsers) return fail("دسترسی غیرمجاز", 403, origin);
    const targetId = decodeURIComponent(userIdMatch[1]);
    const target = await getUser(env, targetId);
    if (!target) return fail("کاربر یافت نشد", 404, origin);

    if (method === "PATCH" || method === "PUT") {
      const data = await body(request);
      if (!data) return fail("درخواست نامعتبر است", 400, origin);
      const oldRole = target.role;
      const newRole = ["student", "teacher", "admin"].includes(data.role) ? data.role : oldRole;

      const updated = {
        ...target,
        name: typeof data.fullName === "string" && data.fullName.trim() ? data.fullName.trim() : (typeof data.name === "string" && data.name.trim() ? data.name.trim() : target.name),
        role: newRole,
        active: typeof data.active === "boolean" ? data.active : target.active,
        phone: typeof data.phone === "string" ? data.phone.trim() : target.phone,
        email: typeof data.email === "string" ? data.email.trim() : target.email,
        studentCode: typeof data.nationalId === "string" ? data.nationalId.trim() : target.studentCode,
        nationalId: typeof data.nationalId === "string" ? data.nationalId.trim() : target.nationalId,
        grade: newRole === "student" ? (typeof data.gradeLevel === "string" ? data.gradeLevel : target.grade) : target.grade,
        gradeLevel: newRole === "student" ? (typeof data.gradeLevel === "string" ? data.gradeLevel : target.gradeLevel) : target.gradeLevel,
        className: newRole === "student" ? (typeof data.classId === "string" ? data.classId : target.className) : target.className,
        classId: newRole === "student" ? (typeof data.classId === "string" ? data.classId : target.classId) : target.classId,
        assignedClassIds: Array.isArray(data.assignedClassIds) ? data.assignedClassIds : target.assignedClassIds,
        assignedSubjectIds: Array.isArray(data.assignedSubjectIds) ? data.assignedSubjectIds : target.assignedSubjectIds,
        permissions: Array.isArray(data.permissions) ? data.permissions : target.permissions
      };
      updated.fullName = updated.name;

      if (typeof data.newPassword === "string" && data.newPassword.trim()) {
        if (data.newPassword.length < 6) return fail("رمز عبور جدید باید حداقل ۶ کاراکتر باشد", 400, origin);
        const newSalt = randomHex(16);
        updated.salt = newSalt;
        updated.passwordHash = await hashPassword(data.newPassword, newSalt);
      }

      await saveUser(env, updated);
      if (updated.role === "teacher" && Array.isArray(data.assignedClassIds)) {
        await syncTeacherClassesInKV(env, targetId, updated.assignedClassIds);
      }
      if (oldRole !== newRole) {
        await env.SCHOOL_KV.delete(`account-index:${oldRole}:${targetId}`);
        await env.SCHOOL_KV.put(`account-index:${newRole}:${targetId}`, JSON.stringify({ id: targetId, createdAt: target.createdAt }));
      }
      await logActivity(env, user, "user_updated", { target: updated.username });
      return json({ success: true, user: safeUser(updated), message: "اطلاعات کاربر به‌روزرسانی شد" }, 200, origin);
    }

    if (method === "DELETE") {
      if (target.id === user.id) return fail("امکان حذف حساب فعلی مدیر وجود ندارد", 400, origin);
      await Promise.all([
        env.SCHOOL_KV.delete(`user:${target.id}`),
        env.SCHOOL_KV.delete(`username:${target.username}`),
        env.SCHOOL_KV.delete(`account-index:${target.role}:${target.id}`)
      ]);
      await logActivity(env, user, "user_deleted", { target: target.username });
      return json({ success: true, message: "کاربر حذف شد" }, 200, origin);
    }
  }

  // LEGACY CREATE/LIST STUDENTS & TEACHERS
  if (path === "/api/admin/students" && method === "POST") {
    if (!requireRole(user, ["admin"])) return fail("فقط مدیر می‌تواند دانش‌آموز ایجاد کند", 403, origin);
    const data = await body(request);
    if (!data) return fail("درخواست نامعتبر است", 400, origin);
    try {
      const student = await createAccount(env, data, "student", user.id);
      await logActivity(env, user, "student_created", { studentId: student.id });
      return json({ success: true, message: "دانش‌آموز با موفقیت ایجاد شد", student }, 201, origin);
    } catch (error) {
      return fail(error.message, 400, origin);
    }
  }

  if (path === "/api/admin/students" && method === "GET") {
    if (!requireRole(user, ["admin"])) return fail("دسترسی غیرمجاز", 403, origin);
    const indexes = await listValues(env, "account-index:student:");
    const students = await Promise.all(indexes.map(item => getUser(env, item.id)));
    return json({ success: true, students: students.filter(Boolean).map(safeUser) }, 200, origin);
  }

  if (path === "/api/admin/teachers" && method === "POST") {
    if (!requireRole(user, ["admin"])) return fail("دسترسی غیرمجاز", 403, origin);
    const data = await body(request);
    if (!data) return fail("درخواست نامعتبر است", 400, origin);
    try {
      const teacher = await createAccount(env, data, "teacher", user.id);
      await logActivity(env, user, "teacher_created", { teacherId: teacher.id });
      return json({ success: true, message: "حساب معلم ایجاد شد", teacher }, 201, origin);
    } catch (error) {
      return fail(error.message, 400, origin);
    }
  }

  if (path === "/api/admin/teachers" && method === "GET") {
    if (!requireRole(user, ["admin"])) return fail("دسترسی غیرمجاز", 403, origin);
    const indexes = await listValues(env, "account-index:teacher:");
    const teachers = await Promise.all(indexes.map(item => getUser(env, item.id)));
    return json({ success: true, teachers: teachers.filter(Boolean).map(safeUser) }, 200, origin);
  }

  // CLASSES
  if (path === "/api/classes" && method === "GET") {
    let classes = await listValues(env, "class:");
    if (classes.length === 0) {
      const allUsers = await getAllUsers(env);
      const seen = new Map();
      for (const u of allUsers) {
        const cname = (u.classId || u.className || "").trim();
        if (cname && !seen.has(cname)) {
          seen.set(cname, {
            id: cname,
            name: cname,
            gradeLevel: u.grade || "هفتم",
            academicYear: DEFAULT_SETTINGS.academicYear,
            capacity: 30,
            teacherIds: [],
            subjectIds: [],
            createdAt: u.createdAt
          });
        }
      }
      classes = Array.from(seen.values());
    }
    if (isAdminOrDeputy(user.role)) {
      return json({ success: true, classes }, 200, origin);
    }
    if (user.role === "teacher") {
      if (await hasPermission(env, user, "manage_classes")) {
        return json({ success: true, classes }, 200, origin);
      }
      if (!(await hasPermission(env, user, "view_assigned_classes", "manage_assigned_grades", "manage_assigned_attendance", "manage_assigned_assignments", "view_class_reports"))) {
        return json({ success: true, classes: [] }, 200, origin);
      }
      const allowed = getTeacherAllowedClassIds(user, classes);
      return json({
        success: true,
        classes: classes.filter(c => allowed.has(c.id) || (c.name && allowed.has(c.name)))
      }, 200, origin);
    }
    const eff = await resolveEffectiveStudent(env, user);
    return json({
      success: true,
      classes: classes.filter(c => matchesSingleClass(eff, c))
    }, 200, origin);
  }

  if (path === "/api/classes" && method === "POST") {
    if (!(await hasPermission(env, user, "manage_classes"))) return fail("فقط مدیر یا معاون مجاز به تعریف کلاس است", 403, origin);
    const data = await body(request);
    const name = String(data?.name || "").trim();
    if (!name) return fail("نام کلاس الزامی است", 400, origin);
    const id = crypto.randomUUID();
    const cls = {
      id,
      name,
      gradeLevel: String(data.gradeLevel || "هفتم"),
      academicYear: String(data.academicYear || DEFAULT_SETTINGS.academicYear),
      capacity: Number(data.capacity) || 30,
      room: String(data.room || ""),
      teacherIds: Array.isArray(data.teacherIds) ? data.teacherIds : [],
      subjectIds: Array.isArray(data.subjectIds) ? data.subjectIds : [],
      createdAt: new Date().toISOString()
    };
    await env.SCHOOL_KV.put(`class:${id}`, JSON.stringify(cls));
    if (cls.teacherIds.length > 0) {
      await syncClassTeachersInKV(env, id, cls.teacherIds);
    }
    return json({ success: true, cls, message: "کلاس جدید ایجاد شد" }, 201, origin);
  }

  const classIdMatch = path.match(/^\/api\/classes\/([^/]+)$/);
  if (classIdMatch) {
    if (!(await hasPermission(env, user, "manage_classes"))) return fail("دسترسی غیرمجاز", 403, origin);
    const id = decodeURIComponent(classIdMatch[1]);
    if (method === "PATCH" || method === "PUT") {
      const existing = await env.SCHOOL_KV.get(`class:${id}`, "json");
      const data = await body(request);
      const updated = {
        ...(existing || { id, createdAt: new Date().toISOString() }),
        name: String(data?.name || existing?.name || id).trim(),
        gradeLevel: String(data?.gradeLevel || existing?.gradeLevel || "هفتم"),
        capacity: Number(data?.capacity || existing?.capacity || 30),
        room: String(data?.room ?? existing?.room ?? ""),
        teacherIds: Array.isArray(data?.teacherIds) ? data.teacherIds : (existing?.teacherIds || []),
        subjectIds: Array.isArray(data?.subjectIds) ? data.subjectIds : (existing?.subjectIds || [])
      };
      await env.SCHOOL_KV.put(`class:${id}`, JSON.stringify(updated));
      if (Array.isArray(data?.teacherIds)) {
        await syncClassTeachersInKV(env, id, updated.teacherIds);
      }
      return json({ success: true, cls: updated, message: "کلاس به‌روزرسانی شد" }, 200, origin);
    }
    if (method === "DELETE") {
      await env.SCHOOL_KV.delete(`class:${id}`);
      await syncClassTeachersInKV(env, id, []);
      return json({ success: true, message: "کلاس حذف شد" }, 200, origin);
    }
  }

  // SUBJECTS
  if (path === "/api/subjects" && method === "GET") {
    const subjects = await listValues(env, "subject:");
    return json({ success: true, subjects }, 200, origin);
  }

  if (path === "/api/subjects" && method === "POST") {
    if (!(await hasPermission(env, user, "manage_subjects"))) return fail("فقط مدیر یا معاون مجاز به تعریف درس است", 403, origin);
    const data = await body(request);
    const name = String(data?.name || "").trim();
    if (!name) return fail("نام درس الزامی است", 400, origin);
    const id = crypto.randomUUID();
    const subject = {
      id,
      name,
      code: String(data.code || `SUB-${id.slice(0, 4).toUpperCase()}`),
      gradeLevel: String(data.gradeLevel || "هفتم"),
      coefficient: Number(data.coefficient) || 2,
      teacherId: data.teacherId || undefined,
      teacherIds: Array.isArray(data.teacherIds) ? data.teacherIds : [],
      createdAt: new Date().toISOString()
    };
    await env.SCHOOL_KV.put(`subject:${id}`, JSON.stringify(subject));
    return json({ success: true, subject, message: "درس جدید ثبت شد" }, 201, origin);
  }

  const subjectIdMatch = path.match(/^\/api\/subjects\/([^/]+)$/);
  if (subjectIdMatch) {
    if (!(await hasPermission(env, user, "manage_subjects"))) return fail("دسترسی غیرمجاز", 403, origin);
    const id = decodeURIComponent(subjectIdMatch[1]);
    if (method === "PATCH" || method === "PUT") {
      const existing = await env.SCHOOL_KV.get(`subject:${id}`, "json");
      if (!existing) return fail("درس یافت نشد", 404, origin);
      const data = await body(request);
      const updated = { ...existing, ...data, id };
      await env.SCHOOL_KV.put(`subject:${id}`, JSON.stringify(updated));
      return json({ success: true, subject: updated, message: "درس به‌روزرسانی شد" }, 200, origin);
    }
    if (method === "DELETE") {
      await env.SCHOOL_KV.delete(`subject:${id}`);
      return json({ success: true, message: "درس حذف شد" }, 200, origin);
    }
  }

  // SCHEDULES
  if (path === "/api/schedules" && method === "GET") {
    const schedules = await listValues(env, "schedule:");
    if (isStudentOrParent(user.role)) {
      const eff = await resolveEffectiveStudent(env, user);
      const classes = await listValues(env, "class:");
      const stuCls = classes.find(c => matchesSingleClass(eff, c));
      const filtered = schedules.filter(s =>
        (eff.classId && s.classId === eff.classId) ||
        (eff.className && s.classId === eff.className) ||
        (stuCls && (s.classId === stuCls.id || s.classId === stuCls.name))
      );
      return json({ success: true, schedules: filtered }, 200, origin);
    }
    if (user.role === "teacher") {
      const classes = await listValues(env, "class:");
      const allowed = getTeacherAllowedClassIds(user, classes);
      return json({
        success: true,
        schedules: schedules.filter(s => s.teacherId === user.id || allowed.has(s.classId))
      }, 200, origin);
    }
    return json({ success: true, schedules }, 200, origin);
  }

  if (path === "/api/schedules" && method === "POST") {
    if (!(await hasPermission(env, user, "manage_schedules"))) return fail("دسترسی غیرمجاز", 403, origin);
    const data = await body(request);
    if (!data?.classId || !data?.subjectId) return fail("اطلاعات زنگ درسی ناقص است", 400, origin);
    const id = crypto.randomUUID();
    const slot = {
      id,
      classId: data.classId,
      subjectId: data.subjectId,
      teacherId: data.teacherId || "",
      dayOfWeek: Number(data.dayOfWeek ?? 0),
      period: Number(data.period ?? data.periodIndex ?? 1),
      periodIndex: Number(data.periodIndex ?? data.period ?? 1),
      startTime: String(data.startTime || "08:00"),
      endTime: String(data.endTime || "09:15"),
      room: String(data.room || "")
    };
    await env.SCHOOL_KV.put(`schedule:${id}`, JSON.stringify(slot));
    return json({ success: true, slot, message: "زنگ درسی ثبت شد" }, 201, origin);
  }

  const scheduleIdMatch = path.match(/^\/api\/schedules\/([^/]+)$/);
  if (scheduleIdMatch && method === "DELETE") {
    if (!(await hasPermission(env, user, "manage_schedules"))) return fail("دسترسی غیرمجاز", 403, origin);
    await env.SCHOOL_KV.delete(`schedule:${decodeURIComponent(scheduleIdMatch[1])}`);
    return json({ success: true, message: "زنگ درسی حذف شد" }, 200, origin);
  }

  // GRADES (Admin, Deputy & Teacher write with permission + class scope; Student/Parent reads own)
  if (path === "/api/grades" && method === "POST") {
    if (isStudentOrParent(user.role)) {
      return fail("دانش‌آموز و اولیا مجاز به ثبت نمره نیستند", 403, origin);
    }
    const canAll = await hasPermission(env, user, "manage_grades");
    const canAssigned = await hasPermission(env, user, "manage_assigned_grades");
    if (!canAll && !canAssigned) {
      return fail("مدیر سامانه مجوز ثبت نمره را برای نقش شما غیرفعال کرده است", 403, origin);
    }

    const data = await body(request);
    if (!data) return fail("درخواست نامعتبر است", 400, origin);

    const student = await getUser(env, String(data.studentId || ""));
    if (!student || student.role !== "student") {
      return fail("دانش‌آموز پیدا نشد", 404, origin);
    }

    const targetClassId = String(data.classId || student.classId || student.className || "").trim();
    if (user.role === "teacher" && !canAll) {
      const classes = await listValues(env, "class:");
      const allowed = getTeacherAllowedClassIds(user, classes);
      const classOk = (targetClassId && allowed.has(targetClassId)) || matchesClassSet(student, allowed);
      if (!classOk) {
        return fail("شما فقط مجاز به ثبت نمره برای کلاس‌های اختصاص‌یافته به خود هستید", 403, origin);
      }
    }

    const score = Number(data.score);
    const maxScore = Number(data.maxScore ?? 20);
    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore) {
      return fail("نمره واردشده معتبر نیست", 400, origin);
    }

    const subjectName = String(data.subject || data.subjectName || data.subjectId || "عمومی").trim();
    const id = crypto.randomUUID();
    const record = {
      id,
      studentId: student.id,
      studentName: student.name,
      classId: targetClassId,
      className: student.className || targetClassId,
      subject: subjectName,
      subjectId: String(data.subjectId || subjectName),
      subjectName,
      teacherId: user.id,
      score,
      maxScore,
      term: String(data.term || "نوبت اول").trim(),
      title: String(data.title || data.description || subjectName).trim(),
      description: String(data.description || data.note || data.title || "").trim(),
      note: String(data.note || data.description || "").trim(),
      date: String(data.date || new Date().toISOString().slice(0, 10)),
      createdBy: user.id,
      createdAt: new Date().toISOString()
    };

    await env.SCHOOL_KV.put(`grade:${student.id}:${id}`, JSON.stringify(record));
    await logActivity(env, user, "grade_created", { gradeId: id, studentId: student.id });

    return json({ success: true, grade: normalizeGrade(record), message: "نمره با موفقیت ثبت شد" }, 201, origin);
  }

  if (path === "/api/grades" && method === "GET") {
    const requestedStudentId = url.searchParams.get("studentId")?.trim();
    let rawGrades = [];

    if (isStudentOrParent(user.role)) {
      const eff = await resolveEffectiveStudent(env, user);
      rawGrades = await listValues(env, `grade:${eff.id}:`);
    } else if (user.role === "teacher") {
      const canAll = await hasPermission(env, user, "manage_grades", "view_reports");
      const canAssigned = await hasPermission(env, user, "manage_assigned_grades", "view_class_reports", "view_assigned_classes");
      if (!canAll && !canAssigned) {
        return json({ success: true, grades: [] }, 200, origin);
      }
      rawGrades = requestedStudentId
        ? await listValues(env, `grade:${requestedStudentId}:`)
        : await listValues(env, "grade:");
      if (!canAll) {
        const classes = await listValues(env, "class:");
        const allowed = getTeacherAllowedClassIds(user, classes);
        rawGrades = rawGrades.filter(g => matchesClassSet(g, allowed) || g.teacherId === user.id);
      }
    } else if (requestedStudentId) {
      rawGrades = await listValues(env, `grade:${requestedStudentId}:`);
    } else {
      rawGrades = await listValues(env, "grade:");
    }

    rawGrades.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return json({ success: true, grades: rawGrades.map(normalizeGrade) }, 200, origin);
  }

  const gradeIdMatch = path.match(/^\/api\/grades\/([^/]+)$/);
  if (gradeIdMatch) {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    const canAll = await hasPermission(env, user, "manage_grades");
    const canAssigned = await hasPermission(env, user, "manage_assigned_grades");
    if (!canAll && !canAssigned) {
      return fail("مدیر سامانه مجوز تغییر یا حذف نمره را برای نقش شما غیرفعال کرده است", 403, origin);
    }
    const gid = decodeURIComponent(gradeIdMatch[1]);
    const allGradeKeys = await listKeys(env, "grade:");
    const matchedKey = allGradeKeys.find(k => k.endsWith(`:${gid}`));
    if (!matchedKey) return fail("نمره یافت نشد", 404, origin);

    const existing = await env.SCHOOL_KV.get(matchedKey, "json");
    if (user.role === "teacher" && !canAll) {
      const classes = await listValues(env, "class:");
      const allowed = getTeacherAllowedClassIds(user, classes);
      if (!matchesClassSet(existing, allowed) && existing?.teacherId !== user.id) {
        return fail("شما مجاز به تغییر نمره این کلاس نیستید", 403, origin);
      }
    }

    if (method === "PATCH") {
      const data = await body(request);
      const updated = {
        ...existing,
        ...(data.term ? { term: data.term } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.score !== undefined ? { score: Number(data.score) } : {}),
        ...(data.maxScore !== undefined ? { maxScore: Number(data.maxScore) } : {}),
        ...(data.date ? { date: data.date } : {}),
        ...(data.note !== undefined ? { note: data.note, description: data.note } : {})
      };
      await env.SCHOOL_KV.put(matchedKey, JSON.stringify(updated));
      return json({ success: true, grade: normalizeGrade(updated), message: "نمره ویرایش شد" }, 200, origin);
    }

    if (method === "DELETE") {
      await env.SCHOOL_KV.delete(matchedKey);
      return json({ success: true, message: "نمره حذف شد" }, 200, origin);
    }
  }

  // ATTENDANCE (Admin, Deputy & Teacher write single/batch with permission + class scope; Student/Parent reads own)
  if (path === "/api/attendance" && method === "POST") {
    if (isStudentOrParent(user.role)) {
      return fail("دانش‌آموز و اولیا مجاز به ثبت حضور و غیاب نیستند", 403, origin);
    }
    const canAll = await hasPermission(env, user, "manage_attendance");
    const canAssigned = await hasPermission(env, user, "manage_assigned_attendance");
    if (!canAll && !canAssigned) {
      return fail("مدیر سامانه مجوز ثبت حضور و غیاب را برای نقش شما غیرفعال کرده است", 403, origin);
    }

    const data = await body(request);
    if (!data) return fail("درخواست نامعتبر است", 400, origin);

    const student = await getUser(env, String(data.studentId || ""));
    const status = String(data.status || "present");
    if (!student || student.role !== "student") return fail("دانش‌آموز پیدا نشد", 404, origin);
    if (!["present", "absent", "late", "excused"].includes(status)) return fail("وضعیت حضور و غیاب معتبر نیست", 400, origin);

    const targetClassId = String(data.classId || student.classId || student.className || "").trim();
    if (user.role === "teacher" && !canAll) {
      const classes = await listValues(env, "class:");
      const allowed = getTeacherAllowedClassIds(user, classes);
      if (!((targetClassId && allowed.has(targetClassId)) || matchesClassSet(student, allowed))) {
        return fail("شما مجاز به ثبت حضور و غیاب این کلاس نیستید", 403, origin);
      }
    }

    const date = String(data.date || new Date().toISOString().slice(0, 10));
    const id = crypto.randomUUID();
    const record = {
      id,
      studentId: student.id,
      studentName: student.name,
      classId: targetClassId,
      className: student.className || targetClassId,
      subjectId: data.subjectId || undefined,
      teacherId: user.id,
      date,
      status,
      note: String(data.note || data.description || "").trim(),
      description: String(data.description || data.note || "").trim(),
      createdBy: user.id,
      createdAt: new Date().toISOString()
    };

    await env.SCHOOL_KV.put(`attendance:${student.id}:${date}:${id}`, JSON.stringify(record));
    await logActivity(env, user, "attendance_created", { studentId: student.id });
    return json({ success: true, attendance: normalizeAttendance(record), message: "حضور و غیاب ثبت شد" }, 201, origin);
  }

  if (path === "/api/attendance/batch" && method === "POST") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    const canAll = await hasPermission(env, user, "manage_attendance");
    const canAssigned = await hasPermission(env, user, "manage_assigned_attendance");
    if (!canAll && !canAssigned) {
      return fail("مدیر سامانه مجوز ثبت حضور و غیاب را برای نقش شما غیرفعال کرده است", 403, origin);
    }

    const data = await body(request);
    if (user.role === "teacher" && !canAll) {
      const classes = await listValues(env, "class:");
      const allowed = getTeacherAllowedClassIds(user, classes);
      if (!data?.classId || !allowed.has(data.classId)) {
        return fail("شما مجاز به ثبت حضور و غیاب برای این کلاس نیستید", 403, origin);
      }
    }

    const entries = Array.isArray(data?.entries) ? data.entries : [];
    const date = String(data?.date || new Date().toISOString().slice(0, 10));
    const created = [];

    await Promise.all(
      entries.map(async entry => {
        const student = await getUser(env, String(entry.studentId || ""));
        if (!student) return;
        const id = crypto.randomUUID();
        const status = ["present", "absent", "late", "excused"].includes(entry.status) ? entry.status : "present";
        const record = {
          id,
          studentId: student.id,
          studentName: student.name,
          classId: data?.classId || student.classId || student.className || "",
          className: student.className || "",
          subjectId: data?.subjectId || undefined,
          teacherId: user.id,
          date,
          status,
          note: String(entry.note || "").trim(),
          description: String(entry.note || "").trim(),
          createdBy: user.id,
          createdAt: new Date().toISOString()
        };
        await env.SCHOOL_KV.put(`attendance:${student.id}:${date}:${id}`, JSON.stringify(record));
        created.push(normalizeAttendance(record));
      })
    );

    return json({ success: true, records: created, message: "حضور و غیاب کلاس ثبت شد" }, 201, origin);
  }

  if (path === "/api/attendance" && method === "GET") {
    const requestedStudentId = url.searchParams.get("studentId")?.trim();
    let records = [];
    if (isStudentOrParent(user.role)) {
      const eff = await resolveEffectiveStudent(env, user);
      records = await listValues(env, `attendance:${eff.id}:`);
    } else if (user.role === "teacher") {
      const canAll = await hasPermission(env, user, "manage_attendance", "view_reports");
      const canAssigned = await hasPermission(env, user, "manage_assigned_attendance", "view_class_reports", "view_assigned_classes");
      if (!canAll && !canAssigned) {
        return json({ success: true, attendance: [] }, 200, origin);
      }
      records = requestedStudentId
        ? await listValues(env, `attendance:${requestedStudentId}:`)
        : await listValues(env, "attendance:");
      if (!canAll) {
        const classes = await listValues(env, "class:");
        const allowed = getTeacherAllowedClassIds(user, classes);
        records = records.filter(a => matchesClassSet(a, allowed) || a.teacherId === user.id);
      }
    } else if (requestedStudentId) {
      records = await listValues(env, `attendance:${requestedStudentId}:`);
    } else {
      records = await listValues(env, "attendance:");
    }
    records.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return json({ success: true, attendance: records.map(normalizeAttendance) }, 200, origin);
  }

  const attIdMatch = path.match(/^\/api\/attendance\/([^/]+)$/);
  if (attIdMatch && method === "DELETE") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    const canAll = await hasPermission(env, user, "manage_attendance");
    const canAssigned = await hasPermission(env, user, "manage_assigned_attendance");
    if (!canAll && !canAssigned) {
      return fail("مدیر سامانه مجوز حذف حضور و غیاب را برای نقش شما غیرفعال کرده است", 403, origin);
    }
    const aid = decodeURIComponent(attIdMatch[1]);
    const keys = await listKeys(env, "attendance:");
    const matched = keys.find(k => k.endsWith(`:${aid}`));
    if (matched) {
      if (user.role === "teacher" && !canAll) {
        const rec = await env.SCHOOL_KV.get(matched, "json");
        const classes = await listValues(env, "class:");
        const allowed = getTeacherAllowedClassIds(user, classes);
        if (rec && !matchesClassSet(rec, allowed) && rec.teacherId !== user.id) {
          return fail("شما مجاز به حذف رکورد این کلاس نیستید", 403, origin);
        }
      }
      await env.SCHOOL_KV.delete(matched);
    }
    return json({ success: true, message: "رکورد حضور و غیاب حذف شد" }, 200, origin);
  }

  // HOMEWORK & ASSIGNMENTS + SUBMISSIONS
  if ((path === "/api/homework" || path === "/api/assignments") && method === "POST") {
    if (isStudentOrParent(user.role)) {
      return fail("فقط مدیر، معاون یا دبیر می‌تواند تکلیف ثبت کند", 403, origin);
    }
    const canAll = await hasPermission(env, user, "manage_assignments");
    const canAssigned = await hasPermission(env, user, "manage_assigned_assignments");
    if (!canAll && !canAssigned) {
      return fail("مدیر سامانه مجوز ثبت تکلیف را برای نقش شما غیرفعال کرده است", 403, origin);
    }

    const data = await body(request);
    if (!data) return fail("درخواست نامعتبر است", 400, origin);

    const targetClassId = String(data.classId || data.className || "").trim();
    if (user.role === "teacher" && !canAll && targetClassId) {
      const classes = await listValues(env, "class:");
      const allowed = getTeacherAllowedClassIds(user, classes);
      if (!allowed.has(targetClassId)) {
        return fail("شما مجاز به تعریف تکلیف برای این کلاس نیستید", 403, origin);
      }
    }

    const title = String(data.title || "").trim();
    const subject = String(data.subject || data.subjectName || data.subjectId || "عمومی").trim();
    if (!title) return fail("عنوان تکلیف الزامی است", 400, origin);

    const id = crypto.randomUUID();
    const homework = {
      id,
      title,
      subject,
      subjectId: String(data.subjectId || subject),
      subjectName: subject,
      description: String(data.description || "").trim(),
      grade: String(data.grade || "").trim(),
      classId: targetClassId,
      className: String(data.className || data.classId || "").trim(),
      dueDate: String(data.dueDate || "").trim(),
      maxScore: Number(data.maxScore ?? 20) || 20,
      teacherId: user.id,
      teacherName: user.name,
      createdBy: user.id,
      createdAt: new Date().toISOString()
    };

    await env.SCHOOL_KV.put(`homework:${id}`, JSON.stringify(homework));
    await logActivity(env, user, "homework_created", { homeworkId: id });
    return json({
      success: true,
      homework,
      assignment: normalizeHomework(homework),
      message: "تکلیف جدید ثبت شد"
    }, 201, origin);
  }

  if ((path === "/api/homework" || path === "/api/assignments") && method === "GET") {
    const [all, users, allSubs, classes] = await Promise.all([
      listValues(env, "homework:"),
      getAllUsers(env),
      listValues(env, "submission:"),
      listValues(env, "class:")
    ]);
    const userMap = new Map(users.map(u => [u.id, u]));
    const effUser = isStudentOrParent(user.role) ? await resolveEffectiveStudent(env, user) : user;

    let visible = all;
    if (user.role === "teacher") {
      const canAll = await hasPermission(env, user, "manage_assignments", "view_reports");
      if (!canAll) {
        const allowed = getTeacherAllowedClassIds(user, classes);
        visible = all.filter(item => matchesClassSet(item, allowed) || item.teacherId === user.id);
      }
    } else if (isStudentOrParent(user.role)) {
      visible = all.filter(item =>
        (!item.grade || item.grade === effUser.grade) &&
        (!item.className && !item.classId ? true : (item.className === effUser.className || item.classId === effUser.className || item.classId === effUser.classId || item.className === effUser.classId))
      );
    }

    visible.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    const assignments = visible.map(hw => {
      const base = normalizeHomework(hw, userMap);
      const subs = allSubs.filter(s => s.assignmentId === hw.id);
      const mySub = subs.find(s => s.studentId === effUser.id) || null;
      return {
        ...base,
        mySubmission: mySub,
        submissionsCount: subs.length,
        gradedCount: subs.filter(s => typeof s.score === "number").length
      };
    });

    return json({ success: true, homework: visible, assignments }, 200, origin);
  }

  const hwDeleteMatch = path.match(/^\/api\/(?:homework|assignments)\/([^/]+)$/);
  if (hwDeleteMatch && method === "DELETE") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    const canAll = await hasPermission(env, user, "manage_assignments");
    const canAssigned = await hasPermission(env, user, "manage_assigned_assignments");
    if (!canAll && !canAssigned) return fail("مدیر سامانه مجوز حذف تکلیف را برای نقش شما غیرفعال کرده است", 403, origin);
    const hwId = decodeURIComponent(hwDeleteMatch[1]);
    if (user.role === "teacher" && !canAll) {
      const hw = await env.SCHOOL_KV.get(`homework:${hwId}`, "json");
      const classes = await listValues(env, "class:");
      const allowed = getTeacherAllowedClassIds(user, classes);
      if (hw && !matchesClassSet(hw, allowed) && hw.teacherId !== user.id) {
        return fail("شما مجاز به حذف این تکلیف نیستید", 403, origin);
      }
    }
    await env.SCHOOL_KV.delete(`homework:${hwId}`);
    return json({ success: true, message: "تکلیف حذف شد" }, 200, origin);
  }

  const submitMatch = path.match(/^\/api\/assignments\/([^/]+)\/submit$/);
  if (submitMatch && method === "POST") {
    if (user.role !== "student") return fail("فقط دانش‌آموز می‌تواند تکلیف ارسال کند", 403, origin);
    const settings = await getSchoolSettings(env);
    if (settings.allowStudentAssignmentSubmission === false) {
      return fail("ارسال تکلیف توسط دانش‌آموزان موقتاً غیرفعال شده است", 403, origin);
    }
    const assignmentId = decodeURIComponent(submitMatch[1]);
    const data = await body(request);
    const content = String(data?.content || data?.submittedText || "").trim();
    if (!content) return fail("متن پاسخ تکلیف الزامی است", 400, origin);

    const existing = await env.SCHOOL_KV.get(`submission:${assignmentId}:${user.id}`, "json");
    const sub = {
      id: existing?.id || crypto.randomUUID(),
      assignmentId,
      studentId: user.id,
      studentName: user.name,
      content,
      submittedText: content,
      attachmentName: data?.attachmentName || undefined,
      submittedAt: new Date().toISOString(),
      status: "submitted",
      score: existing?.score,
      feedback: existing?.feedback
    };
    await env.SCHOOL_KV.put(`submission:${assignmentId}:${user.id}`, JSON.stringify(sub));

    // Grant +5 coins on first submission
    if (!existing) {
      user.coins = (user.coins || 0) + 5;
      await saveUser(env, user);
    }
    return json({ success: true, submission: sub, message: "تکلیف شما با موفقیت ارسال شد" }, 201, origin);
  }

  const subsListMatch = path.match(/^\/api\/assignments\/([^/]+)\/submissions$/);
  if (subsListMatch && method === "GET") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    const assignmentId = decodeURIComponent(subsListMatch[1]);
    const [hw, allUsers, subs] = await Promise.all([
      env.SCHOOL_KV.get(`homework:${assignmentId}`, "json"),
      getAllUsers(env),
      listValues(env, `submission:${assignmentId}:`)
    ]);
    const subMap = new Map(subs.map(s => [s.studentId, s]));
    const targetStudents = allUsers
      .filter(u => u.role === "student" && (!hw?.className && !hw?.classId ? true : (u.className === hw.className || u.classId === hw.classId || u.className === hw.classId || u.classId === hw.className)));

    const rows = targetStudents.map(stu => ({
      student: safeUser(stu),
      studentId: stu.id,
      studentName: stu.name,
      submission: subMap.get(stu.id) || null
    }));
    return json({ success: true, rows }, 200, origin);
  }

  if (path === "/api/submissions/grade" && method === "POST") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    const canAll = await hasPermission(env, user, "manage_assignments");
    const canAssigned = await hasPermission(env, user, "manage_assigned_assignments");
    if (!canAll && !canAssigned) {
      return fail("مدیر سامانه مجوز نمره‌دهی تکالیف را برای نقش شما غیرفعال کرده است", 403, origin);
    }
    const data = await body(request);
    const { submissionId, assignmentId, studentId, score, feedback } = data || {};
    let targetKey = assignmentId && studentId ? `submission:${assignmentId}:${studentId}` : null;
    let existing = targetKey ? await env.SCHOOL_KV.get(targetKey, "json") : null;

    if (!existing && submissionId) {
      const allSubs = await listKeys(env, "submission:");
      for (const k of allSubs) {
        const s = await env.SCHOOL_KV.get(k, "json");
        if (s && s.id === submissionId) {
          existing = s;
          targetKey = k;
          break;
        }
      }
    }

    if (!existing || !targetKey) return fail("تحویل تکلیف یافت نشد", 404, origin);
    const updated = {
      ...existing,
      score: Number(score),
      feedback: String(feedback || ""),
      status: "graded",
      gradedAt: new Date().toISOString(),
      gradedBy: user.id
    };
    await env.SCHOOL_KV.put(targetKey, JSON.stringify(updated));
    return json({ success: true, submission: updated, message: "نمره تکلیف ثبت شد" }, 200, origin);
  }

  // ANNOUNCEMENTS
  if (path === "/api/announcements" && method === "POST") {
    if (isStudentOrParent(user.role)) {
      return fail("دانش‌آموز و اولیا مجاز به انتشار اطلاعیه نیستند", 403, origin);
    }
    if (!(await hasPermission(env, user, "manage_announcements", "send_class_announcements"))) {
      return fail("مدیر سامانه مجوز ارسال اطلاعیه را برای نقش شما غیرفعال کرده است", 403, origin);
    }

    const data = await body(request);
    if (!data) return fail("درخواست نامعتبر است", 400, origin);

    const title = String(data.title || "").trim();
    const message = String(data.message ?? data.body ?? "").trim();
    if (!title || !message) return fail("عنوان و متن اطلاعیه الزامی است", 400, origin);

    const targetType = data.targetType || "all";
    const id = crypto.randomUUID();
    const announcement = {
      id,
      title,
      message,
      body: message,
      targetType,
      targetGrade: targetType === "teachers" ? "teachers" : String(data.targetGrade || "").trim(),
      targetClass: String(data.targetClassId || data.targetClass || "").trim(),
      targetClassId: String(data.targetClassId || data.targetClass || "").trim(),
      priority: data.priority || "normal",
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      createdBy: user.id,
      createdAt: new Date().toISOString()
    };

    await env.SCHOOL_KV.put(`announcement:${id}`, JSON.stringify(announcement));
    await logActivity(env, user, "announcement_created", { announcementId: id });

    return json({
      success: true,
      announcement: normalizeAnnouncement(announcement),
      message: "اطلاعیه منتشر شد"
    }, 201, origin);
  }

  if (path === "/api/announcements" && method === "GET") {
    const [all, users] = await Promise.all([listValues(env, "announcement:"), getAllUsers(env)]);
    const userMap = new Map(users.map(u => [u.id, u]));
    const effUser = isStudentOrParent(user.role) ? await resolveEffectiveStudent(env, user) : user;

    const visible = isAdminOrDeputy(user.role)
      ? all
      : all.filter(item => {
          const tt = item.targetType || (item.targetClass ? "class" : item.targetGrade === "teachers" ? "teachers" : "all");
          if (user.role === "teacher") {
            return tt === "all" || tt === "teachers" || item.authorId === user.id;
          }
          // student / parent
          if (tt === "teachers" || item.targetGrade === "teachers") return false;
          if (item.targetClass && item.targetClass !== effUser.className && item.targetClass !== effUser.classId) return false;
          if (item.targetGrade && item.targetGrade !== "all" && item.targetGrade !== "students" && item.targetGrade !== effUser.grade) {
            return false;
          }
          return true;
        });

    visible.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return json({ success: true, announcements: visible.map(a => normalizeAnnouncement(a, userMap)) }, 200, origin);
  }

  const annDeleteMatch = path.match(/^\/api\/announcements\/([^/]+)$/);
  if (annDeleteMatch && method === "DELETE") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "manage_announcements", "send_class_announcements"))) {
      return fail("مدیر سامانه مجوز حذف اطلاعیه را برای نقش شما غیرفعال کرده است", 403, origin);
    }
    const id = decodeURIComponent(annDeleteMatch[1]);
    if (user.role === "teacher" && !(await hasPermission(env, user, "manage_announcements"))) {
      const ann = await env.SCHOOL_KV.get(`announcement:${id}`, "json");
      if (ann && ann.authorId !== user.id) return fail("فقط نویسنده اطلاعیه یا مدیر مجاز به حذف است", 403, origin);
    }
    await env.SCHOOL_KV.delete(`announcement:${id}`);
    return json({ success: true, message: "اطلاعیه حذف شد" }, 200, origin);
  }

  // DIRECT MESSAGES
  if (path === "/api/messages" && method === "GET") {
    const all = await listValues(env, "message:");
    const mine = all.filter(m =>
      m.senderId === user.id ||
      (Array.isArray(m.recipientIds) && m.recipientIds.includes(user.id)) ||
      (m.recipientRole && m.recipientRole === user.role)
    );
    mine.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return json({ success: true, messages: mine }, 200, origin);
  }

  if (path === "/api/messages" && method === "POST") {
    const data = await body(request);
    if (!data?.subject || !data?.body) return fail("موضوع و متن پیام الزامی است", 400, origin);
    const id = crypto.randomUUID();
    const msg = {
      id,
      senderId: user.id,
      senderName: user.name,
      senderRole: user.role,
      recipientIds: Array.isArray(data.recipientIds) ? data.recipientIds : [],
      recipientRole: data.recipientRole || undefined,
      recipientClassId: data.recipientClassId || undefined,
      subject: String(data.subject).trim(),
      body: String(data.body).trim(),
      readBy: [user.id],
      createdAt: new Date().toISOString()
    };
    await env.SCHOOL_KV.put(`message:${id}`, JSON.stringify(msg));
    return json({ success: true, messageItem: msg, message: "پیام ارسال شد" }, 201, origin);
  }

  const msgReadMatch = path.match(/^\/api\/messages\/([^/]+)\/read$/);
  if (msgReadMatch && method === "POST") {
    const id = decodeURIComponent(msgReadMatch[1]);
    const msg = await env.SCHOOL_KV.get(`message:${id}`, "json");
    if (msg && !msg.readBy.includes(user.id)) {
      msg.readBy.push(user.id);
      await env.SCHOOL_KV.put(`message:${id}`, JSON.stringify(msg));
    }
    return json({ success: true }, 200, origin);
  }

  // LIVE USER-TO-USER CHAT
  if (path === "/api/chat/contacts" && method === "GET") {
    const users = await getAllUsers(env);
    const contacts = users
      .filter(u => u.id !== user.id && u.active !== false)
      .map(u => ({
        id: u.id,
        fullName: u.name || u.username,
        username: u.username,
        role: u.role,
        gradeLevel: u.grade || undefined,
        classId: u.className || undefined,
        className: u.className || undefined,
        avatarUrl: u.avatarUrl || undefined,
        online: true
      }));
    return json({ success: true, contacts }, 200, origin);
  }

  if (path === "/api/chat/threads" && method === "GET") {
    const [allMsgs, users] = await Promise.all([listValues(env, "chat:"), getAllUsers(env)]);
    const userMap = new Map(users.map(u => [u.id, u]));
    const threadsMap = new Map();

    for (const m of allMsgs) {
      if (m.senderId !== user.id && m.recipientId !== user.id) continue;
      const peerId = m.senderId === user.id ? m.recipientId : m.senderId;
      const peer = userMap.get(peerId);
      if (!peer) continue;
      const existing = threadsMap.get(peerId) || {
        threadId: m.threadId,
        peer: {
          id: peer.id,
          fullName: peer.name || peer.username,
          username: peer.username,
          role: peer.role,
          gradeLevel: peer.grade || undefined,
          classId: peer.className || undefined,
          className: peer.className || undefined,
          avatarUrl: peer.avatarUrl || undefined,
          online: true
        },
        lastMessage: null,
        unreadCount: 0,
        updatedAt: m.createdAt
      };

      if (!existing.lastMessage || String(m.createdAt) >= String(existing.lastMessage.createdAt)) {
        existing.lastMessage = m;
        existing.updatedAt = m.createdAt;
      }
      if (m.recipientId === user.id && (!Array.isArray(m.readBy) || !m.readBy.includes(user.id))) {
        existing.unreadCount += 1;
      }
      threadsMap.set(peerId, existing);
    }

    const threads = Array.from(threadsMap.values()).sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))
    );
    return json({ success: true, threads }, 200, origin);
  }

  const chatMsgsMatch = path.match(/^\/api\/chat\/threads\/([^/]+)\/messages$/);
  if (chatMsgsMatch && method === "GET") {
    const peerId = decodeURIComponent(chatMsgsMatch[1]);
    const threadId = [user.id, peerId].sort().join("__");
    const messages = await listValues(env, `chat:${threadId}:`);
    messages.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    return json({ success: true, messages }, 200, origin);
  }

  if (path === "/api/chat/messages" && method === "POST") {
    const data = await body(request);
    const recipientId = String(data?.recipientId || "").trim();
    const text = String(data?.body || "").trim();
    if (!recipientId || !text) return fail("گیرنده و متن پیام الزامی است", 400, origin);
    const peer = await getUser(env, recipientId);
    if (!peer) return fail("کاربر مقصد یافت نشد", 404, origin);

    const threadId = [user.id, recipientId].sort().join("__");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const message = {
      id,
      threadId,
      senderId: user.id,
      senderName: user.name,
      senderRole: user.role,
      recipientId,
      body: text,
      readBy: [user.id],
      createdAt: now
    };
    await env.SCHOOL_KV.put(`chat:${threadId}:${now}:${id}`, JSON.stringify(message));
    return json({ success: true, message }, 201, origin);
  }

  const chatReadMatch = path.match(/^\/api\/chat\/threads\/([^/]+)\/read$/);
  if (chatReadMatch && method === "POST") {
    const peerId = decodeURIComponent(chatReadMatch[1]);
    const threadId = [user.id, peerId].sort().join("__");
    const keys = await listKeys(env, `chat:${threadId}:`);
    await Promise.all(
      keys.map(async k => {
        const m = await env.SCHOOL_KV.get(k, "json");
        if (m && m.recipientId === user.id && (!Array.isArray(m.readBy) || !m.readBy.includes(user.id))) {
          m.readBy = [...(m.readBy || []), user.id];
          await env.SCHOOL_KV.put(k, JSON.stringify(m));
        }
      })
    );
    return json({ success: true }, 200, origin);
  }

  // EXAM & ASSESSMENT HELPERS
  function normalizeExamText(val) {
    return String(val || "")
      .trim()
      .replace(/ي/g, "ی")
      .replace(/ك/g, "ک")
      .replace(/\u200c+/g, " ")
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function shuffleArrayWorker(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function sanitizeExamForLearner(ex, myAttempt) {
    if (myAttempt) return ex;
    return {
      ...ex,
      questions: (ex.questions || []).map(q => ({
        ...q,
        correctIndex: -1,
        correctText: undefined,
        explanation: undefined
      }))
    };
  }

  function gradeWorkerExam(exam, answersInput) {
    const isArr = Array.isArray(answersInput);
    let score = 0;
    let maxScore = 0;
    let needsManualGrading = false;
    const normalizedAnswers = [];
    const questionScores = [];

    (exam.questions || []).forEach((q, idx) => {
      const pts = Number(q.points || 1);
      maxScore += pts;
      const qType = q.type || "mcq";
      const ans = isArr
        ? answersInput[idx]
        : answersInput && typeof answersInput === "object"
          ? answersInput[q.id] !== undefined
            ? answersInput[q.id]
            : answersInput[idx]
          : undefined;
      normalizedAnswers.push(ans !== undefined ? ans : qType === "descriptive" || qType === "fill_blank" ? "" : -1);

      if (qType === "descriptive") {
        needsManualGrading = true;
        questionScores.push({
          questionId: q.id,
          autoScore: 0,
          finalScore: 0,
          maxPoints: pts,
          needsReview: true
        });
        return;
      }

      if (qType === "fill_blank") {
        const expected = normalizeExamText(q.correctText || "");
        const given = normalizeExamText(ans);
        const matched = expected.length > 0 && given === expected;
        const earned = matched ? pts : 0;
        score += earned;
        questionScores.push({
          questionId: q.id,
          autoScore: earned,
          finalScore: earned,
          maxPoints: pts,
          needsReview: false,
          isCorrect: matched
        });
        return;
      }

      const numAns = typeof ans === "number" ? ans : Number(ans);
      const isCorrect = ans !== "" && ans !== null && ans !== undefined && !Number.isNaN(numAns) && numAns === Number(q.correctIndex);
      const earned = isCorrect ? pts : 0;
      score += earned;
      questionScores.push({
        questionId: q.id,
        autoScore: earned,
        finalScore: earned,
        maxPoints: pts,
        needsReview: false,
        isCorrect
      });
    });

    return {
      answers: normalizedAnswers,
      score: Number(score.toFixed(2)),
      maxScore: Number(maxScore.toFixed(2)),
      questionScores,
      needsManualGrading
    };
  }

  function analyzeWorkerExamQuality(exam, exAttempts) {
    const attemptsCount = exAttempts.length;
    const maxScore = (exam.questions || []).reduce((s, q) => s + Number(q.points || 1), 0);
    const averageScore = attemptsCount > 0
      ? Number((exAttempts.reduce((s, a) => s + Number(a.score ?? a.earnedPoints ?? 0), 0) / attemptsCount).toFixed(2))
      : 0;
    const pendingManualCount = exAttempts.filter(a => a.needsManualGrading).length;

    const questionStats = (exam.questions || []).map((q, qi) => {
      const qType = q.type || "mcq";
      const pts = Number(q.points || 1);
      let totalResponses = 0;
      let correctCount = 0;
      let wrongCount = 0;
      const optionCounts = qType === "mcq" || qType === "true_false"
        ? new Array(Array.isArray(q.options) ? q.options.length : 0).fill(0)
        : undefined;

      for (const att of exAttempts) {
        const detail = Array.isArray(att.questionScores)
          ? att.questionScores.find(d => d.questionId === q.id)
          : undefined;
        const ans = Array.isArray(att.answers)
          ? att.answers[qi]
          : att.answers && typeof att.answers === "object"
            ? att.answers[q.id]
            : undefined;

        if (qType === "descriptive") {
          if (detail && !detail.needsReview) {
            totalResponses += 1;
            if (Number(detail.finalScore || 0) >= pts * 0.6) correctCount += 1;
            else wrongCount += 1;
          }
          continue;
        }

        if (qType === "fill_blank") {
          totalResponses += 1;
          const ok = detail !== undefined
            ? Boolean(detail.isCorrect)
            : normalizeExamText(ans) === normalizeExamText(q.correctText || "");
          if (ok) correctCount += 1;
          else wrongCount += 1;
          continue;
        }

        totalResponses += 1;
        const numAns = typeof ans === "number" ? ans : Number(ans);
        if (optionCounts && !Number.isNaN(numAns) && numAns >= 0 && numAns < optionCounts.length) {
          optionCounts[numAns] += 1;
        }
        if (ans !== "" && ans !== null && ans !== undefined && numAns === Number(q.correctIndex)) {
          correctCount += 1;
        } else {
          wrongCount += 1;
        }
      }

      const correctRate = totalResponses > 0 ? Math.round((correctCount / totalResponses) * 100) : 0;
      const wrongRate = totalResponses > 0 ? Math.round((wrongCount / totalResponses) * 100) : 0;
      let mostChosenWrongOptionIndex = null;
      let mostChosenWrongOptionText = null;
      let mostChosenWrongCount = 0;

      if (optionCounts) {
        optionCounts.forEach((cnt, oi) => {
          if (oi !== Number(q.correctIndex) && cnt > mostChosenWrongCount) {
            mostChosenWrongCount = cnt;
            mostChosenWrongOptionIndex = oi;
            mostChosenWrongOptionText = (q.options && q.options[oi]) || null;
          }
        });
      }

      return {
        questionId: q.id,
        questionIndex: qi + 1,
        type: qType,
        prompt: q.prompt || q.text || "",
        topic: q.topic || exam.topic || exam.chapter || "مبحث عمومی",
        totalResponses,
        correctCount,
        wrongCount,
        correctRate,
        wrongRate,
        optionCounts,
        mostChosenWrongOptionIndex,
        mostChosenWrongOptionText,
        mostChosenWrongCount
      };
    });

    const responded = questionStats.filter(s => s.totalResponses > 0);
    const hardestQuestion = responded.length > 0
      ? [...responded].sort((a, b) => b.wrongCount - a.wrongCount || b.wrongRate - a.wrongRate)[0]
      : null;
    const easiestQuestion = responded.length > 0
      ? [...responded].sort((a, b) => b.correctRate - a.correctRate || b.correctCount - a.correctCount)[0]
      : null;

    const topicMap = new Map();
    for (const qs of responded) {
      const entry = topicMap.get(qs.topic) || { questionsCount: 0, wrongSum: 0, correctSum: 0, total: 0 };
      entry.questionsCount += 1;
      entry.wrongSum += qs.wrongCount;
      entry.correctSum += qs.correctCount;
      entry.total += qs.totalResponses;
      topicMap.set(qs.topic, entry);
    }
    const weakestTopics = Array.from(topicMap.entries())
      .map(([topic, d]) => ({
        topic,
        questionsCount: d.questionsCount,
        wrongRate: d.total > 0 ? Math.round((d.wrongSum / d.total) * 100) : 0,
        correctRate: d.total > 0 ? Math.round((d.correctSum / d.total) * 100) : 0
      }))
      .sort((a, b) => b.wrongRate - a.wrongRate);

    const distractorCandidate = responded
      .filter(q => (q.mostChosenWrongCount || 0) > 0 && q.mostChosenWrongOptionText)
      .sort((a, b) => (b.mostChosenWrongCount || 0) - (a.mostChosenWrongCount || 0))[0];

    const topDistractorQuestion = distractorCandidate
      ? {
          questionIndex: distractorCandidate.questionIndex,
          prompt: distractorCandidate.prompt,
          optionText: distractorCandidate.mostChosenWrongOptionText,
          selectedCount: distractorCandidate.mostChosenWrongCount || 0,
          totalResponses: distractorCandidate.totalResponses
        }
      : null;

    return {
      examId: exam.id,
      examTitle: exam.title,
      attemptsCount,
      averageScore,
      maxScore,
      pendingManualCount,
      questionStats,
      hardestQuestion,
      easiestQuestion,
      weakestTopics,
      topDistractorQuestion
    };
  }

  // ONLINE EXAMS
  if (path === "/api/exams" && method === "GET") {
    const effUser = isStudentOrParent(user.role) ? await resolveEffectiveStudent(env, user) : user;
    const [allExams, attempts, allClasses] = await Promise.all([
      listValues(env, "exam:"),
      listValues(env, "exam-attempt:"),
      user.role === "teacher" ? listValues(env, "class:") : Promise.resolve([])
    ]);

    let scoped = allExams;
    if (isStudentOrParent(user.role)) {
      if (!(await hasPermission(env, user, "view_own_assignments"))) {
        return fail("مجوز مشاهده آزمون‌ها توسط مدیر محدود شده است", 403, origin);
      }
      scoped = allExams.filter(ex => {
        if (ex.active === false || ex.published === false) return false;
        if (ex.classId) {
          return ex.classId === effUser.classId || ex.classId === effUser.className;
        }
        if (ex.gradeLevel && effUser.grade && ex.gradeLevel !== effUser.grade) return false;
        return true;
      });
    } else if (user.role === "teacher") {
      if (!(await hasPermission(env, user, "view_assigned_classes", "manage_assigned_assignments", "manage_assignments", "view_class_reports", "view_reports"))) {
        return fail("مدیر سامانه مجوز دسترسی به آزمون‌ها را برای نقش دبیر غیرفعال کرده است", 403, origin);
      }
      const hasSchoolWide = await hasPermission(env, user, "manage_assignments", "view_reports");
      if (!hasSchoolWide) {
        const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
        scoped = allExams.filter(ex => ex.teacherId === user.id || matchesClassSet(ex, allowedClasses));
      }
    }

    const exams = scoped.map(ex => {
      const exAttempts = attempts.filter(a => a.examId === ex.id);
      const myAttempt = exAttempts.find(a => a.studentId === effUser.id) || null;
      const avgScore = exAttempts.length > 0
        ? Number((exAttempts.reduce((s, a) => s + Number(a.score ?? a.earnedPoints ?? 0), 0) / exAttempts.length).toFixed(2))
        : 0;
      const pendingManualCount = exAttempts.filter(a => a.needsManualGrading).length;
      const base = isStudentOrParent(user.role) ? sanitizeExamForLearner(ex, myAttempt) : ex;
      return {
        ...base,
        myAttempt,
        attemptsCount: exAttempts.length,
        averageScore: avgScore,
        pendingManualCount
      };
    });
    exams.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return json({ success: true, exams }, 200, origin);
  }

  if (path === "/api/exams" && method === "POST") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "manage_assigned_assignments", "manage_assignments"))) {
      return fail("مدیر سامانه مجوز طراحی آزمون را برای نقش شما غیرفعال کرده است", 403, origin);
    }
    const data = await body(request);
    if (!data?.title || !Array.isArray(data.questions) || data.questions.length === 0) {
      return fail("عنوان و حداقل یک سؤال برای آزمون الزامی است", 400, origin);
    }
    if (user.role === "teacher" && data.classId && !(await hasPermission(env, user, "manage_assignments"))) {
      const allClasses = await listValues(env, "class:");
      const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
      if (allowedClasses.size > 0 && !allowedClasses.has(String(data.classId))) {
        return fail("شما فقط مجاز به ایجاد آزمون برای کلاس‌های اختصاص‌یافته خود هستید", 403, origin);
      }
    }
    const id = crypto.randomUUID();
    const exam = {
      id,
      title: String(data.title).trim(),
      description: String(data.description || "").trim(),
      classId: String(data.classId || ""),
      subjectId: String(data.subjectId || ""),
      teacherId: user.id,
      gradeLevel: data.gradeLevel || undefined,
      chapter: data.chapter || undefined,
      topic: data.topic || undefined,
      difficulty: data.difficulty || "medium",
      generatedByAI: Boolean(data.generatedByAI),
      versionLabel: data.versionLabel || "نسخه اصلی",
      durationMinutes: Number(data.durationMinutes || 20),
      dueDate: String(data.dueDate || data.endDate || "1404/10/20"),
      startDate: String(data.startDate || ""),
      endDate: String(data.endDate || ""),
      active: data.active !== false,
      published: data.published !== false,
      questions: data.questions.map(q => ({
        id: q.id || crypto.randomUUID(),
        type: q.type || "mcq",
        prompt: String(q.prompt || q.text || ""),
        text: String(q.text || q.prompt || ""),
        options: Array.isArray(q.options) ? q.options : [],
        correctIndex: q.type === "descriptive" || q.type === "fill_blank" ? -1 : Number(q.correctIndex ?? 0),
        correctText: q.correctText || undefined,
        points: Number(q.points ?? 2),
        chapter: q.chapter || undefined,
        topic: q.topic || undefined,
        difficulty: q.difficulty || undefined,
        explanation: q.explanation || ""
      })),
      createdAt: new Date().toISOString()
    };
    await env.SCHOOL_KV.put(`exam:${id}`, JSON.stringify(exam));
    await logActivity(env, user, "exam_created", { target: exam.title });
    return json({ success: true, exam, message: "آزمون آنلاین ایجاد شد" }, 201, origin);
  }

  const examCloneMatch = path.match(/^\/api\/exams\/([^/]+)\/clone-versions$/);
  if (examCloneMatch && method === "POST") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "manage_assigned_assignments", "manage_assignments"))) {
      return fail("مدیر سامانه مجوز نسخه‌سازی آزمون را غیرفعال کرده است", 403, origin);
    }
    const examId = decodeURIComponent(examCloneMatch[1]);
    const sourceExam = await env.SCHOOL_KV.get(`exam:${examId}`, "json");
    if (!sourceExam) return fail("آزمون یافت نشد", 404, origin);
    if (user.role === "teacher" && sourceExam.teacherId !== user.id && !(await hasPermission(env, user, "manage_assignments"))) {
      const allClasses = await listValues(env, "class:");
      const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
      if (!matchesClassSet(sourceExam, allowedClasses)) return fail("دسترسی غیرمجاز", 403, origin);
    }
    const data = await body(request);
    const labels = Array.isArray(data?.labels) && data.labels.length > 0 ? data.labels.slice(0, 5) : ["نسخه B", "نسخه C"];
    const groupId = sourceExam.versionGroupId || sourceExam.id;
    const now = new Date().toISOString();
    const clones = labels.map(label => {
      const shuffledQuestions = shuffleArrayWorker(sourceExam.questions || []).map(q => {
        const qType = q.type || "mcq";
        if (qType === "mcq" && Array.isArray(q.options) && q.options.length > 1) {
          const indexed = q.options.map((text, idx) => ({ text, isCorrect: idx === Number(q.correctIndex) }));
          const mixed = shuffleArrayWorker(indexed);
          const newCorrectIdx = Math.max(0, mixed.findIndex(m => m.isCorrect));
          return {
            ...q,
            id: crypto.randomUUID(),
            options: mixed.map(m => m.text),
            correctIndex: newCorrectIdx
          };
        }
        return { ...q, id: crypto.randomUUID() };
      });
      return {
        ...sourceExam,
        id: crypto.randomUUID(),
        title: `${String(sourceExam.title || "").replace(/\s*—\s*نسخه.*$/, "")} — ${String(label).trim()}`,
        teacherId: user.id,
        versionGroupId: groupId,
        versionLabel: String(label).trim(),
        questions: shuffledQuestions,
        createdAt: now
      };
    });
    await Promise.all(clones.map(c => env.SCHOOL_KV.put(`exam:${c.id}`, JSON.stringify(c))));
    await logActivity(env, user, "exam_versions_cloned", { target: sourceExam.title, count: clones.length });
    return json({ success: true, exams: clones, message: `${clones.length} نسخه متفاوت با ترتیب تصادفی سؤالات و گزینه‌ها ساخته شد.` }, 201, origin);
  }

  const examAttemptsMatch = path.match(/^\/api\/exams\/([^/]+)\/attempts$/);
  if (examAttemptsMatch && method === "GET") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "manage_assigned_assignments", "manage_assignments", "view_class_reports", "view_reports"))) {
      return fail("دسترسی غیرمجاز", 403, origin);
    }
    const examId = decodeURIComponent(examAttemptsMatch[1]);
    const exam = await env.SCHOOL_KV.get(`exam:${examId}`, "json");
    if (!exam) return fail("آزمون یافت نشد", 404, origin);
    if (user.role === "teacher" && exam.teacherId !== user.id && !(await hasPermission(env, user, "manage_assignments", "view_reports"))) {
      const allClasses = await listValues(env, "class:");
      const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
      if (!matchesClassSet(exam, allowedClasses)) return fail("دسترسی غیرمجاز", 403, origin);
    }
    const [exAttempts, allUsers] = await Promise.all([
      listValues(env, `exam-attempt:${examId}:`),
      getAllUsers(env)
    ]);
    const userMap = new Map(allUsers.map(u => [u.id, u]));
    const attempts = exAttempts
      .map(a => ({
        ...a,
        score: Number(a.score ?? a.earnedPoints ?? 0),
        maxScore: Number(a.maxScore ?? a.totalPoints ?? 0),
        studentName: a.studentName || userMap.get(a.studentId)?.name || "دانش‌آموز"
      }))
      .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
    return json({ success: true, exam, attempts }, 200, origin);
  }

  const examGradeAttemptMatch = path.match(/^\/api\/exams\/([^/]+)\/attempts\/([^/]+)\/grade$/);
  if (examGradeAttemptMatch && method === "POST") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "manage_assigned_assignments", "manage_assignments"))) {
      return fail("مدیر سامانه مجوز تصحیح آزمون را غیرفعال کرده است", 403, origin);
    }
    const examId = decodeURIComponent(examGradeAttemptMatch[1]);
    const attemptId = decodeURIComponent(examGradeAttemptMatch[2]);
    const exam = await env.SCHOOL_KV.get(`exam:${examId}`, "json");
    if (!exam) return fail("آزمون یافت نشد", 404, origin);
    if (user.role === "teacher" && exam.teacherId !== user.id && !(await hasPermission(env, user, "manage_assignments"))) {
      const allClasses = await listValues(env, "class:");
      const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
      if (!matchesClassSet(exam, allowedClasses)) return fail("دسترسی غیرمجاز", 403, origin);
    }
    const keys = await listKeys(env, `exam-attempt:${examId}:`);
    let foundKey = null;
    let attempt = null;
    for (const k of keys) {
      const item = await env.SCHOOL_KV.get(k, "json");
      if (item && item.id === attemptId) {
        foundKey = k;
        attempt = item;
        break;
      }
    }
    if (!attempt || !foundKey) return fail("برگه پاسخ یافت نشد", 404, origin);

    const data = await body(request);
    const existingDetails = Array.isArray(attempt.questionScores) && attempt.questionScores.length > 0
      ? attempt.questionScores
      : gradeWorkerExam(exam, attempt.answers).questionScores;
    const scoreMap = new Map((Array.isArray(data?.scores) ? data.scores : []).map(s => [s.questionId, s]));
    const updatedDetails = existingDetails.map(det => {
      const upd = scoreMap.get(det.questionId);
      if (!upd) return det;
      const clamped = Math.min(det.maxPoints, Math.max(0, Number(upd.finalScore) || 0));
      return {
        ...det,
        manualScore: clamped,
        finalScore: clamped,
        needsReview: false,
        isCorrect: clamped >= det.maxPoints * 0.6,
        teacherComment: typeof upd.teacherComment === "string" && upd.teacherComment.trim()
          ? upd.teacherComment.trim()
          : det.teacherComment
      };
    });

    const newScore = Number(updatedDetails.reduce((s, d) => s + Number(d.finalScore || 0), 0).toFixed(2));
    const maxScore = Number(attempt.maxScore ?? attempt.totalPoints ?? exam.questions.reduce((s, q) => s + Number(q.points || 1), 0));
    attempt.questionScores = updatedDetails;
    attempt.score = newScore;
    attempt.earnedPoints = newScore;
    attempt.maxScore = maxScore;
    attempt.totalPoints = maxScore;
    attempt.percent = maxScore > 0 ? Math.round((newScore / maxScore) * 100) : 0;
    attempt.needsManualGrading = updatedDetails.some(d => d.needsReview);
    attempt.gradedBy = user.id;
    attempt.gradedAt = new Date().toISOString();

    await env.SCHOOL_KV.put(foundKey, JSON.stringify(attempt));
    await logActivity(env, user, "exam_attempt_graded", { target: exam.title, attemptId: attempt.id, score: newScore });
    return json({ success: true, attempt, message: "نمره‌دهی سؤالات تشریحی ثبت و تأیید شد." }, 200, origin);
  }

  const examAnalyticsMatch = path.match(/^\/api\/exams\/([^/]+)\/analytics$/);
  if (examAnalyticsMatch && method === "GET") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "manage_assigned_assignments", "manage_assignments", "view_class_reports", "view_reports"))) {
      return fail("دسترسی غیرمجاز", 403, origin);
    }
    const examId = decodeURIComponent(examAnalyticsMatch[1]);
    const exam = await env.SCHOOL_KV.get(`exam:${examId}`, "json");
    if (!exam) return fail("آزمون یافت نشد", 404, origin);
    if (user.role === "teacher" && exam.teacherId !== user.id && !(await hasPermission(env, user, "manage_assignments", "view_reports"))) {
      const allClasses = await listValues(env, "class:");
      const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
      if (!matchesClassSet(exam, allowedClasses)) return fail("دسترسی غیرمجاز", 403, origin);
    }
    const exAttempts = await listValues(env, `exam-attempt:${examId}:`);
    return json({ success: true, analytics: analyzeWorkerExamQuality(exam, exAttempts) }, 200, origin);
  }

  if (path === "/api/exam-attempts" && method === "GET") {
    const [allAttempts, allExams, allClasses] = await Promise.all([
      listValues(env, "exam-attempt:"),
      listValues(env, "exam:"),
      user.role === "teacher" ? listValues(env, "class:") : Promise.resolve([])
    ]);
    if (isStudentOrParent(user.role)) {
      const effStudent = await resolveEffectiveStudent(env, user);
      return json({ success: true, attempts: allAttempts.filter(a => a.studentId === effStudent.id) }, 200, origin);
    }
    if (user.role === "teacher" && !(await hasPermission(env, user, "view_reports", "manage_assignments"))) {
      const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
      const allowedExamIds = new Set(
        allExams.filter(ex => ex.teacherId === user.id || matchesClassSet(ex, allowedClasses)).map(ex => ex.id)
      );
      return json({ success: true, attempts: allAttempts.filter(a => allowedExamIds.has(a.examId)) }, 200, origin);
    }
    return json({ success: true, attempts: allAttempts }, 200, origin);
  }

  const examDeleteMatch = path.match(/^\/api\/exams\/([^/]+)$/);
  if (examDeleteMatch && method === "DELETE") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "manage_assigned_assignments", "manage_assignments"))) {
      return fail("مدیر سامانه مجوز حذف آزمون را غیرفعال کرده است", 403, origin);
    }
    const id = decodeURIComponent(examDeleteMatch[1]);
    const exam = await env.SCHOOL_KV.get(`exam:${id}`, "json");
    if (!exam) return fail("آزمون یافت نشد", 404, origin);
    if (user.role === "teacher" && exam.teacherId !== user.id && !(await hasPermission(env, user, "manage_assignments"))) {
      const allClasses = await listValues(env, "class:");
      const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
      if (!matchesClassSet(exam, allowedClasses)) return fail("دسترسی غیرمجاز", 403, origin);
    }
    await env.SCHOOL_KV.delete(`exam:${id}`);
    await logActivity(env, user, "exam_deleted", { target: exam.title });
    return json({ success: true, message: "آزمون حذف شد" }, 200, origin);
  }

  const examSubmitMatch = path.match(/^\/api\/exams\/([^/]+)\/submit$/);
  if (examSubmitMatch && method === "POST") {
    if (!isStudentOrParent(user.role)) return fail("فقط دانش‌آموزان مجاز به شرکت در آزمون هستند", 403, origin);
    const effStudent = await resolveEffectiveStudent(env, user);
    const examId = decodeURIComponent(examSubmitMatch[1]);
    const exam = await env.SCHOOL_KV.get(`exam:${examId}`, "json");
    if (!exam || exam.active === false) return fail("آزمون فعال یافت نشد", 404, origin);

    const existingAttempt = await env.SCHOOL_KV.get(`exam-attempt:${examId}:${effStudent.id}`, "json");
    if (existingAttempt) return fail("شما قبلاً در این آزمون شرکت کرده‌اید", 409, origin);

    const data = await body(request);
    const graded = gradeWorkerExam(exam, data?.answers || []);
    const percent = graded.maxScore > 0 ? Math.round((graded.score / graded.maxScore) * 100) : 0;
    const now = new Date().toISOString();
    const attempt = {
      id: crypto.randomUUID(),
      examId,
      studentId: effStudent.id,
      studentName: effStudent.name || effStudent.fullName,
      answers: graded.answers,
      questionScores: graded.questionScores,
      needsManualGrading: graded.needsManualGrading,
      score: graded.score,
      maxScore: graded.maxScore,
      totalPoints: graded.maxScore,
      earnedPoints: graded.score,
      percent,
      startedAt: String(data?.startedAt || now),
      submittedAt: now
    };
    await env.SCHOOL_KV.put(`exam-attempt:${examId}:${effStudent.id}`, JSON.stringify(attempt));

    // Log objective mistakes into KV for Private Tutor weakness tracking
    const subjects = await listValues(env, "subject:");
    const subName = subjects.find(s => s.id === exam.subjectId)?.name;
    const mistakeWrites = [];
    (exam.questions || []).forEach((q, idx) => {
      const det = graded.questionScores[idx];
      if (det && !det.needsReview && det.isCorrect === false) {
        const mid = crypto.randomUUID();
        const rawAns = graded.answers[idx];
        mistakeWrites.push(
          env.SCHOOL_KV.put(
            `tutor-mistake:${effStudent.id}:${mid}`,
            JSON.stringify({
              id: mid,
              studentId: effStudent.id,
              subjectId: exam.subjectId || undefined,
              subjectName: subName || undefined,
              topic: q.topic || exam.topic || exam.title,
              mistakeType: "پاسخ نادرست در آزمون آنلاین",
              questionPrompt: q.prompt || q.text || "",
              studentAnswer: typeof rawAns === "number" && q.options?.[rawAns] ? q.options[rawAns] : String(rawAns ?? ""),
              expectedAnswer: q.correctText || (q.correctIndex >= 0 && q.options ? q.options[q.correctIndex] : ""),
              severity: "medium",
              count: 1,
              lastOccurredAt: now,
              createdAt: now
            })
          )
        );
      }
    });
    if (mistakeWrites.length > 0) await Promise.all(mistakeWrites);

    effStudent.coins = (effStudent.coins || 0) + (percent >= 70 ? 15 : 10);
    await saveUser(env, effStudent);
    await logActivity(env, user, "exam_submitted", { target: exam.title, score: `${graded.score}/${graded.maxScore}` });

    return json({
      success: true,
      attempt,
      coins: effStudent.coins,
      message: graded.needsManualGrading
        ? `آزمون ثبت شد. نمره تستی شما: ${graded.score} از ${graded.maxScore} (بخش تشریحی پس از تأیید دبیر اضافه می‌شود)`
        : `پاسخ‌نامه شما ثبت و تصحیح شد (${graded.score} از ${graded.maxScore})`
    }, 201, origin);
  }

  // STUDY PLANS
  if (path === "/api/study-plans" && method === "GET") {
    const plans = await listValues(env, `study-plan:${user.id}:`);
    return json({ success: true, plans }, 200, origin);
  }

  if (path === "/api/study-plans" && method === "POST") {
    const data = await body(request);
    if (!data?.title) return fail("عنوان برنامه الزامی است", 400, origin);
    const id = crypto.randomUUID();
    const plan = {
      id,
      studentId: user.id,
      title: String(data.title).trim(),
      subjectId: data.subjectId || undefined,
      targetDate: String(data.targetDate || ""),
      estimatedMinutes: Number(data.estimatedMinutes || 45),
      priority: data.priority || "medium",
      completed: false,
      notes: String(data.notes || ""),
      createdAt: new Date().toISOString()
    };
    await env.SCHOOL_KV.put(`study-plan:${user.id}:${id}`, JSON.stringify(plan));
    return json({ success: true, plan, message: "برنامه مطالعه ثبت شد" }, 201, origin);
  }

  const spIdMatch = path.match(/^\/api\/study-plans\/([^/]+)$/);
  if (spIdMatch) {
    const id = decodeURIComponent(spIdMatch[1]);
    const key = `study-plan:${user.id}:${id}`;
    if (method === "PATCH") {
      const existing = await env.SCHOOL_KV.get(key, "json");
      if (!existing) return fail("مورد یافت نشد", 404, origin);
      const data = await body(request);
      const updated = { ...existing, ...data };
      await env.SCHOOL_KV.put(key, JSON.stringify(updated));
      return json({ success: true, plan: updated }, 200, origin);
    }
    if (method === "DELETE") {
      await env.SCHOOL_KV.delete(key);
      return json({ success: true, message: "حذف شد" }, 200, origin);
    }
  }

  // ACADEMIC CALENDAR
  if (path === "/api/calendar-events" && method === "GET") {
    const events = await listValues(env, "calendar:");
    events.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    return json({ success: true, events }, 200, origin);
  }

  if (path === "/api/calendar-events" && method === "POST") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "manage_schedules", "manage_announcements", "send_class_announcements", "manage_assigned_assignments", "manage_assignments"))) {
      return fail("مدیر سامانه مجوز ثبت رویداد تقویم را برای نقش شما غیرفعال کرده است", 403, origin);
    }
    const data = await body(request);
    if (!data?.title || !data?.date) return fail("عنوان و تاریخ رویداد الزامی است", 400, origin);
    if (user.role === "teacher" && data.classId && !(await hasPermission(env, user, "manage_schedules", "manage_announcements"))) {
      const allClasses = await listValues(env, "class:");
      const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
      if (allowedClasses.size > 0 && !allowedClasses.has(String(data.classId))) {
        return fail("شما فقط مجاز به ثبت رویداد برای کلاس‌های اختصاص‌یافته خود هستید", 403, origin);
      }
    }
    const id = crypto.randomUUID();
    const event = {
      id,
      title: String(data.title).trim(),
      description: String(data.description || "").trim(),
      date: String(data.date).trim(),
      time: data.time ? String(data.time).trim() : undefined,
      type: data.type || data.category || "meeting",
      category: data.category || data.type || "academic",
      classId: data.classId ? String(data.classId) : undefined,
      targetRole: data.targetRole || "all",
      createdBy: user.id,
      createdAt: new Date().toISOString()
    };
    await env.SCHOOL_KV.put(`calendar:${id}`, JSON.stringify(event));
    return json({ success: true, event, message: "رویداد تقویم ثبت شد" }, 201, origin);
  }

  const calIdMatch = path.match(/^\/api\/calendar-events\/([^/]+)$/);
  if (calIdMatch && method === "DELETE") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "manage_schedules", "manage_announcements", "send_class_announcements", "manage_assigned_assignments", "manage_assignments"))) {
      return fail("دسترسی غیرمجاز", 403, origin);
    }
    const id = decodeURIComponent(calIdMatch[1]);
    const ev = await env.SCHOOL_KV.get(`calendar:${id}`, "json");
    if (user.role === "teacher" && ev && ev.createdBy !== user.id && !(await hasPermission(env, user, "manage_schedules", "manage_announcements"))) {
      return fail("فقط ثبت‌کننده رویداد یا مدیر مجاز به حذف است", 403, origin);
    }
    await env.SCHOOL_KV.delete(`calendar:${id}`);
    return json({ success: true, message: "رویداد حذف شد" }, 200, origin);
  }

  // ACADEMIC HISTORY
  if (path === "/api/history" && method === "GET") {
    const all = await listValues(env, "history:");
    if (isStudentOrParent(user.role)) {
      const eff = await resolveEffectiveStudent(env, user);
      return json({ success: true, histories: all.filter(h => h.studentId === eff.id) }, 200, origin);
    }
    if (user.role === "teacher") {
      if (!(await hasPermission(env, user, "view_reports", "view_class_reports", "view_assigned_classes"))) {
        return fail("مدیر سامانه مجوز مشاهده سوابق تحصیلی را غیرفعال کرده است", 403, origin);
      }
      if (!(await hasPermission(env, user, "view_reports"))) {
        const [allUsers, allClasses] = await Promise.all([getAllUsers(env), listValues(env, "class:")]);
        const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
        const allowedStudentIds = new Set(
          allUsers.filter(u => u.role === "student" && matchesClassSet(u, allowedClasses)).map(u => u.id)
        );
        return json({ success: true, histories: all.filter(h => allowedStudentIds.has(h.studentId)) }, 200, origin);
      }
    }
    return json({ success: true, histories: all }, 200, origin);
  }

  if (path === "/api/history" && method === "POST") {
    if (!requireRole(user, ["admin"])) return fail("دسترسی غیرمجاز", 403, origin);
    const data = await body(request);
    if (!data?.studentId || !data?.academicYear) return fail("اطلاعات سابقه ناقص است", 400, origin);
    const id = crypto.randomUUID();
    const history = {
      id,
      studentId: data.studentId,
      academicYear: String(data.academicYear),
      gradeLevel: String(data.gradeLevel || "هفتم"),
      schoolName: String(data.schoolName || SCHOOL_NAME),
      gpa: Number(data.gpa || 0),
      status: data.status || "ارتقا یافته",
      notes: String(data.notes || ""),
      createdAt: new Date().toISOString()
    };
    await env.SCHOOL_KV.put(`history:${id}`, JSON.stringify(history));
    return json({ success: true, history, message: "سابقه تحصیلی ثبت شد" }, 201, origin);
  }

  const histMatch = path.match(/^\/api\/history\/([^/]+)$/);
  if (histMatch && method === "DELETE") {
    if (!requireRole(user, ["admin"])) return fail("دسترسی غیرمجاز", 403, origin);
    await env.SCHOOL_KV.delete(`history:${decodeURIComponent(histMatch[1])}`);
    return json({ success: true, message: "سابقه حذف شد" }, 200, origin);
  }

  // PROFILE CHANGE REQUESTS
  if (path === "/api/profile-requests" && method === "GET") {
    const all = await listValues(env, "profile-req:");
    const requests = isAdminOrDeputy(user.role) ? all : all.filter(r => r.userId === user.id);
    requests.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return json({ success: true, requests }, 200, origin);
  }

  if (path === "/api/profile-requests" && method === "POST") {
    const data = await body(request);
    const id = crypto.randomUUID();
    const reqVals = data?.requestedValues || data?.requestedChanges || {};
    const reqObj = {
      id,
      userId: user.id,
      username: user.username,
      userName: user.name,
      userRole: user.role,
      requestedValues: reqVals,
      requestedChanges: reqVals,
      reason: String(data?.reason || ""),
      status: "pending",
      createdAt: new Date().toISOString()
    };
    await env.SCHOOL_KV.put(`profile-req:${id}`, JSON.stringify(reqObj));
    return json({ success: true, request: reqObj, message: "درخواست تغییر پروفایل ثبت شد" }, 201, origin);
  }

  const preqReviewMatch = path.match(/^\/api\/profile-requests\/([^/]+)\/review$/);
  if (preqReviewMatch && method === "POST") {
    if (!requireRole(user, ["admin"])) return fail("دسترسی غیرمجاز", 403, origin);
    const id = decodeURIComponent(preqReviewMatch[1]);
    const reqObj = await env.SCHOOL_KV.get(`profile-req:${id}`, "json");
    if (!reqObj) return fail("درخواست یافت نشد", 404, origin);
    const data = await body(request);
    const rawDecision = data?.status || data?.decision;
    const decision = rawDecision === "approved" ? "approved" : "rejected";
    reqObj.status = decision;
    reqObj.reviewedBy = user.id;
    reqObj.reviewedByName = user.name;
    reqObj.reviewedAt = new Date().toISOString();
    reqObj.rejectionReason = String(data?.rejectionReason || data?.reviewNote || "");
    reqObj.reviewNote = reqObj.rejectionReason;

    const changes = reqObj.requestedValues || reqObj.requestedChanges;
    if (decision === "approved" && changes) {
      const targetUser = await getUser(env, reqObj.userId);
      if (targetUser) {
        if (changes.fullName) {
          targetUser.name = changes.fullName;
          targetUser.fullName = changes.fullName;
        }
        if (changes.age !== undefined) targetUser.age = changes.age;
        if (changes.phone !== undefined) targetUser.phone = changes.phone;
        if (changes.email !== undefined) targetUser.email = changes.email;
        if (changes.bio !== undefined) targetUser.bio = changes.bio;
        if (changes.avatarUrl !== undefined) targetUser.avatarUrl = changes.avatarUrl;
        if (changes.gradeLevel !== undefined) {
          targetUser.grade = changes.gradeLevel;
          targetUser.gradeLevel = changes.gradeLevel;
        }
        await saveUser(env, targetUser);
      }
    }

    await env.SCHOOL_KV.put(`profile-req:${id}`, JSON.stringify(reqObj));
    return json({ success: true, request: reqObj, message: "درخواست بررسی شد" }, 200, origin);
  }

  // AUDIT LOGS
  if (path === "/api/audit-logs" && method === "GET") {
    if (!(await hasPermission(env, user, "view_audit_logs"))) return fail("دسترسی غیرمجاز", 403, origin);
    const logs = await listValues(env, "activity:");
    logs.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return json({ success: true, logs: logs.slice(0, 100) }, 200, origin);
  }

  // SCHOOL SETTINGS (Supports both /api/admin/settings and /api/settings)
  if ((path === "/api/admin/settings" || path === "/api/settings") && method === "GET") {
    const settings = await getSchoolSettings(env);
    return json({ success: true, settings }, 200, origin);
  }

  if ((path === "/api/admin/settings" || path === "/api/settings") && method === "PUT") {
    if (!(await hasPermission(env, user, "manage_settings"))) return fail("دسترسی غیرمجاز", 403, origin);
    const data = await body(request);
    if (!data) return fail("تنظیمات معتبر نیست", 400, origin);

    const payload = typeof data.settings === "object" && data.settings && !Array.isArray(data.settings)
      ? data.settings
      : data;

    const current = await getSchoolSettings(env);
    const settings = {
      name: String(payload.schoolName || payload.name || current.name || SCHOOL_NAME),
      schoolName: String(payload.schoolName || payload.name || current.schoolName || SCHOOL_NAME),
      academicYear: String(payload.academicYear ?? current.academicYear ?? "۱۴۰۵-۱۴۰۶"),
      principalName: String(payload.principalName ?? current.principalName ?? "مدیر دبیرستان"),
      currentTerm: String(payload.currentTerm ?? current.currentTerm ?? "نوبت اول"),
      passingScore: Number(payload.passingScore ?? current.passingScore ?? 12),
      aiEnabled: typeof payload.aiEnabled === "boolean" ? payload.aiEnabled : current.aiEnabled,
      allowStudentAssignmentSubmission: typeof payload.allowStudentAssignmentSubmission === "boolean"
        ? payload.allowStudentAssignmentSubmission
        : current.allowStudentAssignmentSubmission,
      grades: Array.isArray(payload.grades) ? payload.grades.slice(0, 20) : current.grades,
      classes: Array.isArray(payload.classes) ? payload.classes.slice(0, 100) : current.classes,
      updatedAt: new Date().toISOString()
    };

    await env.SCHOOL_KV.put("school:settings", JSON.stringify(settings));
    await logActivity(env, user, "school_settings_updated");
    return json({ success: true, settings, message: "تنظیمات سامانه ذخیره شد" }, 200, origin);
  }

  // REPORTS OVERVIEW (Admin / Deputy / Teacher / Student / Parent — Zero fake defaults)
  if (path === "/api/reports/overview" && method === "GET") {
    const effStudent = isStudentOrParent(user.role) ? await resolveEffectiveStudent(env, user) : user;
    if (user.role === "teacher") {
      const canReport = await hasPermission(
        env,
        user,
        "view_class_reports",
        "view_reports",
        "view_assigned_classes",
        "manage_assigned_grades",
        "manage_grades"
      );
      if (!canReport) {
        return fail("مدیر سامانه مجوز مشاهده گزارش‌های کلاسی را برای نقش دبیر غیرفعال کرده است", 403, origin);
      }
    }

    const [
      allUsers,
      rawGrades,
      rawAtt,
      rawHw,
      rawAnn,
      rawClasses,
      rawSubjects,
      rawExams,
      rawExamAttempts,
      rawSubs,
      rawLogs,
      rawCal,
      rawHist,
      rawPlans,
      rawMsgs,
      rawProfileReqs,
      settings
    ] = await Promise.all([
      getAllUsers(env),
      listValues(env, "grade:"),
      isStudentOrParent(user.role) ? listValues(env, `attendance:${effStudent.id}:`) : listValues(env, "attendance:"),
      listValues(env, "homework:"),
      listValues(env, "announcement:"),
      listValues(env, "class:"),
      listValues(env, "subject:"),
      listValues(env, "exam:"),
      listValues(env, "exam-attempt:"),
      listValues(env, "submission:"),
      isAdminOrDeputy(user.role) ? listValues(env, "activity:") : Promise.resolve([]),
      listValues(env, "calendar:"),
      isStudentOrParent(user.role) ? listValues(env, "history:") : Promise.resolve([]),
      listValues(env, "study-plan:"),
      isAdminOrDeputy(user.role) ? listValues(env, "message:") : Promise.resolve([]),
      isAdminOrDeputy(user.role) ? listValues(env, "profile-req:") : Promise.resolve([]),
      getSchoolSettings(env)
    ]);

    const avgArr = arr => (arr.length > 0 ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : 0);
    const termOrder = ["مهر", "آبان", "آذر", "نوبت اول", "بهمن", "اسفند", "فروردین", "نوبت دوم", "مستمر", "سالانه"];
    const gradesAll = rawGrades.map(normalizeGrade);
    const attendanceAll = rawAtt.map(normalizeAttendance);
    const subjectMap = new Map(rawSubjects.map(s => [s.id, s]));
    const classMap = new Map(rawClasses.map(c => [c.id, c]));
    const userMap = new Map(allUsers.map(u => [u.id, u]));

    if (isStudentOrParent(user.role)) {
      const myGrades = gradesAll.filter(g => g.studentId === effStudent.id);
      const attStats = computeAttendanceStats(attendanceAll);
      const normalizedScores = myGrades.map(g => (g.score / (g.maxScore || 20)) * 20);
      const gpa = avgArr(normalizedScores);
      const currentTermScores = myGrades
        .filter(g => g.term === (settings.currentTerm || "نوبت اول"))
        .map(g => (g.score / (g.maxScore || 20)) * 20);
      const currentTermGpa = currentTermScores.length > 0 ? avgArr(currentTermScores) : gpa;

      const bySubject = new Map();
      const byTerm = new Map();
      for (const g of myGrades) {
        const norm = (g.score / (g.maxScore || 20)) * 20;
        const sName = subjectMap.get(g.subjectId)?.name || g.subjectName || g.subject || "عمومی";
        const arr = bySubject.get(sName) || [];
        arr.push(norm);
        bySubject.set(sName, arr);

        const tArr = byTerm.get(g.term) || [];
        tArr.push(norm);
        byTerm.set(g.term, tArr);
      }

      // Real rank among classmates who have grades
      let classRank = null;
      const classmateIds = new Set(
        allUsers
          .filter(
            u =>
              u.role === "student" &&
              ((effStudent.classId && (u.classId === effStudent.classId || u.className === effStudent.classId)) ||
                (effStudent.className && (u.className === effStudent.className || u.classId === effStudent.className)))
          )
          .map(u => u.id)
      );
      if (classmateIds.size > 0 && myGrades.length > 0) {
        const ranks = Array.from(classmateIds)
          .map(sid => {
            const sg = gradesAll.filter(g => g.studentId === sid);
            return { sid, count: sg.length, avg: avgArr(sg.map(g => (g.score / (g.maxScore || 20)) * 20)) };
          })
          .filter(x => x.count > 0)
          .sort((a, b) => b.avg - a.avg);
        const pos = ranks.findIndex(r => r.sid === effStudent.id);
        if (pos >= 0) classRank = pos + 1;
      }

      const myAsgs = rawHw.filter(hw => {
        if (hw.classId) return hw.classId === effStudent.classId || hw.classId === effStudent.className;
        if (hw.className) return hw.className === effStudent.className || hw.className === effStudent.classId;
        if (hw.grade && effStudent.grade) return hw.grade === effStudent.grade;
        return true;
      });
      const myAsgIds = new Set(myAsgs.map(a => a.id));
      const mySubs = rawSubs.filter(s => s.studentId === effStudent.id && (myAsgIds.size === 0 || myAsgIds.has(s.homeworkId || s.assignmentId)));
      const submittedCount = mySubs.filter(s => s.status !== "pending").length;
      const gradedAsgCount = mySubs.filter(s => s.status === "graded" || typeof s.score === "number").length;
      const lateAsgCount = mySubs.filter(s => s.status === "late").length;
      const pendingAssignments = Math.max(0, myAsgs.length - submittedCount);

      const myExams = rawExams.filter(ex => {
        if (ex.active === false || ex.published === false) return false;
        if (ex.classId) return ex.classId === effStudent.classId || ex.classId === effStudent.className;
        if (ex.gradeLevel && effStudent.grade) return ex.gradeLevel === effStudent.grade;
        return true;
      });
      const myAttempts = rawExamAttempts.filter(a => a.studentId === effStudent.id);
      const examMap = new Map(rawExams.map(e => [e.id, e]));
      const recentExamAttempts = [...myAttempts]
        .sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")))
        .slice(0, 5)
        .map(att => {
          const ex = examMap.get(att.examId);
          const sc = Number(att.score ?? att.earnedPoints ?? 0);
          const mx = Number(att.maxScore ?? att.totalPoints ?? 0);
          return {
            examId: att.examId,
            examTitle: ex?.title || "آزمون آنلاین",
            score: sc,
            maxScore: mx,
            percent: mx > 0 ? Math.round((sc / mx) * 100) : 0,
            submittedAt: att.submittedAt
          };
        });
      const avgExamPercent = myAttempts.length > 0
        ? Math.round(
            myAttempts.reduce((sum, a) => {
              const sc = Number(a.score ?? a.earnedPoints ?? 0);
              const mx = Number(a.maxScore ?? a.totalPoints ?? 0);
              return sum + (mx > 0 ? (sc / mx) * 100 : 0);
            }, 0) / myAttempts.length
          )
        : 0;

      const myPlans = rawPlans.filter(p => p.studentId === effStudent.id || p.studentId === user.id);
      const completedStudyTasks = myPlans.filter(p => p.completed).length;
      const totalStudyMinutes = myPlans.reduce((s, p) => s + Number(p.durationMinutes || p.estimatedMinutes || 0), 0);
      const completedStudyMinutes = myPlans
        .filter(p => p.completed)
        .reduce((s, p) => s + Number(p.durationMinutes || p.estimatedMinutes || 0), 0);

      const myHistories = rawHist
        .filter(h => h.studentId === effStudent.id)
        .sort((a, b) => String(b.academicYear || "").localeCompare(String(a.academicYear || "")));

      const upcomingEvents = rawCal
        .filter(e => !e.classId || e.classId === effStudent.classId || e.classId === effStudent.className)
        .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
        .slice(0, 5);

      return json({
        success: true,
        linkedStudentName: effStudent.id !== user.id ? effStudent.name : undefined,
        gpa,
        currentTermGpa,
        gradesCount: myGrades.length,
        subjectsCount: bySubject.size || rawSubjects.length,
        academicProgress: gpa > 0 ? Math.min(100, Math.round((gpa / 20) * 100)) : 0,
        classRank,
        attendanceStats: attStats,
        pendingAssignments,
        submittedAssignments: submittedCount,
        totalAssignments: myAsgs.length,
        assignmentBreakdown: {
          pending: pendingAssignments,
          submitted: Math.max(0, submittedCount - gradedAsgCount - lateAsgCount),
          graded: gradedAsgCount,
          late: lateAsgCount
        },
        activeExamsCount: myExams.length,
        completedExamsCount: myAttempts.length,
        examStats: {
          availableCount: myExams.filter(ex => !myAttempts.some(a => a.examId === ex.id)).length,
          completedCount: myAttempts.length,
          avgPercent: avgExamPercent,
          recentAttempts: recentExamAttempts
        },
        studyStats: {
          totalTasks: myPlans.length,
          completedTasks: completedStudyTasks,
          totalMinutes: totalStudyMinutes,
          completedMinutes: completedStudyMinutes
        },
        recentGrades: [...myGrades]
          .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
          .slice(0, 6)
          .map(g => ({
            id: g.id,
            title: g.title,
            subjectName: subjectMap.get(g.subjectId)?.name || g.subjectName || g.subject,
            term: g.term,
            score: g.score,
            maxScore: g.maxScore,
            normalized: Number(((g.score / (g.maxScore || 20)) * 20).toFixed(2)),
            date: g.date
          })),
        upcomingEvents,
        historiesCount: myHistories.length,
        latestHistory: myHistories[0] || null,
        subjectChart: Array.from(bySubject.entries()).map(([label, v]) => ({
          label,
          value: avgArr(v)
        })),
        termTrend: Array.from(byTerm.entries()).map(([label, v]) => ({
          label,
          value: avgArr(v),
          count: v.length
        })),
        coins: effStudent.coins || 0
      }, 200, origin);
    }

    if (user.role === "teacher") {
      const hasSchoolWide = await hasPermission(env, user, "view_reports");
      const allowedClasses = getTeacherAllowedClassIds(user, rawClasses);
      const myClasses = hasSchoolWide ? rawClasses : rawClasses.filter(c => allowedClasses.has(c.id) || (c.name && allowedClasses.has(c.name)));
      const myStudents = allUsers.filter(
        u => u.role === "student" && (hasSchoolWide || matchesClassSet(u, allowedClasses))
      );
      const myStudentIds = new Set(myStudents.map(s => s.id));
      const myGrades = gradesAll.filter(
        g => hasSchoolWide || matchesClassSet(g, allowedClasses) || myStudentIds.has(g.studentId)
      );
      const myAtt = attendanceAll.filter(
        a => hasSchoolWide || matchesClassSet(a, allowedClasses) || myStudentIds.has(a.studentId)
      );
      const myAsgs = rawHw.filter(
        h => hasSchoolWide || h.teacherId === user.id || matchesClassSet(h, allowedClasses)
      );
      const myAsgIds = new Set(myAsgs.map(a => a.id));
      const mySubs = rawSubs.filter(s => myAsgIds.has(s.homeworkId || s.assignmentId));
      const awaitingReviewCount = mySubs.filter(s => s.status !== "graded" && typeof s.score !== "number").length;
      const gradedAsgSubsCount = mySubs.filter(s => s.status === "graded" || typeof s.score === "number").length;
      const myExams = rawExams.filter(
        e => hasSchoolWide || e.teacherId === user.id || matchesClassSet(e, allowedClasses)
      );

      const classAverages = myClasses.map(c => {
        const clsStuIds = new Set(myStudents.filter(s => matchesSingleClass(s, c)).map(s => s.id));
        const clsGrades = myGrades.filter(g => matchesSingleClass(g, c) || clsStuIds.has(g.studentId));
        return {
          label: c.name,
          value: avgArr(clsGrades.map(g => (g.score / (g.maxScore || 20)) * 20)),
          count: clsGrades.length
        };
      });

      const bySubjectT = new Map();
      for (const g of myGrades) {
        const norm = (g.score / (g.maxScore || 20)) * 20;
        const subName = subjectMap.get(g.subjectId)?.name || g.subjectName || g.subject || "عمومی";
        const arr = bySubjectT.get(subName) || [];
        arr.push(norm);
        bySubjectT.set(subName, arr);
      }
      const subjectAverages = Array.from(bySubjectT.entries()).map(([label, v]) => ({
        label,
        value: avgArr(v),
        count: v.length
      }));

      const knownTerms = Array.from(new Set([...termOrder, ...myGrades.map(g => g.term).filter(Boolean)]));
      const termTrend = knownTerms
        .map(t => {
          const tg = myGrades.filter(g => g.term === t);
          return tg.length > 0
            ? { label: t, value: avgArr(tg.map(g => (g.score / (g.maxScore || 20)) * 20)), count: tg.length }
            : null;
        })
        .filter(Boolean);

      const dist = [
        { label: "۱۸ تا ۲۰", count: 0 },
        { label: "۱۵ تا ۱۷.۹۹", count: 0 },
        { label: "۱۲ تا ۱۴.۹۹", count: 0 },
        { label: "زیر ۱۲", count: 0 }
      ];
      for (const g of myGrades) {
        const n = (g.score / (g.maxScore || 20)) * 20;
        if (n >= 18) dist[0].count++;
        else if (n >= 15) dist[1].count++;
        else if (n >= 12) dist[2].count++;
        else dist[3].count++;
      }

      const expectedSubmissions = myAsgs.reduce((sum, asg) => {
        const cnt = myStudents.filter(
          s => (!asg.classId && !asg.className) || s.classId === asg.classId || s.className === asg.className || s.className === asg.classId
        ).length;
        return sum + cnt;
      }, 0);
      const totalSubmittedOrGraded = mySubs.filter(s => s.status !== "pending").length;

      const classSummaries = myClasses.map(c => {
        const clsStudents = myStudents.filter(s => matchesSingleClass(s, c));
        const clsStuIds = new Set(clsStudents.map(s => s.id));
        const clsGrades = myGrades.filter(g => matchesSingleClass(g, c) || clsStuIds.has(g.studentId));
        const clsAtt = myAtt.filter(a => matchesSingleClass(a, c) || clsStuIds.has(a.studentId));
        const clsPresent = clsAtt.filter(a => a.status === "present").length;
        return {
          id: c.id,
          name: c.name,
          gradeLevel: c.gradeLevel,
          studentsCount: clsStudents.length,
          gradesCount: clsGrades.length,
          averageScore: avgArr(clsGrades.map(g => (g.score / (g.maxScore || 20)) * 20)),
          attendanceRate: clsAtt.length > 0 ? Math.round((clsPresent / clsAtt.length) * 100) : 0
        };
      });

      const examSummaries = myExams.slice(0, 6).map(ex => {
        const attemptsForEx = rawExamAttempts.filter(a => a.examId === ex.id);
        const maxPts = (ex.questions || []).reduce((s, q) => s + Number(q.points || 1), 0);
        return {
          id: ex.id,
          title: ex.title,
          subjectName: subjectMap.get(ex.subjectId)?.name || "درس",
          className: classMap.get(ex.classId)?.name || ex.classId || "کلاس",
          active: ex.active !== false,
          attemptsCount: attemptsForEx.length,
          averageScore: avgArr(attemptsForEx.map(a => Number(a.score ?? a.earnedPoints ?? 0))),
          maxScore: maxPts
        };
      });

      const topStudents = myStudents
        .map(stu => {
          const sg = myGrades.filter(g => g.studentId === stu.id);
          return {
            id: stu.id,
            studentId: stu.id,
            fullName: stu.name || stu.username,
            className: classMap.get(stu.classId || "")?.name || stu.className || stu.grade || "—",
            gradesCount: sg.length,
            average: avgArr(sg.map(g => (g.score / (g.maxScore || 20)) * 20))
          };
        })
        .filter(r => r.gradesCount > 0)
        .sort((a, b) => b.average - a.average)
        .slice(0, 5);

      return json({
        success: true,
        classesCount: myClasses.length,
        subjectsCount: Array.isArray(user.assignedSubjectIds) && user.assignedSubjectIds.length > 0
          ? user.assignedSubjectIds.length
          : subjectAverages.length,
        studentsCount: myStudents.length,
        gradesCount: myGrades.length,
        averageScore: avgArr(myGrades.map(g => (g.score / (g.maxScore || 20)) * 20)),
        assignmentsCount: myAsgs.length,
        awaitingReviewCount,
        activeExamsCount: myExams.filter(e => e.active !== false && e.published !== false).length,
        attendanceStats: computeAttendanceStats(myAtt),
        classAverages,
        subjectAverages,
        termTrend,
        gradeDistribution: dist,
        assignmentBreakdown: {
          totalAssignments: myAsgs.length,
          expectedSubmissions,
          submittedCount: totalSubmittedOrGraded,
          gradedCount: gradedAsgSubsCount,
          pendingReviewCount: awaitingReviewCount,
          completionRate: expectedSubmissions > 0 ? Math.min(100, Math.round((totalSubmittedOrGraded / expectedSubmissions) * 100)) : 0
        },
        classSummaries,
        examSummaries,
        topStudents,
        recentGrades: [...myGrades]
          .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
          .slice(0, 6)
          .map(g => ({
            id: g.id,
            studentName: userMap.get(g.studentId)?.name || g.studentName || "دانش‌آموز",
            subjectName: subjectMap.get(g.subjectId)?.name || g.subjectName || g.subject || "درس",
            title: g.title,
            score: g.score,
            maxScore: g.maxScore,
            date: g.date
          }))
      }, 200, origin);
    }

    // Admin overview (100% Real Computed Metrics)
    const students = allUsers.filter(u => u.role === "student");
    const teachers = allUsers.filter(u => u.role === "teacher");
    const staffAdmins = allUsers.filter(u => isAdminOrDeputy(u.role));
    const normalizedScores = gradesAll.map(g => (g.score / (g.maxScore || 20)) * 20);
    const schoolAverage = avgArr(normalizedScores);
    const attStats = computeAttendanceStats(attendanceAll);

    const bySubject = new Map();
    const byTerm = new Map();
    const byStudent = new Map();
    for (const g of gradesAll) {
      const norm = (g.score / (g.maxScore || 20)) * 20;
      const subName = subjectMap.get(g.subjectId)?.name || g.subjectName || g.subject || "عمومی";
      const sArr = bySubject.get(subName) || [];
      sArr.push(norm);
      bySubject.set(subName, sArr);

      const tArr = byTerm.get(g.term) || [];
      tArr.push(norm);
      byTerm.set(g.term, tArr);

      const stArr = byStudent.get(g.studentId) || [];
      stArr.push(norm);
      byStudent.set(g.studentId, stArr);
    }

    const classAverages = rawClasses.map(c => {
      const clsStudents = students.filter(s => matchesSingleClass(s, c));
      const clsStuIds = new Set(clsStudents.map(s => s.id));
      const clsGrades = gradesAll.filter(g => matchesSingleClass(g, c) || clsStuIds.has(g.studentId));
      return {
        label: c.name,
        value: avgArr(clsGrades.map(g => (g.score / (g.maxScore || 20)) * 20)),
        students: clsStudents.length
      };
    });

    const gradeDistribution = [
      { label: "۱۸ تا ۲۰", count: 0 },
      { label: "۱۵ تا ۱۷.۹۹", count: 0 },
      { label: "۱۲ تا ۱۴.۹۹", count: 0 },
      { label: "زیر ۱۲", count: 0 }
    ];
    for (const g of gradesAll) {
      const n = (g.score / (g.maxScore || 20)) * 20;
      if (n >= 18) gradeDistribution[0].count++;
      else if (n >= 15) gradeDistribution[1].count++;
      else if (n >= 12) gradeDistribution[2].count++;
      else gradeDistribution[3].count++;
    }

    const gradeLevelsSet = new Set();
    for (const c of rawClasses) if (c.gradeLevel) gradeLevelsSet.add(c.gradeLevel);
    for (const s of students) if (s.grade || s.gradeLevel) gradeLevelsSet.add(s.grade || s.gradeLevel);
    const gradeLevelStats = Array.from(gradeLevelsSet).map(lvl => {
      const lvlClasses = rawClasses.filter(c => c.gradeLevel === lvl);
      const lvlClassIds = new Set();
      for (const c of lvlClasses) {
        if (c.id) lvlClassIds.add(c.id);
        if (c.name) lvlClassIds.add(c.name);
      }
      const lvlStudents = students.filter(
        s => (s.grade || s.gradeLevel) === lvl || matchesClassSet(s, lvlClassIds)
      );
      const lvlStudentIds = new Set(lvlStudents.map(s => s.id));
      const lvlGrades = gradesAll.filter(g => matchesClassSet(g, lvlClassIds) || lvlStudentIds.has(g.studentId));
      const lvlAtt = attendanceAll.filter(a => matchesClassSet(a, lvlClassIds) || lvlStudentIds.has(a.studentId));
      const lvlPresent = lvlAtt.filter(a => a.status === "present").length;
      return {
        label: lvl,
        studentsCount: lvlStudents.length,
        classesCount: lvlClasses.length,
        averageScore: avgArr(lvlGrades.map(g => (g.score / (g.maxScore || 20)) * 20)),
        attendanceRate: lvlAtt.length > 0 ? Math.round((lvlPresent / lvlAtt.length) * 100) : 0
      };
    });

    const classPerformance = rawClasses.map(c => {
      const clsStudents = students.filter(s => matchesSingleClass(s, c));
      const clsStuIds = new Set(clsStudents.map(s => s.id));
      const clsGrades = gradesAll.filter(g => matchesSingleClass(g, c) || clsStuIds.has(g.studentId));
      const clsAtt = attendanceAll.filter(a => matchesSingleClass(a, c) || clsStuIds.has(a.studentId));
      const clsPresent = clsAtt.filter(a => a.status === "present").length;
      return {
        id: c.id,
        name: c.name,
        gradeLevel: c.gradeLevel,
        studentsCount: clsStudents.length,
        capacity: c.capacity || 30,
        gradesCount: clsGrades.length,
        averageScore: avgArr(clsGrades.map(g => (g.score / (g.maxScore || 20)) * 20)),
        attendanceRate: clsAtt.length > 0 ? Math.round((clsPresent / clsAtt.length) * 100) : 0
      };
    });

    const studentAverages = students.map(s => {
      const vals = byStudent.get(s.id) || [];
      const stuAtt = attendanceAll.filter(a => a.studentId === s.id);
      return {
        id: s.id,
        studentId: s.id,
        fullName: s.name || s.username,
        className: classMap.get(s.classId || "")?.name || s.className || s.grade || "—",
        average: avgArr(vals),
        gradesCount: vals.length,
        absences: stuAtt.filter(a => a.status === "absent").length
      };
    });

    const totalExpectedSubs = rawHw.reduce((sum, asg) => {
      const cnt = students.filter(
        s => (!asg.classId && !asg.className) || s.classId === asg.classId || s.className === asg.className || s.className === asg.classId
      ).length;
      return sum + cnt;
    }, 0);
    const totalSubmittedSubs = rawSubs.filter(s => s.status !== "pending").length;
    const avgExamPercent = rawExamAttempts.length > 0
      ? Math.round(
          rawExamAttempts.reduce((sum, a) => {
            const sc = Number(a.score ?? a.earnedPoints ?? 0);
            const mx = Number(a.maxScore ?? a.totalPoints ?? 0);
            return sum + (mx > 0 ? (sc / mx) * 100 : 0);
          }, 0) / rawExamAttempts.length
        )
      : 0;

    const activeStu = students.filter(s => s.active !== false).length;
    const activeTch = teachers.filter(t => t.active !== false).length;
    const activeStaffCount = staffAdmins.filter(u => u.active !== false).length;
    const passing = Number(settings.passingScore ?? 12);

    rawLogs.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

    return json({
      success: true,
      studentsCount: students.length,
      activeStudentsCount: activeStu,
      activeAccountsCount: activeStu + activeTch + activeStaffCount,
      inactiveAccountsCount: (students.length - activeStu) + (teachers.length - activeTch) + (staffAdmins.length - activeStaffCount),
      teachersCount: teachers.length,
      classesCount: rawClasses.length,
      subjectsCount: rawSubjects.length,
      gradesCount: gradesAll.length,
      schoolAverage,
      assignmentsCount: rawHw.length,
      activeExamsCount: rawExams.filter(e => e.active !== false && e.published !== false).length,
      completedExamsCount: rawExamAttempts.length,
      announcementsCount: rawAnn.length,
      pendingProfileRequestsCount: rawProfileReqs.filter(r => r.status === "pending").length,
      attendanceStats: attStats,
      classAverages,
      subjectAverages: Array.from(bySubject.entries()).map(([label, v]) => ({
        label,
        value: avgArr(v),
        count: v.length
      })),
      termTrend: Array.from(byTerm.entries()).map(([label, v]) => ({
        label,
        value: avgArr(v),
        count: v.length
      })),
      gradeDistribution,
      gradeLevelStats,
      classPerformance,
      topStudents: studentAverages.filter(s => s.gradesCount > 0).sort((a, b) => b.average - a.average).slice(0, 5),
      attentionStudents: studentAverages
        .filter(s => (s.gradesCount > 0 && s.average < passing + 3) || s.absences >= 2)
        .sort((a, b) => a.average - b.average)
        .slice(0, 6),
      roleBreakdown: {
        studentsActive: activeStu,
        studentsInactive: students.length - activeStu,
        teachersActive: activeTch,
        teachersInactive: teachers.length - activeTch,
        adminsCount: staffAdmins.length
      },
      engagementStats: {
        assignmentsCount: rawHw.length,
        totalSubmissions: totalSubmittedSubs,
        gradedSubmissions: rawSubs.filter(s => s.status === "graded" || typeof s.score === "number").length,
        submissionRate: totalExpectedSubs > 0 ? Math.min(100, Math.round((totalSubmittedSubs / totalExpectedSubs) * 100)) : 0,
        examsCount: rawExams.length,
        examAttemptsCount: rawExamAttempts.length,
        avgExamPercent,
        studyPlansCount: rawPlans.length,
        completedStudyPlansCount: rawPlans.filter(p => p.completed).length,
        directMessagesCount: rawMsgs.length,
        calendarEventsCount: rawCal.length
      },
      recentActivity: rawLogs.slice(0, 10)
    }, 200, origin);
  }

  // AI PERMISSION HELPER
  async function assertWorkerAiAllowed(reqUser) {
    const settings = await getSchoolSettings(env);
    if (settings.aiEnabled === false && !isAdminOrDeputy(reqUser.role)) {
      return "دستیار هوش مصنوعی در تنظیمات مدرسه غیرفعال شده است";
    }
    const perm = isAdminOrDeputy(reqUser.role)
      ? "use_ai_admin"
      : reqUser.role === "teacher"
        ? "use_ai_teacher"
        : "use_ai_student";
    if (!(await hasPermission(env, reqUser, perm))) {
      return "مدیر سامانه مجوز استفاده از هوش مصنوعی را برای نقش شما غیرفعال کرده است";
    }
    return null;
  }

  // AI CONVERSATIONS & CHAT (Gemini via GEMINI_API_KEY)
  if (path === "/api/ai/conversations" && method === "GET") {
    const convs = await listValues(env, `ai-conv:${user.id}:`);
    convs.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const summaries = convs.map(c => ({
      id: c.id,
      title: c.title,
      mode: c.mode || "",
      role: c.role || user.role,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: Array.isArray(c.messages) ? c.messages.length : 0
    }));
    return json({ success: true, conversations: summaries }, 200, origin);
  }

  if (path === "/api/ai/conversations" && method === "POST") {
    const aiErr = await assertWorkerAiAllowed(user);
    if (aiErr) return fail(aiErr, 403, origin);
    const data = await body(request);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const conv = {
      id,
      userId: user.id,
      role: user.role,
      title: String(data?.title || "گفتگوی جدید"),
      mode: String(data?.mode || ""),
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    await env.SCHOOL_KV.put(`ai-conv:${user.id}:${id}`, JSON.stringify(conv));
    return json({ success: true, conversation: conv }, 201, origin);
  }

  const aiConvMatch = path.match(/^\/api\/ai\/conversations\/([^/]+)$/);
  if (aiConvMatch) {
    const cid = decodeURIComponent(aiConvMatch[1]);
    const key = `ai-conv:${user.id}:${cid}`;
    if (method === "GET") {
      const conv = await env.SCHOOL_KV.get(key, "json");
      if (!conv) return fail("گفتگو یافت نشد", 404, origin);
      return json({ success: true, conversation: conv }, 200, origin);
    }
    if (method === "PATCH") {
      const conv = await env.SCHOOL_KV.get(key, "json");
      if (!conv) return fail("گفتگو یافت نشد", 404, origin);
      const data = await body(request);
      if (data?.title) conv.title = String(data.title).trim();
      conv.updatedAt = new Date().toISOString();
      await env.SCHOOL_KV.put(key, JSON.stringify(conv));
      return json({ success: true, conversation: conv }, 200, origin);
    }
    if (method === "DELETE") {
      await env.SCHOOL_KV.delete(key);
      return json({ success: true }, 200, origin);
    }
  }

  const aiStreamMatch = path.match(/^\/api\/ai\/conversations\/([^/]+)\/messages\/stream$/);
  if (aiStreamMatch && method === "POST") {
    const aiErr = await assertWorkerAiAllowed(user);
    if (aiErr) return fail(aiErr, 403, origin);
    const cid = decodeURIComponent(aiStreamMatch[1]);
    const key = `ai-conv:${user.id}:${cid}`;
    let conv = await env.SCHOOL_KV.get(key, "json");
    const data = await body(request);
    const prompt = String(data?.content || data?.message || data?.prompt || "").trim();
    if (!prompt) return fail("پیام نمی‌تواند خالی باشد", 400, origin);
    if (!conv) {
      conv = {
        id: cid,
        userId: user.id,
        role: user.role,
        title: prompt.slice(0, 42),
        mode: String(data?.mode || ""),
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } else if (data?.mode) {
      conv.mode = String(data.mode);
    }
    conv.messages.push({ id: crypto.randomUUID(), role: "user", content: prompt, createdAt: new Date().toISOString() });
    const sysPrompt = `شما دستیار هوشمند رسمی «${SCHOOL_NAME}» هستید. نقش کاربر: ${user.role} (${user.name}). به فارسی روان، دقیق و آموزشی پاسخ دهید و برای فرمول‌های ریاضی از LaTeX استفاده کنید.`;
    const replyText = await callWorkerAI(
      env,
      sysPrompt,
      conv.messages.slice(-10).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
    );
    conv.messages.push({ id: crypto.randomUUID(), role: "assistant", content: replyText, createdAt: new Date().toISOString() });
    conv.updatedAt = new Date().toISOString();
    await env.SCHOOL_KV.put(key, JSON.stringify(conv));
    const sseBody = `data: ${JSON.stringify({ delta: replyText })}\n\ndata: ${JSON.stringify({ done: true, conversation: conv })}\n\n`;
    return new Response(sseBody, {
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(origin) }
    });
  }

  if (path === "/api/ai/chat" && method === "POST") {
    const aiErr = await assertWorkerAiAllowed(user);
    if (aiErr) return fail(aiErr, 403, origin);
    const data = await body(request);
    const prompt = String(data?.message || data?.prompt || "").trim();
    if (!prompt) return fail("پیام نمی‌تواند خالی باشد", 400, origin);

    let convId = String(data?.conversationId || "");
    let conv = convId ? await env.SCHOOL_KV.get(`ai-conv:${user.id}:${convId}`, "json") : null;
    if (!conv) {
      convId = crypto.randomUUID();
      conv = {
        id: convId,
        userId: user.id,
        role: user.role,
        title: prompt.slice(0, 42),
        mode: String(data?.mode || ""),
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    conv.messages.push({ id: crypto.randomUUID(), role: "user", content: prompt, createdAt: new Date().toISOString() });
    const sysPrompt = `شما دستیار هوشمند رسمی «${SCHOOL_NAME}» هستید. نقش کاربر: ${user.role} (${user.name}). به فارسی روان، دقیق و آموزشی پاسخ دهید و برای فرمول‌های ریاضی از LaTeX استفاده کنید.`;
    const replyText = await callWorkerAI(
      env,
      sysPrompt,
      conv.messages.slice(-10).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
    );

    conv.messages.push({ id: crypto.randomUUID(), role: "assistant", content: replyText, createdAt: new Date().toISOString() });
    conv.updatedAt = new Date().toISOString();
    await env.SCHOOL_KV.put(`ai-conv:${user.id}:${convId}`, JSON.stringify(conv));

    const sseBody =
      `data: ${JSON.stringify({ delta: replyText })}\n\n` +
      `data: ${JSON.stringify({ done: true, conversation: conv })}\n\n`;

    return new Response(sseBody, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        ...corsHeaders(origin)
      }
    });
  }

  // HONORS
  if (path === "/api/honors" && method === "GET") {
    const [honors, allUsers, allClasses] = await Promise.all([
      listValues(env, "honor:"),
      user.role === "teacher" ? getAllUsers(env) : Promise.resolve([]),
      user.role === "teacher" ? listValues(env, "class:") : Promise.resolve([])
    ]);
    let visible = honors;
    if (isStudentOrParent(user.role)) {
      const eff = await resolveEffectiveStudent(env, user);
      visible = honors.filter(h => h.studentId === eff.id);
    } else if (user.role === "teacher" && !(await hasPermission(env, user, "view_reports"))) {
      const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
      const allowedStuIds = new Set(allUsers.filter(u => u.role === "student" && matchesClassSet(u, allowedClasses)).map(u => u.id));
      visible = honors.filter(h => h.createdBy === user.id || allowedStuIds.has(h.studentId));
    }
    visible.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return json({ success: true, honors: visible }, 200, origin);
  }
  if (path === "/api/honors" && method === "POST") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "manage_assigned_grades", "manage_grades", "send_class_announcements", "manage_announcements", "manage_users"))) {
      return fail("مدیر سامانه مجوز ثبت افتخارات را برای نقش شما غیرفعال کرده است", 403, origin);
    }
    const data = await body(request);
    if (!data?.title || !data?.studentId) return fail("عنوان و دانش‌آموز الزامی است", 400, origin);
    if (user.role === "teacher" && !(await hasPermission(env, user, "manage_grades", "manage_users"))) {
      const [stu, allClasses] = await Promise.all([getUser(env, String(data.studentId)), listValues(env, "class:")]);
      const allowedClasses = getTeacherAllowedClassIds(user, allClasses);
      if (stu && !matchesClassSet(stu, allowedClasses)) {
        return fail("شما فقط مجاز به ثبت افتخار برای دانش‌آموزان کلاس‌های خود هستید", 403, origin);
      }
    }
    const id = crypto.randomUUID();
    const honor = {
      id,
      studentId: String(data.studentId),
      title: String(data.title).trim(),
      category: data.category || "academic",
      level: data.level || "school",
      rankOrMedal: data.rankOrMedal || undefined,
      date: String(data.date || ""),
      description: data.description || undefined,
      issuer: data.issuer || undefined,
      certificateRef: data.certificateRef || undefined,
      createdBy: user.id,
      createdByName: user.name,
      createdAt: new Date().toISOString()
    };
    await env.SCHOOL_KV.put(`honor:${id}`, JSON.stringify(honor));
    return json({ success: true, honor, message: "افتخار جدید ثبت شد" }, 201, origin);
  }
  const honorDelMatch = path.match(/^\/api\/honors\/([^/]+)$/);
  if (honorDelMatch && method === "DELETE") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "manage_assigned_grades", "manage_grades", "send_class_announcements", "manage_announcements", "manage_users"))) {
      return fail("دسترسی غیرمجاز", 403, origin);
    }
    const id = decodeURIComponent(honorDelMatch[1]);
    const h = await env.SCHOOL_KV.get(`honor:${id}`, "json");
    if (user.role === "teacher" && h && h.createdBy !== user.id && !(await hasPermission(env, user, "manage_grades"))) {
      return fail("دسترسی غیرمجاز", 403, origin);
    }
    await env.SCHOOL_KV.delete(`honor:${id}`);
    return json({ success: true, ok: true, message: "حذف شد" }, 200, origin);
  }

  // DIGITAL LIBRARY
  if (path === "/api/library" && method === "GET") {
    const items = await listValues(env, "library:");
    const visible = isStudentOrParent(user.role) ? items.filter(i => i.approved !== false) : items;
    visible.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return json({ success: true, items: visible }, 200, origin);
  }
  if (path === "/api/library" && method === "POST") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "use_ai_teacher", "manage_assigned_assignments", "manage_assignments", "manage_subjects"))) {
      return fail("مدیر سامانه مجوز افزودن منبع به کتابخانه را غیرفعال کرده است", 403, origin);
    }
    const data = await body(request);
    if (!data?.title) return fail("عنوان منبع الزامی است", 400, origin);
    const id = crypto.randomUUID();
    const item = {
      id,
      title: String(data.title).trim(),
      description: String(data.description || ""),
      category: data.category || "handout",
      gradeLevel: String(data.gradeLevel || "هفتم"),
      subjectId: data.subjectId || undefined,
      subjectName: data.subjectName || undefined,
      fileUrl: data.fileUrl || undefined,
      contentPreview: data.contentPreview || undefined,
      durationOrPages: data.durationOrPages || undefined,
      authorId: user.id,
      authorName: user.name,
      approved: true,
      createdAt: new Date().toISOString()
    };
    await env.SCHOOL_KV.put(`library:${id}`, JSON.stringify(item));
    return json({ success: true, item, message: "منبع به کتابخانه اضافه شد" }, 201, origin);
  }
  const libItemMatch = path.match(/^\/api\/library\/([^/]+)$/);
  if (libItemMatch) {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "use_ai_teacher", "manage_assigned_assignments", "manage_assignments", "manage_subjects"))) {
      return fail("دسترسی غیرمجاز", 403, origin);
    }
    const id = decodeURIComponent(libItemMatch[1]);
    const existing = await env.SCHOOL_KV.get(`library:${id}`, "json");
    if (user.role === "teacher" && existing && existing.authorId !== user.id && !(await hasPermission(env, user, "manage_subjects"))) {
      return fail("فقط ثبت‌کننده منبع یا مدیر مجاز به تغییر است", 403, origin);
    }
    if (method === "PATCH") {
      if (!existing) return fail("منبع یافت نشد", 404, origin);
      const data = await body(request);
      const updated = { ...existing, ...(data || {}), id };
      await env.SCHOOL_KV.put(`library:${id}`, JSON.stringify(updated));
      return json({ success: true, item: updated }, 200, origin);
    }
    if (method === "DELETE") {
      await env.SCHOOL_KV.delete(`library:${id}`);
      return json({ success: true, ok: true }, 200, origin);
    }
  }

  // QUESTION BANK & EXAM EXTRA ENDPOINTS
  if (path === "/api/question-bank" && method === "GET") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "manage_assigned_assignments", "manage_assignments", "use_ai_teacher"))) {
      return fail("دسترسی غیرمجاز", 403, origin);
    }
    const questions = await listValues(env, "qbank:");
    const scoped = user.role === "teacher" && !(await hasPermission(env, user, "manage_assignments"))
      ? questions.filter(q => q.teacherId === user.id)
      : questions;
    scoped.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return json({ success: true, questions: scoped }, 200, origin);
  }
  if (path === "/api/question-bank" && method === "POST") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "manage_assigned_assignments", "manage_assignments", "use_ai_teacher"))) {
      return fail("مدیر سامانه مجوز ثبت سؤال در بانک سؤال را غیرفعال کرده است", 403, origin);
    }
    const data = await body(request);
    if (!data?.prompt) return fail("صورت سؤال الزامی است", 400, origin);
    const id = crypto.randomUUID();
    const question = {
      id,
      teacherId: user.id,
      teacherName: user.name,
      subjectId: String(data?.subjectId || ""),
      gradeLevel: String(data?.gradeLevel || "هفتم"),
      chapter: data?.chapter || undefined,
      topic: data?.topic || undefined,
      difficulty: data?.difficulty || "medium",
      type: data?.type || "mcq",
      prompt: String(data?.prompt || ""),
      options: Array.isArray(data?.options) ? data.options : [],
      correctIndex: Number(data?.correctIndex || 0),
      correctText: data?.correctText || undefined,
      points: Number(data?.points || 2),
      explanation: data?.explanation || undefined,
      createdAt: new Date().toISOString()
    };
    await env.SCHOOL_KV.put(`qbank:${id}`, JSON.stringify(question));
    return json({ success: true, question }, 201, origin);
  }
  const qbankMatch = path.match(/^\/api\/question-bank\/([^/]+)$/);
  if (qbankMatch && method === "DELETE") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    const id = decodeURIComponent(qbankMatch[1]);
    const item = await env.SCHOOL_KV.get(`qbank:${id}`, "json");
    if (user.role === "teacher" && item && item.teacherId !== user.id && !(await hasPermission(env, user, "manage_assignments"))) {
      return fail("فقط طراح سؤال یا مدیر مجاز به حذف است", 403, origin);
    }
    await env.SCHOOL_KV.delete(`qbank:${id}`);
    return json({ success: true, ok: true }, 200, origin);
  }
  if (path === "/api/exams/ai-generate" && method === "POST") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "manage_assigned_assignments", "manage_assignments"))) {
      return fail("مدیر سامانه مجوز طراحی آزمون را برای نقش شما غیرفعال کرده است", 403, origin);
    }
    const aiErr = await assertWorkerAiAllowed(user);
    if (aiErr) return fail(aiErr, 403, origin);
    const data = await body(request);
    const raw = await callWorkerAI(
      env,
      'فقط آرایه JSON سؤالات آزمون برگردان: [{"type":"mcq","prompt":"...","options":["...","...","...","..."],"correctIndex":0,"correctText":"...","points":2,"topic":"...","explanation":"..."}]',
      [{ role: "user", content: `طراحی ${Number(data?.count) || 5} سؤال سطح ${String(data?.difficulty || "medium")} از درس ${String(data?.subjectName || "")} فصل ${String(data?.chapter || "")} مبحث ${String(data?.topic || "")} با انواع ${(Array.isArray(data?.questionTypes) ? data.questionTypes : ["mcq"]).join("،")}` }]
    );
    const parsed = extractWorkerJson(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    const questions = arr.map(q => ({
      id: crypto.randomUUID(),
      type: q.type || "mcq",
      prompt: String(q.prompt || ""),
      options: Array.isArray(q.options) ? q.options : [],
      correctIndex: typeof q.correctIndex === "number" ? q.correctIndex : 0,
      correctText: q.correctText,
      points: Number(q.points) || 2,
      topic: q.topic || data?.topic,
      chapter: data?.chapter,
      explanation: q.explanation || "",
      difficulty: data?.difficulty || "medium"
    }));
    return json({ success: true, questions }, 200, origin);
  }

  // SMART STUDY PLANNER AI
  if (path === "/api/smart-planner/generate" && method === "POST") {
    const aiErr = await assertWorkerAiAllowed(user);
    if (aiErr) return fail(aiErr, 403, origin);
    const data = await body(request);
    const goalText = String(data?.focusGoal || data?.goal || "مرور و آمادگی آزمون");
    const daysCount = Number(data?.daysCount) || 5;
    const raw = await callWorkerAI(
      env,
      'فقط JSON آرایه‌ای برگردان: [{"title":"...","targetDate":"1404/10/15","durationMinutes":45,"notes":"..."}]',
      [{ role: "user", content: `هدف برنامه مطالعه: ${goalText} برای ${daysCount} روز` }]
    );
    const parsed = extractWorkerJson(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    const tasks = arr.map(t => ({
      title: String(t.title || ""),
      targetDate: String(t.targetDate || ""),
      durationMinutes: Number(t.durationMinutes || t.estimatedMinutes || 45),
      estimatedMinutes: Number(t.estimatedMinutes || t.durationMinutes || 45),
      notes: String(t.notes || ""),
      category: isAdminOrDeputy(user.role) ? "administrative" : "study"
    }));
    return json({ success: true, summary: `برنامه هوشمند با ${tasks.length} تسک آماده شد.`, tasks }, 200, origin);
  }

  // ACADEMIC RISK (100% Real Data — No Fake 17 Average or 100% Homework Rate)
  if (path === "/api/academic-risk" && method === "GET") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    const canViewRisk = await hasPermission(
      env,
      user,
      "view_reports",
      "view_class_reports",
      "view_assigned_classes",
      "manage_assigned_grades",
      "manage_grades"
    );
    if (!canViewRisk) {
      return fail("مدیر سامانه مجوز مشاهده تحلیل افت تحصیلی را برای نقش شما غیرفعال کرده است", 403, origin);
    }

    const [allUsers, rawClasses, rawSubjects, notes, allGrades, allAtt, allAsgs, allSubs, allAttempts, settings] = await Promise.all([
      getAllUsers(env),
      listValues(env, "class:"),
      listValues(env, "subject:"),
      listValues(env, "risk-note:"),
      listValues(env, "grade:"),
      listValues(env, "attendance:"),
      listValues(env, "homework:"),
      listValues(env, "submission:"),
      listValues(env, "exam-attempt:"),
      getSchoolSettings(env)
    ]);

    const classMap = new Map(rawClasses.map(c => [c.id, c]));
    const subjectMap = new Map(rawSubjects.map(s => [s.id, s.name]));
    const passing = Number(settings.passingScore ?? 12);

    let students = allUsers.filter(u => u.role === "student" && u.active !== false);
    if (user.role === "teacher" && !(await hasPermission(env, user, "view_reports"))) {
      const allowedClasses = getTeacherAllowedClassIds(user, rawClasses);
      students = students.filter(st => matchesClassSet(st, allowedClasses));
    }

    const assessments = students.map(st => {
      const stuGrades = allGrades
        .filter(g => g.studentId === st.id)
        .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
      const norm = stuGrades.map(g => Number(((Number(g.score || 0) / (Number(g.maxScore || 20) || 20)) * 20).toFixed(2)));
      const avgScore = norm.length > 0 ? Number((norm.reduce((a, b) => a + b, 0) / norm.length).toFixed(2)) : 0;

      // Consecutive drops across last evaluations
      let consecutiveDrop = false;
      if (norm.length >= 3) {
        const last3 = norm.slice(-3);
        if (last3[1] < last3[0] - 0.75 && last3[2] < last3[1] - 0.75) {
          consecutiveDrop = true;
        }
      } else if (norm.length === 2 && norm[1] <= norm[0] - 2.5) {
        consecutiveDrop = true;
      }

      const stuAtt = allAtt.filter(a => a.studentId === st.id);
      const absences = stuAtt.filter(a => a.status === "absent").length;
      const lates = stuAtt.filter(a => a.status === "late").length;

      const subjectAbsMap = new Map();
      for (const a of stuAtt) {
        if (a.status === "absent" && a.subjectId) {
          const sName = subjectMap.get(a.subjectId) || a.subjectName || "درس مشخص";
          subjectAbsMap.set(sName, (subjectAbsMap.get(sName) || 0) + 1);
        }
      }

      const clsAssignments = allAsgs.filter(
        a =>
          (st.classId && (a.classId === st.classId || a.className === st.classId)) ||
          (st.className && (a.className === st.className || a.classId === st.className))
      );
      const clsAsgIds = new Set(clsAssignments.map(a => a.id));
      const stuSubs = allSubs.filter(
        s => s.studentId === st.id && s.status !== "pending" && (clsAsgIds.size === 0 || clsAsgIds.has(s.homeworkId || s.assignmentId))
      );
      const assignmentSubmissionRate = clsAssignments.length > 0
        ? Math.min(100, Math.round((stuSubs.length / clsAssignments.length) * 100))
        : 0;

      const stuAttempts = allAttempts.filter(a => a.studentId === st.id);
      const examAveragePercent = stuAttempts.length > 0
        ? Math.round(
            stuAttempts.reduce((sum, a) => {
              const sc = Number(a.score ?? a.earnedPoints ?? 0);
              const mx = Number(a.maxScore ?? a.totalPoints ?? 0);
              return sum + (mx > 0 ? (sc / mx) * 100 : 0);
            }, 0) / stuAttempts.length
          )
        : null;

      const evidence = [];
      let attentionSignals = 0;

      if (consecutiveDrop) {
        evidence.push("افت نمره در دو یا چند ارزیابی متوالی");
        attentionSignals += 2;
      }
      if (stuGrades.length > 0 && avgScore < passing + 4) {
        evidence.push(`میانگین نمرات (${avgScore} از ۲۰) نیازمند تقویت آموزشی است`);
        attentionSignals += avgScore < passing + 2 ? 2 : 1;
      }
      for (const [subName, cnt] of subjectAbsMap.entries()) {
        if (cnt >= 2) {
          evidence.push(`افزایش غیبت در درس ${subName} (${cnt} جلسه)`);
          attentionSignals += 1;
        }
      }
      if (absences >= 2 && evidence.every(e => !e.includes("غیبت"))) {
        evidence.push(`تعدد غیبت‌های ثبت‌شده (${absences} مورد)`);
        attentionSignals += 1;
      }
      if (clsAssignments.length >= 1 && assignmentSubmissionRate < 60) {
        evidence.push(`کاهش تحویل تکالیف (${assignmentSubmissionRate}٪ تحویل‌شده)`);
        attentionSignals += 1;
      }
      if (examAveragePercent !== null && examAveragePercent < 60) {
        evidence.push(`میانگین پایین در آزمون‌های آنلاین (${examAveragePercent}٪)`);
        attentionSignals += 1;
      }

      let category = "stable";
      let categoryLabelFa = "وضعیت پایدار";
      let categoryLabelEn = "Stable Progress";
      let suggestedAction = "ادامه روند عادی و پیگیری مستمر تکالیف کلاسی";

      if (attentionSignals >= 2) {
        category = "attention_center";
        categoryLabelFa = "مرکز توجه آموزشی";
        categoryLabelEn = "Academic Attention Priority";
        suggestedAction = "بررسی شرایط آموزشی، تدوین برنامه جبرانی و گفت‌وگو با دانش‌آموز و اولیا";
      } else if (attentionSignals === 1) {
        category = "teacher_review";
        categoryLabelFa = "نیازمند بررسی معلم";
        categoryLabelEn = "Requires Teacher Check-in";
        suggestedAction = "بررسی شرایط آموزشی و گفت‌وگوی کوتاه معلم با دانش‌آموز";
      } else if (
        stuGrades.length > 0 &&
        avgScore >= 18 &&
        absences <= 1 &&
        (clsAssignments.length === 0 || assignmentSubmissionRate >= 80)
      ) {
        category = "exemplary";
        categoryLabelFa = "دانش‌آموز نمونه";
        categoryLabelEn = "Exemplary Standing";
        suggestedAction = "معرفی به کارگاه‌های المپیاد و تشویق در پرونده افتخارات";
        evidence.push("عملکرد درخشان در نمرات، حضور منظم و تحویل کامل تکالیف");
      } else if (evidence.length === 0) {
        if (stuGrades.length === 0 && absences === 0 && clsAssignments.length === 0 && stuAttempts.length === 0) {
          evidence.push("هنوز داده آموزشی (نمره، غیبت، تکلیف یا آزمون) برای این دانش‌آموز ثبت نشده است");
        } else {
          evidence.push("روند نمرات و حضور و غیاب در وضعیت متعادل و طبیعی است");
        }
      }

      const stuNotes = notes
        .filter(n => n.studentId === st.id)
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

      return {
        studentId: st.id,
        studentName: st.name || st.username,
        classId: st.classId || st.className,
        className: classMap.get(st.classId || "")?.name || st.className || st.grade || "—",
        gradeLevel: st.grade || st.gradeLevel || "هفتم",
        category,
        categoryLabelFa,
        categoryLabelEn,
        averageScore: avgScore,
        gradesCount: stuGrades.length,
        absencesCount: absences,
        latesCount: lates,
        assignmentSubmissionRate,
        examAveragePercent,
        evidence,
        suggestedAction,
        reviewNotes: stuNotes.slice(0, 5)
      };
    });

    const priorityOrder = { attention_center: 0, teacher_review: 1, stable: 2, exemplary: 3 };
    assessments.sort((a, b) => (priorityOrder[a.category] ?? 2) - (priorityOrder[b.category] ?? 2));
    return json({ success: true, assessments }, 200, origin);
  }
  if (path === "/api/academic-risk/notes" && method === "POST") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    const canAddNote = await hasPermission(
      env,
      user,
      "view_reports",
      "view_class_reports",
      "manage_assigned_grades",
      "manage_grades"
    );
    if (!canAddNote) return fail("دسترسی غیرمجاز", 403, origin);
    const data = await body(request);
    if (!data?.studentId || !data?.note) return fail("شناسه دانش‌آموز و متن یادداشت الزامی است", 400, origin);
    const id = crypto.randomUUID();
    const note = {
      id,
      studentId: String(data.studentId),
      authorId: user.id,
      authorName: user.name,
      note: String(data.note).trim(),
      actionTaken: data.actionTaken ? String(data.actionTaken).trim() : undefined,
      createdAt: new Date().toISOString()
    };
    await env.SCHOOL_KV.put(`risk-note:${id}`, JSON.stringify(note));
    return json({ success: true, note, message: "یادداشت بررسی آموزشی ثبت شد" }, 201, origin);
  }

  // PRIVATE TUTOR REAL DIAGNOSIS HELPER
  async function computeWorkerDiagnosis(targetStudentId) {
    const [stuGrades, allAttempts, mistakes, sources, subjects, allExams] = await Promise.all([
      listValues(env, `grade:${targetStudentId}:`),
      listValues(env, "exam-attempt:"),
      listValues(env, `tutor-mistake:${targetStudentId}:`),
      listValues(env, "tutor-source:"),
      listValues(env, "subject:"),
      listValues(env, "exam:")
    ]);

    const subjectMap = new Map(subjects.map(s => [s.id, s]));
    const examMap = new Map(allExams.map(e => [e.id, e]));
    const myAttempts = allAttempts.filter(a => a.studentId === targetStudentId);
    const normScores = stuGrades.map(g => (Number(g.score || 0) / (Number(g.maxScore || 20) || 20)) * 20);
    const examEquivScores = myAttempts
      .map(a => {
        const mx = Number(a.maxScore ?? a.totalPoints ?? 0);
        const sc = Number(a.score ?? a.earnedPoints ?? 0);
        return mx > 0 ? (sc / mx) * 20 : null;
      })
      .filter(v => v !== null);
    const combinedScores = [...normScores, ...examEquivScores];

    let learningLevel = "در حال ارزیابی اولیه (بدون نمره ثبت‌شده)";
    if (combinedScores.length > 0) {
      const avg = combinedScores.reduce((a, b) => a + b, 0) / combinedScores.length;
      learningLevel = avg >= 18
        ? "پیشرفته و المپیادی"
        : avg >= 14.5
          ? "متوسط و رو به پیشرفت"
          : "مبتدی و نیازمند مرور پایه";
    }

    const weakMap = new Map();
    for (const g of stuGrades) {
      const norm = (Number(g.score || 0) / (Number(g.maxScore || 20) || 20)) * 20;
      if (norm < 16) {
        const sName = subjectMap.get(g.subjectId)?.name || g.subjectName || g.subject || "درس";
        const topic = g.title || sName;
        weakMap.set(`${sName}:${topic}`, {
          topic,
          subjectName: sName,
          evidence: `نمره ${g.score} از ${g.maxScore || 20} در ${g.title || sName}`,
          priority: norm < 13 ? "بالا" : "متوسط"
        });
      }
    }

    for (const att of myAttempts) {
      const ex = examMap.get(att.examId);
      if (!ex) continue;
      const sName = subjectMap.get(ex.subjectId)?.name || "آزمون";
      (ex.questions || []).forEach((q, idx) => {
        const detail = Array.isArray(att.questionScores)
          ? att.questionScores.find(d => d.questionId === q.id)
          : undefined;
        const pts = Number(q.points || 1);
        const ans = Array.isArray(att.answers) ? att.answers[idx] : att.answers?.[q.id];
        const isWrong = detail !== undefined
          ? !detail.needsReview && Number(detail.finalScore || 0) < pts * 0.6
          : q.type !== "descriptive" && Number(ans) !== Number(q.correctIndex);
        if (isWrong) {
          const topic = q.topic || ex.topic || ex.title;
          weakMap.set(`${sName}:${topic}`, {
            topic,
            subjectName: sName,
            evidence: `پاسخ نادرست در سؤال «${String(q.prompt || q.text || "").slice(0, 48)}»`,
            priority: "بالا"
          });
        }
      });
    }

    const sortedMistakes = [...mistakes].sort((a, b) => Number(b.count || 1) - Number(a.count || 1));
    for (const m of sortedMistakes) {
      const sName = m.subjectName || subjectMap.get(m.subjectId || "")?.name || "عمومی";
      if (!weakMap.has(`${sName}:${m.topic}`)) {
        weakMap.set(`${sName}:${m.topic}`, {
          topic: m.topic,
          subjectName: sName,
          evidence: `${m.count || 1} بار تکرار در «${m.mistakeType}»`,
          priority: (m.count || 1) >= 2 || m.severity === "high" ? "بالا" : "متوسط"
        });
      }
    }

    const approvedSources = sources.filter(s => s.approved !== false);
    return {
      studentId: targetStudentId,
      learningLevel,
      weakTopics: Array.from(weakMap.values()).slice(0, 8),
      recurringMistakes: sortedMistakes.slice(0, 10),
      recommendedSources: approvedSources.slice(0, 6).map(s => ({
        sourceId: s.id,
        title: s.title,
        subjectName: s.subjectName,
        pageCount: Array.isArray(s.pages) ? s.pages.length : 0
      }))
    };
  }

  // PRIVATE TUTOR (Sources, Sessions, Streaming Ask, Mistakes, Diagnosis, Practice, Remedial Plan)
  if (path === "/api/private-tutor/sources" && method === "GET") {
    const sources = await listValues(env, "tutor-source:");
    const visible = isStudentOrParent(user.role) ? sources.filter(s => s.approved !== false) : sources;
    visible.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
    return json({ success: true, sources: visible }, 200, origin);
  }
  if (path === "/api/private-tutor/sources" && method === "POST") {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "use_ai_teacher", "manage_assigned_assignments", "manage_assignments"))) {
      return fail("مدیر سامانه مجوز ثبت منبع معلم خصوصی را برای نقش شما غیرفعال کرده است", 403, origin);
    }
    const data = await body(request);
    if (!data?.title) return fail("عنوان منبع آموزشی الزامی است", 400, origin);
    const id = crypto.randomUUID();
    const rawContent = String(data?.content || "");
    const pages = Array.isArray(data?.pages) && data.pages.length
      ? data.pages.map((p, idx) => ({
          pageNumber: Number(p.pageNumber || idx + 1),
          heading: p.heading || undefined,
          content: String(p.content || p.text || "")
        }))
      : rawContent.split(/\n{2,}/).filter(Boolean).map((txt, idx) => ({ pageNumber: idx + 1, content: txt }));
    const source = {
      id,
      title: String(data.title).trim(),
      subjectId: String(data?.subjectId || ""),
      subjectName: String(data?.subjectName || "عمومی"),
      gradeLevel: String(data?.gradeLevel || "هفتم"),
      chapter: data?.chapter || undefined,
      topic: data?.topic || undefined,
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      approved: true,
      pages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await env.SCHOOL_KV.put(`tutor-source:${id}`, JSON.stringify(source));
    return json({ success: true, source, message: "منبع معلم خصوصی ثبت شد" }, 201, origin);
  }
  const tutorSrcMatch = path.match(/^\/api\/private-tutor\/sources\/([^/]+)$/);
  if (tutorSrcMatch) {
    if (isStudentOrParent(user.role)) return fail("دسترسی غیرمجاز", 403, origin);
    if (!(await hasPermission(env, user, "use_ai_teacher", "manage_assigned_assignments", "manage_assignments"))) {
      return fail("دسترسی غیرمجاز", 403, origin);
    }
    const id = decodeURIComponent(tutorSrcMatch[1]);
    const existing = await env.SCHOOL_KV.get(`tutor-source:${id}`, "json");
    if (user.role === "teacher" && existing && existing.authorId !== user.id && !(await hasPermission(env, user, "manage_assignments"))) {
      return fail("فقط ثبت‌کننده منبع یا مدیر مجاز به ویرایش/حذف است", 403, origin);
    }
    if (method === "PATCH") {
      if (!existing) return fail("منبع یافت نشد", 404, origin);
      const data = await body(request);
      const updated = { ...existing, ...(data || {}), id, updatedAt: new Date().toISOString() };
      await env.SCHOOL_KV.put(`tutor-source:${id}`, JSON.stringify(updated));
      return json({ success: true, source: updated }, 200, origin);
    }
    if (method === "DELETE") {
      await env.SCHOOL_KV.delete(`tutor-source:${id}`);
      return json({ success: true, ok: true }, 200, origin);
    }
  }

  if (path === "/api/private-tutor/sessions" && method === "GET") {
    const sessions = await listValues(env, `tutor-sess:${user.id}:`);
    sessions.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return json({ success: true, sessions }, 200, origin);
  }
  if (path === "/api/private-tutor/sessions" && method === "POST") {
    const aiErr = await assertWorkerAiAllowed(user);
    if (aiErr) return fail(aiErr, 403, origin);
    const data = await body(request);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const session = {
      id,
      userId: user.id,
      studentId: user.id,
      title: String(data?.title || "جلسه معلم خصوصی").trim(),
      subjectId: data?.subjectId || undefined,
      subjectName: data?.subjectName || undefined,
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    await env.SCHOOL_KV.put(`tutor-sess:${user.id}:${id}`, JSON.stringify(session));
    return json({ success: true, session }, 201, origin);
  }
  const tutorSessMatch = path.match(/^\/api\/private-tutor\/sessions\/([^/]+)$/);
  if (tutorSessMatch) {
    const id = decodeURIComponent(tutorSessMatch[1]);
    const key = `tutor-sess:${user.id}:${id}`;
    if (method === "GET") {
      const session = await env.SCHOOL_KV.get(key, "json");
      if (!session) return fail("جلسه یافت نشد", 404, origin);
      return json({ success: true, session }, 200, origin);
    }
    if (method === "DELETE") {
      await env.SCHOOL_KV.delete(key);
      return json({ success: true, ok: true }, 200, origin);
    }
  }
  const tutorAskMatch = path.match(/^\/api\/private-tutor\/sessions\/([^/]+)\/ask\/stream$/);
  if (tutorAskMatch && method === "POST") {
    const aiErr = await assertWorkerAiAllowed(user);
    if (aiErr) return fail(aiErr, 403, origin);
    const sid = decodeURIComponent(tutorAskMatch[1]);
    const key = `tutor-sess:${user.id}:${sid}`;
    const session = await env.SCHOOL_KV.get(key, "json");
    if (!session) return fail("جلسه یافت نشد", 404, origin);
    const data = await body(request);
    const question = String(data?.question || "").trim();
    if (!question) return fail("سؤال نمی‌تواند خالی باشد", 400, origin);
    const effStu = isStudentOrParent(user.role) ? await resolveEffectiveStudent(env, user) : user;
    const [sources, mistakes] = await Promise.all([
      listValues(env, "tutor-source:"),
      listValues(env, `tutor-mistake:${effStu.id}:`)
    ]);
    const approvedSources = sources.filter(s => s.approved !== false);
    const qWords = normalizeExamText(question).split(" ").filter(w => w.length >= 2);
    const scoredSources = approvedSources
      .map(s => {
        const fullTxt = normalizeExamText(`${s.title} ${s.subjectName || ""} ${(s.pages || []).map(p => `${p.heading || ""} ${p.content || p.text || ""}`).join(" ")}`);
        const hits = qWords.reduce((sum, w) => sum + (fullTxt.includes(w) ? 1 : 0), 0);
        return { source: s, hits };
      })
      .sort((a, b) => b.hits - a.hits);

    const picked = scoredSources.slice(0, 3).map(x => x.source);
    const citations = picked.map(s => {
      const p0 = s.pages?.[0];
      return {
        sourceId: s.id,
        sourceTitle: s.title,
        pageNumber: p0?.pageNumber || 1,
        chapter: s.chapter || undefined,
        excerpt: String(p0?.content || p0?.text || "").slice(0, 140)
      };
    });
    const srcText = picked.map(s => `- ${s.title}: ${(s.pages || []).map(p => p.content || p.text || "").join(" ").slice(0, 800)}`).join("\n") || "منبع رسمی ثبت نشده است.";
    const mstText = mistakes.slice(0, 5).map(m => `${m.topic} (${m.mistakeType})`).join("، ") || "موردی ثبت نشده";
    session.messages.push({ id: crypto.randomUUID(), role: "user", content: question, createdAt: new Date().toISOString() });
    const sysPrompt = `تو «معلم خصوصی اختصاصی مدرسه» در ${SCHOOL_NAME} هستی. بر اساس منابع معلمان پاسخ بده و فرمول‌ها را با LaTeX بنویس.\nمنابع:\n${srcText}\nاشتباهات دانش‌آموز:\n${mstText}`;
    const reply = await callWorkerAI(
      env,
      sysPrompt,
      session.messages.slice(-10).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
    );
    const assistantMsg = { id: crypto.randomUUID(), role: "assistant", content: reply, citations, createdAt: new Date().toISOString() };
    session.messages.push(assistantMsg);
    session.updatedAt = new Date().toISOString();
    await env.SCHOOL_KV.put(key, JSON.stringify(session));
    const sseBody = `data: ${JSON.stringify({ citations })}\n\ndata: ${JSON.stringify({ delta: reply })}\n\ndata: ${JSON.stringify({ done: true, session, message: assistantMsg })}\n\n`;
    return new Response(sseBody, {
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", ...corsHeaders(origin) }
    });
  }
  if (path === "/api/private-tutor/mistakes" && method === "GET") {
    const effStu = isStudentOrParent(user.role) ? await resolveEffectiveStudent(env, user) : user;
    const mistakes = await listValues(env, `tutor-mistake:${effStu.id}:`);
    return json({ success: true, mistakes }, 200, origin);
  }
  if (path === "/api/private-tutor/mistakes" && method === "POST") {
    const effStu = isStudentOrParent(user.role) ? await resolveEffectiveStudent(env, user) : user;
    const data = await body(request);
    if (!data?.topic || !data?.mistakeType) return fail("موضوع و نوع اشتباه الزامی است", 400, origin);
    const id = crypto.randomUUID();
    const mistake = {
      id,
      studentId: effStu.id,
      subjectId: data?.subjectId || undefined,
      topic: String(data.topic).trim(),
      mistakeType: String(data.mistakeType).trim(),
      subjectName: data?.subjectName || undefined,
      severity: data?.severity || "medium",
      count: 1,
      lastOccurredAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };
    await env.SCHOOL_KV.put(`tutor-mistake:${effStu.id}:${id}`, JSON.stringify(mistake));
    return json({ success: true, mistake }, 201, origin);
  }
  if (path === "/api/private-tutor/diagnosis" && method === "GET") {
    const effStu = isStudentOrParent(user.role) ? await resolveEffectiveStudent(env, user) : user;
    const diagnosis = await computeWorkerDiagnosis(effStu.id);
    return json({ success: true, diagnosis }, 200, origin);
  }
  if (path === "/api/private-tutor/generate-practice" && method === "POST") {
    const aiErr = await assertWorkerAiAllowed(user);
    if (aiErr) return fail(aiErr, 403, origin);
    const effStu = isStudentOrParent(user.role) ? await resolveEffectiveStudent(env, user) : user;
    const diagnosis = await computeWorkerDiagnosis(effStu.id);
    const data = await body(request);
    const raw = await callWorkerAI(
      env,
      'فقط JSON آرایه‌ای از تمرین‌ها برگردان: [{"question":"...","type":"mcq","options":["...","...","...","..."],"correctIndex":0,"correctAnswer":"...","explanation":"...","topic":"...","difficulty":"medium"}]',
      [{ role: "user", content: `سطح یادگیری دانش‌آموز: ${diagnosis.learningLevel}. برای مبحث «${String(data?.topic || "ریاضی")}» تعداد ${Number(data?.count) || 3} تمرین طراحی کن.` }]
    );
    const parsed = extractWorkerJson(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    return json({
      success: true,
      level: diagnosis.learningLevel,
      learningLevel: diagnosis.learningLevel,
      exercises: arr.map(p => ({
        id: crypto.randomUUID(),
        question: String(p.question || ""),
        type: p.type === "short_answer" ? "short_answer" : "mcq",
        options: Array.isArray(p.options) ? p.options.map(String) : [],
        correctIndex: typeof p.correctIndex === "number" ? p.correctIndex : 0,
        correctAnswer: String(p.correctAnswer || ""),
        explanation: String(p.explanation || ""),
        topic: String(p.topic || data?.topic || ""),
        difficulty: p.difficulty || "medium"
      }))
    }, 200, origin);
  }
  if (path === "/api/private-tutor/generate-remedial-plan" && method === "POST") {
    const aiErr = await assertWorkerAiAllowed(user);
    if (aiErr) return fail(aiErr, 403, origin);
    const effStu = isStudentOrParent(user.role) ? await resolveEffectiveStudent(env, user) : user;
    const diagnosis = await computeWorkerDiagnosis(effStu.id);
    const data = await body(request);
    const focus = String(data?.focusTopic || (diagnosis.weakTopics[0]?.topic || "تقویت دروس"));
    const raw = await callWorkerAI(
      env,
      'فقط JSON آرایه‌ای از گام‌های جبرانی برگردان: [{"dayLabel":"روز اول","focusTopic":"...","activity":"...","durationMinutes":45,"sourceReference":"..."}]',
      [{ role: "user", content: `سطح فعلی دانش‌آموز: ${diagnosis.learningLevel}. برنامه جبرانی برای تمرکز: ${focus}` }]
    );
    const parsed = extractWorkerJson(raw);
    const plan = Array.isArray(parsed) ? parsed : [];
    return json({
      success: true,
      summary: `برنامه جبرانی ${plan.length} گامه متناسب با سطح «${diagnosis.learningLevel}» آماده شد.`,
      items: plan,
      plan
    }, 200, origin);
  }

  return fail("مسیر موردنظر پیدا نشد", 404, origin);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      console.error("Shahriar School API Error:", error);
      const origin = getOrigin(request, env);
      return json({ success: false, error: "خطای داخلی سرور" }, 500, origin || "");
    }
  }
};
