// ==========================================================================
// GLASSTODO - کنترل‌کننده مشتری (فارسی + RTL)
// ==========================================================================

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

// تبدیل اعداد لاتین به فارسی
function toPersianNum(num) {
  if (num === null || num === undefined) return '';
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(num).replace(/[0-9]/g, d => persianDigits[d]);
}

// اسامی ماه‌ها و روزهای هفته در تقویم فارسی (شمسی)
const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
const JALALI_WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"];

// الگوریتم استاندارد و دقیق تبدیل میلادی به هجری شمسی
function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = (gy <= 1600) ? 0 : 979;
  gy -= (gy <= 1600) ? 621 : 1600;
  let gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm, jd;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  return { jy, jm, jd };
}

// الگوریتم تبدیل هجری شمسی به میلادی
function jalaliToGregorian(jy, jm, jd) {
  let gy = (jy <= 979) ? 621 : 1600;
  jy -= (jy <= 979) ? 0 : 979;
  let days = (365 * jy) + (Math.floor(jy / 33) * 8) + Math.floor(((jy % 33) + 3) / 4) + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm;
  for (gm = 1; gm < 13; gm++) {
    const v = sal_a[gm];
    if (gd <= v) break;
    gd -= v;
  }
  return { gy, gm, gd };
}

function isLeapJalaliYear(jy) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  let jp = breaks[0];
  let jump = 0;
  for (let j = 1; j < breaks.length; j++) {
    const jm = breaks[j];
    jump = jm - jp;
    if (jy < jm) break;
    jp = jm;
  }
  let n = jy - jp;
  if (n < 0) n = 0;
  if (jump - n < 6) n = n - jump + (Math.floor((jump + 4) / 33) * 33);
  let leap = -1;
  let mod = ((n + 1) % 33) - 1;
  if (mod === -1) mod = 32;
  if (mod % 4 === 0) leap = 1;
  return leap === 1;
}

function getJalaliMonthDays(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

const GREGORIAN_MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const GREGORIAN_MONTHS_FULL_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const GREGORIAN_WEEKDAYS_SHORT_EN = ["Sa", "Su", "Mo", "Tu", "We", "Th", "Fr"];
const JALALI_WEEKDAYS_SHORT_FA = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const JALALI_MONTHS_EN = ["Farvardin", "Ordibehesht", "Khordad", "Tir", "Mordad", "Shahrivar", "Mehr", "Aban", "Azar", "Dey", "Bahman", "Esfand"];

// نمایش تاریخ کامل در نوار هدر تقویم
function formatFullPersianDate(date = new Date()) {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();
  const { jy, jm, jd } = gregorianToJalali(gy, gm, gd);
  const weekdayIndex = (date.getDay() + 1) % 7;
  const weekdayName = JALALI_WEEKDAYS[weekdayIndex];
  return `${weekdayName} ${toPersianNum(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianNum(jy)}`;
}

function formatDatePersian(dateStr) {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-').map(Number);
  const { jy, jm, jd } = gregorianToJalali(year, month, day);
  return `${toPersianNum(jd)} ${JALALI_MONTHS[jm - 1]}`;
}

function formatDateByLang(dateStr) {
  if (!dateStr) return '';
  const lang = settings.lang || "fa";
  if (lang === "fa") {
    return formatDatePersian(dateStr);
  } else {
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${GREGORIAN_MONTHS_EN[m - 1]} ${d}`;
  }
}

function formatFullDateByLang(date = new Date()) {
  const lang = settings.lang || "fa";
  if (lang === "fa") {
    return formatFullPersianDate(date);
  } else {
    const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
  }
}

function toNumByLang(num) {
  const lang = settings.lang || "fa";
  return lang === "fa" ? toPersianNum(num) : String(num);
}

// فرهنگ لغت دوزبانه کامل (۱۰۰٪ فارسی و ۱۰۰٪ انگلیسی)
const I18N = {
  fa: {
    appTitle: "Gleam (گلیم) - برنامه‌ریز شیشه‌ای کارها",
    brandPro: "PRO",
    shortcutTitle: "کلید میانبر سراسری برای باز و بسته کردن (Ctrl+Shift+Space)",
    settingsTitle: "تنظیمات و ترجیحات",
    closeTitle: "پنهان در سینی ویندوز (Esc)",
    calendarTitle: "تقویم فارسی (شمسی)",
    calendarAction: "تقویم ▾",
    calendarBannerTitle: "کلیک برای باز کردن تقویم فارسی",
    collapseFocusTitle: "جمع‌کردن / بازکردن کارت تمرکز",
    langToggleTitle: "Switch to English (تغییر زبان به انگلیسی)",
    langIndicator: "EN",
    focusTitle: "تمرکز روزانه",
    statTotal: "کل",
    statCompleted: "انجام‌شده",
    statUrgent: "فوری",
    placeholderAdd: "کار یا ایده جدید اضافه کن... (Enter ↵)",
    btnSubmitTitle: "افزودن کار (Enter)",
    priorityHigh: "فوری",
    priorityMed: "متوسط",
    priorityLow: "پایین",
    categoryPersonal: "شخصی",
    categoryWork: "کاری",
    categoryIdeas: "ایده‌ها",
    categoryDaily: "روزانه",
    categoryProjects: "پروژه‌ها",
    categoryStudy: "مطالعه",
    categoryHealth: "سلامتی",
    categoryAll: "همه",
    categoryGeneral: "عمومی",
    categoriesList: [
      { value: "شخصی", label: "شخصی" },
      { value: "کاری", label: "کاری" },
      { value: "پروژه‌ها", label: "پروژه‌ها" },
      { value: "مطالعه", label: "مطالعه" },
      { value: "سلامتی", label: "سلامتی" },
      { value: "ایده‌ها", label: "ایده‌ها" },
      { value: "روزانه", label: "روزانه" }
    ],
    dueLabel: "موعد",
    duePickerTitle: "تعیین موعد مقرر در تقویم",
    filterAll: "همه",
    filterActive: "فعال",
    filterCompleted: "انجام‌شده",
    filterUrgent: "فوری",
    searchPlaceholder: "جستجو در کارها...",
    emptyTitle: "هیچ کاری پیدا نشد",
    emptySubtitle: "همه کارها انجام شده! با <kbd>Enter</kbd> چیز جدیدی اضافه کن.",
    clearCompleted: "پاک کردن انجام‌شده‌ها",
    clearCompletedTitle: "حذف تمام کارهای انجام‌شده",
    confirmClear: "آیا مطمئن هستید که می‌خواهید تمام کارهای انجام‌شده را پاک کنید؟",
    confirmDelete: "آیا از حذف این کار اطمینان دارید؟",
    footerShowing: (shown, total) => `${toPersianNum(shown)} از ${toPersianNum(total)} کار نمایش داده شده`,
    mottoZero: "هنوز کاری نداری. امروز رو پربار کن!",
    mottoAllDone: "تمام کارها انجام شد! عالیه.",
    mottoHalf: (remaining) => `${toPersianNum(remaining)} کار باقی‌مانده. بیش از نصف راه رو رفتی!`,
    mottoPending: (remaining) => `${toPersianNum(remaining)} کار برای امروز باقی‌مانده.`,
    today: "امروز",
    tomorrow: "فردا",
    nextSaturday: "شنبه آینده",
    noDue: "بدون موعد",
    subtasksCount: (c, t) => `${toPersianNum(c)} از ${toPersianNum(t)} زیرکار`,
    editModalTitle: "ویرایش کار",
    editLabelTitle: "عنوان کار",
    editLabelNotes: "یادداشت‌ها و توضیحات",
    editLabelCategory: "دسته‌بندی",
    editLabelPriority: "اولویت",
    editLabelDue: "موعد مقرر",
    editLabelSubtasks: "زیرکارها",
    editSave: "ذخیره تغییرات",
    editCancel: "انصراف",
    editDelete: "حذف کار",
    editSubtaskPlaceholder: "افزودن زیرکار جدید...",
    editNotesPlaceholder: "توضیحات اختیاری...",
    editDueDisplayPlaceholder: "تعیین موعد در تقویم",
    settingsHeader: "تنظیمات و ترجیحات",
    settingSoundTitle: "بازخورد صوتی",
    settingSoundDesc: "صدای ناقوس کریستالی هنگام تکمیل کارها",
    settingAotTitle: "همیشه جلو",
    settingAotDesc: "پنل کارها روی تمام پنجره‌های دیگر قرار بگیرد",
    settingCobTitle: "پنهان شدن خودکار",
    settingCobDesc: "با کلیک خارج از پنل، فوراً پنهان شود",
    settingAutostartTitle: "اجرا در استارتاپ ویندوز",
    settingAutostartDesc: "اجرای خودکار نرم‌افزار هنگام روشن شدن سیستم",
    settingThemeTitle: "پالت رنگی شیشه‌ای",
    settingThemeDesc: "زیبایی‌شناسی شفاف و اختصاصی",
    themeNames: {
      "theme-apple-frost": "شیشه مات اپل",
      "theme-obsidian": "آبسیدین",
      "theme-sapphire": "یاقوت",
      "theme-aurora": "شفق",
      "theme-emerald": "زمرد"
    },
    settingLangTitle: "زبان برنامه (Language)",
    settingLangDesc: "انتخاب بین زبان فارسی و انگلیسی",
    settingShortcutTitle: "کلید میانبر سراسری",
    settingShortcutDesc: "در هر برنامه‌ای پنل کارها را باز/بسته کنید",
    btnExport: "خروجی کارها (JSON)",
    btnSample: "بارگذاری کارهای نمونه",
    actionEdit: "ویرایش کامل",
    actionDelete: "حذف",
    actionSubtasks: "زیرکارها",
    actionMarkActive: "علامت به عنوان فعال",
    actionMarkDone: "تکمیل وظیفه",
    calPrevMonth: "ماه قبل",
    calNextMonth: "ماه بعد",
    calClose: "بستن تقویم",
    calPendingTasks: "دارای کارهای انجام‌نشده"
  },
  en: {
    appTitle: "Gleam - Frosted Glass Task Drawer",
    brandPro: "PRO",
    shortcutTitle: "Global shortcut to toggle drawer (Ctrl+Shift+Space)",
    settingsTitle: "Settings & Preferences",
    closeTitle: "Hide to tray (Esc)",
    calendarTitle: "Calendar",
    calendarAction: "Calendar ▾",
    calendarBannerTitle: "Click to open calendar",
    collapseFocusTitle: "Collapse / expand focus card",
    langToggleTitle: "Switch to Persian (تغییر زبان به فارسی)",
    langIndicator: "FA",
    focusTitle: "Daily Focus",
    statTotal: "Total",
    statCompleted: "Done",
    statUrgent: "Urgent",
    placeholderAdd: "Add a new task or idea... (Enter ↵)",
    btnSubmitTitle: "Add Task (Enter)",
    priorityHigh: "Urgent",
    priorityMed: "Medium",
    priorityLow: "Low",
    categoryPersonal: "Personal",
    categoryWork: "Work",
    categoryIdeas: "Ideas",
    categoryDaily: "Daily",
    categoryProjects: "Projects",
    categoryStudy: "Study",
    categoryHealth: "Health",
    categoryAll: "All",
    categoryGeneral: "General",
    categoriesList: [
      { value: "Personal", label: "Personal" },
      { value: "Work", label: "Work" },
      { value: "Projects", label: "Projects" },
      { value: "Study", label: "Study" },
      { value: "Health", label: "Health" },
      { value: "Ideas", label: "Ideas" },
      { value: "Daily", label: "Daily" }
    ],
    dueLabel: "Due Date",
    duePickerTitle: "Pick due date in calendar",
    filterAll: "All",
    filterActive: "Active",
    filterCompleted: "Done",
    filterUrgent: "Urgent",
    searchPlaceholder: "Search tasks...",
    emptyTitle: "No tasks found",
    emptySubtitle: "All caught up! Press <kbd>Enter</kbd> to add something new.",
    clearCompleted: "Clear Completed",
    clearCompletedTitle: "Delete all completed tasks",
    confirmClear: "Are you sure you want to clear all completed tasks?",
    confirmDelete: "Are you sure you want to delete this task?",
    footerShowing: (shown, total) => `Showing ${shown} of ${total} tasks`,
    mottoZero: "No tasks yet. Make today productive!",
    mottoAllDone: "All done for today! Fantastic job.",
    mottoHalf: (remaining) => `${remaining} tasks remaining. More than halfway there!`,
    mottoPending: (remaining) => `${remaining} tasks remaining for today.`,
    today: "Today",
    tomorrow: "Tomorrow",
    nextSaturday: "Next Week",
    noDue: "No Date",
    subtasksCount: (c, t) => `${c} of ${t} subtasks`,
    editModalTitle: "Edit Task",
    editLabelTitle: "Task Title",
    editLabelNotes: "Notes & Description",
    editLabelCategory: "Category",
    editLabelPriority: "Priority",
    editLabelDue: "Due Date",
    editLabelSubtasks: "Subtasks",
    editSave: "Save Changes",
    editCancel: "Cancel",
    editDelete: "Delete Task",
    editSubtaskPlaceholder: "Add a subtask...",
    editNotesPlaceholder: "Optional notes...",
    editDueDisplayPlaceholder: "Pick due date in calendar",
    settingsHeader: "Settings & Preferences",
    settingSoundTitle: "Audio Feedback",
    settingSoundDesc: "Crystal chime sound on task completion",
    settingAotTitle: "Always on Top",
    settingAotDesc: "Keep task panel above all other windows",
    settingCobTitle: "Auto-hide on Blur",
    settingCobDesc: "Hide drawer when clicking outside panel",
    settingAutostartTitle: "Launch on Startup",
    settingAutostartDesc: "Start Gleam automatically when Windows boots",
    settingThemeTitle: "Glass Palette",
    settingThemeDesc: "Translucent glass aesthetics",
    themeNames: {
      "theme-apple-frost": "Apple Frost",
      "theme-obsidian": "Obsidian",
      "theme-sapphire": "Sapphire",
      "theme-aurora": "Aurora",
      "theme-emerald": "Emerald"
    },
    settingLangTitle: "Language",
    settingLangDesc: "Choose between Persian and English",
    settingShortcutTitle: "Global Shortcut",
    settingShortcutDesc: "Open/close task drawer anywhere",
    btnExport: "Export Tasks (JSON)",
    btnSample: "Load Sample Tasks",
    actionEdit: "Edit Task",
    actionDelete: "Delete",
    actionSubtasks: "Subtasks",
    actionMarkActive: "Mark as active",
    actionMarkDone: "Mark as completed",
    calPrevMonth: "Previous Month",
    calNextMonth: "Next Month",
    calClose: "Close Calendar",
    calPendingTasks: "Has pending tasks"
  }
};

// استیت
let todos = [];
let settings = {
  sound_enabled: true,
  always_on_top: true,
  close_on_blur: false,
  launch_at_startup: false,
  shortcut: "CommandOrControl+Shift+Space",
  theme: "theme-apple-frost",
  lang: "fa"
};

let currentFilter = "all"; // "all" | "active" | "completed" | "high"
let currentCategory = "همه";
let searchQuery = "";
let selectedPriority = "medium";
let selectedDueDate = null;

// استیت تقویم
let calState = {
  viewYear: 1405,
  viewMonth: 7,
  selectedIso: null,
  target: "due_picker" // "due_picker" | "edit_due_picker" | "browse"
};

// استیت مودال ویرایش
let editingTaskId = null;
let editSelectedDueDate = null;
let editSelectedPriority = "medium";
let editSubtasks = [];

// Audio Synthesizer
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSound(type) {
  if (!settings.sound_enabled) return;
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    if (type === "complete") {
      // Crystal chime chord
      [880, 1174.66, 1760].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.05);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.05 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.05 + 0.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.05);
        osc.stop(now + idx * 0.05 + 0.55);
      });
    } else if (type === "uncheck") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.15);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.16);
    } else if (type === "add") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    } else if (type === "delete") {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(260, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    }
  } catch (e) {
    console.warn("Audio play error", e);
  }
}

// Elements Cache
let el = {};

function initElements() {
  el.drawer = document.getElementById("drawer");
  el.btnClose = document.getElementById("btn-close");
  el.btnSettings = document.getElementById("btn-settings");
  el.settingsModal = document.getElementById("settings-modal");
  el.btnCloseSettings = document.getElementById("btn-close-settings");

  // Form & inputs
  el.addForm = document.getElementById("add-todo-form");
  el.inputTitle = document.getElementById("new-todo-title");
  el.selectCategory = document.getElementById("new-todo-category");
  el.btnDueToggle = document.getElementById("btn-due-toggle");
  el.inputDue = document.getElementById("new-todo-due");
  el.dueLabel = document.getElementById("due-label");
  el.priorityChips = document.querySelectorAll(".priority-chip");

  // Progress
  el.progressPercent = document.getElementById("progress-percent");
  el.progressMotto = document.getElementById("progress-motto");
  el.ringProgress = document.getElementById("ring-progress");
  el.statTotal = document.getElementById("stat-total");
  el.statCompleted = document.getElementById("stat-completed");
  el.statUrgent = document.getElementById("stat-urgent");

  // Filters & Search
  el.filterTabs = document.querySelectorAll(".filter-tab");
  el.searchInput = document.getElementById("search-input");
  el.searchClear = document.getElementById("search-clear");
  el.categoryChipsList = document.getElementById("category-chips-list");

  // Tasks & Empty State
  el.tasksList = document.getElementById("tasks-list");
  el.emptyState = document.getElementById("empty-state");
  el.footerCount = document.getElementById("footer-count");
  el.btnClearCompleted = document.getElementById("btn-clear-completed");

  // Settings
  el.settingSound = document.getElementById("setting-sound");
  el.settingAlwaysOnTop = document.getElementById("setting-always-on-top");
  el.settingCloseOnBlur = document.getElementById("setting-close-on-blur");
  el.settingAutostart = document.getElementById("setting-autostart");
  el.themeChoices = document.querySelectorAll(".theme-choice");
  el.btnExportData = document.getElementById("btn-export-data");
  el.btnSampleData = document.getElementById("btn-sample-data");

  // Header extras & Date banner
  el.shortcutPill = document.querySelector(".shortcut-pill");
  el.btnToggleFocus = document.getElementById("btn-toggle-focus-card");
  el.bannerCalendarChip = document.querySelector(".calendar-chip-action");

  // Language Elements
  el.btnLangToggle = document.getElementById("btn-lang-toggle");
  el.langIndicator = document.getElementById("lang-indicator");
  el.langChoices = document.querySelectorAll(".lang-choice-btn");

  // Calendar Elements
  el.btnOpenCalendar = document.getElementById("btn-open-calendar");
  el.persianDateBanner = document.getElementById("persian-date-banner");
  el.currentPersianDate = document.getElementById("current-persian-date");
  el.calendarModal = document.getElementById("calendar-modal");
  el.btnCloseCalendar = document.getElementById("btn-close-calendar");
  el.calPrevMonth = document.getElementById("cal-prev-month");
  el.calNextMonth = document.getElementById("cal-next-month");
  el.calMonthName = document.getElementById("cal-month-name");
  el.calYearNum = document.getElementById("cal-year-num");
  el.calBtnToday = document.getElementById("cal-btn-today");
  el.calDaysGrid = document.getElementById("cal-days-grid");
  el.calQuickChips = document.querySelectorAll(".cal-quick-chip");
  el.calWeekdaysContainer = document.getElementById("cal-weekdays-container");
  el.calChipToday = document.getElementById("cal-chip-today");
  el.calChipTomorrow = document.getElementById("cal-chip-tomorrow");
  el.calChipNextSat = document.getElementById("cal-chip-next-sat");
  el.calChipClear = document.getElementById("cal-chip-clear");

  // Edit Task Modal Elements
  el.editTaskModal = document.getElementById("edit-task-modal");
  el.editTaskForm = document.getElementById("edit-task-form");
  el.btnCloseEdit = document.getElementById("btn-close-edit");
  el.editTaskId = document.getElementById("edit-task-id");
  el.editTaskTitleInput = document.getElementById("edit-task-title-input");
  el.editTaskNotesInput = document.getElementById("edit-task-notes-input");
  el.editTaskCategorySelect = document.getElementById("edit-task-category-select");
  el.editPrioBtns = document.querySelectorAll(".edit-prio-btn");
  el.btnEditDuePicker = document.getElementById("btn-edit-due-picker");
  el.editDueDisplay = document.getElementById("edit-due-display");
  el.btnEditClearDue = document.getElementById("btn-edit-clear-due");
  el.editSubtasksList = document.getElementById("edit-subtasks-list");
  el.editSubtaskInput = document.getElementById("edit-subtask-input");
  el.btnEditAddSubtask = document.getElementById("btn-edit-add-subtask");
  el.btnEditDelete = document.getElementById("btn-edit-delete");
  el.btnEditCancel = document.getElementById("btn-edit-cancel");
  el.btnEditSave = document.getElementById("btn-edit-save");
}

// Persistence
async function loadData() {
  try {
    const loadedTodos = await invoke("get_todos");
    if (Array.isArray(loadedTodos) && loadedTodos.length > 0) {
      todos = loadedTodos;
    } else {
      // داده‌های اولیه نمونه به زبان فارسی
      todos = [
        {
          id: "task-1",
          title: "طراحی رابط کاربری شیشه‌ای برای پنل کشویی دسکتاپ",
          notes: "شامل افکت blur مات شیشه و انیمیشن روان",
          completed: true,
          priority: "high",
          category: "پروژه‌ها",
          due_date: new Date().toISOString().split("T")[0],
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          subtasks: [
            { id: "sub-1", title: "راه‌اندازی بک‌اند Tauri با Rust", completed: true },
            { id: "sub-2", title: "ساخت پنل چسبیده به سمت راست مانیتور", completed: true }
          ]
        },
        {
          id: "task-2",
          title: "افزودن بازخورد صوتی کریستالی و انتخابگر تم",
          notes: "سینت‌سایزر وب‌آدیو برای صدای ناقوس شیشه",
          completed: true,
          priority: "medium",
          category: "کار",
          due_date: new Date().toISOString().split("T")[0],
          created_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          subtasks: []
        },
        {
          id: "task-3",
          title: "آزمایش کلید میانبر سراسری (Ctrl+Shift+Space)",
          notes: "بررسی Toggle آنی از هر برنامه‌ای در ویندوز",
          completed: false,
          priority: "high",
          category: "کار",
          due_date: new Date().toISOString().split("T")[0],
          created_at: new Date().toISOString(),
          completed_at: null,
          subtasks: []
        },
        {
          id: "task-4",
          title: "برنامه‌ریزی نقشه راه آخر هفته",
          notes: "",
          completed: false,
          priority: "low",
          category: "شخصی",
          due_date: null,
          created_at: new Date().toISOString(),
          completed_at: null,
          subtasks: []
        }
      ];
      await persistTodos();
    }

    const loadedSettings = await invoke("get_settings");
    if (loadedSettings) {
      settings = { ...settings, ...loadedSettings };
    }
  } catch (err) {
    console.error("خطا در بارگذاری داده:", err);
  }
}

async function persistTodos() {
  try {
    await invoke("save_todos", { todos });
  } catch (err) {
    console.error("Failed to save todos:", err);
  }
}

async function persistSettings() {
  try {
    await invoke("save_settings", { settings });
  } catch (err) {
    console.error("Failed to save settings:", err);
  }
}

// Window Management
async function closeDrawer() {
  if (el.drawer.classList.contains("closing")) return;
  el.drawer.classList.remove("opening");
  el.drawer.classList.add("closing");
  setTimeout(async () => {
    try {
      await invoke("hide_drawer");
    } catch (e) {
      console.error(e);
    }
    el.drawer.classList.remove("closing");
  }, 220);
}

// Rendering Logic
function render() {
  renderProgress();
  renderCategories();
  renderTasks();
  renderSettings();
}

function renderProgress() {
  const total = todos.length;
  const completed = todos.filter((t) => t.completed).length;
  const urgent = todos.filter((t) => !t.completed && t.priority === "high").length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  const lang = settings.lang || "fa";
  const t = I18N[lang] || I18N.fa;

  el.statTotal.textContent = toNumByLang(total);
  el.statCompleted.textContent = toNumByLang(completed);
  el.statUrgent.textContent = toNumByLang(urgent);
  el.progressPercent.textContent = lang === "fa" ? `${toPersianNum(percent)}٪` : `${percent}%`;

  if (el.currentPersianDate) {
    el.currentPersianDate.textContent = formatFullDateByLang(new Date());
  }

  // به‌روزرسانی دور حلقه بر اساس شعاع ۲۲ (محیط = 138.23)
  const maxDash = 138.23;
  const offset = maxDash - (percent / 100) * maxDash;
  el.ringProgress.style.strokeDashoffset = offset;

  if (total === 0) {
    el.progressMotto.textContent = t.mottoZero;
  } else if (percent === 100) {
    el.progressMotto.textContent = t.mottoAllDone;
  } else if (percent >= 50) {
    el.progressMotto.textContent = t.mottoHalf(total - completed);
  } else {
    el.progressMotto.textContent = t.mottoPending(total - completed);
  }
}

function renderCategories() {
  const lang = settings.lang || "fa";
  const t = I18N[lang] || I18N.fa;
  const allLabel = t.categoryAll;

  // جمع‌آوری تمام دسته‌بندی‌های منحصربه‌فرد
  const categoriesMap = {};
  categoriesMap[allLabel] = todos.length;
  todos.forEach((item) => {
    const cat = item.category || (lang === "fa" ? "عمومی" : "General");
    categoriesMap[cat] = (categoriesMap[cat] || 0) + 1;
  });

  if (!categoriesMap[currentCategory] && currentCategory !== allLabel) {
    currentCategory = allLabel;
  }

  el.categoryChipsList.innerHTML = "";
  Object.keys(categoriesMap).forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `category-pill ${currentCategory === cat ? "active" : ""}`;
    btn.textContent = `${cat} (${toNumByLang(categoriesMap[cat])})`;
    btn.addEventListener("click", () => {
      currentCategory = cat;
      render();
    });
    el.categoryChipsList.appendChild(btn);
  });
}

function renderTasks() {
  const lang = settings.lang || "fa";
  const t = I18N[lang] || I18N.fa;
  const allLabel = t.categoryAll;

  // فیلتر کردن کارها
  let filtered = todos.filter((item) => {
    // فیلتر تب
    if (currentFilter === "active" && item.completed) return false;
    if (currentFilter === "completed" && !item.completed) return false;
    if (currentFilter === "high" && item.priority !== "high") return false;

    // فیلتر دسته‌بندی
    if (currentCategory !== allLabel && currentCategory !== "همه" && currentCategory !== "All" && item.category !== currentCategory) {
      return false;
    }

    // جستجو
    if (searchQuery.trim() !== "") {
      const q = searchQuery.toLowerCase();
      const inTitle = (item.title || "").toLowerCase().includes(q);
      const inNotes = (item.notes || "").toLowerCase().includes(q);
      const inCat = (item.category || "").toLowerCase().includes(q);
      if (!inTitle && !inNotes && !inCat) return false;
    }

    return true;
  });

  // مرتب‌سازی: ابتدا ناتمام، بعد اولویت، بعد تاریخ ایجاد
  const priorityWeight = { high: 3, medium: 2, low: 1 };
  filtered.sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    const weightDiff = (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2);
    if (weightDiff !== 0) return weightDiff;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  el.tasksList.innerHTML = "";

  if (filtered.length === 0) {
    el.emptyState.style.display = "flex";
  } else {
    el.emptyState.style.display = "none";
  }

  filtered.forEach((task) => {
    const card = createTaskCard(task);
    el.tasksList.appendChild(card);
  });

  el.footerCount.textContent = t.footerShowing(filtered.length, todos.length);
}

function createTaskCard(task) {
  const lang = settings.lang || "fa";
  const t = I18N[lang] || I18N.fa;

  const card = document.createElement("div");
  card.className = `task-card priority-${task.priority} ${task.completed ? "completed" : ""}`;
  card.id = `todo-${task.id}`;

  // وضعیت تاریخ سررسید
  let dueHtml = "";
  if (task.due_date) {
    const todayStr = new Date().toISOString().split("T")[0];
    const isToday = task.due_date === todayStr;
    const isOverdue = task.due_date < todayStr && !task.completed;
    const dueClass = isOverdue ? "overdue" : isToday ? "today" : "";
    const dueText = isToday ? t.today : formatDateByLang(task.due_date);
    dueHtml = `<span class="task-due-badge ${dueClass}">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
      ${dueText}
    </span>`;
  }

  // نشانگر اولویت با متن و نشانگر برای دسترس‌پذیری WCAG
  let prioLabel = lang === "fa" ? "متوسط" : "Medium";
  let prioClass = "med";
  if (task.priority === "high") {
    prioLabel = lang === "fa" ? "فوری" : "Urgent";
    prioClass = "high";
  } else if (task.priority === "low") {
    prioLabel = lang === "fa" ? "پایین" : "Low";
    prioClass = "low";
  }
  const prioBadge = `<span class="task-tag priority-badge ${prioClass}">
    <span class="priority-indicator ${prioClass}"></span>
    ${prioLabel}
  </span>`;

  // پیشرفت زیرتسک‌ها
  const totalSubtasks = (task.subtasks || []).length;
  const completedSubtasks = (task.subtasks || []).filter((s) => s.completed).length;
  const subtasksBadge = totalSubtasks > 0 
    ? `<span class="task-tag subtasks-chip">${t.subtasksCount(completedSubtasks, totalSubtasks)}</span>` 
    : "";

  card.innerHTML = `
    <div class="task-card-main">
      <div class="task-checkbox-wrapper" data-action="toggle" role="checkbox" aria-checked="${task.completed}" tabindex="0" title="${task.completed ? (lang === 'fa' ? 'علامت به عنوان فعال' : 'Mark as active') : (lang === 'fa' ? 'تکمیل وظیفه' : 'Mark as completed')}">
        <div class="task-checkbox-custom">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      </div>
      <div class="task-content">
        <div class="task-title-row">
          <span class="task-title" dir="auto">${escapeHtml(task.title)}</span>
          <div class="task-actions">
            <button class="task-action-btn" data-action="subtasks" title="${lang === 'fa' ? 'زیرکارها' : 'Subtasks'}" aria-label="زیرکارها">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
            </button>
            <button class="task-action-btn" data-action="edit" title="${lang === 'fa' ? 'ویرایش کامل' : 'Edit Task'}" aria-label="ویرایش">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button class="task-action-btn delete-btn" data-action="delete" title="${lang === 'fa' ? 'حذف' : 'Delete'}" aria-label="حذف">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
        <div class="task-badges">
          ${prioBadge}
          <span class="task-tag category-badge">${escapeHtml(task.category || (lang === "fa" ? "عمومی" : "General"))}</span>
          ${dueHtml}
          ${subtasksBadge}
        </div>
      </div>
    </div>
    <div class="task-details-pane" style="display: none;"></div>
  `;

  // اتصال رویدادها
  const toggleBtn = card.querySelector('[data-action="toggle"]');
  toggleBtn.addEventListener("click", () => toggleTodo(task.id));

  const deleteBtn = card.querySelector('[data-action="delete"]');
  deleteBtn.addEventListener("click", () => deleteTodo(task.id));

  // باز کردن مودال زیبای شیشه‌ای برای ادیت
  const editBtn = card.querySelector('[data-action="edit"]');
  editBtn.addEventListener("click", () => openEditTaskModal(task.id));

  const subtasksBtn = card.querySelector('[data-action="subtasks"]');
  const detailsPane = card.querySelector(".task-details-pane");
  subtasksBtn.addEventListener("click", () => {
    if (detailsPane.style.display === "none") {
      renderSubtasksPane(detailsPane, task);
      detailsPane.style.display = "flex";
    } else {
      detailsPane.style.display = "none";
    }
  });

  return card;
}

function renderSubtasksPane(pane, task) {
  const lang = settings.lang || "fa";
  const placeholder = lang === "fa" ? "زیرکار جدید اضافه کن..." : "Add a subtask...";

  pane.innerHTML = `
    <div class="subtasks-list">
      ${(task.subtasks || []).map((sub) => `
        <div class="subtask-item ${sub.completed ? "completed" : ""}">
          <input type="checkbox" class="subtask-checkbox" ${sub.completed ? "checked" : ""} data-sub-id="${sub.id}" />
          <span class="subtask-title" dir="auto">${escapeHtml(sub.title)}</span>
        </div>
      `).join("")}
    </div>
    <form class="add-subtask-form">
      <input type="text" class="subtask-input" placeholder="${placeholder}" dir="auto" />
    </form>
  `;

  pane.querySelectorAll(".subtask-checkbox").forEach((cb) => {
    cb.addEventListener("change", async (e) => {
      const subId = e.target.dataset.subId;
      const targetSub = (task.subtasks || []).find((s) => s.id === subId);
      if (targetSub) {
        targetSub.completed = e.target.checked;
        if (targetSub.completed) playSound("complete");
        await persistTodos();
        render();
      }
    });
  });

  const form = pane.querySelector(".add-subtask-form");
  const input = pane.querySelector(".subtask-input");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const val = input.value.trim();
    if (val) {
      task.subtasks = task.subtasks || [];
      task.subtasks.push({
        id: "sub-" + Date.now(),
        title: val,
        completed: false
      });
      playSound("add");
      await persistTodos();
      render();
    }
  });
}

// Actions
async function toggleTodo(id) {
  const task = todos.find((t) => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  task.completed_at = task.completed ? new Date().toISOString() : null;
  playSound(task.completed ? "complete" : "uncheck");
  await persistTodos();
  render();
}

async function deleteTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  playSound("delete");
  await persistTodos();
  render();
}

// ==========================================================================
// کنترل‌کننده مودال اختصاصی ویرایش کار (Frosted Glass Edit Modal)
// ==========================================================================
function openEditTaskModal(id) {
  const task = todos.find((t) => t.id === id);
  if (!task) return;

  editingTaskId = id;
  editSelectedDueDate = task.due_date || null;
  editSelectedPriority = task.priority || "medium";
  editSubtasks = JSON.parse(JSON.stringify(task.subtasks || []));

  if (el.editTaskId) el.editTaskId.value = task.id;
  if (el.editTaskTitleInput) el.editTaskTitleInput.value = task.title || "";
  if (el.editTaskNotesInput) el.editTaskNotesInput.value = task.notes || "";
  if (el.editTaskCategorySelect) {
    el.editTaskCategorySelect.value = task.category || "Personal";
  }

  // تنظیم اولویت در دکمه‌ها
  if (el.editPrioBtns) {
    el.editPrioBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.prio === editSelectedPriority);
    });
  }

  updateEditDueDisplay();
  renderEditSubtasksList();

  if (el.editTaskModal) {
    el.editTaskModal.style.display = "flex";
    setTimeout(() => {
      if (el.editTaskTitleInput) {
        el.editTaskTitleInput.focus();
        el.editTaskTitleInput.select();
      }
    }, 60);
  }
}

function closeEditTaskModal() {
  editingTaskId = null;
  if (el.editTaskModal) {
    el.editTaskModal.style.display = "none";
  }
}

function updateEditDueDisplay() {
  if (!el.editDueDisplay) return;
  const lang = settings.lang || "fa";
  const t = I18N[lang] || I18N.fa;

  if (editSelectedDueDate) {
    const todayStr = new Date().toISOString().split("T")[0];
    const isToday = editSelectedDueDate === todayStr;
    const dueText = isToday ? t.today : formatDateByLang(editSelectedDueDate);
    el.editDueDisplay.textContent = dueText;
    if (el.btnEditClearDue) el.btnEditClearDue.style.display = "flex";
  } else {
    el.editDueDisplay.textContent = t.editDueDisplayPlaceholder;
    if (el.btnEditClearDue) el.btnEditClearDue.style.display = "none";
  }
}

function renderEditSubtasksList() {
  if (!el.editSubtasksList) return;
  el.editSubtasksList.innerHTML = "";

  if (editSubtasks.length === 0) {
    return;
  }

  editSubtasks.forEach((sub, idx) => {
    const row = document.createElement("div");
    row.className = `edit-subtask-row ${sub.completed ? "completed" : ""}`;

    const left = document.createElement("div");
    left.className = "edit-subtask-left";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "subtask-checkbox";
    cb.checked = !!sub.completed;
    cb.addEventListener("change", (e) => {
      sub.completed = e.target.checked;
      row.classList.toggle("completed", sub.completed);
      if (sub.completed) playSound("complete");
    });

    const titleSpan = document.createElement("span");
    titleSpan.textContent = sub.title;
    titleSpan.dir = "auto";

    left.appendChild(cb);
    left.appendChild(titleSpan);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn-subtask-del";
    delBtn.innerHTML = "&times;";
    delBtn.title = settings.lang === "fa" ? "حذف زیرکار" : "Delete Subtask";
    delBtn.addEventListener("click", () => {
      editSubtasks.splice(idx, 1);
      renderEditSubtasksList();
    });

    row.appendChild(left);
    row.appendChild(delBtn);
    el.editSubtasksList.appendChild(row);
  });
}

// Add New Task
async function addTodoFromInput() {
  const title = el.inputTitle.value.trim();
  if (!title) return;

  const category = el.selectCategory.value || "Personal";
  const newTask = {
    id: "task-" + Date.now(),
    title,
    notes: "",
    completed: false,
    priority: selectedPriority,
    category,
    due_date: selectedDueDate,
    created_at: new Date().toISOString(),
    completed_at: null,
    subtasks: []
  };

  todos.unshift(newTask);
  playSound("add");
  await persistTodos();

  // Reset inputs
  el.inputTitle.value = "";
  selectedDueDate = null;
  const lang = settings.lang || "fa";
  el.dueLabel.textContent = I18N[lang]?.dueLabel || "موعد";
  el.btnDueToggle.classList.remove("active");
  render();
  el.inputTitle.focus();
}

function renderSettings() {
  if (el.settingSound) el.settingSound.checked = settings.sound_enabled;
  if (el.settingAlwaysOnTop) el.settingAlwaysOnTop.checked = settings.always_on_top;
  if (el.settingCloseOnBlur) el.settingCloseOnBlur.checked = settings.close_on_blur;
  if (el.settingAutostart) el.settingAutostart.checked = !!settings.launch_at_startup;

  // Apply theme
  document.body.className = settings.theme || "theme-apple-frost";
  el.themeChoices.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === settings.theme);
  });
}

// Escape HTML utility
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ==========================================================================
// کنترل‌کننده تقویم (Calendar Logic - Persian & Gregorian)
// ==========================================================================
function initCalendarState() {
  const now = new Date();
  const { jy, jm } = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  calState.viewYear = jy;
  calState.viewMonth = jm;
}

function openCalendarModal(target = "due_picker") {
  calState.target = target;
  const targetIso = (target === "edit_due_picker") ? editSelectedDueDate : selectedDueDate;

  if (targetIso) {
    const [y, m, d] = targetIso.split("-").map(Number);
    const { jy, jm } = gregorianToJalali(y, m, d);
    calState.viewYear = jy;
    calState.viewMonth = jm;
    calState.selectedIso = targetIso;
  } else {
    const now = new Date();
    const { jy, jm } = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    calState.viewYear = jy;
    calState.viewMonth = jm;
    calState.selectedIso = null;
  }

  if (el.calendarModal) {
    el.calendarModal.style.display = "flex";
    renderCalendar();
  }
}

function closeCalendarModal() {
  if (el.calendarModal) {
    el.calendarModal.style.display = "none";
  }
}

function renderCalendar() {
  if (!el.calMonthName || !el.calDaysGrid) return;
  const lang = settings.lang || "fa";

  // به‌روزرسانی سرستون‌های روزهای هفته
  if (el.calWeekdaysContainer) {
    el.calWeekdaysContainer.innerHTML = "";
    const weekdaysList = (lang === "fa") ? JALALI_WEEKDAYS_SHORT_FA : GREGORIAN_WEEKDAYS_SHORT_EN;
    weekdaysList.forEach((w, idx) => {
      const span = document.createElement("span");
      span.textContent = w;
      if (lang === "fa" && idx === 6) {
        span.style.color = "var(--accent-danger)";
        span.style.opacity = "0.85";
      }
      el.calWeekdaysContainer.appendChild(span);
    });
  }

  el.calMonthName.textContent = (lang === "fa") ? JALALI_MONTHS[calState.viewMonth - 1] : JALALI_MONTHS_EN[calState.viewMonth - 1];
  el.calYearNum.textContent = toNumByLang(calState.viewYear);

  // روز هفته برای اول ماه شمسی (شنبه = 0، یکشنبه = 1 ... جمعه = 6)
  const gStart = jalaliToGregorian(calState.viewYear, calState.viewMonth, 1);
  const startDate = new Date(gStart.gy, gStart.gm - 1, gStart.gd);
  const startDayOfWeek = (startDate.getDay() + 1) % 7;

  const totalDays = getJalaliMonthDays(calState.viewYear, calState.viewMonth);

  // امروز به شمسی
  const now = new Date();
  const todayJalali = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());

  el.calDaysGrid.innerHTML = "";

  // سلول‌های خالی برای شیفت روز شروع ماه
  for (let i = 0; i < startDayOfWeek; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "cal-day-cell other-month";
    el.calDaysGrid.appendChild(emptyCell);
  }

  const activeSelected = (calState.target === "edit_due_picker") ? editSelectedDueDate : selectedDueDate;

  // روزهای ماه شمسی
  for (let d = 1; d <= totalDays; d++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cal-day-cell";
    cell.textContent = toNumByLang(d);

    const gDay = jalaliToGregorian(calState.viewYear, calState.viewMonth, d);
    const isoDate = `${gDay.gy}-${String(gDay.gm).padStart(2, "0")}-${String(gDay.gd).padStart(2, "0")}`;

    if (calState.viewYear === todayJalali.jy && calState.viewMonth === todayJalali.jm && d === todayJalali.jd) {
      cell.classList.add("today");
      cell.title = lang === "fa" ? "امروز" : "Today";
    }

    if (calState.selectedIso === isoDate || activeSelected === isoDate) {
      cell.classList.add("selected");
    }

    if (lang === "fa" && (startDayOfWeek + d - 1) % 7 === 6) {
      cell.classList.add("weekend");
    }

    const hasTasks = todos.some((t) => t.due_date === isoDate && !t.completed);
    if (hasTasks) {
      cell.classList.add("has-tasks");
      cell.title = (cell.title ? cell.title + " - " : "") + (lang === "fa" ? "دارای کارهای انجام‌نشده" : "Has pending tasks");
    }

    cell.addEventListener("click", () => {
      applySelectedDate(isoDate);
    });

    el.calDaysGrid.appendChild(cell);
  }
}

function applySelectedDate(isoDate) {
  calState.selectedIso = isoDate;
  const lang = settings.lang || "fa";
  const t = I18N[lang] || I18N.fa;

  if (calState.target === "edit_due_picker") {
    editSelectedDueDate = isoDate;
    updateEditDueDisplay();
    closeCalendarModal();
    return;
  }

  selectedDueDate = isoDate;
  if (isoDate) {
    const todayStr = new Date().toISOString().split("T")[0];
    const isToday = isoDate === todayStr;
    const dueText = isToday ? t.today : formatDateByLang(isoDate);
    el.dueLabel.textContent = dueText;
    el.btnDueToggle.classList.add("active");
  } else {
    el.dueLabel.textContent = t.dueLabel;
    el.btnDueToggle.classList.remove("active");
  }
  closeCalendarModal();
}

// ==========================================================================
// کنترل‌کننده تغییر زبان (Language Switcher Controller)
// ==========================================================================
function applyLanguage(lang) {
  settings.lang = lang;
  const t = I18N[lang] || I18N.fa;

  // تنظیم خصوصیات ریشه HTML و جهت نوشتاری RTL/LTR
  document.documentElement.lang = lang;
  document.documentElement.dir = (lang === "fa") ? "rtl" : "ltr";
  document.title = t.appTitle;

  // دکمه تغییر سریع زبان در هدر
  if (el.langIndicator) el.langIndicator.textContent = t.langIndicator;
  if (el.btnLangToggle) el.btnLangToggle.title = t.langToggleTitle;
  if (el.btnOpenCalendar) el.btnOpenCalendar.title = t.calendarTitle;
  if (el.btnSettings) el.btnSettings.title = t.settingsTitle;
  if (el.btnClose) el.btnClose.title = t.closeTitle;
  if (el.shortcutPill) el.shortcutPill.title = t.shortcutTitle;
  if (el.btnToggleFocus) el.btnToggleFocus.title = t.collapseFocusTitle;

  // نوار تاریخ بالای پنل
  if (el.persianDateBanner) el.persianDateBanner.title = t.calendarBannerTitle;
  if (el.bannerCalendarChip) el.bannerCalendarChip.textContent = t.calendarAction;
  if (el.currentPersianDate) el.currentPersianDate.textContent = formatFullDateByLang(new Date());

  // دکمه‌های انتخابگر زبان در مودال تنظیمات
  if (el.langChoices) {
    el.langChoices.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.lang === lang);
    });
  }

  // کارت پیشرفت
  const progressTitleEl = document.querySelector(".progress-title");
  if (progressTitleEl) progressTitleEl.textContent = t.focusTitle;

  const statPills = document.querySelectorAll(".stat-pill");
  if (statPills[0]) statPills[0].innerHTML = `<strong id="stat-total">${toNumByLang(todos.length)}</strong> ${t.statTotal}`;
  if (statPills[1]) statPills[1].innerHTML = `<strong id="stat-completed">${toNumByLang(todos.filter((x) => x.completed).length)}</strong> ${t.statCompleted}`;
  if (statPills[2]) statPills[2].innerHTML = `<strong id="stat-urgent">${toNumByLang(todos.filter((x) => !x.completed && x.priority === "high").length)}</strong> ${t.statUrgent}`;

  // فیلد افزودن کار
  if (el.inputTitle) el.inputTitle.placeholder = t.placeholderAdd;
  const btnSubmit = document.getElementById("btn-add-submit");
  if (btnSubmit) btnSubmit.title = t.btnSubmitTitle;

  // چیپ‌های اولویت در فرم افزودن
  const chipHigh = document.querySelector('.priority-chip[data-priority="high"]');
  if (chipHigh) {
    chipHigh.innerHTML = `<span class="priority-indicator high"></span> ${t.priorityHigh}`;
    chipHigh.title = `${t.editLabelPriority}: ${t.priorityHigh}`;
  }
  const chipMed = document.querySelector('.priority-chip[data-priority="medium"]');
  if (chipMed) {
    chipMed.innerHTML = `<span class="priority-indicator med"></span> ${t.priorityMed}`;
    chipMed.title = `${t.editLabelPriority}: ${t.priorityMed}`;
  }
  const chipLow = document.querySelector('.priority-chip[data-priority="low"]');
  if (chipLow) {
    chipLow.innerHTML = `<span class="priority-indicator low"></span> ${t.priorityLow}`;
    chipLow.title = `${t.editLabelPriority}: ${t.priorityLow}`;
  }

  if (!selectedDueDate && el.dueLabel) {
    el.dueLabel.textContent = t.dueLabel;
  }
  if (el.btnDueToggle) {
    el.btnDueToggle.title = t.duePickerTitle;
  }

  // به‌روزرسانی منوهای آبشاری دسته‌بندی
  updateCategoryDropdowns(lang);

  // تب‌های فیلتر
  const tabAll = document.querySelector('.filter-tab[data-filter="all"]');
  if (tabAll) tabAll.textContent = t.filterAll;
  const tabActive = document.querySelector('.filter-tab[data-filter="active"]');
  if (tabActive) tabActive.textContent = t.filterActive;
  const tabCompleted = document.querySelector('.filter-tab[data-filter="completed"]');
  if (tabCompleted) tabCompleted.textContent = t.filterCompleted;
  const tabHigh = document.querySelector('.filter-tab[data-filter="high"]');
  if (tabHigh) tabHigh.textContent = t.filterUrgent;

  // نوار جستجو
  if (el.searchInput) el.searchInput.placeholder = t.searchPlaceholder;

  // وضعیت خالی
  const emptyH3 = document.querySelector("#empty-state h3");
  if (emptyH3) emptyH3.textContent = t.emptyTitle;
  const emptyP = document.querySelector("#empty-state p");
  if (emptyP) emptyP.innerHTML = t.emptySubtitle;

  // پاورقی
  if (el.btnClearCompleted) {
    el.btnClearCompleted.textContent = t.clearCompleted;
    el.btnClearCompleted.title = t.clearCompletedTitle;
  }

  // مودال ویرایش کار
  const editModalTitle = document.getElementById("edit-modal-title");
  if (editModalTitle) editModalTitle.textContent = t.editModalTitle;
  const editLabelTitle = document.getElementById("edit-label-title");
  if (editLabelTitle) editLabelTitle.textContent = t.editLabelTitle;
  const editLabelNotes = document.getElementById("edit-label-notes");
  if (editLabelNotes) editLabelNotes.textContent = t.editLabelNotes;
  const editLabelCategory = document.getElementById("edit-label-category");
  if (editLabelCategory) editLabelCategory.textContent = t.editLabelCategory;
  const editLabelPriority = document.getElementById("edit-label-priority");
  if (editLabelPriority) editLabelPriority.textContent = t.editLabelPriority;
  const editLabelDue = document.getElementById("edit-label-due");
  if (editLabelDue) editLabelDue.textContent = t.editLabelDue;
  const editLabelSubtasks = document.getElementById("edit-label-subtasks");
  if (editLabelSubtasks) editLabelSubtasks.textContent = t.editLabelSubtasks;
  const editPrioHigh = document.getElementById("edit-prio-high");
  if (editPrioHigh) editPrioHigh.textContent = t.priorityHigh;
  const editPrioMed = document.getElementById("edit-prio-med");
  if (editPrioMed) editPrioMed.textContent = t.priorityMed;
  const editPrioLow = document.getElementById("edit-prio-low");
  if (editPrioLow) editPrioLow.textContent = t.priorityLow;
  if (el.btnEditSave) el.btnEditSave.textContent = t.editSave;
  if (el.btnEditCancel) el.btnEditCancel.textContent = t.editCancel;
  if (el.btnEditDelete) el.btnEditDelete.textContent = t.editDelete;
  if (el.editSubtaskInput) el.editSubtaskInput.placeholder = t.editSubtaskPlaceholder;
  if (el.editTaskNotesInput) el.editTaskNotesInput.placeholder = t.editNotesPlaceholder;
  if (el.btnCloseEdit) el.btnCloseEdit.title = t.closeTitle;

  // تقویم و گزینه‌های سریع
  if (el.calBtnToday) el.calBtnToday.textContent = t.today;
  if (el.calChipToday) el.calChipToday.textContent = t.today;
  if (el.calChipTomorrow) el.calChipTomorrow.textContent = t.tomorrow;
  if (el.calChipNextSat) el.calChipNextSat.textContent = t.nextSaturday;
  if (el.calChipClear) el.calChipClear.textContent = t.noDue;
  if (el.calPrevMonth) el.calPrevMonth.title = t.calPrevMonth;
  if (el.calNextMonth) el.calNextMonth.title = t.calNextMonth;
  if (el.btnCloseCalendar) el.btnCloseCalendar.title = t.calClose;

  // مودال تنظیمات
  const settingsModalH3 = document.querySelector("#settings-modal .modal-header h3");
  if (settingsModalH3) settingsModalH3.textContent = t.settingsHeader;
  const settingTitleSound = document.getElementById("setting-title-sound");
  if (settingTitleSound) settingTitleSound.textContent = t.settingSoundTitle;
  const settingDescSound = document.getElementById("setting-desc-sound");
  if (settingDescSound) settingDescSound.textContent = t.settingSoundDesc;

  const settingTitleAot = document.getElementById("setting-title-aot");
  if (settingTitleAot) settingTitleAot.textContent = t.settingAotTitle;
  const settingDescAot = document.getElementById("setting-desc-aot");
  if (settingDescAot) settingDescAot.textContent = t.settingAotDesc;

  const settingTitleCob = document.getElementById("setting-title-cob");
  if (settingTitleCob) settingTitleCob.textContent = t.settingCobTitle;
  const settingDescCob = document.getElementById("setting-desc-cob");
  if (settingDescCob) settingDescCob.textContent = t.settingCobDesc;

  const settingTitleAutostart = document.getElementById("setting-title-autostart");
  if (settingTitleAutostart) settingTitleAutostart.textContent = t.settingAutostartTitle;
  const settingDescAutostart = document.getElementById("setting-desc-autostart");
  if (settingDescAutostart) settingDescAutostart.textContent = t.settingAutostartDesc;

  const settingTitleTheme = document.getElementById("setting-title-theme");
  if (settingTitleTheme) settingTitleTheme.textContent = t.settingThemeTitle;
  const settingDescTheme = document.getElementById("setting-desc-theme");
  if (settingDescTheme) settingDescTheme.textContent = t.settingThemeDesc;

  // اسامی تم‌ها در پنل انتخاب
  el.themeChoices.forEach((btn) => {
    const themeKey = btn.dataset.theme;
    const nameSpan = btn.querySelector(".theme-name");
    if (nameSpan && t.themeNames && t.themeNames[themeKey]) {
      nameSpan.textContent = t.themeNames[themeKey];
    }
  });

  const settingTitleLang = document.getElementById("setting-title-lang");
  if (settingTitleLang) settingTitleLang.textContent = t.settingLangTitle;
  const settingDescLang = document.getElementById("setting-desc-lang");
  if (settingDescLang) settingDescLang.textContent = t.settingLangDesc;

  const settingTitleShortcut = document.getElementById("setting-title-shortcut");
  if (settingTitleShortcut) settingTitleShortcut.textContent = t.settingShortcutTitle;
  const settingDescShortcut = document.getElementById("setting-desc-shortcut");
  if (settingDescShortcut) settingDescShortcut.textContent = t.settingShortcutDesc;

  if (el.btnExportData) el.btnExportData.textContent = t.btnExport;
  if (el.btnSampleData) el.btnSampleData.textContent = t.btnSample;
  if (el.btnCloseSettings) el.btnCloseSettings.title = t.closeTitle;

  // به‌روزرسانی منوی سیستم تری در Rust
  try {
    invoke("update_tray_menu", { lang });
  } catch (_) {}

  render();
}

function updateCategoryDropdowns(lang) {
  const t = I18N[lang] || I18N.fa;
  const list = t.categoriesList || [];

  if (el.selectCategory) {
    const curVal = el.selectCategory.value;
    el.selectCategory.innerHTML = "";
    list.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.value;
      opt.textContent = c.label;
      el.selectCategory.appendChild(opt);
    });
    if (curVal) el.selectCategory.value = curVal;
  }

  if (el.editTaskCategorySelect) {
    const curVal = el.editTaskCategorySelect.value;
    el.editTaskCategorySelect.innerHTML = "";
    list.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.value;
      opt.textContent = c.label;
      el.editTaskCategorySelect.appendChild(opt);
    });
    if (curVal) el.editTaskCategorySelect.value = curVal;
  }
}

// Event Listeners Setup
function setupListeners() {
  // Drawer close button & hotkey
  el.btnClose.addEventListener("click", closeDrawer);

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (el.editTaskModal && el.editTaskModal.style.display !== "none") {
        closeEditTaskModal();
      } else if (el.calendarModal && el.calendarModal.style.display !== "none") {
        closeCalendarModal();
      } else if (el.settingsModal && el.settingsModal.style.display !== "none") {
        el.settingsModal.style.display = "none";
      } else {
        closeDrawer();
      }
    }
  });

  // Settings Modal
  el.btnSettings.addEventListener("click", () => {
    el.settingsModal.style.display = "flex";
  });
  el.btnCloseSettings.addEventListener("click", () => {
    el.settingsModal.style.display = "none";
  });
  el.settingsModal.addEventListener("click", (e) => {
    if (e.target === el.settingsModal) {
      el.settingsModal.style.display = "none";
    }
  });

  // Language Switcher Events
  if (el.btnLangToggle) {
    el.btnLangToggle.addEventListener("click", async () => {
      const nextLang = (settings.lang === "fa") ? "en" : "fa";
      applyLanguage(nextLang);
      await persistSettings();
    });
  }

  if (el.langChoices) {
    el.langChoices.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const chosenLang = btn.dataset.lang;
        if (chosenLang && chosenLang !== settings.lang) {
          applyLanguage(chosenLang);
          await persistSettings();
        }
      });
    });
  }

  // Edit Task Modal Events
  if (el.editTaskForm) {
    el.editTaskForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!editingTaskId) return;
      const task = todos.find((t) => t.id === editingTaskId);
      if (task) {
        task.title = el.editTaskTitleInput.value.trim() || task.title;
        task.notes = el.editTaskNotesInput.value.trim();
        task.category = el.editTaskCategorySelect.value;
        task.priority = editSelectedPriority;
        task.due_date = editSelectedDueDate;
        task.subtasks = editSubtasks;
        playSound("add");
        await persistTodos();
        render();
      }
      closeEditTaskModal();
    });
  }

  if (el.btnCloseEdit) el.btnCloseEdit.addEventListener("click", closeEditTaskModal);
  if (el.btnEditCancel) el.btnEditCancel.addEventListener("click", closeEditTaskModal);
  if (el.editTaskModal) {
    el.editTaskModal.addEventListener("click", (e) => {
      if (e.target === el.editTaskModal) closeEditTaskModal();
    });
  }

  if (el.btnEditDelete) {
    el.btnEditDelete.addEventListener("click", async () => {
      if (!editingTaskId) return;
      await deleteTodo(editingTaskId);
      closeEditTaskModal();
    });
  }

  if (el.editPrioBtns) {
    el.editPrioBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        el.editPrioBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        editSelectedPriority = btn.dataset.prio;
      });
    });
  }

  if (el.btnEditDuePicker) {
    el.btnEditDuePicker.addEventListener("click", () => {
      openCalendarModal("edit_due_picker");
    });
  }

  if (el.btnEditClearDue) {
    el.btnEditClearDue.addEventListener("click", (e) => {
      e.stopPropagation();
      editSelectedDueDate = null;
      updateEditDueDisplay();
    });
  }

  const addSubtaskInEdit = () => {
    const val = el.editSubtaskInput.value.trim();
    if (val) {
      editSubtasks.push({
        id: "sub-" + Date.now(),
        title: val,
        completed: false
      });
      el.editSubtaskInput.value = "";
      renderEditSubtasksList();
      playSound("add");
    }
  };

  if (el.btnEditAddSubtask) {
    el.btnEditAddSubtask.addEventListener("click", addSubtaskInEdit);
  }
  if (el.editSubtaskInput) {
    el.editSubtaskInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addSubtaskInEdit();
      }
    });
  }

  // Settings switches
  el.settingSound.addEventListener("change", async (e) => {
    settings.sound_enabled = e.target.checked;
    await persistSettings();
  });
  el.settingAlwaysOnTop.addEventListener("change", async (e) => {
    settings.always_on_top = e.target.checked;
    await persistSettings();
  });
  el.settingCloseOnBlur.addEventListener("change", async (e) => {
    settings.close_on_blur = e.target.checked;
    await persistSettings();
  });
  if (el.settingAutostart) {
    el.settingAutostart.addEventListener("change", async (e) => {
      const enabled = e.target.checked;
      settings.launch_at_startup = enabled;
      try {
        await invoke("set_autostart", { enabled });
      } catch (err) {
        console.error("Failed to set autostart:", err);
      }
      await persistSettings();
    });
  }

  // Theme selection
  el.themeChoices.forEach((btn) => {
    btn.addEventListener("click", async () => {
      settings.theme = btn.dataset.theme;
      await persistSettings();
      renderSettings();
    });
  });

  // Export & Demo Data
  el.btnExportData.addEventListener("click", () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(todos, null, 2));
    const dlAnchorElem = document.createElement("a");
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `gleam_backup_${new Date().toISOString().split("T")[0]}.json`);
    dlAnchorElem.click();
  });

  el.btnSampleData.addEventListener("click", async () => {
    todos = [
      {
        id: "demo-1",
        title: "مرور نقشه راه فصلی و تحویل‌های اسپرینت",
        notes: "دامنه پروژه مفصل",
        completed: false,
        priority: "high",
        category: "کار",
        due_date: new Date().toISOString().split("T")[0],
        created_at: new Date().toISOString(),
        completed_at: null,
        subtasks: [
          { id: "sub-d1", title: "بررسی pull request‌ها", completed: true },
          { id: "sub-d2", title: "به‌روزرسانی changelog", completed: false }
        ]
      },
      {
        id: "demo-2",
        title: "ورزش: ۴۵ دقیقه تمرین قدرتی",
        notes: "",
        completed: true,
        priority: "medium",
        category: "سلامتی",
        due_date: new Date().toISOString().split("T")[0],
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        subtasks: []
      },
      {
        id: "demo-3",
        title: "مطالعه ۲۰ صفحه از طراحی سیستم‌های Rust",
        notes: "",
        completed: false,
        priority: "low",
        category: "مطالعه",
        due_date: null,
        created_at: new Date().toISOString(),
        completed_at: null,
        subtasks: []
      }
    ];
    await persistTodos();
    render();
    el.settingsModal.style.display = "none";
  });

  // Add Todo Form
  el.addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    addTodoFromInput();
  });

  // Priority Selector
  el.priorityChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      el.priorityChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      selectedPriority = chip.dataset.priority;
    });
  });

  // Due Date Selector -> باز کردن تقویم
  el.btnDueToggle.addEventListener("click", (e) => {
    e.preventDefault();
    openCalendarModal("due_picker");
  });

  // کلیک روی دکمه تقویم در هدر
  if (el.btnOpenCalendar) {
    el.btnOpenCalendar.addEventListener("click", () => {
      openCalendarModal("browse");
    });
  }

  // کلیک روی نوار تاریخ بالای پنل
  if (el.persianDateBanner) {
    el.persianDateBanner.addEventListener("click", () => {
      openCalendarModal("browse");
    });
  }

  // بستن تقویم
  if (el.btnCloseCalendar) {
    el.btnCloseCalendar.addEventListener("click", closeCalendarModal);
  }

  if (el.calendarModal) {
    el.calendarModal.addEventListener("click", (e) => {
      if (e.target === el.calendarModal) {
        closeCalendarModal();
      }
    });
  }

  // ناوبری ماه‌های شمسی (ماه قبل / ماه بعد)
  if (el.calPrevMonth) {
    el.calPrevMonth.addEventListener("click", () => {
      calState.viewMonth--;
      if (calState.viewMonth < 1) {
        calState.viewMonth = 12;
        calState.viewYear--;
      }
      renderCalendar();
    });
  }

  if (el.calNextMonth) {
    el.calNextMonth.addEventListener("click", () => {
      calState.viewMonth++;
      if (calState.viewMonth > 12) {
        calState.viewMonth = 1;
        calState.viewYear++;
      }
      renderCalendar();
    });
  }

  // دکمه بازگشت به «امروز»
  if (el.calBtnToday) {
    el.calBtnToday.addEventListener("click", () => {
      const now = new Date();
      const { jy, jm } = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
      calState.viewYear = jy;
      calState.viewMonth = jm;
      renderCalendar();
    });
  }

  // دکمه‌های اقدام سریع در تقویم
  el.calQuickChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const action = chip.dataset.quick;
      const now = new Date();
      if (action === "today") {
        applySelectedDate(now.toISOString().split("T")[0]);
      } else if (action === "tomorrow") {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        applySelectedDate(tomorrow.toISOString().split("T")[0]);
      } else if (action === "next-saturday") {
        const target = new Date(now);
        const day = target.getDay(); // 6 is Sat
        const diff = (6 - day + 7) % 7 || 7;
        target.setDate(target.getDate() + diff);
        applySelectedDate(target.toISOString().split("T")[0]);
      } else if (action === "clear") {
        applySelectedDate(null);
      }
    });
  });

  // Filter Tabs
  el.filterTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      el.filterTabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.filter;
      render();
    });
  });

  // Search
  el.searchInput.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    el.searchClear.style.display = searchQuery ? "block" : "none";
    render();
  });

  el.searchClear.addEventListener("click", () => {
    el.searchInput.value = "";
    searchQuery = "";
    el.searchClear.style.display = "none";
    render();
  });

  // Toggle Collapsible Focus Card
  const btnToggleFocus = document.getElementById("btn-toggle-focus-card");
  const progressCard = document.getElementById("progress-card");
  if (btnToggleFocus && progressCard) {
    const isCollapsed = localStorage.getItem("gleam_focus_collapsed") === "true";
    if (isCollapsed) progressCard.classList.add("collapsed");

    btnToggleFocus.addEventListener("click", () => {
      progressCard.classList.toggle("collapsed");
      localStorage.setItem("gleam_focus_collapsed", progressCard.classList.contains("collapsed"));
    });
  }

  // Clear completed with confirmation
  el.btnClearCompleted.addEventListener("click", async () => {
    const completedCount = todos.filter((t) => t.completed).length;
    if (completedCount === 0) return;

    const lang = settings.lang || "fa";
    const confirmMsg = lang === "fa"
      ? `آیا از حذف ${toPersianNum(completedCount)} کار انجام‌شده اطمینان دارید؟`
      : `Are you sure you want to clear ${completedCount} completed tasks?`;

    if (window.confirm(confirmMsg)) {
      todos = todos.filter((t) => !t.completed);
      playSound("delete");
      await persistTodos();
      render();
    }
  });

  // Focus add input when opened via tray
  if (listen) {
    listen("focus-add-input", () => {
      if (el.inputTitle) {
        setTimeout(() => el.inputTitle.focus(), 150);
      }
    });

    listen("drawer-opened", () => {
      // Re-trigger slide-in animation cleanly
      el.drawer.classList.remove("closing");
      el.drawer.classList.remove("opening");
      void el.drawer.offsetWidth;
      el.drawer.classList.add("opening");
      if (el.inputTitle) {
        setTimeout(() => el.inputTitle.focus(), 120);
      }
    });

    listen("request-close-drawer", () => {
      closeDrawer();
    });
  }
}

// Bootstrap
window.addEventListener("DOMContentLoaded", async () => {
  initElements();
  initCalendarState();
  setupListeners();
  await loadData();
  applyLanguage(settings.lang || "fa");
});

