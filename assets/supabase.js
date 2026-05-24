// ===== Supabase Configuration =====
// Replace these with your Supabase project credentials.
// Find them in your Supabase dashboard: Settings -> API
const SUPABASE_URL = 'https://fwkskymkisontznlgpxb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ3a3NreW1raXNvbnR6bmxncHhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Mzk3ODMsImV4cCI6MjA5NTExNTc4M30.3AEyGYDG8K-Frp36xZNonvtgcXlsFjyn204P1Z7tTAI';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== Shared helpers =====
function toast(message, type = '') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = 'toast ' + type + ' show';
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(() => el.classList.remove('show'), 2800);
}

async function requireAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}

async function getProfile(userId) {
  const { data, error } = await sb
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) console.error(error);
  return data;
}

async function logout() {
  await sb.auth.signOut();
  window.location.href = 'index.html';
}

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return `${DAY_NAMES[d.getDay()]} • ${d.getDate()}/${d.getMonth() + 1}`;
}

function formatTime(t) {
  return t ? t.slice(0, 5) : '';
}

// Returns YYYY-MM-DD for the Sunday of this week, and Saturday end of week.
function weekRange(offset = 0) {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const start = new Date(now);
  start.setDate(now.getDate() - day + offset * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

// ===== Cancellation policy =====
const CANCEL_DEADLINE_HOURS = 12;

function workoutDateTime(workout) {
  return new Date(`${workout.workout_date}T${workout.start_time}`);
}

function hoursUntilWorkout(workout) {
  const diffMs = workoutDateTime(workout) - new Date();
  return diffMs / (1000 * 60 * 60);
}

function canCancel(workout) {
  return hoursUntilWorkout(workout) >= CANCEL_DEADLINE_HOURS;
}

function isPastWorkout(workout) {
  return workoutDateTime(workout) < new Date();
}

// ===== Modal helpers =====
function ensureModalRoot() {
  let root = document.getElementById('modalRoot');
  if (!root) {
    root = document.createElement('div');
    root.id = 'modalRoot';
    document.body.appendChild(root);
  }
  return root;
}

function confirmDialog({ title, message, confirmText = 'אישור', cancelText = 'ביטול', danger = false }) {
  return new Promise((resolve) => {
    const root = ensureModalRoot();
    const hasCancel = !!cancelText;
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <h3>${escapeModalHtml(title || '')}</h3>
          ${message ? `<p class="modal-message">${escapeModalHtml(message)}</p>` : ''}
          <div class="modal-actions">
            ${hasCancel ? `<button class="btn ghost" data-act="cancel">${escapeModalHtml(cancelText)}</button>` : ''}
            <button class="btn ${danger ? 'danger-solid' : ''}" data-act="ok">${escapeModalHtml(confirmText)}</button>
          </div>
        </div>
      </div>
    `;
    const close = (result) => {
      root.innerHTML = '';
      resolve(result);
    };
    if (hasCancel) {
      root.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
      root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) close(false);
      });
    }
    root.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));
  });
}

// ===== Calendar export (.ics + Google Calendar URL) =====
function workoutCalendarDates(workout) {
  const start = new Date(`${workout.workout_date}T${workout.start_time}`);
  const durationMs = (workout.duration_min || 60) * 60 * 1000;
  const end = new Date(start.getTime() + durationMs);
  return { start, end };
}

function icsTimestamp(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function generateIcs(workout) {
  const { start, end } = workoutCalendarDates(workout);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Training//HE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${workout.id}@training.app`,
    `DTSTAMP:${icsTimestamp(new Date())}`,
    `DTSTART:${icsTimestamp(start)}`,
    `DTEND:${icsTimestamp(end)}`,
    `SUMMARY:${icsEscape(workout.title)}`,
  ];
  if (workout.notes) lines.push(`DESCRIPTION:${icsEscape(workout.notes)}`);
  lines.push(
    'BEGIN:VALARM',
    'TRIGGER:-PT24H',
    'ACTION:DISPLAY',
    'DESCRIPTION:תזכורת לאימון מחר',
    'END:VALARM',
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:תזכורת לאימון בעוד שעה',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  );
  return lines.join('\r\n');
}

function icsEscape(s) {
  return String(s || '').replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
}

function downloadIcs(workout) {
  const content = generateIcs(workout);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `workout-${workout.workout_date}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function googleCalendarUrl(workout) {
  const { start, end } = workoutCalendarDates(workout);
  const dates = `${icsTimestamp(start)}/${icsTimestamp(end)}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: workout.title || 'אימון',
    dates: dates,
  });
  if (workout.notes) params.set('details', workout.notes);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

async function showCalendarOptions(workout) {
  const root = ensureModalRoot();
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-card">
        <h3>הוסף ליומן</h3>
        <p class="modal-message">${escapeModalHtml(workout.title)} • ${escapeModalHtml(formatDate(workout.workout_date))} ${escapeModalHtml(formatTime(workout.start_time))}</p>
        <p style="color:var(--text-mute);font-size:13px;margin-bottom:16px">כולל תזכורות אוטומטיות 24 שעות + שעה לפני האימון</p>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
          <button class="btn" data-cal-act="google">📅 Google Calendar</button>
          <button class="btn ghost" data-cal-act="ics">⬇️ הורד קובץ (Apple / Outlook)</button>
        </div>
        <div class="modal-actions">
          <button class="btn ghost" data-cal-act="cancel">סגירה</button>
        </div>
      </div>
    </div>
  `;
  const close = () => { root.innerHTML = ''; };

  root.querySelector('[data-cal-act="google"]').addEventListener('click', () => {
    window.open(googleCalendarUrl(workout), '_blank');
    close();
  });
  root.querySelector('[data-cal-act="ics"]').addEventListener('click', () => {
    downloadIcs(workout);
    toast('הקובץ ירד — פתח/י אותו כדי להוסיף ליומן', 'success');
    close();
  });
  root.querySelector('[data-cal-act="cancel"]').addEventListener('click', close);
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) close();
  });
}

function promptDialog({ title, fields = [], confirmText = 'שמירה' }) {
  return new Promise((resolve) => {
    const root = ensureModalRoot();
    const fieldsHtml = fields.map((f) => `
      <div class="field">
        <label>${escapeModalHtml(f.label)}</label>
        <input type="${f.type || 'text'}" data-name="${escapeModalHtml(f.name)}"
               value="${escapeModalHtml(f.value ?? '')}"
               ${f.min !== undefined ? `min="${f.min}"` : ''}
               ${f.max !== undefined ? `max="${f.max}"` : ''} />
      </div>
    `).join('');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <h3>${escapeModalHtml(title || '')}</h3>
          ${fieldsHtml}
          <div class="modal-actions">
            <button class="btn ghost" data-act="cancel">ביטול</button>
            <button class="btn" data-act="ok">${escapeModalHtml(confirmText)}</button>
          </div>
        </div>
      </div>
    `;
    const close = (result) => {
      root.innerHTML = '';
      resolve(result);
    };
    const collect = () => {
      const result = {};
      for (const f of fields) {
        const input = root.querySelector(`input[data-name="${f.name}"]`);
        result[f.name] = input ? input.value : '';
      }
      return result;
    };
    root.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null));
    root.querySelector('[data-act="ok"]').addEventListener('click', () => close(collect()));
    root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal-backdrop')) close(null);
    });
    const firstInput = root.querySelector('input');
    if (firstInput) firstInput.focus();
  });
}

function escapeModalHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
