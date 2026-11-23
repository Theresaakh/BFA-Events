import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFound() {
  const t = useTranslations('common');
  return (
    <div className="grid min-h-[60vh] place-items-center p-8 text-center">
      <div>
        <p className="text-5xl font-semibold text-navy-900">404</p>
        <p className="mt-2 text-muted">{t('notFound')}</p>
        <Link href="/dashboard" className="mt-6 inline-block rounded-lg bg-navy-900 px-4 py-2 text-sm font-medium text-white">{t('backToDashboard')}</Link>
      </div>
    </div>
  );
}
