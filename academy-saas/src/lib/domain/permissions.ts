/**
 * Role → capability matrix. Mirrors the SQL RLS policies in database/migrations.
 * The UI uses this to hide actions; the DATABASE is what actually enforces access.
 */
import type { AcademyData, ID, Role } from '@/lib/types';

export type Capability =
  | 'dashboard.finance'
  | 'players.viewAll'
  | 'players.edit'
  | 'players.import'
  | 'contacts.view'
  | 'teams.edit'
  | 'schedule.edit'
  | 'attendance.record'
  | 'attendance.correct'
  | 'finance.view'
  | 'finance.edit'
  | 'reports.finance'
  | 'reports.operations'
  | 'settings.view'
  | 'settings.edit'
  | 'users.manage'
  | 'audit.view';

const MATRIX: Record<Role, Capability[]> = {
  owner: [
    'dashboard.finance', 'players.viewAll', 'players.edit', 'players.import', 'contacts.view', 'teams.edit',
    'schedule.edit', 'attendance.record', 'attendance.correct', 'finance.view', 'finance.edit', 'reports.finance',
    'reports.operations', 'settings.view', 'settings.edit', 'users.manage', 'audit.view',
  ],
  admin: [
    'dashboard.finance', 'players.viewAll', 'players.edit', 'players.import', 'contacts.view', 'teams.edit',
    'schedule.edit', 'attendance.record', 'attendance.correct', 'finance.view', 'finance.edit', 'reports.finance',
    'reports.operations', 'settings.view', 'settings.edit', 'audit.view',
  ],
  finance: ['dashboard.finance', 'players.viewAll', 'contacts.view', 'finance.view', 'finance.edit', 'reports.finance'],
  coach: ['attendance.record', 'contacts.view', 'reports.operations'],
};

export function can(role: Role, cap: Capability): boolean {
  return MATRIX[role].includes(cap);
}

export const ROLES: Role[] = ['owner', 'admin', 'finance', 'coach'];

/** Which navigation entries each role sees. */
export type NavKey =
  | 'dashboard' | 'players' | 'teams' | 'attendance' | 'schedule' | 'invoices' | 'payments' | 'reports' | 'settings';

export function canSeeNav(role: Role, key: NavKey): boolean {
  switch (key) {
    case 'dashboard': case 'players': case 'teams': case 'schedule': case 'reports': return true;
    case 'attendance': return role !== 'finance';
    case 'invoices': case 'payments': return can(role, 'finance.view');
    case 'settings': return can(role, 'settings.view');
  }
}

/** Team ids visible to the user: all for staff/finance, assigned teams for coaches. */
export function visibleTeamIds(data: AcademyData, role: Role, coachId?: ID): Set<ID> {
  if (role !== 'coach') return new Set(data.teams.map((t) => t.id));
  return new Set(data.teamCoaches.filter((tc) => tc.coachId === coachId).map((tc) => tc.teamId));
}

/** Player ids visible to the user: all for owner/admin/finance, own-team players for coaches. */
export function visiblePlayerIds(data: AcademyData, role: Role, coachId?: ID): Set<ID> {
  if (role !== 'coach') return new Set(data.players.map((p) => p.id));
  const teams = visibleTeamIds(data, role, coachId);
  return new Set(data.assignments.filter((a) => !a.endDate && teams.has(a.teamId)).map((a) => a.playerId));
}
