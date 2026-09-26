const TABLE = 'shared_balances';
const ROW_ID = 'main';

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

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!configured()) return res.status(503).json({ error: 'La base de datos no está configurada.' });

  try {
    if (req.method === 'GET') {
      const response = await fetch(endpoint(`?id=eq.${ROW_ID}&select=state,archives`), { headers: headers() });
      if (!response.ok) throw new Error('No se pudo consultar la base de datos.');
      const rows = await response.json();
      return res.status(200).json(rows[0] || { state: null, archives: [] });
    }

    if (req.method !== 'PUT') {
      res.setHeader('Allow', 'GET, PUT');
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
    if (!state || !Array.isArray(state.people) || !Array.isArray(state.expenses) || !Array.isArray(state.payments)) {
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
