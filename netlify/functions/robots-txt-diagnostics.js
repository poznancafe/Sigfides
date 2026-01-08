const { fetch, jsonResponse } = require("./_utils");

function getBaseUrl(inputUrl) {
  const u = new URL(inputUrl);
  return `${u.protocol}//${u.host}`;
}

function parseRobots(text) {
  const lines = text.split(/\r?\n/);
  const sitemaps = [];
  const disallowRules = [];
  const allowRules = [];

  let hasUserAgent = false;
  let blocksAll = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const lower = trimmed.toLowerCase();

    if (lower.startsWith("user-agent:")) {
      hasUserAgent = true;
    }

    if (lower.startsWith("sitemap:")) {
      const val = trimmed.split(":", 2)[1]?.trim();
      if (val) sitemaps.push(val);
    }

    if (lower.startsWith("disallow:")) {
      const val = trimmed.split(":", 2)[1]?.trim() ?? "";
      disallowRules.push(val);
      if (val === "/") blocksAll = true;
    }

    if (lower.startsWith("allow:")) {
      const val = trimmed.split(":", 2)[1]?.trim() ?? "";
      allowRules.push(val);
    }
  }

  return { sitemaps, disallowRules, allowRules, hasUserAgent, blocksAll };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS"
      },
      body: ""
    };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Use POST with JSON body { url }" });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body." });
  }

  const { url } = payload;
  if (!url) return jsonResponse(400, { error: "url is required." });

  let robotsUrl;
  try {
    robotsUrl = `${getBaseUrl(url)}/robots.txt`;
  } catch {
    return jsonResponse(400, { error: "Invalid URL." });
  }

  try {
    const res = await fetch(robotsUrl, { redirect: "follow" });
    const text = res.ok ? await res.text() : "";
    const parsed = text ? parseRobots(text) : null;

    const hints = [];
    if (!res.ok) {
      hints.push("robots.txt not accessible. Crawlers may default to crawling, but governance is unclear.");
    } else {
      if (!parsed.hasUserAgent) hints.push("No User-agent groups found.");
      if (!parsed.sitemaps.length) hints.push("No Sitemap directive found.");
      if (parsed.blocksAll) hints.push("Disallow: / blocks all crawling.");
    }

    return jsonResponse(200, {
      tool: "sigfides-robots-txt-diagnostics",
      framing:
        "Crawl governance and safety — ensuring Google, Bing, Applebot, AI search systems and LLM indexers can access the right sections without accidental suppression or leakage.",
      robots_url: robotsUrl,
      status: res.status,
      sitemaps: parsed?.sitemaps || [],
      disallow_rules: parsed?.disallowRules || [],
      allow_rules: parsed?.allowRules || [],
      blocks_all: parsed?.blocksAll || false,
      hints,
      raw_preview: text.slice(0, 2000)
    });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
};
