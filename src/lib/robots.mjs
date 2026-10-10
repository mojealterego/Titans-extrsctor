export function parseRobots(text, agent = 'TitansExtractor') {
  const groups = [];
  let agents = [];
  let rules = [];
  let inRules = false;
  const finish = () => {
    if (agents.length) groups.push({ agents, rules });
    agents = []; rules = []; inRules = false;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const pos = line.indexOf(':');
    if (pos < 0) continue;
    const key = line.slice(0, pos).trim().toLowerCase();
    const value = line.slice(pos + 1).trim();
    if (key === 'user-agent') {
      if (inRules) finish();
      agents.push(value.toLowerCase());
    } else if ((key === 'allow' || key === 'disallow') && agents.length) {
      inRules = true;
      if (value) rules.push({ allow: key === 'allow', pattern: value });
    }
  }
  finish();
  const specific = groups.filter(group => group.agents.some(a => a !== '*' && agent.toLowerCase().includes(a)));
  const selected = specific.length ? specific : groups.filter(group => group.agents.includes('*'));
  return {
    canFetch(pathname) {
      let winner = null;
      for (const rule of selected.flatMap(group => group.rules)) {
        const end = rule.pattern.endsWith('$');
        const value = end ? rule.pattern.slice(0, -1) : rule.pattern;
        const parts = value.split('*').map(part => part.replace(/[|\\{}()[\]^$+?.]/g, '\\$&'));
        if (!new RegExp('^' + parts.join('.*') + (end ? '$' : '')).test(pathname)) continue;
        const length = value.replace(/\*/g, '').length;
        if (!winner || length > winner.length || (length === winner.length && rule.allow)) winner = { length, allow: rule.allow };
      }
      return winner ? winner.allow : true;
    }
  };
}
export async function loadRobots(policy, { timeoutMs = 8000 } = {}) {
  const url = new URL('/robots.txt', policy.root);
  await policy.assert(url.href);
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'TitansExtractor/0.1 (+authorized-preservation)' }
  });
  if (response.status === 404 || response.status === 410) return parseRobots('');
  if (response.status === 401 || response.status === 403) return { canFetch: () => false };
  if (!response.ok) throw new Error('robots.txt unavailable: HTTP ' + response.status);
  if (Number(response.headers.get('content-length') || 0) > 256000) throw new Error('robots.txt size limit');
  const text = await response.text();
  if (text.length > 256000) throw new Error('robots.txt size limit');
  return parseRobots(text);
}
