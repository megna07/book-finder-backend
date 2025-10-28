// api/summary.js
import fetch from "node-fetch";

function safeText(x){ return x ? String(x).trim() : ""; }

function parseRecommendations(text) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const recs = [];
  for (const line of lines) {
    if (recs.length >= 6) break;
    const clean = line.replace(/^[\-\*\d\.\)\s]+/, "").trim();
    let m;
    if ((m = clean.match(/^(.+?)\s+[-–—]\s+(.+)$/))) { recs.push({ title: m[1].trim(), author: m[2].trim() }); continue; }
    if ((m = clean.match(/^(.+?)\s+by\s+(.+)$/i))) { recs.push({ title: m[1].trim(), author: m[2].trim() }); continue; }
    if ((m = clean.match(/^(.+?)\s+\((.+)\)$/))) { recs.push({ title: m[1].trim(), author: m[2].trim() }); continue; }
    recs.push({ title: clean, author: "" });
  }
  return recs;
}

export default async function handler(req, res) {
  try {
    const title = safeText(req.query.title || req.body?.title);
    const author = safeText(req.query.author || req.body?.author);
    if (!title) return res.status(400).json({ error: "Missing title parameter." });

    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_KEY) return res.status(500).json({ error: "OPENAI_API_KEY not set." });

    const prompt = `You are a concise assistant for book summaries.
User provided:
Title: "${title}"
Author: "${author || "unknown"}"

Task:
1) Provide a short human-friendly summary (2-3 sentences).
2) Then list 4 recommended read-alike books, one per line, in the format "Title — Author" or "Title by Author".
Do not add extra commentary.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "system", content: "You are an assistant that provides summaries and read-alike recommendations." }, { role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 400
      })
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("OpenAI error:", response.status, t);
      return res.status(502).json({ error: "LLM provider error", detail: t });
    }

    const json = await response.json();
    const raw = json?.choices?.[0]?.message?.content || "";
    const parts = raw.split(/\r?\n\r?\n/);
    const summary = parts[0] ? parts[0].trim() : raw.split(/\r?\n/).slice(0,2).join(" ").trim();
    const recText = parts.slice(1).join("\n").trim() || raw.split(/\r?\n/).slice(2).join("\n");
    const recommendations = parseRecommendations(recText).slice(0,5);

    res.status(200).json({ summary, recommendations });
  } catch (err) {
    console.error("Handler error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
