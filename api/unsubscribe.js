// Drive Smart - one-click unsubscribe (link at the bottom of every email).
import crypto from 'crypto';
const sign = e => crypto.createHmac('sha256', process.env.UNSUB_SECRET || 'change-me').update(e).digest('hex').slice(0, 32);

function page(title, text) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · Drive Smart</title></head>
<body style="margin:0;background:#F3EEE5;font-family:Arial,Helvetica,sans-serif;color:#1D2536;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:16px">
<div style="max-width:440px;background:#FBF9F5;border:1px solid #E1D9CA;border-radius:14px;padding:28px;text-align:center">
<div style="font-size:24px;font-weight:800;color:#24375F">Drive Smart</div><h1 style="font-size:20px;margin:18px 0 10px">${title}</h1>
<p style="line-height:1.6;color:#6D685F;margin:0 0 20px">${text}</p>
<a href="/" style="background:#24375F;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:bold;display:inline-block">Back to Drive Smart</a></div></body></html>`;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const email = String((req.query && req.query.e) || '').trim().toLowerCase();
  const t = String((req.query && req.query.t) || '');
  if (!email || t !== sign(email)) return res.status(400).send(page('Link not valid', 'This unsubscribe link is incomplete or expired. Write to drivesmart-cs@outlook.com and we will remove you by hand.'));
  const key = process.env.BREVO_API_KEY, listId = parseInt(process.env.BREVO_LIST_ID || '0', 10);
  const H = { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' };
  try {
    if (listId) await fetch('https://api.brevo.com/v3/contacts/lists/' + listId + '/contacts/remove', { method: 'POST', headers: H, body: JSON.stringify({ emails: [email] }) });
    await fetch('https://api.brevo.com/v3/contacts/' + encodeURIComponent(email), { method: 'PUT', headers: H, body: JSON.stringify({ emailBlacklisted: true }) });
    return res.status(200).send(page("You're unsubscribed", 'You will not receive Drive Smart emails anymore. Changed your mind? You can subscribe again any time on the website.'));
  } catch (e) {
    return res.status(502).send(page('Something went wrong', 'Please try again in a minute, or write to drivesmart-cs@outlook.com.'));
  }
}
