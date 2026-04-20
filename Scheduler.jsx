import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Crown,
  Lock,
  Unlock,
  Trophy,
  Users,
  Sparkles,
  Scroll,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { storage } from './storage.js';

// ============================================================
// Wrencoria Council of Convening — Session Scheduler
// Companion to wrencoria-battle-counter
// Shared storage: all five players see the same data
// ============================================================

const STORAGE_KEY = 'wrencoria-scheduler-v1';
const LOCAL_KEY = 'wrencoria-scheduler-me';
const DEFAULT_PARTY = ['BigTimeDM', 'King Gizzard', 'Lucien', 'Shio', 'Kazzak', 'Fazula'];

// ---------- Date helpers ----------
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromISO = (s) => new Date(s + 'T00:00:00');

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const mondayOf = (d) => {
  const x = new Date(d);
  const day = x.getDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
};

// Build the calendar grid for a single month (year, monthIdx 0-11).
// Returns 6 weeks (Mon-Sun), padded with leading/trailing days from
// adjacent months so the layout never jumps. Each cell carries `inMonth`.
const generateMonthGrid = (year, monthIdx) => {
  const first = new Date(year, monthIdx, 1);
  const gridStart = mondayOf(first);
  const weeks = [];
  const cursor = new Date(gridStart);
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      week.push({
        date: new Date(cursor),
        inMonth: cursor.getMonth() === monthIdx,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
};

const addMonths = (year, monthIdx, delta) => {
  const d = new Date(year, monthIdx + delta, 1);
  return { year: d.getFullYear(), monthIdx: d.getMonth() };
};

// All dates from today through ~6 months out, used for ranking.
const futureDateRange = (monthsAhead = 6) => {
  const start = startOfToday();
  const end = new Date(start.getFullYear(), start.getMonth() + monthsAhead + 1, 0);
  const out = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(toISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
};

const MONTH_FULL = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const formatLong = (iso) => {
  const d = fromISO(iso);
  return `${DAY_NAMES[(d.getDay() + 6) % 7]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

// ---------- Status logic ----------
const cycleStatus = (cur) => {
  if (!cur) return 'yes';
  if (cur === 'yes') return 'maybe';
  if (cur === 'maybe') return 'no';
  return undefined;
};

const scoreFor = (party, availability, iso) => {
  let yes = 0,
    maybe = 0,
    no = 0;
  for (const player of party) {
    const s = availability?.[player]?.[iso];
    if (s === 'yes') yes++;
    else if (s === 'maybe') maybe++;
    else if (s === 'no') no++;
  }
  return { yes, maybe, no, score: yes * 2 + maybe, voted: yes + maybe + no };
};

const statusColor = (status) => {
  if (status === 'yes')
    return { bg: 'linear-gradient(135deg, #6b8e3d, #4a6128)', border: '#8fb050', text: '#f0fdf4' };
  if (status === 'maybe')
    return { bg: 'linear-gradient(135deg, #c8941a, #8b6712)', border: '#e0a82a', text: '#fef9c3' };
  if (status === 'no')
    return { bg: 'linear-gradient(135deg, #8b3a2a, #5c2418)', border: '#a8482e', text: '#fee2e2' };
  return { bg: 'rgba(45, 31, 18, 0.6)', border: '#5a3a1a', text: '#d4a574' };
};

const defaultData = () => ({
  availability: {},
  lockedSessions: [],
  monthsAhead: 6,
  party: DEFAULT_PARTY,
});

// ============================================================
// Main Component
// ============================================================
const Scheduler = () => {
  const [data, setData] = useState(defaultData());
  const [me, setMe] = useState(DEFAULT_PARTY[0]);
  const [tab, setTab] = useState('availability');
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState(null);
  const [pendingLock, setPendingLock] = useState(null); // { iso, title }
  const [confirming, setConfirming] = useState(null); // 'mine' | 'all' | null
  const today = startOfToday();
  const [viewMonth, setViewMonth] = useState({
    year: today.getFullYear(),
    monthIdx: today.getMonth(),
  });

  // ---------- Load ----------
  useEffect(() => {
    (async () => {
      let loadedParty = DEFAULT_PARTY;
      try {
        const res = await storage.get(STORAGE_KEY, true);
        if (res?.value) {
          const parsed = typeof res.value === 'string' ? JSON.parse(res.value) : res.value;
          const merged = { ...defaultData(), ...parsed };
          if (Array.isArray(merged.party) && merged.party.length > 0) loadedParty = merged.party;
          // migrate legacy single lockedSession → lockedSessions array
          if (merged.lockedSession && !Array.isArray(merged.lockedSessions)) {
            merged.lockedSessions = [merged.lockedSession];
          }
          delete merged.lockedSession;
          setData(merged);
        }
      } catch (e) {
        setStorageError(
          'Failed to load session data. Your browser storage may be full or restricted.'
        );
      }
      try {
        const local = await storage.get(LOCAL_KEY, false);
        if (local?.value && loadedParty.includes(local.value)) setMe(local.value);
      } catch (e) {
        /* non-critical — default player selection is fine */
      }
      setLoaded(true);
    })();
  }, []);

  // ---------- Persist shared ----------
  useEffect(() => {
    if (!loaded) return;
    setSaving(true);
    storage
      .set(STORAGE_KEY, JSON.stringify(data), true)
      .catch(() =>
        setStorageError(
          'Failed to save your changes. Your browser storage may be full or restricted.'
        )
      )
      .finally(() => setTimeout(() => setSaving(false), 400));
  }, [data, loaded]);

  // ---------- Persist local player choice ----------
  useEffect(() => {
    if (!loaded) return;
    storage.set(LOCAL_KEY, me, false).catch((e) => console.error(e));
  }, [me, loaded]);

  const monthGrid = useMemo(
    () => generateMonthGrid(viewMonth.year, viewMonth.monthIdx),
    [viewMonth]
  );
  const allFutureDates = useMemo(() => futureDateRange(data.monthsAhead ?? 6), [data.monthsAhead]);
  const todayIso = toISO(today);

  const setMonthsAhead = (n) => setData((prev) => ({ ...prev, monthsAhead: n }));

  const setParty = (updater) => {
    setData((prev) => {
      const next = typeof updater === 'function' ? updater(prev.party) : updater;
      const party = next.length > 0 ? next : prev.party;
      if (!party.includes(me)) setMe(party[0]);
      return { ...prev, party };
    });
  };

  // ---------- Mutations ----------
  const setStatus = (iso, status) => {
    setData((prev) => {
      const next = { ...prev, availability: { ...prev.availability } };
      const playerData = { ...(next.availability[me] || {}) };
      if (status === undefined) delete playerData[iso];
      else playerData[iso] = status;
      next.availability[me] = playerData;
      return next;
    });
  };

  const onCellClick = (iso) => {
    const cur = data.availability?.[me]?.[iso];
    setStatus(iso, cycleStatus(cur));
  };

  const rankedDates = useMemo(() => {
    return allFutureDates
      .filter((iso) => iso >= todayIso)
      .map((iso) => ({ iso, ...scoreFor(data.party, data.availability, iso) }))
      .filter((r) => r.voted > 0)
      .sort((a, b) => b.score - a.score || b.yes - a.yes || a.iso.localeCompare(b.iso));
  }, [data.availability, data.party, allFutureDates, todayIso]);

  const lockDate = (iso, title) => {
    setData((prev) => ({
      ...prev,
      lockedSessions: [
        ...(prev.lockedSessions || []),
        { date: iso, title: title || '', lockedAt: new Date().toISOString(), lockedBy: me },
      ],
    }));
    setPendingLock(null);
    setTab('locked');
  };

  const unlockDate = (iso) => {
    setData((prev) => ({
      ...prev,
      lockedSessions: (prev.lockedSessions || []).filter((s) => s.date !== iso),
    }));
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mordekai-scheduler-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (typeof parsed !== 'object' || parsed === null || !parsed.availability) {
          setStorageError('Import failed: file does not look like a valid scheduler backup.');
          return;
        }
        setData({ ...defaultData(), ...parsed });
      } catch {
        setStorageError('Import failed: could not parse the selected file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const askConfirm = (action) => {
    if (confirming === action) {
      if (action === 'mine') {
        setData((prev) => {
          const next = { ...prev, availability: { ...prev.availability } };
          delete next.availability[me];
          return next;
        });
      }
      if (action === 'all') {
        setData(defaultData());
      }
      setConfirming(null);
    } else {
      setConfirming(action);
      setTimeout(() => setConfirming((c) => (c === action ? null : c)), 3000);
    }
  };

  // ---------- Render ----------
  return (
    <div
      className="h-dvh text-amber-100 flex flex-col"
      style={{
        background: 'radial-gradient(ellipse at top, #2a1810 0%, #1a0f08 50%, #0d0704 100%)',
        fontFamily: '"Cinzel", "Georgia", serif',
      }}
    >
      <div
        className="max-w-6xl w-full mx-auto px-3 sm:px-6 flex flex-col h-full min-h-0"
        style={{
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
        }}
      >
        {storageError && (
          <div className="mb-4 flex items-start gap-3 rounded-lg border border-red-500/50 bg-red-900/40 px-4 py-3 text-sm text-red-200">
            <span className="flex-1">{storageError}</span>
            <button
              onClick={() => setStorageError(null)}
              className="text-red-300 hover:text-red-100 leading-none text-lg"
            >
              &times;
            </button>
          </div>
        )}
        <Header saving={saving} party={data.party} lockedSessions={data.lockedSessions} />
        <PlayerPicker
          me={me}
          setMe={setMe}
          availability={data.availability}
          party={data.party}
          setParty={setParty}
        />
        <Tabs tab={tab} setTab={setTab} lockedSessions={data.lockedSessions} />

        <div className="flex-1 overflow-y-auto min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
          {tab === 'availability' && (
            <AvailabilityView
              monthGrid={monthGrid}
              viewMonth={viewMonth}
              setViewMonth={setViewMonth}
              availability={data.availability}
              me={me}
              onCellClick={onCellClick}
              todayIso={todayIso}
              lockedSessions={data.lockedSessions}
              askConfirm={askConfirm}
              confirming={confirming}
              monthsAhead={data.monthsAhead ?? 6}
              setMonthsAhead={setMonthsAhead}
            />
          )}
          {tab === 'ranked' && (
            <RankedView
              ranked={rankedDates}
              availability={data.availability}
              lockedSessions={data.lockedSessions}
              pendingLock={pendingLock}
              setPendingLock={setPendingLock}
              onLock={lockDate}
              party={data.party}
            />
          )}
          {tab === 'locked' && (
            <LockedView
              lockedSessions={data.lockedSessions}
              availability={data.availability}
              onUnlock={unlockDate}
              askConfirm={askConfirm}
              confirming={confirming}
              party={data.party}
            />
          )}
        </div>

        <div
          className="py-2 flex justify-center gap-4 text-xs"
          style={{ color: 'rgba(217,119,6,0.35)' }}
        >
          <button onClick={exportData} className="underline hover:text-amber-400 transition-colors">
            Export backup
          </button>
          <label className="underline hover:text-amber-400 transition-colors cursor-pointer">
            Import backup
            <input type="file" accept=".json" onChange={importData} className="hidden" />
          </label>
        </div>

        <div
          className="mt-4 text-center text-xs text-amber-500/30 italic"
          style={{ fontFamily: '"MedievalSharp", cursive' }}
        >
          By the will of the Spiral · Mordekai&apos;s Broken Seal
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Sub-components
// ============================================================

const Header = ({ saving, party, lockedSessions }) => (
  <div style={{ textAlign: 'center', padding: '10px 16px 8px', marginBottom: '2px' }}>
    <div
      style={{
        fontFamily: "'Cinzel Decorative', cursive",
        fontSize: 'clamp(1rem, 4.8vw, 2.6rem)',
        fontWeight: 400,
        color: '#c8a84e',
        textShadow: '0 2px 14px rgba(200,168,78,0.35)',
        letterSpacing: 'clamp(1px, 0.5vw, 5px)',
        textTransform: 'uppercase',
        lineHeight: 1.1,
        margin: 0,
      }}
    >
      Mordekai&apos;s Broken Seal
    </div>
    <div
      style={{
        fontSize: '0.6rem',
        color: '#8a7d65',
        marginTop: '3px',
        letterSpacing: '6px',
        textTransform: 'uppercase',
        fontFamily: "'MedievalSharp', cursive",
      }}
    >
      Council of Convening
    </div>
    <div
      style={{
        fontSize: '0.65rem',
        color: '#8a7d65',
        marginTop: '3px',
        fontStyle: 'italic',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span>
        {lockedSessions.length} session{lockedSessions.length !== 1 ? 's' : ''} recorded ·{' '}
        {party.length} adventurer{party.length !== 1 ? 's' : ''} in the party
      </span>
    </div>
    <div
      style={{
        height: '1px',
        background:
          'linear-gradient(to right, transparent, #8a7535 30%, #8a7535 70%, transparent)',
        margin: '6px 0 0',
        opacity: 0.7,
      }}
    />
  </div>
);

const PlayerPicker = ({ me, setMe, availability, party, setParty }) => {
  const [editing, setEditing] = React.useState(false);
  const [newName, setNewName] = React.useState('');

  const addPlayer = () => {
    const name = newName.trim();
    if (!name || party.includes(name)) return;
    setParty((p) => [...p, name]);
    setNewName('');
  };

  const removePlayer = (name) => {
    if (party.length <= 1) return;
    setParty((p) => p.filter((n) => n !== name));
  };

  return (
    <div
      className="mb-2 rounded-lg border-2"
      style={{
        background: 'linear-gradient(135deg, #2d1f12, #1f1408)',
        borderColor: '#5a3a1a',
        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
      }}
    >
      {/* Single-row compact selector */}
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="text-amber-300 text-xs font-semibold flex items-center gap-1 shrink-0">
          <Users className="w-3 h-3" /> I am:
        </span>
        <div
          className="flex gap-1.5 overflow-x-auto flex-1 py-0.5"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {party.map((name) => {
            const active = name === me;
            return (
              <button
                key={name}
                onClick={() => setMe(name)}
                className="px-2.5 py-1 rounded border-2 transition-all text-xs shrink-0"
                style={{
                  background: active ? 'linear-gradient(135deg, #8b6914, #5c4410)' : 'rgba(0,0,0,0.3)',
                  borderColor: active ? '#d4af37' : '#5a3a1a',
                  color: active ? '#fef3c7' : '#d4a574',
                  fontWeight: active ? 700 : 400,
                  boxShadow: active ? '0 0 8px rgba(212,175,55,0.35)' : 'none',
                }}
              >
                {name}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setEditing((e) => !e)}
          className="shrink-0 text-xs px-2 py-1 rounded border transition-all"
          style={{
            borderColor: '#5a3a1a',
            color: editing ? '#d4af37' : '#a08060',
            background: editing ? 'rgba(212,175,55,0.1)' : 'transparent',
          }}
        >
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {editing && (
        <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: '#3a2510' }}>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {party.map((name) => (
              <div
                key={name}
                className="flex items-center gap-1 px-2 py-0.5 rounded border text-xs"
                style={{ borderColor: '#5a3a1a', background: 'rgba(0,0,0,0.3)', color: '#d4a574' }}
              >
                {name}
                <button
                  onClick={() => removePlayer(name)}
                  disabled={party.length <= 1}
                  className="ml-0.5 text-red-400/60 hover:text-red-400 disabled:opacity-20 leading-none"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
              placeholder="New player name…"
              className="flex-1 px-3 py-1.5 rounded border text-xs text-amber-100 placeholder-amber-500/40 outline-none"
              style={{ background: 'rgba(0,0,0,0.4)', borderColor: '#5a3a1a', fontSize: '16px' }}
            />
            <button
              onClick={addPlayer}
              disabled={!newName.trim() || party.includes(newName.trim())}
              className="px-3 py-1.5 rounded border text-xs transition-all disabled:opacity-30"
              style={{ borderColor: '#8b6914', color: '#d4af37', background: 'rgba(139,105,20,0.2)' }}
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const Tabs = ({ tab, setTab, lockedSessions }) => {
  const hasLocked = lockedSessions?.length > 0;
  const tabs = [
    { id: 'availability', label: 'My Availability', shortLabel: 'Avail.', icon: Calendar },
    { id: 'ranked', label: 'Best Dates', shortLabel: 'Ranked', icon: Trophy },
    { id: 'locked', label: 'Sealed Sessions', shortLabel: 'Sealed', icon: hasLocked ? Lock : Unlock },
  ];
  return (
    <div className="flex gap-1 mb-2 border-b-2" style={{ borderColor: '#5a3a1a' }}>
      {tabs.map((t) => {
        const Icon = t.icon;
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 sm:flex-none px-2 sm:px-3 py-2 sm:py-1 flex items-center justify-center sm:justify-start gap-1.5 transition-all text-xs whitespace-nowrap"
            style={{
              background: active ? 'linear-gradient(180deg, #3d2818, #2d1f12)' : 'transparent',
              borderTop: active ? '2px solid #d4af37' : '2px solid transparent',
              borderLeft: active ? '2px solid #5a3a1a' : '2px solid transparent',
              borderRight: active ? '2px solid #5a3a1a' : '2px solid transparent',
              borderRadius: '6px 6px 0 0',
              color: active ? '#d4af37' : '#a08060',
              fontWeight: active ? 700 : 400,
              marginBottom: '-2px',
            }}
          >
            <Icon className="w-3 h-3" />
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.shortLabel}</span>
            {t.id === 'locked' && hasLocked && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-amber-400"
                style={{ boxShadow: '0 0 6px #d4af37' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

const Legend = ({ label, status }) => {
  const c = statusColor(status);
  return (
    <div className="flex items-center gap-1">
      <div className="w-3 h-3 rounded border" style={{ background: c.bg, borderColor: c.border }} />
      <span className="text-amber-200/70">{label}</span>
    </div>
  );
};

const AvailabilityView = ({
  monthGrid,
  viewMonth,
  setViewMonth,
  availability,
  me,
  onCellClick,
  todayIso,
  lockedSessions,
  askConfirm,
  confirming,
  monthsAhead,
  setMonthsAhead,
}) => {
  const myAvail = availability?.[me] || {};
  const monthLabel = `${MONTH_FULL[viewMonth.monthIdx]} ${viewMonth.year}`;
  const todayDate = fromISO(todayIso);
  const canGoBack = !(
    viewMonth.year === todayDate.getFullYear() && viewMonth.monthIdx <= todayDate.getMonth()
  );

  const goPrev = () => setViewMonth((m) => addMonths(m.year, m.monthIdx, -1));
  const goNext = () => setViewMonth((m) => addMonths(m.year, m.monthIdx, 1));
  const goToday = () =>
    setViewMonth({ year: todayDate.getFullYear(), monthIdx: todayDate.getMonth() });

  return (
    <div>
      {/* Month header — sticky so nav stays visible while scrolling */}
      <div
        className="mb-3 flex items-center justify-between gap-3 p-2 sm:p-3 rounded-lg border-2 sticky top-0 z-10"
        style={{
          background: 'linear-gradient(135deg, #3d2818, #2d1f12)',
          borderColor: '#8b6914',
          boxShadow: 'inset 0 0 20px rgba(0,0,0,0.5)',
        }}
      >
        <button
          onClick={goPrev}
          disabled={!canGoBack}
          className="p-3 sm:p-2 rounded border-2 disabled:opacity-20 transition-all hover:scale-105 disabled:hover:scale-100"
          style={{ borderColor: '#5a3a1a', background: 'rgba(0,0,0,0.4)', color: '#d4a574' }}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="text-center flex-1">
          <div
            className="text-lg sm:text-3xl font-bold"
            style={{
              fontFamily: '"Cinzel Decorative", serif',
              color: '#d4af37',
              textShadow: '0 0 10px rgba(212,175,55,0.4), 1px 1px 0 #000',
              letterSpacing: '0.05em',
            }}
          >
            {monthLabel}
          </div>
          <button
            onClick={goToday}
            className="text-xs uppercase tracking-wider mt-0.5 underline transition-colors"
            style={{ color: '#a08060', fontFamily: '"Cinzel", serif' }}
          >
            Return to this month
          </button>
        </div>
        <button
          onClick={goNext}
          className="p-3 sm:p-2 rounded border-2 transition-all hover:scale-105"
          style={{ borderColor: '#5a3a1a', background: 'rgba(0,0,0,0.4)', color: '#d4a574' }}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Legend + hint on a single compact row */}
      <div className="mb-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
        <Legend label="Available" status="yes" />
        <Legend label="Maybe" status="maybe" />
        <Legend label="Cannot" status="no" />
        <span
          className="text-amber-200/50 italic"
          style={{ fontFamily: '"MedievalSharp", cursive' }}
        >
          Tap to cycle · four taps clears
        </span>
      </div>

      <div className="space-y-1">
        <div className="grid grid-cols-7 gap-1 sm:gap-2 px-1 mb-1">
          {DAY_NAMES.map((d) => (
            <div
              key={d}
              className="text-center text-xs font-bold uppercase tracking-wider text-amber-400/60"
            >
              {d}
            </div>
          ))}
        </div>
        {monthGrid.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1 sm:gap-2">
            {week.map(({ date, inMonth }) => {
              const iso = toISO(date);
              const status = myAvail[iso];
              const colors = statusColor(status);
              const isPast = iso < todayIso;
              const isToday = iso === todayIso;
              const isLocked = lockedSessions?.some((s) => s.date === iso);
              const disabled = isPast || !inMonth;

              // Out-of-month cells are heavily faded so the month boundary is obvious
              const outOfMonthStyle = !inMonth
                ? {
                    background: 'rgba(20, 12, 6, 0.4)',
                    borderColor: 'rgba(90, 58, 26, 0.2)',
                    color: 'rgba(212, 165, 116, 0.25)',
                    opacity: 0.5,
                  }
                : {};

              return (
                <button
                  key={iso}
                  onClick={() => !disabled && onCellClick(iso)}
                  disabled={disabled}
                  className="relative h-11 sm:h-14 rounded border-2 transition-all hover:scale-105 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center"
                  style={{
                    background: colors.bg,
                    borderColor: isLocked ? '#d4af37' : isToday ? '#e0a82a' : colors.border,
                    color: colors.text,
                    boxShadow: isLocked
                      ? '0 0 12px rgba(212,175,55,0.6)'
                      : isToday
                        ? 'inset 0 0 8px rgba(224,168,42,0.4)'
                        : 'none',
                    opacity: isPast && inMonth ? 0.3 : 1,
                    ...outOfMonthStyle,
                  }}
                >
                  <div className="text-sm sm:text-xl font-bold">{date.getDate()}</div>
                  {isLocked && (
                    <Lock className="absolute bottom-0.5 right-0.5 w-3 h-3 text-amber-300" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 pb-6 flex flex-wrap items-center justify-between gap-4">
        <button
          onClick={() => askConfirm('mine')}
          className="text-xs underline transition-colors"
          style={{ color: confirming === 'mine' ? '#ef4444' : 'rgba(217, 119, 6, 0.4)' }}
        >
          {confirming === 'mine'
            ? 'Tap again to confirm clearing your availability'
            : 'Clear my availability'}
        </button>
        <label
          className="flex items-center gap-2 text-xs"
          style={{ color: 'rgba(217, 119, 6, 0.5)' }}
        >
          Planning horizon:
          <select
            value={monthsAhead}
            onChange={(e) => setMonthsAhead(Number(e.target.value))}
            className="rounded px-1 py-0.5 text-amber-200"
            style={{ background: 'rgba(45,31,18,0.8)', border: '1px solid #5a3a1a' }}
          >
            {[1, 2, 3, 6, 9, 12].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'month' : 'months'}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
};

const RankedView = ({
  ranked,
  availability,
  lockedSessions,
  pendingLock,
  setPendingLock,
  onLock,
  party,
}) => {
  if (ranked.length === 0) {
    return (
      <div className="text-center py-12 text-amber-300/60 italic">
        <Scroll className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <div className="text-base" style={{ fontFamily: '"MedievalSharp", cursive' }}>
          The party has not yet spoken.
        </div>
        <div className="text-sm mt-1">
          Mark your availability to fill the council&apos;s ledger.
        </div>
      </div>
    );
  }

  const top = ranked.slice(0, 12);
  const maxScore = party.length * 2;

  return (
    <div className="space-y-3 pb-6">
      <div
        className="text-amber-200/70 text-sm italic mb-4 text-center"
        style={{ fontFamily: '"MedievalSharp", cursive' }}
      >
        Dates ranked by the gathering of wills · Available = 2 · Maybe = 1
      </div>
      {top.map((r, idx) => {
        const isLocked = lockedSessions?.some((s) => s.date === r.iso);
        const isPending = pendingLock?.iso === r.iso;
        const pct = (r.score / maxScore) * 100;
        const everyoneAvailable = r.yes === party.length;
        return (
          <div
            key={r.iso}
            className="rounded-lg border-2 p-4"
            style={{
              background:
                idx === 0
                  ? 'linear-gradient(135deg, #3d2a14, #2d1f12)'
                  : 'linear-gradient(135deg, #2d1f12, #1f1408)',
              borderColor: idx === 0 ? '#d4af37' : '#5a3a1a',
              boxShadow: idx === 0 ? '0 0 20px rgba(212,175,55,0.2)' : 'none',
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  style={{
                    color: idx === 0 ? '#d4af37' : '#a08060',
                    fontFamily: '"Cinzel Decorative", serif',
                    fontSize: idx === 0 ? '1.75rem' : '1.25rem',
                    minWidth: '2.5rem',
                    fontWeight: 700,
                  }}
                >
                  {idx === 0 ? '★' : `#${idx + 1}`}
                </div>
                <div>
                  <div
                    className="text-base sm:text-lg font-bold text-amber-100"
                    style={{ fontFamily: '"Cinzel", serif' }}
                  >
                    {formatLong(r.iso)}
                  </div>
                  <div className="text-sm text-amber-300/70 mt-1">
                    Score: <span className="font-bold text-amber-300">{r.score}</span> / {maxScore}
                    <span className="ml-2 opacity-60">
                      ({r.voted}/{party.length} voted)
                    </span>
                    {everyoneAvailable && (
                      <span className="ml-2 text-green-400 font-bold">· Full party!</span>
                    )}
                  </div>
                </div>
              </div>
              <div>
                {isLocked ? (
                  <span
                    className="px-3 py-1.5 rounded border-2 text-sm font-bold flex items-center gap-1"
                    style={{
                      background: 'linear-gradient(135deg, #8b6914, #5c4410)',
                      borderColor: '#d4af37',
                      color: '#fef3c7',
                    }}
                  >
                    <Lock className="w-4 h-4" /> Sealed
                  </span>
                ) : !isPending ? (
                  <button
                    onClick={() => setPendingLock({ iso: r.iso, title: '' })}
                    className="px-3 py-1.5 rounded border-2 text-sm font-bold transition-all hover:scale-105"
                    style={{
                      background: 'linear-gradient(135deg, #6b8e3d, #4a6128)',
                      borderColor: '#8fb050',
                      color: '#f0fdf4',
                    }}
                  >
                    Seal this date
                  </button>
                ) : null}
              </div>
            </div>

            {/* Pending lock form */}
            {isPending && (
              <div
                className="mt-3 p-3 rounded border-2"
                style={{ borderColor: '#8fb050', background: 'rgba(107, 142, 61, 0.1)' }}
              >
                <div className="text-xs text-amber-300 mb-2 uppercase tracking-wider">
                  Session title (optional)
                </div>
                <input
                  type="text"
                  value={pendingLock.title}
                  onChange={(e) => setPendingLock({ ...pendingLock, title: e.target.value })}
                  placeholder="e.g. Session 12 — Into the Dunes"
                  className="w-full px-3 py-2 rounded border-2 mb-3 text-sm"
                  style={{
                    background: 'rgba(0,0,0,0.4)',
                    borderColor: '#5a3a1a',
                    color: '#fef3c7',
                    fontFamily: '"Cinzel", serif',
                    fontSize: '16px',
                  }}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => onLock(pendingLock.iso, pendingLock.title)}
                    className="px-3 py-1.5 rounded border-2 text-sm font-bold transition-all hover:scale-105"
                    style={{
                      background: 'linear-gradient(135deg, #6b8e3d, #4a6128)',
                      borderColor: '#8fb050',
                      color: '#f0fdf4',
                    }}
                  >
                    Confirm seal
                  </button>
                  <button
                    onClick={() => setPendingLock(null)}
                    className="px-3 py-1.5 rounded border-2 text-sm transition-all"
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      borderColor: '#5a3a1a',
                      color: '#d4a574',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Progress bar */}
            <div
              className="mt-3 h-2 rounded-full overflow-hidden"
              style={{ background: 'rgba(0,0,0,0.4)' }}
            >
              <div
                className="h-full transition-all"
                style={{
                  width: `${pct}%`,
                  background:
                    idx === 0
                      ? 'linear-gradient(90deg, #d4af37, #f0c850)'
                      : 'linear-gradient(90deg, #6b8e3d, #8fb050)',
                }}
              />
            </div>

            {/* Player chips */}
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {party.map((p) => {
                const s = availability?.[p]?.[r.iso];
                const c = statusColor(s);
                const symbol = s === 'yes' ? '✓' : s === 'maybe' ? '?' : s === 'no' ? '✕' : '—';
                return (
                  <span
                    key={p}
                    className="px-2 py-0.5 rounded border"
                    style={{
                      background: c.bg,
                      borderColor: c.border,
                      color: c.text,
                      opacity: s ? 1 : 0.4,
                    }}
                  >
                    {p} {symbol}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const LockedView = ({ lockedSessions, availability, onUnlock, askConfirm, confirming, party }) => {
  const [pendingBreak, setPendingBreak] = React.useState(null);

  if (!lockedSessions?.length) {
    return (
      <div className="text-center py-16 text-amber-300/60 italic">
        <Unlock className="w-16 h-16 mx-auto mb-4 opacity-50" />
        <div className="text-lg" style={{ fontFamily: '"MedievalSharp", cursive' }}>
          No sessions are sealed.
        </div>
        <div className="text-sm mt-2">Visit the Best Dates to choose a gathering.</div>
        <div className="mt-16">
          <button
            onClick={() => askConfirm('all')}
            className="text-xs underline transition-colors"
            style={{ color: confirming === 'all' ? '#ef4444' : 'rgba(220, 38, 38, 0.3)' }}
          >
            {confirming === 'all'
              ? 'Tap again to wipe ALL data for the whole party'
              : 'Reset all data'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-center gap-2 mb-4">
        <Sparkles
          className="w-5 h-5 text-amber-400"
          style={{ filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.6))' }}
        />
        <span
          className="text-amber-300/70 text-xs uppercase tracking-widest"
          style={{ fontFamily: '"Cinzel", serif' }}
        >
          {lockedSessions.length} Sealed {lockedSessions.length === 1 ? 'Session' : 'Sessions'}
        </span>
        <Sparkles
          className="w-5 h-5 text-amber-400"
          style={{ filter: 'drop-shadow(0 0 6px rgba(212,175,55,0.6))' }}
        />
      </div>

      <div className="space-y-4">
        {lockedSessions
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((session) => {
            const counts = scoreFor(party, availability, session.date);
            const lockedAt = new Date(session.lockedAt);
            const breaking = pendingBreak === session.date;
            return (
              <div
                key={session.date}
                className="rounded-lg border-2 p-4"
                style={{
                  background: 'linear-gradient(135deg, #2d1f12, #1f1408)',
                  borderColor: '#8b6914',
                  boxShadow: '0 0 12px rgba(212,175,55,0.15)',
                }}
              >
                <div
                  className="text-lg sm:text-2xl font-bold mb-1"
                  style={{
                    fontFamily: '"Cinzel Decorative", serif',
                    color: '#d4af37',
                    textShadow: '1px 1px 0 #000',
                  }}
                >
                  {formatLong(session.date)}
                </div>
                {session.title && (
                  <div
                    className="text-sm text-amber-200 italic mb-2"
                    style={{ fontFamily: '"MedievalSharp", cursive' }}
                  >
                    &quot;{session.title}&quot;
                  </div>
                )}
                <div className="text-amber-300/60 text-xs mb-3">
                  {counts.yes} available · {counts.maybe} maybe · {counts.no} cannot
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {party.map((p) => {
                    const s = availability?.[p]?.[session.date];
                    const color =
                      s === 'yes' ? '#8fb050' : s === 'maybe' ? '#e0a82a' : s === 'no' ? '#a8482e' : '#5a3a1a';
                    const label = s === 'yes' ? '✓' : s === 'maybe' ? '?' : s === 'no' ? '✕' : '—';
                    return (
                      <span
                        key={p}
                        className="text-xs px-2 py-0.5 rounded border"
                        style={{ borderColor: color, color }}
                      >
                        {label} {p}
                      </span>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-amber-400/40 italic">
                    Sealed by {session.lockedBy} on{' '}
                    {lockedAt.toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                  <button
                    onClick={() => {
                      if (breaking) {
                        onUnlock(session.date);
                        setPendingBreak(null);
                      } else {
                        setPendingBreak(session.date);
                        setTimeout(() => setPendingBreak((c) => (c === session.date ? null : c)), 3000);
                      }
                    }}
                    className="text-xs px-2 py-1 rounded border transition-all hover:scale-105"
                    style={{
                      borderColor: breaking ? '#ef4444' : '#8b3a2a',
                      color: breaking ? '#ef4444' : '#fee2e2',
                      background: breaking ? 'rgba(239,68,68,0.1)' : 'rgba(92,36,24,0.4)',
                    }}
                  >
                    <Unlock className="w-3 h-3 inline mr-1" />
                    {breaking ? 'Confirm break' : 'Break seal'}
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      <div className="mt-8 pb-6 text-center">
        <button
          onClick={() => askConfirm('all')}
          className="text-xs underline transition-colors"
          style={{ color: confirming === 'all' ? '#ef4444' : 'rgba(220, 38, 38, 0.3)' }}
        >
          {confirming === 'all' ? 'Tap again to wipe ALL data for the whole party' : 'Reset all data'}
        </button>
      </div>
    </div>
  );
};

export default Scheduler;
