module.exports = async (req, res) => {
  try {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_PAT;
    const table = "Work Hour Events and Categories";

    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?pageSize=20`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).send(text);

    const data = JSON.parse(text);

    res.status(200).json({
      count: data.records?.length || 0,
      samples: (data.records || []).slice(0, 5).map(rec => ({
        id: rec.id,
        fields: rec.fields,
        fieldKeys: Object.keys(rec.fields || {})
      }))
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
