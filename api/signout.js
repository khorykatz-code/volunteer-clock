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

    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_PAT;

    const logsTable = "Work Hour Log 2 (2026+)";
    const startField = "StartTime";
    const endField = "EndTime";

    // Your lookup field in Logs:
    const memNumField = "MemNum";

    // Find open log where MemNum matches and EndTime is blank
    const findUrl = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}`);
    const filter = `AND({${memNumField}}=${Number(memberNumber)}, {${endField}}=BLANK())`;
    findUrl.searchParams.set("filterByFormula", filter);
    findUrl.searchParams.set("maxRecords", "1");

    const r1 = await fetch(findUrl.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const t1 = await r1.text();
    if (!r1.ok) return res.status(r1.status).json({ error: t1 });

    const data = JSON.parse(t1);
    const open = data.records?.[0];
    if (!open) return res.status(200).json({ status: "no_open_shift" });

    const nowIso = new Date().toISOString();

    // Patch EndTime
    const patchUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(logsTable)}/${open.id}`;
    const r2 = await fetch(patchUrl, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields: { [endField]: nowIso } })
    });

    const t2 = await r2.text();
    if (!r2.ok) return res.status(r2.status).json({ error: t2 });

    const updated = JSON.parse(t2);

    res.status(200).json({
      status: "signed_out",
      logRecordId: updated.id,
      startedAt: updated.fields?.[startField] || null,
      endedAt: updated.fields?.[endField] || nowIso
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
