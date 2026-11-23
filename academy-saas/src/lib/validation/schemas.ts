/**
 * Zod schemas shared by forms (Phase 1) and server actions (Phase 2).
 * Error messages are translation keys under "validation.*".
 */
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.date');
const optionalText = (max = 200) => z.string().trim().max(max, 'validation.tooLong').optional().or(z.literal('').transform(() => undefined));

export const playerSchema = z.object({
  firstName: z.string().trim().min(1, 'validation.required').max(60, 'validation.tooLong'),
  lastName: z.string().trim().min(1, 'validation.required').max(60, 'validation.tooLong'),
  dateOfBirth: isoDate.optional().or(z.literal('').transform(() => undefined)),
  gender: z.enum(['male', 'female', 'other']).optional().or(z.literal('').transform(() => undefined)),
  status: z.enum(['active', 'trial', 'inactive', 'suspended', 'archived']),
  registrationDate: isoDate,
  branchId: z.string().optional(),
  teamId: z.string().optional(),
  notes: optionalText(500),
  guardianName: optionalText(100),
  guardianRelationship: optionalText(40),
  guardianPhone: z.string().trim().regex(/^[+\d][\d\s()-]{5,20}$/, 'validation.phone').optional().or(z.literal('').transform(() => undefined)),
  guardianEmail: z.email('validation.email').optional().or(z.literal('').transform(() => undefined)),
  emergencyName: optionalText(100),
  emergencyRelationship: optionalText(40),
  emergencyPhone: z.string().trim().regex(/^[+\d][\d\s()-]{5,20}$/, 'validation.phone').optional().or(z.literal('').transform(() => undefined)),
});
export type PlayerInput = z.infer<typeof playerSchema>;

/** One row of a CSV import */
export const playerImportRowSchema = z.object({
  first_name: z.string().trim().min(1, 'validation.required'),
  last_name: z.string().trim().min(1, 'validation.required'),
  date_of_birth: isoDate.optional().or(z.literal('').transform(() => undefined)),
  gender: z.enum(['male', 'female', 'other']).optional().or(z.literal('').transform(() => undefined)),
  team: z.string().trim().optional(),
  guardian_name: z.string().trim().optional(),
  guardian_phone: z.string().trim().optional(),
  guardian_email: z.email('validation.email').optional().or(z.literal('').transform(() => undefined)),
});

export const teamSchema = z.object({
  name: z.string().trim().min(2, 'validation.required').max(60, 'validation.tooLong'),
  sport: z.enum(['football', 'basketball']),
  ageGroup: optionalText(20),
  category: optionalText(30),
  season: optionalText(20),
  branchId: z.string().optional(),
  coachIds: z.array(z.string()),
});
export type TeamInput = z.infer<typeof teamSchema>;

export const sessionSchema = z.object({
  teamId: z.string().min(1, 'validation.required'),
  coachId: z.string().optional(),
  locationId: z.string().optional(),
  date: isoDate,
  start: z.string().regex(/^\d{2}:\d{2}$/, 'validation.time'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'validation.time'),
  notes: optionalText(300),
}).refine((s) => s.end > s.start, { path: ['end'], message: 'validation.endAfterStart' });
export type SessionInput = z.infer<typeof sessionSchema>;

export const invoiceLineSchema = z.object({
  chargeType: z.enum(['membership', 'registration', 'tournament', 'camp', 'trip', 'custom']),
  description: z.string().trim().min(1, 'validation.required').max(120, 'validation.tooLong'),
  quantity: z.number().positive('validation.positive').max(1000),
  unitAmount: z.number().int().min(0, 'validation.positive'),
});

export const invoiceSchema = z.object({
  playerId: z.string().min(1, 'validation.required'),
  issueDate: isoDate,
  dueDate: isoDate,
  notes: optionalText(500),
  lines: z.array(invoiceLineSchema).min(1, 'validation.atLeastOneLine'),
}).refine((i) => i.dueDate >= i.issueDate, { path: ['dueDate'], message: 'validation.dueAfterIssue' });
export type InvoiceInput = z.infer<typeof invoiceSchema>;

export const paymentSchema = z.object({
  playerId: z.string().min(1, 'validation.required'),
  amount: z.number().int().positive('validation.positive'),
  paidOn: isoDate,
  method: z.enum(['cash', 'bank_transfer', 'card', 'cheque', 'mobile_money', 'other']),
  reference: optionalText(60),
  allocations: z.array(z.object({ invoiceId: z.string(), amount: z.number().int().positive() })),
});
export type PaymentInput = z.infer<typeof paymentSchema>;

export const academySettingsSchema = z.object({
  name: z.string().trim().min(2, 'validation.required').max(120, 'validation.tooLong'),
  defaultLocale: z.enum(['en', 'ar', 'fr']),
  currency: z.string().regex(/^[A-Z]{3}$/, 'validation.currency'),
  timezone: z.string().min(1, 'validation.required'),
});

/** Turn a Zod error into { field: translationKey } */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_form';
    if (!out[key]) out[key] = issue.message.startsWith('validation.') ? issue.message : 'validation.invalid';
  }
  return out;
}
