// Reads the authorized-users list from Notion at request time, so people
// can be added/removed by editing the Notion list with no redeploy.
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

function extractEmail(prop) {
  if (!prop) return null;
  if (prop.type === 'email') return prop.email;
  if (prop.type === 'rich_text') return (prop.rich_text || []).map((t) => t.plain_text).join('').trim();
  if (prop.type === 'title') return (prop.title || []).map((t) => t.plain_text).join('').trim();
  return null;
}

// Returns a Set of lowercased authorized emails. Throws if not configured
// or if Notion is unreachable, so callers can fail closed (deny on error).
async function fetchAllowedEmails() {
  if (!NOTION_TOKEN || !DS) throw new Error('allowlist not configured');

  const filters = [{ property: ACTIVE_PROP, checkbox: { equals: true } }];
  if (TOOL) filters.push({ property: TOOLS_PROP, multi_select: { contains: TOOL } });

  const emails = new Set();
  let cursor;
  do {
    const body = { page_size: 100, filter: { and: filters } };
    if (cursor) body.start_cursor = cursor;
    const resp = await fetch(`https://api.notion.com/v1/data_sources/${DS}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        'Notion-Version': '2025-09-03',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error('notion query failed: ' + resp.status);
    const data = await resp.json();
    for (const row of data.results || []) {
      const email = extractEmail(row.properties && row.properties[EMAIL_PROP]);
      if (email) emails.add(email.toLowerCase());
    }
    cursor = data.has_more ? data.next_cursor : null;
  } while (cursor);

  return emails;
}

module.exports = { fetchAllowedEmails };
