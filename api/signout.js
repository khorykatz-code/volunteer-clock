const { randomBytes } = require("crypto"); // not strictly needed, but keeps pattern consistent

async function airtableFetch(url, { method = "GET", token, body } = {}) {
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }

  return { ok: r.ok, status: r.status, text, json };
}

module.exports = async (req, res) => {
  // ---- CORS ----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const memberNumber = String(req.body?.memberNumber ?? "").trim();
    if (!/^\d{1,4}$/.test(memberNumber)) {
      return res.status(400).json({ error: "memberNumber is required (1–4 digits)" });
    }
    const memNum = Number(memberNumber);

    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_PAT;
    if (!baseId || !token) {
      return res.status(500).json({ error: "Missing AIRTABLE_BASE_ID or AIRTABLE_PAT" });
    }

    const logsTable = "Work Hour Log 2 (2026+)";
    const memNumField = "MemNum";
    const startField = "StartTime";
    const endField = "EndTime"; // we now know this is correct

    // 1) Find open shift
    const findUrl = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}`);
    const filter = `AND({${memNumField}}=${memNum}, {${endField}}=BLANK())`;
    findUrl.searchParams.set("filterByFormula", filter);
    findUrl.searchParams.set("maxRecords", "1");

    const r1 = await airtableFetch(findUrl.toString(), { token });
    if (!r1.ok) return res.status(r1.status).json({ error: r1.text });

    const open = r1.json?.records?.[0] || null;
    if (!open) return res.status(200).json({ status: "no_open_shift" });

    // 2) Patch EndTime
    const nowIso = new Date().toISOString();
    const patchUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}/${open.id}`;

    const r2 = await airtableFetch(patchUrl, {
      method: "PATCH",
      token,
      body: { fields: { [endField]: nowIso } }
    });
    if (!r2.ok) return res.status(r2.status).json({ error: r2.text });

    const updated = r2.json;

    return res.status(200).json({
      status: "signed_out",
      logRecordId: updated.id,
      startedAt: updated.fields?.[startField] || open.fields?.[startField] || null,
      endedAt: updated.fields?.[endField] || nowIso
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
