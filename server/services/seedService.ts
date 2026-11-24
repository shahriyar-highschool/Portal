import type {
  AcademicHistoryRecord,
  Announcement,
  Assignment,
  AssignmentSubmission,
  AttendanceRecord,
  DigitalLibraryItem,
  DirectMessage,
  GradeRecord,
  OnlineExam,
  RolePermissionConfig,
  ScheduleSlot,
  SchoolClass,
  SchoolSettings,
  StoredUser,
  StudentHonor,
  Subject,
  TeacherBankQuestion,
  TeacherSourceMaterial,
} from '../../shared/types.ts';
import {
  KV_KEYS,
  kvAddToIndex,
  kvGetCollection,
  kvGetJson,
  kvPutJson,
  type SchoolKVStore,
} from '../kv/kvStore.ts';
import { generateId, hashPassword } from '../utils/crypto.ts';

export const DEFAULT_ROLES: RolePermissionConfig[] = [
  {
    role: 'admin',
    titleFa: 'مدیر سامانه',
    descriptionFa: 'دسترسی کامل به مدیریت دانش‌آموزان، معلمان، کلاس‌ها، دروس، گزارش‌ها و تنظیمات مدرسه',
    permissions: [
      'manage_users',
      'manage_roles',
      'manage_classes',
      'manage_subjects',
      'manage_grades',
      'manage_attendance',
      'manage_assignments',
      'manage_schedules',
      'manage_announcements',
      'view_reports',
      'manage_settings',
      'view_audit_logs',
      'use_ai_admin',
    ],
  },
  {
    role: 'teacher',
    titleFa: 'معلم',
    descriptionFa: 'مدیریت کلاس‌ها و دانش‌آموزان اختصاص‌یافته، ثبت نمرات، حضور و غیاب، تکالیف، منابع معلم خصوصی و طراحی آزمون',
    permissions: [
      'view_assigned_classes',
      'manage_assigned_grades',
      'manage_assigned_attendance',
      'manage_assigned_assignments',
      'send_class_announcements',
      'view_class_reports',
      'use_ai_teacher',
    ],
  },
  {
    role: 'student',
    titleFa: 'دانش‌آموز',
    descriptionFa: 'مشاهده کارنامه، نمرات، حضور و غیاب، تکالیف، برنامه هفتگی، افتخارات، کتابخانه دیجیتال، معلم خصوصی و دستیار آموزشی',
    permissions: [
      'view_own_grades',
      'view_own_attendance',
      'view_own_assignments',
      'submit_assignments',
      'view_own_schedule',
      'view_announcements',
      'use_ai_student',
    ],
  },
];

export function defaultSchoolSettings(principalName = 'مدیر دبیرستان استعدادهای درخشان استاد شهریار'): SchoolSettings {
  return {
    schoolName: 'دبیرستان استعدادهای درخشان استاد شهریار',
    academicYear: '۱۴۰۴-۱۴۰۵',
    principalName,
    currentTerm: 'نوبت اول',
    passingScore: 10,
    aiEnabled: true,
    allowStudentAssignmentSubmission: true,
    updatedAt: new Date().toISOString(),
  };
}

export async function ensureBaseConfig(kv: SchoolKVStore, principalName?: string) {
  const existingRoles = await kvGetJson<RolePermissionConfig[]>(kv, KV_KEYS.ROLES);
  if (!existingRoles) {
    await kvPutJson(kv, KV_KEYS.ROLES, DEFAULT_ROLES);
  } else {
    const allowedSet = new Set(['admin', 'teacher', 'student']);
    const cleanedRoles = existingRoles.filter((r) => allowedSet.has(r.role));
    const existingKeys = new Set(cleanedRoles.map((r) => r.role));
    const missing = DEFAULT_ROLES.filter((r) => !existingKeys.has(r.role));
    if (cleanedRoles.length !== existingRoles.length || missing.length > 0) {
      await kvPutJson(kv, KV_KEYS.ROLES, [...cleanedRoles, ...missing]);
    }
  }
  const existingSettings = await kvGetJson<SchoolSettings>(kv, KV_KEYS.SETTINGS);
  if (!existingSettings) {
    await kvPutJson(kv, KV_KEYS.SETTINGS, defaultSchoolSettings(principalName));
  }
}

export async function createAdminOnlySetup(
  kv: SchoolKVStore,
  input: { fullName: string; username: string; nationalId: string; password: string }
): Promise<StoredUser> {
  await ensureBaseConfig(kv, input.fullName);
  const { hash, salt } = await hashPassword(input.password);
  const admin: StoredUser = {
    id: generateId('usr'),
    username: input.username.trim().toLowerCase(),
    nationalId: input.nationalId.trim(),
    fullName: input.fullName.trim(),
    role: 'admin',
    active: true,
    displayPassword: input.password,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: new Date().toISOString(),
  };

  await kvPutJson(kv, KV_KEYS.user(admin.id), admin);
  await kv.put(KV_KEYS.usernameIdx(admin.username), admin.id);
  await kvAddToIndex(kv, KV_KEYS.USERS_INDEX, admin.id);
  await kvPutJson(kv, KV_KEYS.INITIALIZED, { initialized: true, mode: 'empty', at: new Date().toISOString() });
  return admin;
}

export interface SampleCredentialSummary {
  role: 'admin' | 'teacher' | 'student';
  fullName: string;
  username: string;
  password: string;
  detail: string;
}

export async function createStarterSchoolStructure(
  kv: SchoolKVStore,
  adminInput: { fullName: string; username: string; nationalId: string; password: string }
): Promise<{ admin: StoredUser; credentials: SampleCredentialSummary[] }> {
  const admin = await createAdminOnlySetup(kv, adminInput);
  const now = new Date().toISOString();

  // Check if classes already exist so we don't duplicate
  const existingClasses = await kvGetCollection<SchoolClass>(kv, KV_KEYS.CLASSES_INDEX, KV_KEYS.classItem);
  if (existingClasses.length > 0) {
    return { admin, credentials: [] };
  }

  // Create subjects
  const subMathId = generateId('sub');
  const subPhysicsId = generateId('sub');
  const subPersianId = generateId('sub');
  const subBiologyId = generateId('sub');

  const class10Id = generateId('cls');
  const class11Id = generateId('cls');

  const teacher1Id = generateId('usr');
  const teacher2Id = generateId('usr');
  const student1Id = generateId('usr');
  const student2Id = generateId('usr');
  const student3Id = generateId('usr');

  const t1Creds = await hashPassword('Teacher@1404');
  const t2Creds = await hashPassword('Teacher@1404');
  const s1Creds = await hashPassword('Student@1404');
  const s2Creds = await hashPassword('Student@1404');
  const s3Creds = await hashPassword('Student@1404');

  const subjects: Subject[] = [
    { id: subMathId, code: 'MTH-801', name: 'ریاضی هشتم', gradeLevel: 'هشتم', coefficient: 4, teacherId: teacher1Id, createdAt: now },
    { id: subPhysicsId, code: 'SCI-802', name: 'علوم تجربی هشتم', gradeLevel: 'هشتم', coefficient: 3, teacherId: teacher1Id, createdAt: now },
    { id: subPersianId, code: 'PER-803', name: 'ادبیات فارسی هشتم', gradeLevel: 'هشتم', coefficient: 3, teacherId: teacher2Id, createdAt: now },
    { id: subBiologyId, code: 'SCI-901', name: 'علوم تجربی نهم', gradeLevel: 'نهم', coefficient: 4, teacherId: teacher2Id, createdAt: now },
  ];

  const classes: SchoolClass[] = [
    {
      id: class10Id,
      name: 'هشتم الف',
      gradeLevel: 'هشتم',
      academicYear: '۱۴۰۴-۱۴۰۵',
      capacity: 28,
      room: 'اتاق ۱۰۱',
      teacherIds: [teacher1Id, teacher2Id],
      subjectIds: [subMathId, subPhysicsId, subPersianId],
      createdAt: now,
    },
    {
      id: class11Id,
      name: 'نهم ب',
      gradeLevel: 'نهم',
      academicYear: '۱۴۰۴-۱۴۰۵',
      capacity: 26,
      room: 'اتاق ۲۰۳',
      teacherIds: [teacher2Id],
      subjectIds: [subBiologyId],
      createdAt: now,
    },
  ];

  const users: StoredUser[] = [
    {
      id: teacher1Id,
      username: 'teacher_riazi',
      nationalId: '1375102030',
      fullName: 'استاد بهرام فرهادی',
      role: 'teacher',
      active: true,
      phone: '09141002030',
      email: 'farhadi@shahriar.sch.ir',
      assignedClassIds: [class10Id],
      assignedSubjectIds: [subMathId, subPhysicsId],
      displayPassword: 'Teacher@1404',
      passwordHash: t1Creds.hash,
      passwordSalt: t1Creds.salt,
      createdAt: now,
    },
    {
      id: teacher2Id,
      username: 'teacher_adabiat',
      nationalId: '1378204060',
      fullName: 'خانم مریم سهرابی',
      role: 'teacher',
      active: true,
      phone: '09142004060',
      email: 'sohrabi@shahriar.sch.ir',
      assignedClassIds: [class10Id, class11Id],
      assignedSubjectIds: [subPersianId, subBiologyId],
      displayPassword: 'Teacher@1404',
      passwordHash: t2Creds.hash,
      passwordSalt: t2Creds.salt,
      createdAt: now,
    },
    {
      id: student1Id,
      username: 'student_101',
      nationalId: '1388010203',
      fullName: 'آرش تبریزی',
      role: 'student',
      active: true,
      phone: '09143001122',
      gradeLevel: 'هشتم',
      classId: class10Id,
      displayPassword: 'Student@1404',
      passwordHash: s1Creds.hash,
      passwordSalt: s1Creds.salt,
      createdAt: now,
    },
    {
      id: student2Id,
      username: 'student_102',
      nationalId: '1388040506',
      fullName: 'کیانوش رضایی',
      role: 'student',
      active: true,
      phone: '09143003344',
      gradeLevel: 'هشتم',
      classId: class10Id,
      displayPassword: 'Student@1404',
      passwordHash: s2Creds.hash,
      passwordSalt: s2Creds.salt,
      createdAt: now,
    },
    {
      id: student3Id,
      username: 'student_201',
      nationalId: '1387070809',
      fullName: 'نگار محمدی',
      role: 'student',
      active: true,
      phone: '09143005566',
      gradeLevel: 'نهم',
      classId: class11Id,
      displayPassword: 'Student@1404',
      passwordHash: s3Creds.hash,
      passwordSalt: s3Creds.salt,
      createdAt: now,
    },
  ];

  for (const s of subjects) {
    await kvPutJson(kv, KV_KEYS.subjectItem(s.id), s);
    await kvAddToIndex(kv, KV_KEYS.SUBJECTS_INDEX, s.id);
  }
  for (const c of classes) {
    await kvPutJson(kv, KV_KEYS.classItem(c.id), c);
    await kvAddToIndex(kv, KV_KEYS.CLASSES_INDEX, c.id);
  }
  for (const u of users) {
    await kvPutJson(kv, KV_KEYS.user(u.id), u);
    await kv.put(KV_KEYS.usernameIdx(u.username), u.id);
    await kvAddToIndex(kv, KV_KEYS.USERS_INDEX, u.id);
  }

  // Initial grades
  const grades: GradeRecord[] = [
    { id: generateId('grd'), studentId: student1Id, classId: class10Id, subjectId: subMathId, teacherId: teacher1Id, term: 'نوبت اول', title: 'آزمون فصل مثلثات', score: 18.5, maxScore: 20, date: '1404/08/18', note: 'عملکرد بسیار خوب در اثبات‌ها', createdAt: now },
    { id: generateId('grd'), studentId: student1Id, classId: class10Id, subjectId: subPhysicsId, teacherId: teacher1Id, term: 'نوبت اول', title: 'ارزشیابی حرکت و نیرو', score: 17, maxScore: 20, date: '1404/08/22', createdAt: now },
    { id: generateId('grd'), studentId: student1Id, classId: class10Id, subjectId: subPersianId, teacherId: teacher2Id, term: 'نوبت اول', title: 'آزمون آرایه‌های ادبی', score: 19, maxScore: 20, date: '1404/08/25', createdAt: now },
    { id: generateId('grd'), studentId: student2Id, classId: class10Id, subjectId: subMathId, teacherId: teacher1Id, term: 'نوبت اول', title: 'آزمون فصل مثلثات', score: 14.5, maxScore: 20, date: '1404/08/18', note: 'نیاز به تمرین بیشتر در معادلات مثلثاتی', createdAt: now },
    { id: generateId('grd'), studentId: student2Id, classId: class10Id, subjectId: subPhysicsId, teacherId: teacher1Id, term: 'نوبت اول', title: 'ارزشیابی حرکت و نیرو', score: 15.25, maxScore: 20, date: '1404/08/22', createdAt: now },
    { id: generateId('grd'), studentId: student3Id, classId: class11Id, subjectId: subBiologyId, teacherId: teacher2Id, term: 'نوبت اول', title: 'آزمون دستگاه عصبی', score: 19.5, maxScore: 20, date: '1404/08/24', createdAt: now },
  ];
  for (const g of grades) {
    await kvPutJson(kv, KV_KEYS.gradeItem(g.id), g);
    await kvAddToIndex(kv, KV_KEYS.GRADES_INDEX, g.id);
  }

  // Academic history for students
  const histories: AcademicHistoryRecord[] = [
    { id: generateId('his'), studentId: student1Id, academicYear: '۱۴۰۳-۱۴۰۴', gradeLevel: 'هفتم', gpa: 19.24, status: 'ممتاز', summary: 'قبولی با رتبه برتر پایه هفتم', createdAt: now },
    { id: generateId('his'), studentId: student2Id, academicYear: '۱۴۰۳-۱۴۰۴', gradeLevel: 'هفتم', gpa: 17.65, status: 'قبول', summary: 'قبولی عادی در پایه هفتم', createdAt: now },
    { id: generateId('his'), studentId: student3Id, academicYear: '۱۴۰۳-۱۴۰۴', gradeLevel: 'هشتم', gpa: 19.45, status: 'ممتاز', summary: 'برگزیده المپیاد علوم مدرسه', createdAt: now },
  ];
  for (const h of histories) {
    await kvPutJson(kv, KV_KEYS.historyItem(h.id), h);
    await kvAddToIndex(kv, KV_KEYS.HISTORY_INDEX, h.id);
  }

  // Attendance
  const attendances: AttendanceRecord[] = [
    { id: generateId('att'), studentId: student1Id, classId: class10Id, subjectId: subMathId, teacherId: teacher1Id, date: '1404/08/26', status: 'present', createdAt: now },
    { id: generateId('att'), studentId: student2Id, classId: class10Id, subjectId: subMathId, teacherId: teacher1Id, date: '1404/08/26', status: 'late', note: 'تأخیر ۱۰ دقیقه‌ای', createdAt: now },
    { id: generateId('att'), studentId: student1Id, classId: class10Id, subjectId: subPhysicsId, teacherId: teacher1Id, date: '1404/08/27', status: 'present', createdAt: now },
    { id: generateId('att'), studentId: student2Id, classId: class10Id, subjectId: subPhysicsId, teacherId: teacher1Id, date: '1404/08/27', status: 'absent', note: 'غیبت غیرموجه', createdAt: now },
    { id: generateId('att'), studentId: student3Id, classId: class11Id, subjectId: subBiologyId, teacherId: teacher2Id, date: '1404/08/27', status: 'present', createdAt: now },
  ];
  for (const a of attendances) {
    await kvPutJson(kv, KV_KEYS.attendanceItem(a.id), a);
    await kvAddToIndex(kv, KV_KEYS.ATTENDANCE_INDEX, a.id);
  }

  // Assignments
  const asg1Id = generateId('asg');
  const asg2Id = generateId('asg');
  const assignments: Assignment[] = [
    {
      id: asg1Id,
      title: 'حل تمرین‌های سری دوم مثلثات',
      description: 'تمرین‌های شماره ۱ تا ۸ صفحه ۴۵ کتاب ریاضی هشتم را با ذکر راه‌حل کامل بنویسید و پاسخ نهایی را ثبت کنید.',
      classId: class10Id,
      subjectId: subMathId,
      teacherId: teacher1Id,
      dueDate: '1404/09/05',
      maxScore: 20,
      createdAt: now,
    },
    {
      id: asg2Id,
      title: 'نگارش تحلیل ادبی غزل شهریار',
      description: 'آرایه‌های ادبی و پیام اصلی یکی از غزل‌های دیوان استاد شهریار را در دو بند تحلیل کنید.',
      classId: class10Id,
      subjectId: subPersianId,
      teacherId: teacher2Id,
      dueDate: '1404/09/08',
      maxScore: 20,
      createdAt: now,
    },
  ];
  for (const asg of assignments) {
    await kvPutJson(kv, KV_KEYS.assignmentItem(asg.id), asg);
    await kvAddToIndex(kv, KV_KEYS.ASSIGNMENTS_INDEX, asg.id);
  }

  const sub1: AssignmentSubmission = {
    id: generateId('sbm'),
    assignmentId: asg2Id,
    studentId: student1Id,
    status: 'graded',
    submittedText: 'تحلیل غزل «آمدی جانم به قربانت ولی حالا چرا» با بررسی استعاره، تشبیه و جناس در ابیات آغازین ارسال شد.',
    submittedAt: now,
    score: 19.5,
    feedback: 'تحلیل دقیق و منسجمی ارائه داده‌اید.',
    gradedAt: now,
    gradedBy: teacher2Id,
  };
  await kvPutJson(kv, KV_KEYS.submissionItem(sub1.id), sub1);
  await kvAddToIndex(kv, KV_KEYS.SUBMISSIONS_INDEX, sub1.id);

  // Weekly Schedule
  const schedules: ScheduleSlot[] = [
    { id: generateId('sch'), classId: class10Id, dayOfWeek: 0, period: 1, startTime: '08:00', endTime: '09:30', subjectId: subMathId, teacherId: teacher1Id, room: '۱۰۱' },
    { id: generateId('sch'), classId: class10Id, dayOfWeek: 0, period: 2, startTime: '09:45', endTime: '11:15', subjectId: subPersianId, teacherId: teacher2Id, room: '۱۰۱' },
    { id: generateId('sch'), classId: class10Id, dayOfWeek: 1, period: 1, startTime: '08:00', endTime: '09:30', subjectId: subPhysicsId, teacherId: teacher1Id, room: 'آزمایشگاه' },
    { id: generateId('sch'), classId: class10Id, dayOfWeek: 2, period: 1, startTime: '08:00', endTime: '09:30', subjectId: subMathId, teacherId: teacher1Id, room: '۱۰۱' },
    { id: generateId('sch'), classId: class11Id, dayOfWeek: 0, period: 1, startTime: '08:00', endTime: '09:30', subjectId: subBiologyId, teacherId: teacher2Id, room: '۲۰۳' },
  ];
  for (const sl of schedules) {
    await kvPutJson(kv, KV_KEYS.scheduleItem(sl.id), sl);
    await kvAddToIndex(kv, KV_KEYS.SCHEDULES_INDEX, sl.id);
  }

  // Announcements
  const announcements: Announcement[] = [
    {
      id: generateId('ann'),
      title: 'آغاز ثبت‌نام المپیادهای علمی سال تحصیلی ۱۴۰۴-۱۴۰۵',
      body: 'دانش‌آموزان علاقه‌مند به شرکت در المپیادهای ریاضی، فیزیک و زیست‌شناسی تا پایان هفته جاری به دفتر معاونت آموزشی مراجعه نمایند.',
      authorId: admin.id,
      authorName: admin.fullName,
      authorRole: 'admin',
      targetType: 'all',
      priority: 'important',
      createdAt: now,
    },
    {
      id: generateId('ann'),
      title: 'زمان‌بندی آزمون میان‌ترم ریاضی هشتم',
      body: 'آزمون میان‌ترم فصل‌های اول و دوم ریاضی هشتم روز دوشنبه هفته آینده در زنگ اول برگزار می‌شود.',
      authorId: teacher1Id,
      authorName: 'استاد بهرام فرهادی',
      authorRole: 'teacher',
      targetType: 'class',
      targetClassId: class10Id,
      priority: 'normal',
      createdAt: now,
    },
  ];
  for (const ann of announcements) {
    await kvPutJson(kv, KV_KEYS.announcementItem(ann.id), ann);
    await kvAddToIndex(kv, KV_KEYS.ANNOUNCEMENTS_INDEX, ann.id);
  }

  // Direct messages
  const msg: DirectMessage = {
    id: generateId('msg'),
    senderId: teacher1Id,
    senderName: 'استاد بهرام فرهادی',
    senderRole: 'teacher',
    recipientId: student1Id,
    subject: 'دعوت به کارگاه حل تمرین المپیاد',
    body: 'آرش عزیز، با توجه به نمره خوب شما در آزمون اخیر، پیشنهاد می‌کنم در جلسه رفع اشکال پنج‌شنبه شرکت کنید.',
    readBy: [],
    createdAt: now,
  };
  await kvPutJson(kv, KV_KEYS.messageItem(msg.id), msg);
  await kvAddToIndex(kv, KV_KEYS.MESSAGES_INDEX, msg.id);

  // Starter Approved Teacher Sources for Private Tutor («معلم خصوصی»)
  const starterSources: TeacherSourceMaterial[] = [
    {
      id: generateId('tsrc'),
      title: 'جزوه جامع مثلثات و روابط پایه — هشتم استعدادهای درخشان',
      subjectId: subMathId,
      subjectName: 'ریاضی هشتم',
      gradeLevel: 'هشتم',
      chapter: 'فصل دوم: مثلثات',
      topic: 'نسبت‌های مثلثاتی و اتحادهای فیثاغورسی',
      authorId: teacher1Id,
      authorName: 'استاد بهرام فرهادی',
      authorRole: 'teacher',
      approved: true,
      summary: 'پوشش کامل دایره مثلثاتی، زوایای متمم و مکمل، و اثبات اتحادهای پرکاربرد المپیاد و امتحان نهایی.',
      pages: [
        {
          pageNumber: 1,
          heading: 'دایره مثلثاتی و تعریف سینوس و کسینوس',
          content:
            'در دایره مثلثاتی با شعاع واحد ۱ که مرکز آن در مبدأ مختصات قرار دارد، برای هر زاویه θ مختصات نقطه روی دایره برابر (cos θ, sin θ) است. بنابراین همواره رابطه بنیادی sin²θ + cos²θ = 1 برقرار است. در ربع اول هر دو نسبت مثبت، در ربع دوم فقط سینوس مثبت، در ربع سوم تانژانت و کتانژانت مثبت و در ربع چهارم کسینوس مثبت است.',
        },
        {
          pageNumber: 2,
          heading: 'زوایای متمم، مکمل و معادلات مثلثاتی مقدماتی',
          content:
            'برای هر زاویه α داریم: sin(90° - α) = cos α و cos(90° - α) = sin α. همچنین برای زوایای مکمل sin(180° - α) = sin α و cos(180° - α) = -cos α است. نکته مهم در حل معادله sin x = a این است که به هر دو جواب x = α + 2kπ و x = π - α + 2kπ توجه شود.',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: generateId('tsrc'),
      title: 'خلاصه درس قوانین حرکت نیوتن و دینامیک',
      subjectId: subPhysicsId,
      subjectName: 'علوم تجربی هشتم',
      gradeLevel: 'هشتم',
      chapter: 'فصل حرکت و نیرو',
      topic: 'قانون دوم نیوتن و نیروی اصطکاک',
      authorId: teacher1Id,
      authorName: 'استاد بهرام فرهادی',
      authorRole: 'teacher',
      approved: true,
      summary: 'تحلیل نمودار جسم آزاد، محاسبه شتاب حرکت و تفکیک اصطکاک ایستایی و جنبشی.',
      pages: [
        {
          pageNumber: 1,
          heading: 'قانون اول و دوم نیوتن',
          content:
            'مطابق قانون اول نیوتن (لختی)، اگر برآیند نیروهای وارد بر جسم صفر باشد، جسم حالت سکون یا حرکت یکنواخت خود را حفظ می‌کند. مطابق قانون دوم نیوتن، شتاب جسم با برآیند نیروها نسبت مستقیم و با جرم جسم نسبت عکس دارد: ΣF = m·a.',
        },
        {
          pageNumber: 2,
          heading: 'اصطکاک ایستایی و جنبشی',
          content:
            'نیروی اصطکاک ایستایی حداکثر از رابطه fs,max = μs·N محاسبه می‌شود و تا پیش از آستانه حرکت با نیروی محرک برابر است. پس از شروع حرکت، نیروی اصطکاک جنبشی ثابت بوده و برابر fk = μk·N است که معمولاً μk < μs می‌باشد.',
        },
      ],
      createdAt: now,
      updatedAt: now,
    },
  ];
  for (const src of starterSources) {
    await kvPutJson(kv, KV_KEYS.tutorSourceItem(src.id), src);
    await kvAddToIndex(kv, KV_KEYS.TUTOR_SOURCES_INDEX, src.id);
  }

  // Starter Digital Library Items
  const libItems: DigitalLibraryItem[] = [
    {
      id: generateId('lib'),
      title: 'جزوه نکته و تست مثلثات (دبیرستان استاد شهریار)',
      description: 'مجموعه درسنامه طبقه‌بندی‌شده به همراه مثال‌های تشریحی و تستی ویژه پایه هشتم.',
      category: 'verified_teacher_resource',
      subjectId: subMathId,
      subjectName: 'ریاضی هشتم',
      gradeLevel: 'هشتم',
      durationOrPages: '۱۸ صفحه',
      contentPreview: 'این جزوه شامل ۳ بخش اصلی است: ۱) دایره مثلثاتی و تعیین علامت، ۲) اتحادهای پایه و اثبات، ۳) ۱۵ نمونه سؤال سطح استعدادهای درخشان.',
      authorId: teacher1Id,
      authorName: 'استاد بهرام فرهادی',
      approved: true,
      createdAt: now,
    },
    {
      id: generateId('lib'),
      title: 'کتابچه آمادگی المپیاد ادبی و آرایه‌های فارسی',
      description: 'بررسی تطبیقی استعاره، کنایه، ایهام و جناس با نمونه اشعار استاد شهریار و حافظ.',
      category: 'book',
      subjectId: subPersianId,
      subjectName: 'ادبیات فارسی هشتم',
      gradeLevel: 'هشتم',
      durationOrPages: '۴۲ صفحه',
      contentPreview: 'تحلیل دقیق ابیات شاخص غزلیات استاد شهریار همراه با تمرین‌های طبقه‌بندی‌شده و کلید تحلیلی.',
      authorId: teacher2Id,
      authorName: 'خانم مریم سهرابی',
      approved: true,
      createdAt: now,
    },
    {
      id: generateId('lib'),
      title: 'نمونه‌سؤال نوبت اول علوم تجربی نهم',
      description: 'مجموعه سؤالات استاندارد دستگاه عصبی و حواس همراه با پاسخ‌نامه تشریحی.',
      category: 'sample_exam',
      subjectId: subBiologyId,
      subjectName: 'علوم تجربی نهم',
      gradeLevel: 'نهم',
      durationOrPages: '۲۵ سؤال',
      contentPreview: 'شامل ۱۰ سؤال چهارگزینه‌ای، ۵ سؤال صحیح/غلط و ۱۰ سؤال تشریحی مفهومی ویژه نوبت اول.',
      authorId: teacher2Id,
      authorName: 'خانم مریم سهرابی',
      approved: true,
      createdAt: now,
    },
  ];
  for (const lib of libItems) {
    await kvPutJson(kv, KV_KEYS.libraryItem(lib.id), lib);
    await kvAddToIndex(kv, KV_KEYS.LIBRARY_INDEX, lib.id);
  }

  // Starter Honors File
  const starterHonors: StudentHonor[] = [
    {
      id: generateId('hon'),
      studentId: student1Id,
      studentName: 'آرش تبریزی',
      title: 'رتبه برگزیده مرحله اول المپیاد ریاضی ناحیه',
      category: 'olympiad',
      level: 'district',
      rankOrMedal: 'رتبه دوم ناحیه',
      date: '1404/08/10',
      issuer: 'اداره آموزش و پرورش ناحیه',
      description: 'کسب نمره ممتاز در آزمون مرحله اول المپیاد علمی ریاضی پایه هشتم.',
      createdBy: admin.id,
      createdByName: admin.fullName,
      createdAt: now,
    },
    {
      id: generateId('hon'),
      studentId: student3Id,
      studentName: 'نگار محمدی',
      title: 'کسب مدال برنز جشنواره زیست‌فناوری استانی',
      category: 'innovation',
      level: 'province',
      rankOrMedal: 'مدال برنز',
      date: '1404/07/22',
      issuer: 'بنیاد نخبگان استان',
      description: 'ارائه مقاله پژوهشی برتر در حوزه مهندسی ژنتیک پایه.',
      createdBy: admin.id,
      createdByName: admin.fullName,
      createdAt: now,
    },
  ];
  for (const h of starterHonors) {
    await kvPutJson(kv, KV_KEYS.honorItem(h.id), h);
    await kvAddToIndex(kv, KV_KEYS.HONORS_INDEX, h.id);
  }

  // Starter Bank Question & Sample Online Exam
  const bankQ: TeacherBankQuestion = {
    id: generateId('qbq'),
    teacherId: teacher1Id,
    teacherName: 'استاد بهرام فرهادی',
    subjectId: subMathId,
    gradeLevel: 'هشتم',
    chapter: 'فصل مثلثات',
    topic: 'اتحادهای مثلثاتی',
    difficulty: 'medium',
    type: 'mcq',
    prompt: 'اگر sin α = 3/5 و α در ربع دوم باشد، مقدار cos α کدام است؟',
    options: ['-4/5', '4/5', '-3/4', '3/4'],
    correctIndex: 0,
    points: 2,
    explanation: 'در ربع دوم کسینوس منفی است و از رابطه sin²α + cos²α = 1 نتیجه می‌شود cos α = -4/5.',
    createdAt: now,
  };
  await kvPutJson(kv, KV_KEYS.questionBankItem(bankQ.id), bankQ);
  await kvAddToIndex(kv, KV_KEYS.QUESTION_BANK_INDEX, bankQ.id);

  const starterExam: OnlineExam = {
    id: generateId('exm'),
    title: 'آزمون تمرینی مثلثات — نسخه الف',
    description: 'ارزشیابی ترکیبی شامل سؤالات چهارگزینه‌ای، صحیح/غلط و جای‌خالی از فصل مثلثات',
    classId: class10Id,
    subjectId: subMathId,
    teacherId: teacher1Id,
    gradeLevel: 'هشتم',
    chapter: 'فصل دوم: مثلثات',
    topic: 'اتحادهای مثلثاتی و زوایا',
    difficulty: 'medium',
    versionLabel: 'نسخه A',
    durationMinutes: 20,
    dueDate: '1404/10/20',
    active: true,
    questions: [
      {
        id: generateId('q'),
        type: 'mcq',
        prompt: 'حاصل عبارت sin²(35°) + cos²(35°) برابر با کدام گزینه است؟',
        options: ['۱', '۰', '۲', '۰/۵'],
        correctIndex: 0,
        points: 2,
        topic: 'اتحاد فیثاغورسی',
        difficulty: 'easy',
      },
      {
        id: generateId('q'),
        type: 'true_false',
        prompt: 'در ربع سوم مثلثاتی، هر دو نسبت تانژانت و کتانژانت دارای علامت مثبت هستند.',
        options: ['صحیح', 'غلط'],
        correctIndex: 0,
        points: 2,
        topic: 'تعیین علامت نسبت‌ها',
        difficulty: 'medium',
      },
      {
        id: generateId('q'),
        type: 'fill_blank',
        prompt: 'مقدار sin(30°) برابر با ..... است (به صورت عددی مانند 0.5 بنویسید).',
        options: [],
        correctIndex: -1,
        correctText: '0.5',
        points: 2,
        topic: 'زوایای معروف',
        difficulty: 'easy',
      },
    ],
    createdAt: now,
  };
  await kvPutJson(kv, KV_KEYS.examItem(starterExam.id), starterExam);
  await kvAddToIndex(kv, KV_KEYS.EXAMS_INDEX, starterExam.id);

  await kvPutJson(kv, KV_KEYS.INITIALIZED, { initialized: true, mode: 'starter', at: now });

  return {
    admin,
    credentials: [
      { role: 'admin', fullName: admin.fullName, username: admin.username, password: adminInput.password, detail: 'دسترسی کامل مدیریت مدرسه' },
      { role: 'teacher', fullName: 'استاد بهرام فرهادی', username: 'teacher_riazi', password: 'Teacher@1404', detail: 'معلم ریاضی و علوم (کلاس هشتم الف)' },
      { role: 'teacher', fullName: 'خانم مریم سهرابی', username: 'teacher_adabiat', password: 'Teacher@1404', detail: 'معلم ادبیات و علوم (هشتم و نهم)' },
      { role: 'student', fullName: 'آرش تبریزی', username: 'student_101', password: 'Student@1404', detail: 'دانش‌آموز پایه هشتم الف' },
      { role: 'student', fullName: 'نگار محمدی', username: 'student_201', password: 'Student@1404', detail: 'دانش‌آموز پایه نهم ب' },
    ],
  };
}
