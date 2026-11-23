'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Minus, Plus, RotateCcw, ShieldCheck } from 'lucide-react';
import { useFmt, useStore } from '@/lib/store/academy-store';
import { can, ROLES, type Capability } from '@/lib/domain/permissions';
import { academySettingsSchema, fieldErrors } from '@/lib/validation/schemas';
import { SUPPORTED_CURRENCIES, SUPPORTED_TIMEZONES } from '@/config/app';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { RequireCapability, useCan } from '@/components/shared/guard';
import { useLookups } from '@/components/shared/lookups';
import { useResultToast } from '@/components/shared/result-toast';

type Tab = 'academy' | 'branches' | 'users' | 'data';

export function SettingsView() {
  return <RequireCapability cap="settings.view"><Inner /></RequireCapability>;
}

function Inner() {
  const t = useTranslations('settings');
  const [tab, setTab] = useState<Tab>('academy');
  return (
    <div>
      <PageHeader title={t('title')} description={t('subtitle')} />
      <div className="mb-4"><Segmented value={tab} onChange={setTab} options={(['academy', 'branches', 'users', 'data'] as Tab[]).map((x) => ({ value: x, label: t(`tabs.${x}`) }))} /></div>
      {tab === 'academy' && <AcademySettings />}
      {tab === 'branches' && <Branches />}
      {tab === 'users' && <Users />}
      {tab === 'data' && <DataPrivacy />}
    </div>
  );
}

function AcademySettings() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const { data, actions } = useStore();
  const can = useCan();
  const show = useResultToast();
  const fmt = useFmt();
  const [v, setV] = useState({ name: data.academy.name, defaultLocale: data.academy.defaultLocale, currency: data.academy.currency, timezone: data.academy.timezone });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const disabled = !can('settings.edit');
  const save = () => {
    const parsed = academySettingsSchema.safeParse(v);
    if (!parsed.success) { setErrors(fieldErrors(parsed.error)); return; }
    setErrors({});
    show(actions.updateAcademy(parsed.data), 'settings.saved');
  };
  return (
    <Card className="max-w-3xl">
      <CardHeader title={t('academyProfile')} subtitle={t('academyHint')} />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label={t('academyName')} error={errors.name} required className="sm:col-span-2"><Input value={v.name} disabled={disabled} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
        <Field label={t('language')} hint={t('languageHint')}>
          <Select value={v.defaultLocale} disabled={disabled} onChange={(e) => setV({ ...v, defaultLocale: e.target.value as typeof v.defaultLocale })}><option value="en">English</option><option value="ar">العربية</option><option value="fr">Français</option></Select>
        </Field>
        <Field label={t('currency')} hint={t('currencyHint')}>
          <Select value={v.currency} disabled={disabled} onChange={(e) => setV({ ...v, currency: e.target.value })}>{SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
        </Field>
        <Field label={t('timezone')} hint={t('timezoneHint')} className="sm:col-span-2">
          <Select value={v.timezone} disabled={disabled} onChange={(e) => setV({ ...v, timezone: e.target.value })}>{SUPPORTED_TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}</Select>
        </Field>
        <div className="rounded-xl bg-surface px-4 py-3 text-sm text-muted sm:col-span-2">{t('preview')}: <span className="tabular font-medium text-ink">{fmt.money(123456, v.currency)}</span> · {fmt.dateTime(new Date().toISOString())}</div>
      </div>
      {!disabled && <div className="flex justify-end border-t border-line px-5 py-3"><Button variant="primary" onClick={save}>{tc('save')}</Button></div>}
    </Card>
  );
}

function Branches() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const { data, actions } = useStore();
  const can = useCan();
  const show = useResultToast();
  const lk = useLookups();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [loc, setLoc] = useState<Record<string, string>>({});
  return (
    <div className="space-y-4">
      {can('settings.edit') && <Button variant="primary" onClick={() => setAdding(true)}><Plus className="size-4" />{t('addBranch')}</Button>}
      <div className="grid gap-4 lg:grid-cols-2">
        {data.branches.map((b) => (
          <Card key={b.id}>
            <CardHeader title={b.name} subtitle={[b.address, b.city].filter(Boolean).join(', ')} action={<Badge tone="navy" dot={false}>{t('teamsN', { n: data.teams.filter((x) => x.branchId === b.id).length })}</Badge>} />
            <ul className="divide-y divide-line">
              {data.locations.filter((l) => l.branchId === b.id).map((l) => <li key={l.id} className="px-5 py-2.5 text-sm">{l.name}</li>)}
            </ul>
            {can('settings.edit') && (
              <form className="flex gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); if (show(actions.addLocation(b.id, loc[b.id] ?? ''), 'settings.saved')) setLoc({ ...loc, [b.id]: '' }); }}>
                <Input value={loc[b.id] ?? ''} onChange={(e) => setLoc({ ...loc, [b.id]: e.target.value })} placeholder={t('newLocation')} className="h-9" />
                <Button type="submit" size="sm"><Plus className="size-4" /></Button>
              </form>
            )}
            <p className="border-t border-line px-5 py-2 text-xs text-muted">{t('coachesHere')}: {data.coaches.filter((c) => c.branchId === b.id).map((c) => lk.coaches.get(c.id)?.fullName).join(', ') || '—'}</p>
          </Card>
        ))}
      </div>
      <Modal open={adding} onClose={() => setAdding(false)} size="sm" title={t('addBranch')} footer={<><Button onClick={() => setAdding(false)}>{tc('cancel')}</Button><Button variant="primary" onClick={() => { if (show(actions.saveBranch(name, city), 'settings.saved')) { setAdding(false); setName(''); setCity(''); } }}>{tc('save')}</Button></>}>
        <div className="space-y-4">
          <Field label={t('branchName')} required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label={t('city')}><Input value={city} onChange={(e) => setCity(e.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}

const MATRIX_ROWS: Capability[] = ['players.viewAll', 'players.edit', 'contacts.view', 'teams.edit', 'schedule.edit', 'attendance.record', 'attendance.correct', 'finance.view', 'finance.edit', 'reports.finance', 'settings.edit', 'users.manage', 'audit.view'];

function Users() {
  const t = useTranslations('settings');
  const tr = useTranslations('enums.role');
  const { data } = useStore();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title={t('users')} subtitle={t('usersHint')} />
        <Table>
          <thead><tr><Th>{t('name')}</Th><Th className="hidden sm:table-cell">{t('email')}</Th><Th>{t('role')}</Th></tr></thead>
          <tbody>{data.users.map((u) => (
            <Tr key={u.id}><Td className="font-medium">{u.fullName}</Td><Td className="hidden text-muted sm:table-cell" dir="ltr">{u.email}</Td><Td><Badge tone={u.role === 'owner' ? 'navy' : u.role === 'finance' ? 'amber' : u.role === 'coach' ? 'green' : 'blue'}>{tr(u.role)}</Badge></Td></Tr>
          ))}</tbody>
        </Table>
      </Card>
      <Card>
        <CardHeader title={t('permissions')} subtitle={t('permissionsHint')} />
        <Table>
          <thead><tr><Th>{t('capability')}</Th>{ROLES.map((r) => <Th key={r} className="text-center">{tr(r)}</Th>)}</tr></thead>
          <tbody>{MATRIX_ROWS.map((c) => (
            <Tr key={c}><Td>{t(`caps.${c.replace('.', '_')}`)}</Td>{ROLES.map((r) => (
              <Td key={r} className="text-center">{can(r, c) ? <Check className="mx-auto size-4 text-brand-500" /> : (c === 'players.viewAll' || c === 'contacts.view' || c === 'attendance.record') && r === 'coach' ? <span className="text-xs text-muted">{t('ownTeams')}</span> : <Minus className="mx-auto size-4 text-slate-300" />}</Td>
            ))}</Tr>
          ))}</tbody>
        </Table>
      </Card>
    </div>
  );
}

function DataPrivacy() {
  const t = useTranslations('settings');
  const { data, actions } = useStore();
  const fmt = useFmt();
  const lk = useLookups();
  const can = useCan();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-500" /><div className="space-y-2 text-sm"><p className="font-semibold">{t('privacyTitle')}</p><p className="text-muted">{t('privacy1')}</p><p className="text-muted">{t('privacy2')}</p><p className="text-muted">{t('privacy3')}</p></div></div>
        </Card>
        <Card className="p-5">
          <p className="text-sm font-semibold">{t('demoData')}</p>
          <p className="mt-1 text-sm text-muted">{t('demoDataHint')}</p>
          <Button className="mt-4" variant="danger" onClick={() => setConfirm(true)}><RotateCcw className="size-4" />{t('resetDemo')}</Button>
        </Card>
      </div>
      <Card>
        <CardHeader title={t('auditLog')} subtitle={t('auditHint')} />
        {can('audit.view') ? (
          <ul className="max-h-[520px] divide-y divide-line overflow-y-auto">
            {data.audit.slice(0, 100).map((e) => (
              <li key={e.id} className="px-5 py-3 text-sm"><p>{e.summary}</p><p className="mt-0.5 text-xs text-muted">{fmt.dateTime(e.at)} · {lk.users.get(e.actorId)?.fullName ?? '—'} · <span className="uppercase">{e.action}</span></p></li>
            ))}
          </ul>
        ) : <p className="p-5 text-sm text-muted">{t('auditRestricted')}</p>}
      </Card>
      <Modal open={confirm} onClose={() => setConfirm(false)} size="sm" title={t('resetDemo')} footer={<><Button onClick={() => setConfirm(false)}>{t('keep')}</Button><Button variant="danger" onClick={() => { actions.resetDemo(); setConfirm(false); }}>{t('resetConfirm')}</Button></>}>
        <p className="text-sm text-muted">{t('resetWarning')}</p>
      </Modal>
    </div>
  );
}
