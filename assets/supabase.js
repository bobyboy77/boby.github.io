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

// ===== Subscription products =====
// Update BIT_PHONE to your phone number used in the Bit app.
const BIT_PHONE = '054-4288658';

const PRODUCTS = {
  card_10: {
    key: 'card_10',
    label: 'כרטיסיית 10 כניסות',
    entries: 10,
    validMonths: 3,
    price: 450,
  },
  single: {
    key: 'single',
    label: 'שיעור בודד',
    entries: 1,
    validMonths: 1,
    price: 60,
  },
};

function subscriptionStatusText(profile) {
  if (!profile || profile.subscription_type === 'none' || !profile.subscription_type) {
    return 'אין מנוי פעיל';
  }
  const product = PRODUCTS[profile.subscription_type];
  const label = product?.label || profile.subscription_type;
  const entries = profile.entries_remaining ?? 0;
  const expires = profile.subscription_expires_at;
  let text = `${label} • ${entries} כניסות`;
  if (expires) {
    const d = new Date(expires + 'T00:00:00');
    const today = new Date();
    const expired = d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
    text += ` • ${expired ? 'פג ב-' : 'בתוקף עד '}${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  }
  return text;
}

function subscriptionIsActive(profile) {
  if (!profile) return false;
  if ((profile.entries_remaining ?? 0) <= 0) return false;
  if (profile.subscription_expires_at) {
    const exp = new Date(profile.subscription_expires_at + 'T23:59:59');
    if (exp < new Date()) return false;
  }
  return true;
}

async function consumeEntry(userId) {
  const { data, error } = await sb.rpc('consume_entry', { p_user: userId });
  if (error) { console.error('consume_entry', error); return false; }
  return !!data;
}

async function refundEntry(userId) {
  const { error } = await sb.rpc('refund_entry', { p_user: userId });
  if (error) console.error('refund_entry', error);
}

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

// Opens Apple Calendar directly via data URI (no file download on iOS/Mac).
// On iOS Safari / macOS, this opens the Calendar app with the event ready to save.
function openAppleCalendar(workout) {
  const content = generateIcs(workout);
  const dataUri = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(content);
  const a = document.createElement('a');
  a.href = dataUri;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
          <button class="btn ghost" data-cal-act="apple">🍎 Apple Calendar</button>
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
  root.querySelector('[data-cal-act="apple"]').addEventListener('click', () => {
    openAppleCalendar(workout);
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

// ===== Workout details modal (used by trainees + admin) =====
async function showWorkoutDetails(workout, options = {}) {
  const { isAdmin = false, onChange } = options;
  const root = ensureModalRoot();

  // 1. Fetch registrations for this workout
  const { data: regs, error: regsError } = await sb
    .from('registrations')
    .select('id, user_id, attendance')
    .eq('workout_id', workout.id);

  if (regsError) {
    console.error('showWorkoutDetails: failed to fetch registrations', regsError);
  }

  // 2. Fetch profiles for those users (separate query — more reliable than relational join)
  const profilesMap = {};
  if (regs && regs.length) {
    const userIds = regs.map((r) => r.user_id);
    const { data: profiles, error: profilesError } = await sb
      .from('profiles')
      .select('id, full_name, phone, is_trial, subscription_type, entries_remaining')
      .in('id', userIds);
    if (profilesError) console.error('showWorkoutDetails: failed to fetch profiles', profilesError);
    for (const p of profiles || []) profilesMap[p.id] = p;
  }

  // 3. Combine
  const participants = (regs || []).map((r) => ({
    ...r,
    profiles: profilesMap[r.user_id] || {},
  }));
  const count = participants.length;

  let participantsHtml;
  if (isAdmin) {
    participantsHtml = participants.length ? participants.map((p) => {
      const pr = p.profiles || {};
      const name = escapeModalHtml(pr.full_name || 'משתמש');
      const phone = pr.phone ? `<a href="tel:${escapeModalHtml(pr.phone)}" style="color:inherit;text-decoration:underline">${escapeModalHtml(pr.phone)}</a>` : '';
      const trial = pr.is_trial ? '<span class="trial-badge">🆕 טריאל</span>' : '';
      const sub = pr.subscription_type && pr.subscription_type !== 'none'
        ? `<span class="dim" style="font-size:11px">${escapeModalHtml(PRODUCTS[pr.subscription_type]?.label || pr.subscription_type)} • ${pr.entries_remaining ?? 0} כניסות</span>`
        : '';
      const attended = p.attendance === 'attended';
      const noShow = p.attendance === 'no_show';
      return `
        <div class="participant-row">
          <div class="participant-info">
            <div>${name} ${trial}</div>
            <div style="font-size:12px;color:var(--text-dim)">${phone}</div>
            ${sub ? `<div>${sub}</div>` : ''}
          </div>
          <div class="participant-actions">
            <button class="btn small ${attended ? 'success-solid' : 'ghost'}" data-att="attended" data-reg="${p.id}">✓ הגיע</button>
            <button class="btn small ${noShow ? 'danger-solid' : 'ghost'}" data-att="no_show" data-reg="${p.id}">✗ לא הגיע</button>
          </div>
        </div>
      `;
    }).join('') : '<div class="empty" style="padding:24px 0">אין נרשמים</div>';
  } else {
    participantsHtml = `<p class="modal-message">נרשמו: ${count}${workout.max_participants ? `/${workout.max_participants}` : ''}</p>`;
  }

  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-card" style="max-width:520px">
        <h3>${escapeModalHtml(workout.title)}</h3>
        <p class="modal-message" style="margin-bottom:12px">
          ${escapeModalHtml(formatDate(workout.workout_date))} • ${escapeModalHtml(formatTime(workout.start_time))}
          ${workout.duration_min ? ` • ${workout.duration_min} דק׳` : ''}
        </p>
        ${workout.notes ? `<p class="modal-message" style="font-style:italic">${escapeModalHtml(workout.notes)}</p>` : ''}
        ${isAdmin ? `<h4 style="font-size:14px;margin:16px 0 8px;color:var(--text-dim)">משתתפים (${count}${workout.max_participants ? `/${workout.max_participants}` : ''})</h4>` : ''}
        <div class="participants-list">${participantsHtml}</div>
        <div class="modal-actions" style="margin-top:20px">
          <button class="btn ghost" data-act="close">סגירה</button>
        </div>
      </div>
    </div>
  `;

  const close = () => { root.innerHTML = ''; };

  root.querySelector('[data-act="close"]').addEventListener('click', close);
  root.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) close();
  });

  if (isAdmin) {
    root.querySelectorAll('[data-att]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const regId = btn.dataset.reg;
        const newAtt = btn.dataset.att;
        const reg = participants.find((p) => p.id === regId);
        const finalAtt = reg?.attendance === newAtt ? null : newAtt;

        const { error } = await sb
          .from('registrations')
          .update({ attendance: finalAtt })
          .eq('id', regId);
        if (error) { toast('שגיאה בעדכון', 'error'); console.error(error); return; }

        toast('עודכן', 'success');
        // Re-open the modal to refresh
        await showWorkoutDetails(workout, options);
        if (onChange) onChange();
      });
    });
  }
}

// ===== Payment via Bit =====
async function showBitPayment(product, userId) {
  const root = ensureModalRoot();
  root.innerHTML = `
    <div class="modal-backdrop">
      <div class="modal-card">
        <h3>תשלום בביט</h3>
        <p class="modal-message">
          <strong>${escapeModalHtml(product.label)}</strong><br/>
          סכום: <strong>${product.price}₪</strong>
        </p>
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:16px">
          <div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">שלח/י בביט למספר:</div>
          <div style="font-size:22px;font-weight:700;letter-spacing:1px" id="bitPhoneDisplay">${escapeModalHtml(BIT_PHONE)}</div>
        </div>
        <p style="color:var(--text-mute);font-size:13px;margin-bottom:16px">
          1. פתח/י את אפליקציית Bit ושלח/י ${product.price}₪.<br/>
          2. כשסיימת, לחץ/י "שילמתי" — נאשר ונפעיל את המנוי.
        </p>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn" data-act="paid">שילמתי</button>
          <button class="btn ghost" data-act="copy">📋 העתק מספר</button>
          <button class="btn ghost" data-act="cancel">סגירה</button>
        </div>
      </div>
    </div>
  `;

  const close = () => { root.innerHTML = ''; };

  root.querySelector('[data-act="cancel"]').addEventListener('click', close);
  root.querySelector('[data-act="copy"]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(BIT_PHONE);
      toast('המספר הועתק', 'success');
    } catch {
      toast('לא הצלחנו להעתיק. סמן/י ידנית.', 'error');
    }
  });
  root.querySelector('[data-act="paid"]').addEventListener('click', async () => {
    const { error } = await sb.from('payment_requests').insert({
      user_id: userId,
      product: product.key,
      amount_ils: product.price,
    });
    if (error) {
      toast('שגיאה ביצירת בקשת התשלום', 'error');
      console.error(error);
      return;
    }
    close();
    await confirmDialog({
      title: 'תודה!',
      message: `הבקשה נשלחה למאמן/ת. ברגע שהתשלום יאושר ${product.entries} כניסות יתווספו לכרטיסייה שלך.`,
      confirmText: 'הבנתי',
      cancelText: '',
    });
  });
}
