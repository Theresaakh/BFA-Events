import 'server-only';

/**
 * Transactional email. Until an email provider is connected (Resend, Phase 3), links are
 * written to the server log so you can still confirm accounts while developing.
 * Never log links in production: set RESEND_API_KEY there.
 */
export async function sendEmail({ to, kind, url }: { to: string; kind: 'verify' | 'reset'; url: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'production' && process.env.EMAIL_DEV_LOG !== 'true') throw new Error('Email provider not configured (RESEND_API_KEY).');
    console.info(`[email:${kind}] to=${to} link=${url}`);
    return;
  }
  const subject = kind === 'verify' ? 'Confirm your AcademyOS account' : 'Reset your AcademyOS password';
  const text = kind === 'verify'
    ? `Welcome to AcademyOS. Confirm your email address:\n\n${url}\n\nIf you didn't create an account, ignore this email.`
    : `Someone asked to reset your AcademyOS password. Choose a new one here (valid for 1 hour):\n\n${url}\n\nIf this wasn't you, ignore this email.`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? 'AcademyOS <no-reply@example.com>', to, subject, text }),
  });
  if (!res.ok) throw new Error(`Email provider error ${res.status}`);
}
