#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const token = process.env.GH_TOKEN;
const username = 'RobertoReale';

async function main() {
  if (!token) throw new Error('GH_TOKEN is not set');

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `bearer ${token}`,
      'User-Agent': 'sync-pinned-repos',
    },
    body: JSON.stringify({
      query: `{
        user(login: "${username}") {
          pinnedItems(first: 6, types: REPOSITORY) {
            nodes {
              ... on Repository { nameWithOwner }
            }
          }
        }
      }`,
    }),
  });

  const text = await response.text();
  console.log('API response status:', response.status);
  console.log('API response body:', text);

  if (!response.ok) throw new Error(`GitHub API error ${response.status}: ${text}`);

  const result = JSON.parse(text);
  if (result.errors) throw new Error('GraphQL errors: ' + JSON.stringify(result.errors, null, 2));

  const repos = result.data.user.pinnedItems.nodes.map((n) => n.nameWithOwner);

  if (repos.length === 0) {
    console.log('No pinned repos found, skipping update');
    return;
  }

  console.log('Pinned repos:', repos);

  const configPath = path.join(__dirname, '..', 'gitprofile.config.ts');
  let content = fs.readFileSync(configPath, 'utf8');

  content = content.replace(/mode: ['"]automatic['"]/, "mode: 'manual'");

  const manualIdx = content.indexOf('manual: {');
  if (manualIdx === -1) throw new Error('manual section not found in config');

  const reposList = repos.map((r) => `'${r}'`).join(', ');
  const before = content.slice(0, manualIdx);
  const after = content.slice(manualIdx).replace(/projects: \[.*?\]/, `projects: [${reposList}]`);

  fs.writeFileSync(configPath, before + after, 'utf8');
  console.log('Config updated successfully');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
