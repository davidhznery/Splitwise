const CURRENCIES = new Set(['USD', 'EUR', 'GBP']);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const from = String(req.query.from || '').toUpperCase();
  const to = String(req.query.to || '').toUpperCase();
  if (!CURRENCIES.has(from) || !CURRENCIES.has(to)) {
    return res.status(400).json({ error: 'Choose EUR, USD, or GBP.' });
  }
  if (from === to) {
    return res.status(200).json({ from, to, rate: 1, date: new Date().toISOString().slice(0, 10) });
  }

  try {
    const response = await fetch(`https://api.frankfurter.dev/v2/rate/${from.toLowerCase()}/${to.toLowerCase()}`);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !Number.isFinite(Number(result.rate)) || Number(result.rate) <= 0) {
      return res.status(502).json({ error: 'The latest exchange rate is unavailable. Try again shortly.' });
    }
    return res.status(200).json({ from, to, rate: Number(result.rate), date: result.date });
  } catch (_) {
    return res.status(502).json({ error: 'The latest exchange rate is unavailable. Try again shortly.' });
  }
};
