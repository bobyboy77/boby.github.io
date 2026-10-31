/* =========================================================================
   הלב"ס — מנוע החישוב והממשק
   ========================================================================= */
(function () {
  'use strict';

  const app = document.getElementById('app');
  const progress = document.getElementById('progress');
  const progressBar = document.getElementById('progressBar');
  const STORE_KEY = 'lalas-answers-v1';

  /* ---------------------------------------------------------------------
     שאלון
     --------------------------------------------------------------------- */
  const cityOptions = CITIES.map(c => [c.id, c.name]).sort((a, b) => a[1].localeCompare(b[1], 'he'));
  const sectorOptions = Object.entries(SECTORS).map(([k, v]) => [k, v.label]);

  const STEPS = [
    {
      title: 'שלב 1: מי אתה, באמת',
      sub: 'בלי פילטרים של אינסטגרם. המערכת יודעת לזהות שקרים (לא באמת, אבל תהיה כן — זה לטובתך).',
      qs: [
        { id: 'age', type: 'number', label: 'בן כמה אתה?', min: 18, max: 75, def: 30 },
        { id: 'city', type: 'select', label: 'איפה אתה גר?', options: cityOptions, def: 'tlv', hint: 'אם העיר שלך לא ברשימה — בחר את הקרובה אליה.' },
        { id: 'sector', type: 'chips', label: 'אורח חיים', options: sectorOptions, def: 'sec' },
        { id: 'height', type: 'range', label: 'גובה', min: 150, max: 205, def: 175, unit: 'ס"מ', hint: 'בלי נעליים. בלי "עם ג\'ל זה 1.80".' },
        { id: 'looks', type: 'range', label: 'כמה אתה נראה טוב?', min: 1, max: 10, def: 6, unit: 'מתוך 10', hint: 'הציון שחברה כנה הייתה נותנת לך. לא אמא שלך.' },
        { id: 'edu', type: 'chips', label: 'השכלה', def: 'ba', options: [['hs', 'תיכון / בגרות'], ['pro', 'מקצועי / הנדסאי'], ['ba', 'תואר ראשון'], ['ma', 'תואר שני ומעלה']] },
        { id: 'income', type: 'chips', label: 'הכנסה', def: 'mid', options: [['low', 'מתחת לממוצע'], ['mid', 'בערך ממוצע'], ['high', 'מעל הממוצע'], ['vhigh', 'הייטק עם אופציות']] },
        { id: 'fitness', type: 'chips', label: 'כושר', def: 'some', options: [['couch', 'ספה מקצוען'], ['some', 'מתאמן כשיש מצב רוח'], ['active', 'מתאמן קבוע'], ['athlete', 'ספורטאי']] },
        { id: 'social', type: 'chips', label: 'איך אתה בחברה?', def: 'normal', options: [['shy', 'ביישן'], ['normal', 'רגיל, נחמד'], ['charm', 'כריזמטי, מצחיק']] },
        { id: 'smoke', type: 'chips', label: 'מעשן?', def: 'no', options: [['no', 'לא'], ['yes', 'כן']] },
        { id: 'housing', type: 'chips', label: 'מגורים', def: 'rent', options: [['parents', 'אצל ההורים'], ['rent', 'שוכר'], ['own', 'בעל דירה']] },
        { id: 'initiative', type: 'chips', label: 'כמה פעמים אתה ניגש להכיר?', def: 'rare', options: [['never', 'אף פעם, אני מחכה שיקרה'], ['rare', 'פעם בחודש'], ['often', 'פעם בשבוע'], ['lots', 'כמה פעמים בשבוע']] },
      ],
    },
    {
      title: 'שלב 2: מה אתה מחפש',
      sub: 'פה אנחנו בודקים אם אתה ריאלי, חולם, או צנוע מדי.',
      qs: [
        { id: 'ageRange', type: 'pair', label: 'טווח גילאים שלה', min: 18, max: 75, def: [25, 32] },
        { id: 'sectorsOpen', type: 'multi', label: 'אורח החיים שלה (אפשר כמה)', options: sectorOptions, def: ['sec'] },
        { id: 'looksWant', type: 'chips', label: 'כמה חשוב לך המראה?', def: 'cute', options: [['any', 'העיקר שתהיה נחמדה'], ['cute', 'חמודה'], ['pretty', 'יפה מאוד'], ['model', 'דוגמנית']] },
        { id: 'eduWant', type: 'chips', label: 'השכלה שלה', def: 'any', options: [['any', 'לא משנה'], ['degree', 'עם תואר'], ['adv', 'תואר שני ומעלה']] },
        { id: 'heightWant', type: 'chips', label: 'גובה שלה', def: 'any', options: [['any', 'לא משנה'], ['notTaller', 'לא גבוהה ממני'], ['petite', 'נמוכה (עד 1.60)'], ['tall', 'גבוהה (1.70+)']] },
        { id: 'kidsOk', type: 'chips', label: 'ילדים מקשר קודם?', def: 'yes', options: [['yes', 'אין בעיה'], ['no', 'מעדיף שלא']] },
        { id: 'travel', type: 'chips', label: 'כמה רחוק אתה מוכן לנסוע בשביל אהבה?', def: 'region', options: [['local', 'רק בעיר שלי'], ['region', 'עד 40 דק\''], ['anywhere', 'לכל מקום, אפילו לאילת']] },
        {
          id: 'musts', type: 'multi', label: 'חובה מבחינתך (תהיה כן)', def: [], hint: 'כל סימון מקטין את המאגר. אנחנו רק אומרים.',
          options: [['fit', 'בכושר מעולה'], ['career', 'קרייריסטית מצליחה'], ['kidsNow', 'רוצה ילדים כבר מחר'], ['football', 'אוהדת כדורגל'], ['mom', 'מסתדרת עם אמא שלך'], ['cook', 'מבשלת כמו סבתא'], ['punctual', 'תמיד מגיעה בזמן'], ['noPhone', 'לא בטלפון כל היום'], ['noEx', 'בלי אקסים בכלל']],
        },
      ],
    },
  ];

  /* ---------------------------------------------------------------------
     מצב
     --------------------------------------------------------------------- */
  let answers = loadAnswers();
  let rejections = answers._rej != null ? answers._rej : 2;

  function defaults() {
    const a = {};
    STEPS.forEach(s => s.qs.forEach(q => { a[q.id] = Array.isArray(q.def) ? q.def.slice() : q.def; }));
    return a;
  }
  function loadAnswers() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { saved = null; }
    return Object.assign(defaults(), saved || {});
  }
  function saveAnswers() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(Object.assign({}, answers, { _rej: rejections }))); } catch (e) { /* ignore */ }
  }

  /* ---------------------------------------------------------------------
     עזרי מתמטיקה
     --------------------------------------------------------------------- */
  function erf(x) {
    const s = Math.sign(x); x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const phi = z => 0.5 * (1 + erf(z / Math.SQRT2));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function interp(table, x) {
    if (x <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      if (x <= table[i][0]) {
        const [x0, y0] = table[i - 1], [x1, y1] = table[i];
        return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
      }
    }
    return table[table.length - 1][1];
  }
  function km(a, b) {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmt = n => Math.round(n).toLocaleString('he-IL');
  function fmtSmart(n) {
    if (n >= 100) return fmt(Math.round(n / 10) * 10);
    if (n >= 10) return fmt(n);
    if (n >= 1) return n.toFixed(1);
    if (n >= 0.05) return n.toFixed(2);
    return '0';
  }

  /* ---------------------------------------------------------------------
     מודל
     --------------------------------------------------------------------- */
  const MUST_FRAC = { fit: 0.35, career: 0.4, kidsNow: 0.45, football: 0.15, mom: 0.6, cook: 0.25, punctual: 0.3, noPhone: 0.12, noEx: 0.1 };
  const LOOKS_FRAC = { any: 1, cute: 0.6, pretty: 0.25, model: 0.04 };
  const OPEN_NOW = 0.7; // חלק מהפנויות שבאמת פתוחות לקשר כרגע
  const SPARK = 0.05;   // הסיכוי לניצוץ אמיתי עם מי שמתאימה על הנייר

  /* כמה היא תהיה מעוניינת בו (ללא גיל ומגזר) */
  function baseAcceptance(p) {
    let f = 1;
    f *= clamp(phi((p.height - 167) / 6.5), 0.18, 1);
    f *= 0.55 + 0.05 * p.looks;
    f *= { hs: 0.8, pro: 0.88, ba: 1, ma: 1.05 }[p.edu];
    f *= { low: 0.75, mid: 0.95, high: 1.05, vhigh: 1.1 }[p.income];
    f *= { couch: 0.75, some: 0.92, active: 1.05, athlete: 1.1 }[p.fitness];
    f *= { shy: 0.85, normal: 1, charm: 1.15 }[p.social];
    if (p.smoke === 'yes') f *= 0.52;
    if (p.housing === 'parents' && p.age >= 28) f *= 0.8;
    if (p.housing === 'own') f *= 1.05;
    return clamp(f, 0.02, 1);
  }
  /* העדפות גיל של נשים: לרוב בן זוג מבוגר ב-0 עד 7 שנים */
  function ageGapAccept(gap) {
    if (gap > 7) return Math.exp(-(gap - 7) / 5);
    if (gap < -2) return Math.exp(-(-2 - gap) / 3);
    return 1;
  }
  /* הסינון שלו עליה (ללא גיל ומגזר) */
  function herFilter(p, city, age) {
    let f = LOOKS_FRAC[p.looksWant];
    if (p.eduWant === 'degree') f *= city.edu;
    if (p.eduWant === 'adv') f *= city.edu * 0.4;
    const { mean, sd } = WOMEN_HEIGHT;
    if (p.heightWant === 'notTaller') f *= phi((p.height - mean) / sd);
    if (p.heightWant === 'petite') f *= phi((160 - mean) / sd);
    if (p.heightWant === 'tall') f *= 1 - phi((170 - mean) / sd);
    if (p.kidsOk === 'no') f *= 1 - (age < 30 ? 0.03 : age < 35 ? 0.15 : age < 40 ? 0.3 : 0.45);
    (p.musts || []).forEach(m => { f *= MUST_FRAC[m] || 1; });
    if ((p.musts || []).includes('noEx')) f *= age < 25 ? 1 : 0.5; // אחרי 25 זה כבר מדע בדיוני
    return f;
  }

  function compute(p) {
    const home = CITIES.find(c => c.id === p.city) || CITIES[0];
    const [aMin, aMax] = p.ageRange;
    const base = baseAcceptance(p);
    const open = p.sectorsOpen.length ? p.sectorsOpen : [p.sector];

    const funnel = { all: 0, age: 0, single: 0, open: 0, sector: 0, filter: 0, mutual: 0 };
    const byCity = [];

    CITIES.forEach(c => {
      funnel.all += c.pop * 1000 * 0.505;
      let cityMutual = 0;
      for (let a = aMin; a <= aMax; a++) {
        const youngAdj = a < 40 ? c.young / 0.28 : (1 - c.young) / 0.72;
        const women = c.pop * 1000 * womenShareAtAge(a) * youngAdj;
        funnel.age += women;
        const ageAcc = ageGapAccept(p.age - a);
        const filt = herFilter(p, c, a);
        Object.keys(SECTORS).forEach(s => {
          const ws = women * (c.s[s] || 0);
          const singleRate = clamp(interp(SINGLE_BY_AGE, a) * sectorSingleMult(s, a) * c.boost, 0, 0.95);
          const singles = ws * singleRate;
          funnel.single += singles;
          funnel.open += singles * OPEN_NOW;
          if (!open.includes(s)) return;
          const inSector = singles * OPEN_NOW;
          funnel.sector += inSector;
          const passed = inSector * filt;
          funnel.filter += passed;
          const mutual = passed * ageAcc * base * SECTOR_ACCEPT[s][p.sector];
          funnel.mutual += mutual;
          cityMutual += mutual;
        });
      }
      const dist = km(home, c);
      let travelW;
      if (p.travel === 'local') travelW = c.id === home.id ? 1 : dist < 8 ? 0.4 : 0.02;
      else if (p.travel === 'region') travelW = dist <= 35 ? 1 : 1 / (1 + ((dist - 35) / 15) ** 2);
      else travelW = 1 / (1 + dist / 120);
      byCity.push({ city: c, mutual: cityMutual, dist, score: cityMutual * travelW });
    });

    byCity.sort((x, y) => y.score - x.score);
    funnel.spark = funnel.mutual * SPARK;
    return { funnel, byCity, base, home };
  }

  /* ציון "שוק" שלו (אחוזון מוערך בין גברים) */
  function selfScore(p) {
    const parts = [
      [0.2, p.looks * 10 - 5],
      [0.1, phi((p.height - MEN_HEIGHT.mean) / MEN_HEIGHT.sd) * 100],
      [0.15, { hs: 30, pro: 45, ba: 70, ma: 88 }[p.edu]],
      [0.15, { low: 25, mid: 50, high: 75, vhigh: 92 }[p.income]],
      [0.15, { couch: 22, some: 48, active: 72, athlete: 90 }[p.fitness]],
      [0.25, { shy: 30, normal: 55, charm: 85 }[p.social]],
    ];
    let s = parts.reduce((t, [w, v]) => t + w * v, 0);
    if (p.smoke === 'yes') s -= 7;
    if (p.housing === 'parents' && p.age >= 28) s -= 7;
    if (p.housing === 'own') s += 3;
    return clamp(Math.round(s), 1, 99);
  }

  /* רמת הדרישות שלו (אחוזון מוערך של מה שהוא מבקש) */
  function demandScore(p) {
    const mid = (p.ageRange[0] + p.ageRange[1]) / 2;
    const ageP = clamp(50 + (p.age - mid) * 4, 15, 97);
    const looksP = { any: 25, cute: 50, pretty: 78, model: 96 }[p.looksWant];
    const eduP = { any: 30, degree: 62, adv: 85 }[p.eduWant];
    const hP = { any: 30, notTaller: 40, petite: 50, tall: 80 }[p.heightWant];
    const mustP = clamp(30 + 12 * (p.musts || []).length, 30, 97);
    let s = 0.3 * looksP + 0.25 * ageP + 0.1 * eduP + 0.1 * hP + 0.25 * mustP;
    if (p.kidsOk === 'no' && mid >= 35) s += 5;
    return clamp(Math.round(s), 1, 99);
  }

  function verdictOf(self, demand, p, res) {
    const gap = demand - self;
    const tooYoung = p.age - p.ageRange[1] >= 10;
    if (gap > 18 || (tooYoung && gap > 8)) {
      return {
        key: 'dream', emoji: '🦄', badge: 'שוגה באשליות (בחביבות)',
        title: 'אחי, אתה מחפש חד-קרן',
        text: `הדרישות שלך ב-${demand} והציון שלך ב-${self}. זה כמו להגיש קורות חיים של סטודנט למשרת מנכ"ל. אין בזה פסול לחלום — אבל המספרים אומרים שאתה מסנן החוצה בדיוק את הנשים שהיו מתאימות לך.${tooYoung ? ' ובנוסף: פער של עשור ומעלה כלפי מטה? נשים בגיל הזה מחפשות בדרך כלל בני גילן. סטטיסטית, לא אישית.' : ''}`,
      };
    }
    if (gap < -15) {
      return {
        key: 'humble', emoji: '🦁', badge: 'צנוע מדי / ביטחון נמוך',
        title: 'אתה מוכר את עצמך בזול',
        text: `הציון שלך ב-${self} אבל אתה מכוון ל-${demand}. אין רע בצניעות, אבל המספרים אומרים שאתה יכול להרשות לעצמך להיות יותר בררן. דחייה ביום שישי לא מורידה לך את הערך — היא רק נתון סטטיסטי אחד.`,
      };
    }
    if (res.funnel.mutual < 150) {
      return {
        key: 'needle', emoji: '🪡', badge: 'ריאלי, אבל מחט בערימת שחת',
        title: 'הדרישות הגיוניות — המאגר קטן',
        text: `הפער בין מה שאתה מציע למה שאתה מבקש סביר (${self} מול ${demand}), אבל הצירוף של גיל, מגזר ודרישות משאיר מאגר קטן. השלב הבא: להרחיב משהו אחד קטן (ראה "מה אם") או להיות מאוד ממוקד במקומות הנכונים.`,
      };
    }
    return {
      key: 'real', emoji: '🎯', badge: 'ריאליסט מוסמך',
      title: 'בחור הגיוני שרוצה דברים הגיוניים',
      text: `הציון שלך ${self}, הדרישות שלך ${demand}. זה איזון בריא — אתה לא מתפשר על עצמך ולא מחפש חד-קרן. הבעיה היא לא בך ולא בדרישות, אלא כנראה במספר הפעמים שאתה יוצא מהבית ופוגש אנשים חדשים.`,
    };
  }

  /* תחזית זמנים */
  function timeline(p, res) {
    const perWeek = { never: 0.15, rare: 0.25, often: 1, lots: 3 }[p.initiative];
    const pDate = clamp(0.25 * { shy: 0.75, normal: 1, charm: 1.35 }[p.social] * (0.6 + res.base * 0.5), 0.08, 0.5);
    const density = clamp(Math.log10(Math.max(res.funnel.mutual, 1)) / 4, 0.25, 1.15);
    const pRel = 0.1 * density;
    const approaches = Math.round(1 / (pDate * pRel));
    const months = clamp(approaches / perWeek / 4.33, 1, 180);
    const rejectionsExpected = Math.max(1, Math.round(approaches * (1 - pDate) + (approaches * pDate) * (1 - pRel)));
    return { approaches, months, rejectionsExpected, pDate, perWeek };
  }

  /* מה אם */
  function whatIfs(p, res) {
    const baseN = res.funnel.mutual;
    const out = [];
    const up = (arr, v) => arr[Math.min(arr.indexOf(v) + 1, arr.length - 1)];
    const down = (arr, v) => arr[Math.max(arr.indexOf(v) - 1, 0)];
    const tryIt = (label, change) => {
      const q = Object.assign({}, p, change);
      const n = compute(q).funnel.mutual;
      out.push({ label, delta: (n - baseN) / Math.max(baseN, 0.01), n });
    };
    if (p.fitness !== 'athlete') tryIt('תתחיל להתאמן קבוע (רמת כושר אחת למעלה)', { fitness: up(['couch', 'some', 'active', 'athlete'], p.fitness) });
    if (p.social !== 'charm') tryIt('סדנת סטנדאפ / אימפרוב — לשפר ביטחון בשיחה', { social: up(['shy', 'normal', 'charm'], p.social) });
    if (p.smoke === 'yes') tryIt('להפסיק לעשן', { smoke: 'no' });
    if (p.housing === 'parents') tryIt('לצאת מהבית של ההורים', { housing: 'rent' });
    if (p.looksWant !== 'any') tryIt('להוריד את דרישת המראה בדרגה אחת', { looksWant: down(['any', 'cute', 'pretty', 'model'], p.looksWant) });
    tryIt('להרחיב את טווח הגילאים בשנתיים לכל כיוון', { ageRange: [Math.max(18, p.ageRange[0] - 2), p.ageRange[1] + 2] });
    if ((p.musts || []).length) tryIt('לוותר על "חובה" אחת', { musts: p.musts.slice(1) });
    if (p.eduWant !== 'any') tryIt('לוותר על דרישת התואר', { eduWant: 'any' });
    if (p.heightWant !== 'any') tryIt('לוותר על דרישת הגובה', { heightWant: 'any' });
    const neighbors = { sec: 'trad', trad: 'sec', dati: 'trad', haredi: 'dati', arab: null }[p.sector];
    if (neighbors && !p.sectorsOpen.includes(neighbors)) tryIt(`להיות פתוח גם ל${SECTORS[neighbors].short}`, { sectorsOpen: p.sectorsOpen.concat(neighbors) });
    return out.filter(x => Math.abs(x.delta) > 0.01).sort((a, b) => b.delta - a.delta).slice(0, 6);
  }

  function venuesFor(cityId, p) {
    const c = CITIES.find(x => x.id === cityId);
    const mid = (p.ageRange[0] + p.ageRange[1]) / 2;
    const open = p.sectorsOpen.length ? p.sectorsOpen : [p.sector];
    const fits = v => v.s.some(s => open.includes(s)) && mid >= v.age[0] - 2 && mid <= v.age[1] + 2;
    const special = (VENUES[cityId] || []).filter(fits);
    const gen = GENERIC_VENUES.filter(fits).map(v => ({ n: v.n(c.name), d: v.d, s: v.s, age: v.age }));
    const list = special.concat(gen.filter(g => !special.some(s => s.n === g.n)));
    return list.slice(0, 4);
  }

  function activitiesFor(p) {
    const mid = (p.ageRange[0] + p.ageRange[1]) / 2;
    const open = p.sectorsOpen.length ? p.sectorsOpen : [p.sector];
    return ACTIVITIES
      .filter(a => a.s.some(s => open.includes(s)) && mid >= a.age[0] && mid <= a.age[1])
      .sort((a, b) => b.women - a.women)
      .slice(0, 6);
  }

  function actionPlan(p, self, res, tl) {
    const items = [];
    const pick = (cond, html) => { if (cond) items.push(html); };
    const firstVenue = res.byCity[0] && venuesFor(res.byCity[0].city.id, p)[0];
    pick(true, `<b>שבוע 1:</b> לך ל${firstVenue ? firstVenue.n : 'ספרייה הקרובה'}. לא כדי "להתחיל" — רק כדי להיות שם, פעמיים בשבוע. היכרות מתחילה בנוכחות קבועה.`);
    pick(true, `<b>שבוע 2:</b> תירשם לחוג אחד מהרשימה למעלה. התחייבות ל-8 מפגשים. בפגישה השלישית כבר מותר להציע קפה אחרי.`);
    pick(p.initiative === 'never' || p.initiative === 'rare', `<b>כל שבוע:</b> פנייה אחת לפחות. משפט פשוט, שאלה על משהו שקורה עכשיו, חיוך. אם היא לא מעוניינת — "יום נעים" ולהמשיך. זה הכול.`);
    pick(p.fitness === 'couch' || p.fitness === 'some', `<b>כושר:</b> 3 אימונים בשבוע. זה משפר את איך שאתה נראה, אבל בעיקר את איך שאתה מרגיש — וזה מה שהיא רואה. <a href="../landing.html">(יש פה באתר מאמן, אגב 😉)</a>`);
    pick(p.social === 'shy', `<b>ביטחון:</b> סדנת אימפרוב או סטנדאפ למתחילים. הדרך הכי מהירה להפסיק לפחד ממבוכה היא להתאמן בה.`);
    pick(p.smoke === 'yes', `<b>עישון:</b> כ-87% מהנשים בישראל לא מעשנות, והרבה מהן מסננות מעשנים. זה הצעד עם התשואה הכי גבוהה ברשימה.`);
    pick(p.housing === 'parents' && p.age >= 28, `<b>מגורים:</b> לא חייבים לקנות דירה — אבל "תבואי אליי, רק תגידי שלום לאמא" זה לא משפט מנצח.`);
    pick(tl.months > 24, `<b>אפליקציות:</b> לא תחליף לחיים, אבל תוספת. 20 דקות ביום, תמונות אמיתיות, ביו עם הומור — ולצאת לדייט תוך שבוע מהמאץ'.`);
    pick(true, `<b>דחיות:</b> כל "לא" הוא צעד בדרך, לא ציון. תכבד אותו מיד, בלי לשכנע ובלי להתעצבן — זה גם הדבר הנכון וגם מה שבונה מוניטין טוב.`);
    return items;
  }

  /* ---------------------------------------------------------------------
     רינדור
     --------------------------------------------------------------------- */
  function setProgress(v) {
    if (v == null) { progress.hidden = true; return; }
    progress.hidden = false;
    progressBar.style.width = v + '%';
  }

  function renderWelcome() {
    setProgress(null);
    app.innerHTML = `
      <section class="card hero">
        <div style="font-size:54px">💘</div>
        <h1>איפה <span class="grad">אשתך לעתיד</span><br>מסתתרת?</h1>
        <p class="lead">מחשבון מבוסס נתוני אוכלוסייה מישראל, שמשווה בין מי שאתה היום למה שאתה מחפש, אומר לך בכנות אם אתה ריאלי — ושולח אותך למקום המדויק שבו כדאי לך להיות.</p>
        <div class="card" style="text-align:right;margin-top:24px">
          <label class="title" for="rej" style="font-weight:700">כמה דחיות ספגת לאחרונה?</label>
          <div class="muted" style="margin-bottom:8px">לצורכי סטטיסטיקה בלבד. אנחנו לא שופטים. (קצת כן.)</div>
          <input type="number" id="rej" min="0" max="999" value="${rejections}">
          <div class="muted" id="rejMsg" style="margin-top:8px"></div>
        </div>
        <div class="nav"><button class="btn" id="start">בוא נמצא אותה ←</button></div>
        <p class="muted" style="margin-top:14px">⏱ 2 דקות · 🔒 שום דבר לא נשלח לשום מקום, הכול נשאר בדפדפן שלך</p>
      </section>`;
    const rej = document.getElementById('rej');
    const msg = document.getElementById('rejMsg');
    const upd = () => {
      rejections = clamp(parseInt(rej.value, 10) || 0, 0, 999);
      msg.textContent = rejections === 0 ? 'אפס דחיות? או שאתה מלך, או שאתה לא ניגש. נבדוק.'
        : rejections <= 3 ? `${rejections} ${rejections === 1 ? 'דחייה' : 'דחיות'}? זה לא כישלון, זה מדגם. בסוף נראה לך כמה עוד צפויות בדרך — ותופתע כמה זה נורמלי.`
        : rejections <= 15 ? 'כבוד. מי שנדחה הרבה — לפחות מנסה. אתה כבר לפני 90% מהגברים.'
        : 'וואו. אתה לא נדחה, אתה עושה מחקר שדה. נעזור לך לכוון.';
    };
    rej.addEventListener('input', upd); upd();
    document.getElementById('start').onclick = () => { saveAnswers(); renderStep(0); };
  }

  function renderQ(q) {
    const v = answers[q.id];
    const hint = q.hint ? `<div class="hint">${q.hint}</div>` : '';
    let control = '';
    if (q.type === 'number') control = `<input type="number" data-id="${q.id}" min="${q.min}" max="${q.max}" value="${v}">`;
    if (q.type === 'select') control = `<select data-id="${q.id}">${q.options.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    if (q.type === 'chips') control = `<div class="chips" data-id="${q.id}" data-mode="one">${q.options.map(([k, l]) => `<button type="button" class="chip ${k === v ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>`;
    if (q.type === 'multi') control = `<div class="chips" data-id="${q.id}" data-mode="multi">${q.options.map(([k, l]) => `<button type="button" class="chip ${v.includes(k) ? 'on' : ''}" data-v="${k}">${l}</button>`).join('')}</div>`;
    if (q.type === 'range') control = `<div class="range-wrap"><input type="range" data-id="${q.id}" min="${q.min}" max="${q.max}" value="${v}"><span class="range-val" id="rv-${q.id}">${v} ${q.unit}</span></div><div class="hint" id="rc-${q.id}" style="margin-top:6px"></div>`;
    if (q.type === 'pair') control = `<div class="pair">מגיל <input type="number" data-id="${q.id}" data-i="0" min="${q.min}" max="${q.max}" value="${v[0]}"> עד גיל <input type="number" data-id="${q.id}" data-i="1" min="${q.min}" max="${q.max}" value="${v[1]}"></div>`;
    return `<div class="q"><label class="title">${q.label}</label>${hint}${control}</div>`;
  }

  const RANGE_COMMENTS = {
    height: v => v >= 190 ? 'אתה בעשירון העליון. תיזהר ממשקופים.' : v >= 180 ? 'מעל הממוצע הישראלי (~1.75). יפה.' : v >= 170 ? 'בטווח הממוצע. גובה זה לא הכול — אבל גם לא כלום.' : 'מתחת לממוצע — אז נשקיע בכריזמה. טום קרוז מסתדר.',
    looks: v => v >= 9 ? 'בטוח? בסדר, נאמין לך. השאר הציון יגיד.' : v >= 7 ? 'נראה טוב. אחלה בסיס.' : v >= 5 ? 'ממוצע — כמו רוב האנושות. זה מצוין, כי רוב האנושות גם מתחתנת.' : 'צניעות או מציאות? מספרה טובה ו-3 אימונים בשבוע שווים 2 נקודות לפחות.',
  };

  function renderStep(i) {
    const step = STEPS[i];
    setProgress(((i + 1) / (STEPS.length + 1)) * 100);
    app.innerHTML = `
      <section>
        <h2>${step.title}</h2>
        <p class="muted">${step.sub}</p>
        <div class="card">${step.qs.map(renderQ).join('')}</div>
        <div class="err" id="err"></div>
        <div class="row between nav">
          <button class="btn ghost small" id="back">→ חזרה</button>
          <button class="btn" id="next">${i === STEPS.length - 1 ? 'תן לי את האמת 💔→❤️' : 'הבא ←'}</button>
        </div>
      </section>`;
    window.scrollTo(0, 0);

    app.querySelectorAll('[data-id]').forEach(el => {
      const id = el.dataset.id;
      if (el.classList.contains('chips')) {
        el.addEventListener('click', e => {
          const b = e.target.closest('.chip'); if (!b) return;
          if (el.dataset.mode === 'one') {
            answers[id] = b.dataset.v;
            el.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === b));
            if (id === 'sector' && !answers.sectorsOpen.includes(b.dataset.v)) answers.sectorsOpen = [b.dataset.v];
          } else {
            const set = new Set(answers[id]);
            set.has(b.dataset.v) ? set.delete(b.dataset.v) : set.add(b.dataset.v);
            answers[id] = Array.from(set);
            b.classList.toggle('on');
          }
          saveAnswers();
        });
      } else {
        const q = step.qs.find(x => x.id === id);
        const handler = () => {
          if (q.type === 'pair') answers[id][+el.dataset.i] = parseInt(el.value, 10) || 0;
          else if (q.type === 'select') answers[id] = el.value;
          else answers[id] = parseInt(el.value, 10) || 0;
          if (q.type === 'range') {
            document.getElementById('rv-' + id).textContent = `${el.value} ${q.unit}`;
            const c = RANGE_COMMENTS[id]; if (c) document.getElementById('rc-' + id).textContent = c(+el.value);
          }
          saveAnswers();
        };
        el.addEventListener('input', handler);
        if (q.type === 'range') handler();
      }
    });

    document.getElementById('back').onclick = () => (i === 0 ? renderWelcome() : renderStep(i - 1));
    document.getElementById('next').onclick = () => {
      const err = validate(i);
      if (err) { document.getElementById('err').textContent = err; return; }
      if (i < STEPS.length - 1) renderStep(i + 1); else renderLoading();
    };
  }

  function validate(i) {
    if (i === 0) {
      if (!(answers.age >= 18 && answers.age <= 75)) return 'הגיל צריך להיות בין 18 ל-75. (אם אתה מתחת ל-18 — לך תכין שיעורי בית.)';
    }
    if (i === 1) {
      let [a, b] = answers.ageRange;
      if (!(a >= 18 && b <= 75)) return 'טווח הגילאים צריך להיות בין 18 ל-75.';
      if (a > b) { answers.ageRange = [b, a]; saveAnswers(); }
      if (!answers.sectorsOpen.length) return 'צריך לבחור לפחות אורח חיים אחד. "אף אחת" זה לא מאגר, זה נזירות.';
    }
    return '';
  }

  function renderLoading() {
    setProgress(100);
    app.innerHTML = `<section class="loading"><div class="heart">❤️</div><p id="ll">${LOADING_LINES[0]}</p></section>`;
    let k = 0;
    const el = document.getElementById('ll');
    const t = setInterval(() => { k++; if (k < LOADING_LINES.length) el.textContent = LOADING_LINES[k]; }, 420);
    setTimeout(() => { clearInterval(t); renderResults(); }, 420 * LOADING_LINES.length);
  }

  function renderResults() {
    setProgress(null);
    const p = answers;
    const res = compute(p);
    const self = selfScore(p);
    const demand = demandScore(p);
    const v = verdictOf(self, demand, p, res);
    const tl = timeline(p, res);
    const wi = whatIfs(p, res);
    const acts = activitiesFor(p);
    const plan = actionPlan(p, self, res, tl);
    const f = res.funnel;

    const gap = demand - self;
    const pinPos = clamp(50 + gap * 1.6, 3, 97); // ימין = צנוע, שמאל = חולם

    const stages = [
      ['כל הנשים בערים שבמאגר', f.all],
      [`בגילאי ${p.ageRange[0]}–${p.ageRange[1]}`, f.age],
      ['פנויות (רווקות, גרושות, אלמנות)', f.single],
      ['פתוחות לקשר כרגע', f.open],
      ['מאורח החיים שחיפשת', f.sector],
      ['עומדות בכל הדרישות שלך', f.filter],
      ['…וגם אתה עומד בשלהן', f.mutual],
      ['…ויהיה ביניכם ניצוץ אמיתי', f.spark],
    ];
    const maxLog = Math.log10(f.all);
    const bar = n => clamp((Math.log10(Math.max(n, 1)) / maxLog) * 100, 2, 100);

    const top = res.byCity.slice(0, 5);
    const sumTop = res.byCity.reduce((s, x) => s + x.mutual, 0) || 1;

    const rejDone = rejections;
    const rejPct = clamp((rejDone / tl.rejectionsExpected) * 100, 0, 100);
    const monthsTxt = tl.months >= 24 ? `${(tl.months / 12).toFixed(1)} שנים` : `${Math.round(tl.months)} חודשים`;

    app.innerHTML = `
      <section class="card verdict">
        <div class="emoji">${v.emoji}</div>
        <span class="badge">${v.badge}</span>
        <h1>${v.title}</h1>
        <p class="lead">${v.text}</p>
        <div class="meters">
          <div class="meter"><div class="num" style="color:var(--blue)">${self}</div><div class="lbl">הציון שלך בשוק<br>(אחוזון מוערך בין גברים)</div></div>
          <div class="meter"><div class="num" style="color:var(--accent)">${demand}</div><div class="lbl">רמת הדרישות שלך<br>(אחוזון מוערך של מה שביקשת)</div></div>
        </div>
        <div class="track" aria-label="מד ריאליות"><span class="pin" style="right:${pinPos}%"></span></div>
        <div class="track-lbls"><span>צנוע מדי</span><span>ריאלי</span><span>חולם</span></div>
      </section>

      <section class="card funnel">
        <h2>משוואת דרייק של האהבה 🔭</h2>
        <p class="muted">כמו שמעריכים כמה ציוויליזציות יש בגלקסיה — רק עם רווקות בישראל.</p>
        ${stages.map(([l, n]) => `<div class="stage"><div class="st"><span>${l}</span><b>${fmtSmart(n)}</b></div><div class="fbar"><i style="width:${bar(n)}%"></i></div></div>`).join('')}
        <div class="bigline">בשורה התחתונה: יש בישראל בערך <b>${fmtSmart(f.mutual)}</b> נשים שמתאימות לך על הנייר ואתה מתאים להן. מתוכן, עם בערך <b>${fmtSmart(f.spark)}</b> יהיה קליק אמיתי. ${f.spark >= 20 ? 'זה הרבה יותר ממה שאתה צריך — אתה צריך רק אחת.' : f.spark >= 3 ? 'לא המון, אבל אתה צריך רק אחת. רק צריך למצוא אותה.' : 'צר. מאוד. ראה למטה איך להרחיב.'}</div>
      </section>

      <section class="card">
        <h2>איפה היא? 📍</h2>
        <p class="muted">דירוג לפי כמות המועמדות שמתאימות הדדית, משוקלל במרחק מ${res.home.name} ובכמה אתה מוכן לנסוע.</p>
        <table class="cities">
          <thead><tr><th>עיר</th><th>מועמדות</th><th class="hide-sm">מהמאגר שלך</th><th class="hide-sm">מרחק</th></tr></thead>
          <tbody>${top.map((x, i) => `<tr><td><span class="rank">${i + 1}</span>${x.city.name}</td><td class="n">כ-${fmtSmart(x.mutual)}</td><td class="hide-sm">${Math.round((x.mutual / sumTop) * 100)}%</td><td class="hide-sm">${x.city.id === res.home.id ? 'בבית' : Math.round(x.dist) + ' ק"מ'}</td></tr>`).join('')}</tbody>
        </table>
        ${top.slice(0, 3).map((x, i) => `
          <div class="city-block">
            <h3><span class="rank">${i + 1}</span> ${x.city.name}: לאן ללכת</h3>
            <div class="venues">${venuesFor(x.city.id, p).map(vn => `<div class="venue"><div class="vn">${vn.n}</div><p>${vn.d}</p></div>`).join('')}</div>
          </div>`).join('')}
      </section>

      ${acts.length ? `<section class="card">
        <h2>חוגים עם יחס מגדרי לטובתך ⚖️</h2>
        <p class="muted">אחוז הנשים הוא הערכה. ההמלצה אמיתית: הכי קל להכיר במקום שבו נפגשים שוב ושוב.</p>
        <div class="acts">${acts.map(a => `<div class="act"><h3>${a.n}</h3><div class="ratio">כ-${a.women}% נשים</div><p>${a.d}</p></div>`).join('')}</div>
      </section>` : ''}

      <section class="card">
        <h2>תחזית מזג אוויר רומנטי 🌦️</h2>
        <div class="timeline">
          <div class="stat"><div class="num">${monthsTxt}</div><div class="lbl">זמן משוער עד קשר רציני, בקצב הנוכחי שלך</div></div>
          <div class="stat"><div class="num">כ-${tl.approaches}</div><div class="lbl">היכרויות שסטטיסטית צריך עד שזה תופס</div></div>
          <div class="stat"><div class="num">כ-${tl.rejectionsExpected}</div><div class="lbl">"לא תודה" שצפויים בדרך (נורמלי לגמרי)</div></div>
        </div>
        <div class="rejbar"><i style="width:${rejPct}%"></i></div>
        <p class="muted" style="margin-top:8px">${rejDone > 0 ? `כבר אספת ${rejDone} מתוך ~${tl.rejectionsExpected}. כלומר עשית ${Math.round(rejPct)}% מהדרך. שתי הנשים מיום שישי? הן לא כישלון — הן התקדמות. נשארו לך בערך ${Math.max(tl.rejectionsExpected - rejDone, 0)} "לא" עד ה"כן".` : 'עוד לא אספת דחיות — כלומר עוד לא התחלת. הצעד הראשון הוא להתחיל לאסוף.'}</p>
        ${tl.perWeek < 1 ? `<p class="muted" style="margin-top:8px">💡 אם תעלה לפנייה אחת בשבוע, הזמן המשוער ירד ל-<b>${Math.max(1, Math.round(tl.approaches / 4.33))} חודשים</b>.</p>` : ''}
      </section>

      ${wi.length ? `<section class="card">
        <h2>מה אם...? 🧪</h2>
        <p class="muted">איך שינוי אחד משנה את גודל המאגר ההדדי שלך.</p>
        <div class="whatif">${wi.map(w => `<div class="wi"><span>${w.label}</span><bdi dir="ltr" class="delta ${w.delta >= 0 ? 'up' : 'down'}">${w.delta >= 0 ? '+' : ''}${Math.round(w.delta * 100)}%</bdi></div>`).join('')}</div>
      </section>` : ''}

      <section class="card">
        <h2>תוכנית פעולה ל-30 יום 📝</h2>
        <ul class="plan">${plan.map(x => `<li>${x}</li>`).join('')}</ul>
      </section>

      <section class="card">
        <h3>איך חישבנו?</h3>
        <p class="muted" style="margin-top:6px">אוכלוסיית הנשים לפי גיל ועיר, שיעור הפנויות לפי גיל ומגזר, התפלגות השכלה וגובה — כולם הערכות מעוגלות בהשראת נתוני הלמ"ס. על זה הוספנו את הסינונים שלך, ואת הסיכוי שהיא תהיה מעוניינת בך (לפי פער גילאים, מגזר, וכמה מאפיינים שמחקרים מראים שמשפיעים). מספרים טובים לסדרי גודל — לא נבואה. בפועל, הכימיה, החוש ההומור והאם אתה מקשיב באמת שווים יותר מכל עמודה בטבלה.</p>
      </section>

      <div class="row nav" style="justify-content:center">
        <button class="btn" id="share">העתק את התוצאות לשתף 📋</button>
        <button class="btn ghost" id="edit">לשנות תשובות</button>
        <button class="btn ghost" id="restart">להתחיל מחדש</button>
      </div>`;
    window.scrollTo(0, 0);

    document.getElementById('edit').onclick = () => renderStep(0);
    document.getElementById('restart').onclick = () => { answers = defaults(); rejections = 2; saveAnswers(); renderWelcome(); };
    document.getElementById('share').onclick = () => {
      const txt = `הלב"ס קבע: ${v.badge} ${v.emoji}\nהציון שלי: ${self} | הדרישות שלי: ${demand}\nבישראל יש ~${fmtSmart(f.mutual)} נשים שמתאימות לי הדדית.\nהמקום הכי טוב בשבילי: ${top[0] ? top[0].city.name : '—'}\nתבדקו את עצמכם: ${location.href}`;
      const done = () => toast('הועתק! עכשיו תשלח לחבר שגם הוא נדחה ביום שישי');
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => prompt('העתק:', txt));
      else prompt('העתק:', txt);
    };
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  const brand = document.getElementById('brandHome');
  brand.onclick = renderWelcome;
  brand.onkeydown = e => { if (e.key === 'Enter') renderWelcome(); };

  renderWelcome();

  // חשיפה לבדיקות
  window.__lalas = { compute, selfScore, demandScore, verdictOf, timeline, defaults };
})();
