'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useStore } from '@/lib/store/academy-store';
import { useResultToast } from '@/components/shared/result-toast';
import { currentTeamIds } from '@/components/shared/lookups';
import type { Player, PlayerStatus } from '@/lib/types';

const STATUSES: PlayerStatus[] = ['active', 'trial', 'inactive', 'suspended', 'archived'];

export function PlayerFormModal({ open, onClose, player, onSaved }: { open: boolean; onClose: () => void; player?: Player; onSaved?: (id: string) => void }) {
  if (!open) return null;
  return <PlayerFormInner onClose={onClose} player={player} onSaved={onSaved} />;
}

function PlayerFormInner({ onClose, player, onSaved }: { onClose: () => void; player?: Player; onSaved?: (id: string) => void }) {
  const t = useTranslations('players');
  const tc = useTranslations('common');
  const ts = useTranslations('enums.playerStatus');
  const tg = useTranslations('enums.gender');
  const { data, today, actions } = useStore();
  const show = useResultToast();
  const guardian = player && data.contacts.find((c) => c.playerId === player.id && c.kind === 'guardian' && c.isPrimary);
  const emergency = player && data.contacts.find((c) => c.playerId === player.id && c.kind === 'emergency');
  const [v, setV] = useState<Record<string, string>>({
    firstName: player?.firstName ?? '', lastName: player?.lastName ?? '', dateOfBirth: player?.dateOfBirth ?? '',
    gender: player?.gender ?? '', status: player?.status ?? 'active', registrationDate: player?.registrationDate ?? today,
    branchId: player?.branchId ?? data.branches[0]?.id ?? '', teamId: player ? currentTeamIds(data, player.id)[0] ?? '' : '',
    notes: player?.notes ?? '',
    guardianName: guardian?.fullName ?? '', guardianRelationship: guardian?.relationship ?? '', guardianPhone: guardian?.phone ?? '', guardianEmail: guardian?.email ?? '',
    emergencyName: emergency?.fullName ?? '', emergencyRelationship: emergency?.relationship ?? '', emergencyPhone: emergency?.phone ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = () => {
    const res = actions.savePlayer(v, data, player?.id);
    if (!res.ok) { setErrors(res.fields ?? {}); show(res); return; }
    show(res, player ? 'players.updated' : 'players.created');
    onSaved?.(res.value);
    onClose();
  };

  const section = (title: string) => <h3 className="col-span-full mt-2 border-b border-line pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted first:mt-0">{title}</h3>;

  return (
    <Modal open onClose={onClose} size="lg" title={player ? t('editPlayer') : t('addPlayer')} description={player ? `${player.code}` : t('addPlayerHint')}
      footer={<><Button onClick={onClose}>{tc('cancel')}</Button><Button variant="primary" onClick={submit}>{tc('save')}</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {section(t('identity'))}
        <Field label={t('firstName')} error={errors.firstName} required><Input value={v.firstName} onChange={set('firstName')} invalid={!!errors.firstName} autoComplete="off" /></Field>
        <Field label={t('lastName')} error={errors.lastName} required><Input value={v.lastName} onChange={set('lastName')} invalid={!!errors.lastName} autoComplete="off" /></Field>
        <Field label={t('dateOfBirth')} error={errors.dateOfBirth}><Input type="date" value={v.dateOfBirth} onChange={set('dateOfBirth')} max={today} /></Field>
        <Field label={t('gender')}>
          <Select value={v.gender} onChange={set('gender')}><option value="">—</option>{(['male', 'female', 'other'] as const).map((g) => <option key={g} value={g}>{tg(g)}</option>)}</Select>
        </Field>
        {section(t('membership'))}
        <Field label={t('status')}><Select value={v.status} onChange={set('status')}>{STATUSES.map((s) => <option key={s} value={s}>{ts(s)}</option>)}</Select></Field>
        <Field label={t('registrationDate')} error={errors.registrationDate} required><Input type="date" value={v.registrationDate} onChange={set('registrationDate')} /></Field>
        <Field label={t('branch')}><Select value={v.branchId} onChange={set('branchId')}><option value="">—</option>{data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
        <Field label={t('team')} hint={player ? t('teamChangeHint') : undefined}>
          <Select value={v.teamId} onChange={set('teamId')}><option value="">{t('noTeam')}</option>{data.teams.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
        </Field>
        {section(t('guardian'))}
        <Field label={t('contactName')} error={errors.guardianName}><Input value={v.guardianName} onChange={set('guardianName')} /></Field>
        <Field label={t('relationship')}><Input value={v.guardianRelationship} onChange={set('guardianRelationship')} placeholder={t('relationshipPlaceholder')} /></Field>
        <Field label={t('phone')} error={errors.guardianPhone}><Input type="tel" dir="ltr" value={v.guardianPhone} onChange={set('guardianPhone')} invalid={!!errors.guardianPhone} /></Field>
        <Field label={t('email')} error={errors.guardianEmail}><Input type="email" dir="ltr" value={v.guardianEmail} onChange={set('guardianEmail')} invalid={!!errors.guardianEmail} /></Field>
        {section(t('emergency'))}
        <Field label={t('contactName')}><Input value={v.emergencyName} onChange={set('emergencyName')} /></Field>
        <Field label={t('relationship')}><Input value={v.emergencyRelationship} onChange={set('emergencyRelationship')} /></Field>
        <Field label={t('phone')} error={errors.emergencyPhone}><Input type="tel" dir="ltr" value={v.emergencyPhone} onChange={set('emergencyPhone')} invalid={!!errors.emergencyPhone} /></Field>
        {section(t('notes'))}
        <Field label={t('notes')} hint={t('notesHint')} className="sm:col-span-2"><Textarea value={v.notes} onChange={set('notes')} /></Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
