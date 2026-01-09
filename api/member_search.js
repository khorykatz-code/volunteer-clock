module.exports = async (req, res) => {
  try {
    const q = String(req.query.name || "").trim();
    if (q.length < 2) {
      return res.status(400).json({ error: "Name search must be at least 2 characters" });
    }

    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_PAT;
    if (!baseId || !token) {
      return res.status(500).json({ error: "Missing AIRTABLE_BASE_ID or AIRTABLE_PAT" });
    }

    const table = "MASTER MEMBERSHIP";
    const memberNumberField = "MEMBER #";
    const nameField = "Full Name";
    const membershipTypeField = "MEMBERSHIP TYPE";

    // Allowed membership types
    const allowed = ["AM", "AME", "LM", "DW"];
    const allowedFormula = `OR(${allowed.map(t => `{${membershipTypeField}}="${t}"`).join(",")})`;

    // Case-insensitive "contains" match
    // Escape quotes for Airtable formula
    const safe = q.replace(/"/g, '\\"');
    const nameFormula = `FIND(LOWER("${safe}"), LOWER({${nameField}}))`;

    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    url.searchParams.set("filterByFormula", `AND(${allowedFormula}, ${nameFormula})`);
    url.searchParams.set("maxRecords", "8");

    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: text });

    const data = JSON.parse(text);
    const members = (data.records || [])
      .map(rec => ({
        id: rec.id,
        number: rec.fields?.[memberNumberField] ?? null,
        name: rec.fields?.[nameField] ?? null
      }))
      .filter(m => m.number && m.name);

    return res.status(200).json({ members });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
};
