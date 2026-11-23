/**
 * TypeScript mirror of the database schema (supabase/migrations).
 * Money is ALWAYS an integer number of minor units (cents) + an ISO-4217 currency code.
 */
import type { Locale } from '@/i18n/routing';

export type ID = string;
export type ISODate = string;      // 'YYYY-MM-DD'
export type ISODateTime = string;  // full ISO timestamp (UTC)

export type Role = 'owner' | 'admin' | 'finance' | 'coach';
export type SportCode = 'football' | 'basketball';
export type PlayerStatus = 'active' | 'trial' | 'inactive' | 'suspended' | 'archived';
export type Gender = 'male' | 'female' | 'other';
export type ContactKind = 'guardian' | 'emergency';
export type SessionStatus = 'scheduled' | 'completed' | 'cancelled';
export type AttendanceStatus = 'present' | 'absent' | 'excused';
export type InvoiceStatus = 'draft' | 'issued' | 'void';
export type ChargeType = 'membership' | 'registration' | 'tournament' | 'camp' | 'trip' | 'custom';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'card' | 'cheque' | 'mobile_money' | 'other';
/** Derived, never stored */
export type PaymentStatus = 'draft' | 'void' | 'unpaid' | 'partially_paid' | 'paid' | 'overdue';

export interface Academy {
  id: ID;
  name: string;
  defaultLocale: Locale;
  currency: string;
  timezone: string;
  country?: string;
}

export interface User {
  id: ID;
  fullName: string;
  email: string;
  role: Role;
  coachId?: ID; // set when the user is a coach
}

export interface Branch { id: ID; name: string; city?: string; address?: string }
export interface Location { id: ID; branchId: ID; name: string }

export interface Coach {
  id: ID;
  fullName: string;
  email?: string;
  phone?: string;
  branchId?: ID;
  active: boolean;
}

export interface Team {
  id: ID;
  name: string;
  sport: SportCode;
  ageGroup?: string;
  category?: string;
  season?: string;
  branchId?: ID;
  active: boolean;
}

export interface TeamCoach { teamId: ID; coachId: ID; isHead: boolean }

export interface Player {
  id: ID;
  code: string;               // PLR-00001 — unique per academy
  firstName: string;
  lastName: string;
  dateOfBirth?: ISODate;
  gender?: Gender;
  status: PlayerStatus;
  registrationDate: ISODate;
  branchId?: ID;
  notes?: string;
  archivedAt?: ISODateTime;
}

export interface TeamAssignment {
  id: ID;
  playerId: ID;
  teamId: ID;
  startDate: ISODate;
  endDate?: ISODate; // undefined = current
}

export interface PlayerContact {
  id: ID;
  playerId: ID;
  kind: ContactKind;
  fullName: string;
  relationship?: string;
  phone?: string;
  email?: string;
  isPrimary: boolean;
}

export interface TrainingSession {
  id: ID;
  teamId: ID;
  coachId?: ID;
  locationId?: ID;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  status: SessionStatus;
  cancelReason?: string;
  notes?: string;
}

export interface AttendanceRecord {
  id: ID;
  sessionId: ID;
  playerId: ID;
  status: AttendanceStatus;
  note?: string;
  recordedBy: ID;
  recordedAt: ISODateTime;
  updatedBy?: ID;
  updatedAt?: ISODateTime;
}

export interface InvoiceLine {
  id: ID;
  chargeType: ChargeType;
  description: string;
  quantity: number;
  unitAmount: number; // minor units
}

export interface Invoice {
  id: ID;
  number: string;
  playerId: ID;
  currency: string;
  issueDate: ISODate;
  dueDate: ISODate;
  status: InvoiceStatus;
  lines: InvoiceLine[];
  notes?: string;
  createdAt: ISODateTime;
}

export interface Payment {
  id: ID;
  receiptNumber: string;
  playerId: ID;
  amount: number; // minor units
  currency: string;
  paidOn: ISODate;
  method: PaymentMethod;
  reference?: string;
  receivedBy: ID;
  voidedAt?: ISODateTime;
  voidReason?: string;
  createdAt: ISODateTime;
}

export interface PaymentAllocation {
  id: ID;
  paymentId: ID;
  invoiceId: ID;
  amount: number; // minor units
}

export interface AuditEntry {
  id: ID;
  at: ISODateTime;
  actorId: ID;
  entity: 'player' | 'attendance' | 'invoice' | 'payment' | 'team' | 'session' | 'settings';
  entityId: ID;
  action: 'create' | 'update' | 'archive' | 'void' | 'correct' | 'import' | 'cancel';
  summary: string;
}

/** Everything one academy owns — the mock equivalent of one tenant's rows. */
export interface AcademyData {
  academy: Academy;
  users: User[];
  branches: Branch[];
  locations: Location[];
  coaches: Coach[];
  teams: Team[];
  teamCoaches: TeamCoach[];
  players: Player[];
  assignments: TeamAssignment[];
  contacts: PlayerContact[];
  sessions: TrainingSession[];
  attendance: AttendanceRecord[];
  invoices: Invoice[];
  payments: Payment[];
  allocations: PaymentAllocation[];
  audit: AuditEntry[];
  counters: Record<'player' | 'invoice' | 'receipt', number>;
}
