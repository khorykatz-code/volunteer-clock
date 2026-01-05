module.exports = async (req, res) => {
  try {
    const raw = String(req.query.number || "").trim();

    // QR contains 1–4 digits, no leading zeros requirement is fine—still validate digits only
    if (!/^\d{1,4}$/.test(raw)) {
      return res.status(400).json({ error: "Invalid member number (must be 1–4 digits)" });
    }

    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_PAT;

    const table = "MASTER MEMBERSHIP";
    const memberNumberField = "Member #";
    const nameField = "Full Name";
    const phoneField = "Phone Number";

    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    // Airtable formula: exact string match
    url.searchParams.set("filterByFormula", `{${memberNumberField}}="${raw}"`);
    url.searchParams.set("maxRecords", "1");

    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: text });

    const data = JSON.parse(text);
    const rec = data.records?.[0];
    if (!rec) return res.status(404).json({ error: "Member not found" });

    res.status(200).json({
      member: {
        id: rec.id,
        number: rec.fields?.[memberNumberField] ?? null,
        name: rec.fields?.[nameField] ?? null,
        phone: rec.fields?.[phoneField] ?? null
      }
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
