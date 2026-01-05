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
  try { json = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, text, json };
}

function htmlPage(title, body) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title></head><body style="font-family:system-ui;padding:24px;max-width:560px;margin:0 auto;">
  <h2>${title}</h2>${body}</body></html>`;
}

module.exports = async (req, res) => {
  try {
    const tokenParam = String(req.query.token || "").trim();
    if (!tokenParam) return res.status(400).send("Missing token");

    const baseId = process.env.AIRTABLE_BASE_ID;
    const pat = process.env.AIRTABLE_PAT;

    const logsTable = "Work Hour Log 2 (2026+)";
    const endField = "EndTime";
    const tokenField = "ClockOutToken";
    const tokenExpField = "ClockOutTokenExpires";

    // Find open log by token, not clocked out yet, token not expired
    const findUrl = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}`);
    findUrl.searchParams.set(
      "filterByFormula",
      `AND({${tokenField}}="${tokenParam}", {${endField}}=BLANK(), IS_AFTER({${tokenExpField}}, NOW()))`
    );
    findUrl.searchParams.set("maxRecords", "1");

    const r1 = await airtableFetch(findUrl.toString(), { token: pat });
    if (!r1.ok) return res.status(r1.status).send(r1.text);

    const open = r1.json?.records?.[0];
    if (!open) {
      return res.status(200).send(
        htmlPage("Clock-out link", `<p>That link is invalid, expired, or already used.</p>`)
      );
    }

    // Patch EndTime
    const nowIso = new Date().toISOString();
    const patchUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}/${open.id}`;

    const r2 = await airtableFetch(patchUrl, {
      method: "PATCH",
      token: pat,
      body: { fields: { [endField]: nowIso } }
    });

    if (!r2.ok) return res.status(r2.status).send(r2.text);

    return res
      .status(200)
      .send(htmlPage("You’re clocked out", `<p>All set — your shift has been clocked out.</p>`));
  } catch (e) {
    return res.status(500).send(String(e));
  }
};
