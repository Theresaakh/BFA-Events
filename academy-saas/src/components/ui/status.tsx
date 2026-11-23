'use client';
import { useTranslations } from 'next-intl';
import { Badge, type Tone } from './badge';
import type { AttendanceStatus, PaymentStatus, PlayerStatus, SessionStatus } from '@/lib/types';

const PAY: Record<PaymentStatus, Tone> = { paid: 'green', partially_paid: 'amber', unpaid: 'blue', overdue: 'red', draft: 'gray', void: 'gray' };
const PLAYER: Record<PlayerStatus, Tone> = { active: 'green', trial: 'blue', inactive: 'gray', suspended: 'amber', archived: 'gray' };
const SESSION: Record<SessionStatus, Tone> = { scheduled: 'blue', completed: 'green', cancelled: 'red' };
const ATT: Record<AttendanceStatus, Tone> = { present: 'green', absent: 'red', excused: 'amber' };

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const t = useTranslations('enums.paymentStatus');
  return <Badge tone={PAY[status]}>{t(status)}</Badge>;
}
export function PlayerStatusBadge({ status }: { status: PlayerStatus }) {
  const t = useTranslations('enums.playerStatus');
  return <Badge tone={PLAYER[status]}>{t(status)}</Badge>;
}
export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const t = useTranslations('enums.sessionStatus');
  return <Badge tone={SESSION[status]}>{t(status)}</Badge>;
}
export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const t = useTranslations('enums.attendance');
  return <Badge tone={ATT[status]}>{t(status)}</Badge>;
}
