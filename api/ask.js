// Drive Smart - Garage Assistant (Vercel serverless function)
// Uses Groq's free API (no credit card). The key stays secret on the server:
// set GROQ_API_KEY in Vercel > Settings > Environment Variables.

const SYSTEM = `You are the Garage Assistant on Drive Smart, a community car blog for students and first-time car owners in Kingston, Ontario, Canada.
Talk like a friendly friend who knows cars: warm, plain words, no jargon (explain any technical word in a few words). Keep answers under 120 words.
Focus on cars common in Canada, especially Japanese brands (Toyota, Honda, Mazda, Subaru, Nissan).
When it is about a problem: give the most likely cause, say clearly how urgent it is (fine to drive / book a mechanic soon / stop driving), and give a rough fair price range in Canadian dollars.
For anything about brakes failing, steering, smoke, overheating or a fuel smell, tell them to stop driving and get help.
If the question is not about cars, driving or car costs, say kindly that you only help with cars.
End with one short line inviting them to post in Ask the Garage so a real person can confirm. Plain text only, no markdown.`;

// Groq changes its model list over time, so we ask Groq which models exist and pick a good chat model.
// To force one, add a GROQ_MODEL variable in Vercel.
const PREFERRED = ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
let cachedModel = null;

async function pickModel(key, avoid) {
  if (process.env.GROQ_MODEL) return process.env.GROQ_MODEL;
  if (cachedModel && cachedModel !== avoid) return cachedModel;
  try {
    const r = await fetch('https://api.groq.com/openai/v1/models', { headers: { 'Authorization': 'Bearer ' + key } });
    const d = await r.json();
    const ids = (d.data || []).filter(m => m.active !== false).map(m => m.id)
      .filter(id => id !== avoid && !/whisper|tts|orpheus|guard|allam|prompt|compound|playai/i.test(id));
    cachedModel = PREFERRED.find(p => ids.includes(p))
      || ids.find(id => /gpt-oss|llama|qwen|kimi|gemma|mistral/i.test(id))
      || ids[0] || PREFERRED[0];
  } catch (e) { cachedModel = PREFERRED[0]; }
  return cachedModel;
}

async function chat(key, model, messages) {
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 500, temperature: 0.5,
      messages: [{ role: 'system', content: SYSTEM }, ...messages] })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = (data && data.error && data.error.message) || ('AI error ' + r.status);
    return { error: msg, modelError: /model/i.test(msg) && (r.status === 404 || r.status === 400) };
  }
  const text = ((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim();
  return text ? { text } : { error: 'Empty answer' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const key = process.env.GROQ_API_KEY;
  if (!key) return res.status(500).json({ error: 'Missing GROQ_API_KEY' });

  let messages = (req.body && req.body.messages) || [];
  if (!Array.isArray(messages)) return res.status(400).json({ error: 'Bad request' });
  // keep it small and safe: last 10 turns, 1,000 characters each, must start with the user
  messages = messages.slice(-10)
    .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map(m => ({ role: m.role, content: m.content.slice(0, 1000) }));
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== 'user') return res.status(400).json({ error: 'Bad request' });

  try {
    let model = await pickModel(key);
    let out = await chat(key, model, messages);
    if (out.modelError) { cachedModel = null; model = await pickModel(key, model); out = await chat(key, model, messages); }
    if (out.error) return res.status(502).json({ error: out.error });
    return res.status(200).json({ text: out.text });
  } catch (e) {
    return res.status(502).json({ error: 'AI unreachable' });
  }
}
