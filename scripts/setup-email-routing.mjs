const API_BASE = 'https://api.cloudflare.com/client/v4';

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

async function cfFetch(method, path, body) {
  const token = getEnv('CLOUDFLARE_API_TOKEN');
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    const message = data.errors?.map((e) => e.message).join(', ') || `HTTP ${response.status}`;
    throw new Error(`Cloudflare API error: ${message}`);
  }

  return data.result;
}

async function getZoneIdByDomain(domain) {
  const result = await cfFetch('GET', `/zones?name=${encodeURIComponent(domain)}`);
  const zone = result.find((z) => z.name === domain);
  if (!zone) {
    throw new Error(`Zone not found for domain: ${domain}`);
  }
  return zone.id;
}

async function getCatchAllRule(zoneId) {
  try {
    return await cfFetch('GET', `/zones/${zoneId}/email/routing/rules/catch_all`);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('not found') || message.includes('not_found')) {
      return null;
    }
    throw error;
  }
}

async function createCatchAllRule(zoneId, workerName) {
  return cfFetch('POST', `/zones/${zoneId}/email/routing/rules`, {
    name: 'Catch-all to Worker',
    enabled: true,
    matchers: [{ type: 'all' }],
    actions: [{ type: 'worker', value: [workerName] }]
  });
}

async function updateCatchAllRule(zoneId, rule, workerName) {
  if (!rule.id) {
    throw new Error('Cannot update catch-all rule without an ID');
  }
  return cfFetch('PUT', `/zones/${zoneId}/email/routing/rules/catch_all`, {
    name: 'Catch-all to Worker',
    enabled: true,
    matchers: [{ type: 'all' }],
    actions: [{ type: 'worker', value: [workerName] }]
  });
}

async function main() {
  const domain = process.env.CLOUDFLARE_DOMAIN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID || (domain ? await getZoneIdByDomain(domain) : undefined);
  const workerName = process.env.WORKER_NAME || 'dispomail-forwarder';
  const dryRun = process.env.DRY_RUN === 'true';

  if (!zoneId) {
    throw new Error('Set CLOUDFLARE_DOMAIN or CLOUDFLARE_ZONE_ID');
  }

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Setting up catch-all routing for zone ${zoneId} → worker ${workerName}`);

  const rule = await getCatchAllRule(zoneId);
  const targetRule = {
    name: 'Catch-all to Worker',
    enabled: true,
    matchers: [{ type: 'all' }],
    actions: [{ type: 'worker', value: [workerName] }]
  };

  if (rule) {
    console.log('Existing catch-all rule found:');
    console.log(JSON.stringify(rule, null, 2));
    if (dryRun) {
      console.log('[DRY RUN] Would update to:');
      console.log(JSON.stringify(targetRule, null, 2));
      return;
    }
    console.log('Updating...');
    await updateCatchAllRule(zoneId, rule, workerName);
  } else {
    if (dryRun) {
      console.log('[DRY RUN] No existing catch-all rule. Would create:');
      console.log(JSON.stringify(targetRule, null, 2));
      return;
    }
    console.log('No existing catch-all rule, creating...');
    await createCatchAllRule(zoneId, workerName);
  }

  console.log('Catch-all routing configured successfully.');
}

main().catch((error) => {
  console.error('Setup failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
