// Drive Smart - newsletter sign-up: adds the email to a Brevo list and sends a welcome email.
// Vercel > Settings > Environment Variables:
//   BREVO_API_KEY  = your Brevo API key
//   BREVO_LIST_ID  = the number of your Brevo list (e.g. 2)
//   UNSUB_SECRET   = any long random text (used to sign unsubscribe links)
//   SENDER_EMAIL   = optional, defaults to drivesmart-cs@outlook.com (must be a verified sender in Brevo)
import crypto from 'crypto';

const SENDER = process.env.SENDER_EMAIL || 'drivesmart-cs@outlook.com';
const okEmail = e => typeof e === 'string' && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
export const sign = e => crypto.createHmac('sha256', process.env.UNSUB_SECRET || 'change-me').update(e).digest('hex').slice(0, 32);

function welcomeHtml(site, unsub) {
  const navy = '#24375F', paper = '#F3EEE5', card = '#FBF9F5', ink = '#1D2536', mute = '#6D685F';
  return `<!doctype html><html><body style="margin:0;background:${paper};font-family:Arial,Helvetica,sans-serif;color:${ink}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${paper};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${card};border:1px solid #E1D9CA;border-radius:14px">
<tr><td style="padding:28px 28px 4px"><div style="font-size:26px;font-weight:800;color:${navy};letter-spacing:-0.5px">Drive Smart</div></td></tr>
<tr><td style="padding:16px 28px 0"><h1 style="font-size:22px;margin:0 0 12px;color:${ink}">Welcome to the Garage!</h1>
<p style="font-size:15px;line-height:1.6;margin:0 0 12px">Thanks for subscribing. You just got yourself a car-loving friend in your inbox.</p>
<p style="font-size:15px;line-height:1.6;margin:0 0 8px">Here is what you will get from us:</p>
<ul style="font-size:15px;line-height:1.7;margin:0 0 20px;padding-left:20px">
<li>New car buying guides</li>
<li>Simple fixes for common car problems</li>
<li>The best discussions from the community</li></ul>
<p style="margin:8px 0 26px"><a href="${site}" style="background:${navy};color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:bold;font-size:15px;display:inline-block">Go to the website</a></p>
<p style="font-size:15px;line-height:1.6;margin:0 0 24px">See you on the road,<br><b>Maruan and Cesar</b></p></td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #E1D9CA;font-size:12px;line-height:1.6;color:${mute}">
You are receiving this email because you subscribed on Drive Smart. Questions? Reply to this email or write to ${SENDER}.<br>
Don't want these emails anymore? <a href="${unsub}" style="color:${mute}">Unsubscribe in one click</a>.</td></tr>
</table></td></tr></table></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.BREVO_API_KEY;
  if (!key) return res.status(500).json({ error: 'Missing BREVO_API_KEY' });
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!okEmail(email)) return res.status(400).json({ error: 'Invalid email' });
  const listId = parseInt(process.env.BREVO_LIST_ID || '0', 10);
  const site = 'https://' + (req.headers['x-forwarded-host'] || req.headers.host) + '/';
  const unsub = site + 'api/unsubscribe?e=' + encodeURIComponent(email) + '&t=' + sign(email);
  const H = { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' };
  try {
    // 1) add (or re-add) the contact to the list
    const c = await fetch('https://api.brevo.com/v3/contacts', { method: 'POST', headers: H,
      body: JSON.stringify({ email, updateEnabled: true, emailBlacklisted: false, listIds: listId ? [listId] : undefined }) });
    if (!c.ok && c.status !== 204) { const d = await c.json().catch(() => ({})); return res.status(502).json({ error: d.message || 'Brevo contact error ' + c.status }); }
    // 2) send the welcome email
    const m = await fetch('https://api.brevo.com/v3/smtp/email', { method: 'POST', headers: H, body: JSON.stringify({
      sender: { name: 'Drive Smart', email: SENDER }, replyTo: { email: SENDER, name: 'Drive Smart' },
      to: [{ email }], subject: 'Welcome to the Garage 🚗', htmlContent: welcomeHtml(site, unsub),
      headers: { 'List-Unsubscribe': '<' + unsub + '>' } }) });
    if (!m.ok) { const d = await m.json().catch(() => ({})); return res.status(502).json({ error: d.message || 'Brevo email error ' + m.status }); }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ error: 'Email service unreachable' });
  }
}
