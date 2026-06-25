// Reads the authorized-users list from Notion at request time, so people
// can be added/removed by editing the Notion list with no redeploy.
//
// RESILIENCE (added 2026-06-25): this list is read on EVERY sign-in for BOTH
// the calculator and the calendar, through one shared Notion token. Under
// concurrent team load Notion will intermittently rate-limit (429) or blip
// (5xx); without protection, each blip bounced a random user. So we now:
//   1. cache the result briefly (CACHE_TTL_MS) — collapses many sign-in reads
//      into ~one Notion read per warm instance per minute,
//   2. retry transient failures (429/5xx) with backoff, honoring Retry-After,
//   3. fall back to the last-known-good list if Notion is unreachable, rather
//      than deny everyone (stale-while-error).
//
// Env:
//   NOTION_TOKEN          - integration token with access to the list DB
//   NOTION_ALLOWED_DS     - data source id (collection UUID) of the list
//   ALLOWED_TOOL          - if set (e.g. "Calculator"), only rows whose
//                           Tools multi-select contains it count. Leave
//                           empty for a calculator-only list.
//   ALLOWED_EMAIL_PROP    - email property name (default "Email")
//   ALLOWED_ACTIVE_PROP   - active checkbox property name (default "Active")
//   ALLOWED_TOOLS_PROP    - tools multi-select property name (default "Tools")
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DS = process.env.NOTION_ALLOWED_DS;
const TOOL = (process.env.ALLOWED_TOOL || '').trim();
const EMAIL_PROP = process.env.ALLOWED_EMAIL_PROP || 'Email';
const ACTIVE_PROP = process.env.ALLOWED_ACTIVE_PROP || 'Active';
const TOOLS_PROP = process.env.ALLOWED_TOOLS_PROP || 'Tools';

const CACHE_TTL_MS = 60 * 1000; // serve a cached list for up to 60s
const MAX_RETRIES = 3;

// Module-scoped cache: survives for the life of a warm serverless instance.
let cache = { at: 0, emails: null };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractEmail(prop) {
  if (!prop) return null;
  if (prop.type === 'email') return prop.email;
  if (prop.type === 'rich_text') return (prop.rich_text || []).map((t) => t.plain_text).join('').trim();
  if (prop.type === 'title') return (prop.title || []).map((t) => t.plain_text).join('').trim();
  return null;
}

// A Notion POST that retries on transient failures (429 + 5xx), honoring the
// Retry-After header. Returns the parsed JSON, or throws after exhausting tries.
async function notionQuery(body) {
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let resp;
    try {
      resp = await fetch(`https://api.notion.com/v1/data_sources/${DS}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2025-09-03',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
    } catch (e) {
      lastErr = e; // network error — retry
      await sleep(250 * Math.pow(2, attempt));
      continue;
    }
    if (resp.ok) return resp.json();
    // Retry only transient statuses; a 4xx like 401/404 is permanent.
    if (resp.status === 429 || resp.status >= 500) {
      lastErr = new Error('notion query failed: ' + resp.status);
      const ra = Number(resp.headers.get('retry-after'));
      const wait = ra > 0 ? ra * 1000 : 250 * Math.pow(2, attempt);
      await sleep(wait);
      continue;
    }
    throw new Error('notion query failed: ' + resp.status);
  }
  throw lastErr || new Error('notion query failed');
}

// Returns a Set of lowercased authorized emails. Uses a short cache and retries;
// if Notion is unreachable but we have a previous result, returns it (stale)
// rather than failing the whole team. Throws only if configuration is missing
// or we have never successfully read the list.
async function fetchAllowedEmails() {
  if (!NOTION_TOKEN || !DS) throw new Error('allowlist not configured');

  if (cache.emails && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.emails;
  }

  const filters = [{ property: ACTIVE_PROP, checkbox: { equals: true } }];
  if (TOOL) filters.push({ property: TOOLS_PROP, multi_select: { contains: TOOL } });

  try {
    const emails = new Set();
    let cursor;
    do {
      const body = { page_size: 100, filter: { and: filters } };
      if (cursor) body.start_cursor = cursor;
      const data = await notionQuery(body);
      for (const row of data.results || []) {
        const email = extractEmail(row.properties && row.properties[EMAIL_PROP]);
        if (email) emails.add(email.toLowerCase());
      }
      cursor = data.has_more ? data.next_cursor : null;
    } while (cursor);

    cache = { at: Date.now(), emails };
    return emails;
  } catch (err) {
    // Notion unreachable: prefer last-known-good over locking everyone out.
    if (cache.emails) return cache.emails;
    throw err;
  }
}

module.exports = { fetchAllowedEmails };
