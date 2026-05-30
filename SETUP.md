# Training App – Setup Guide

מדריך הגדרה לאפליקציית האימונים. כל הסכמה, מדיניות האבטחה, וההגדרה הראשונית של המאמן.

---

## 1. יצירת פרויקט Supabase

1. היכנס/י ל-[supabase.com](https://supabase.com) ופתח/י חשבון (חינמי).
2. צור/י פרויקט חדש (`New project`). בחר/י סיסמה ל-DB ושמור/י אותה.
3. אחרי שהפרויקט מוכן (1-2 דקות), היכנס/י ל-**Settings → API** והעתק/י:
   - `Project URL` (משהו כמו `https://xxxx.supabase.co`)
   - `anon public` key

## 2. עדכון הקוד

ערכ/י את הקובץ `assets/supabase.js` והחלף/י את שני הקבועים:

```js
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

## 3. יצירת הסכמה (SQL Schema)

בדשבורד של Supabase, היכנס/י ל-**SQL Editor** והרץ/י את הסקריפט הבא:

```sql
-- ===== profiles (מורחב מ-auth.users) =====
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  is_admin boolean default false,
  created_at timestamptz default now()
);

-- ===== workouts =====
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  workout_date date not null,
  start_time time not null,
  duration_min int,
  max_participants int,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create index on public.workouts(workout_date);

-- ===== registrations =====
create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  unique (workout_id, user_id)
);

-- ===== RLS =====
alter table public.profiles enable row level security;
alter table public.workouts enable row level security;
alter table public.registrations enable row level security;

-- כל משתמש מחובר רואה את כל הפרופילים (כדי שהמאמן יוכל לראות שמות נרשמים)
create policy "profiles_read_all" on public.profiles
  for select using (auth.role() = 'authenticated');

create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id);

-- כל מחובר רואה אימונים
create policy "workouts_read_all" on public.workouts
  for select using (auth.role() = 'authenticated');

-- רק מאמן יכול להוסיף/לערוך/למחוק אימונים
create policy "workouts_admin_write" on public.workouts
  for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- הרשמות: כולם רואים, אבל אפשר להירשם/לבטל רק את עצמך
create policy "regs_read_all" on public.registrations
  for select using (auth.role() = 'authenticated');

create policy "regs_insert_self" on public.registrations
  for insert with check (auth.uid() = user_id);

create policy "regs_delete_self" on public.registrations
  for delete using (auth.uid() = user_id);

-- ===== טריגר ליצירת profile אוטומטית בהרשמת משתמש =====
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

## 4. יצירת משתמשים

בדשבורד של Supabase: **Authentication → Users → Add user → Create new user**.

- אפשר להשתמש באימייל פיקטיבי (למשל `dani@trainer.local`) — Supabase לא דורש אימות.
- וודא/י שמסומן ✅ `Auto Confirm User` (אחרת המשתמש לא יוכל להתחבר).

לאחר היצירה, המשתמש יופיע אוטומטית בטבלת `profiles` (בזכות הטריגר). אם תרצה/י לערוך שם — היכנס/י ל-**Table Editor → profiles**.

## 5. הפיכת עצמך למאמן

ב-**Table Editor → profiles**, מצא/י את השורה שלך ושנה/י את `is_admin` ל-`true`. עכשיו הקישור "פאנל מאמן" יופיע אחרי התחברות.

## 6. (אופציונלי) ביטול הרשמה עצמית

כברירת מחדל, Supabase מאפשר לכל אחד להירשם דרך מסך התחברות פתוח. כדי שרק את/ה תייצר/י משתמשים:

**Authentication → Providers → Email** → כבה/י את `Enable Sign Ups`.

## 7. שיעורי ניסיון (טריאלים)

האפליקציה תומכת בהזמנת שיעור ניסיון ללא הרשמה (טופס פתוח לכלל). זה דורש 2 שלבים:

### 7.1 הוספת עמודות לטבלת profiles

ב-**SQL Editor** הרץ/י:

```sql
alter table public.profiles
  add column if not exists is_trial boolean default false,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists trial_goal text,
  add column if not exists trial_source text,
  add column if not exists trial_status text default 'pending';

-- Update the trigger to handle anonymous users
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, is_trial)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1), 'אורח'),
    coalesce(new.is_anonymous, false)
  );
  return new;
end; $$;
```

### 7.2 הפעלת Anonymous Sign-Ins

בדשבורד של Supabase:
1. **Authentication → Providers**
2. גלול/י עד **Anonymous Sign-Ins**
3. הפעל/י (Toggle On) ושמור/י

זה מאפשר למתאמני טריאל להירשם בלי לפתוח חשבון.

---

## 7.2.1 מנויים, כניסות, נוכחות ובקשות תשלום

עוד מיגרציה שצריך להריץ — היא מוסיפה את מערכת הכרטיסיות, הנוכחות ובקשות התשלום:

```sql
-- 1. profiles: subscription fields
alter table public.profiles
  add column if not exists subscription_type text default 'none',
  add column if not exists entries_remaining int default 0,
  add column if not exists subscription_expires_at date;

-- 2. registrations: track if a credit was consumed + attendance
alter table public.registrations
  add column if not exists credit_consumed boolean default false,
  add column if not exists attendance text;
-- attendance values: null (pending), 'attended', 'no_show'

-- 3. payment requests (self-reported, admin confirms)
create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null,
  amount_ils numeric(8,2) not null,
  status text not null default 'pending',
  created_at timestamptz default now(),
  confirmed_at timestamptz
);

alter table public.payment_requests enable row level security;

drop policy if exists "payments_read_own_or_admin" on public.payment_requests;
create policy "payments_read_own_or_admin" on public.payment_requests
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "payments_insert_own" on public.payment_requests;
create policy "payments_insert_own" on public.payment_requests
  for insert with check (user_id = auth.uid());

drop policy if exists "payments_admin_update" on public.payment_requests;
create policy "payments_admin_update" on public.payment_requests
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

-- 4. RPC functions for atomic credit consumption/refund
create or replace function public.consume_entry(p_user uuid)
returns boolean language plpgsql security definer as $$
declare v_credits int; v_expires date;
begin
  select entries_remaining, subscription_expires_at
    into v_credits, v_expires
    from public.profiles where id = p_user;
  if v_credits is null or v_credits <= 0 then return false; end if;
  if v_expires is not null and v_expires < current_date then return false; end if;
  update public.profiles set entries_remaining = entries_remaining - 1 where id = p_user;
  return true;
end; $$;

create or replace function public.refund_entry(p_user uuid)
returns void language plpgsql security definer as $$
begin
  update public.profiles set entries_remaining = entries_remaining + 1 where id = p_user;
end; $$;
```

## 7.2.2 עדכון מספר ה-Bit שלך

ערוך/י את `assets/supabase.js`, שורה עם `BIT_PHONE`, ועדכן/י לטלפון Bit שלך:

```js
const BIT_PHONE = '050-XXXXXXX';
```

אפשר גם לעדכן את המחירים ב-`PRODUCTS` אם רוצה/ה אחרת מ-700₪/80₪.

---

## 7.3 הרשאת מאמן למחיקת טריאלים

לצורך כפתור "מחק" של טריאל בפאנל המאמן:

```sql
create policy if not exists "profiles_admin_delete" on public.profiles
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy if not exists "regs_admin_delete" on public.registrations
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

create policy if not exists "profiles_admin_update" on public.profiles
  for update using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
```

---

## 8. דפלוי

הקבצים כבר מוכנים ל-GitHub Pages. push לפעולה ראשית והאפליקציה תהיה זמינה ב-`https://USERNAME.github.io/`.

---

## מבנה הקבצים

```
index.html         דף התחברות
schedule.html      לוח אימונים שבועי + הרשמה/ביטול
admin.html         פאנל מאמן (הוספה/עריכה/משתתפים)
assets/
  style.css        עיצוב שחור/אפור מינימליסטי
  supabase.js      הגדרות + helpers משותפים
  schedule.js      לוגיקת לוח האימונים
  admin.js         לוגיקת פאנל המאמן
```
