export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { image, mediaType } = req.body;
    if (!image || !mediaType) return res.status(400).json({ error: "Missing image data" });
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 300,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text: `Analyze this receipt and respond ONLY with valid JSON, no extra text:\n{"amount": <number>, "merchant": "<business name>", "category": "<one of: fuel, maintenance, insurance, permits, telephone, rent, meals, lodging, tolls, tools_supplies, safety, accounting, advertising, bank_fees, medical, other>", "date": "<YYYY-MM-DD or empty string>"}\nExtract the total amount paid, business name, and best matching category.` }
        ]}]
      })
    });
    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: "Failed to read receipt" });
  }
}
