/**
 * FICTIONAL demo data. Every person, phone number and email here is invented.
 * Phone numbers use the reserved 555-01xx range; emails use the reserved .test domain.
 * Generated deterministically (seeded random) relative to "today" so the demo always looks current.
 */
import { addDays, todayIn, weekdayIndex, zonedToUtc } from '@/lib/format';
import type {
  AcademyData, AttendanceStatus, Invoice, Payment, PaymentAllocation, Player, SportCode, Team, TrainingSession,
} from '@/lib/types';

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_M = ['Adam', 'Karim', 'Lucas', 'Omar', 'Noah', 'Youssef', 'Elias', 'Hugo', 'Rayan', 'Samir', 'Leo', 'Ziad', 'Malik', 'Theo', 'Ali', 'Nathan', 'Hadi', 'Ilyes', 'Jad', 'Gabriel', 'Fares', 'Liam', 'Tarek', 'Mateo'];
const FIRST_F = ['Lea', 'Maya', 'Nour', 'Sofia', 'Yasmine', 'Ines', 'Chloe', 'Layla', 'Amira', 'Emma', 'Rania', 'Lina', 'Sara', 'Jade', 'Dana', 'Mila'];
const LAST = ['Haddad', 'Martin', 'Khoury', 'Benali', 'Dubois', 'Nasser', 'Moreau', 'Saleh', 'Rahman', 'Laurent', 'Fares', 'Bernard', 'Aziz', 'Petit', 'Mansour', 'Garcia', 'Hamdan', 'Rossi', 'Kassem', 'Roux', 'Chahine', 'Lambert', 'Taha', 'Fontaine'];

export const DEMO_ACADEMY_ID = 'demo-academy';

export function createSeed(now = new Date()): AcademyData {
  const tz = 'Asia/Dubai';
  const currency = 'USD';
  const today = todayIn(tz, now);
  const r = rng(20261123);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const nowIso = now.toISOString();

  const data: AcademyData = {
    academy: { id: DEMO_ACADEMY_ID, name: 'Atlas Sports Academy', defaultLocale: 'en', currency, timezone: tz, country: 'AE' },
    users: [
      { id: 'u-owner', fullName: 'Lina Haddad', email: 'owner@atlas-academy.test', role: 'owner' },
      { id: 'u-admin', fullName: 'Omar Saleh', email: 'admin@atlas-academy.test', role: 'admin' },
      { id: 'u-finance', fullName: 'Claire Martin', email: 'finance@atlas-academy.test', role: 'finance' },
      { id: 'u-coach1', fullName: 'Karim Benali', email: 'k.benali@atlas-academy.test', role: 'coach', coachId: 'c1' },
      { id: 'u-coach2', fullName: 'Sofia Moreau', email: 's.moreau@atlas-academy.test', role: 'coach', coachId: 'c2' },
    ],
    branches: [
      { id: 'b1', name: 'Downtown Campus', city: 'Dubai', address: '12 Example Street' },
      { id: 'b2', name: 'Riverside Campus', city: 'Dubai', address: '48 Sample Avenue' },
    ],
    locations: [
      { id: 'l1', branchId: 'b1', name: 'Pitch A' },
      { id: 'l2', branchId: 'b1', name: 'Pitch B' },
      { id: 'l3', branchId: 'b2', name: 'Indoor Court 1' },
      { id: 'l4', branchId: 'b2', name: 'Pitch C' },
    ],
    coaches: [
      { id: 'c1', fullName: 'Karim Benali', email: 'k.benali@atlas-academy.test', phone: '+1 555 0101', branchId: 'b1', active: true },
      { id: 'c2', fullName: 'Sofia Moreau', email: 's.moreau@atlas-academy.test', phone: '+1 555 0102', branchId: 'b2', active: true },
      { id: 'c3', fullName: 'Hadi Mansour', email: 'h.mansour@atlas-academy.test', phone: '+1 555 0103', branchId: 'b1', active: true },
      { id: 'c4', fullName: 'Emma Laurent', email: 'e.laurent@atlas-academy.test', phone: '+1 555 0104', branchId: 'b2', active: true },
      { id: 'c5', fullName: 'Tarek Nasser', email: 't.nasser@atlas-academy.test', phone: '+1 555 0105', branchId: 'b1', active: true },
    ],
    teams: [], teamCoaches: [], players: [], assignments: [], contacts: [], sessions: [], attendance: [],
    invoices: [], payments: [], allocations: [], audit: [],
    counters: { player: 0, invoice: 0, receipt: 0 },
  };

  // ---------------------------------------------------------------- teams
  const teamDefs: { id: string; name: string; sport: SportCode; age: string; cat: string; birth: number; branch: string; loc: string; coaches: string[]; days: number[]; time: string; fee: number }[] = [
    { id: 't1', name: 'Football U8', sport: 'football', age: 'U8', cat: 'Mixed', birth: 8, branch: 'b1', loc: 'l1', coaches: ['c3'], days: [1, 3], time: '16:00', fee: 12000 },
    { id: 't2', name: 'Football U10', sport: 'football', age: 'U10', cat: 'Boys', birth: 10, branch: 'b1', loc: 'l1', coaches: ['c1'], days: [1, 3], time: '17:30', fee: 12000 },
    { id: 't3', name: 'Football U12', sport: 'football', age: 'U12', cat: 'Boys', birth: 12, branch: 'b1', loc: 'l2', coaches: ['c1', 'c5'], days: [2, 4], time: '17:00', fee: 13500 },
    { id: 't4', name: 'Football U14', sport: 'football', age: 'U14', cat: 'Boys', birth: 14, branch: 'b2', loc: 'l4', coaches: ['c5'], days: [2, 4], time: '18:30', fee: 13500 },
    { id: 't5', name: 'Football U13 Girls', sport: 'football', age: 'U13', cat: 'Girls', birth: 13, branch: 'b2', loc: 'l4', coaches: ['c2'], days: [1, 6], time: '16:30', fee: 13500 },
    { id: 't6', name: 'Basketball U12', sport: 'basketball', age: 'U12', cat: 'Mixed', birth: 12, branch: 'b2', loc: 'l3', coaches: ['c4'], days: [0, 3], time: '17:00', fee: 15000 },
    { id: 't7', name: 'Basketball U16', sport: 'basketball', age: 'U16', cat: 'Boys', birth: 16, branch: 'b2', loc: 'l3', coaches: ['c4', 'c2'], days: [2, 6], time: '18:30', fee: 15000 },
  ];
  const season = `${today.slice(0, 4)}/${String((Number(today.slice(2, 4)) + 1) % 100).padStart(2, '0')}`;
  for (const t of teamDefs) {
    data.teams.push({ id: t.id, name: t.name, sport: t.sport, ageGroup: t.age, category: t.cat, season, branchId: t.branch, active: true } satisfies Team);
    t.coaches.forEach((c, i) => data.teamCoaches.push({ teamId: t.id, coachId: c, isHead: i === 0 }));
  }

  // ---------------------------------------------------------------- players
  const year = Number(today.slice(0, 4));
  for (const t of teamDefs) {
    const size = 10 + Math.floor(r() * 5);
    for (let i = 0; i < size; i++) {
      const female = t.cat === 'Girls' || (t.cat === 'Mixed' && r() < 0.4);
      const first = pick(female ? FIRST_F : FIRST_M);
      const last = pick(LAST);
      data.counters.player += 1;
      const id = `p${data.counters.player}`;
      const regDays = Math.floor(r() * 420) + 5;
      const statusRoll = r();
      const player: Player = {
        id,
        code: `PLR-${String(data.counters.player).padStart(5, '0')}`,
        firstName: first,
        lastName: last,
        dateOfBirth: `${year - t.birth + (r() < 0.5 ? 1 : 0)}-${String(1 + Math.floor(r() * 12)).padStart(2, '0')}-${String(1 + Math.floor(r() * 28)).padStart(2, '0')}`,
        gender: female ? 'female' : 'male',
        status: statusRoll < 0.86 ? 'active' : statusRoll < 0.93 ? 'trial' : 'inactive',
        registrationDate: addDays(today, -regDays),
        branchId: t.branch,
      };
      data.players.push(player);
      data.assignments.push({ id: `a-${id}`, playerId: id, teamId: t.id, startDate: player.registrationDate });
      const n = String(data.counters.player % 100).padStart(2, '0');
      data.contacts.push({ id: `g-${id}`, playerId: id, kind: 'guardian', fullName: `${pick(female ? FIRST_M : FIRST_F)} ${last}`, relationship: r() < 0.5 ? 'Mother' : 'Father', phone: `+1 555 01${n}`, email: `${first.toLowerCase()}.${last.toLowerCase()}.family@example.test`, isPrimary: true });
      if (r() < 0.7) data.contacts.push({ id: `e-${id}`, playerId: id, kind: 'emergency', fullName: `${pick(FIRST_F)} ${pick(LAST)}`, relationship: pick(['Aunt', 'Uncle', 'Grandparent', 'Neighbour']), phone: `+1 555 01${String((Number(n) + 37) % 100).padStart(2, '0')}`, isPrimary: false });
    }
  }
  // one archived player for realism
  const archived = data.players[5];
  archived.status = 'archived';
  archived.archivedAt = addDays(today, -20) + 'T09:00:00Z';
  data.assignments.find((a) => a.playerId === archived.id)!.endDate = addDays(today, -20);

  // ---------------------------------------------------------------- sessions & attendance
  for (let d = -35; d <= 21; d++) {
    const date = addDays(today, d);
    const wd = weekdayIndex(date);
    for (const t of teamDefs) {
      if (!t.days.includes(wd)) continue;
      const startsAt = zonedToUtc(date, t.time, tz);
      const endsAt = new Date(new Date(startsAt).getTime() + 90 * 60000).toISOString();
      const cancelled = r() < 0.04;
      const s: TrainingSession = {
        id: `s-${t.id}-${date}`, teamId: t.id, coachId: t.coaches[0], locationId: t.loc, startsAt, endsAt,
        status: cancelled ? 'cancelled' : d < 0 ? 'completed' : 'scheduled',
        cancelReason: cancelled ? 'Weather conditions' : undefined,
      };
      data.sessions.push(s);
      if (d < 0 && !cancelled) {
        const roster = data.assignments.filter((a) => a.teamId === t.id && a.startDate <= date && (!a.endDate || a.endDate >= date));
        for (const a of roster) {
          const roll = r();
          const status: AttendanceStatus = roll < 0.82 ? 'present' : roll < 0.93 ? 'absent' : 'excused';
          const coachUser = data.users.find((u) => u.coachId === t.coaches[0]);
          data.attendance.push({ id: `at-${s.id}-${a.playerId}`, sessionId: s.id, playerId: a.playerId, status, recordedBy: coachUser?.id ?? 'u-admin', recordedAt: endsAt });
        }
      }
    }
  }

  // ---------------------------------------------------------------- invoices & payments
  const nextInvoice = (issue: string) => { data.counters.invoice += 1; return `INV-${issue.slice(0, 4)}-${String(data.counters.invoice).padStart(5, '0')}`; };
  const nextReceipt = (paid: string) => { data.counters.receipt += 1; return `RCT-${paid.slice(0, 4)}-${String(data.counters.receipt).padStart(5, '0')}`; };
  const monthStart = (offset: number) => {
    const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + offset);
    return d.toISOString().slice(0, 10);
  };
  const monthName = (iso: string) => new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

  const invoicesToCreate: Omit<Invoice, 'id' | 'number' | 'createdAt'>[] = [];
  for (const p of data.players) {
    const team = teamDefs.find((t) => t.id === data.assignments.find((a) => a.playerId === p.id)!.teamId)!;
    if (p.registrationDate >= monthStart(-3)) {
      invoicesToCreate.push({ playerId: p.id, currency, issueDate: p.registrationDate, dueDate: addDays(p.registrationDate, 14), status: 'issued', lines: [{ id: 'l', chargeType: 'registration', description: 'Registration fee', quantity: 1, unitAmount: 7500 }] });
    }
    for (let m = -3; m <= 0; m++) {
      const issue = monthStart(m);
      if (p.registrationDate > addDays(issue, 27)) continue;
      if (p.status === 'archived' && m === 0) continue;
      if (p.status === 'inactive' && m >= -1) continue;
      invoicesToCreate.push({ playerId: p.id, currency, issueDate: issue, dueDate: addDays(issue, 14), status: 'issued', lines: [{ id: 'l', chargeType: 'membership', description: `Monthly membership — ${monthName(issue)}`, quantity: 1, unitAmount: team.fee }] });
    }
    if (r() < 0.25) {
      const issue = addDays(today, -40);
      invoicesToCreate.push({ playerId: p.id, currency, issueDate: issue, dueDate: addDays(issue, 10), status: 'issued', lines: [{ id: 'l', chargeType: 'tournament', description: 'Regional Cup entry', quantity: 1, unitAmount: 4000 }] });
    }
    if (r() < 0.12) {
      const issue = addDays(today, -10);
      invoicesToCreate.push({ playerId: p.id, currency, issueDate: issue, dueDate: addDays(issue, 30), status: 'issued', lines: [{ id: 'l', chargeType: 'camp', description: 'Winter camp (5 days)', quantity: 5, unitAmount: 5000 }, { id: 'l2', chargeType: 'trip', description: 'Transport', quantity: 1, unitAmount: 3500 }] });
    }
  }
  invoicesToCreate.sort((a, b) => a.issueDate.localeCompare(b.issueDate));

  const methods = ['cash', 'bank_transfer', 'card', 'bank_transfer', 'cash', 'mobile_money'] as const;
  for (const draft of invoicesToCreate) {
    if (draft.issueDate > today) continue;
    const inv: Invoice = { ...draft, id: `inv${data.counters.invoice + 1}`, number: nextInvoice(draft.issueDate), createdAt: `${draft.issueDate}T08:00:00Z`, lines: draft.lines.map((l, i) => ({ ...l, id: `${l.id}${i}-${data.counters.invoice}` })) };
    data.invoices.push(inv);
    const total = inv.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitAmount), 0);
    const age = (new Date(`${today}T00:00:00Z`).getTime() - new Date(`${inv.issueDate}T00:00:00Z`).getTime()) / 86400000;
    const roll = r();
    const payParts: number[] =
      roll < (age > 45 ? 0.78 : age > 15 ? 0.55 : 0.3) ? [total]
        : roll < (age > 45 ? 0.9 : 0.75) ? (r() < 0.5 ? [Math.round(total * 0.4 / 100) * 100] : [Math.round(total * 0.4 / 100) * 100, Math.round(total * 0.3 / 100) * 100])
          : [];
    let paidOn = addDays(inv.issueDate, 1 + Math.floor(r() * 10));
    for (const part of payParts) {
      if (paidOn > today) break;
      const pay: Payment = { id: `pay${data.counters.receipt + 1}`, receiptNumber: nextReceipt(paidOn), playerId: inv.playerId, amount: part, currency, paidOn, method: pick([...methods]), reference: r() < 0.5 ? `REF-${Math.floor(r() * 900000 + 100000)}` : undefined, receivedBy: 'u-finance', createdAt: `${paidOn}T10:00:00Z` };
      data.payments.push(pay);
      data.allocations.push({ id: `al-${pay.id}`, paymentId: pay.id, invoiceId: inv.id, amount: part } satisfies PaymentAllocation);
      paidOn = addDays(paidOn, 5 + Math.floor(r() * 12));
    }
  }

  data.audit.push({ id: 'au-1', at: nowIso, actorId: 'u-owner', entity: 'settings', entityId: DEMO_ACADEMY_ID, action: 'create', summary: 'Demo academy created with fictional data' });
  return data;
}
