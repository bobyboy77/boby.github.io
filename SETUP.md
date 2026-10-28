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
drop policy if exists "profiles_admin_delete" on public.profiles;
create policy "profiles_admin_delete" on public.profiles
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "regs_admin_delete" on public.registrations;
create policy "regs_admin_delete" on public.registrations
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
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

---

## 8. מעקב אישי — מפגשים, תוכניות והתקדמות

### 8.1 הרצת SQL ב-Supabase

כנס לדשבורד Supabase → SQL Editor ← הרץ את הסקריפט הבא:

```sql
-- עמודות מפגשים אישיים על profiles
alter table public.profiles
  add column if not exists pt_sessions_total int default 0,
  add column if not exists pt_sessions_used  int default 0;

-- לוג מפגשים אישיים
create table if not exists public.personal_sessions (
  id           uuid primary key default gen_random_uuid(),
  trainee_id   uuid not null references auth.users(id) on delete cascade,
  session_date date not null default current_date,
  notes        text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz default now()
);

-- תוכניות אימון
create table if not exists public.workout_plans (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);

-- תרגילים בתוכנית
create table if not exists public.plan_exercises (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.workout_plans(id) on delete cascade,
  exercise_name text not null,
  sets          int,
  reps          text,
  rest_sec      int,
  notes         text,
  sort_order    int default 0
);

-- שיוך תוכנית למתאמן
create table if not exists public.plan_assignments (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.workout_plans(id) on delete cascade,
  trainee_id  uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz default now(),
  unique (plan_id, trainee_id)
);

-- לוג התקדמות
create table if not exists public.progress_logs (
  id            uuid primary key default gen_random_uuid(),
  trainee_id    uuid not null references auth.users(id) on delete cascade,
  exercise_name text not null,
  log_date      date not null default current_date,
  reps          int,
  hold_sec      int,
  weight_kg     numeric(5,2),
  notes         text,
  logged_by     uuid not null references auth.users(id),
  created_at    timestamptz default now()
);

-- RLS: personal_sessions
alter table public.personal_sessions enable row level security;
drop policy if exists "ps_admin_all" on public.personal_sessions;
create policy "ps_admin_all" on public.personal_sessions for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
drop policy if exists "ps_trainee_read" on public.personal_sessions;
create policy "ps_trainee_read" on public.personal_sessions for select to authenticated
  using (trainee_id = auth.uid());

-- RLS: workout_plans (כולם קוראים, רק אדמין כותב)
alter table public.workout_plans enable row level security;
drop policy if exists "plans_read_all" on public.workout_plans;
create policy "plans_read_all" on public.workout_plans for select to authenticated using (true);
drop policy if exists "plans_admin_write" on public.workout_plans;
create policy "plans_admin_write" on public.workout_plans for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- RLS: plan_exercises (כולם קוראים, רק אדמין כותב)
alter table public.plan_exercises enable row level security;
drop policy if exists "pe_read_all" on public.plan_exercises;
create policy "pe_read_all" on public.plan_exercises for select to authenticated using (true);
drop policy if exists "pe_admin_write" on public.plan_exercises;
create policy "pe_admin_write" on public.plan_exercises for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- RLS: plan_assignments
alter table public.plan_assignments enable row level security;
drop policy if exists "pa_trainee_read" on public.plan_assignments;
create policy "pa_trainee_read" on public.plan_assignments for select to authenticated
  using (trainee_id = auth.uid());
drop policy if exists "pa_admin_all" on public.plan_assignments;
create policy "pa_admin_all" on public.plan_assignments for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- RLS: progress_logs
alter table public.progress_logs enable row level security;
drop policy if exists "prog_trainee_read" on public.progress_logs;
create policy "prog_trainee_read" on public.progress_logs for select to authenticated
  using (trainee_id = auth.uid());
drop policy if exists "prog_admin_all" on public.progress_logs;
create policy "prog_admin_all" on public.progress_logs for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
```

---

## 9. מנויים חודשיים + חיזוק אבטחה

מנוי חודשי עם מכסת כניסות שמתאפסת ב-1 לכל חודש, הוראת קבע או תקופה קצובה, והקפאה.
השימוש נספר מתוך ההרשמות (`credit_source = 'monthly'`) לפי החודש של האימון, כך שאין צורך באיפוס.
ההרשמה והביטול עוברים דרך פונקציות בשרת, כדי שלא יהיה אפשר לעקוף את המכסה.

> הרץ/י את ה-SQL ומיד אחר כך מזג/י את ה-PR. בין שני הצעדים ההרשמה באתר הישן לא תעבוד.

```sql
-- 1. profiles: monthly membership fields
alter table public.profiles
  add column if not exists monthly_plan text default 'none',   -- 'none' | 'monthly'
  add column if not exists monthly_entries int,                -- null = unlimited
  add column if not exists billing_type text,                  -- 'standing_order' | 'fixed'
  add column if not exists membership_start date,
  add column if not exists membership_end date,                -- null for standing order
  add column if not exists frozen_from date,
  add column if not exists frozen_until date;

-- 2. registrations: which pool the entry came from ('monthly' | 'card')
alter table public.registrations
  add column if not exists credit_source text;
update public.registrations set credit_source = 'card'
  where credit_consumed and credit_source is null;

-- 3. helper
create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

-- 4. booking (atomic: capacity, monthly quota, freeze, punch card)
create or replace function public.book_workout(p_workout uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_w public.workouts%rowtype;
  v_p public.profiles%rowtype;
  v_taken int;
  v_used int;
  v_month date;
  v_reason text := 'no_membership';
begin
  if v_user is null then return 'no_membership'; end if;

  select * into v_w from public.workouts where id = p_workout for update;
  if not found then return 'error'; end if;
  if (v_w.workout_date + v_w.start_time) < (now() at time zone 'Asia/Jerusalem') then
    return 'past';
  end if;

  select * into v_p from public.profiles where id = v_user for update;
  if not found then return 'no_membership'; end if;

  if exists (select 1 from public.registrations where workout_id = p_workout and user_id = v_user) then
    return 'already';
  end if;

  select count(*) into v_taken from public.registrations where workout_id = p_workout;
  if v_w.max_participants is not null and v_taken >= v_w.max_participants then
    return 'full';
  end if;

  if v_p.is_admin then
    insert into public.registrations (workout_id, user_id) values (p_workout, v_user);
    return 'ok';
  end if;

  -- monthly membership
  if v_p.monthly_plan = 'monthly' then
    if (v_p.membership_start is not null and v_w.workout_date < v_p.membership_start)
       or (v_p.membership_end is not null and v_w.workout_date > v_p.membership_end) then
      v_reason := 'outside_membership';
    elsif v_p.frozen_from is not null and v_w.workout_date >= v_p.frozen_from
          and (v_p.frozen_until is null or v_w.workout_date <= v_p.frozen_until) then
      v_reason := 'frozen';
    else
      v_month := date_trunc('month', v_w.workout_date)::date;
      select count(*) into v_used
        from public.registrations r
        join public.workouts w on w.id = r.workout_id
       where r.user_id = v_user
         and r.credit_source = 'monthly'
         and w.workout_date >= v_month
         and w.workout_date < (v_month + interval '1 month')::date;
      if v_p.monthly_entries is null or v_used < v_p.monthly_entries then
        insert into public.registrations (workout_id, user_id, credit_source)
          values (p_workout, v_user, 'monthly');
        return 'ok';
      end if;
      v_reason := 'quota_reached';
    end if;
  end if;

  -- punch card (also covers extra entries beyond the monthly quota)
  if coalesce(v_p.entries_remaining, 0) > 0
     and (v_p.subscription_expires_at is null
          or v_p.subscription_expires_at >= (now() at time zone 'Asia/Jerusalem')::date) then
    update public.profiles set entries_remaining = entries_remaining - 1 where id = v_user;
    insert into public.registrations (workout_id, user_id, credit_consumed, credit_source)
      values (p_workout, v_user, true, 'card');
    return 'ok_card';
  end if;

  return v_reason;
end; $$;

-- 5. cancellation (12h rule enforced here; refunds punch card entries only)
create or replace function public.cancel_booking(p_workout uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_r public.registrations%rowtype;
  v_w public.workouts%rowtype;
begin
  select * into v_r from public.registrations
   where workout_id = p_workout and user_id = v_user for update;
  if not found then return 'not_registered'; end if;

  select * into v_w from public.workouts where id = p_workout;
  if not public.current_user_is_admin()
     and (v_w.workout_date + v_w.start_time) - (now() at time zone 'Asia/Jerusalem') < interval '12 hours' then
    return 'too_late';
  end if;

  delete from public.registrations where id = v_r.id;

  if v_r.credit_source = 'card' or (v_r.credit_source is null and v_r.credit_consumed) then
    update public.profiles set entries_remaining = coalesce(entries_remaining, 0) + 1 where id = v_user;
    return 'ok_refunded';
  end if;
  return 'ok';
end; $$;

revoke execute on function public.book_workout(uuid) from public, anon;
revoke execute on function public.cancel_booking(uuid) from public, anon;
grant execute on function public.book_workout(uuid) to authenticated;
grant execute on function public.cancel_booking(uuid) to authenticated;

-- 6. old credit functions: refund_entry let any user add credits to anyone
drop function if exists public.consume_entry(uuid);
drop function if exists public.refund_entry(uuid);

-- 7. trainees can no longer change protected columns on their own profile
--    (previously anyone could set is_admin = true on themselves)
create or replace function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  -- current_user is 'authenticated' for API calls, the owner inside security-definer functions
  if current_user in ('authenticated', 'anon') and not public.current_user_is_admin() then
    new.is_admin := old.is_admin;
    new.is_trial := old.is_trial;
    new.trial_status := old.trial_status;
    new.subscription_type := old.subscription_type;
    new.entries_remaining := old.entries_remaining;
    new.subscription_expires_at := old.subscription_expires_at;
    new.monthly_plan := old.monthly_plan;
    new.monthly_entries := old.monthly_entries;
    new.billing_type := old.billing_type;
    new.membership_start := old.membership_start;
    new.membership_end := old.membership_end;
    new.frozen_from := old.frozen_from;
    new.frozen_until := old.frozen_until;
    new.pt_sessions_total := old.pt_sessions_total;
    new.pt_sessions_used := old.pt_sessions_used;
  end if;
  return new;
end; $$;

drop trigger if exists protect_profile_columns on public.profiles;
create trigger protect_profile_columns
  before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- 8. registrations: members book only via book_workout; trial users insert directly (trial form)
drop policy if exists "regs_insert_self" on public.registrations;
drop policy if exists "regs_insert_trial_self" on public.registrations;
create policy "regs_insert_trial_self" on public.registrations
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_trial)
  );

drop policy if exists "regs_delete_self" on public.registrations;

-- admin marks attendance
drop policy if exists "regs_admin_update" on public.registrations;
create policy "regs_admin_update" on public.registrations
  for update using (public.current_user_is_admin());
```
