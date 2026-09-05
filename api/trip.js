const crypto = require('crypto');

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function supabase(path, options = {}) {
  const base = process.env.SUPABASE_PROJECT_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!base || !key) throw new Error('SERVER_NOT_CONFIGURED');

  const r = await fetch(
    base.replace(/\/$/, '') + '/rest/v1/' + path,
    {
      ...options,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    }
  );

  const text = await r.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!r.ok) {
    console.error('Supabase error', r.status, body);
    throw new Error('DATABASE_ERROR');
  }

  return body;
}

module.exports = async function handler(req, res) {

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'POST only' });
  }

  try {

    const { action, tripId, key, data } = req.body || {};

    if (!['load', 'save'].includes(action)) {
      return json(res, 400, { error: 'Invalid action' });
    }

    if (!/^[a-f0-9]{16,64}$/i.test(String(tripId || ''))) {
      return json(res, 400, { error: 'Invalid trip ID' });
    }

    if (!/^[a-f0-9]{32,128}$/i.test(String(key || ''))) {
      return json(res, 400, { error: 'Invalid edit key' });
    }

    const rows = await supabase(
      `trip_data?trip_id=eq.${encodeURIComponent(tripId)}&select=trip_id,edit_token_hash,data,updated_at&limit=1`,
      { method: 'GET' }
    );

    const row = Array.isArray(rows) ? rows[0] : null;
    const expectedHash = hashKey(key);

    if (action === 'load') {

      if (!row) {
        return json(res, 200, { exists: false });
      }

      if (row.edit_token_hash !== expectedHash) {
        return json(res, 403, {
          error: 'この共有リンクの編集キーが正しくありません'
        });
      }

      return json(res, 200, {
        exists: true,
        data: row.data,
        updatedAt: row.updated_at
      });
    }

    const encoded = JSON.stringify(data ?? {});

    if (encoded.length > 900000) {
      return json(res, 413, {
        error: '旅行データが大きすぎます'
      });
    }

    if (row) {

      if (row.edit_token_hash !== expectedHash) {
        return json(res, 403, {
          error: 'この共有リンクの編集キーが正しくありません'
        });
      }

      const updated = await supabase(
        `trip_data?trip_id=eq.${encodeURIComponent(tripId)}`,
        {
          method: 'PATCH',
          headers: {
            Prefer: 'return=representation'
          },
          body: JSON.stringify({
            data,
            updated_at: new Date().toISOString()
          })
        }
      );

      const out = Array.isArray(updated) ? updated[0] : null;

      return json(res, 200, {
        ok: true,
        updatedAt: out?.updated_at || new Date().toISOString()
      });
    }

    const created = await supabase(
      'trip_data',
      {
        method: 'POST',
        headers: {
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          trip_id: tripId,
          edit_token_hash: expectedHash,
          data
        })
      }
    );

    const out = Array.isArray(created) ? created[0] : null;

    return json(res, 200, {
      ok: true,
      created: true,
      updatedAt: out?.updated_at || new Date().toISOString()
    });

  } catch (e) {

    console.error(e);

    if (e.message === 'SERVER_NOT_CONFIGURED') {
      return json(res, 500, {
        error: 'Supabase環境変数が未設定です'
      });
    }

    return json(res, 500, {
      error: 'サーバー同期に失敗しました'
    });
  }
};
