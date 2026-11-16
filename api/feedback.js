// Turns feedback sent from the app into a card in the Trello board's "Feedback inbox" list.
// Needs two environment variables in Vercel: TRELLO_KEY and TRELLO_TOKEN.
// Board: https://trello.com/b/gWeqCjf0/oh-hell-scorecard

const LIST_ID = process.env.TRELLO_LIST_ID || '6afb2e330208877e733b5ac5'; // Feedback inbox
const LABEL_FEEDBACK = '6afb2d42c23d8ff912c646d9'; // orange: Family feedback
const LABEL_BUG = '6afb2d43045388c9ac80b7d0'; // red: Bug

const RATINGS = { loved: 'Loved it', fine: 'It was fine', problem: 'Something went wrong' };
const ALLOWED_ORIGIN = /^(https:\/\/(www\.)?ohhellscore\.app|https:\/\/oh-hell-scorekeeper[a-z0-9-]*\.vercel\.app|http:\/\/localhost(:\d+)?)$/;

// Best-effort limit per server instance: 10 notes per 10 minutes from one address.
const WINDOW_MS = 10 * 60 * 1000, MAX_PER_WINDOW = 10;
const hits = new Map();

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
}

function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

function buildCard(b) {
  const rating = RATINGS[b.rating] ? b.rating : null;
  const message = clean(b.message, 2000);
  const from = clean(b.from, 40) || 'Anonymous';
  const ratingText = rating ? RATINGS[rating] : 'No rating';

  const firstLine = message.split('\n')[0];
  const gist = firstLine.length > 70 ? firstLine.slice(0, 69) + '…' : firstLine;
  const name = `${ratingText}${gist ? ': ' + gist : ''} (${from})`.slice(0, 500);

  const lines = [
    `**From:** ${from}`,
    `**Rating:** ${ratingText}`,
    '',
    message ? message.split('\n').map(l => '> ' + l).join('\n') : '_No note, just the rating._',
    '',
    '---',
  ];
  const g = b.game && typeof b.game === 'object' ? b.game : null;
  if (g && Array.isArray(g.standings)) {
    const standings = g.standings.slice(0, 7).map(s => `${clean(String(s.name || ''), 40)} ${Number(s.total) || 0}`).join(', ');
    lines.push(`**Game:** ${clean(String(g.date || ''), 40)} · ${Number(g.players) || g.standings.length} players · ${Number(g.hands) || 17} hands`);
    lines.push(`**Final scores:** ${standings}`);
  } else {
    lines.push('**Game:** sent from Settings, not tied to a game');
  }
  lines.push(`**Device:** ${clean(b.device, 80) || 'unknown'}`);
  lines.push(`**App version:** ${clean(b.version, 20) || 'unknown'}`);
  lines.push(`**Sent:** ${clean(b.sentAt, 40) || new Date().toISOString()}`);

  const labels = [LABEL_FEEDBACK];
  if (rating === 'problem') labels.push(LABEL_BUG);
  return { name, desc: lines.join('\n'), idLabels: labels, valid: Boolean(rating || message) };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Send feedback with POST.' });
  }
  const origin = req.headers.origin || '';
  if (origin && !ALLOWED_ORIGIN.test(origin)) return res.status(403).json({ error: 'Feedback only comes from the app.' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Too many notes at once. Try again in a few minutes.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ error: 'The note was empty or garbled.' });
  if (body.website) return res.status(200).json({ ok: true }); // honeypot field: bots fill it, people never see it

  const card = buildCard(body);
  if (!card.valid) return res.status(400).json({ error: 'Pick a rating or write a note.' });

  const key = process.env.TRELLO_KEY, token = process.env.TRELLO_TOKEN;
  if (!key || !token) return res.status(503).json({ error: 'Feedback isn’t connected to Trello yet.' });

  try {
    const url = `https://api.trello.com/1/cards?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ idList: LIST_ID, name: card.name, desc: card.desc, idLabels: card.idLabels, pos: 'top' }),
    });
    if (!r.ok) {
      console.error('Trello refused the card', r.status, (await r.text()).slice(0, 300));
      return res.status(502).json({ error: 'Trello didn’t accept the note.' });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('Could not reach Trello', e && e.message);
    return res.status(502).json({ error: 'Couldn’t reach Trello.' });
  }
};

module.exports.buildCard = buildCard;
