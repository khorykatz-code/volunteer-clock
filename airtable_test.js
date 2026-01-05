module.exports = async (req, res) => {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const token = process.env.AIRTABLE_PAT;
  const table = "Work Hour Events and Categories";

  try {
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?maxRecords=1`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const text = await r.text();

    res.status(200).json({
      baseIdPresent: !!baseId,
      baseId,
      tokenPresent: !!token,
      table,
      airtableStatus: r.status,
      airtableBody: text
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
