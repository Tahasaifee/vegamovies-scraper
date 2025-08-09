const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = "https://vegamovies.bh";

app.use(express.static('public'));
app.use(express.json());

// Search endpoint: /search?q=movie name
app.get('/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ ok:false, error: "Missing q parameter" });
  try {
    const searchUrl = `${BASE}/?s=${encodeURIComponent(q)}`;
    const response = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const html = response.data;
    const $ = cheerio.load(html);
    const results = [];

    $("article a, .post-title a, .entry-title a, .title a, .movie-title a").each((i, el) => {
      const href = $(el).attr('href');
      const title = $(el).text().trim();
      if (href && title) {
        const link = href.startsWith('http') ? href : new URL(href, BASE).href;
        results.push({ title, link });
      }
    });

    // fallback generic anchors
    if(results.length === 0){
      $("a").each((i, el) => {
        const href = $(el).attr('href') || "";
        const txt = $(el).text().trim();
        if(href.includes("/movie") || href.includes("/movies") || href.includes("/watch") || txt.length > 2){
          const link = href.startsWith('http') ? href : new URL(href, BASE).href;
          results.push({title: txt || link, link});
        }
      });
    }

    // dedupe
    const seen = new Set();
    const unique = [];
    for(const r of results){
      if(r.link && !seen.has(r.link)){
        seen.add(r.link);
        unique.push(r);
      }
    }

    res.json({ ok: true, query: q, count: unique.length, results: unique });
  } catch(err){
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Extract endpoint: /extract?url=<movie page url>
app.get('/extract', async (req, res) => {
  const page = req.query.url;
  if(!page) return res.status(400).json({ ok:false, error: "Missing url parameter" });
  try {
    const response = await axios.get(page, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': BASE }
    });
    const html = response.data;
    const $ = cheerio.load(html);

    const iframeSrc = $("iframe").first().attr("src") || null;
    let iframeHtml = "";
    if(iframeSrc){
      let iframeUrl = iframeSrc.startsWith("//") ? "https:" + iframeSrc : (iframeSrc.startsWith("http") ? iframeSrc : new URL(iframeSrc, page).href);
      try {
        const iframeRes = await axios.get(iframeUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': page }
        });
        iframeHtml = iframeRes.data;
      } catch(e){
        iframeHtml = "";
      }
    }

    const combinedText = html + "\n" + iframeHtml;

    // regex for media files
    const regex = /https?:\/\/[^\s"'<>]+?\.(?:m3u8|mp4|mkv|webm|avi|ts)(?:\?[^"'<>\s]*)?/ig;
    const matches = Array.from(new Set((combinedText.match(regex) || [])));

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json({ ok:true, page, iframe: iframeSrc, links: matches });
  } catch(err){
    res.status(500).json({ ok:false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
