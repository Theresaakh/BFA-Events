'use client';
/**
 * Phase 1 data layer: one academy's data held in the browser (with localStorage persistence).
 * Every screen talks ONLY to this store, so Phase 2 can replace it with Supabase queries and
 * server actions without rewriting the UI. Permission checks here mirror the database RLS rules.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocale } from 'next-intl';
import { createSeed } from '@/lib/mock/seed';
import { can, visiblePlayerIds, visibleTeamIds } from '@/lib/domain/permissions';
import { AllocationError, invoiceBalance, liveAllocations, validateAllocations } from '@/lib/domain/finance';
import {
  addDays, formatDate, formatDateTime, formatMoney, formatNumber, formatPercent, formatTime, todayIn, zonedToUtc,
} from '@/lib/format';
import {
  fieldErrors, invoiceSchema, paymentSchema, playerImportRowSchema, playerSchema, sessionSchema, teamSchema,
  type InvoiceInput, type PaymentInput, type PlayerInput, type SessionInput, type TeamInput,
} from '@/lib/validation/schemas';
import type { AcademyData, AttendanceStatus, AuditEntry, ID, Invoice, Payment, Player, User } from '@/lib/types';
import type { Locale } from '@/i18n/routing';

const STORAGE_KEY = 'academyos.demo.v1';

export type Result<T = ID> = { ok: true; value: T } | { ok: false; error: string; fields?: Record<string, string> };
const ok = <T,>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string, fields?: Record<string, string>): Result<never> => ({ ok: false, error, fields });

let idCounter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

interface StoreValue {
  ready: boolean;
  data: AcademyData;
  user: User;
  today: string;
  visibleTeams: Set<ID>;
  visiblePlayers: Set<ID>;
  actions: ReturnType<typeof makeActions>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function AcademyStoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AcademyData | null>(null);
  const [userId, setUserId] = useState<ID>('u-owner');

  // Load on the client only (localStorage); the demo is regenerated if nothing is saved yet.
  useEffect(() => {
    let loaded: { data: AcademyData; userId: ID } | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) loaded = JSON.parse(raw);
    } catch { /* storage unavailable → fresh demo */ }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client hydration from localStorage
    setData(loaded?.data ?? createSeed());
    setUserId(loaded?.userId ?? 'u-owner');
  }, []);

  useEffect(() => {
    if (!data) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, userId })); } catch { /* quota / private mode */ }
  }, [data, userId]);

  const value = useMemo<StoreValue | null>(() => {
    if (!data) return null;
    const user = data.users.find((u) => u.id === userId) ?? data.users[0];
    const today = todayIn(data.academy.timezone);
    return {
      ready: true,
      data,
      user,
      today,
      visibleTeams: visibleTeamIds(data, user.role, user.coachId),
      visiblePlayers: visiblePlayerIds(data, user.role, user.coachId),
      actions: makeActions(setData, setUserId, user, today),
    };
  }, [data, userId]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

/** Returns null until the client has loaded the data (render a skeleton meanwhile). */
export function useMaybeStore(): StoreValue | null {
  return useContext(StoreContext);
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error('useStore() used before the store is ready — wrap the page in <StoreGate>.');
  return v;
}

/** Formatting bound to the current UI language and the academy's currency & time zone. */
export function useFmt() {
  const locale = useLocale() as Locale;
  const { data } = useStore();
  const { currency, timezone } = data.academy;
  return useMemo(() => ({
    locale,
    currency,
    timezone,
    money: (minor: number, cur = currency) => formatMoney(minor, cur, locale),
    number: (n: number) => formatNumber(n, locale),
    percent: (r: number) => formatPercent(r, locale),
    date: (d: string, style?: 'short' | 'medium' | 'long') => formatDate(d, locale, style),
    time: (dt: string) => formatTime(dt, locale, timezone),
    dateTime: (dt: string) => formatDateTime(dt, locale, timezone),
  }), [locale, currency, timezone]);
}

// ---------------------------------------------------------------------------- actions
function makeActions(
  setData: (fn: (d: AcademyData | null) => AcademyData | null) => void,
  setUserId: (id: ID) => void,
  user: User,
  today: string,
) {
  /** Apply a change to a copy of the data and append an audit entry. */
  const commit = (fn: (d: AcademyData) => void, audit?: Omit<AuditEntry, 'id' | 'at' | 'actorId'>) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      if (audit) next.audit.unshift({ ...audit, id: newId('au'), at: new Date().toISOString(), actorId: user.id });
      return next;
    });
  };
  const deny = () => fail('errors.forbidden');
  const role = user.role;

  return {
    switchUser(id: ID) { setUserId(id); },

    resetDemo() {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      setData(() => createSeed());
      setUserId('u-owner');
    },

    updateAcademy(patch: Partial<AcademyData['academy']>): Result<true> {
      if (!can(role, 'settings.edit')) return deny();
      commit((d) => { Object.assign(d.academy, patch); }, { entity: 'settings', entityId: 'academy', action: 'update', summary: `Academy settings updated (${Object.keys(patch).join(', ')})` });
      return ok(true);
    },

    saveBranch(name: string, city: string, id?: ID): Result {
      if (!can(role, 'settings.edit')) return deny();
      if (name.trim().length < 2) return fail('errors.validation', { name: 'validation.required' });
      const branchId = id ?? newId('b');
      commit((d) => {
        const b = d.branches.find((x) => x.id === branchId);
        if (b) Object.assign(b, { name: name.trim(), city: city.trim() || undefined });
        else d.branches.push({ id: branchId, name: name.trim(), city: city.trim() || undefined });
      }, { entity: 'settings', entityId: branchId, action: id ? 'update' : 'create', summary: `${id ? 'Updated' : 'Added'} branch ${name}` });
      return ok(branchId);
    },

    addLocation(branchId: ID, name: string): Result {
      if (!can(role, 'settings.edit')) return deny();
      if (name.trim().length < 2) return fail('errors.validation', { name: 'validation.required' });
      const id = newId('l');
      commit((d) => { d.locations.push({ id, branchId, name: name.trim() }); }, { entity: 'settings', entityId: id, action: 'create', summary: `Added location ${name}` });
      return ok(id);
    },

    // ------------------------------------------------------------------ players
    savePlayer(raw: Record<string, unknown>, data: AcademyData, id?: ID): Result {
      if (!can(role, 'players.edit')) return deny();
      const parsed = playerSchema.safeParse(raw);
      if (!parsed.success) return fail('errors.validation', fieldErrors(parsed.error));
      const input: PlayerInput = parsed.data;
      const playerId = id ?? newId('p');
      const code = id ? data.players.find((p) => p.id === id)!.code : `PLR-${String(data.counters.player + 1).padStart(5, '0')}`;
      commit((d) => {
        let p = d.players.find((x) => x.id === playerId);
        if (!p) {
          d.counters.player += 1;
          p = { id: playerId, code, firstName: '', lastName: '', status: 'active', registrationDate: today };
          d.players.push(p);
        }
        Object.assign(p, {
          firstName: input.firstName, lastName: input.lastName, dateOfBirth: input.dateOfBirth, gender: input.gender,
          status: input.status, registrationDate: input.registrationDate, branchId: input.branchId || undefined, notes: input.notes,
        });
        if (input.status === 'archived' && !p.archivedAt) p.archivedAt = new Date().toISOString();
        if (input.status !== 'archived') p.archivedAt = undefined;
        // team assignment with history
        const current = d.assignments.find((a) => a.playerId === playerId && !a.endDate);
        if ((current?.teamId ?? '') !== (input.teamId ?? '')) {
          if (current) current.endDate = today;
          if (input.teamId) d.assignments.push({ id: newId('a'), playerId, teamId: input.teamId, startDate: today });
        }
        // contacts
        const upsertContact = (kind: 'guardian' | 'emergency', name?: string, rel?: string, phone?: string, email?: string) => {
          const existing = d.contacts.find((c) => c.playerId === playerId && c.kind === kind && (kind === 'emergency' || c.isPrimary));
          if (!name) { if (existing) d.contacts = d.contacts.filter((c) => c !== existing); return; }
          if (existing) Object.assign(existing, { fullName: name, relationship: rel, phone, email });
          else d.contacts.push({ id: newId('c'), playerId, kind, fullName: name, relationship: rel, phone, email, isPrimary: kind === 'guardian' });
        };
        upsertContact('guardian', input.guardianName, input.guardianRelationship, input.guardianPhone, input.guardianEmail);
        upsertContact('emergency', input.emergencyName, input.emergencyRelationship, input.emergencyPhone);
      }, { entity: 'player', entityId: playerId, action: id ? 'update' : 'create', summary: `${id ? 'Updated' : 'Registered'} player ${code} ${input.firstName} ${input.lastName}` });
      return ok(playerId);
    },

    setPlayerArchived(player: Player, archived: boolean): Result<true> {
      if (!can(role, 'players.edit')) return deny();
      commit((d) => {
        const p = d.players.find((x) => x.id === player.id)!;
        p.status = archived ? 'archived' : 'active';
        p.archivedAt = archived ? new Date().toISOString() : undefined;
        if (archived) d.assignments.filter((a) => a.playerId === p.id && !a.endDate).forEach((a) => { a.endDate = today; });
      }, { entity: 'player', entityId: player.id, action: archived ? 'archive' : 'update', summary: `${archived ? 'Archived' : 'Restored'} player ${player.code}` });
      return ok(true);
    },

    importPlayers(rows: Record<string, string>[], data: AcademyData): Result<{ imported: number; errors: { row: number; field: string; error: string }[] }> {
      if (!can(role, 'players.import')) return deny();
      const errors: { row: number; field: string; error: string }[] = [];
      const valid: { row: ReturnType<typeof playerImportRowSchema.parse>; teamId?: ID }[] = [];
      rows.forEach((r, i) => {
        const parsed = playerImportRowSchema.safeParse(r);
        if (!parsed.success) {
          Object.entries(fieldErrors(parsed.error)).forEach(([field, error]) => errors.push({ row: i + 2, field, error }));
          return;
        }
        const teamName = parsed.data.team?.toLowerCase();
        const team = teamName ? data.teams.find((t) => t.name.toLowerCase() === teamName) : undefined;
        if (teamName && !team) { errors.push({ row: i + 2, field: 'team', error: 'validation.unknownTeam' }); return; }
        valid.push({ row: parsed.data, teamId: team?.id });
      });
      if (errors.length) return { ok: true, value: { imported: 0, errors } };
      commit((d) => {
        for (const { row, teamId } of valid) {
          d.counters.player += 1;
          const id = newId('p');
          d.players.push({ id, code: `PLR-${String(d.counters.player).padStart(5, '0')}`, firstName: row.first_name, lastName: row.last_name, dateOfBirth: row.date_of_birth, gender: row.gender, status: 'active', registrationDate: today });
          if (teamId) d.assignments.push({ id: newId('a'), playerId: id, teamId, startDate: today });
          if (row.guardian_name) d.contacts.push({ id: newId('c'), playerId: id, kind: 'guardian', fullName: row.guardian_name, phone: row.guardian_phone, email: row.guardian_email, isPrimary: true });
        }
      }, { entity: 'player', entityId: 'import', action: 'import', summary: `Imported ${valid.length} players from CSV` });
      return ok({ imported: valid.length, errors });
    },

    // ------------------------------------------------------------------ teams
    saveTeam(raw: Record<string, unknown>, id?: ID): Result {
      if (!can(role, 'teams.edit')) return deny();
      const parsed = teamSchema.safeParse(raw);
      if (!parsed.success) return fail('errors.validation', fieldErrors(parsed.error));
      const input: TeamInput = parsed.data;
      const teamId = id ?? newId('t');
      commit((d) => {
        let t = d.teams.find((x) => x.id === teamId);
        if (!t) { t = { id: teamId, name: '', sport: 'football', active: true }; d.teams.push(t); }
        Object.assign(t, { name: input.name, sport: input.sport, ageGroup: input.ageGroup, category: input.category, season: input.season, branchId: input.branchId || undefined });
        d.teamCoaches = d.teamCoaches.filter((tc) => tc.teamId !== teamId)
          .concat(input.coachIds.map((coachId, i) => ({ teamId, coachId, isHead: i === 0 })));
      }, { entity: 'team', entityId: teamId, action: id ? 'update' : 'create', summary: `${id ? 'Updated' : 'Created'} team ${input.name}` });
      return ok(teamId);
    },

    setTeamPlayers(teamId: ID, playerIds: ID[]): Result<true> {
      if (!can(role, 'teams.edit')) return deny();
      commit((d) => {
        const current = d.assignments.filter((a) => a.teamId === teamId && !a.endDate);
        current.filter((a) => !playerIds.includes(a.playerId)).forEach((a) => { a.endDate = today; });
        playerIds.filter((pid) => !current.some((a) => a.playerId === pid))
          .forEach((pid) => d.assignments.push({ id: newId('a'), playerId: pid, teamId, startDate: today }));
      }, { entity: 'team', entityId: teamId, action: 'update', summary: `Roster updated (${playerIds.length} players)` });
      return ok(true);
    },

    // ------------------------------------------------------------------ schedule
    saveSession(raw: Record<string, unknown>, timezone: string, id?: ID): Result {
      if (!can(role, 'schedule.edit')) return deny();
      const parsed = sessionSchema.safeParse(raw);
      if (!parsed.success) return fail('errors.validation', fieldErrors(parsed.error));
      const input: SessionInput = parsed.data;
      const sessionId = id ?? newId('s');
      commit((d) => {
        let s = d.sessions.find((x) => x.id === sessionId);
        if (!s) { s = { id: sessionId, teamId: '', startsAt: '', endsAt: '', status: 'scheduled' }; d.sessions.push(s); }
        Object.assign(s, {
          teamId: input.teamId, coachId: input.coachId || undefined, locationId: input.locationId || undefined, notes: input.notes,
          startsAt: zonedToUtc(input.date, input.start, timezone), endsAt: zonedToUtc(input.date, input.end, timezone),
        });
      }, { entity: 'session', entityId: sessionId, action: id ? 'update' : 'create', summary: `${id ? 'Updated' : 'Scheduled'} session on ${input.date} ${input.start}` });
      return ok(sessionId);
    },

    setSessionCancelled(sessionId: ID, cancelled: boolean, reason?: string): Result<true> {
      if (!can(role, 'schedule.edit')) return deny();
      commit((d) => {
        const s = d.sessions.find((x) => x.id === sessionId)!;
        s.status = cancelled ? 'cancelled' : (s.endsAt < new Date().toISOString() ? 'completed' : 'scheduled');
        s.cancelReason = cancelled ? reason : undefined;
      }, { entity: 'session', entityId: sessionId, action: cancelled ? 'cancel' : 'update', summary: cancelled ? `Session cancelled${reason ? `: ${reason}` : ''}` : 'Session restored' });
      return ok(true);
    },

    // ------------------------------------------------------------------ attendance
    saveAttendance(sessionId: ID, marks: Record<ID, AttendanceStatus>, data: AcademyData, reason?: string): Result<{ changed: number }> {
      const session = data.sessions.find((s) => s.id === sessionId);
      if (!session || !can(role, 'attendance.record')) return deny();
      if (role === 'coach' && !visibleTeamIds(data, role, user.coachId).has(session.teamId)) return deny();
      if (session.status === 'cancelled') return fail('errors.sessionCancelled');
      const now = new Date().toISOString();
      let changed = 0; let corrections = 0;
      for (const [playerId, status] of Object.entries(marks)) {
        const existing = data.attendance.find((a) => a.sessionId === sessionId && a.playerId === playerId);
        if (existing && existing.status === status) continue;
        if (existing) {
          const coachMayEdit = role === 'coach' && existing.recordedBy === user.id && Date.now() - new Date(existing.recordedAt).getTime() < 48 * 3600_000;
          if (!can(role, 'attendance.correct') && !coachMayEdit) return fail('errors.attendanceLocked');
          corrections += 1;
        }
        changed += 1;
      }
      if (corrections > 0 && can(role, 'attendance.correct') && !reason?.trim()) return fail('errors.reasonRequired');
      commit((d) => {
        for (const [playerId, status] of Object.entries(marks)) {
          const existing = d.attendance.find((a) => a.sessionId === sessionId && a.playerId === playerId);
          if (existing) {
            if (existing.status !== status) Object.assign(existing, { status, updatedBy: user.id, updatedAt: now, note: reason || existing.note });
          } else d.attendance.push({ id: newId('at'), sessionId, playerId, status, recordedBy: user.id, recordedAt: now });
        }
        const s = d.sessions.find((x) => x.id === sessionId)!;
        if (s.status === 'scheduled' && s.startsAt <= now) s.status = 'completed';
      }, { entity: 'attendance', entityId: sessionId, action: corrections ? 'correct' : 'create', summary: corrections ? `Corrected ${corrections} attendance record(s). Reason: ${reason ?? '—'}` : `Recorded attendance for ${changed} player(s)` });
      return ok({ changed });
    },

    // ------------------------------------------------------------------ invoices
    createInvoice(raw: InvoiceInput, data: AcademyData, issue: boolean): Result {
      if (!can(role, 'finance.edit')) return deny();
      const parsed = invoiceSchema.safeParse(raw);
      if (!parsed.success) return fail('errors.validation', fieldErrors(parsed.error));
      const input = parsed.data;
      const id = newId('inv');
      const year = input.issueDate.slice(0, 4);
      const number = `INV-${year}-${String(data.counters.invoice + 1).padStart(5, '0')}`;
      commit((d) => {
        d.counters.invoice += 1;
        d.invoices.push({
          id, number, playerId: input.playerId, currency: d.academy.currency, issueDate: input.issueDate, dueDate: input.dueDate,
          status: issue ? 'issued' : 'draft', notes: input.notes, createdAt: new Date().toISOString(),
          lines: input.lines.map((l) => ({ ...l, id: newId('ln') })),
        });
      }, { entity: 'invoice', entityId: id, action: 'create', summary: `Created invoice ${number}${issue ? ' (issued)' : ' (draft)'}` });
      return ok(id);
    },

    issueInvoice(invoice: Invoice): Result<true> {
      if (!can(role, 'finance.edit')) return deny();
      if (invoice.status !== 'draft') return fail('errors.invalidState');
      commit((d) => { d.invoices.find((i) => i.id === invoice.id)!.status = 'issued'; }, { entity: 'invoice', entityId: invoice.id, action: 'update', summary: `Issued invoice ${invoice.number}` });
      return ok(true);
    },

    voidInvoice(invoice: Invoice, data: AcademyData): Result<true> {
      if (!can(role, 'finance.edit')) return deny();
      if (liveAllocations(data.allocations, data.payments).some((a) => a.invoiceId === invoice.id)) return fail('errors.invoiceHasPayments');
      commit((d) => { d.invoices.find((i) => i.id === invoice.id)!.status = 'void'; }, { entity: 'invoice', entityId: invoice.id, action: 'void', summary: `Voided invoice ${invoice.number}` });
      return ok(true);
    },

    // ------------------------------------------------------------------ payments
    recordPayment(raw: PaymentInput, data: AcademyData): Result {
      if (!can(role, 'finance.edit')) return deny();
      const parsed = paymentSchema.safeParse(raw);
      if (!parsed.success) return fail('errors.validation', fieldErrors(parsed.error));
      const input = parsed.data;
      const currency = data.academy.currency;
      try {
        validateAllocations({ amount: input.amount, currency, playerId: input.playerId }, input.allocations, data.invoices, data.allocations, data.payments, today);
      } catch (e) {
        if (e instanceof AllocationError) return fail(`errors.allocation.${e.message}`);
        throw e;
      }
      const id = newId('pay');
      const receiptNumber = `RCT-${input.paidOn.slice(0, 4)}-${String(data.counters.receipt + 1).padStart(5, '0')}`;
      commit((d) => {
        d.counters.receipt += 1;
        d.payments.push({ id, receiptNumber, playerId: input.playerId, amount: input.amount, currency, paidOn: input.paidOn, method: input.method, reference: input.reference, receivedBy: user.id, createdAt: new Date().toISOString() } satisfies Payment);
        input.allocations.forEach((a) => d.allocations.push({ id: newId('al'), paymentId: id, invoiceId: a.invoiceId, amount: a.amount }));
      }, { entity: 'payment', entityId: id, action: 'create', summary: `Recorded payment ${receiptNumber}` });
      return ok(id);
    },

    voidPayment(payment: Payment, reason: string): Result<true> {
      if (!can(role, 'finance.edit')) return deny();
      if (!reason.trim()) return fail('errors.reasonRequired');
      commit((d) => {
        const p = d.payments.find((x) => x.id === payment.id)!;
        p.voidedAt = new Date().toISOString(); p.voidReason = reason;
      }, { entity: 'payment', entityId: payment.id, action: 'void', summary: `Voided payment ${payment.receiptNumber}: ${reason}` });
      return ok(true);
    },
  };
}

/** Convenience selectors */
export function useInvoiceBalances() {
  const { data, today } = useStore();
  return useMemo(() => {
    const map = new Map<ID, ReturnType<typeof invoiceBalance>>();
    for (const inv of data.invoices) map.set(inv.id, invoiceBalance(inv, data.allocations, data.payments, today));
    return map;
  }, [data.invoices, data.allocations, data.payments, today]);
}

export function usePlayerName() {
  const { data } = useStore();
  return useCallback((id?: ID) => {
    const p = data.players.find((x) => x.id === id);
    return p ? `${p.firstName} ${p.lastName}` : '—';
  }, [data.players]);
}

export { addDays };
