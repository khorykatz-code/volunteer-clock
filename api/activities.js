module.exports = async (req, res) => {
  try {
    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_PAT;
    const table = "Work Hour Events and Categories";

    const url = new URL(
      `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`
    );
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("filterByFormula", "{Active?}=TRUE()");

    const r = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    const text = await r.text();
    if (!r.ok) {
      return res.status(r.status).json({ error: text });
    }

    const data = JSON.parse(text);

    const activities = (data.records || [])
      .map(rec => ({
        id: rec.id,
        name: rec.fields?.Name ?? null,
        mode: rec.fields?.Mode ?? null,
        autoCloseMinutes: rec.fields?.AutoCloseMinutes ?? null,
        active: rec.fields?.["Active?"] ?? false
      }))
      .filter(a => a.name); // safety: drop blanks

    res.status(200).json({ activities });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
