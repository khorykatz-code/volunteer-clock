
module.exports = async (req, res) => {
  try {
    const id = String(req.query.id || "").trim();
    if (!id) return res.status(400).json({ error: "Missing ?id=rec..." });

    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_PAT;

    const table = "MASTER MEMBERSHIP";
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${id}`;

    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: text });

    const rec = JSON.parse(text);
    res.status(200).json({
      id: rec.id,
      fieldKeys: Object.keys(rec.fields || {}),
      fields: rec.fields
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
