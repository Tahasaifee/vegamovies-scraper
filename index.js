import express from "express";
import fetch from "node-fetch";
import cheerio from "cheerio";

const app = express();
app.use(express.static("public"));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BASE = "https://vegamovies.bh";

// /search?q=movie name  -> returns array of {title, link}
app.get("/search", async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ ok:false, error: "Missing q parameter" });
  try {
    const searchUrl = `${BASE}/?s=${encodeURIComponent(q)}`;
    const r = await fetch(searchUrl, { headers: { "user-agent": "Mozilla/5.0" } });
    const html = await r.text();
    const $ = cheerio.load(html);
    const results = [];

    // Try several common selectors to collect matching entries
    $("article a, .post-title a, .entry-title a, .title a, .movie-title a").each((i, el) => {
      try {
        const href = $(el).attr("href");
        const title = $(el).text().trim();
        if (href && title) {
          const link = href.startsWith("http") ? href : (new URL(href, BASE)).href;
          results.push({ title, link });
        }
      } catch (e){}
    });

    // fallback: generic anchors that look like a movie link
    if (results.length === 0) {
      $("a").each((i, el) => {
        const href = $(el).attr("href") || "";
        const txt = $(el).text().trim();
        if (href.includes("/movie") || href.includes("/movies") || href.includes("/watch") || txt.length>2) {
          const link = href.startsWith("http") ? href : (new URL(href, BASE)).href;
          results.push({ title: txt || link, link });
        }
      });
    }

    // dedupe and return
    const seen = new Set();
    const unique = [];
    for (const ritem of results) {
      if (ritem && ritem.link && !seen.has(ritem.link)) {
        seen.add(ritem.link);
        unique.push(ritem);
      }
    }

    res.json({ ok: true, query: q, count: unique.length, results: unique });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// /extract?url=<movie page> -> returns iframe (if any) and direct media links found
app.get("/extract", async (req, res) => {
  const page = req.query.url;
  if (!page) return res.status(400).json({ ok:false, error: "Missing url parameter" });
  try {
    const r = await fetch(page, { headers: { "user-agent": "Mozilla/5.0", "referer": BASE } });
    const html = await r.text();
    const $ = cheerio.load(html);

    // find iframe url (first)
    const iframe = $("iframe").first().attr("src") || null;
    let iframeHtml = "";
    if (iframe) {
      let iframeUrl = iframe.startsWith("//") ? "https:" + iframe : (iframe.startsWith("http") ? iframe : new URL(iframe, page).href);
      try {
        const rf = await fetch(iframeUrl, { headers: { "user-agent": "Mozilla/5.0", "referer": page } });
        iframeHtml = await rf.text();
      } catch (e) {
        iframeHtml = "";
      }
    }

    // combine text to search
    const searchText = html + "\n" + iframeHtml;

    // regex for common media urls (m3u8/mp4/mkv/webm/avi/ts + optional query)
    const regex = /https?:\/\/[^\s"'<>]+?\.(?:m3u8|mp4|mkv|webm|avi|ts)(?:\?[^"'<>\s]*)?/ig;
    const matches = Array.from(new Set([...(searchText.match(regex) || [])]));

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json({ ok: true, page, iframe: iframe || null, links: matches });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});