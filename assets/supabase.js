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
function weekRange() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const start = new Date(now);
  start.setDate(now.getDate() - day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}
