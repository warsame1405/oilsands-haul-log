// api/scan-receipt.js  — Vercel serverless function
// Place this file at: /api/scan-receipt.js in your project root

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { image, mediaType } = req.body;
  if (!image || !mediaType) return res.status(400).json({ error: "Missing image or mediaType" });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: image },
              },
              {
                type: "text",
                text: `You are a receipt scanner for a Canadian trucking app. Extract ALL visible fields from this receipt and return ONLY a raw JSON object — no markdown, no backticks, no explanation, just the JSON.

Return exactly this structure:
{
  "amount": <total dollar amount as a number, e.g. 263.66>,
  "merchant": <business/station name as a string>,
  "date": <date as YYYY-MM-DD, e.g. "2026-03-20">,
  "category": <one of: "fuel", "maintenance", "insurance", "permits", "telephone", "rent", "meals", "lodging", "tolls", "tools_supplies", "safety", "accounting", "advertising", "bank_fees", "medical", "other">,
  "litres": <volume of fuel pumped as a number, e.g. 100.0 — look for "Litres", "L", "Volume", "Qty", "Gallons", "GAL" — null if not a fuel receipt>,
  "pricePerLitre": <unit fuel price as a decimal number in dollars, e.g. 1.459 — look for "Price/L", "Unit Price", "PPL", "CPL", "/L" — if shown in cents like "145.9¢" convert to dollars 1.459 — null if not fuel>,
  "note": <any extra detail: pump number, fuel grade, transaction ID, card last 4 — null if nothing useful>
}

FUEL RECEIPT TIPS:
- "Litres" or "L" or "Volume" = the litres field
- "Price/L" or "Unit Price" or "PPL" or a number like "1.459" next to "/L" = pricePerLitre
- If you see cents per litre like "145.9" or "159.9c", divide by 100 to get dollars
- The total amount = litres × pricePerLitre (use this to cross-check)

Return ONLY the JSON object. Nothing else.`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic error:", data);
      return res.status(500).json({ error: data.error?.message || "AI error" });
    }

    const text = (data.content || []).map((b) => b.text || "").join("").trim();
    // Strip any accidental markdown fences
    const clean = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const parsed = JSON.parse(clean);
    return res.status(200).json(parsed);
  } catch (err) {
    console.error("scan-receipt error:", err);
    return res.status(500).json({ error: err.message || "Failed to scan receipt" });
  }
}
