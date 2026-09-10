import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const token = process.env.GH_TOKEN;
const username = 'RobertoReale';

async function main() {
  if (!token) throw new Error('GH_TOKEN is not set');

  const query = `
    query {
      user(login: "${username}") {
        repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {field: PUSHED_AT, direction: DESC}) {
          nodes {
            languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
              edges {
                size
                node {
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `bearer ${token}`,
      'User-Agent': 'sync-skills-script',
    },
    body: JSON.stringify({ query }),
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`GitHub API error ${response.status}: ${text}`);

  const result = JSON.parse(text);
  if (result.errors) throw new Error('GraphQL errors: ' + JSON.stringify(result.errors, null, 2));

  const langStats = {};
  const repos = result.data.user.repositories.nodes;

  for (const repo of repos) {
    if (repo.languages && repo.languages.edges) {
      for (const edge of repo.languages.edges) {
        const langName = edge.node.name;
        langStats[langName] = (langStats[langName] || 0) + edge.size;
      }
    }
  }

  const sortedLangs = Object.entries(langStats)
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0])
    .slice(0, 15);

  if (sortedLangs.length === 0) {
    console.log('No languages found, skipping update.');
    return;
  }

  console.log('Top languages from GitHub:', sortedLangs);

  const configPath = join(__dirname, '..', 'gitprofile.config.ts');
  let content = readFileSync(configPath, 'utf8');

  const skillsRegex = /skills:\s*\[([\s\S]*?)\]/;
  const match = content.match(skillsRegex);
  
  if (!match) {
    throw new Error('Could not find skills array in gitprofile.config.ts');
  }

  const existingSkillsRaw = match[1];
  const existingSkills = existingSkillsRaw
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(s => s.length > 0 && !s.startsWith('//'));

  const mergedMap = new Map();
  for (const skill of existingSkills) {
    mergedMap.set(skill.toLowerCase(), skill);
  }
  for (const lang of sortedLangs) {
    if (!mergedMap.has(lang.toLowerCase())) {
      mergedMap.set(lang.toLowerCase(), lang);
    }
  }

  const mergedSkills = Array.from(mergedMap.values()).sort((a, b) => a.localeCompare(b));

  console.log('Merged skills:', mergedSkills);

  const newSkillsStr = 'skills: [\n    ' + mergedSkills.map(s => `'${s}'`).join(',\n    ') + '\n  ]';
  content = content.replace(skillsRegex, newSkillsStr);

  writeFileSync(configPath, content, 'utf8');
  console.log('Skills updated successfully');
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
