#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');

const token = process.env.GH_TOKEN;
const username = 'RobertoReale';

function graphqlRequest(query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });
    const options = {
      hostname: 'api.github.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `bearer ${token}`,
        'User-Agent': 'sync-pinned-repos',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const result = await graphqlRequest(`{
    user(login: "${username}") {
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository {
            nameWithOwner
          }
        }
      }
    }
  }`);

  if (result.errors) {
    throw new Error('GraphQL errors: ' + JSON.stringify(result.errors));
  }

  const repos = result.data.user.pinnedItems.nodes.map((n) => n.nameWithOwner);

  if (repos.length === 0) {
    console.log('No pinned repos found, skipping update');
    return;
  }

  console.log('Pinned repos:', repos);

  const configPath = path.join(__dirname, '..', 'gitprofile.config.ts');
  let content = fs.readFileSync(configPath, 'utf8');

  // Switch to manual mode
  content = content.replace(/mode: ['"]automatic['"]/, "mode: 'manual'");

  // Update manual.projects, targeting only the first occurrence after "manual: {"
  const manualIdx = content.indexOf('manual: {');
  if (manualIdx === -1) throw new Error('manual section not found in config');

  const reposList = repos.map((r) => `'${r}'`).join(', ');
  const before = content.slice(0, manualIdx);
  const after = content.slice(manualIdx).replace(/projects: \[.*?\]/, `projects: [${reposList}]`);

  fs.writeFileSync(configPath, before + after, 'utf8');
  console.log('Config updated successfully');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
