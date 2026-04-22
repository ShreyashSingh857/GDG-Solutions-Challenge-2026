let resendClient = null;

async function getResendClient() {
  if (resendClient) return resendClient;
  if (!process.env.RESEND_API_KEY) return null;

  try {
    const { Resend } = await import('resend');
    resendClient = new Resend(process.env.RESEND_API_KEY);
    return resendClient;
  } catch {
    return null;
  }
}

export async function sendDailyDigest({ orgId, recipientEmail, disruptions, resolutions }) {
  const resend = await getResendClient();
  if (!resend || !recipientEmail) return;

  const critical = disruptions.filter((d) => Number(d.severity || 0) >= 8).length;
  const executed = resolutions.filter((r) => r.status === 'resolved').length;

  await resend.emails.send({
    from: process.env.DIGEST_FROM_EMAIL || 'Supply Chain Intelligence <alerts@yourapp.com>',
    to: recipientEmail,
    subject: `Daily Digest (${orgId || 'default'}) - ${critical} critical events, ${executed} executed`,
    html: `
      <div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:640px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:24px;border-radius:12px;">
        <h2 style="margin:0 0 12px;color:#38bdf8;">Supply Chain Daily Digest</h2>
        <p style="margin:0 0 16px;color:#94a3b8;">Last 24 hours summary</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#94a3b8;">Total disruptions</td><td style="color:#fff;">${disruptions.length}</td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8;">Critical (>=8)</td><td style="color:#ef4444;">${critical}</td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8;">Resolutions executed</td><td style="color:#22c55e;">${executed}</td></tr>
        </table>
        ${disruptions.slice(0, 5).map((d) => `
          <div style="margin-top:12px;padding:12px;background:#1e293b;border-radius:8px;border-left:3px solid ${Number(d.severity || 0) >= 8 ? '#ef4444' : '#f59e0b'};">
            <strong>${d.type || 'OTHER'}</strong> - ${d.location || 'Unknown'}<br />
            <small style="color:#94a3b8;">Severity ${Number(d.severity || 0)}/10</small>
          </div>
        `).join('')}
        <p style="margin-top:20px;"><a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}" style="color:#38bdf8;">Open dashboard</a></p>
      </div>
    `,
  });
}
