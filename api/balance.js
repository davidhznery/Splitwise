const TABLE = 'shared_balances';
const ROW_ID = 'main';
const CURRENCIES = new Set(['USD', 'EUR', 'GBP']);

function configured() {
  return process.env.SUPABASE_URL && (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) && process.env.OWNER_PASSWORD;
}

function headers() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

function endpoint(query = '') {
  return `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${TABLE}${query}`;
}

async function readCurrentState() {
  const response = await fetch(endpoint(`?id=eq.${ROW_ID}&select=state,archives`), { headers: headers() });
  if (!response.ok) throw new Error('No se pudo consultar el balance actual.');
  const rows = await response.json();
  return rows[0] || { state: null, archives: [] };
}

function amountInCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) return null;
  const cents = Math.round(amount * 100);
  return cents > 0 ? cents : null;
}

async function getExchangeRate(from, to) {
  if (from === to) return { rate: 1, date: new Date().toISOString().slice(0, 10) };
  const response = await fetch(`https://api.frankfurter.dev/v2/rate/${from.toLowerCase()}/${to.toLowerCase()}`);
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !Number.isFinite(Number(result.rate)) || Number(result.rate) <= 0) {
    throw new Error('The latest exchange rate is unavailable. Try again shortly.');
  }
  return { rate: Number(result.rate), date: result.date };
}

function cleanGuestEntry(state, type, entry, fx = null) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  if (typeof entry.id !== 'string' || entry.id.length < 1 || entry.id.length > 120) return null;
  if (!Array.isArray(state.people) || state.people.length > 200) return null;
  const people = new Set(state.people.filter(person => typeof person === 'string'));
  const amount = amountInCents(entry.amount);
  if (amount === null) return null;

  const description = typeof entry.description === 'string' ? entry.description.trim().slice(0, 300) : '';
  if (type === 'expense') {
    const baseCurrency = CURRENCIES.has(state.currency) ? state.currency : 'USD';
    const expenseCurrency = CURRENCIES.has(entry.currency) ? entry.currency : '';
    if (!expenseCurrency || !fx || !Number.isFinite(fx.rate) || fx.rate <= 0) return null;
    if (!people.has(entry.payer) || !Array.isArray(entry.participants) || !entry.participants.length) return null;
    if (entry.participants.length > people.size || new Set(entry.participants).size !== entry.participants.length) return null;
    if (entry.participants.some(person => !people.has(person))) return null;
    if (!entry.splitAmounts || typeof entry.splitAmounts !== 'object' || Array.isArray(entry.splitAmounts)) return null;
    const splitAmounts = {};
    let splitTotal = 0;
    for (const person of entry.participants) {
      const share = Number(entry.splitAmounts[person]);
      if (!Number.isFinite(share) || share < 0 || share > 10000000) return null;
      const cents = Math.round(share * 100);
      splitAmounts[person] = cents / 100;
      splitTotal += cents;
    }
    if (Object.keys(entry.splitAmounts).some(person => !entry.participants.includes(person)) || splitTotal !== amount) return null;
    const settlementAmountCents = Math.round(amount * fx.rate);
    const settlementSplitAmounts = {};
    let sourceCumulativeCents = 0;
    let settlementCumulativeCents = 0;
    entry.participants.forEach((person, index) => {
      sourceCumulativeCents += Math.round(splitAmounts[person] * 100);
      const nextSettlementCents = index === entry.participants.length - 1
        ? settlementAmountCents
        : Math.round(sourceCumulativeCents * fx.rate);
      settlementSplitAmounts[person] = (nextSettlementCents - settlementCumulativeCents) / 100;
      settlementCumulativeCents = nextSettlementCents;
    });
    return {
      id: entry.id,
      amount: amount / 100,
      currency: expenseCurrency,
      exchangeRate: fx.rate,
      exchangeRateDate: fx.date,
      settlementAmount: settlementAmountCents / 100,
      settlementSplitAmounts,
      payer: entry.payer,
      splitAmounts,
      participants: [...entry.participants],
      description,
    };
  }

  if (type === 'payment') {
    if (!people.has(entry.payer) || !people.has(entry.receiver) || entry.payer === entry.receiver) return null;
    return {
      id: entry.id,
      amount: amount / 100,
      payer: entry.payer,
      receiver: entry.receiver,
      description,
    };
  }

  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!configured()) return res.status(503).json({ error: 'La base de datos no está configurada.' });

  try {
    if (req.method === 'GET') return res.status(200).json(await readCurrentState());

    if (req.method === 'POST') {
      const body = req.body || {};
      if (body.action !== 'add-entry') return res.status(400).json({ error: 'Invalid action.' });
      const current = await readCurrentState();
      if (!current.state) return res.status(409).json({ error: 'El propietario debe publicar primero el balance compartido.' });
      const collection = body.type === 'expense' ? 'expenses' : body.type === 'payment' ? 'payments' : '';
      const baseCurrency = CURRENCIES.has(current.state.currency) ? current.state.currency : 'USD';
      const sourceCurrency = body.entry && body.entry.currency;
      let fx = { rate: 1, date: new Date().toISOString().slice(0, 10) };
      if (body.type === 'expense' && CURRENCIES.has(sourceCurrency) && CURRENCIES.has(baseCurrency)) {
        try {
          fx = await getExchangeRate(sourceCurrency, baseCurrency);
        } catch (error) {
          return res.status(502).json({ error: error.message });
        }
      }
      const entry = cleanGuestEntry(current.state, body.type, body.entry, fx);
      if (!collection || !entry) return res.status(400).json({ error: 'The expense or payment is invalid.' });

      const response = await fetch(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/append_shared_entry`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ p_collection: collection, p_entry: entry }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 404) {
          return res.status(503).json({ error: 'Run the updated supabase-schema.sql file before adding shared expenses.' });
        }
        throw new Error('No se pudo guardar el movimiento compartido.');
      }
      if (!result || !Array.isArray(result.expenses) || !Array.isArray(result.payments)) {
        throw new Error('Supabase returned an invalid shared balance.');
      }
      return res.status(200).json({ state: result });
    }

    if (req.method !== 'PUT') {
      res.setHeader('Allow', 'GET, POST, PUT');
      return res.status(405).json({ error: 'Método no permitido.' });
    }
    if (req.headers['x-owner-password'] !== process.env.OWNER_PASSWORD) {
      return res.status(401).json({ error: 'Clave de propietario incorrecta.' });
    }
    if ((req.body || {}).action === 'verify') return res.status(200).json({ ok: true });

    const currentResponse = await fetch(endpoint(`?id=eq.${ROW_ID}&select=state,archives`), { headers: headers() });
    if (!currentResponse.ok) throw new Error('No se pudo consultar el balance actual.');
    const currentRows = await currentResponse.json();
    const current = currentRows[0] || { state: null, archives: [] };
    const body = req.body || {};
    const state = body.state;
    if (!state || !Array.isArray(state.people) || !Array.isArray(state.expenses) || !Array.isArray(state.payments) || (state.currency && !CURRENCIES.has(state.currency))) {
      return res.status(400).json({ error: 'Formato de balance no válido.' });
    }
    const archives = Array.isArray(current.archives) ? current.archives : [];
    if (body.action === 'reset') {
      if (current.state) archives.push({ month: new Date().toISOString(), state: current.state });
      if (archives.length > 24) archives.splice(0, archives.length - 24);
    }

    const response = await fetch(endpoint('?on_conflict=id'), {
      method: 'POST',
      headers: { ...headers(), Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ id: ROW_ID, state, archives, updated_at: new Date().toISOString() }),
    });
    if (!response.ok) throw new Error('No se pudo guardar el balance.');
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Shared balance API error:', error.message);
    return res.status(500).json({ error: 'Error al conectar con la base de datos.' });
  }
};
