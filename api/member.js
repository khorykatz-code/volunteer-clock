module.exports = async (req, res) => {
  try {
    const raw = String(req.query.number || "").trim();
    if (!/^\d{1,4}$/.test(raw)) {
      return res.status(400).json({ error: "Invalid member number (must be 1–4 digits)" });
    }

    const baseId = process.env.AIRTABLE_BASE_ID;
    const token = process.env.AIRTABLE_PAT;

    const table = "MASTER MEMBERSHIP";
    const memberNumberField = "MEMBER #";
    const nameField = "Full Name";
    const phoneField = "PHONE NUMBER";

    // ✅ NEW: filter out former/deceased/etc by membership type
    const membershipTypeField = "MEMBERSHIP TYPE";
    const allowedTypes = new Set(["AM", "AME", "LM", "DW"]);
    const norm = (v) => String(v ?? "").trim().toUpperCase();

    const url = new URL(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`);
    // MEMBER # appears to be a number field, so compare numerically (no quotes)
    url.searchParams.set("filterByFormula", `{${memberNumberField}}=${Number(raw)}`);
    url.searchParams.set("maxRecords", "1");

    const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: text });

    const data = JSON.parse(text);
    const rec = data.records?.[0];
    if (!rec) return res.status(404).json({ error: "Member not found" });

    // ✅ NEW: membership eligibility gate
    const mtype = norm(rec.fields?.[membershipTypeField]);
    if (!allowedTypes.has(mtype)) {
      // Treat as "not found" to kiosk so they never show up
      return res.status(404).json({ error: "Member not eligible for check-in" });
      // Alternative if you prefer not to 404:
      // return res.status(200).json({ member: null });
    }

    const phoneRaw = rec.fields?.[phoneField] ?? null;

    // Convert US phone formats like "(440) 666-3783" into E.164: +14406663783
    let phoneE164 = null;
    if (typeof phoneRaw === "string") {
      const digits = phoneRaw.replace(/\D/g, "");
      if (digits.length === 10) phoneE164 = `+1${digits}`;
      else if (digits.length === 11 && digits.startsWith("1")) phoneE164 = `+${digits}`;
    }

    res.status(200).json({
      member: {
        id: rec.id,
        number: rec.fields?.[memberNumberField] ?? null,
        name: rec.fields?.[nameField] ?? null,
        phoneRaw,
        phoneE164
      }
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
};
