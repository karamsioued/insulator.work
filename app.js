'use strict';
/* =========================================================================
   Insulator Workshop Tracker — v1
   Single-page app. Data is stored on this device (localStorage) through the
   small `db` layer below so it can later be swapped for a cloud backend.
   ========================================================================= */
const DEMO_MODE = new URLSearchParams(location.search).has('demo'); // presentation link: own sample data, never touches the real workshop data
const STORE_KEY = DEMO_MODE ? 'ins_tracker_demo' : 'ins_tracker_v1', LANG_KEY = 'ins_lang', SESSION_KEY = DEMO_MODE ? 'ins_session_demo' : 'ins_session';

/* ---------------- helpers ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DAY = 86400000;
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const startOfDay = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
const addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };

function sha256(ascii) { // compact SHA-256 (works without a secure context, e.g. on a tablet over LAN)
  const rr = (v, a) => (v >>> a) | (v << (32 - a)); const mp = Math.pow, maxWord = mp(2, 32);
  let result = '', words = [], bitLen = ascii.length * 8, hash = [], k = [], pc = 0; const comp = {};
  for (let c = 2; pc < 64; c++) { if (!comp[c]) { for (let i = 0; i < 313; i += c) comp[i] = c; hash[pc] = (mp(c, .5) * maxWord) | 0; k[pc++] = (mp(c, 1 / 3) * maxWord) | 0; } }
  hash = hash.slice(0, 8); ascii += '\x80'; while (ascii.length % 64 - 56) ascii += '\x00';
  for (let i = 0; i < ascii.length; i++) { const j = ascii.charCodeAt(i); if (j >> 8) return ''; words[i >> 2] |= j << ((3 - i) % 4) * 8; }
  words[words.length] = (bitLen / maxWord) | 0; words[words.length] = bitLen;
  for (let j = 0; j < words.length;) {
    const w = words.slice(j, j += 16), old = hash; hash = hash.slice(0, 8);
    for (let i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
      const t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
      const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(t1 + t2) | 0].concat(hash); hash[4] = (hash[4] + t1) | 0;
    }
    for (let i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
  }
  for (let i = 0; i < 8; i++) for (let j = 3; j + 1; j--) { const b = (hash[i] >> (j * 8)) & 255; result += ((b < 16) ? 0 : '') + b.toString(16); }
  return result;
}
const H = pin => sha256('insulator:' + pin);

/* ---------------- catalog ---------------- */
const PARTS = {
  fbumper: { ar: 'الصدام الأمامي', en: 'Front bumper', g: 'body' },
  hood: { ar: 'الكبوت', en: 'Hood', g: 'body' },
  fender_l: { ar: 'الرفرف الأمامي يسار', en: 'Front fender (L)', g: 'body' },
  fender_r: { ar: 'الرفرف الأمامي يمين', en: 'Front fender (R)', g: 'body' },
  mirror_l: { ar: 'المراية يسار', en: 'Mirror (L)', g: 'body' },
  mirror_r: { ar: 'المراية يمين', en: 'Mirror (R)', g: 'body' },
  door_fl: { ar: 'الباب الأول يسار', en: 'Front door (L)', g: 'body' },
  door_fr: { ar: 'الباب الأول يمين', en: 'Front door (R)', g: 'body' },
  door_rl: { ar: 'الباب الثاني يسار', en: 'Rear door (L)', g: 'body' },
  door_rr: { ar: 'الباب الثاني يمين', en: 'Rear door (R)', g: 'body' },
  roof: { ar: 'السقف', en: 'Roof', g: 'body' },
  quarter_l: { ar: 'الرفرف الخلفي يسار', en: 'Rear quarter (L)', g: 'body' },
  quarter_r: { ar: 'الرفرف الخلفي يمين', en: 'Rear quarter (R)', g: 'body' },
  trunk: { ar: 'الشنطة', en: 'Trunk', g: 'body' },
  rbumper: { ar: 'الصدام الخلفي', en: 'Rear bumper', g: 'body' },
  windshield: { ar: 'الزجاج الأمامي', en: 'Windshield', g: 'glass' },
  win_fl: { ar: 'شباك الباب الأول يسار', en: 'Front window (L)', g: 'glass' },
  win_fr: { ar: 'شباك الباب الأول يمين', en: 'Front window (R)', g: 'glass' },
  win_rl: { ar: 'شباك الباب الثاني يسار', en: 'Rear window (L)', g: 'glass' },
  win_rr: { ar: 'شباك الباب الثاني يمين', en: 'Rear window (R)', g: 'glass' },
  rear_glass: { ar: 'الزجاج الخلفي', en: 'Rear glass', g: 'glass' },
  sunroof: { ar: 'فتحة السقف', en: 'Sunroof', g: 'glass' },
  whole: { ar: 'السيارة كاملة', en: 'Whole car', g: 'whole' },
};
const BODY = Object.keys(PARTS).filter(k => PARTS[k].g === 'body');
const GLASS = Object.keys(PARTS).filter(k => PARTS[k].g === 'glass');
const SERVICES = [
  { k: 'full_ppf', g: 'ppf', ar: 'حماية كاملة', en: 'Full PPF', parts: BODY },
  { k: 'half_ppf', g: 'ppf', ar: 'نصف حماية', en: 'Half PPF', parts: ['fbumper', 'hood', 'fender_l', 'fender_r'] }, // front bumper + full hood + both front fenders
  { k: 'quarter_ppf', g: 'ppf', ar: 'ربع حماية', en: 'Quarter PPF', parts: ['fbumper', 'hood', 'fender_l', 'fender_r'] }, // front bumper + half the hood + half of each front fender
  { k: 'color_change', g: 'wrap', ar: 'تغيير لون', en: 'Color change', parts: BODY },
  { k: 'tint', g: 'tint', ar: 'عازل حراري', en: 'Window tint', parts: ['windshield', 'rear_glass', 'win_fl', 'win_fr', 'win_rl', 'win_rr'] },
  { k: 'ceramic', g: 'cer', ar: 'نانو سيراميك', en: 'Ceramic coating', parts: ['whole'] },
  { k: 'polish', g: 'pol', ar: 'بوليش', en: 'Polish', parts: ['whole'] },
  { k: 'clean', g: 'cln', ar: 'تنظيف', en: 'Cleaning', parts: ['whole'] }, // after PPF — done by the polish team
  { k: 'windshield', g: 'jam', ar: 'تركيب الجامة', en: 'Windshield install', parts: ['windshield'] },
  { k: 'windshield_off', g: 'jamx', ar: 'نزع الجامة', en: 'Windshield removal', parts: ['windshield'] }, // any worker — PPF or polish team
  { k: 'checkup', g: 'chk', ar: 'تشييك', en: 'Check-up', parts: ['whole'] }, // the 3-day check after a new job
  { k: 'service', g: 'srv', ar: 'سيرفيس', en: 'Service visit', parts: ['whole'] }, // a car we worked on before: just pick the workers
  { k: 'replace', g: 'rep', ar: 'تغيير قطع', en: 'Panel replacement', parts: [] },
];
const SVC = Object.fromEntries(SERVICES.map(s => [s.k, s]));
// how the new-car page groups the services
const SVC_CATS = [
  { k: 'ppf', ic: 'shield', ar: 'الحماية', en: 'PPF', svcs: ['full_ppf', 'half_ppf', 'quarter_ppf', 'color_change'], hint: { ar: 'خيار واحد فقط', en: 'one only' } },
  { k: 'tint', ic: 'sun', ar: 'العازل الحراري', en: 'Tint', svcs: ['tint', 'windshield', 'windshield_off'] },
  { k: 'pol', ic: 'spark', ar: 'البوليش', en: 'Polish', svcs: ['polish', 'ceramic', 'clean'] },
  { k: 'rep', ic: 'swap', ar: 'تغيير القطع', en: 'Panel replacement', svcs: ['replace'] },
  { k: 'srv', ic: 'clock', ar: 'سيرفيس', en: 'Service', svcs: ['service', 'checkup'], hint: { ar: 'لسيارة اشتغلنا عليها من قبل', en: 'for a car we worked on before' } },
];
const FILM_TYPES = { ppf: { ar: 'حماية PPF', en: 'PPF film' }, tint: { ar: 'عازل حراري', en: 'Window film' }, wrap: { ar: 'تغيير لون', en: 'Color wrap' }, cer: { ar: 'سيراميك', en: 'Ceramic' } };
// kind = 'ppf' | 'tint' — only used by "panel replacement", where the supervisor picks which one first
const poolOf = (svc, kind) => { const g = SVC[svc].g; return g === 'tint' ? GLASS : (g === 'jam' || g === 'jamx') ? ['windshield'] : g === 'rep' ? (kind === 'tint' ? GLASS : BODY) : (g === 'cer' || g === 'pol' || g === 'cln' || g === 'srv' || g === 'chk') ? ['whole'] : BODY; };
const isTintLike = (svc, kind) => { const g = SVC[svc].g; return g === 'tint' || g === 'jam' || g === 'jamx' || (g === 'rep' && kind === 'tint'); };
// services with a sub-type picked first: panel replacement (tint/PPF) and polish (exterior/interior/both)
const KINDS = { rep: ['tint', 'ppf'], pol: ['ext', 'int', 'both'] };
const KIND_DEF = { rep: 'ppf', pol: 'ext' };
const hasKind = svc => !!KINDS[SVC[svc].g];
const kindLabel = k => t({ tint: 'replTint', ppf: 'replPpf', ext: 'polExt', int: 'polInt', both: 'polBoth' }[k] || k);
const needShade = () => false; // owner: tint needs neither shade nor film
const needFilm = svc => SVC[svc].g === 'jam'; // the windshield service only needs the film type
const dKind = svc => (draft && draft.kind && draft.kind[svc]) || KIND_DEF[SVC[svc].g] || 'ppf';
const SVC_TEAM = svc => SVC[svc].g === 'jamx' ? 'all' : ['cer', 'pol', 'cln'].includes(SVC[svc].g) ? 'polish' : 'ppf';
const inTeam = (w, team) => team === 'all' || teamOf(w) === team;
const PALETTE = ['#FBBF15', '#5FB4FF', '#2FD896', '#FF7A59', '#B98CFF', '#FF5D9E', '#6FE3D0', '#F2E863', '#9DB4FF', '#FFA94D'];
// Brands ordered by how common they are on Qatar roads; models list Qatar trims. Anything else → "Other".
const MODELS = {
  'Toyota': ['Land Cruiser GXR', 'Land Cruiser VXR', 'Land Cruiser GR Sport', 'Land Cruiser GX', 'Land Cruiser 70', 'Prado', 'Fortuner', 'Hilux', 'Camry', 'Corolla', 'Yaris', 'RAV4', 'Sequoia', 'Tundra', 'Highlander', 'Crown', 'Supra', 'Rush', 'Hiace', 'Granvia'],
  'Nissan': ['Patrol LE Platinum', 'Patrol LE Titanium', 'Patrol SE', 'Patrol XE', 'Patrol Nismo', 'Patrol Safari', 'Altima', 'Sunny', 'X-Trail', 'Pathfinder', 'Kicks', 'Navara', 'Z'],
  'Lexus': ['LX 600', 'LX 500d', 'GX 550', 'GX 460', 'ES', 'LS', 'RX', 'NX', 'UX', 'IS', 'LC', 'LM', 'TX'],
  'Land Rover': ['Range Rover', 'Range Rover Sport', 'Range Rover Velar', 'Range Rover Evoque', 'Defender 90', 'Defender 110', 'Defender 130', 'Discovery', 'Discovery Sport'],
  'Mercedes-Benz': ['G 63 AMG', 'G 500', 'S-Class', 'Maybach S 580', 'E-Class', 'C-Class', 'GLE', 'GLS', 'Maybach GLS', 'GLC', 'CLE', 'AMG GT', 'V-Class', 'EQS'],
  'GMC': ['Yukon', 'Yukon Denali', 'Yukon XL', 'Sierra', 'Sierra Denali', 'Acadia', 'Terrain', 'Hummer EV'],
  'Chevrolet': ['Tahoe', 'Suburban', 'Silverado', 'Camaro', 'Corvette', 'Traverse', 'Captiva', 'Malibu', 'Groove'],
  'Mitsubishi': ['Pajero', 'Montero Sport', 'Outlander', 'ASX', 'Attrage', 'L200', 'Xpander'],
  'Hyundai': ['Tucson', 'Santa Fe', 'Palisade', 'Elantra', 'Sonata', 'Accent', 'Creta', 'Kona', 'Staria'],
  'Kia': ['Sportage', 'Sorento', 'Telluride', 'K5', 'Cerato', 'Pegas', 'Seltos', 'Carnival', 'K8', 'EV9'],
  'Ford': ['Expedition', 'Explorer', 'F-150', 'F-150 Raptor', 'Bronco', 'Mustang', 'Edge', 'Ranger', 'Territory'],
  'BMW': ['X7', 'X5', 'X6', 'X3', 'X4', '7 Series', '5 Series', '3 Series', '8 Series', 'M5', 'M8', 'XM', 'i7', 'iX'],
  'Porsche': ['Cayenne', 'Cayenne Coupe', 'Macan', 'Panamera', '911', 'Taycan', '718'],
  'Dodge': ['Charger', 'Challenger', 'Durango', 'Ram 1500'],
  'Jeep': ['Wrangler', 'Grand Cherokee', 'Grand Cherokee L', 'Gladiator', 'Grand Wagoneer'],
  'Cadillac': ['Escalade', 'Escalade ESV', 'XT6', 'XT5', 'CT5', 'Lyriq'],
  'Infiniti': ['QX80', 'QX60', 'QX55', 'QX50'],
  'Honda': ['Accord', 'Civic', 'CR-V', 'Pilot', 'HR-V', 'City'],
  'Mazda': ['CX-90', 'CX-9', 'CX-5', 'CX-30', 'Mazda 6', 'Mazda 3'],
  'Audi': ['Q7', 'Q8', 'RS Q8', 'A6', 'A8', 'Q5', 'RS6', 'e-tron GT'],
  'Genesis': ['GV80', 'GV70', 'G90', 'G80'],
  'Jetour': ['T2', 'T1', 'X70', 'X70 Plus', 'X90', 'X90 Plus', 'Dashing', 'G700'],
  'Changan': ['CS95', 'CS85', 'CS75', 'UNI-K', 'UNI-T', 'Alsvin'],
  'Geely': ['Monjaro', 'Tugella', 'Coolray', 'Okavango', 'Emgrand'],
  'MG': ['RX8', 'RX5', 'ZS', 'HS', 'GT', 'MG5', 'MG7'],
  'Haval': ['H9', 'H7', 'H6', 'H6 GT', 'Jolion', 'Dargo'],
  'Tank': ['Tank 300', 'Tank 500', 'Tank 700', 'Tank 400'],
  'ROX': ['ROX 01', 'ROX Adamas'],
  'iCAUR': ['V27', 'V23', '03'],
  'Deepal': ['S07', 'L07', 'G318', 'S05'],
  'Denza': ['B8', 'B5', 'D9', 'N7', 'N9', 'Z9 GT'],
  'Leopard': ['Leopard 8', 'Leopard 5', 'Ti7'],
  'Chery': ['Tiggo 8 Pro', 'Tiggo 7 Pro', 'Tiggo 4', 'Arrizo'],
  'BYD': ['Tang', 'Han', 'Seal', 'Seal U', 'Song Plus', 'Atto 3', 'Shark', 'Ti7'],
  'Tesla': ['Model Y', 'Model 3', 'Model S', 'Model X', 'Cybertruck'],
  'Volkswagen': ['Teramont', 'Touareg', 'Tiguan', 'Golf GTI'],
  'Suzuki': ['Jimny', 'Swift', 'Vitara', 'Ertiga', 'Dzire'],
  'Isuzu': ['D-Max', 'MU-X'],
  'Bentley': ['Bentayga', 'Continental GT', 'Flying Spur'],
  'Rolls-Royce': ['Cullinan', 'Ghost', 'Phantom', 'Spectre', 'Wraith', 'Dawn'],
  'Lamborghini': ['Urus', 'Revuelto', 'Huracán'],
  'Ferrari': ['Purosangue', 'Roma', '296', 'SF90', '812', '12Cilindri'],
};
// The brands the shop gets most come first so the supervisor doesn't have to search
const TOP_MAKES = ['Toyota', 'Nissan', 'Lexus', 'Denza', 'Leopard', 'Jetour', 'Haval', 'Tank', 'ROX'];
const MAKES = [...TOP_MAKES, ...Object.keys(MODELS).filter(m => !TOP_MAKES.includes(m))];
const COLORS = [['أبيض', 'White'], ['أسود', 'Black'], ['رمادي', 'Grey'], ['فضي', 'Silver'], ['أزرق', 'Blue'], ['أحمر', 'Red'], ['بيج', 'Beige'], ['بني', 'Brown'], ['أخضر', 'Green'], ['ذهبي', 'Gold'], ['برتقالي', 'Orange'], ['أصفر', 'Yellow']];
const YEARS = Array.from({ length: 2027 - 1990 + 1 }, (_, i) => String(2027 - i));

/* ---------------- i18n ---------------- */
const T = {
  ar: {
    app: 'متابعة الإنتاجية', appSub: 'نظام الورشة', heroA: 'كل قطعة،', heroB: 'كل دقيقة،', heroC: 'محسوبة.',
    heroP: 'سجّل السيارة، وزّع القطع على الفريق، وتابع الوقت والإنتاجية لحظة بلحظة.',
    chooseAcc: 'اختر حسابك', enterPin: 'أدخل الرمز السري', wrongPin: 'الرمز غير صحيح', back: 'رجوع',
    admin: 'المالك', manager: 'مدير', supervisor: 'مشرف',
    floor: 'الورشة الآن', new: 'سيارة جديدة', dashboard: 'الأداء', history: 'السجل', settings: 'الإعدادات', job: 'السيارة', worker: 'العامل',
    lock: 'قفل', workingNow: 'يعمل الآن', openCars: 'سيارات قيد العمل', doneToday: 'قطع منجزة اليوم', carsToday: 'سيارات اليوم',
    workers: 'العمّال', idle: 'متاح', pending: 'بانتظار البدء', openJobs: 'السيارات قيد العمل', closedToday: 'أُغلقت اليوم',
    noOpen: 'لا توجد سيارات قيد العمل الآن', addCar: 'إضافة سيارة',
    carInfo: 'معلومات السيارة', make: 'الشركة', model: 'الموديل', year: 'سنة الصنع', color: 'اللون', plate: 'رقم اللوحة', customer: 'اسم العميل', phone: 'جوال العميل', notes: 'ملاحظات',
    date: 'التاريخ', services: 'الخدمات', chooseSvc: 'اختر خدمة واحدة أو أكثر', other: 'أخرى', pause: 'إيقاف مؤقت', resume: 'استئناف', paused: 'متوقف مؤقتاً', pausedToast: 'تم الإيقاف المؤقت', pauseAll: 'إيقاف الكل مؤقتاً', resumeAll: 'استئناف الكل', pauseAllQ: 'إيقاف {0} مهمة جارية مؤقتاً (نهاية الدوام)؟', resumeAllQ: 'استئناف {0} مهمة متوقفة؟', pts: 'نقطة', nameEn: 'الاسم بالإنجليزي', typeColor: 'اكتب اللون', replWhat: 'تغيير قطع في', replTint: 'العازل', replPpf: 'الحماية', typeMake: 'اكتب اسم الشركة', typeModel: 'اختر أو اكتب الموديل', tintSpec: 'العازل ونسبة التظليل لكل شباك', applyAll: 'للكل', shade: 'النسبة', with: 'مع', workersMany: 'العمّال (ممكن أكثر من واحد)', lgInc: 'محددة', lgAs: 'معيّنة لعامل', lgOff: 'غير مشمولة', extraSvc: 'خدمات إضافية', allWorkers: 'عرض كل العمّال', teamOnly: 'الفريق فقط', assignWork: 'توزيع العمل', film: 'نوع العازل / الفيلم', noFilm: '— بدون تحديد —',
    pickWorker: 'اختر العامل ثم اضغط على القطع — تقدر تحط أكثر من عامل على نفس القطعة', noWorkerSel: 'بدون عامل: الضغط يضيف القطعة أو يزيلها فقط',
    front: 'الأمام', parts: 'القطع', assigned: 'معيّنة', unassigned: 'غير معيّن', all: 'تحديد الكل', clear: 'مسح', assignRest: 'عيّن الباقي لـ',
    saveStart: 'حفظ السيارة', needCar: 'أدخل الشركة أو رقم اللوحة', needSvc: 'اختر خدمة واحدة على الأقل', needParts: 'لا توجد قطع محددة',
    saved: 'تم حفظ السيارة', tasks: 'مهام', task: 'مهمة', start: 'ابدأ', finish: 'إنهاء', done: 'منتهية', running: 'جارية', notStarted: 'لم تبدأ',
    progress: 'الإنجاز', createdBy: 'سجّلها', closeJob: 'إغلاق السيارة', reopen: 'إعادة فتح', deleteJob: 'حذف السيارة', addTask: 'إضافة مهمة',
    closeConfirm: 'بعض المهام لم تنتهِ بعد. إغلاق السيارة على أي حال؟', deleteConfirm: 'حذف نهائي لهذه السيارة وكل مهامها؟',
    status: 'الحالة', open: 'قيد العمل', closed: 'مغلقة', editTask: 'تعديل المهمة', service: 'الخدمة', part: 'القطعة',
    startTime: 'وقت البدء', endTime: 'وقت الانتهاء', rework: 'إعادة عمل (خطأ وتمت إعادته)', delete: 'حذف', save: 'حفظ', cancel: 'إلغاء',
    edited: 'معدّل', demoMode: 'وضع العرض — بيانات تجريبية للشرح فقط، منفصلة تماماً عن بيانات الورشة', demoReset: 'إعادة البيانات', breakStart: 'بداية الاستراحة (إيقاف تلقائي)', breakEnd: 'رجوع للعمل (تذكير)', breakWarn: 'تنبيه قبل الاستراحة (دقائق)', breakSoon: '⏰ باقي {0} دقائق على الاستراحة — {1} مهمة جارية ستتوقف تلقائياً', breakPaused: '⏸ وقت الاستراحة: تم إيقاف {0} مهمة تلقائياً. استأنفوا الساعة {1}', breakOver: '▶ انتهت الاستراحة — {0} مهمة متوقفة بانتظار الاستئناف', halfPart: 'نصف', follow: 'المتابعة', fuSub: 'تواصل مع العملاء', fuCheck: 'تشييك', fuSvc: 'موعد السيرفيس', fuSvcN: 'سيرفيس', fuIn: 'بعد {0} يوم · {1}', fuLastVisit: 'آخر زيارة', fuNoInfo: 'بدون بيانات العميل', fuCameBack: 'جات السيارة للورشة · {0}', fuWeek: 'نتصل فيهم هذا الأسبوع', fuSoon: 'القادمين', fuNoToday: 'ما فيه أحد اليوم — هذول القادمين في الأيام الجاية', fuNoSoon: 'ما فيه أحد في الأسبوعين الجايين', fuLate: 'متأخر {0} يوم', fuFinished: 'انتهى الشغل', visitsN: 'زارتنا {0} مرات', firstVisit: 'أول زيارة', call: 'اتصال', whatsapp: 'واتساب', noPhone: 'لا يوجد رقم جوال', fuLater: 'بعد أسبوع', fuContacted: 'تم التواصل', fuDoneBy: 'تم التواصل — {0} · {1}', fuIntro: 'اتصل بالعملاء للتشييك أو السيرفيس.', fuNow: 'يحتاجون تواصل الآن', fuNone: 'ما فيه أحد يحتاج تواصل الآن', fuSnoozed: 'مؤجّلة', fuDoneList: 'تم الاتصال مؤخراً', fuResult: 'نتيجة الاتصال', fuAnswered: 'رد', fuNoAns: 'ما رد', fuWhat: 'وش قال العميل؟', fuBooked: 'حجز موعد', fuCallLater: 'يتصل بعدين', fuDeclined: 'اعتذر', fuOther: 'سبب ثاني', fuApptAt: 'وقت الموعد', fuNote: 'ملاحظة', fuNoteP: 'اختياري', fuTries: 'ما رد ×{0}', fuTriedT: 'انسجل: ما رد — جرّب مرة ثانية', fuSavedT: 'انحفظت نتيجة الاتصال', fuAppts: 'المواعيد', fuApptR: 'موعد · {0}', fuLaterR: 'يتصل بعدين — يرجع بعد أسبوع', fuDeclR: 'اعتذر', fuOtherR: 'سبب ثاني', fuPickDate: 'اختر وقت الموعد', fuSnoozedT: 'تأجّلت أسبوع', fuDoneT: 'تم تسجيل التواصل', carHistory: 'سجل السيارة', thisVisit: 'هذه الزيارة', seenBefore: 'هذه السيارة زارتنا {0} مرات من قبل', lastVisit: 'آخر زيارة', fillCar: 'تعبئة البيانات', filled: 'تمت تعبئة بيانات السيارة', fuAlert: '📞 {0} عملاء لازم تتصل فيهم', fuOpen: 'عرض', tapWorkers: 'اضغط على العمال اللي بيشتغلون على السيارة — بدون تحديد قطع', workingNow2: 'يشتغل الآن', firstPart: 'يشتغل على أول قطعة — تُحسب في الترتيب عند الإنهاء', shiftStart: 'بداية الدوام', shiftEnd: 'نهاية الدوام', otResume: 'رجوع الأوفرتايم', otToday: 'أوفرتايم اليوم', otHint: 'اليوم أوفرتايم: الرجوع من الاستراحة الساعة 13:00 بدل 16:00', otOn: 'تم: اليوم أوفرتايم — الرجوع الساعة {0}', otOff: 'تم إلغاء الأوفرتايم لليوم', wDone: 'أنهى شغله', waitingW: 'ينتظر', carMap: 'خريطة السيارة', carMapHint: 'اضغط على أي جزء لترى من يعمل عليه', partDoneAll: 'إنهاء الجزء لكل العمال', partStartAll: 'ابدأ للكل', partPauseAll: 'إيقاف مؤقت للكل', partResumeAll: 'استئناف للكل', partFinishQ: 'إنهاء «{0}» وإيقاف عداد {1} عامل؟', partEmpty: 'هذا الجزء ليس ضمن شغل هذه السيارة', sWait: 'لم يبدأ', sRun: 'جاري', sPause: 'متوقف', sDone: 'منتهي', otherParts: 'أجزاء أخرى', polWhat: 'نوع البوليش', polExt: 'خارجي', polInt: 'داخلي', polBoth: 'داخلي وخارجي', jamSpec: 'نوع الفيلم', newColor: 'اللون الجديد', pinTaken: 'هذا الرمز مستخدم لحساب آخر — اختر رمزاً مختلفاً', team: 'الفريق', progress: 'تطوّر الأداء مع الوقت', weekVs: 'أسبوع بأسبوع', monthVs: 'شهر بشهر', ptsDay: 'نقاط/يوم', change: 'التغيّر', trend6: 'آخر 6 فترات', soFar: 'حتى الآن', prevShort: 'السابق', curShort: 'الحالي', new: 'جديد', teamRate: 'متوسط الفريق', progressHint: 'نقارن معدل الإنتاج اليومي (نقاط صعوبة القطع ÷ أيام العمل) حتى تكون المقارنة عادلة حتى لو الفترة الحالية لم تنتهِ بعد. الخط الأصفر يوضح اتجاه العامل في آخر 6 فترات.', lowRank: 'الأضعف', noWorkP: 'لا عمل في هذه الفترة', manualT: 'وقت يدوي', editedT: 'وقت معدّل', addTime: 'إضافة وقت', timeSec: 'الوقت', timeHint: 'إذا نسيت تسجيل الوقت أو كنت مشغولاً، أدخله هنا تقريبياً.', pauseMin: 'وقت التوقف (دقيقة)', netDur: 'مدة العمل', editLog: 'سجل تعديل الوقت', was: 'كان', none: 'لا شيء', manualNote: '{0} مهام وقتها أُدخل أو عُدّل يدوياً في هذه الفترة', photoErr: 'لم نستطع قراءة الصورة — اختر صورة JPG أو PNG (صور HEIC من الآيفون لا تُقرأ في متصفح الكمبيوتر)', pauseTooLong: 'وقت التوقف أطول من مدة العمل', noStartEnd: 'أدخل وقت البدء أولاً', alreadyRunning: '{0} يعمل الآن على مهمة أخرى — ابدأ على أي حال؟', started: 'بدأ العمل', finished: 'انتهت المهمة',
    noTasksW: 'لا توجد مهام معيّنة لهذا العامل', week: 'أسبوع', month: 'شهر', thisWeek: 'هذا الأسبوع',
    kCars: 'السيارات', kTasks: 'القطع المنجزة', kHours: 'ساعات العمل', kAvgCar: 'متوسط الحماية الكاملة', tapDetails: 'التفاصيل', avgBySvc: 'متوسط وقت كل خدمة', avgHow: 'من بداية أول عامل إلى نهاية آخر عامل — بدون الاستراحة', fastest: 'الأسرع', slowest: 'الأبطأ', kTurn: 'متوسط مدة التسليم', kRework: 'نسبة إعادة العمل',
    ranking: 'ترتيب الإنتاجية', score: 'التقييم', cars: 'سيارات', hours: 'ساعات', eff: 'الكفاءة', util: 'الاستغلال', avgCar: 'متوسط/سيارة',
    daily: 'العمل اليومي (ساعات)', svcMix: 'توزيع الخدمات', partTimes: 'متوسط وقت كل قطعة', avg: 'المتوسط', best: 'الأسرع', count: 'العدد',
    how: 'كيف يُحسب التقييم؟',
    howTxt: '<b>الترتيب</b> يحسب القطع المنتهية فقط. القطعة الجارية تدخل عند الإنهاء. <b>القطعة المشتركة</b> تُحسب كنتيجة فريق واحد: كل عامل عليها ياخذ نفس الحصة من النقاط ونفس متوسط وقت الفريق، فاللي اشتغلوا نفس الشغل مع بعض ياخذون نفس التقييم حتى لو عداد واحد منهم اشتغل أطول. <b>الكفاءة</b> تميل لـ 100% لما تكون القطع قليلة وتتوضح كل ما زاد الشغل، والعلامة الحمراء ما تظهر إلا بعد ما يكون عند كل عامل تقريباً 3 قطع. اللي ما أنهى أي قطعة بعد يظهر بـ «—».<br><br><b>الوقت</b> = وقت العمل الفعلي فقط — فترات الإيقاف المؤقت (نهاية الدوام، الاستراحة) لا تُحسب.<br><b>النقاط (حجم العمل)</b> = كل قطعة لها درجة صعوبة: الصدام الأمامي 3.5، الصدام الخلفي 3.2 (ياخذون وقت طويل وفيهم قطع كثيرة)، الرفرف الخلفي 1.7، السقف 1.6، الكبوت 1.2، الباب 1، المراية 0.6 — وتغيير اللون ×1.5. <b>القطعة المشتركة تنقسم</b>: عاملين على الصدام الأمامي = 1.75 نقطة لكل واحد، يعني ما تنحسب مثل اللي اشتغل لحاله.<br><b>الكفاءة</b> = الوقت المعتاد للفريق لنفس القطع ÷ الوقت الفعلي للعامل. 100% تعني سرعة الفريق المعتادة، وأكثر من 100% أسرع.<br><b>التقييم (0–100)</b> = 55% النقاط + 45% الكفاءة − 4 نقاط لكل إعادة عمل.<br><b>الاستغلال</b> = ساعات العمل الفعلية ÷ ساعات الدوام في الفترة.',
    noData: 'لا توجد بيانات في هذه الفترة', pdf: 'PDF', excel: 'Excel', share: 'مشاركة', whatsapp: 'واتساب', email: 'إيميل',
    preparing: 'جارٍ تجهيز التقرير…', downloaded: 'تم تنزيل الملف', report: 'تقرير الإنتاجية', period: 'الفترة', generated: 'أُنشئ في',
    demoNote: 'هذه بيانات تجريبية للعرض فقط.', clearDemo: 'مسح البيانات التجريبية', loadDemo: 'تحميل بيانات تجريبية للعرض', loadDemoQ: 'إضافة بيانات تجريبية لشهرين (للعرض فقط)؟ تظهر على كل الأجهزة المربوطة، وتقدر تمسحها بزر «مسح البيانات التجريبية» بدون ما تتأثر بياناتك الحقيقية.',
    search: 'ابحث بالسيارة، اللوحة أو العميل…', laborTime: 'وقت العمل', noJobs: 'لا توجد سيارات', carTime: 'مدة السيارة', carTimeH: 'من أول عامل بدأ لآخر عامل خلّص', editCar: 'تعديل معلومات السيارة', carSaved: 'تم حفظ معلومات السيارة',
    users: 'المستخدمون', general: 'عام', data: 'البيانات', films: 'العوازل الحرارية', addUser: 'إضافة مستخدم', addWorker: 'إضافة عامل', addFilm: 'إضافة مادة',
    name: 'الاسم', role: 'الصلاحية', newPin: 'رمز سري جديد (4 أرقام)', pinHint: 'اتركه فارغاً لعدم التغيير', active: 'فعّال', inactive: 'موقوف',
    photo: 'الصورة', uploadPhoto: 'رفع صورة', type: 'النوع', shop: 'اسم المحل', waNum: 'رقم واتساب لاستلام التقارير', emailTo: 'إيميل استلام التقارير',
    shiftHours: 'ساعات الدوام اليومية', autoLock: 'قفل تلقائي بعد (دقائق)', backup: 'تنزيل نسخة احتياطية', restore: 'استرجاع نسخة', resetAll: 'حذف كل البيانات',
    resetConfirm: 'سيتم حذف كل البيانات نهائياً من هذا الجهاز. متأكد؟', restored: 'تمت الاستعادة', pin4: 'الرمز يجب أن يكون 4 أرقام', needAdmin: 'يجب بقاء مالك واحد فعّال على الأقل',
    roleAdminD: 'كل شيء: الإحصائيات، التقارير، الإعدادات', roleManagerD: 'يشاهد الإحصائيات والتقارير فقط', roleSupD: 'يسجّل السيارات ويشغّل الوقت ويصحح الأخطاء — بدون إحصائيات',
    changePinWarn: 'الرموز الافتراضية: المالك 0000 · المشرف 1111 · المدير 2222 — غيّرها من الإعدادات',
    teamAvg: 'متوسط الفريق', mine: 'متوسطه', diff: 'الفرق', taskLog: 'سجل المهام', rank: 'الترتيب', of: 'من',
    noAccess: 'لا تملك صلاحية لهذه الصفحة', today: 'اليوم', min: 'د', saturdayToThursday: 'من السبت إلى الخميس',
    shareText: 'تقرير إنتاجية {0}', sun: 'أحد', topWorkers: 'الأفضل', jobsList: 'السيارات', worked: 'عمل على', none: '—',
    restoreConfirm: 'استبدال كل البيانات الحالية بالنسخة المختارة؟', sharedFallback: 'تم تنزيل الـ PDF — أرفقه في واتساب أو الإيميل',
    noWa: 'أضف رقم الواتساب من الإعدادات أولاً', noEmail: 'أضف الإيميل من الإعدادات أولاً',
  },
  en: {
    app: 'Productivity Tracker', appSub: 'Workshop system', heroA: 'Every panel,', heroB: 'every minute,', heroC: 'accounted for.',
    heroP: 'Log the car, assign panels to the team, and follow time and productivity live.',
    chooseAcc: 'Choose your account', enterPin: 'Enter your PIN', wrongPin: 'Wrong PIN', back: 'Back',
    admin: 'Owner', manager: 'Manager', supervisor: 'Supervisor',
    floor: 'Live floor', new: 'New car', dashboard: 'Performance', history: 'Records', settings: 'Settings', job: 'Car', worker: 'Worker',
    lock: 'Lock', workingNow: 'Working now', openCars: 'Cars in progress', doneToday: 'Panels done today', carsToday: 'Cars today',
    workers: 'Team', idle: 'Available', pending: 'waiting', openJobs: 'Cars in progress', closedToday: 'Closed today',
    noOpen: 'No cars in progress right now', addCar: 'Add a car',
    carInfo: 'Car details', make: 'Make', model: 'Model', year: 'Year', color: 'Color', plate: 'Plate no.', customer: 'Customer name', phone: 'Customer phone', notes: 'Notes',
    date: 'Date', services: 'Services', chooseSvc: 'Pick one or more services', other: 'Other', pause: 'Pause', resume: 'Resume', paused: 'Paused', pausedToast: 'Paused', pauseAll: 'Pause all', resumeAll: 'Resume all', pauseAllQ: 'Pause {0} running tasks (end of shift)?', resumeAllQ: 'Resume {0} paused tasks?', pts: 'pts', nameEn: 'English name', typeColor: 'Type the colour', replWhat: 'Replacing', replTint: 'Tint', replPpf: 'PPF', typeMake: 'Type the make', typeModel: 'Pick or type the model', tintSpec: 'Film and shade per window', applyAll: 'All', shade: 'Shade', with: 'with', workersMany: 'Workers (one or more)', lgInc: 'Selected', lgAs: 'Assigned', lgOff: 'Not included', extraSvc: 'Extra services', allWorkers: 'Show everyone', teamOnly: 'Team only', assignWork: 'Assign the work', film: 'Film / product', noFilm: '— not set —',
    pickWorker: 'Pick a worker, then tap panels — several workers can share one panel', noWorkerSel: 'No worker picked: tapping only adds or removes a panel',
    front: 'Front', parts: 'Panels', assigned: 'assigned', unassigned: 'Unassigned', all: 'Select all', clear: 'Clear', assignRest: 'Assign the rest to',
    saveStart: 'Save car', needCar: 'Enter the make or plate number', needSvc: 'Pick at least one service', needParts: 'No panels selected',
    saved: 'Car saved', tasks: 'tasks', task: 'task', start: 'Start', finish: 'Finish', done: 'Done', running: 'Running', notStarted: 'Not started',
    progress: 'Progress', createdBy: 'Logged by', closeJob: 'Close car', reopen: 'Reopen', deleteJob: 'Delete car', addTask: 'Add task',
    closeConfirm: 'Some tasks are not finished. Close the car anyway?', deleteConfirm: 'Permanently delete this car and all its tasks?',
    status: 'Status', open: 'In progress', closed: 'Closed', editTask: 'Edit task', service: 'Service', part: 'Panel',
    startTime: 'Start time', endTime: 'End time', rework: 'Rework (mistake, redone)', delete: 'Delete', save: 'Save', cancel: 'Cancel',
    edited: 'edited', demoMode: 'Presentation mode — sample data only, completely separate from the workshop data', demoReset: 'Reset data', breakStart: 'Break starts (auto-pause)', breakEnd: 'Back to work (reminder)', breakWarn: 'Warn before break (minutes)', breakSoon: '⏰ {0} minutes to the break — {1} running tasks will pause automatically', breakPaused: '⏸ Break time: {0} tasks paused automatically. Resume at {1}', breakOver: '▶ Break is over — {0} paused tasks waiting to resume', halfPart: 'half', follow: 'Follow-up', fuSub: 'Customer calls', fuCheck: 'Check-up', fuSvc: 'Service due', fuSvcN: 'Service', fuIn: 'in {0} days · {1}', fuLastVisit: 'Last visit', fuNoInfo: 'No customer details', fuCameBack: 'Car came back · {0}', fuWeek: 'Call this week', fuSoon: 'Coming up', fuNoToday: 'Nobody today — these are the next days', fuNoSoon: 'Nobody in the next two weeks', fuLate: '{0} days late', fuFinished: 'Finished', visitsN: '{0} visits', firstVisit: 'first visit', call: 'Call', whatsapp: 'WhatsApp', noPhone: 'No phone number', fuLater: 'In a week', fuContacted: 'Contacted', fuDoneBy: 'Contacted — {0} · {1}', fuIntro: 'Call customers for a check-up or service.', fuNow: 'Need a call now', fuNone: 'Nobody needs a call right now', fuSnoozed: 'Snoozed', fuDoneList: 'Recently called', fuResult: 'Call result', fuAnswered: 'Answered', fuNoAns: 'No answer', fuWhat: 'What did the customer say?', fuBooked: 'Booked a visit', fuCallLater: 'Call back later', fuDeclined: 'Declined', fuOther: 'Other reason', fuApptAt: 'Visit time', fuNote: 'Note', fuNoteP: 'optional', fuTries: 'no answer ×{0}', fuTriedT: 'Saved: no answer — try again', fuSavedT: 'Call result saved', fuAppts: 'Appointments', fuApptR: 'Visit · {0}', fuLaterR: 'Call back later — back in a week', fuDeclR: 'Declined', fuOtherR: 'Other reason', fuPickDate: 'Pick the visit time', fuSnoozedT: 'Snoozed for a week', fuDoneT: 'Marked as contacted', carHistory: 'Car history', thisVisit: 'this visit', seenBefore: 'This car has visited us {0} times before', lastVisit: 'Last visit', fillCar: 'Fill details', filled: 'Car details filled', fuAlert: '📞 {0} customers to call', fuOpen: 'Open', tapWorkers: 'Tap the workers who will work on this car — no panels needed', workingNow2: 'working now', firstPart: 'on the first panel — counts in the ranking once finished', shiftStart: 'Shift starts', shiftEnd: 'Shift ends', otResume: 'Overtime: back at', otToday: 'Overtime today', otHint: 'Overtime today: back from the break at 13:00 instead of 16:00', otOn: 'Overtime today — back at {0}', otOff: 'Overtime cancelled for today', wDone: 'Work done', waitingW: 'Waiting', carMap: 'Car map', carMapHint: 'Tap any part to see who is working on it', partDoneAll: 'Finish part for everyone', partStartAll: 'Start all', partPauseAll: 'Pause all', partResumeAll: 'Resume all', partFinishQ: 'Finish “{0}” and stop the timer of {1} worker(s)?', partEmpty: 'This part is not in this car\'s work', sWait: 'Not started', sRun: 'Running', sPause: 'Paused', sDone: 'Done', otherParts: 'Other parts', polWhat: 'Polish type', polExt: 'Exterior', polInt: 'Interior', polBoth: 'Interior + exterior', jamSpec: 'Film type', newColor: 'New colour', pinTaken: 'This code is used by another account — pick a different one', team: 'Team', progress: 'Progress over time', weekVs: 'Week vs week', monthVs: 'Month vs month', ptsDay: 'Pts/day', change: 'Change', trend6: 'Last 6 periods', soFar: 'so far', prevShort: 'prev', curShort: 'now', new: 'new', teamRate: 'Team average', progressHint: 'We compare the daily production rate (panel difficulty points ÷ working days) so it stays fair even while the current period is still running. The yellow line shows each worker\'s direction over the last 6 periods.', lowRank: 'lowest', noWorkP: 'no work this period', manualT: 'manual time', editedT: 'time edited', addTime: 'Add time', timeSec: 'Time', timeHint: 'Forgot to log it or were busy? Enter an approximate time here.', pauseMin: 'Paused (minutes)', netDur: 'Work time', editLog: 'Time edit history', was: 'was', none: 'none', manualNote: '{0} tasks had their time entered or edited by hand in this period', photoErr: 'Could not read the photo — pick a JPG or PNG (iPhone HEIC photos do not open in desktop browsers)', pauseTooLong: 'Paused time is longer than the work span', noStartEnd: 'Enter the start time first', alreadyRunning: '{0} is already working on another task — start anyway?', started: 'Started', finished: 'Task finished',
    noTasksW: 'No tasks assigned to this worker', week: 'Week', month: 'Month', thisWeek: 'This week',
    kCars: 'Cars', kTasks: 'Panels done', kHours: 'Labor hours', kAvgCar: 'Avg full PPF time', tapDetails: 'Details', avgBySvc: 'Average time per service', avgHow: 'From the first worker\'s start to the last worker\'s end — breaks excluded', fastest: 'fastest', slowest: 'slowest', kTurn: 'Avg turnaround', kRework: 'Rework rate',
    ranking: 'Productivity ranking', score: 'Score', cars: 'Cars', hours: 'Hours', eff: 'Efficiency', util: 'Utilization', avgCar: 'Avg/car',
    daily: 'Daily work (hours)', svcMix: 'Service mix', partTimes: 'Average time per panel', avg: 'Average', best: 'Fastest', count: 'Count',
    how: 'How is the score calculated?',
    howTxt: '<b>Ranking</b> counts finished panels only. A running panel counts once it is finished. A <b>shared panel</b> is one team result: every worker on it gets the same share of points and the team\'s average time, so workers who did the same work together get the same score even if one timer ran longer. <b>Efficiency</b> leans toward 100% while there are only a few panels and sharpens as work adds up; red marks appear only once each worker has about 3 panels. Workers with nothing finished yet show «—».<br><br><b>Time</b> = actual working time only — paused periods (end of shift, breaks) are not counted.<br><b>Points (workload)</b> = each panel has a difficulty: front bumper 3.5, rear bumper 3.2 (long, many pieces), rear quarter 1.7, roof 1.6, hood 1.2, door 1, mirror 0.6 — colour change ×1.5. <b>Shared panels are split</b>: two workers on the front bumper = 1.75 points each, so it never counts like working alone.<br><b>Efficiency</b> = the team’s usual time for the same panels ÷ the worker’s actual time. 100% = team pace, above 100% = faster.<br><b>Score (0–100)</b> = 55% points + 45% efficiency − 4 points per rework.<br><b>Utilization</b> = actual working hours ÷ shift hours in the period.',
    noData: 'No data for this period', pdf: 'PDF', excel: 'Excel', share: 'Share', whatsapp: 'WhatsApp', email: 'Email',
    preparing: 'Preparing the report…', downloaded: 'File downloaded', report: 'Productivity report', period: 'Period', generated: 'Generated',
    demoNote: 'This is demo data for preview only.', clearDemo: 'Clear demo data', loadDemo: 'Load demo data for a presentation', loadDemoQ: 'Add two months of demo data (for presenting only)? It shows on all linked devices; remove it any time with “Clear demo data” — your real data is not touched.',
    search: 'Search by car, plate or customer…', laborTime: 'Labor time', noJobs: 'No cars', carTime: 'Car time', carTimeH: 'from the first worker\'s start to the last worker\'s finish', editCar: 'Edit car details', carSaved: 'Car details saved',
    users: 'Users', general: 'General', data: 'Data', films: 'Window films', addUser: 'Add user', addWorker: 'Add worker', addFilm: 'Add product',
    name: 'Name', role: 'Role', newPin: 'New PIN (4 digits)', pinHint: 'Leave empty to keep it', active: 'Active', inactive: 'Disabled',
    photo: 'Photo', uploadPhoto: 'Upload photo', type: 'Type', shop: 'Shop name', waNum: 'WhatsApp number for reports', emailTo: 'Email for reports',
    shiftHours: 'Shift hours per day', autoLock: 'Auto-lock after (minutes)', backup: 'Download backup', restore: 'Restore backup', resetAll: 'Delete all data',
    resetConfirm: 'All data on this device will be permanently deleted. Are you sure?', restored: 'Backup restored', pin4: 'PIN must be 4 digits', needAdmin: 'At least one active owner is required',
    roleAdminD: 'Everything: stats, reports, settings', roleManagerD: 'Views stats and reports only', roleSupD: 'Logs cars, runs timers, fixes mistakes — no stats',
    changePinWarn: 'Default PINs: Owner 0000 · Supervisor 1111 · Manager 2222 — change them in Settings',
    teamAvg: 'Team avg', mine: 'Their avg', diff: 'Diff', taskLog: 'Task log', rank: 'Rank', of: 'of',
    noAccess: 'You do not have access to this page', today: 'Today', min: 'm', saturdayToThursday: 'Saturday to Thursday',
    shareText: '{0} productivity report', sun: 'Sun', topWorkers: 'Top', jobsList: 'Cars', worked: 'Worked on', none: '—',
    restoreConfirm: 'Replace all current data with the selected backup?', sharedFallback: 'PDF downloaded — attach it in WhatsApp or email',
    noWa: 'Add the WhatsApp number in Settings first', noEmail: 'Add the email in Settings first',
  }
};
let LANG = localStorage.getItem(LANG_KEY) || 'ar';
const L = () => LANG;
function t(k, ...a) { let s = T[LANG][k] ?? T.en[k] ?? k; a.forEach((v, i) => s = s.replace('{' + i + '}', v)); return s; }
const nm = o => o ? (o[LANG] || o.en || o.name || '') : '';
const loc = () => LANG === 'ar' ? 'ar-QA-u-nu-latn' : 'en-GB';
const fDate = ts => new Date(ts).toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short' });
const fDateL = ts => new Date(ts).toLocaleDateString(loc(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fDay = ts => new Date(ts).toLocaleDateString(loc(), { weekday: 'short' });
const fTime = ts => new Date(ts).toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit' });
const fDT = ts => ts ? fDate(ts) + ' · ' + fTime(ts) : '—';
let fDur = function (ms) { const m = Math.round((ms || 0) / 60000), h = Math.floor(m / 60), mm = m % 60; return LANG === 'ar' ? (h ? `${h}س ${mm}د` : `${mm}د`) : (h ? `${h}h ${mm}m` : `${mm}m`); }
function fClock(ms) { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; }
const fHrs = ms => (ms / 3600000).toFixed(1);
const toLocalInput = ts => { if (!ts) return ''; const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

/* ---------------- data layer ---------------- */
let S;
const db = {
  load() {
    try { S = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { S = null; }
    if (!S || !S.users) { S = seed(); db.save(); }
    let mig = false; const UEN = { 'المشرف': 'Supervisor', 'المدير': 'Manager', 'المالك': 'Owner' }; S.users.forEach(u => { if (u.nameEn === undefined) { u.nameEn = UEN[u.name] || ''; mig = true; } }); S.workers.forEach(w => { if (w.nameEn === undefined && EN_NAMES[w.name]) { w.nameEn = EN_NAMES[w.name]; mig = true; } }); S.tasks.forEach(x => { if (!x.workerIds) { x.workerIds = x.workerId ? [x.workerId] : []; delete x.workerId; mig = true; } }); S.mig = S.mig || {};
    if (!S.mig.order1) { const O = ['ايدغارد', 'مايكل', 'جيرسون', 'ابران', 'ليندون', 'بلال', 'حسين', 'رضوان', 'بركاش', 'صيام', 'جويل', 'رونالدو', 'بيمبا', 'اجمط', 'عدنان', 'نيما'], rank = w => { const i = O.indexOf(w.name); return teamOf(w) !== 'ppf' ? 1000 : i < 0 ? 500 : i; };
      S.workers = S.workers.map((w, i) => [w, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(a => a[0]); S.mig.order1 = true; mig = true; }
    if (!S.settings.breakStart) { Object.assign(S.settings, { breakStart: '12:00', breakEnd: '16:00', breakWarn: 5 }); mig = true; }
    if (!S.settings.shiftEnd) { Object.assign(S.settings, { shiftStart: '09:00', shiftEnd: '21:00', otResume: '13:00' }); mig = true; }
    if (!S.mig.split1) { const out = []; S.tasks.forEach(x => { const ws = wids(x); if (ws.length <= 1) return out.push(x); const grp = x.id; ws.forEach((w, i) => out.push(i ? { ...x, id: x.id + '_' + i, workerIds: [w], grp, share: ws.length } : Object.assign(x, { workerIds: [w], grp, share: ws.length }))); }); S.tasks = out; S.mig.split1 = true; mig = true; }
    if (!S.mig.omar) { const sup = S.users.find(u => u.id === 'u_sup'); if (sup && sup.name === 'المشرف') Object.assign(sup, { name: 'عبد السلام', nameEn: 'Abdulsalam', title: 'المشرف', titleEn: 'Supervisor' });
      if (!S.users.some(u => u.name === 'عمر')) { const taken = S.users.some(u => u.pin === H('1234')); S.users.push({ id: 'u_omar', name: 'عمر', nameEn: 'Omar', title: 'المشرف', titleEn: 'Supervisor', role: 'supervisor', pin: H(taken ? '4321' : '1234'), active: true }); }
      S.mig.omar = true; mig = true; }
    if (!S.mig.wael) { if (!S.users.some(u => u.name === 'وائل')) S.users.push({ id: 'u_wael', name: 'وائل', nameEn: 'Wael', title: 'المدير التجاري', titleEn: 'Commercial manager', role: 'manager', pin: H('3333'), active: true }); S.mig.wael = true; mig = true; }
    S.workers.forEach(w => { if (!w.photo) { const r = ROSTER.find(r => r.name === w.name); if (r && r.photo) { w.photo = r.photo; mig = true; } } }); if (mig) db.save();
    if ((S.rosterV || 1) < ROSTER_V) { // replace the old demo team with the real one, keep anything the owner added
      const added = S.workers.filter(w => !w.demo && !/^w\d+$/.test(w.id)); S.workers = [...roster(), ...added]; S.rosterV = ROSTER_V; db.save();
    }
  },
  save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { toast('⚠ ' + e.message); } if (window.cloud) cloud.queue(); },
};
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function seed() {
  const s = {
    v: 1, demo: true,
    users: [
      { id: 'u_admin', name: 'Karam', role: 'admin', pin: H('0000'), active: true },
      { id: 'u_sup', name: 'عبد السلام', nameEn: 'Abdulsalam', title: 'المشرف', titleEn: 'Supervisor', role: 'supervisor', pin: H('1111'), active: true },
      { id: 'u_omar', name: 'عمر', nameEn: 'Omar', title: 'المشرف', titleEn: 'Supervisor', role: 'supervisor', pin: H('1234'), active: true },
      { id: 'u_mgr', name: 'المدير', nameEn: 'Manager', role: 'manager', pin: H('2222'), active: true },
    ],
    workers: roster(), rosterV: ROSTER_V,
    films: [
      ['XPEL Ultimate Plus', 'ppf'], ['3M Scotchgard Pro', 'ppf'], ['STEK DYNOshield', 'ppf'],
      ['3M Crystalline 70%', 'tint'], ['3M Ceramic IR 30%', 'tint'], ['LLumar IRX 20%', 'tint'],
      ['Avery SW900', 'wrap'], ['3M 2080', 'wrap'], ['Gtechniq Crystal Serum', 'cer'],
    ].map(([name, type], i) => ({ id: 'f' + (i + 1), name, type, active: true })),
    jobs: [], tasks: [],
    settings: { shop: 'Insulator', wa: '', email: '', shiftHours: 9, autoLock: 10, breakStart: '12:00', breakEnd: '16:00', breakWarn: 5, shiftStart: '09:00', shiftEnd: '21:00', otResume: '13:00' },
  };
  makeDemo(s);
  return s;
}
/* Real team. Photos live in workers/NN.jpg. Names for 1–14 are placeholders until the owner sends them. */
const ROSTER_V = 4;
const ROSTER = [
  // PPF & tint team (shown first, in the owner's order)
  ['مايكل', '15'], ['ايدغارد', '16'], ['جيرسون', '18'], ['رونالدو', '19'], ['بركاش', '13'], ['جويل', '17'], ['ابران', '09'], ['بيمبا', '11'],
  ['عدنان', '01'], ['بلال', '02'], ['صيام', '04'], ['نيما', '05'], ['اجمط', '06'], ['رضوان', '08'], ['ليندون', '10'], ['حسين', '23'],
].map(([name, p]) => ({ name, photo: p && 'workers/' + p + '.jpg', team: 'ppf' })).concat([
  // Polish team
  ['رام', '22'], ['كيم', '20'], ['بابول', '21'], ['عبد القادر', '07'], ['جنيط', '03'],
].map(([name, p]) => ({ name, photo: p && 'workers/' + p + '.jpg', team: 'polish' })));
const EN_NAMES = { 'مايكل': 'Michael', 'ايدغارد': 'Edgard', 'جيرسون': 'Gerson', 'رونالدو': 'Ronaldo', 'بركاش': 'Prakash', 'جويل': 'Joel', 'ابران': 'Ibran', 'بيمبا': 'Pemba', 'عدنان': 'Adnan', 'بلال': 'Bilal', 'صيام': 'Siam', 'نيما': 'Nima', 'اجمط': 'Azmat', 'رضوان': 'Rizwan', 'ليندون': 'Lyndon', 'حسين': 'Hussain', 'رام': 'Ram', 'كيم': 'Kim', 'بابول': 'Babul', 'عبد القادر': 'Abdul Kadir', 'جنيط': 'Janit' };
const roster = () => ROSTER.map((r, i) => ({ id: 'w' + (i + 1), name: r.name, nameEn: EN_NAMES[r.name] || '', photo: r.photo, team: r.team, color: PALETTE[i % PALETTE.length], active: true }));
const TEAMS = { ppf: { ar: 'فريق الحماية والعازل', en: 'PPF & tint team' }, polish: { ar: 'فريق البوليش', en: 'Polish team' } };
const teamOf = w => w.team || 'ppf';
const byTeam = list => Object.keys(TEAMS).map(k => [k, list.filter(w => teamOf(w) === k)]).filter(([, l]) => l.length);
function makeDemo(s) {
  // ~2 months of realistic workshop data for presenting: both teams, shared panels with own timers, trends over time
  const rnd = mulberry(Date.now() % 100000), pick = a => a[Math.floor(rnd() * a.length)];
  const cars = [['Toyota', 'Land Cruiser GXR'], ['Toyota', 'Land Cruiser VXR'], ['Lexus', 'LX 600'], ['Nissan', 'Patrol LE Platinum'], ['Denza', 'B8'], ['Leopard', 'Leopard 8'], ['Jetour', 'T2'], ['Haval', 'H9'], ['Tank', '500'], ['Land Rover', 'Range Rover'], ['Mercedes-Benz', 'G 63 AMG'], ['GMC', 'Yukon Denali'], ['Lexus', 'GX 550'], ['Toyota', 'Prado'], ['Porsche', 'Cayenne']];
  const colors = ['أبيض', 'أسود', 'رمادي', 'فضي', 'أزرق', 'أحمر', 'بيج'], names = ['محمد', 'عبدالله', 'خالد', 'حمد', 'فهد', 'جاسم', 'علي', 'سعود', 'ناصر', 'راشد'];
  const combos = [['full_ppf', 'tint'], ['full_ppf'], ['full_ppf', 'windshield', 'tint'], ['half_ppf', 'tint'], ['half_ppf'], ['quarter_ppf'], ['quarter_ppf', 'tint'], ['tint'], ['tint', 'windshield'], ['color_change'], ['color_change', 'tint'], ['polish'], ['polish', 'ceramic'], ['half_ppf', 'polish'], ['ceramic'], ['tint', 'polish']];
  const base = { fbumper: 95, rbumper: 85, hood: 75, roof: 70, quarter_l: 62, quarter_r: 62, trunk: 48, fender_l: 42, fender_r: 42, door_fl: 46, door_fr: 46, door_rl: 42, door_rr: 42, mirror_l: 18, mirror_r: 18, windshield: 40, rear_glass: 30, win_fl: 12, win_fr: 12, win_rl: 12, win_rr: 12, sunroof: 18, whole: 150 };
  const ppf = s.workers.filter(w => teamOf(w) === 'ppf' && w.active).map(w => w.id), pol = s.workers.filter(w => teamOf(w) === 'polish' && w.active).map(w => w.id);
  let polN = 0; const speed = {}, trend = {}; [...ppf, ...pol].forEach(id => { speed[id] = .8 + rnd() * .5; trend[id] = (rnd() - .45) * .35; }); // trend: getting faster (−) or slower (+) over the period
  const filmFor = g => (s.films.find(f => f.type === g && f.active) || {}).id || '';
  const now = Date.now(), today = startOfDay(now), DAYS = 62, dayKey = new Date().toDateString();
  for (let d = DAYS; d >= 0; d--) {
    const day = addDays(today, -d); if (new Date(day).getDay() === 5) continue; // Friday off
    const isToday = d === 0, clock = {}, age = d / DAYS;
    const dayStart = isToday ? now - 2.6 * 3600000 : day + 8 * 3600000;
    const n = isToday ? 3 : 3 + Math.floor(rnd() * 3);
    for (let c = 0; c < n; c++) {
      const [make, model] = pick(cars), created = dayStart + c * 55 * 60000, services = [...pick(combos)];
      if (!services.some(k => ['polish', 'ceramic'].includes(k)) && rnd() < .4) services.push('polish');
      const job = { id: 'demo' + d + '_' + c + uid().slice(-3), createdAt: created, createdBy: rnd() < .5 ? 'u_sup' : 'u_omar', status: 'open', closedAt: null, services, films: {}, demo: true,
        car: { make, model, year: pick(['2023', '2024', '2025', '2026']), color: pick(colors), plate: String(100000 + Math.floor(rnd() * 899999)), customer: pick(names), phone: '', notes: '' } };
      if (services.includes('color_change')) job.car.newColor = pick(colors.filter(x => x !== job.car.color));
      const crewP = [...ppf].sort(() => rnd() - .5).slice(0, 2 + Math.floor(rnd() * 3)), crewL = [pol[polN++ % pol.length], pol[(polN + 2) % pol.length]];
      let i = 0, last = 0, allDone = true;
      const add = (k, p, ws, extra = {}) => {
        const grp = ws.length > 1 ? job.id + k + p : null;
        ws.forEach((w, wi) => {
          const st = Math.max(clock[w] || dayStart + 10 * 60000, created + 8 * 60000) + wi * rnd() * 6 * 60000;
          const mult = (SVC[k].g === 'wrap' ? 1.45 : 1) * (isHalfPart(k, p) ? .55 : 1) * (k === 'polish' ? ({ int: .8, both: 1.6 }[extra.kind] || 1) : k === 'ceramic' ? 1.4 : 1);
          const du = base[p] * mult * speed[w] * (1 + trend[w] * age) * (.85 + rnd() * .35) * 60000 / ws.length * (ws.length > 1 ? 1.15 : 1);
          clock[w] = st + du + 5 * 60000;
          const task = { id: (grp || job.id + k + p) + '_' + wi, jobId: job.id, service: k, part: p, workerIds: [w], filmId: k === 'windshield' ? filmFor('ppf') : '', shade: '', start: st, end: st + du, rework: rnd() < .025, demo: true, ...extra, ...(grp ? { grp, share: ws.length } : {}) };
          if (isToday) task.autoBreak = dayKey;
          if (st > now) { task.start = null; task.end = null; allDone = false; }
          else if (st + du > now) { task.end = null; allDone = false; }
          last = Math.max(last, task.end || 0); s.tasks.push(task);
        });
      };
      services.forEach(k => {
        if (['pol', 'cer', 'cln'].includes(SVC[k].g)) return add(k, 'whole', rnd() < .3 && crewL.length > 1 ? crewL : [crewL[0]], k === 'polish' ? { kind: pick(['ext', 'ext', 'int', 'both']) } : {});
        SVC[k].parts.forEach(p => { const w = crewP[i++ % crewP.length]; const pair = ['fbumper', 'rbumper', 'roof', 'hood'].includes(p) && crewP.length > 1 && rnd() < .55; add(k, p, pair ? [w, crewP.find(x => x !== w)] : [w]); });
      });
      if (allDone) { job.status = 'closed'; job.closedAt = last + 25 * 60000; if (job.closedAt < Date.now() - 5 * DAY) job.fu = { check: { at: job.closedAt + 3 * DAY + 3600000, by: rnd() < .5 ? 'u_sup' : 'u_omar' } }; } // older cars were already called
      if (rnd() < .12 && s.jobs.length > 8) { const o = pick(s.jobs.filter(x => x.car.plate)); Object.assign(job.car, { make: o.car.make, model: o.car.model, year: o.car.year, color: o.car.color, plate: o.car.plate, customer: o.car.customer }); } // some cars come back
      s.jobs.push(job);
    }
  }
  s.demo = true;
}

/* ---------------- lookups ---------------- */
const userById = id => S.users.find(u => u.id === id);
const workerById = id => S.workers.find(w => w.id === id);
const filmById = id => S.films.find(f => f.id === id);
const jobById = id => S.jobs.find(j => j.id === id);
const tasksOf = jobId => S.tasks.filter(t => t.jobId === jobId);
const wColor = w => w ? (w.color || PALETTE[S.workers.indexOf(w) % PALETTE.length]) : '#5d6a8c';
// How hard each panel is (a door = 1). Used for workload points; a shared panel's points are split between its workers.
const DIFFICULTY = { fbumper: 3.5, rbumper: 3.2, quarter_l: 1.7, quarter_r: 1.7, roof: 1.6, hood: 1.2, trunk: 1.1, fender_l: 1.1, fender_r: 1.1, door_fl: 1, door_fr: 1, door_rl: 1, door_rr: 1, mirror_l: .6, mirror_r: .6,
  windshield: 1.6, rear_glass: 1, win_fl: .5, win_fr: .5, win_rl: .5, win_rr: .5, sunroof: .6, whole: 4 };
// in a quarter PPF only half the hood and half of each front fender are covered (the bumper is full)
const QUARTER_HALF = ['hood', 'fender_l', 'fender_r'];
const isHalfPart = (svc, part) => svc === 'quarter_ppf' && QUARTER_HALF.includes(part);
const pName = (part, svc) => nm(PARTS[part]) + (isHalfPart(svc, part) ? ' (' + t('halfPart') + ')' : '');
const ptsOf = x => (DIFFICULTY[x.part] || 1) * (SVC[x.service].g === 'wrap' ? 1.5 : 1) * (isHalfPart(x.service, x.part) ? .5 : 1) * (SVC[x.service].g === 'pol' ? ({ int: .8, both: 1.6 }[x.kind] || 1) : 1) * (SVC[x.service].g === 'chk' ? .3 : 1) * (['cln', 'srv'].includes(SVC[x.service].g) ? .5 : 1); // cleaning = half a polish
const fN = v => Number.isInteger(v) ? String(v) : v.toFixed(1);
const un = u => u ? (LANG === 'en' && u.nameEn ? u.nameEn : u.name) : '';
const wn = w => w ? (LANG === 'en' && w.nameEn ? w.nameEn : w.name) : '';
const initials = n => (n || '?').trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase();
function avatar(w, cls = '') {
  if (!w) return `<span class="av ${cls}" style="--c:#5d6a8c">?</span>`;
  return w.photo ? `<span class="av ph ${cls}" style="--c:${wColor(w)};background-image:url(${w.photo})"></span>` : `<span class="av ${cls}" style="--c:${wColor(w)}">${esc(initials(wn(w)))}</span>`;
}
const carTitle = j => [j.car.make, j.car.model, j.car.year].filter(Boolean).join(' ') || j.car.plate || '—';
const wids = x => x.workerIds || (x.workerId ? [x.workerId] : []);
const dur = x => x.start ? Math.max(0, (x.end || x.pausedAt || Date.now()) - x.start - (x.paused || 0)) : 0; // active work time, pauses excluded
const shareOf = x => Math.max(1, x.share || 0, wids(x).length); // workers splitting this panel
const mates = x => x.grp ? S.tasks.filter(t => t.grp === x.grp) : [x]; // all workers' tasks on the same shared panel
const lab = x => dur(x) * shareOf(x); // man-time estimate for the whole panel
const carSpan = id => { const ts = tasksOf(id).filter(x => x.start); if (!ts.length) return 0; const a = Math.min(...ts.map(x => x.start)), b = ts.every(x => x.end) ? Math.max(...ts.map(x => x.end)) : Date.now(); return Math.max(0, b - a); }; // owner: the car's time is from the first worker's start to the last worker's finish
const runningOf = wId => S.tasks.find(t => wids(t).includes(wId) && t.start && !t.end && !t.pausedAt);
const pausedOf = wId => S.tasks.find(t => wids(t).includes(wId) && t.start && !t.end && t.pausedAt && jobById(t.jobId)?.status === 'open');
const since = x => x.start + (x.paused || 0); // for the live clock
const svcGroupKey = t => { const g = SVC[t.service].g; return (g === 'rep' ? 'rep_' + (t.kind || 'ppf') : g === 'pol' ? 'pol_' + (t.kind || 'ext') : isHalfPart(t.service, t.part) ? 'ppfq' : g) + ':' + t.part; };

/* ---------------- session & roles ---------------- */
let session = null; try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { }
const me = () => session && userById(session.uid) && userById(session.uid).active ? userById(session.uid) : null;
const NAV = [
  { k: 'floor', icon: 'floor', roles: ['admin', 'manager', 'supervisor'] },
  { k: 'new', icon: 'plus', roles: ['admin', 'supervisor'] },
  { k: 'dashboard', icon: 'chart', roles: ['admin', 'manager'] },
  { k: 'history', icon: 'history', roles: ['admin', 'manager'] },
  { k: 'follow', icon: 'phone', roles: ['admin', 'manager', 'supervisor'] },
  { k: 'settings', icon: 'settings', roles: ['admin'] },
];
const ACCESS = { floor: ['admin', 'manager', 'supervisor'], new: ['admin', 'supervisor'], job: ['admin', 'manager', 'supervisor'], dashboard: ['admin', 'manager'], worker: ['admin', 'manager'], history: ['admin', 'manager'], follow: ['admin', 'manager', 'supervisor'], settings: ['admin'] };
const canEdit = () => ['admin', 'supervisor'].includes(me()?.role);
const roleName = u => u.title ? (LANG === 'ar' ? u.title : (u.titleEn || u.title)) : t(u.role);
const isAdmin = () => me()?.role === 'admin';
function supCanSeeJob(j) { return j.status === 'open' || (j.closedAt && j.closedAt >= startOfDay(Date.now())) || startOfDay(j.createdAt) === startOfDay(Date.now()); }

/* ---------------- icons ---------------- */
const IC = {
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  floor: '<path d="M3 12h4l3 8 4-16 3 8h4"/>', plus: '<path d="M12 5v14M5 12h14"/>', chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', play: '<path d="M8 5l11 7-11 7z" fill="currentColor"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>', edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  back: '<path d="M15 6l-6 6 6 6"/>', next: '<path d="M9 6l6 6-6 6"/>', file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>', share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
  wa: '<path d="M20.5 12a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.2-4.3A8.5 8.5 0 1 1 20.5 12z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>', trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  check: '<path d="M5 12l5 5L20 7"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  car: '<path d="M5 17h14M6.5 17l1.3-5.2A2 2 0 0 1 9.7 10h4.6a2 2 0 0 1 1.9 1.8L17.5 17"/><rect x="3" y="17" width="18" height="3" rx="1.5"/><path d="M8 13h8"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  clean: '<path d="M14 3l-4 9"/><path d="M6 12h10l2 9H4l2-9z"/><path d="M9 16v5M13 16v5"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>', palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  half: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 3v18" /><path d="M12 6l6 2.2V12c0 3.6-2.4 6-6 6.8z" fill="currentColor" stroke="none"/>',
  quarter: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 3v9h8" /><path d="M12 5.2l6 2.2V11h-6z" fill="currentColor" stroke="none"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>', download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  glass: '<path d="M4 8c5-3 11-3 16 0l-2 9c-4-1.5-8-1.5-12 0z"/><path d="M8 12l2-2M11 13l3-3"/>',
  swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  pause: '<rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
};
const SVC_IC = { full_ppf: 'shield', half_ppf: 'half', quarter_ppf: 'quarter', color_change: 'palette', tint: 'sun', ceramic: 'drop', polish: 'spark', clean: 'clean', service: 'clock', checkup: 'check', windshield: 'glass', windshield_off: 'glass', replace: 'swap' };
const ic = (n, cls = '') => `<svg class="i ${cls}" viewBox="0 0 24 24">${IC[n] || ''}</svg>`;

/* ---------------- car diagram (top view, front at top) ---------------- */
const SHAPES = [
  ['fbumper', 'M58 44 Q130 14 202 44 L208 66 L52 66 Z'], ['hood', 'M60 70 H200 L194 162 H66 Z'],
  ['fender_l', 'M36 76 Q42 69 56 70 L62 162 L36 166 Z'], ['fender_r', 'M36 76 Q42 69 56 70 L62 162 L36 166 Z', 1],
  ['mirror_l', 'M12 190 a14 8 0 1 0 28 0 a14 8 0 1 0 -28 0'], ['mirror_r', 'M12 190 a14 8 0 1 0 28 0 a14 8 0 1 0 -28 0', 1],
  ['door_fl', 'M36 172 H62 V282 H36 Z'], ['door_fr', 'M36 172 H62 V282 H36 Z', 1],
  ['door_rl', 'M36 286 H62 V390 H36 Z'], ['door_rr', 'M36 286 H62 V390 H36 Z', 1],
  ['quarter_l', 'M36 394 H62 V462 H52 Q39 450 36 430 Z'], ['quarter_r', 'M36 394 H62 V462 H52 Q39 450 36 430 Z', 1],
  ['roof', 'M94 212 H166 Q176 212 176 222 V352 Q176 362 166 362 H94 Q84 362 84 352 V222 Q84 212 94 212 Z'],
  ['trunk', 'M66 408 H194 L200 462 H60 Z'], ['rbumper', 'M52 466 H208 L202 488 Q130 512 58 488 Z'],
  ['windshield', 'M68 168 H192 L180 208 H80 Z'], ['rear_glass', 'M80 366 H180 L192 404 H68 Z'],
  ['win_fl', 'M66 214 H80 V282 H66 Z'], ['win_fr', 'M66 214 H80 V282 H66 Z', 1],
  ['win_rl', 'M66 286 H80 V360 H66 Z'], ['win_rr', 'M66 286 H80 V360 H66 Z', 1],
  ['sunroof', 'M114 236 H146 Q152 236 152 242 V284 Q152 290 146 290 H114 Q108 290 108 284 V242 Q108 236 114 236 Z'],
];
const CENTER = { fbumper: [130, 52], hood: [130, 116], fender_l: [49, 118], fender_r: [211, 118], mirror_l: [26, 190], mirror_r: [234, 190], door_fl: [49, 227], door_fr: [211, 227], door_rl: [49, 338], door_rr: [211, 338], quarter_l: [49, 426], quarter_r: [211, 426], roof: [130, 320], trunk: [130, 435], rbumper: [130, 482], windshield: [130, 188], rear_glass: [130, 385], win_fl: [73, 248], win_fr: [187, 248], win_rl: [73, 323], win_rr: [187, 323], sunroof: [130, 263] };
function carSVG(svc, map, kind) {
  const pool = poolOf(svc, kind), glassMode = isTintLike(svc, kind);
  const order = glassMode ? SHAPES.filter(s => !GLASS.includes(s[0])).concat(SHAPES.filter(s => GLASS.includes(s[0]))) : SHAPES;
  let out = `<svg class="car" viewBox="0 0 260 520" aria-label="car">
    <path d="M56 36 Q130 2 204 36 L228 90 V460 Q130 532 32 460 V90 Z" fill="rgba(160,180,230,.05)" stroke="rgba(160,180,230,.16)"/>
    <g fill="#02071a">${[[24, 92], [24, 398], [226, 92], [226, 398]].map(([x, y]) => `<rect x="${x - 6}" y="${y}" width="12" height="54" rx="5"/>`).join('')}</g>`;
  const labels = [];
  for (const [p, d, flip] of order) {
    const inPool = pool.includes(p), has = map && p in map, ws = has ? map[p].map(workerById).filter(Boolean) : [], w = ws[0];
    let fill = glassMode && GLASS.includes(p) ? 'rgba(95,180,255,.10)' : 'rgba(170,190,240,.08)', cls = 'pt';
    if (!inPool) { cls += ' off'; }
    else if (w) { fill = wColor(w); cls += ' as'; labels.push([p, ws.length > 1 ? initials(wn(w))[0] + '+' + (ws.length - 1) : initials(wn(w))]); }
    else if (has) { fill = 'rgba(255,255,255,.18)'; cls += ' inc'; }
    out += `<path class="${cls}" data-act="part" data-part="${p}" d="${d}" fill="${fill}" ${flip ? 'transform="matrix(-1 0 0 1 260 0)"' : ''}><title>${esc(nm(PARTS[p]))}</title></path>`;
  }
  labels.forEach(([p, txt]) => { const c = CENTER[p]; if (c && !['mirror_l', 'mirror_r', 'win_fl', 'win_fr', 'win_rl', 'win_rr'].includes(p)) out += `<text x="${c[0]}" y="${c[1]}">${esc(txt)}</text>`; });
  return out + '</svg>';
}

/* ---------------- UI utils ---------------- */
const root = () => $('#root');
let toastT;
function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600); }
function openSheet(html) { $('#sheet-root').innerHTML = `<div class="sheet-bg" data-act="sheet-bg"><div class="sheet" role="dialog">${html}</div></div>`; }
function closeSheet() { $('#sheet-root').innerHTML = ''; }
function confirmBox(msg) { return window.confirm(msg); }
function route() { const p = (location.hash.replace(/^#\/?/, '') || '').split('/'); return { name: p[0] || '', id: p[1] ? decodeURIComponent(p[1]) : null }; }
const go = h => { if (location.hash === h) render(); else location.hash = h; };
const homeOf = () => 'floor';

/* =========================================================================
   RENDER
   ========================================================================= */
function render() {
  document.documentElement.lang = LANG; document.documentElement.dir = LANG === 'ar' ? 'rtl' : 'ltr';
  document.title = 'Insulator · ' + t('app');
  if (window.cloud && !cloud.linked) return cloud.renderLink(); // shared database: link the device once first
  const u = me();
  if (!u) return renderLogin();
  let r = route();
  if (!ACCESS[r.name]) { location.replace('#/' + homeOf()); r = { name: homeOf() }; }
  if (!ACCESS[r.name].includes(u.role)) { location.replace('#/' + homeOf()); r = { name: homeOf() }; }
  const views = { floor: viewFloor, new: viewNew, job: viewJob, dashboard: viewDashboard, worker: viewWorker, history: viewHistory, follow: viewFollow, settings: viewSettings };
  const v = views[r.name](r);
  const key = location.hash, same = key === lastRoute, y = window.scrollY;
  root().innerHTML = shell(r, v);
  if (r.name === 'new') { renderAssign(); plateHint(); }
  tick();
  lastRoute = key;
  window.scrollTo({ top: same ? y : 0 }); // stay in place when only the data changed (pause, sync…)
}
let lastRoute = null;
function shell(r, v) {
  const u = me(), items = NAV.filter(n => n.roles.includes(u.role)), active = r.name === 'job' ? 'floor' : r.name === 'worker' ? 'dashboard' : r.name;
  const fuN = fuDue().length;
  const navLinks = cls => items.map(n => `<a class="${cls} ${active === n.k ? 'on' : ''}" href="#/${n.k}">${ic(n.icon)}<span>${t(n.k)}</span>${n.k === 'follow' && fuN ? `<i class="nav-badge num">${fuN}</i>` : ''}</a>`).join('');
  return `<div class="app">
    <aside class="side">
      <div class="brand"><img src="logo.png" alt="Insulator"><div><b>${t('app')}</b><small>${t('appSub')}</small></div></div>
      ${navLinks('nav-i')}
      <div class="spacer"></div>
      <div class="me"><span class="av sm" style="--c:#FBBF15">${esc(initials(un(u)))}</span><div class="who"><b>${esc(un(u))}</b><small>${esc(roleName(u))}</small></div>
        <button class="btn sm icon ghost" data-act="lang" title="Language">${LANG === 'ar' ? 'EN' : 'ع'}</button>
        <button class="btn sm icon ghost" data-act="logout" title="${t('lock')}">${ic('lock')}</button></div>
    </aside>
    <main>
      <header class="top">
        ${v.back ? `<a class="btn icon" href="${v.back}">${ic('back', 'flip')}</a>` : `<img class="mlogo" src="logo.png" alt="">`}
        <h1>${v.title}${v.sub ? `<small>${v.sub}</small>` : ''}</h1>
        ${v.actions || ''}
        <button class="btn sm icon mob-only" data-act="lang" style="display:none">${LANG === 'ar' ? 'EN' : 'ع'}</button>
        <button class="btn icon mob-lock" data-act="logout" title="${t('lock')}" style="display:none">${ic('lock')}</button>
      </header>
      ${v.html}
    </main>
    <nav class="tabbar">${navLinks('')}</nav>
  </div>`;
}

/* ---------------- login ---------------- */
let loginSel = null, pinBuf = '';
function renderLogin() {
  const users = S.users.filter(u => u.active);
  root().innerHTML = `<button class="btn sm lang-btn" data-act="lang">${LANG === 'ar' ? 'English' : 'العربية'}</button>
  <div class="login"><div class="login-box solo">
    <img class="login-logo" src="logo.png" alt="Insulator">
    <div class="login-panel card">
      <h2 style="margin:0">${t('enterPin')}</h2>
      ${pinPad()}
    </div></div></div>`;
}
function pinPad() {
  return `<div class="pin" style="margin-top:12px">
    <div class="pin-dots" id="dots">${[0, 1, 2, 3].map(i => `<i class="${i < pinBuf.length ? 'f' : ''}"></i>`).join('')}</div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-act="pin" data-n="${n}">${n}</button>`).join('')}
      <span></span><button data-act="pin" data-n="0">0</button><button data-act="pin" data-n="del">⌫</button></div></div>`;
}
function pinPress(n) {
  if (n === 'del') pinBuf = pinBuf.slice(0, -1); else if (pinBuf.length < 4) pinBuf += n;
  const dots = $('#dots'); if (dots) dots.innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < pinBuf.length ? 'f' : ''}"></i>`).join('');
  if (pinBuf.length === 4) {
    const h = H(pinBuf), u = S.users.find(x => x.active && x.pin === h);
    if (u) { try { if (['admin', 'supervisor'].includes(u.role) && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { } session = { uid: u.id, at: Date.now() }; sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); loginSel = null; pinBuf = ''; lastAct = Date.now(); if (!location.hash || location.hash === '#/') location.hash = '#/floor'; render(); }
    else { pinBuf = ''; setTimeout(() => { const d = $('#dots'); if (d) { d.classList.add('err'); d.innerHTML = '<i></i><i></i><i></i><i></i>'; setTimeout(() => d.classList.remove('err'), 450); } toast(t('wrongPin')); }, 120); }
  }
}
function logout() { session = null; sessionStorage.removeItem(SESSION_KEY); loginSel = null; pinBuf = ''; closeSheet(); render(); }

/* ---------------- floor ---------------- */
function viewFloor() {
  const today = startOfDay(Date.now()), sup = me().role === 'supervisor';
  const live = j => S.tasks.some(x => x.jobId === j.id && x.start && !x.end && !x.pausedAt) ? 2 : S.tasks.some(x => x.jobId === j.id && x.start && !x.end) ? 1 : 0;
  const open = S.jobs.filter(j => j.status === 'open').sort((a, b) => live(b) - live(a) || b.createdAt - a.createdAt);
  const closedToday = S.jobs.filter(j => j.status === 'closed' && j.closedAt >= today).sort((a, b) => b.closedAt - a.closedAt);
  const workers = S.workers.filter(w => w.active);
  const busy = workers.filter(w => runningOf(w.id));
  const nPaused = S.tasks.filter(x => x.pausedAt && !x.end && jobById(x.jobId)?.status === 'open').length;
  const shiftBtns = canEdit() ? `<button class="btn sm ${isOT() ? 'y' : 'ghost'}" data-act="ot-toggle" title="${t('otHint')}">${ic('clock')}${t('otToday')}${isOT() ? ' ✓' : ''}</button>${busy.length ? `<button class="btn sm amber" data-act="pause-all">${ic('pause')}${t('pauseAll')}</button>` : ''}${nPaused ? `<button class="btn sm g" data-act="resume-all">${ic('play')}${t('resumeAll')} (${nPaused})</button>` : ''}` : '';
  const doneToday = S.tasks.filter(x => x.end && x.end >= today).length;
  const carsToday = S.jobs.filter(j => j.createdAt >= today).length;
  const over = shiftOver();
  const wState = w => { const run = runningOf(w.id), pz = !run && pausedOf(w.id), pend = S.tasks.filter(x => wids(x).includes(w.id) && !x.start && jobById(x.jobId)?.status === 'open').length, nDone = S.tasks.filter(x => wids(x).includes(w.id) && x.end >= today).length, fin = !run && !pz && !pend && nDone > 0 && over;
    return { run, pz, pend, fin, nDone, rank: run ? 0 : pz ? 1 : pend ? 2 : fin ? 4 : 3 }; };
  const wCard = w => {
    const { run, pz, pend, fin, nDone } = wState(w), rj = (run || pz) && jobById((run || pz).jobId);
    return `<button class="w-card ${run ? 'busy' : pz ? 'paused' : fin ? 'fin' : ''}" data-act="worker-sheet" data-id="${w.id}">${avatar(w)}
      <div class="info"><b>${esc(wn(w))}</b>${run || pz ? `<small>${pz ? '⏸ ' + t('paused') + ' · ' : ''}${esc(nm(PARTS[(run || pz).part]))} · ${esc(rj ? (rj.car.make + ' ' + (rj.car.plate || '')) : '')}</small>` : fin ? `<small class="fin-t">${ic('check')}${t('wDone')}</small>` : `<small>${pend ? t('waitingW') + ' · ' + pend + ' ' + t('pending') : t('idle') + (nDone ? ` · ✓ <span class="num">${nDone}</span>` : '')}</small>`}</div>
      ${run ? `<span class="timer num" data-since="${since(run)}">${fClock(dur(run))}</span>` : pz ? `<span class="timer num pz">${fClock(dur(pz))}</span>` : pend ? `<span class="badge num">${pend}</span>` : fin ? `<span class="fin-ic">${ic('check')}</span>` : ''}</button>`;
  };
  const ordered = list => list.map((w, i) => [w, wState(w).rank, i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(a => a[0]);
  const html = `${S.demo && (!sup || DEMO_MODE) ? demoBanner() : ''}
    <div class="stats-row">
      <div class="kpi hl"><small><span class="live"><span class="dot"></span></span>${t('workingNow')}</small><b class="num">${busy.length}<span>/ ${workers.length}</span></b></div>
      <button class="kpi tap" data-act="floor-kpi" data-k="open"><small>${ic('car')}${t('openCars')}</small><b class="num">${open.length}</b><em class="kpi-more">›</em></button>
      <button class="kpi tap" data-act="floor-kpi" data-k="done"><small>${ic('check')}${t('doneToday')}</small><b class="num">${doneToday}</b><em class="kpi-more">›</em></button>
      <button class="kpi tap" data-act="floor-kpi" data-k="today"><small>${ic('clock')}${t('carsToday')}</small><b class="num">${carsToday}</b><em class="kpi-more">›</em></button>
    </div>
    <div class="sec-h">${ic('car')}${t('openJobs')}<span class="count num">${open.length}</span><span class="grow"></span>${canEdit() ? `<a class="btn sm y" href="#/new">${ic('plus')}${t('addCar')}</a>` : ''}</div>
    ${open.length ? `<div class="jobs-grid">${open.map(jobCard).join('')}</div>` : `<div class="empty">${ic('car')}<div>${t('noOpen')}</div></div>`}
    ${byTeam(workers).map(([k, list], i) => `<div class="sec-h">${ic('users')}${esc(nm(TEAMS[k]))}<span class="count num">${list.length}</span>${i === 0 ? '<span class="grow"></span>' + shiftBtns : ''}</div>
    <div class="workers-grid">${ordered(list).map(wCard).join('')}</div>`).join('') || `<div class="empty">${t('noData')}</div>`}
    ${closedToday.length ? `<div class="sec-h">${ic('check')}${t('closedToday')}<span class="count num">${closedToday.length}</span></div><div class="jobs-grid">${closedToday.map(jobCard).join('')}</div>` : ''}`;
  return { title: t('floor'), sub: fDateL(Date.now()), html };
}
function jobCard(j) {
  const ts = tasksOf(j.id), done = ts.filter(x => x.end).length, run = ts.filter(x => x.start && !x.end).length, pct = ts.length ? Math.round(done / ts.length * 100) : 0;
  const crew = [...new Set(ts.flatMap(wids))].map(workerById).filter(Boolean);
  return `<a class="j-card" href="#/job/${j.id}">
    <div class="row"><span class="title">${esc(carTitle(j))}</span>${j.car.plate ? `<span class="plate">${esc(j.car.plate)}</span>` : ''}</div>
    <div class="chips">${j.services.map(k => `<span class="chip">${esc(nm(SVC[k]))}</span>`).join('')}${run ? `<span class="chip g live"><span class="dot"></span>${run} ${t('running')}</span>` : ''}${j.status === 'closed' ? `<span class="chip g">${ic('check')}${t('closed')}</span>` : ''}</div>
    <div class="bar ${pct === 100 ? 'g' : ''}"><i style="width:${pct}%"></i></div>
    <div class="row"><div style="display:flex">${crew.slice(0, 5).map((w, i) => `<span style="margin-inline-start:${i ? -8 : 0}px">${avatar(w, 'sm')}</span>`).join('')}</div><span class="grow" style="flex:1"></span><span class="muted num" style="font-size:12.5px">${done}/${ts.length} · ${fTime(j.createdAt)}</span></div>
  </a>`;
}
function floorKpiSheet(k) {
  const today = startOfDay(Date.now()), head = (ti, n) => `<div class="sheet-h"><h3>${ti} <span class="count num">${n}</span></h3><button class="btn icon ghost" data-act="close-sheet">${ic('x')}</button></div>`;
  if (k === 'done') {
    const R = {}; S.tasks.filter(x => x.end && x.end >= today).forEach(x => { const ids = wids(x).filter(workerById), n = Math.max(ids.length, x.share || 1); ids.forEach(id => { const r = R[id] = R[id] || { id, n: 0, pts: 0, parts: [] }; r.n += 1 / n; r.pts += ptsOf(x) / n; r.parts.push(pName(x.part, x.service) + (n > 1 ? ' ½'.replace('½', n === 2 ? '½' : '1/' + n) : '')); }); });
    const all = Object.values(R), tot = S.tasks.filter(x => x.end && x.end >= today).length;
    const body = byTeam(all.map(r => workerById(r.id))).map(([tk, ws]) => { const l = ws.map(w => R[w.id]).sort((a, b) => b.n - a.n || b.pts - a.pts);
      return `<div class="team-h">${ic('users')}${esc(nm(TEAMS[tk]))}</div>` + l.map((r, i) => { const w = workerById(r.id), rk = 1 + l.filter(o => o.n > r.n).length;
        return `<div class="dk-row r${rk}"><span class="rk num">${rk}</span>${avatar(w)}<span class="nm"><b>${esc(wn(w))}</b><small class="muted">${esc(r.parts.join('، '))}</small></span><b class="num dk-n">${fN(+r.n.toFixed(1))}</b></div>`; }).join(''); }).join('');
    openSheet(head(t('doneToday'), tot) + (body || `<div class="empty">${t('noData')}</div>`)); $('.sheet').dataset.kpi = k; return; }
  const live = j => S.tasks.some(x => x.jobId === j.id && x.start && !x.end && !x.pausedAt) ? 2 : S.tasks.some(x => x.jobId === j.id && x.start && !x.end) ? 1 : 0;
  const list = k === 'open' ? S.jobs.filter(j => j.status === 'open').sort((a, b) => live(b) - live(a) || b.createdAt - a.createdAt) : S.jobs.filter(j => j.createdAt >= today).sort((a, b) => b.createdAt - a.createdAt);
  openSheet(head(t(k === 'open' ? 'openCars' : 'carsToday'), list.length) + (list.length ? `<div class="sheet-jobs">${list.map(jobCard).join('')}</div>` : `<div class="empty">${t('noData')}</div>`)); $('.sheet').dataset.kpi = k;
}
function avgSheet() {
  const { from, to } = periodRange(), L = svcTimes(from, to);
  openSheet(`<div class="sheet-h"><h3>${t('avgBySvc')}<br><small class="muted" style="font-weight:400;font-size:12.5px">${t('avgHow')}</small></h3><button class="btn icon ghost" data-act="close-sheet">${ic('x')}</button></div>
    ${L.length ? L.map(o => `<details class="avg-svc"${o.k === 'full_ppf' ? ' open' : ''}><summary><span class="ic">${ic(SVC_IC[o.k])}</span><span class="nm"><b>${esc(nm(SVC[o.k]))}</b><small class="muted num">${o.n} ${t('cars')} · ${t('fastest')} ${fDur(o.min)} · ${t('slowest')} ${fDur(o.max)}</small></span><b class="num avg-v">${fDur(o.avg)}</b></summary>
      ${o.cars.map(c => { const j = jobById(c.jobId); return `<a class="avg-car" href="#/job/${c.jobId}"><span class="nm"><span class="ac-t">${esc(j ? carTitle(j) : '')}${j && j.car.plate ? ` <span class="plate">${esc(j.car.plate)}</span>` : ''}</span><small class="muted num">${fDate(Math.min(...S.tasks.filter(x => x.jobId === c.jobId && x.service === o.k).map(x => x.start)))}</small></span>${avatars(c.crew)}<b class="num">${fDur(c.d)}</b></a>`; }).join('')}</details>`).join('') : `<div class="empty">${t('noData')}</div>`}`);
  $('.sheet').dataset.kpi = 'avg';
}
function demoBanner() { return DEMO_MODE ? `<div class="demo-banner">${ic('info')}<span>${t('demoMode')}</span><button class="btn sm" data-act="demo-reset">${t('demoReset')}</button></div>` : `<div class="demo-banner">${ic('info')}<span>${t('demoNote')}</span>${isAdmin() ? `<button class="btn sm" data-act="clear-demo">${t('clearDemo')}</button>` : ''}</div>`; }

const SHADES = [5, 15, 20, 30, 35, 40, 50, 60, 70, 80];
const avatars = (ids, cls = 'sm') => { const ws = ids.map(workerById).filter(Boolean); return ws.length ? `<span class="avs">${ws.map(w => avatar(w, cls)).join('')}</span>` : avatar(null, cls); };
const tintInfo = x => !needFilm(x.service) ? '' : [filmById(x.filmId)?.name, x.shade ? x.shade + '%' : ''].filter(Boolean).join(' · ');

function workerSheet(wId) {
  const w = workerById(wId); if (!w) return;
  const mine = S.tasks.filter(x => wids(x).includes(wId) && !x.end && jobById(x.jobId)?.status === 'open');
  const run = mine.filter(x => x.start), pend = mine.filter(x => !x.start);
  openSheet(`<div class="sheet-h">${avatar(w, 'lg')}<h3>${esc(wn(w))}<br><small class="muted" style="font-weight:400;font-size:13px">${run.some(x => !x.pausedAt) ? t('running') : run.length ? t('paused') : t('idle')}</small></h3><button class="btn icon ghost" data-act="close-sheet">${ic('x')}</button></div>
    ${mine.length ? [...run, ...pend].map(x => taskRow(x, true, wId)).join('') : `<div class="empty">${t('noTasksW')}</div>`}`);
  $('.sheet').dataset.worker = wId;
  tick();
}

/* ---------------- task row (shared) ---------------- */
const editFlag = x => { if (!x.edited || me()?.role === 'supervisor') return ''; const l = (x.editLog || []).slice(-1)[0], u = l && userById(l.by);
  return `<span class="edited" title="${l ? esc((u ? un(u) : '') + ' · ' + fDate(l.at) + ' ' + fTime(l.at)) : ''}">✎ ${t(x.manual ? 'manualT' : 'editedT')}</span>`; };
function taskRow(x, showCar = false, ctxWid = null) {
  const j = jobById(x.jobId), edit = canEdit() && (isAdmin() || supCanSeeJob(j)), ti = tintInfo(x);
  const others = [...new Set(mates(x).flatMap(wids))].filter(id => id !== ctxWid && (ctxWid || !wids(x).includes(id))).map(workerById).filter(Boolean);
  const state = x.end ? 'done' : x.pausedAt ? 'pause' : x.start ? 'run' : 'wait';
  let act = '';
  if (state === 'wait') act = edit ? `${j.status === 'open' ? `<button class="btn g" data-act="start" data-id="${x.id}">${ic('play')}${t('start')}</button>` : ''}<button class="btn ghost sm" data-act="edit-task" data-id="${x.id}" data-focus="time">${ic('clock')}<span class="hide-sm">${t('addTime')}</span></button>` : `<span class="chip">${t('notStarted')}</span>`;
  if (state === 'run') act = `<span class="clock num" data-since="${since(x)}">${fClock(dur(x))}</span>${edit ? `<button class="btn amber" data-act="pause" data-id="${x.id}" title="${t('pause')}">${ic('pause')}<span class="hide-sm">${t('pause')}</span></button><button class="btn r" data-act="finish" data-id="${x.id}">${ic('stop')}${t('finish')}</button>` : ''}`;
  if (state === 'pause') act = `<span class="clock num pz">${fClock(dur(x))}</span>${edit ? `<button class="btn g" data-act="resume" data-id="${x.id}">${ic('play')}${t('resume')}</button><button class="btn r" data-act="finish" data-id="${x.id}">${ic('stop')}${t('finish')}</button>` : `<span class="chip">${t('paused')}</span>`}`;
  if (state === 'done') act = `<span class="dur num">${fDur(dur(x))}</span><span class="chip g">${ic('check')}</span>`;
  return `<div class="task ${state}">
    <div class="nm"><b>${esc(pName(x.part, x.service))}${ti ? ` <span class="chip y" style="padding:1px 8px;font-size:11.5px">${esc(ti)}</span>` : ''}</b><small>${showCar && j ? `<span>${esc(carTitle(j))}${j.car.plate ? ' · ' + esc(j.car.plate) : ''}</span>` : ''}<span>${esc(nm(SVC[x.service]))}${x.kind ? ' · ' + kindLabel(x.kind) : ''}</span>${others.length ? `<span>· ${t('with')} ${others.map(w => esc(wn(w))).join('، ')}</span>` : ''}${x.start ? `<span class="num">· ${fTime(x.start)}${x.end ? '–' + fTime(x.end) : ''}</span>` : ''}${editFlag(x)}${x.rework ? `<span class="chip r" style="padding:0 8px">${t('rework').split(' (')[0]}</span>` : ''}</small></div>
    <div class="act">${act}${edit ? `<button class="btn sm icon ghost" data-act="edit-task" data-id="${x.id}" title="${t('editTask')}">${ic('edit')}</button>` : ''}</div></div>`;
}
function startTask(id) {
  const x = S.tasks.find(t => t.id === id); if (!x || x.start) return;
  const busy = wids(x).filter(w => runningOf(w)).map(w => wn(workerById(w))).filter(Boolean);
  if (busy.length && !confirmBox(t('alreadyRunning', busy.join('، ')))) return;
  x.start = Date.now(); db.save(); toast(t('started')); refresh();
}
function pauseTask(x, quiet) { if (!x || !x.start || x.end || x.pausedAt) return; x.pausedAt = Date.now(); if (!quiet) { db.save(); toast(t('pausedToast')); refresh(); } }
function resumeTask(x, quiet) { if (!x || !x.pausedAt || x.end) return; x.paused = (x.paused || 0) + Date.now() - x.pausedAt; x.pausedAt = null; if (!quiet) { db.save(); toast(t('started')); refresh(); } }
const endTask = x => { if (x.pausedAt) { x.end = x.pausedAt; x.pausedAt = null; } else x.end = Date.now(); };
function finishTask(id) { const x = S.tasks.find(t => t.id === id); if (!x || !x.start || x.end) return; endTask(x); db.save(); toast(t('finished')); refresh(); }
function refresh() { const sh = $('.sheet'), wid = sh && sh.dataset.worker, part = sh && sh.dataset.part, sy = sh ? sh.scrollTop : 0; render(); if (wid) workerSheet(wid); else if (part) partSheet(sh.dataset.job, part); else if (sh && sh.dataset.kpi) (sh.dataset.kpi === 'avg' ? avgSheet() : floorKpiSheet(sh.dataset.kpi)); const n = $('.sheet'); if (n && (wid || part || (sh && sh.dataset.kpi))) n.scrollTop = sy; }

/* ---------------- new job ---------------- */
let draft = null;
function newDraft() { return { car: { make: '', model: '', year: '', color: '', plate: '', customer: '', phone: '', notes: '' }, services: [], assign: {}, tint: {}, tintAll: { film: '', shade: '' }, svc: null, worker: null }; }
const svcGrid = () => SVC_CATS.map(c => `<div class="svc-cat"><div class="svc-cat-h">${ic(c.ic)}<b>${esc(nm(c))}</b>${c.hint ? `<small class="muted">· ${esc(nm(c.hint))}</small>` : ''}</div><div class="svc-grid">${c.svcs.map(k => svcBtn(SVC[k])).join('')}</div></div>`).join('');
const svcBtn = s => `<button class="svc ${draft.services.includes(s.k) ? 'on' : ''}" data-act="svc" data-k="${s.k}"><span class="ic">${ic(SVC_IC[s.k])}</span><b>${esc(nm(s))}</b><span class="tick">${ic('check')}</span></button>`;
// dropdown with an "Other" choice that reveals a text box (used for make and colour)
const svcExtra = () => draft.services.includes('color_change') ? `<div class="form-grid" style="margin-top:14px">${selOther('newColor', COLORS.map(([ar, en]) => [ar, LANG === 'ar' ? ar : en]), t('typeColor'))}</div>` : '';
function selOther(key, opts, ph) {
  const v = draft.car[key], other = !!v && !opts.some(o => o[0] === v);
  return `<div class="field"><label>${t(key)}</label><select class="inp" data-act-change="sel-other" data-key="${key}"><option value="">—</option>${opts.map(([val, label]) => `<option value="${esc(val)}" ${v === val ? 'selected' : ''}>${esc(label)}</option>`).join('')}<option value="__other" ${other ? 'selected' : ''}>${t('other')}</option></select>
    <input class="inp" id="${key}-other" data-car="${key}" placeholder="${ph}" value="${other ? esc(v) : ''}" style="margin-top:8px;${other ? '' : 'display:none'}"></div>`;
}
const modelField = () => { const ms = MODELS[draft.car.make] || []; return ms.length ? selOther('model', ms.map(m => [m, m]), t('typeModel')) : `<div class="field"><label>${t('model')}</label><input class="inp" data-car="model" autocomplete="off" placeholder="${t('typeModel')}" value="${esc(draft.car.model)}"></div>`; };
const modelOpts = make => (MODELS[make] || []).map(m => `<option value="${esc(m)}">`).join('');
function viewNew() {
  if (!draft) draft = newDraft();
  const c = draft.car, f = (k, type = 'text', extra = '') => `<div class="field"><label>${t(k)}</label><input class="inp" data-car="${k}" type="${type}" value="${esc(c[k])}" ${extra}></div>`;
  const html = `<div class="new-layout">
    <section class="card"><h2>${ic('car')}${t('carInfo')}<span class="grow" style="flex:1"></span><span class="chip y num">${ic('clock')}${fDateL(Date.now())}</span></h2>
      <div class="form-grid">
        ${selOther('make', MAKES.map(m => [m, m]), t('typeMake'))}
        <div id="model-wrap" style="display:contents">${modelField()}</div>
        <div class="field"><label>${t('year')}</label><select class="inp" data-car="year"><option value="">—</option>${YEARS.map(y => `<option ${c.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
        ${selOther('color', COLORS.map(([ar, en]) => [ar, LANG === 'ar' ? ar : en]), t('typeColor'))}
        ${f('plate', 'text', 'inputmode="numeric"')}${f('customer')}${f('phone', 'tel')}
        <div class="field wide" id="plate-hint"></div>
        <div class="field wide"><label>${t('notes')}</label><textarea class="inp" data-car="notes" rows="2">${esc(c.notes)}</textarea></div>
      </div></section>
    <section class="card"><h2>${ic('shield')}${t('services')}<small class="muted" style="font-weight:400">· ${t('chooseSvc')}</small></h2>
      <div id="svc-cats">${svcGrid()}</div><div id="svc-extra">${svcExtra()}</div></section>
    <section class="card" id="assign-zone"></section>
  </div>
  <div class="sticky-foot"><span class="sum" id="draft-sum"></span><button class="btn y lg" data-act="save-job">${ic('check')}${t('saveStart')}</button></div>`;
  return { title: t('new'), html };
}
const shadeSel = (v, attrs) => `<select class="inp sm" ${attrs}><option value="">%</option>${SHADES.map(s => `<option value="${s}" ${+v === s ? 'selected' : ''}>${s}%</option>`).join('')}</select>`;
const filmSel = (v, attrs, films) => `<select class="inp sm" ${attrs}><option value="">${t('noFilm')}</option>${films.map(f => `<option value="${f.id}" ${v === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select>`;
function renderAssign() {
  const z = $('#assign-zone'); if (!z) return;
  const sum = $('#draft-sum');
  const total = Object.values(draft.assign).reduce((a, m) => a + Object.keys(m).length, 0);
  const asg = Object.values(draft.assign).reduce((a, m) => a + Object.values(m).filter(l => l.length).length, 0);
  if (sum) sum.innerHTML = `<b class="num">${total}</b> ${t('parts')} · <b class="num">${asg}</b> ${t('assigned')}`;
  if (!draft.services.length) { z.innerHTML = `<h2>${ic('users')}${t('assignWork')}</h2><div class="empty">${t('chooseSvc')}</div>`; return; }
  if (!draft.services.includes(draft.svc)) draft.svc = draft.services[0];
  const svc = draft.svc, map = draft.assign[svc], g = SVC[svc].g, kind = dKind(svc), pool = poolOf(svc, kind), tl = isTintLike(svc, kind);
  const pref = SVC_TEAM(svc), workers = S.workers.filter(w => w.active && (draft.allW || inTeam(w, pref))).sort((a, b) => !inTeam(a, pref) - !inTeam(b, pref));
  if (draft.worker && !workers.some(w => w.id === draft.worker)) draft.worker = null;
  const one = pool.length === 1, onOne = wid => one && (map[pool[0]] || []).includes(wid);
  const cnt = wid => Object.values(draft.assign).reduce((a, m) => a + Object.values(m).filter(l => l.includes(wid)).length, 0);
  const aw = draft.worker && workerById(draft.worker);
  const films = S.films.filter(f => f.active && ['ppf', 'tint'].includes(f.type));
  const kindPick = !KINDS[g] ? '' : `<div class="field" style="margin-bottom:14px"><label>${t(g === 'pol' ? 'polWhat' : 'replWhat')}</label><div class="seg">${KINDS[g].map(k => `<button class="${kind === k ? 'on' : ''}" data-act="repl-kind" data-k="${k}">${kindLabel(k)}</button>`).join('')}</div></div>`;
  const sh = needShade(svc, kind);
  const tintBox = !needFilm(svc) ? '' : `<div class="tint-box">
      <div class="sec-h" style="margin:0 0 10px;font-size:14px">${ic('sun')}${t(sh ? 'tintSpec' : 'jamSpec')}</div>
      <div class="tint-row all"><b>${t('applyAll')}</b>${filmSel(draft.tintAll.film, 'data-act-change="tint-all-film"', films)}${sh ? shadeSel(draft.tintAll.shade, 'data-act-change="tint-all-shade"') : ''}</div>
      ${pool.filter(p => p in map).map(p => { const o = draft.tint[p] || {}; return `<div class="tint-row"><span>${esc(nm(PARTS[p]))}</span>${filmSel(o.film || '', `data-act-change="tint-film" data-part="${p}"`, films)}${sh ? shadeSel(o.shade || '', `data-act-change="tint-shade" data-part="${p}"`) : ''}</div>`; }).join('')}
    </div>`;
  z.innerHTML = `<h2>${ic('users')}${t('assignWork')}</h2>
    <div class="tabs">${draft.services.map(k => `<button class="${k === svc ? 'on' : ''}" data-act="svc-tab" data-k="${k}">${esc(nm(SVC[k]))}<span class="n num">${Object.keys(draft.assign[k]).length}</span></button>`).join('')}</div>
    <div class="assign">
      <div>${kindPick}${pool.length === 1 ? '' : `<div class="car-wrap"><span class="front">▲ ${t('front')}</span>${carSVG(svc, map, kind)}</div>
        <div class="legend"><span><i class="lg-inc"></i>${t('lgInc')}</span><span><i class="lg-as"></i>${t('lgAs')}</span><span><i class="lg-off"></i>${t('lgOff')}</span></div>`}</div>
      <div>
        <div class="sec-h" style="margin:0 0 8px;font-size:14px">${ic('users')}${esc(nm(TEAMS[pref]))}<span class="grow"></span><button class="btn sm ghost" data-act="all-workers">${draft.allW ? t('teamOnly') : t('allWorkers')}</button></div>
        <p class="hint">${ic('info')}${one ? t('tapWorkers') : draft.worker ? t('pickWorker') : t('noWorkerSel')}</p>
        <div class="wk-chips">${workers.map(w => `<button class="wk-chip ${draft.worker === w.id || onOne(w.id) ? 'on' : ''}" style="--c:${wColor(w)}" data-act="pick-worker" data-id="${w.id}">${avatar(w, 'sm')}<span>${esc(wn(w))}</span><span class="cnt num">${cnt(w.id) || ''}</span></button>`).join('')}</div>
        ${one ? '' : `<div class="sec-h" style="margin:14px 0 10px;font-size:14px">${t('parts')}<span class="count num">${Object.keys(map).length}/${pool.length}</span></div>
        <div class="parts-list">${pool.map(p => { const has = p in map, ws = has ? map[p].map(workerById).filter(Boolean) : [];
          return `<button class="part ${ws.length ? 'as' : has ? 'inc' : ''}" style="--c:${ws.length ? wColor(ws[0]) : ''}" data-act="part" data-part="${p}">${ws.length ? `<span class="avs">${ws.map(w => avatar(w, 'sm')).join('')}</span>` : ''}${esc(pName(p, svc))}</button>`; }).join('')}</div>
        <div class="quick">
          <button class="btn sm" data-act="parts-all">${t('all')}</button><button class="btn sm ghost" data-act="parts-clear">${t('clear')}</button>
          ${aw ? `<button class="btn sm" data-act="parts-rest">${t('assignRest')} ${esc(wn(aw))}</button>` : ''}
        </div>`}
        ${tintBox}
      </div>
    </div>`;
}
function togglePart(p) {
  const svc = draft.svc, map = draft.assign[svc]; if (!map || !poolOf(svc, dKind(svc)).includes(p)) return;
  const w = draft.worker;
  if (!(p in map)) { map[p] = w ? [w] : []; if (isTintLike(svc, dKind(svc)) && !draft.tint[p]) draft.tint[p] = { ...draft.tintAll }; }
  else if (!w) delete map[p];
  else { const a = map[p], i = a.indexOf(w); if (i >= 0) a.splice(i, 1); else a.push(w); } // several workers can share one panel
  renderAssign();
}
function saveJob() {
  const c = draft.car;
  if (!c.make.trim() && !c.plate.trim()) { toast(t('needCar')); return; }
  if (!draft.services.includes('color_change')) delete c.newColor;
  if (!draft.services.length) return toast(t('needSvc'));
  const total = Object.values(draft.assign).reduce((a, m) => a + Object.keys(m).length, 0);
  if (!total) return toast(t('needParts'));
  const job = { id: uid(), createdAt: Date.now(), createdBy: me().id, status: 'open', closedAt: null, services: [...draft.services], films: {}, car: { ...c } };
  S.jobs.push(job);
  draft.services.forEach(k => Object.entries(draft.assign[k]).forEach(([p, ws]) => {
    const kind = hasKind(k) ? dKind(k) : undefined, tn = needFilm(k) ? (draft.tint[p] || {}) : {};
    const one = { jobId: job.id, service: k, ...(kind ? { kind } : {}), part: p, filmId: tn.film || '', shade: '', start: null, end: null, rework: false };
    if (ws.length <= 1) S.tasks.push({ id: uid() + p, ...one, workerIds: [...ws] });
    else { const grp = uid() + p; ws.forEach((w, i) => S.tasks.push({ id: grp + '_' + i, ...one, workerIds: [w], grp, share: ws.length })); }
  }));
  db.save(); draft = null; toast(t('saved')); go('#/job/' + job.id);
}

/* ---------------- car history + customer follow-up ---------------- */
const plateKey = p => String(p || '').replace(/[\s\-_.]/g, '').toUpperCase();
const visitsOf = plate => { const k = plateKey(plate); return k ? S.jobs.filter(o => plateKey(o.car.plate) === k).sort((a, b) => a.createdAt - b.createdAt) : []; };
const FU_CHECK_D = 3, FU_SVC_M = 6, FU_SVC_TIMES = 6, FU_BACK = 21 * DAY, FU_AHEAD = 14 * DAY; // service every 6 months for 3 years; a missed one stays ~3 weeks, then waits for the next
const isVisitOnly = j => j.services.every(k => SVC[k] && ['srv', 'chk'].includes(SVC[k].g)); // service / check-up visits
const addMonths = (ts, m) => { const d = new Date(ts); d.setMonth(d.getMonth() + m); return d.getTime(); };
const fuWeekEnd = () => periodRange({ mode: 'week', ref: Date.now() }).to; // the work week ends Thursday night
const waNum = p => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.length === 8) d = '974' + d; return d; };
// who to call: a check-up 3 days after a job · a service every 6 months after the car's last visit (for 3 years)
function fuItems() {
  const now = Date.now(), until = fuWeekEnd() + FU_AHEAD, out = [], lastSeen = new Set();
  const visits = {}; S.jobs.forEach(o => { const k = plateKey(o.car.plate); if (k) (visits[k] = visits[k] || []).push(o); });
  [...S.jobs].sort((a, b) => (b.closedAt || b.createdAt) - (a.closedAt || a.createdAt)).forEach(j => {
    if (j.status !== 'closed' || !j.closedAt || (j.demo && !DEMO_MODE && !S.demo)) return;
    const fu = j.fu || {}, key = plateKey(j.car.plate);
    const back = key && (visits[key] || []).filter(o => o !== j && o.createdAt > j.closedAt).sort((a, b) => a.createdAt - b.createdAt)[0]; // the car came back after this job
    // check-up: every job except service / check-up visits; done by itself when the car comes back
    const dueC = j.closedAt + FU_CHECK_D * DAY;
    if (!isVisitOnly(j) && dueC <= until && now < dueC + 30 * DAY) out.push({ kind: 'check', key: 'check', j, due: dueC, done: fu.check || (back && { at: back.createdAt, by: back.createdBy, auto: true }), snooze: fu.checkSnooze, tries: fu.checkTries || [] });
    // service: only the car's latest visit counts, every 6 months
    const ck = key || j.id; if (lastSeen.has(ck)) return; lastSeen.add(ck);
    for (let n = 1; n <= FU_SVC_TIMES; n++) {
      const due = addMonths(j.closedAt, FU_SVC_M * n); if (due > until) break; if (due < now - FU_BACK) continue;
      out.push({ kind: 'svc', key: 'svc' + n, n, j, due, done: fu['svc' + n] || (n === 1 && fu.svc), snooze: fu['svc' + n + 'Snooze'], tries: fu['svc' + n + 'Tries'] || [] });
    }
  });
  return out.sort((a, b) => a.due - b.due);
}
const fuOpen = i => !i.done && !(i.snooze && i.snooze > Date.now());
const fuDue = () => { const we = fuWeekEnd(); return fuItems().filter(i => fuOpen(i) && i.due <= we); }; // this week (incl. a few days late)
function waText(i) {
  const j = i.j, name = j.car.customer ? ' ' + j.car.customer : '', car = carTitle(j), shop = S.settings.shop || 'Insulator';
  return i.kind === 'check' ? `مرحباً${name}، معك ${shop}. نتمنى إن شغل سيارتك ${car} عاجبك 🌟 حياك تمرّ علينا للتشييك على السيارة، متى يناسبك؟`
    : `مرحباً${name}، معك ${shop}. صار لسيارتك ${car} ${FU_SVC_M * i.n} شهر من آخر زيارة، وحان وقت السيرفيس 🚗✨ متى يناسبك نحجز لك موعد؟`;
}
function fuCard(i) {
  const j = i.j, v = visitsOf(j.car.plate).length || 1, ph = j.car.phone, sup = me().role === 'supervisor', days = Math.round((startOfDay(i.due) - startOfDay(Date.now())) / DAY);
  const head = sup ? `<b>${esc(carTitle(j))}</b>` : `<a href="#/job/${j.id}"><b>${esc(carTitle(j))}</b></a>`;
  const when = days < 0 ? `<span class="chip r num">${t('fuLate', -days)}</span>` : days === 0 ? `<span class="chip y">${t('today')}</span>` : `<span class="chip num">${t('fuIn', days, fDate(i.due))}</span>`;
  const d = i.done && userById(i.done.by), noInfo = !ph && !j.car.customer, tr = (i.tries || []).length;
  const res = i.done && ({ booked: t('fuApptR', i.done.appt ? fDT(i.done.appt) : ''), declined: t('fuDeclR'), other: t('fuOtherR') }[i.done.res]);
  return `<div class="fu-card ${i.kind} ${i.done ? 'done' : ''}">
    <div class="fu-top"><span class="fu-k">${ic(i.kind === 'check' ? 'check' : 'clock')}${i.kind === 'check' ? t('fuCheck') : t('fuSvcN', FU_SVC_M * i.n)}</span>${i.done ? '' : when}${!i.done && tr ? `<span class="chip r num" title="${fDT(i.tries[tr - 1].at)}">${t('fuTries', tr)}</span>` : ''}<span class="grow"></span>${j.car.plate ? `<span class="plate">${esc(j.car.plate)}</span>` : ''}</div>
    <div class="fu-main">${head}${j.car.customer ? `<small class="muted">${esc(j.car.customer)}</small>` : ''}${noInfo ? `<small class="fu-noinfo">${t('fuNoInfo')}</small>` : ''}</div>
    ${i.done ? `<div class="fu-done ${i.done.res || ''}">${ic(i.done.res === 'declined' ? 'x' : 'check')}${i.done.auto ? t('fuCameBack', fDate(i.done.at)) : (res ? res + ' · ' + (d ? esc(un(d)) : '—') : t('fuDoneBy', d ? un(d) : '—', fDate(i.done.at)))}</div>${i.done.note ? `<small class="muted">${esc(i.done.note)}</small>` : ''}`
      : `<div class="fu-act">${ph ? `<a class="btn g" href="tel:${esc(ph)}">${ic('phone')}${t('call')}</a><a class="btn" href="https://wa.me/${waNum(ph)}?text=${encodeURIComponent(waText(i))}" target="_blank" rel="noopener">${t('whatsapp')}</a>` : noInfo ? '' : `<span class="muted" style="font-size:13px">${t('noPhone')}</span>`}
        <span class="grow"></span><button class="btn y sm" data-act="fu-call" data-id="${j.id}" data-k="${i.key}">${ic('phone')}${t('fuResult')}</button></div>`}
  </div>`;
}
function viewFollow() {
  const all = fuItems(), we = fuWeekEnd(), now = Date.now();
  const tried = i => (i.tries || []).length ? i.tries[i.tries.length - 1].at : 0;
  const week = all.filter(i => fuOpen(i) && i.due <= we).sort((a, b) => tried(a) - tried(b) || a.due - b.due), soon = all.filter(i => fuOpen(i) && i.due > we);
  const later = all.filter(i => !i.done && i.snooze && i.snooze > now), done = all.filter(i => i.done).sort((a, b) => b.done.at - a.done.at).slice(0, 15);
  const today = week.filter(i => i.due <= startOfDay(now) + DAY).length;
  const appts = all.filter(i => i.done && i.done.res === 'booked' && i.done.appt >= startOfDay(now)).sort((a, b) => a.done.appt - b.done.appt);
  const list = (h, icn, arr, empty) => `<div class="sec-h">${ic(icn)}${h}<span class="count num">${arr.length}</span></div>${arr.length ? `<div class="fu-list">${arr.map(fuCard).join('')}</div>` : empty ? `<div class="empty">${ic('check')}<div>${empty}</div></div>` : ''}`;
  const html = `<p class="muted" style="margin:0 0 14px">${t('fuIntro', FU_CHECK_D, FU_SVC_M)}</p>
    ${appts.length ? list(t('fuAppts'), 'calendar', appts) : ''}
    ${list(t('fuWeek'), 'phone', week, t('fuNone'))}
    ${!today && soon.length ? `<p class="muted" style="margin:-4px 0 0;font-size:13px">${t('fuNoToday')}</p>` : ''}
    ${list(t('fuSoon'), 'clock', soon, soon.length ? '' : t('fuNoSoon'))}
    ${later.length ? list(t('fuSnoozed'), 'clock', later) : ''}${done.filter(i => !appts.includes(i)).length ? list(t('fuDoneList'), 'check', done.filter(i => !appts.includes(i))) : ''}`;
  return { title: t('follow'), sub: t('fuSub'), html };
}
let fuCall = null;
function fuCallSheet() {
  const c = fuCall, j = jobById(c.id); if (!j) return;
  const b = (act, v, on, label, cls = '') => `<button type="button" class="pick fu-opt ${on ? 'on' : ''} ${cls}" data-act="${act}" data-v="${v}">${label}</button>`;
  openSheet(`<form data-form="fu-call"><div class="sheet-h"><h3>${t('fuResult')}</h3><button type="button" class="btn icon ghost" data-act="close-sheet">${ic('x')}</button></div>
    <p class="muted" style="margin:0 0 12px">${esc(carTitle(j))}${j.car.plate ? ' · ' + esc(j.car.plate) : ''}${j.car.customer ? ' · ' + esc(j.car.customer) : ''}</p>
    <div class="fu-opts two">${b('fu-ans', 'yes', c.ans === 'yes', ic('check') + t('fuAnswered'), 'g')}${b('fu-ans', 'no', c.ans === 'no', ic('x') + t('fuNoAns'), 'r')}</div>
    ${c.ans === 'yes' ? `<div class="field" style="margin-top:14px"><label>${t('fuWhat')}</label><div class="fu-opts">${[['booked', 'fuBooked'], ['later', 'fuCallLater'], ['declined', 'fuDeclined'], ['other', 'fuOther']].map(([v, k]) => b('fu-res', v, c.res === v, t(k))).join('')}</div></div>
      ${c.res === 'booked' ? `<div class="field"><label>${t('fuApptAt')}</label><input class="inp" type="datetime-local" name="appt" dir="ltr"></div>` : ''}
      ${c.res ? `<div class="field"><label>${t('fuNote')} <small class="muted">· ${t('fuNoteP')}</small></label><input class="inp" name="note"></div>` : ''}` : ''}
    <div class="foot"><span class="grow"></span><button type="button" class="btn ghost" data-act="close-sheet">${t('cancel')}</button><button class="btn y" ${c.ans === 'no' || (c.ans === 'yes' && c.res) ? '' : 'disabled'}>${t('save')}</button></div></form>`);
}
function fuCallSave(f) {
  const c = fuCall, j = c && jobById(c.id); if (!j) return; j.fu = j.fu || {}; const k = c.key, by = me().id, now = Date.now();
  if (c.ans === 'no') { (j.fu[k + 'Tries'] = j.fu[k + 'Tries'] || []).push({ at: now, by }); db.save(); closeSheet(); render(); toast(t('fuTriedT')); return; }
  const note = (f.note && f.note.value || '').trim();
  if (c.res === 'booked') { const v = f.appt && f.appt.value; if (!v) { toast(t('fuPickDate')); return; } j.fu[k] = { at: now, by, res: 'booked', appt: new Date(v).getTime(), note }; }
  else if (c.res === 'later') { j.fu[k + 'Snooze'] = now + 7 * DAY; if (note) j.fu[k + 'Note'] = note; }
  else j.fu[k] = { at: now, by, res: c.res, note };
  db.save(); closeSheet(); render(); toast(c.res === 'later' ? t('fuLaterR') : t('fuSavedT'));
}
function fuMark(id, kind, snooze) {
  const j = jobById(id); if (!j) return; j.fu = j.fu || {};
  if (snooze) j.fu[kind + 'Snooze'] = Date.now() + 7 * DAY; else j.fu[kind] = { at: Date.now(), by: me().id };
  db.save(); toast(snooze ? t('fuSnoozedT') : t('fuDoneT')); render();
}
// car page: every visit of this car
function visitsCard(j) {
  const vs = visitsOf(j.car.plate); if (vs.length < 2) return '';
  const sup = me().role === 'supervisor';
  return `<section class="card visits"><div class="cm-h">${ic('history')}<b>${t('carHistory')}</b><span class="chip y num">${t('visitsN', vs.length)}</span></div>
    ${vs.slice().reverse().map((o, i) => { const row = `<span class="num">${fDate(o.createdAt)}</span><span>${o.services.map(k => nm(SVC[k])).join('، ')}</span>${o.id === j.id ? `<span class="chip">${t('thisVisit')}</span>` : ''}`;
      return o.id === j.id || sup ? `<div class="v-row ${o.id === j.id ? 'cur' : ''}">${row}</div>` : `<a class="v-row" href="#/job/${o.id}">${row}${ic('next', 'flip muted')}</a>`; }).join('')}</section>`;
}
// new-car page: the plate was seen before → show visits and offer to fill the car details
function plateHint() {
  const el = $('#plate-hint'); if (!el || !draft) return;
  const vs = visitsOf(draft.car.plate); if (!vs.length || plateKey(draft.car.plate).length < 3) { el.innerHTML = ''; return; }
  const last = vs[vs.length - 1];
  el.innerHTML = `<div class="plate-hint">${ic('history')}<div class="grow"><b>${t('seenBefore', vs.length)}</b><small class="muted">${t('lastVisit')}: ${fDate(last.createdAt)} · ${esc(carTitle(last))} · ${last.services.map(k => nm(SVC[k])).join('، ')}</small></div><button class="btn sm y" data-act="fill-car">${t('fillCar')}</button></div>`;
}
function fuAlertCheck() {
  if (!me() || (window.cloud && !cloud.linked)) return;
  const n = fuDue().length, day = new Date().toDateString(), key = 'ins_fu_alert_' + (me().id);
  if (!n) return; let last = null; try { last = localStorage.getItem(key); } catch { }
  if (last === day || seen.f === day) return; seen.f = day; try { localStorage.setItem(key, day); } catch { }
  alertUser(t('fuAlert', n), `<button class="btn sm g" data-act="fu-open">${ic('phone')}${t('fuOpen')}</button>`);
}

/* ---------------- job page ---------------- */
function viewJob(r) {
  const j = jobById(r.id), u = me();
  if (!j || (u.role === 'supervisor' && !supCanSeeJob(j))) return { title: t('job'), back: '#/floor', html: `<div class="empty">${t('noAccess')}</div>` };
  const ts = tasksOf(j.id), done = ts.filter(x => x.end), pct = ts.length ? Math.round(done.length / ts.length * 100) : 0;
  const span = carSpan(j.id);
  const groups = {}; ts.forEach(x => { const ids = wids(x); (ids.length ? ids : ['']).forEach(id => (groups[id] = groups[id] || []).push(x)); });
  const gRank = id => { const l = groups[id]; return l.some(x => x.start && !x.end && !x.pausedAt) ? 0 : l.some(x => x.start && !x.end) ? 1 : l.some(x => !x.end) ? 2 : 3; };
  const order = Object.keys(groups).sort((a, b) => (a === '') - (b === '') || gRank(a) - gRank(b));
  const by = userById(j.createdBy);
  const html = `<section class="card job-hero">
      <div><h2>${esc(carTitle(j))}</h2>
        <div class="chips" style="margin-bottom:12px">${j.car.plate ? `<span class="plate">${esc(j.car.plate)}</span>` : ''}${j.services.map(k => `<span class="chip y">${esc(nm(SVC[k]))}</span>`).join('')}<span class="chip ${j.status === 'open' ? '' : 'g'}">${t(j.status)}</span></div>
        <div class="facts">${j.car.color || j.car.newColor ? `<span>${ic('palette')}${esc(j.car.color || '—')}${j.car.newColor ? ` → <b>${esc(j.car.newColor)}</b>` : ''}</span>` : ''}${j.car.customer ? `<span>${ic('user')}${esc(j.car.customer)}</span>` : ''}${j.car.phone ? `<a href="tel:${esc(j.car.phone)}"><span>${ic('phone')}<span class="num" dir="ltr">${esc(j.car.phone)}</span></span></a>` : ''}
          <span>${ic('clock')}${fDT(j.createdAt)}</span>${by && u.role !== 'supervisor' ? `<span>${ic('user')}${t('createdBy')}: <b>${esc(un(by))}</b></span>` : ''}${span ? `<span title="${t('carTimeH')}">${ic('clock')}${t('carTime')}: <b class="num">${fDur(span)}</b></span>` : ''}</div>
        ${canEdit() && (isAdmin() || u.role !== 'supervisor' || supCanSeeJob(j)) ? `<button class="btn sm" style="margin-top:12px" data-act="edit-car" data-id="${j.id}">${ic('edit')}${t('editCar')}</button>` : ''}
        ${j.car.notes ? `<p class="muted" style="margin:12px 0 0;font-size:13.5px">${esc(j.car.notes)}</p>` : ''}</div>
      <div class="ring" style="--p:${pct}"><div><b class="num">${pct}%</b><small>${done.length}/${ts.length}</small></div></div>
    </section>
    ${visitsCard(j)}
    <div class="job-split">${carMap(j, ts)}
    <div class="plan-list">${order.map(wid => { const w = workerById(wid), list = groups[wid].sort((a, b) => (a.end ? 2 : a.start ? 0 : 1) - (b.end ? 2 : b.start ? 0 : 1));
      const wl = list.filter(x => x.end).reduce((a, x) => a + dur(x), 0);
      const allDone = list.every(x => x.end);
      return `<div class="task-group ${allDone ? 'all-done' : ''}"><div class="tg-h">${avatar(w || null, 'sm')}<b>${w ? esc(wn(w)) : t('unassigned')}</b>${allDone ? `<span class="chip g">${ic('check')}${t('wDone')}</span>` : ''}<span class="muted num" style="font-size:13px">${list.filter(x => x.end).length}/${list.length}${wl ? ' · ' + fDur(wl) : ''}</span></div>${list.map(x => taskRow(x, false, wid || null)).join('')}</div>`; }).join('')}</div></div>
    ${canEdit() ? `<div class="quick" style="margin-top:22px">
      ${j.status === 'open' ? `<button class="btn" data-act="add-task" data-id="${j.id}">${ic('plus')}${t('addTask')}</button><span style="flex:1"></span><button class="btn y" data-act="close-job" data-id="${j.id}">${ic('check')}${t('closeJob')}</button>`
        : isAdmin() || supCanSeeJob(j) ? `<button class="btn" data-act="reopen-job" data-id="${j.id}">${t('reopen')}</button>` : ''}
      ${isAdmin() ? `<button class="btn r" data-act="delete-job" data-id="${j.id}">${ic('trash')}${t('deleteJob')}</button>` : ''}</div>` : ''}`;
  return { title: esc(carTitle(j)), sub: j.car.plate ? esc(j.car.plate) : '', back: '#/floor', html, actions: isAdmin() ? `<button class="btn icon r" data-act="delete-job" data-id="${j.id}" title="${t('deleteJob')}">${ic('trash')}</button>` : '' };
}
/* ---------------- car map (top view, front at the top) ---------------- */
const CAR_SHAPES = {
  fbumper: 'M46 40 Q46 14 100 12 Q154 14 154 40 Z',
  hood: 'M52 44 H148 V118 H52 Z',
  fender_l: 'M30 52 Q32 44 48 44 V118 H30 Z', fender_r: 'M170 52 Q168 44 152 44 V118 H170 Z',
  mirror_l: 'M12 132 H29 V146 H12 Z', mirror_r: 'M171 132 H188 V146 H171 Z',
  windshield: 'M56 122 H144 L136 150 H64 Z',
  door_fl: 'M30 122 H48 V194 H30 Z', door_fr: 'M152 122 H170 V194 H152 Z',
  door_rl: 'M30 197 H48 V264 H30 Z', door_rr: 'M152 197 H170 V264 H152 Z',
  win_fl: 'M51 124 H58 V194 H51 Z', win_fr: 'M142 124 H149 V194 H142 Z',
  win_rl: 'M51 197 H58 V262 H51 Z', win_rr: 'M142 197 H149 V262 H142 Z',
  roof: 'M62 153 H138 V262 H62 Z', sunroof: 'M80 168 H120 V200 H80 Z',
  rear_glass: 'M64 265 H136 L144 290 H56 Z',
  quarter_l: 'M30 268 H48 V350 H34 Q30 346 30 338 Z', quarter_r: 'M170 268 H152 V350 H166 Q170 346 170 338 Z',
  trunk: 'M52 293 H148 V350 H52 Z',
  rbumper: 'M46 354 H154 Q154 384 100 386 Q46 384 46 354 Z',
};
const partState = list => !list.length ? 'none' : list.some(x => x.start && !x.end && !x.pausedAt) ? 'run' : list.some(x => x.start && !x.end) ? 'pause' : list.some(x => !x.end) ? 'wait' : 'done';
function carMap(j, ts) {
  const byPart = {}; ts.forEach(x => (byPart[x.part] = byPart[x.part] || []).push(x));
  const shape = k => { const list = byPart[k] || [], st = partState(list), n = new Set(list.flatMap(wids)).size;
    return `<path d="${CAR_SHAPES[k]}" class="cm-p ${st}" ${list.length ? `data-act="part-sheet" data-job="${j.id}" data-part="${k}"` : ''}><title>${esc(nm(PARTS[k]))}${n ? ' · ' + n : ''}</title></path>`; };
  const order = ['fbumper', 'hood', 'fender_l', 'fender_r', 'mirror_l', 'mirror_r', 'door_fl', 'door_fr', 'door_rl', 'door_rr', 'quarter_l', 'quarter_r', 'trunk', 'rbumper', 'windshield', 'win_fl', 'win_fr', 'win_rl', 'win_rr', 'rear_glass', 'roof', 'sunroof'];
  const extra = Object.keys(byPart).filter(k => !CAR_SHAPES[k]);
  const lg = st => `<span class="cm-lg"><i class="${st}"></i>${t({ wait: 'sWait', run: 'sRun', pause: 'sPause', done: 'sDone' }[st])}</span>`;
  return `<section class="card car-map"><div class="cm-h">${ic('car')}<b>${t('carMap')}</b></div><small class="muted">${t('carMapHint')}</small>
    <svg viewBox="0 0 200 400" dir="ltr" class="cm-svg"><rect x="28" y="20" width="144" height="356" rx="40" class="cm-body"/>${order.map(shape).join('')}
      <text x="100" y="8" class="cm-dir">▲</text></svg>
    ${extra.length ? `<div class="cm-extra"><small class="muted">${t('otherParts')}</small>${extra.map(k => `<button class="cm-chip ${partState(byPart[k])}" data-act="part-sheet" data-job="${j.id}" data-part="${k}">${esc(nm(PARTS[k]))}</button>`).join('')}</div>` : ''}
    <div class="cm-legend">${['run', 'pause', 'wait', 'done'].map(lg).join('')}</div></section>`;
}
function partSheet(jobId, part) {
  const j = jobById(jobId); if (!j) return;
  const list = S.tasks.filter(x => x.jobId === jobId && x.part === part), st = partState(list);
  const edit = canEdit() && (isAdmin() || supCanSeeJob(j));
  const nRun = list.filter(x => x.start && !x.end && !x.pausedAt).length, nPz = list.filter(x => x.start && !x.end && x.pausedAt).length, nWait = list.filter(x => !x.start).length;
  const btns = edit ? [nWait && j.status === 'open' ? `<button class="btn g" data-act="part-start" data-job="${jobId}" data-part="${part}">${ic('play')}${t('partStartAll')}</button>` : '',
    nRun ? `<button class="btn amber" data-act="part-pause" data-job="${jobId}" data-part="${part}">${ic('pause')}${t('partPauseAll')}</button>` : '',
    nPz ? `<button class="btn g" data-act="part-resume" data-job="${jobId}" data-part="${part}">${ic('play')}${t('partResumeAll')}</button>` : '',
    nRun + nPz ? `<button class="btn r" data-act="part-finish" data-job="${jobId}" data-part="${part}">${ic('stop')}${t('partDoneAll')}</button>` : ''].join('') : '';
  const rows = list.length ? list.map(x => { const ws = wids(x).map(workerById).filter(Boolean);
    return `<div class="pt-row"><div class="pt-w">${ws.length ? ws.map(w => avatar(w, 'sm')).join('') : avatar(null, 'sm')}<b>${ws.length ? ws.map(w => esc(wn(w))).join('، ') : t('unassigned')}</b></div>${taskRow(x, false, wids(x)[0] || null)}</div>`; }).join('') : `<div class="empty">${t('partEmpty')}</div>`;
  openSheet(`<div class="sheet-h"><h3>${esc(nm(PARTS[part]))}<br><small class="muted" style="font-weight:400;font-size:13px">${esc(carTitle(j))} · <span class="cm-st ${st}">${t({ wait: 'sWait', run: 'sRun', pause: 'sPause', done: 'sDone', none: 'sWait' }[st])}</span></small></h3><button class="btn icon ghost" data-act="close-sheet">${ic('x')}</button></div>
    ${btns ? `<div class="pt-btns">${btns}</div>` : ''}${rows}`);
  const sh = $('.sheet'); sh.dataset.part = part; sh.dataset.job = jobId;
  tick();
}
function partAll(jobId, part, op) {
  const list = S.tasks.filter(x => x.jobId === jobId && x.part === part && !x.end); let n = 0;
  if (op === 'finish') {
    const go = list.filter(x => x.start); if (!go.length) return;
    const ws = new Set(go.flatMap(wids)).size;
    if (!confirmBox(t('partFinishQ', nm(PARTS[part]), ws || go.length))) return;
    go.forEach(x => { endTask(x); n++; }); db.save(); toast(t('finished')); return refresh();
  }
  if (op === 'start') {
    const go = list.filter(x => !x.start);
    const busy = [...new Set(go.flatMap(wids))].filter(w => runningOf(w)).map(w => wn(workerById(w))).filter(Boolean);
    if (busy.length && !confirmBox(t('alreadyRunning', busy.join('، ')))) return;
    const now = Date.now(); go.forEach(x => { x.start = now; n++; });
  }
  if (op === 'pause') list.forEach(x => { if (x.start && !x.pausedAt) { pauseTask(x, true); n++; } });
  if (op === 'resume') list.forEach(x => { if (x.pausedAt) { resumeTask(x, true); n++; } });
  if (!n) return; db.save(); toast(t(op === 'pause' ? 'pausedToast' : 'started')); refresh();
}

function editTaskSheet(id, isNew = false, jobId = null) {
  const x = isNew ? { id: null, jobId, service: jobById(jobId).services[0], part: '', workerIds: [], filmId: '', shade: '', start: null, end: null, rework: false } : S.tasks.find(t => t.id === id);
  if (!x) return;
  const cur = isNew ? wids(x) : [...new Set(mates(x).flatMap(wids))], team = SVC_TEAM(x.service), workers = S.workers.filter(w => (w.active && inTeam(w, team)) || cur.includes(w.id));
  const films = S.films.filter(f => (f.active || f.id === x.filmId) && ['ppf', 'tint'].includes(f.type));
  openSheet(`<form data-form="task" data-id="${x.id || ''}" data-job="${x.jobId}">
    <div class="sheet-h"><h3>${isNew ? t('addTask') : t('editTask')}</h3><button type="button" class="btn icon ghost" data-act="close-sheet">${ic('x')}</button></div>
    <div class="grid">
      <div class="form-grid">
        <div class="field"><label>${t('service')}</label><select class="inp" name="service" data-act-change="task-svc">${SERVICES.map(s => `<option value="${s.k}" ${x.service === s.k ? 'selected' : ''}>${esc(nm(s))}</option>`).join('')}</select></div>
        <div class="field" id="kind-field" style="${hasKind(x.service) ? '' : 'display:none'}"><label>${t(SVC[x.service].g === 'pol' ? 'polWhat' : 'replWhat')}</label><select class="inp" name="kind" data-act-change="task-kind">${(KINDS[SVC[x.service].g] || []).map(k => `<option value="${k}" ${(x.kind || KIND_DEF[SVC[x.service].g]) === k ? 'selected' : ''}>${kindLabel(k)}</option>`).join('')}</select></div>
        <div class="field"><label>${t('part')}</label><select class="inp" name="part" id="task-part">${poolOf(x.service, x.kind).map(p => `<option value="${p}" ${x.part === p ? 'selected' : ''}>${esc(nm(PARTS[p]))}</option>`).join('')}</select></div>
      </div>
      <div class="form-grid" id="tint-fields" style="${needFilm(x.service) ? '' : 'display:none'}">
        <div class="field"><label>${t('film')}</label>${filmSel(x.filmId || '', 'name="filmId"', films).replace('inp sm', 'inp')}</div>
        <div class="field" id="shade-field" style="${needShade(x.service, x.kind) ? '' : 'display:none'}"><label>${t('shade')}</label>${shadeSel(x.shade || '', 'name="shade"').replace('inp sm', 'inp')}</div>
      </div>
      <div class="field"><label>${t('workersMany')}</label><input type="hidden" name="workerIds" value="${cur.join(',')}">
        <div class="pick-grid" id="task-picks">${workers.map(w => `<button type="button" class="pick ${cur.includes(w.id) ? 'on' : ''}" data-act="pick-task-worker" data-id="${w.id}">${avatar(w)}<span>${esc(wn(w))}</span></button>`).join('')}</div></div>
      ${isNew ? '' : `<div class="time-box"><div class="time-h">${ic('clock')}<b>${t('timeSec')}</b><small>${t('timeHint')}</small></div><div class="form-grid three">
        <div class="field"><label>${t('startTime')}</label><input class="inp num" type="datetime-local" name="start" value="${toLocalInput(x.start)}" data-act-change="task-time"></div>
        <div class="field"><label>${t('endTime')}</label><input class="inp num" type="datetime-local" name="end" value="${toLocalInput(x.end)}" data-act-change="task-time"></div>
        <div class="field"><label>${t('pauseMin')}</label><input class="inp num" type="number" min="0" step="5" name="pauseMin" value="${Math.round((x.paused || 0) / 60000)}" data-act-change="task-time"></div></div>
        <div class="net">${t('netDur')}: <b class="num" id="net-dur">${x.start ? fDur(dur(x)) : '—'}</b></div>
        ${me().role !== 'supervisor' && (x.editLog || []).length ? `<div class="elog"><small>${t('editLog')}</small>${x.editLog.map(l => { const u = userById(l.by), f = (a, b) => a ? fDate(a) + ' ' + fTime(a) + (b ? '–' + fTime(b) : '') : t('none'); return `<div>✎ <b>${esc(u ? un(u) : '?')}</b> · <span class="num">${fDate(l.at)} ${fTime(l.at)}</span> — ${t('was')}: <span class="num">${f(l.from.s, l.from.e)}</span> → <span class="num">${f(l.to.s, l.to.e)}</span></div>`; }).join('')}</div>` : ''}</div>
      <label class="toggle"><input type="checkbox" name="rework" ${x.rework ? 'checked' : ''}><span class="sw"></span>${t('rework')}</label>`}
    </div>
    <div class="foot">${isNew ? '' : `<button type="button" class="btn r" data-act="delete-task" data-id="${x.id}">${ic('trash')}${t('delete')}</button>`}<span class="grow"></span>
      <button type="button" class="btn ghost" data-act="close-sheet">${t('cancel')}</button><button class="btn y">${t('save')}</button></div></form>`);
}
function saveTaskForm(form) {
  const fd = new FormData(form), id = form.dataset.id, jobId = form.dataset.job;
  const val = k => fd.get(k), ts = k => val(k) ? new Date(val(k)).getTime() : null;
  const kind = hasKind(val('service')) ? (val('kind') || KIND_DEF[SVC[val('service')].g]) : undefined, tint = needFilm(val('service'));
  const base = { service: val('service'), kind, part: val('part'), workerIds: (val('workerIds') || '').split(',').filter(Boolean), filmId: tint ? val('filmId') || '' : '', shade: needShade(val('service'), kind) ? val('shade') || '' : '' };
  if (!id) {
    const ws = base.workerIds, grp = ws.length > 1 ? uid() : null;
    (ws.length ? ws : [null]).forEach((w, i) => S.tasks.push({ id: (grp || uid()) + (grp ? '_' + i : ''), jobId, ...base, workerIds: w ? [w] : [], ...(grp ? { grp, share: ws.length } : {}), start: null, end: null, rework: false }));
    const j = jobById(jobId); if (!j.services.includes(base.service)) j.services.push(base.service);
  } else {
    const x = S.tasks.find(t => t.id === id), ns = ts('start'), ne = ts('end'), np = Math.max(0, Math.round(+val('pauseMin') || 0)) * 60000;
    if (ne && !ns) return toast(t('noStartEnd'));
    if (ns && ne && ne <= ns) return toast(LANG === 'ar' ? 'وقت الانتهاء قبل البدء' : 'End is before start');
    if (ns && np && np >= (ne || Date.now()) - ns) return toast(t('pauseTooLong'));
    // the form only has minutes: an untouched field keeps its exact original value (no fake "edited" flag)
    const same = (a, v) => (a ? toLocalInput(a) : '') === (v || '');
    const ns2 = same(x.start, val('start')) ? x.start || null : ns, ne2 = same(x.end, val('end')) ? x.end || null : ne, np2 = Math.round((x.paused || 0) / 60000) * 60000 === np ? x.paused || 0 : np;
    return saveTaskTimes(x, ns2, ne2, np2, base, !!fd.get('rework'));
  }
  db.save(); closeSheet(); render();
}
function saveTaskTimes(x, ns, ne, np, base, rework) {
  {
    const changed = (x.start || null) !== ns || (x.end || null) !== ne || (x.paused || 0) !== np;
    if (changed) {
      (x.editLog = x.editLog || []).push({ by: me().id, at: Date.now(), from: { s: x.start || null, e: x.end || null, p: x.paused || 0 }, to: { s: ns, e: ns ? ne : null, p: ns ? np : 0 } });
      if (!x.start && ns) x.manual = true; x.edited = true;
      if (!ns) { x.paused = 0; x.pausedAt = null; } else { x.paused = np; if (ne || (x.pausedAt && x.pausedAt <= ns)) x.pausedAt = null; }
    }
    delete x.workerId;
    const want = base.workerIds, shared = { service: base.service, kind: base.kind, part: base.part, filmId: base.filmId, shade: base.shade };
    Object.assign(x, shared, { start: ns, end: ns ? ne : null, rework });
    // team of this panel: keep, add (own task, own timer) or remove workers
    if (want.length) {
      let team = mates(x); const has = w => team.find(m => wids(m)[0] === w);
      if (!want.includes(wids(x)[0])) { const free = want.find(w => !has(w) || has(w) === x); if (free) x.workerIds = [free]; else { S.tasks = S.tasks.filter(t => t.id !== x.id); team = team.filter(m => m !== x); } }
      team = team.filter(m => S.tasks.includes(m));
      team.filter(m => m !== x && !want.includes(wids(m)[0])).forEach(m => { S.tasks = S.tasks.filter(t => t.id !== m.id); });
      team = team.filter(m => S.tasks.includes(m));
      const grp = x.grp || team.find(m => m.grp)?.grp || uid();
      want.filter(w => !team.some(m => wids(m)[0] === w)).forEach((w, i) => { const n = { id: grp + '_' + uid().slice(-4) + i, jobId: x.jobId, ...shared, workerIds: [w], start: null, end: null, rework: false }; S.tasks.splice(S.tasks.indexOf(team.at(-1) || x) + 1, 0, n); team.push(n); });
      team.forEach(m => { Object.assign(m, shared); if (team.length > 1) { m.grp = grp; m.share = team.length; } else { delete m.grp; delete m.share; } });
    } else x.workerIds = [];
  }
  db.save(); closeSheet(); render();
}

/* ---------------- analytics ---------------- */
let P = { mode: 'week', ref: Date.now() };
function periodRange(p = P) {
  if (p.mode === 'week') { const d = new Date(p.ref); d.setHours(0, 0, 0, 0); const from = addDays(d.getTime(), -((d.getDay() + 1) % 7)); return { from, to: addDays(from, 6) }; }
  const d = new Date(p.ref); const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(); return { from, to };
}
function periodLabel(p = P) {
  const { from, to } = periodRange(p);
  if (p.mode === 'month') return new Date(from).toLocaleDateString(loc(), { month: 'long', year: 'numeric' });
  const o = { day: 'numeric', month: 'short' };
  return new Date(from).toLocaleDateString(loc(), o) + ' – ' + new Date(addDays(to, -1)).toLocaleDateString(loc(), o);
}
// time one service took on one car: from the first worker's start to the last worker's end (overlaps counted once),
// minus breaks / after-hours when nobody could be working — not the sum of every worker's timer
function offHours(a, b) { const st = S.settings, hm = (d, v, def) => { const [h, m] = (v || def).split(':').map(Number); return d + (h * 60 + m) * 60000; }; let off = 0;
  for (let d = startOfDay(a); d < b; d = addDays(d, 1)) { const segs = [[d, hm(d, st.shiftStart, '09:00')], [hm(d, st.breakStart, '12:00'), hm(d, st.breakEnd, '16:00')], [hm(d, st.shiftEnd, '21:00'), addDays(d, 1)]];
    segs.forEach(([x, y]) => { off += Math.max(0, Math.min(b, y) - Math.max(a, x)); }); } return off; }
function svcSpan(ts) { const iv = ts.map(x => [x.start, x.end]).sort((a, b) => a[0] - b[0]); let tot = 0, cs = null, ce = null;
  iv.forEach(([a, b]) => { if (cs === null || a > ce) { if (cs !== null) tot += ce - cs - offHours(cs, ce); cs = a; ce = b; } else ce = Math.max(ce, b); });
  if (cs !== null) tot += ce - cs - offHours(cs, ce); return Math.max(tot, ...ts.map(dur)); }
function svcTimes(from, to) { const out = {};
  S.jobs.forEach(j => j.services.forEach(k => { const ts = S.tasks.filter(x => x.jobId === j.id && x.service === k && !x.cancelled); if (!ts.length || ts.some(x => !x.end || !x.start)) return;
    const st = Math.min(...ts.map(x => x.start)); if (st < from || st >= to) return; const o = out[k] = out[k] || { k, cars: [] };
    o.cars.push({ jobId: j.id, d: svcSpan(ts), crew: [...new Set(ts.flatMap(wids))], n: ts.length }); }));
  return SERVICES.filter(s => out[s.k]).map(s => { const o = out[s.k], ds = o.cars.map(c => c.d); o.cars.sort((a, b) => a.d - b.d); return { ...o, n: ds.length, avg: ds.reduce((a, b) => a + b, 0) / ds.length, min: Math.min(...ds), max: Math.max(...ds) }; }); }
function workdaysIn(from, to) { let n = 0; const end = Math.min(to, startOfDay(Date.now()) + DAY); for (let d = from; d < end; d = addDays(d, 1)) if (new Date(d).getDay() !== 5) n++; return n; }
const EFF_K = 1.5 * 3600000;
function analyze(from, to) {
  const tasks = S.tasks.filter(x => x.start && x.end && dur(x) > 0 && x.start >= from && x.start < to);
  // team baseline: median duration per (service group, panel) using all history — stable reference
  // a shared panel is ONE team result: every worker on it gets the team's average time, so the same work gives the same score
  const gT = {}; S.tasks.forEach(x => { if (x.grp && x.start && x.end && dur(x) > 0) { const g = gT[x.grp] = gT[x.grp] || { s: 0, n: 0 }; g.s += dur(x); g.n++; } });
  const tDur = x => x.grp && gT[x.grp] ? gT[x.grp].s / gT[x.grp].n : dur(x);
  const hist = {}, seenG = new Set(); S.tasks.forEach(x => { if (!(x.start && x.end && dur(x) > 0)) return; if (x.grp) { if (seenG.has(x.grp)) return; seenG.add(x.grp); } (hist[svcGroupKey(x)] = hist[svcGroupKey(x)] || []).push(tDur(x) * shareOf(x)); });
  const base = {}; for (const k in hist) base[k] = median(hist[k]);
  const jobsIn = S.jobs.filter(j => j.createdAt >= from && j.createdAt < to);
  const W = {};
  tasks.forEach(x => {
    const ids = wids(x).filter(workerById); if (!ids.length) return;
    const d = tDur(x), n = Math.max(ids.length, x.share || 1), k = svcGroupKey(x);
    ids.forEach(id => {
      const w = W[id] = W[id] || { id, tasks: 0, points: 0, solo: 0, shared: 0, cars: new Set(), actual: 0, expected: 0, rework: 0, parts: {}, days: {} };
      w.tasks += 1 / n; w.points += ptsOf(x) / n; n > 1 ? w.shared++ : w.solo++; w.cars.add(x.jobId); w.actual += d; w.expected += base[k] ? base[k] / n : d; if (x.rework) w.rework++; if (x.edited) w.edited = (w.edited || 0) + 1;
      (w.parts[k] = w.parts[k] || []).push(d * n);
      const dk = startOfDay(x.start); w.days[dk] = (w.days[dk] || 0) + d;
    });
  });
  const wd = workdaysIn(from, to), shift = (+S.settings.shiftHours || 9) * 3600000;
  if (Object.keys(W).length) S.workers.filter(w => w.active && !W[w.id]).forEach(w => { W[w.id] = { id: w.id, tasks: 0, points: 0, solo: 0, shared: 0, cars: new Set(), actual: 0, expected: 0, rework: 0, parts: {}, days: {}, none: true }; });
  const list = Object.values(W).filter(w => workerById(w.id));
  const TK = Object.keys(TEAMS), maxPt = {};
  list.forEach(w => { w.team = teamOf(workerById(w.id)); maxPt[w.team] = Math.max(maxPt[w.team] || 1, w.points); });
  list.forEach(w => { const maxPts = maxPt[w.team];
    // few panels = little evidence: efficiency is pulled toward 100% until there is enough work (EFF_K of normal time), so one timer can't decide the ranking
    w.effRaw = w.actual ? w.expected / w.actual * 100 : 0;
    w.eff = w.actual ? (w.expected + EFF_K) / (w.actual + EFF_K) * 100 : 0;
    w.util = wd ? w.actual / (wd * shift) * 100 : 0;
    w.vol = w.points / maxPts * 100;
    w.score = Math.round(clamp(.55 * w.vol + .45 * (Math.min(w.eff, 150) / 150 * 100) - 4 * w.rework, 0, 100));
    w.carsN = w.cars.size; w.avgCar = w.carsN ? w.actual / w.carsN : 0;
  });
  list.sort((a, b) => TK.indexOf(a.team) - TK.indexOf(b.team) || (a.none - b.none) || b.score - a.score || b.points - a.points);
  const teams = TK.map(k => [k, list.filter(w => w.team === k)]).filter(([, l]) => l.length);
  // equal score = equal rank (two workers on the same panels get the same place); nothing finished yet = no rank
  teams.forEach(([, l]) => { const ranked = l.filter(w => !w.none); l.forEach(w => { w.of = ranked.length; w.rank = w.none ? '—' : 1 + ranked.filter(o => o.score > w.score).length; });
    const enough = ranked.length > 3 && ranked.reduce((a, w) => a + w.tasks, 0) / ranked.length >= 3; // red marks only once everyone has ~3+ panels
    const lowCut = enough ? ranked[ranked.length - 3].score : -1; ranked.forEach(w => { w.low = w.score <= lowCut && w.rank > 3; }); });
  // KPIs
  const labor = tasks.reduce((a, x) => a + lab(x), 0);
  const carsWithWork = new Set(tasks.map(x => x.jobId));
  const closed = jobsIn.filter(j => j.closedAt);
  const kpi = {
    cars: jobsIn.length, tasks: Math.round(tasks.reduce((a, x) => a + 1 / Math.max(1, x.share || 1), 0)), labor,
    svcT: svcTimes(from, to), get avgCar() { return (this.svcT.find(o => o.k === 'full_ppf') || {}).avg || 0; }, avgCarN: 0,
    turn: closed.length ? closed.reduce((a, j) => a + j.closedAt - j.createdAt, 0) / closed.length : 0,
    rework: tasks.length ? tasks.filter(x => x.rework).length / tasks.length * 100 : 0,
  };
  // daily
  const daily = [];
  for (let d = from; d < to; d = addDays(d, 1)) { if (new Date(d).getDay() === 5) continue; const e = addDays(d, 1); daily.push({ d, labor: tasks.filter(x => x.start >= d && x.start < e).reduce((a, x) => a + lab(x), 0), cars: jobsIn.filter(j => j.createdAt >= d && j.createdAt < e).length }); }
  // services
  const svc = {}; jobsIn.forEach(j => j.services.forEach(k => svc[k] = (svc[k] || 0) + 1));
  // panel times (this period)
  const pt = {}; tasks.forEach(x => { const k = svcGroupKey(x); const o = pt[k] = pt[k] || { k, service: x.service, part: x.part, ds: [], best: null }; const d = lab(x); o.ds.push(d); if (!o.best || d < o.best.d) o.best = { d, w: wids(x)[0] }; });
  const parts = Object.values(pt).map(o => ({ ...o, avg: o.ds.reduce((a, b) => a + b, 0) / o.ds.length, n: o.ds.length })).sort((a, b) => b.n - a.n);
  return { from, to, tasks, jobs: jobsIn, kpi, workers: list, daily, svc, parts, base, wd , teams };
}
const GROUP_NAME = { ppf: { ar: 'حماية', en: 'PPF' }, wrap: { ar: 'تغيير لون', en: 'Wrap' }, tint: { ar: 'عازل', en: 'Tint' }, pol: { ar: 'بوليش', en: 'Polish' }, pol_ext: { ar: 'بوليش خارجي', en: 'Exterior polish' }, pol_int: { ar: 'بوليش داخلي', en: 'Interior polish' }, pol_both: { ar: 'بوليش داخلي وخارجي', en: 'Interior + exterior polish' }, ppfq: { ar: 'ربع حماية', en: 'Quarter PPF' }, jam: { ar: 'تركيب الجامة', en: 'Windshield install' }, jamx: { ar: 'نزع الجامة', en: 'Windshield removal' }, rep_ppf: { ar: 'تغيير قطع حماية', en: 'Replace PPF' }, rep_tint: { ar: 'تغيير قطع عازل', en: 'Replace tint' }, cer: { ar: 'سيراميك', en: 'Ceramic' } };
const partLabel = k => { const [g, p] = k.split(':'); return nm(PARTS[p]) + ' · ' + nm(GROUP_NAME[g]); };

/* ---------------- dashboard ---------------- */
function periodBar(extra = '') {
  return `<div class="period"><div class="nav"><div class="seg"><button class="${P.mode === 'week' ? 'on' : ''}" data-act="pmode" data-m="week">${t('week')}</button><button class="${P.mode === 'month' ? 'on' : ''}" data-act="pmode" data-m="month">${t('month')}</button></div>
    <button class="btn icon sm" data-act="pnav" data-d="-1">${ic('back', 'flip')}</button><span class="lbl num">${periodLabel()}</span><button class="btn icon sm" data-act="pnav" data-d="1">${ic('next', 'flip')}</button></div>${extra}</div>`;
}
// part of today's shift not worked yet (so a running week/month isn't compared as if today were over)
function todayLeft(from, to) {
  const now = Date.now(), d0 = startOfDay(now); if (d0 < from || d0 >= to || new Date(now).getDay() === 5) return 0;
  const B = brk(), open = B.open, shift = Math.max(3600000, (B.b0 - open) + (B.end - B.b1));
  const worked = Math.max(0, Math.min(now, B.b0) - open) + Math.max(0, Math.min(now, B.end) - B.b1);
  return 1 - clamp(worked / shift, .1, 1);
}
/* ---------- progress over time (this vs previous, 6-period trend) ---------- */
let CMP = null;
function shiftRef(mode, ref, n) { const d = new Date(ref); if (mode === 'week') return addDays(ref, 7 * n); return new Date(d.getFullYear(), d.getMonth() + n, 15).getTime(); }
function progressData(mode = CMP || P.mode, ref = P.ref, N = 6) {
  const per = [];
  for (let i = N - 1; i >= 0; i--) { const p = { mode, ref: shiftRef(mode, ref, -i) }, { from, to } = periodRange(p), A = analyze(from, to), wd = Math.max(.25, workdaysIn(from, to) - todayLeft(from, to));
    const m = {}; A.workers.forEach(w => { if (!w.none) m[w.id] = { rate: w.points / wd, eff: w.eff, score: w.score }; }); per.push({ p, m, live: Date.now() >= from && Date.now() < to }); }
  const cur = per[N - 1], prev = per[N - 2];
  const rows = S.workers.filter(w => w.active || per.some(x => x.m[w.id])).map(w => ({ w, team: teamOf(w), cur: cur.m[w.id], prev: prev.m[w.id], trend: per.map(x => x.m[w.id] ? x.m[w.id].rate : 0) }));
  return { per, cur, prev, rows, mode };
}
const delta = (a, b) => { if (!b && !a) return `<span class="muted">—</span>`; if (!b) return `<span class="chip g" style="padding:0 7px">${t('new')}</span>`; const d = (a - b) / b * 100; return `<b class="num ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(d))}%</b>`; };
function spark(v) { const mx = Math.max(...v, .001), W = 84, H = 26, st = W / (v.length - 1); const pts = v.map((y, i) => [i * st, H - 3 - y / mx * (H - 6)]);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><polyline points="${pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="var(--yellow)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="3" fill="var(--yellow)"/></svg>`; }
function progressCard() {
  const D = progressData(), mode = D.mode, lp = x => periodLabel(x.p), f1 = v => v ? v.toFixed(1) : '0';
  const table = rows => `<div class="tbl-wrap"><table class="tbl prog"><thead><tr><th>${t('worker')}</th><th>${t('ptsDay')}<br><small>${lp(D.prev)}</small></th><th>${t('ptsDay')}<br><small>${lp(D.cur)}${D.cur.live ? ' · ' + t('soFar') : ''}</small></th><th>${t('change')}</th><th class="xm">${t('eff')}<br><small>${t('prevShort')} → ${t('curShort')}</small></th><th class="xm">${t('trend6')}</th></tr></thead><tbody>
    ${rows.sort((a, b) => (b.cur?.rate || 0) - (a.cur?.rate || 0)).map(r => `<tr class="click" data-act="goto" data-h="#/worker/${r.w.id}"><td><span style="display:inline-flex;align-items:center;gap:8px">${avatar(r.w, 'sm')}${esc(wn(r.w))}</span></td><td class="num muted">${f1(r.prev?.rate)}</td><td class="num"><b>${f1(r.cur?.rate)}</b></td><td>${delta(r.cur?.rate || 0, r.prev?.rate || 0)}</td><td class="num xm">${r.prev ? Math.round(r.prev.eff) + '%' : '—'} → <b class="${r.cur && r.prev ? (r.cur.eff >= r.prev.eff ? 'up' : 'down') : ''}">${r.cur ? Math.round(r.cur.eff) + '%' : '—'}</b></td><td class="xm">${spark(r.trend)}</td></tr>`).join('')}
    </tbody></table></div>`;
  const avg = (rows, k) => { const v = rows.map(r => r[k]?.rate).filter(Boolean); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
  return `<section class="card" style="margin-top:16px"><h2>${ic('chart')}${t('progress')}<span class="grow"></span><span class="seg sm"><button class="${mode === 'week' ? 'on' : ''}" data-act="cmp-mode" data-m="week">${t('weekVs')}</button><button class="${mode === 'month' ? 'on' : ''}" data-act="cmp-mode" data-m="month">${t('monthVs')}</button></span></h2>
    <p class="muted" style="font-size:12.5px;margin:0 0 12px">${t('progressHint')}</p>
    ${byTeam(D.rows.map(r => r.w)).map(([tk]) => { const rows = D.rows.filter(r => r.team === tk), a1 = avg(rows, 'cur'), a0 = avg(rows, 'prev');
      return `<div class="team-h">${ic('users')}${esc(nm(TEAMS[tk]))}<span class="grow"></span><small class="muted">${t('teamRate')}: <span class="num">${f1(a0)} → <b>${f1(a1)}</b></span> ${delta(a1, a0)}</small></div>${table(rows)}`; }).join('')}
  </section>`;
}
function progressPDF() {
  const D = progressData(), f1 = v => v ? v.toFixed(1) : '0', dl = (a, b) => !b ? (a ? t('new') : '—') : ((a - b) / b * 100 >= 0 ? '+' : '−') + Math.abs(Math.round((a - b) / b * 100)) + '%';
  return `<h2>${t('progress')} — ${periodLabel(D.prev.p)} → ${periodLabel(D.cur.p)}</h2><table><thead><tr><th>${t('worker')}</th><th>${t('ptsDay')} (${t('prevShort')})</th><th>${t('ptsDay')} (${t('curShort')})</th><th>${t('change')}</th><th>${t('eff')}</th></tr></thead><tbody>
    ${byTeam(D.rows.map(r => r.w)).map(([tk]) => `<tr class="team"><td colspan="5">${esc(nm(TEAMS[tk]))}</td></tr>` + D.rows.filter(r => r.team === tk).sort((a, b) => (b.cur?.rate || 0) - (a.cur?.rate || 0)).map(r => { const up = (r.cur?.rate || 0) >= (r.prev?.rate || 0);
      return `<tr><td>${esc(wn(r.w))}</td><td>${f1(r.prev?.rate)}</td><td>${f1(r.cur?.rate)}</td><td style="color:${up ? '#0a7a45' : '#b3141f'};font-weight:700">${dl(r.cur?.rate || 0, r.prev?.rate || 0)}</td><td>${r.prev ? Math.round(r.prev.eff) + '%' : '—'} → ${r.cur ? Math.round(r.cur.eff) + '%' : '—'}</td></tr>`; }).join('')).join('')}</tbody></table>`;
}
function viewDashboard() {
  const { from, to } = periodRange(), A = analyze(from, to), k = A.kpi;
  const exports = `<div class="exports"><button class="btn sm" data-act="exp-pdf">${ic('file')}${t('pdf')}</button><button class="btn sm" data-act="exp-xls">${ic('table')}${t('excel')}</button>
    <button class="btn sm" data-act="exp-share">${ic('share')}${t('share')}</button><button class="btn sm" data-act="exp-wa">${ic('wa')}${t('whatsapp')}</button><button class="btn sm" data-act="exp-mail">${ic('mail')}${t('email')}</button></div>`;
  const maxL = Math.max(1, ...A.daily.map(d => d.labor)), today = startOfDay(Date.now());
  const svcTotal = Object.values(A.svc).reduce((a, b) => a + b, 0) || 1;
  const html = `${S.demo ? demoBanner() : ''}${periodBar(exports)}
    <div class="stats-row six">
      <div class="kpi hl"><small>${ic('car')}${t('kCars')}</small><b class="num">${k.cars}</b></div>
      <div class="kpi"><small>${ic('check')}${t('kTasks')}</small><b class="num">${k.tasks}</b></div>
      <div class="kpi"><small>${ic('clock')}${t('kHours')}</small><b class="num">${fHrs(k.labor)}<span>${LANG === 'ar' ? 'س' : 'h'}</span></b></div>
      <button class="kpi tap" data-act="avg-sheet"><small>${ic('shield')}${t('kAvgCar')}</small><b class="num">${k.avgCar ? fDur(k.avgCar) : '—'}</b><em class="kpi-more">${t('tapDetails')} ›</em></button>
      <div class="kpi"><small>${ic('history')}${t('kTurn')}</small><b class="num">${fDur(k.turn)}</b></div>
      <div class="kpi"><small>${ic('info')}${t('kRework')}</small><b class="num">${k.rework.toFixed(1)}<span>%</span></b></div>
    </div>
    <div class="sec-h">${ic('trophy')}${t('ranking')}</div>
    ${A.tasks.filter(x => x.edited).length ? `<div class="manual-note">✎ ${t('manualNote', A.tasks.filter(x => x.edited).length)}</div>` : ''}
    ${A.teams.length ? A.teams.map(([tk, l]) => `<div class="team-h">${ic('users')}${esc(nm(TEAMS[tk]))}<span class="count num">${l.length}</span></div><div class="lead">${leadHead()}${l.map(leadRow).join('')}</div>`).join('') : `<div class="empty">${t('noData')}</div>`}
    ${progressCard()}
    <div class="two-col" style="margin-top:16px">
      <section class="card"><h2>${ic('chart')}${t('daily')}</h2><div class="chart">${A.daily.map(d => `<div class="col ${d.d === today ? 'today' : ''}"><div class="b" style="height:${d.labor / maxL * 100}%"><span class="num">${d.labor ? fHrs(d.labor) : ''}</span></div><small>${P.mode === 'week' ? fDay(d.d) : new Date(d.d).getDate()}</small></div>`).join('')}</div></section>
      <section class="card"><h2>${ic('shield')}${t('svcMix')}</h2><div class="hbars">${SERVICES.filter(s => A.svc[s.k]).map(s => `<div class="hb"><span>${esc(nm(s))}</span><div class="bar"><i style="width:${A.svc[s.k] / svcTotal * 100}%"></i></div><b class="num">${A.svc[s.k]}</b></div>`).join('') || `<div class="muted">${t('noData')}</div>`}</div></section>
    </div>
    <section class="card" style="margin-top:16px"><h2>${ic('clock')}${t('partTimes')}</h2>
      ${A.parts.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('part')}</th><th>${t('count')}</th><th>${t('avg')}</th><th>${t('teamAvg')} *</th><th>${t('best')}</th></tr></thead><tbody>
      ${A.parts.map(o => { const bw = workerById(o.best.w); return `<tr><td>${esc(partLabel(o.k))}</td><td class="num">${o.n}</td><td class="num"><b>${fDur(o.avg)}</b></td><td class="num muted">${fDur(A.base[o.k])}</td><td><span style="display:inline-flex;align-items:center;gap:8px">${bw ? avatar(bw, 'sm') : ''}<span class="num">${fDur(o.best.d)}</span></span></td></tr>`; }).join('')}
      </tbody></table></div><p class="muted" style="font-size:12px;margin:10px 0 0">* ${LANG === 'ar' ? 'الوسيط لكل الفترات — يُستخدم كمرجع للكفاءة' : 'median over all time — used as the efficiency reference'}</p>` : `<div class="muted">${t('noData')}</div>`}</section>
    <details class="card" style="margin-top:16px"><summary>${ic('info')}${t('how')}</summary><p class="how">${t('howTxt')}</p></details>`;
  return { title: t('dashboard'), sub: S.settings.shop + ' · ' + t('saturdayToThursday'), html };
}
const leadHead = () => `<div class="l-row head"><span>#</span><span></span><span>${t('worker')}</span><span>${t('score')}</span><span>${t('cars')}</span><span>${t('hours')}</span><span class="xm">${t('eff')}</span><span class="xh xm">${t('util')}</span><span></span></div>`;
function leadRow(w) {
  const wk = workerById(w.id);
  return `<a class="l-row r${w.rank}${w.low ? ' low' : ''}" href="#/worker/${w.id}"><span class="rk num">${w.rank}</span>${avatar(wk)}
    <span class="nm"><b>${esc(wn(wk))}${runningOf(w.id) ? ` <span class="chip g live lr-live"><span class="dot"></span>${t('workingNow2')}</span>` : ''}${w.low ? ` <span class="chip r low-chip">▼ ${t('lowRank')}</span>` : ''}</b><small class="muted num">${w.none ? t(runningOf(w.id) || pausedOf(w.id) ? 'firstPart' : 'noWorkP') : w.team === 'polish' ? `${w.carsN} ${t('cars')} · ${fHrs(w.actual)} ${LANG === 'ar' ? 'س' : 'h'}` : `${fN(w.tasks)} ${t('tasks')} · ${fN(+w.points.toFixed(1))} ${t('pts')}`}${w.edited ? ` · <span class="edited" title="${t('manualT')}">✎ ${w.edited}</span>` : ''}</small></span>
    <span class="score"><b class="num" style="font-size:18px">${w.score}</b><span class="bar xm"><i style="width:${w.score}%"></i></span></span>
    <span class="c num">${w.carsN}</span><span class="c num">${fHrs(w.actual)}</span>
    <span class="c num xm ${w.eff >= 100 ? 'up' : 'down'}">${Math.round(w.eff)}%</span><span class="c num xh xm">${Math.round(w.util)}%</span>${ic('next', 'flip muted')}</a>`;
}

/* ---------------- worker detail ---------------- */
function viewWorker(r) {
  const wk = workerById(r.id); if (!wk) return { title: t('worker'), back: '#/dashboard', html: `<div class="empty">${t('noData')}</div>` };
  const { from, to } = periodRange(), A = analyze(from, to), w = A.workers.find(x => x.id === r.id);
  const myTasks = A.tasks.filter(x => wids(x).includes(r.id)).sort((a, b) => b.start - a.start);
  const daily = A.daily.map(d => ({ d: d.d, v: w ? (w.days[d.d] || 0) : 0 })), maxV = Math.max(1, ...daily.map(d => d.v));
  const html = `${periodBar()}
    <section class="card job-hero" style="margin-bottom:16px"><div style="display:flex;align-items:center;gap:18px">${avatar(wk, 'lg')}<div><h2 style="margin:0">${esc(wn(wk))}</h2>
      <div class="muted">${w && !w.none ? `${t('rank')} <b class="num" style="color:var(--yellow)">#${w.rank}</b> ${t('of')} <span class="num">${w.of}</span> · ${esc(nm(TEAMS[w.team]))}` : t('noData')}</div></div></div>
      <div class="ring" style="--p:${w ? w.score : 0}"><div><b class="num">${w ? w.score : 0}</b><small>${t('score')}</small></div></div></section>
    ${w ? `<div class="stats-row six">
      <div class="kpi"><small>${t('cars')}</small><b class="num">${w.carsN}</b></div><div class="kpi"><small>${t('kTasks')}</small><b class="num">${fN(w.tasks)}</b></div>
      <div class="kpi"><small>${t('kHours')}</small><b class="num">${fHrs(w.actual)}</b></div><div class="kpi"><small>${t('avgCar')}</small><b class="num">${fDur(w.avgCar)}</b></div>
      <div class="kpi"><small>${t('eff')}</small><b class="num ${w.eff >= 100 ? 'up' : 'down'}">${Math.round(w.eff)}<span>%</span></b></div><div class="kpi"><small>${t('util')}</small><b class="num">${Math.round(w.util)}<span>%</span></b></div>
    </div>
    <div class="two-col" style="margin-top:16px">
      <section class="card"><h2>${ic('clock')}${t('partTimes')}</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('part')}</th><th>${t('count')}</th><th>${t('mine')}</th><th>${t('teamAvg')}</th><th>${t('diff')}</th></tr></thead><tbody>
        ${Object.entries(w.parts).sort((a, b) => b[1].length - a[1].length).map(([k, ds]) => { const my = ds.reduce((a, b) => a + b, 0) / ds.length, tb = A.base[k], df = tb ? (my - tb) / tb * 100 : 0;
          return `<tr><td>${esc(partLabel(k))}</td><td class="num">${ds.length}</td><td class="num"><b>${fDur(my)}</b></td><td class="num muted">${fDur(tb)}</td><td class="num ${df <= 0 ? 'up' : 'down'}">${df > 0 ? '+' : ''}${Math.round(df)}%</td></tr>`; }).join('')}
      </tbody></table></div></section>
      <section class="card"><h2>${ic('chart')}${t('daily')}</h2><div class="chart">${daily.map(d => `<div class="col"><div class="b" style="height:${d.v / maxV * 100}%"><span class="num">${d.v ? fHrs(d.v) : ''}</span></div><small>${P.mode === 'week' ? fDay(d.d) : new Date(d.d).getDate()}</small></div>`).join('')}</div></section>
    </div>
    <section class="card" style="margin-top:16px"><h2>${ic('history')}${t('taskLog')}<span class="count num">${myTasks.length}</span></h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('date')}</th><th>${t('job')}</th><th>${t('part')}</th><th>${t('startTime')}</th><th>${t('laborTime')}</th></tr></thead><tbody>
      ${myTasks.map(x => { const j = jobById(x.jobId); return `<tr class="click" data-act="goto" data-h="#/job/${x.jobId}"><td class="num">${fDate(x.start)}</td><td>${esc(j ? carTitle(j) : '')}${j?.car.plate ? ` <span class="muted num">${esc(j.car.plate)}</span>` : ''}</td><td>${esc(nm(PARTS[x.part]))} <span class="muted">· ${esc(nm(SVC[x.service]))}</span>${x.rework ? ' <span class="chip r" style="padding:0 8px">!</span>' : ''} ${editFlag(x)}</td><td class="num">${fTime(x.start)}–${fTime(x.end)}</td><td class="num"><b>${fDur(dur(x))}</b></td></tr>`; }).join('')}
    </tbody></table></div></section>` : `<div class="empty">${t('noData')}</div>`}`;
  return { title: esc(wn(wk)), sub: t('worker'), back: '#/dashboard', html };
}

/* ---------------- history ---------------- */
let histQ = '';
function viewHistory() {
  const html = `<div class="search" style="margin-bottom:16px">${ic('search')}<input class="inp" id="hist-q" placeholder="${t('search')}" value="${esc(histQ)}"></div><div class="list" id="hist-list">${histList()}</div>`;
  return { title: t('history'), sub: S.jobs.length + ' ' + t('jobsList'), html };
}
function histList() {
  const q = histQ.trim().toLowerCase();
  const jobs = S.jobs.filter(j => !q || [j.car.make, j.car.model, j.car.plate, j.car.customer, j.car.phone, j.car.color].join(' ').toLowerCase().includes(q)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 300);
  if (!jobs.length) return `<div class="empty">${t('noJobs')}</div>`;
  return jobs.map(j => { const ts = tasksOf(j.id), done = ts.filter(x => x.end), labT = carSpan(j.id);
    return `<a class="l-item" href="#/job/${j.id}"><span class="av" style="--c:${j.status === 'open' ? '#FBBF15' : '#2FD896'}">${ic(j.status === 'open' ? 'clock' : 'check')}</span>
      <div class="grow"><b>${esc(carTitle(j))} ${j.car.plate ? `<span class="plate" style="margin-inline-start:6px">${esc(j.car.plate)}</span>` : ''}</b><small class="num">${fDT(j.createdAt)} · ${j.services.map(k => nm(SVC[k])).join('، ')}${userById(j.createdBy) ? ` · ${t('createdBy')}: <b>${esc(un(userById(j.createdBy)))}</b>` : ''}</small></div>
      <div style="text-align:end"><b class="num">${fDur(labT)}</b><br><small class="muted num">${done.length}/${ts.length}</small></div></a>`; }).join('');
}

/* ---------------- settings ---------------- */
let setTab = 'workers';
function viewSettings() {
  const tabs = ['workers', 'films', 'users', 'general', 'data'];
  let body = '';
  if (setTab === 'workers') body = `<div class="sec-h" style="margin-top:0">${t('workers')}<span class="count num">${S.workers.length}</span><span class="grow"></span><button class="btn sm y" data-act="edit-worker">${ic('plus')}${t('addWorker')}</button></div>
    ${byTeam(S.workers).map(([k, list]) => `<div class="sec-h" style="font-size:14px">${esc(nm(TEAMS[k]))}<span class="count num">${list.length}</span></div><div class="workers-grid">${list.map(w => `<button class="w-card" data-act="edit-worker" data-id="${w.id}" style="${w.active ? '' : 'opacity:.5'}">${avatar(w)}<div class="info"><b>${esc(wn(w))}</b><small>${w.active ? t('active') : t('inactive')}</small></div>${ic('edit')}</button>`).join('')}</div>`).join('')}`;
  if (setTab === 'films') body = Object.entries(FILM_TYPES).filter(([k]) => k === 'tint').map(([k, ft]) => `<div class="sec-h">${esc(nm(ft))}<span class="count num">${S.films.filter(f => f.type === k).length}</span><span class="grow"></span><button class="btn sm" data-act="edit-film" data-type="${k}">${ic('plus')}${t('addFilm')}</button></div>
    <div class="list">${S.films.filter(f => f.type === k).map(f => `<button class="l-item" data-act="edit-film" data-id="${f.id}" style="${f.active ? '' : 'opacity:.5'}"><div class="grow"><b>${esc(f.name)}</b><small>${f.active ? t('active') : t('inactive')}</small></div>${ic('edit')}</button>`).join('') || `<div class="muted">—</div>`}</div>`).join('');
  if (setTab === 'users') body = `<div class="sec-h" style="margin-top:0">${t('users')}<span class="grow"></span><button class="btn sm y" data-act="edit-user">${ic('plus')}${t('addUser')}</button></div>
    <div class="list">${S.users.map(u => `<button class="l-item" data-act="edit-user" data-id="${u.id}" style="${u.active ? '' : 'opacity:.5'}"><span class="av sm" style="--c:${u.role === 'admin' ? '#FBBF15' : u.role === 'manager' ? '#5FB4FF' : '#2FD896'}">${esc(initials(un(u)))}</span><div class="grow"><b>${esc(un(u))}</b><small>${esc(roleName(u))} · ${t(u.role === 'admin' ? 'roleAdminD' : u.role === 'manager' ? 'roleManagerD' : 'roleSupD')}</small></div>${u.active ? '' : `<span class="chip r">${t('inactive')}</span>`}${ic('edit')}</button>`).join('')}</div>`;
  if (setTab === 'general') { const st = S.settings, f = (k, key, type = 'text', ex = '') => `<div class="field"><label>${t(k)}</label><input class="inp" name="${key}" type="${type}" value="${esc(st[key] ?? '')}" ${ex}></div>`;
    body = `<form class="card" data-form="settings"><div class="form-grid">${f('shop', 'shop')}${f('waNum', 'wa', 'tel', 'placeholder="9745xxxxxxx" dir="ltr"')}${f('emailTo', 'email', 'email', 'dir="ltr"')}${f('shiftHours', 'shiftHours', 'number', 'min="1" max="16" step="0.5"')}${f('autoLock', 'autoLock', 'number', 'min="1" max="240"')}${f('shiftStart', 'shiftStart', 'time', 'dir="ltr"')}${f('shiftEnd', 'shiftEnd', 'time', 'dir="ltr"')}${f('breakStart', 'breakStart', 'time', 'dir="ltr"')}${f('breakEnd', 'breakEnd', 'time', 'dir="ltr"')}${f('otResume', 'otResume', 'time', 'dir="ltr"')}${f('breakWarn', 'breakWarn', 'number', 'min="1" max="30"')}</div>
      <div class="foot" style="display:flex;justify-content:flex-end;margin-top:18px"><button class="btn y">${ic('check')}${t('save')}</button></div></form>`; }
  if (setTab === 'data') body = `<div class="card"><div class="quick" style="margin:0">
      <button class="btn" data-act="backup">${ic('download')}${t('backup')}</button>
      <label class="btn">${ic('upload')}${t('restore')}<input type="file" accept="application/json" data-act-change="restore" hidden></label>
      ${S.demo ? `<button class="btn" data-act="clear-demo">${t('clearDemo')}</button>` : ''}<button class="btn" data-act="load-demo">${ic('chart')}${t('loadDemo')}</button>
      <span style="flex:1"></span><button class="btn r" data-act="reset-all">${ic('trash')}${t('resetAll')}</button></div>
      <p class="muted" style="font-size:13px;margin:16px 0 0">${LANG === 'ar' ? 'البيانات محفوظة على هذا الجهاز. نزّل نسخة احتياطية بشكل دوري.' : 'Data is stored on this device. Download a backup regularly.'}</p></div>`;
  const html = `<div class="seg set-tabs" style="flex-wrap:wrap">${tabs.map(k => `<button class="${setTab === k ? 'on' : ''}" data-act="set-tab" data-k="${k}">${t(k)}</button>`).join('')}</div>${body}`;
  return { title: t('settings'), html };
}
function editCarSheet(id) {
  const j = jobById(id); if (!j) return; const c = j.car, f = (k, type = 'text', extra = '') => `<div class="field"><label>${t(k)}</label><input class="inp" name="${k}" type="${type}" value="${esc(c[k] || '')}" ${extra}></div>`;
  openSheet(`<form data-form="car" data-id="${j.id}"><div class="sheet-h"><h3>${t('editCar')}</h3><button type="button" class="btn icon ghost" data-act="close-sheet">${ic('x')}</button></div>
    <div class="grid">${f('make', 'text', 'list="dl-makes" dir="auto"')}<datalist id="dl-makes">${MAKES.map(m => `<option value="${esc(m)}">`).join('')}</datalist>
      ${f('model', 'text', 'list="dl-models" dir="auto"')}<datalist id="dl-models">${(MODELS[c.make] || []).map(m => `<option value="${esc(m)}">`).join('')}</datalist>
      ${f('year', 'text', 'inputmode="numeric"')}${f('color')}${f('plate', 'text', 'inputmode="numeric"')}${f('customer')}${f('phone', 'tel', 'dir="ltr"')}
      <div class="field"><label>${t('notes')}</label><textarea class="inp" name="notes" rows="2">${esc(c.notes || '')}</textarea></div></div>
    <div class="foot"><span class="grow"></span><button type="button" class="btn ghost" data-act="close-sheet">${t('cancel')}</button><button class="btn y">${t('save')}</button></div></form>`);
}
function editWorkerSheet(id) {
  const w = id ? workerById(id) : { id: '', name: '', photo: '', color: PALETTE[S.workers.length % PALETTE.length], active: true };
  openSheet(`<form data-form="worker" data-id="${w.id}"><div class="sheet-h"><h3>${id ? esc(wn(w)) : t('addWorker')}</h3><button type="button" class="btn icon ghost" data-act="close-sheet">${ic('x')}</button></div>
    <div class="grid"><div class="photo-up"><span id="ph-prev">${avatar(w, 'lg')}</span><label class="btn sm">${ic('upload')}${t('uploadPhoto')}<input type="file" accept="image/*" data-act-change="photo" hidden></label><input type="hidden" name="photo" value="${esc(w.photo)}"></div>
      <div class="field"><label>${t('name')}</label><input class="inp" name="name" required value="${esc(w.name)}"></div>
      <div class="field"><label>${t('nameEn')}</label><input class="inp" name="nameEn" dir="ltr" value="${esc(w.nameEn || '')}"></div>
      <div class="field"><label>${LANG === 'ar' ? 'الفريق' : 'Team'}</label><select class="inp" name="team">${Object.entries(TEAMS).map(([k, v]) => `<option value="${k}" ${teamOf(w) === k ? 'selected' : ''}>${esc(nm(v))}</option>`).join('')}</select></div>
      <div class="field"><label>${LANG === 'ar' ? 'اللون' : 'Color'}</label><div class="chips">${PALETTE.map(c => `<label style="cursor:pointer"><input type="radio" name="color" value="${c}" ${w.color === c ? 'checked' : ''} hidden><span class="av sm" style="--c:${c};${w.color === c ? '' : 'box-shadow:none;opacity:.6'}" data-act="pick-color"></span></label>`).join('')}</div></div>
      <label class="toggle"><input type="checkbox" name="active" ${w.active ? 'checked' : ''}><span class="sw"></span>${t('active')}</label></div>
    <div class="foot"><span class="grow"></span><button type="button" class="btn ghost" data-act="close-sheet">${t('cancel')}</button><button class="btn y">${t('save')}</button></div></form>`);
}
function editFilmSheet(id, type) {
  const f = id ? filmById(id) : { id: '', name: '', type: type || 'ppf', active: true };
  openSheet(`<form data-form="film" data-id="${f.id}"><div class="sheet-h"><h3>${id ? esc(f.name) : t('addFilm')}</h3><button type="button" class="btn icon ghost" data-act="close-sheet">${ic('x')}</button></div>
    <div class="grid"><div class="field"><label>${t('name')}</label><input class="inp" name="name" required value="${esc(f.name)}" placeholder="e.g. XPEL Ultimate Plus / 3M IR 30%"></div>
      <div class="field"><label>${t('type')}</label><select class="inp" name="type">${Object.entries(FILM_TYPES).map(([k, v]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${esc(nm(v))}</option>`).join('')}</select></div>
      <label class="toggle"><input type="checkbox" name="active" ${f.active ? 'checked' : ''}><span class="sw"></span>${t('active')}</label></div>
    <div class="foot"><span class="grow"></span><button type="button" class="btn ghost" data-act="close-sheet">${t('cancel')}</button><button class="btn y">${t('save')}</button></div></form>`);
}
function editUserSheet(id) {
  const u = id ? userById(id) : { id: '', name: '', role: 'supervisor', active: true };
  openSheet(`<form data-form="user" data-id="${u.id}"><div class="sheet-h"><h3>${id ? esc(un(u)) : t('addUser')}</h3><button type="button" class="btn icon ghost" data-act="close-sheet">${ic('x')}</button></div>
    <div class="grid"><div class="field"><label>${t('name')}</label><input class="inp" name="name" required value="${esc(u.name)}"></div>
      <div class="field"><label>${t('nameEn')}</label><input class="inp" name="nameEn" dir="ltr" value="${esc(u.nameEn || '')}"></div>
      <div class="field"><label>${t('role')}</label><div class="grid" style="gap:8px">${['supervisor', 'manager', 'admin'].map(r => `<label class="l-item" style="cursor:pointer"><input type="radio" name="role" value="${r}" ${u.role === r ? 'checked' : ''}><div class="grow"><b>${t(r)}</b><small>${t(r === 'admin' ? 'roleAdminD' : r === 'manager' ? 'roleManagerD' : 'roleSupD')}</small></div></label>`).join('')}</div></div>
      <div class="field"><label>${t('newPin')}</label><input class="inp num" name="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" placeholder="${id ? t('pinHint') : '••••'}" ${id ? '' : 'required'} dir="ltr"></div>
      <label class="toggle"><input type="checkbox" name="active" ${u.active ? 'checked' : ''}><span class="sw"></span>${t('active')}</label></div>
    <div class="foot">${id && id !== me().id ? `<button type="button" class="btn r" data-act="delete-user" data-id="${id}">${ic('trash')}</button>` : ''}<span class="grow"></span><button type="button" class="btn ghost" data-act="close-sheet">${t('cancel')}</button><button class="btn y">${t('save')}</button></div></form>`);
}
function resizeImage(file, size = 220) {
  return new Promise((res, rej) => { const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = size; const s = Math.min(img.width, img.height), ctx = c.getContext('2d');
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', .85)); };
    img.onerror = rej; img.src = url; });
}

/* ---------------- exports ---------------- */
const loaded = {};
function loadScript(src) { return loaded[src] || (loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('load failed')); }; document.head.appendChild(s); })); }
const LIB_XLSX = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const LIB_PDF = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
function reportName(ext) { const { from } = periodRange(); return `Insulator-${P.mode === 'week' ? 'week' : 'month'}-${new Date(from).toISOString().slice(0, 10)}.${ext}`; }
function summaryText() {
  const { from, to } = periodRange(), A = analyze(from, to), k = A.kpi, medal = ['🥇', '🥈', '🥉'];
  return [`*${S.settings.shop} — ${t('report')}*`, `${t('period')}: ${periodLabel()}`, '',
    `${t('kCars')}: ${k.cars}`, `${t('kTasks')}: ${k.tasks}`, `${t('kHours')}: ${fHrs(k.labor)}`, `${t('kAvgCar')}: ${fDur(k.avgCar)}`, `${t('kRework')}: ${k.rework.toFixed(1)}%`, '',
    `*${t('ranking')}*`, ...A.workers.flatMap((w, i) => [...(i === 0 || A.workers[i - 1].team !== w.team ? ['', `_${nm(TEAMS[w.team])}_`] : []), `${medal[w.rank - 1] || (w.low ? '🔻' : '') + w.rank + '.'} ${wn(workerById(w.id))} — ${t('score')} ${w.score} · ${w.carsN} ${t('cars')} · ${fHrs(w.actual)} ${t('hours')} · ${t('eff')} ${Math.round(w.eff)}%`])].join('\n');
}
async function exportXLSX() {
  toast(t('preparing'));
  try { await loadScript(LIB_XLSX); } catch { return toast('⚠ offline'); }
  const { from, to } = periodRange(), A = analyze(from, to), k = A.kpi, XL = window.XLSX, wb = XL.utils.book_new();
  const add = (name, rows) => { const ws = XL.utils.aoa_to_sheet(rows); ws['!cols'] = rows[0].map((_, i) => ({ wch: Math.max(10, ...rows.map(r => String(r[i] ?? '').length + 2)) })); XL.utils.book_append_sheet(wb, ws, name.slice(0, 30)); };
  add(t('report'), [[S.settings.shop + ' — ' + t('report')], [t('period'), periodLabel()], [t('generated'), fDT(Date.now())], [],
    [t('kCars'), k.cars], [t('kTasks'), k.tasks], [t('kHours'), +fHrs(k.labor)], [t('kAvgCar') + ' (min)', Math.round(k.avgCar / 60000)], [t('kTurn') + ' (min)', Math.round(k.turn / 60000)], [t('kRework') + ' %', +k.rework.toFixed(1)]]);
  add(t('ranking'), [[t('team'), t('rank'), t('worker'), t('score'), t('cars'), t('tasks'), t('pts'), t('hours'), t('avgCar') + ' (min)', t('eff') + ' %', t('util') + ' %', t('rework')],
    ...A.workers.map(w => [nm(TEAMS[w.team]), w.rank, wn(workerById(w.id)), w.score, w.carsN, +fN(w.tasks), +w.points.toFixed(1), +fHrs(w.actual), Math.round(w.avgCar / 60000), Math.round(w.eff), Math.round(w.util), w.rework])]);
  add(t('taskLog'), [[t('date'), t('job'), t('plate'), t('service'), t('part'), t('worker'), t('film'), t('shade'), t('startTime'), t('endTime'), 'min', t('rework'), t('edited')],
    ...A.tasks.sort((a, b) => a.start - b.start).map(x => { const j = jobById(x.jobId); return [new Date(x.start).toLocaleDateString(loc()), j ? carTitle(j) : '', j?.car.plate || '', nm(SVC[x.service]), nm(PARTS[x.part]), wids(x).map(id => wn(workerById(id))).filter(Boolean).join(' + '), filmById(x.filmId)?.name || '', x.shade ? x.shade + '%' : '', fTime(x.start), fTime(x.end), Math.round(dur(x) / 60000), x.rework ? '✓' : '', x.edited ? '✓' : '']; })]);
  add(t('jobsList'), [[t('date'), t('make'), t('model'), t('year'), t('color'), t('plate'), t('customer'), t('phone'), t('services'), t('status'), t('carTime') + ' (min)'],
    ...A.jobs.map(j => [fDT(j.createdAt), j.car.make, j.car.model, j.car.year, j.car.color, j.car.plate, j.car.customer, j.car.phone, j.services.map(s => nm(SVC[s])).join(' + '), t(j.status), Math.round(carSpan(j.id) / 60000)])]);
  add(t('partTimes'), [[t('part'), t('count'), t('avg') + ' (min)', t('teamAvg') + ' (min)', t('best') + ' (min)', t('worker')], ...A.parts.map(o => [partLabel(o.k), o.n, Math.round(o.avg / 60000), Math.round(A.base[o.k] / 60000), Math.round(o.best.d / 60000), wn(workerById(o.best.w)) || ''])]);
  if (LANG === 'ar') wb.Workbook = { Views: [{ RTL: true }] };
  XL.writeFile(wb, reportName('xlsx')); toast(t('downloaded'));
}
function reportEl() {
  const keep = fDur; fDur = ms => { const m = Math.round((ms || 0) / 60000); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
  const wrap = document.createElement('div'); try { wrap.innerHTML = reportHTML(); } finally { fDur = keep; }
  const el = wrap.firstElementChild, tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) tw.currentNode.nodeValue = tw.currentNode.nodeValue.replace(/ /g, '\u00a0');
  return el;
}
function reportHTML() {
  const { from, to } = periodRange(), A = analyze(from, to), k = A.kpi;
  return `<div class="rep" dir="${LANG === 'ar' ? 'rtl' : 'ltr'}">
    <div class="rep-h"><img src="logo.png"><div><h1>${esc(S.settings.shop)} — ${t('report')}</h1><p>${t('period')}: ${periodLabel()} · ${t('generated')}: ${fDT(Date.now())}</p></div></div>
    <div class="rep-kpis"><div><small>${t('kCars')}</small><b>${k.cars}</b></div><div><small>${t('kTasks')}</small><b>${k.tasks}</b></div><div><small>${t('kHours')}</small><b>${fHrs(k.labor)}</b></div>
      <div><small>${t('kAvgCar')}</small><b>${fDur(k.avgCar)}</b></div><div><small>${t('kTurn')}</small><b>${fDur(k.turn)}</b></div><div><small>${t('kRework')}</small><b>${k.rework.toFixed(1)}%</b></div></div>
    <h2>${t('ranking')}</h2><table><thead><tr><th>#</th><th>${t('worker')}</th><th>${t('score')}</th><th>${t('cars')}</th><th>${t('tasks')}</th><th>${t('hours')}</th><th>${t('avgCar')} (h:m)</th><th>${t('eff')}</th><th>${t('util')}</th></tr></thead><tbody>
      ${A.teams.map(([tk, l]) => `<tr class="team"><td colspan="9">${esc(nm(TEAMS[tk]))}</td></tr>` + l.map(w => `<tr class="${w.rank === 1 ? 'gold' : w.low ? 'low' : ''}"><td>${w.rank}</td><td>${esc(wn(workerById(w.id)))}</td><td>${w.score}</td><td>${w.carsN}</td><td>${fN(w.tasks)}</td><td>${fHrs(w.actual)}</td><td>${fDur(w.avgCar)}</td><td>${Math.round(w.eff)}%</td><td>${Math.round(w.util)}%</td></tr>`).join('')).join('')}</tbody></table>
    ${progressPDF()}
    <h2>${t('partTimes')}</h2><table><thead><tr><th>${t('part')}</th><th>${t('count')}</th><th>${t('avg')}</th><th>${t('teamAvg')}</th><th>${t('best')}</th></tr></thead><tbody>
      ${A.parts.slice(0, 18).map(o => `<tr><td>${esc(partLabel(o.k))}</td><td>${o.n}</td><td>${fDur(o.avg)}</td><td>${fDur(A.base[o.k])}</td><td>${fDur(o.best.d)} · ${esc(wn(workerById(o.best.w)) || '')}</td></tr>`).join('')}</tbody></table>
    <h2>${t('jobsList')}</h2><table><thead><tr><th>${t('date')}</th><th>${t('job')}</th><th>${t('plate')}</th><th>${t('services')}</th><th>${t('carTime')}</th><th>${t('status')}</th></tr></thead><tbody>
      ${A.jobs.sort((a, b) => a.createdAt - b.createdAt).map(j => `<tr><td>${fDate(j.createdAt)}</td><td>${esc(carTitle(j))}</td><td>${esc(j.car.plate)}</td><td>${j.services.map(s => esc(nm(SVC[s]))).join(' + ')}</td><td>${fDur(carSpan(j.id))}</td><td>${t(j.status)}</td></tr>`).join('')}</tbody></table>
    <div class="rep-f">Insulator Workshop Tracker · ${t('saturdayToThursday')}</div></div>`;
}
const PDF_OPTS = () => ({ margin: [6, 0, 8, 0], filename: reportName('pdf'), image: { type: 'jpeg', quality: .96 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] } });
async function makePDF() {
  toast(t('preparing'));
  try { await loadScript(LIB_PDF); } catch { toast('⚠ offline'); return null; }
  const el = reportEl();
  await document.fonts.ready; window.scrollTo(0, 0);
  return await window.html2pdf().set(PDF_OPTS()).from(el).outputPdf('blob');
}
function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); }
async function exportPDF() { const b = await makePDF(); if (b) { download(b, reportName('pdf')); toast(t('downloaded')); } }
async function sharePDF() {
  const b = await makePDF(); if (!b) return;
  const file = new File([b], reportName('pdf'), { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: t('shareText', S.settings.shop), text: summaryText() }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  download(b, reportName('pdf')); toast(t('sharedFallback'));
}
function shareWA() { const n = (S.settings.wa || '').replace(/\D/g, ''); if (!n) return toast(t('noWa')); window.open(`https://wa.me/${n}?text=${encodeURIComponent(summaryText())}`, '_blank'); }
function shareMail() { const e = (S.settings.email || '').trim(); if (!e) return toast(t('noEmail')); location.href = `mailto:${encodeURIComponent(e)}?subject=${encodeURIComponent(t('shareText', S.settings.shop) + ' · ' + periodLabel())}&body=${encodeURIComponent(summaryText().replace(/\*/g, ''))}`; }

/* =========================================================================
   EVENTS
   ========================================================================= */
const ACTS = {
  lang() { LANG = LANG === 'ar' ? 'en' : 'ar'; localStorage.setItem(LANG_KEY, LANG); render(); },
  logout, 'login-user': el => { loginSel = el.dataset.id; pinBuf = ''; renderLogin(); }, 'login-back': () => { loginSel = null; pinBuf = ''; renderLogin(); },
  pin: el => pinPress(el.dataset.n),
  'sheet-bg': (el, e) => { if (e.target === el) closeSheet(); }, 'close-sheet': closeSheet,
  'worker-sheet': el => workerSheet(el.dataset.id),
  'floor-kpi': el => floorKpiSheet(el.dataset.k),
  'avg-sheet': () => avgSheet(),
  'fu-open': () => { const ab = document.getElementById('alert-bar'); if (ab) ab.innerHTML = ''; go('#/follow'); },
  'fu-done': el => fuMark(el.dataset.id, el.dataset.k),
  'fu-call': el => { fuCall = { id: el.dataset.id, key: el.dataset.k, ans: '', res: '' }; fuCallSheet(); },
  'fu-ans': el => { fuCall.ans = el.dataset.v; if (fuCall.ans === 'no') fuCall.res = ''; fuCallSheet(); },
  'fu-res': el => { fuCall.res = el.dataset.v; fuCallSheet(); },
  'fu-snooze': el => fuMark(el.dataset.id, el.dataset.k, true),
  'fill-car': () => { const vs = visitsOf(draft.car.plate), last = vs[vs.length - 1]; if (!last) return; ['make', 'model', 'year', 'color', 'customer', 'phone'].forEach(k => { if (last.car[k]) draft.car[k] = last.car[k]; }); if (!draft.services.length && SVC.service) { draft.services.push('service'); draft.assign.service = { whole: [] }; draft.svc = 'service'; } render(); toast(t('filled')); },
  'ot-toggle': () => { S.settings.otDay = isOT() ? '' : new Date().toDateString(); db.save(); toast(isOT() ? t('otOn', S.settings.otResume || '13:00') : t('otOff')); render(); },
  'part-sheet': el => partSheet(el.dataset.job, el.dataset.part),
  'part-finish': el => partAll(el.dataset.job, el.dataset.part, 'finish'),
  'part-start': el => partAll(el.dataset.job, el.dataset.part, 'start'),
  'part-pause': el => partAll(el.dataset.job, el.dataset.part, 'pause'),
  'part-resume': el => partAll(el.dataset.job, el.dataset.part, 'resume'),
  start: el => startTask(el.dataset.id), finish: el => finishTask(el.dataset.id),
  svc: el => { const k = el.dataset.k, i = draft.services.indexOf(k);
    const film = o => ['ppf', 'wrap'].includes(SVC[o].g); // full / half / quarter PPF and colour change are all film on the body: only one of them
    if (i < 0 && film(k)) draft.services.filter(o => o !== k && film(o)).forEach(o => { draft.services.splice(draft.services.indexOf(o), 1); delete draft.assign[o]; }); // full / half / quarter: only one
    if (i >= 0) { draft.services.splice(i, 1); delete draft.assign[k]; }
    else { draft.services.push(k); draft.assign[k] = Object.fromEntries(SVC[k].parts.map(p => [p, []])); if (isTintLike(k, dKind(k))) SVC[k].parts.forEach(p => draft.tint[p] = draft.tint[p] || { ...draft.tintAll }); draft.svc = k; }
    $('#svc-cats').innerHTML = svcGrid(); $('#svc-extra').innerHTML = svcExtra(); renderAssign(); },
  'all-workers': () => { draft.allW = !draft.allW; renderAssign(); },
  'svc-tab': el => { draft.svc = el.dataset.k; renderAssign(); },
  'pick-worker': el => { const id = el.dataset.id, svc = draft.svc, pool = svc ? poolOf(svc, dKind(svc)) : [];
    if (pool.length === 1) { const m = draft.assign[svc], p = pool[0], a = m[p] = m[p] || [], i = a.indexOf(id); i >= 0 ? a.splice(i, 1) : a.push(id); draft.worker = null; return renderAssign(); } // whole car: just tap who works on it
    draft.worker = draft.worker === id ? null : id; renderAssign(); },
  part: el => togglePart(el.dataset.part),
  'repl-kind': el => { (draft.kind = draft.kind || {})[draft.svc] = el.dataset.k; if (SVC[draft.svc].g === 'rep') draft.assign[draft.svc] = {}; renderAssign(); },
  'parts-all': () => { const m = draft.assign[draft.svc]; poolOf(draft.svc, dKind(draft.svc)).forEach(p => { if (!(p in m)) { m[p] = draft.worker ? [draft.worker] : []; if (isTintLike(draft.svc, dKind(draft.svc))) draft.tint[p] = draft.tint[p] || { ...draft.tintAll }; } }); renderAssign(); },
  'parts-clear': () => { draft.assign[draft.svc] = {}; renderAssign(); },
  'parts-rest': () => { const m = draft.assign[draft.svc]; Object.keys(m).forEach(p => { if (!m[p].length) m[p] = [draft.worker]; }); renderAssign(); },
  'save-job': saveJob,
  pause: el => pauseTask(S.tasks.find(t => t.id === el.dataset.id)),
  resume: el => resumeTask(S.tasks.find(t => t.id === el.dataset.id)),
  'pause-all': () => { const list = S.tasks.filter(x => x.start && !x.end && !x.pausedAt); if (!list.length || !confirmBox(t('pauseAllQ', list.length))) return; list.forEach(x => pauseTask(x, true)); db.save(); toast(t('pausedToast')); refresh(); },
  'alert-close': () => { const el = document.getElementById('alert-bar'); if (el) el.innerHTML = ''; },
  'resume-all': () => { const ab = document.getElementById('alert-bar'); if (ab) ab.innerHTML = ''; const list = S.tasks.filter(x => x.pausedAt && !x.end && jobById(x.jobId)?.status === 'open'); if (!list.length || !confirmBox(t('resumeAllQ', list.length))) return; list.forEach(x => resumeTask(x, true)); db.save(); toast(t('started')); refresh(); },
  'edit-task': el => { editTaskSheet(el.dataset.id); if (el.dataset.focus) { const i = $('.sheet [name=start]'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } } }, 'add-task': el => editTaskSheet(null, true, el.dataset.id),
  'pick-task-worker': el => { const f = el.closest('form'), set = new Set(f.workerIds.value.split(',').filter(Boolean)); set.has(el.dataset.id) ? set.delete(el.dataset.id) : set.add(el.dataset.id); f.workerIds.value = [...set].join(','); $$('.pick', f).forEach(p => p.classList.toggle('on', set.has(p.dataset.id))); },
  'delete-task': el => { if (!confirmBox(t('delete') + '?')) return; const x = S.tasks.find(t => t.id === el.dataset.id); S.tasks = S.tasks.filter(t => t.id !== el.dataset.id);
    if (x && x.grp) { const rest = S.tasks.filter(t => t.grp === x.grp); rest.forEach(m => { if (rest.length > 1) m.share = rest.length; else { delete m.grp; delete m.share; } }); }
    db.save(); closeSheet(); render(); },
  'close-job': el => { const j = jobById(el.dataset.id), open = tasksOf(j.id).some(x => !x.end); if (open && !confirmBox(t('closeConfirm'))) return;
    tasksOf(j.id).forEach(x => { if (x.start && !x.end) endTask(x); }); j.status = 'closed'; j.closedAt = Date.now(); db.save(); toast(t('closed')); go(me().role === 'supervisor' ? '#/floor' : '#/job/' + j.id); },
  'reopen-job': el => { const j = jobById(el.dataset.id); j.status = 'open'; j.closedAt = null; db.save(); render(); },
  'delete-job': el => { if (!confirmBox(t('deleteConfirm'))) return; S.jobs = S.jobs.filter(j => j.id !== el.dataset.id); S.tasks = S.tasks.filter(x => x.jobId !== el.dataset.id); db.save(); go('#/history'); },
  'cmp-mode': el => { CMP = el.dataset.m; render(); },
  pmode: el => { P.mode = el.dataset.m; P.ref = Date.now(); render(); },
  pnav: el => { const d = +el.dataset.d; if (P.mode === 'week') P.ref = addDays(P.ref, 7 * d); else { const x = new Date(P.ref); x.setDate(1); x.setMonth(x.getMonth() + d); P.ref = x.getTime(); } render(); },
  goto: el => go(el.dataset.h),
  'exp-pdf': exportPDF, 'exp-xls': exportXLSX, 'exp-share': sharePDF, 'exp-wa': shareWA, 'exp-mail': shareMail,
  'set-tab': el => { setTab = el.dataset.k; render(); },
  'edit-worker': el => editWorkerSheet(el.dataset.id), 'edit-car': el => editCarSheet(el.dataset.id), 'edit-film': el => editFilmSheet(el.dataset.id, el.dataset.type), 'edit-user': el => editUserSheet(el.dataset.id),
  'pick-color': el => { const f = el.closest('form'); setTimeout(() => $$('[name=color]', f).forEach(r => { const s = r.nextElementSibling; s.style.boxShadow = r.checked ? '' : 'none'; s.style.opacity = r.checked ? 1 : .6; }), 0); },
  'delete-user': el => { const u = userById(el.dataset.id); if (u.role === 'admin' && S.users.filter(x => x.role === 'admin' && x.active).length < 2) return toast(t('needAdmin')); if (!confirmBox(t('delete') + ' ' + u.name + '?')) return; S.users = S.users.filter(x => x.id !== u.id); db.save(); closeSheet(); render(); },
  backup: () => download(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), `insulator-backup-${new Date().toISOString().slice(0, 10)}.json`),
  'demo-reset': () => { localStorage.removeItem(STORE_KEY); location.reload(); },
  'load-demo': () => { if (!confirmBox(t('loadDemoQ'))) return; S.jobs = S.jobs.filter(j => !j.demo); S.tasks = S.tasks.filter(x => !x.demo); makeDemo(S); db.save(); toast('✓'); go('#/dashboard'); },
  'clear-demo': () => { S.jobs = S.jobs.filter(j => !j.demo); S.tasks = S.tasks.filter(x => !x.demo); S.demo = false; db.save(); render(); },
  'reset-all': () => { if (!confirmBox(t('resetConfirm'))) return; const keepUsers = S.users, settings = S.settings; S = { v: 1, demo: false, users: keepUsers, workers: [], films: seed().films, jobs: [], tasks: [], settings }; db.save(); render(); },
};
const CHANGES = {
  'sel-other': el => { const k = el.dataset.key, o = $('#' + k + '-other'); if (el.value === '__other') { o.style.display = ''; o.value = ''; draft.car[k] = ''; o.focus(); } else { o.style.display = 'none'; draft.car[k] = el.value; } if (k === 'make') { draft.car.model = ''; $('#model-wrap').innerHTML = modelField(); } },
  'tint-all-film': el => { draft.tintAll.film = el.value; Object.keys(draft.assign[draft.svc] || {}).forEach(p => (draft.tint[p] = draft.tint[p] || {}).film = el.value); renderAssign(); },
  'tint-all-shade': el => { draft.tintAll.shade = el.value; Object.keys(draft.assign[draft.svc] || {}).forEach(p => (draft.tint[p] = draft.tint[p] || {}).shade = el.value); renderAssign(); },
  'tint-film': el => { (draft.tint[el.dataset.part] = draft.tint[el.dataset.part] || {}).film = el.value; },
  'tint-shade': el => { (draft.tint[el.dataset.part] = draft.tint[el.dataset.part] || {}).shade = el.value; },
  'task-svc': el => taskFormSync(el.closest('form')),
  'task-kind': el => taskFormSync(el.closest('form')),
  'task-time': el => { const f = el.closest('form'), s0 = f.start.value ? new Date(f.start.value).getTime() : 0, e0 = f.end.value ? new Date(f.end.value).getTime() : Date.now(), p = (+f.pauseMin.value || 0) * 60000; $('#net-dur', f).textContent = s0 && e0 > s0 ? fDur(Math.max(0, e0 - s0 - p)) : '—'; },
  photo: async el => { const file = el.files[0]; if (!file) return; let data; try { data = await resizeImage(file); } catch { el.value = ''; return toast(t('photoErr')); } const f = el.closest('form'); f.photo.value = data; $('#ph-prev', f).innerHTML = `<span class="av lg ph" style="background-image:url(${data})"></span>`; },
  restore: el => { const file = el.files[0]; if (!file) return; const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); if (!d.users || !d.jobs) throw 0; if (!confirmBox(t('restoreConfirm'))) return; S = d; db.save(); toast(t('restored')); render(); } catch { toast('⚠ invalid file'); } }; r.readAsText(file); },
};
function taskFormSync(f) {
  const svc = f.service.value, g = SVC[svc].g, ks = KINDS[g] || [];
  if (ks.length && !ks.includes(f.kind.value)) { f.kind.innerHTML = ks.map(k => `<option value="${k}">${kindLabel(k)}</option>`).join(''); f.kind.value = KIND_DEF[g]; $('#kind-field label', f).textContent = t(g === 'pol' ? 'polWhat' : 'replWhat'); }
  const kind = ks.length ? f.kind.value : undefined;
  $('#kind-field', f).style.display = ks.length ? '' : 'none';
  $('#shade-field', f).style.display = needShade(svc, kind) ? '' : 'none';
  $('#task-part', f).innerHTML = poolOf(svc, kind).map(p => `<option value="${p}">${esc(nm(PARTS[p]))}</option>`).join('');
  $('#tint-fields', f).style.display = needFilm(svc) ? '' : 'none';
  const team = SVC_TEAM(svc), on = new Set(f.workerIds.value.split(',').filter(Boolean)), grid = $('#task-picks', f);
  if (grid && grid.dataset.team !== team) { grid.dataset.team = team; S.workers.filter(w => w.active && !inTeam(w, team)).forEach(w => on.delete(w.id)); f.workerIds.value = [...on].join(',');
    grid.innerHTML = S.workers.filter(w => (w.active && inTeam(w, team)) || on.has(w.id)).map(w => `<button type="button" class="pick ${on.has(w.id) ? 'on' : ''}" data-act="pick-task-worker" data-id="${w.id}">${avatar(w)}<span>${esc(wn(w))}</span></button>`).join(''); }
}
const FORMS = {
  'cloud-link': async f => { const b = f.querySelector('button'); b.disabled = true; const ok = await cloud.link(f.pw.value); if (!ok) { b.disabled = false; f.pw.value = ''; toast(LANG === 'ar' ? 'كلمة السر غير صحيحة' : 'Wrong password'); } },
  task: saveTaskForm,
  'fu-call': fuCallSave,
  car: f => { const j = jobById(f.dataset.id); if (!j) return; const fd = new FormData(f); ['make', 'model', 'year', 'color', 'plate', 'customer', 'phone', 'notes'].forEach(k => j.car[k] = (fd.get(k) || '').trim()); db.save(); closeSheet(); render(); toast('✓ ' + t('carSaved')); },
  settings: f => { const fd = new FormData(f); Object.assign(S.settings, { shop: fd.get('shop') || 'Insulator', wa: fd.get('wa'), email: fd.get('email'), shiftHours: +fd.get('shiftHours') || 9, autoLock: +fd.get('autoLock') || 10, breakStart: fd.get('breakStart') || '12:00', breakEnd: fd.get('breakEnd') || '16:00', breakWarn: +fd.get('breakWarn') || 5, shiftStart: fd.get('shiftStart') || '09:00', shiftEnd: fd.get('shiftEnd') || '21:00', otResume: fd.get('otResume') || '13:00' }); db.save(); toast('✓ ' + t('save')); render(); },
  worker: f => { const fd = new FormData(f), id = f.dataset.id, data = { name: fd.get('name').trim(), nameEn: (fd.get('nameEn') || '').trim(), photo: fd.get('photo'), color: fd.get('color') || PALETTE[0], team: fd.get('team') || 'ppf', active: !!fd.get('active') };
    if (id) Object.assign(workerById(id), data); else S.workers.push({ id: uid(), ...data }); db.save(); closeSheet(); render(); },
  film: f => { const fd = new FormData(f), id = f.dataset.id, data = { name: fd.get('name').trim(), type: fd.get('type'), active: !!fd.get('active') };
    if (id) Object.assign(filmById(id), data); else S.films.push({ id: uid(), ...data }); db.save(); closeSheet(); render(); },
  user: f => { const fd = new FormData(f), id = f.dataset.id, pin = (fd.get('pin') || '').trim(), role = fd.get('role'), active = !!fd.get('active');
    if (pin && !/^\d{4}$/.test(pin)) return toast(t('pin4'));
    if (pin && S.users.some(u => u.id !== id && u.pin === H(pin))) return toast(t('pinTaken'));
    const others = S.users.filter(u => u.id !== id && u.role === 'admin' && u.active).length;
    if (id && !others && (role !== 'admin' || !active) && userById(id).role === 'admin') return toast(t('needAdmin'));
    if (id) { const u = userById(id); Object.assign(u, { name: fd.get('name').trim(), nameEn: (fd.get('nameEn') || '').trim(), role, active }); if (pin) u.pin = H(pin); }
    else S.users.push({ id: uid(), name: fd.get('name').trim(), nameEn: (fd.get('nameEn') || '').trim(), role, active, pin: H(pin) });
    db.save(); closeSheet(); render(); },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACTS[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  fn(el, e);
});
document.addEventListener('change', e => { if (e.target.tagName === 'SELECT' && e.target.dataset.car && draft) draft.car[e.target.dataset.car] = e.target.value; const el = e.target.closest('[data-act-change]'); if (el && CHANGES[el.dataset.actChange]) CHANGES[el.dataset.actChange](el, e); });
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.car && draft) { draft.car[el.dataset.car] = el.value; if (el.dataset.car === 'plate') plateHint(); }
  if (el.id === 'hist-q') { histQ = el.value; $('#hist-list').innerHTML = histList(); }
});
document.addEventListener('submit', e => { const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault(); FORMS[f.dataset.form](f); });
document.addEventListener('keydown', e => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if (!me() && !typing && /^[0-9]$/.test(e.key)) pinPress(e.key);
  if (!me() && !typing && e.key === 'Backspace') pinPress('del');
  if (e.key === 'Escape') closeSheet();
});
window.addEventListener('hashchange', () => { closeSheet(); render(); });

/* lunch break: warn the supervisor, pause running work automatically, remind to resume */
const atHM = (str, def) => { const [h, m] = String(str || def).split(':').map(Number); const d = new Date(); d.setHours(h || 0, m || 0, 0, 0); return d.getTime(); };
const isOT = () => S.settings.otDay === new Date().toDateString(); // overtime day: back from break at 13:00 instead of 16:00
const brk = () => { const st = S.settings, ot = isOT(), r = ot ? (st.otResume || '13:00') : (st.breakEnd || '16:00'); return { on: st.breakOn !== false, ot, b0: atHM(st.breakStart, '12:00'), b1: atHM(r, r), resume: r, open: atHM(st.shiftStart, '09:00'), end: atHM(st.shiftEnd, '21:00'), warn: +st.breakWarn || 5 }; };
const shiftOver = () => Date.now() >= brk().end;
const seen = {};
function beep() { try { const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain(); o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = .15; o.start(); o.stop(a.currentTime + .35); setTimeout(() => { const o2 = a.createOscillator(); o2.connect(g); o2.frequency.value = 660; o2.start(); o2.stop(a.currentTime + .35); }, 420); } catch { } }
function alertUser(text, btn) {
  let el = document.getElementById('alert-bar'); if (!el) { el = document.createElement('div'); el.id = 'alert-bar'; document.body.appendChild(el); }
  el.innerHTML = `<div class="alert-bar">${ic('clock')}<span>${text}</span>${btn || ''}<button class="btn sm ghost" data-act="alert-close">${ic('x')}</button></div>`;
  beep(); try { navigator.vibrate && navigator.vibrate([300, 150, 300]); } catch { }
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Insulator', { body: text.replace(/<[^>]+>/g, ''), icon: 'icon-512.png' }); } catch { }
}
function breakCheck() {
  if (!S || (window.cloud && !cloud.linked)) return;
  const B = brk(), now = Date.now(), day = new Date().toDateString(); if (!B.on || new Date().getDay() === 5) return; // Friday: off
  const open = x => jobById(x.jobId)?.status === 'open';
  // at break time pause everything still running — also catches up if no phone was open at 12:00
  if (now >= B.b0) {
    let n = 0; S.tasks.forEach(x => { if (x.start && !x.end && !x.pausedAt && x.start < B.b0 && x.autoBreak !== day && open(x)) { x.pausedAt = B.b0; x.autoBreak = day; n++; } });
    if (n) { db.save(); refresh(); if (canEdit() && seen.p !== day) { seen.p = day; alertUser(t('breakPaused', n, B.resume)); } }
  }
  if (!me() || !canEdit()) return;
  const running = S.tasks.filter(x => x.start && !x.end && !x.pausedAt && open(x)).length;
  if (now >= B.b0 - B.warn * 60000 && now < B.b0 && running && seen.w !== day) { seen.w = day; alertUser(t('breakSoon', Math.max(1, Math.ceil((B.b0 - now) / 60000)), running)); }
  const waiting = S.tasks.filter(x => x.pausedAt && !x.end && x.autoBreak === day && open(x)).length;
  if (now >= B.b1 && now < B.b1 + 3 * 3600000 && waiting && seen.r !== day) { seen.r = day; alertUser(t('breakOver', waiting), `<button class="btn sm g" data-act="resume-all">${ic('play')}${t('resumeAll')}</button>`); }
}

/* live timers + auto-lock */
let lastAct = Date.now(), tickN = 0;
['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => lastAct = Date.now(), { passive: true }));
function tick() { const now = Date.now(); $$('[data-since]').forEach(el => el.textContent = fClock(now - +el.dataset.since)); }
setInterval(() => {
  tick();
  if (++tickN % 15 === 1) { breakCheck(); fuAlertCheck(); }
  if (me() && Date.now() - lastAct > (+S.settings.autoLock || 10) * 60000) logout();
}, 1000);
window.addEventListener('storage', e => { if (e.key === STORE_KEY) { db.load(); render(); } }); // keep several tabs in sync

/* boot */
db.load();
if (window.cloud) { document.getElementById('sync-dot')?.removeAttribute('hidden'); cloud.start(); } else render();
// Offline cache (sw.js) is switched off for now: it blocked updates in some browsers. Remove any old one.
if ('serviceWorker' in navigator) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(() => { });
