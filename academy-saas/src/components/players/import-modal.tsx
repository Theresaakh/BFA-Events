'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, FileUp } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { useStore } from '@/lib/store/academy-store';
import { downloadCSV, parseCSV } from '@/components/shared/csv';
import { useToast } from '@/components/ui/toast';

const COLUMNS = ['first_name', 'last_name', 'date_of_birth', 'gender', 'team', 'guardian_name', 'guardian_phone', 'guardian_email'];

export function ImportPlayersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('players.import');
  const tAll = useTranslations();
  const tc = useTranslations('common');
  const { data, actions } = useStore();
  const toast = useToast();
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [errors, setErrors] = useState<{ row: number; field: string; error: string }[]>([]);
  const [fileName, setFileName] = useState('');

  const reset = () => { setRows(null); setErrors([]); setFileName(''); };
  const close = () => { reset(); onClose(); };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    if (!/\.(csv|txt)$/i.test(f.name)) { setRows([]); setErrors([{ row: 0, field: 'file', error: 'validation.csvOnly' }]); return; }
    const parsed = parseCSV(await f.text());
    setRows(parsed);
    setErrors([]);
  };

  const runImport = () => {
    if (!rows) return;
    const res = actions.importPlayers(rows, data);
    if (!res.ok) { toast(tAll(res.error as never), 'error'); return; }
    if (res.value.errors.length) { setErrors(res.value.errors); return; }
    toast(t('done', { n: res.value.imported }));
    close();
  };

  const template = () => downloadCSV('players-import-template.csv', [COLUMNS, ['Alex', 'Example', '2015-04-12', 'male', data.teams[0]?.name ?? '', 'Jordan Example', '+1 555 0199', 'family@example.test']]);

  return (
    <Modal open={open} onClose={close} size="lg" title={t('title')} description={t('description')}
      footer={<><Button onClick={close}>{tc('cancel')}</Button><Button variant="primary" disabled={!rows?.length || errors.some((e) => e.row === 0)} onClick={runImport}>{t('importN', { n: rows?.length ?? 0 })}</Button></>}>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-line bg-surface/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <p className="font-medium">{t('step1')}</p>
            <p className="mt-0.5 text-xs text-muted">{t('columns')}: <code className="text-[11px]" dir="ltr">{COLUMNS.join(', ')}</code></p>
          </div>
          <Button size="sm" onClick={template}><Download className="size-4" />{t('template')}</Button>
        </div>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-line px-6 py-8 text-center transition hover:border-brand-500 hover:bg-brand-50/40">
          <FileUp className="size-7 text-brand-500" />
          <span className="text-sm font-medium">{fileName || t('choose')}</span>
          <span className="text-xs text-muted">{t('excelHint')}</span>
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {errors.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">{t('fixErrors')}</p>
            <ul className="mt-2 max-h-40 list-inside list-disc space-y-0.5 overflow-y-auto text-xs">
              {errors.slice(0, 50).map((e, i) => <li key={i}>{e.row ? t('rowError', { row: e.row, field: e.field }) : ''} {tAll(e.error as never)}</li>)}
            </ul>
          </div>
        )}
        {rows && rows.length > 0 && (
          <div className="rounded-xl border border-line">
            <p className="border-b border-line px-4 py-2 text-xs font-medium text-muted">{t('preview', { n: rows.length })}</p>
            <Table className="max-h-64">
              <thead><tr>{COLUMNS.slice(0, 5).map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
              <tbody>{rows.slice(0, 8).map((r, i) => <Tr key={i}>{COLUMNS.slice(0, 5).map((c) => <Td key={c}>{r[c]}</Td>)}</Tr>)}</tbody>
            </Table>
          </div>
        )}
      </div>
    </Modal>
  );
}
