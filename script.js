/*
 *-------------------------------------------------------------------------------
 * Copyright (C) 2025 philippe
 * 
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 * 
 * SPDX-License-Identifier: EPL-2.0
 *-------------------------------------------------------------------------------
*/


// Configuration
const BASE_URL =
(window.location.href).replace("unified-access.html", "").split(/[?#]/)[0];


const IPS_PATH = '/ips/';
const CATEGORIES_URL = 'cfg/categories.json';
const PROJECTS_URL = 'cfg/projects.json';
const REPO_STATS_URL = 'cfg/repo-stats.json';

const REPO_STATS_COLUMN = 'Repo Stats';
const IP_CARD_COLUMN = 'IP Card';
const defaultColumns = ["Name", "Category", "URL", "License", "Status", IP_CARD_COLUMN, REPO_STATS_COLUMN, "Project", "Description"];
const columnLabels = { "IP_CARD_URL": "IP Card", "IP_CARD_PDF_URL": "IP Card PDF", [IP_CARD_COLUMN]: "IP Card" };
let viewMode = "default";


// Cached DOM Elements
const statusEl   = document.getElementById('status');
const exportBtn  = document.getElementById('export-btn');
const fileInput  = document.getElementById('file-input');
const loadRadios = document.querySelectorAll('input[name="load-mode"]');
const table      = document.getElementById('data-table');
const thead      = table.querySelector('thead');
const tbody      = table.querySelector('tbody');

// Screen-reader live region for announcements (visually hidden but readable)
let srStatus = document.getElementById('sr-status');
if (!srStatus) {
  srStatus = document.createElement('div');
  srStatus.id = 'sr-status';
  srStatus.setAttribute('role', 'status');
  srStatus.setAttribute('aria-live', 'polite');
  // visually hide but keep available to assistive tech
  srStatus.style.position = 'absolute';
  srStatus.style.left = '-9999px';
  srStatus.style.width = '1px';
  srStatus.style.height = '1px';
  srStatus.style.overflow = 'hidden';
  document.body.appendChild(srStatus);
}

// State
let masterData   = [];
let filteredData = [];
let columns      = [];
let searchText   = '';
let filterState = {};
let allowedCategories = [];
let projectsData = [];
// Repository statistics cache: { generated_at, source, repos: {...}, errors: {...} }
// null when the cache could not be loaded at all.
let repoStats = null;
// lowercase "<host>/owner/repo" -> stats record, rebuilt whenever the cache is loaded.
let repoStatsIndex = new Map();
let visibleColumns = [];
let dataLoaded   = false;  // flag: true once loadDataFromServer finishes
let pendingSearch = null;  // stores search term from popstate until data is ready

async function loadAllowedCategories() {
  try {
    const response = await fetch(CATEGORIES_URL);
    if (!response.ok) {
      throw new Error(`Failed to load categories: ${response.statusText}`);
    }
    allowedCategories = await response.json();
  } catch (error) {
    console.error(error);
    statusEl.textContent = 'Error: Could not load categories.';
  }
}

async function loadProjectsData() {
  try {
    const response = await fetch(PROJECTS_URL);
    if (!response.ok) {
      throw new Error(`Failed to load projects: ${response.statusText}`);
    }
    projectsData = await response.json();
  } catch (error) {
    console.error(error);
    statusEl.textContent = 'Error: Could not load projects.';
  }
}

// Load the pre-computed repository statistics cache. Never throws: a missing
// or broken cache must not prevent the catalogue from rendering.
async function loadRepoStats() {
  try {
    const response = await fetch(REPO_STATS_URL);
    if (!response.ok) {
      throw new Error(`Failed to load repository stats: ${response.status}`);
    }
    const data = await response.json();
    if (!data || typeof data !== 'object' || typeof data.repos !== 'object') {
      throw new Error('Malformed repository stats cache');
    }
    repoStats = data;
    repoStatsIndex = new Map(
      Object.entries(data.repos).map(([key, value]) => [key.toLowerCase(), value])
    );
  } catch (error) {
    console.warn(error);
    repoStats = null;
    repoStatsIndex = new Map();
    statusEl.textContent = 'Catalogue loaded, but repository statistics are unavailable.';
  }
}

function findCategory(categoryString) {
  if (!categoryString) return null;
  const cat = allowedCategories.find(c =>
    c.name.toLowerCase() === categoryString.toLowerCase() ||
    (c.aliases && c.aliases.map(a => a.toLowerCase()).includes(categoryString.toLowerCase()))
  );
  return cat ? cat.name : null;
  }

  // Derive a Category from a filename of the form "name.<category>.json" and
  // inject it into every record. Shared by the local-file handler, the raw-file
  // fallback and the primary fetch path in loadDataFromServer. Returns [] when
  // the derived category is invalid or the payload is not an array.
  function injectCategoryFromFilename(data, fileName) {
  const dotCount = (fileName.match(/\./g) || []).length;
  if (dotCount >= 2) {
    const match = fileName.match(/^.*\.(.*?)\.json$/i);
    const categoryString = match ? match[1] : fileName.replace(/\.json$/i, '');
    const categoryName = findCategory(categoryString);
    if (categoryName) {
      return Array.isArray(data) ? data.map(item => ({ ...item, Category: categoryName })) : [];
    }
    console.warn(`Skipping file with invalid category: ${fileName}`);
    return [];
  }
  return Array.isArray(data) ? data : [];
  }

  // Compute the sorted filter-dropdown option list for a column, based on the
  // current masterData and filterState. Shared by buildTable (on open) and
  // refreshOpenDropdown (when another filter changes). Selected values first,
  // then valid, then invalid (grayed/disabled), each group alphabetical.
  function computeColumnFilterItems(col) {
  const allPossibleValues = [...new Set(masterData.flatMap(r => {
    const v = r[col];
    return Array.isArray(v) ? v : [v];
  }))].sort();

  const selectedValues = new Set(filterState[col] || []);

  const otherFilters = { ...filterState };
  delete otherFilters[col];
  const partiallyFilteredData = masterData.filter(row =>
    Object.entries(otherFilters).every(([filterCol, vals]) => {
      const cell = row[filterCol];
      return Array.isArray(cell) ? cell.some(v => vals.includes(v)) : vals.includes(String(cell));
    })
  );
  const validValues = new Set(partiallyFilteredData.flatMap(r => {
    const v = r[col];
    return Array.isArray(v) ? v : [v];
  }));

  const items = allPossibleValues.map(val => ({
    value: val,
    isSelected: selectedValues.has(val),
    isValid: validValues.has(val)
  }));

  items.sort((a, b) => {
    if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
    if (a.isValid !== b.isValid) return a.isValid ? -1 : 1;
    return String(a.value ?? '').localeCompare(String(b.value ?? ''));
  });

  return items;
  }

// Derive a GitHub API contents URL from a GitHub Pages or repo URL.
// Examples supported:
// - https://{owner}.github.io/{repo}  -> https://api.github.com/repos/{owner}/{repo}/contents/ips
// - https://github.com/{owner}/{repo}  -> https://api.github.com/repos/{owner}/{repo}/contents/ips
function deriveGithubApiContentsUrl(base) {
  try {
    const u = new URL(base);
    const host = u.hostname.toLowerCase();
    const rawPath = u.pathname.replace(/^\/+|\/+$/g, ''); // trim slashes

    // Case: user/project pages like owner.github.io/repo
    if (host.endsWith('.github.io')) {
      const owner = host.replace('.github.io', '');
      const repo = rawPath.split('/')[0] || '';
      if (!repo) return null; // can't derive repo
      return `https://api.github.com/repos/${owner}/${repo}/contents/ips`;
    }

    // Case: direct github.com URL
    if (host === 'github.com') {
      const parts = rawPath.split('/').filter(Boolean);
      if (parts.length >= 2) {
        const owner = parts[0];
        const repo = parts[1];
        return `https://api.github.com/repos/${owner}/${repo}/contents/ips`;
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

// Parse a GitLab project URL into { host, projectPath } for any host whose
// name contains "gitlab" (gitlab.com, self-hosted instances, *.gitlab.io
// Pages). Everything from the "/-/" marker onward is UI navigation and is
// stripped. Known limitation: nested subgroups are not resolved; only the
// first two path segments form the project path.
function parseGitlabProjectUrl(u) {
  const host = u.hostname.toLowerCase();
  if (host !== 'gitlab.com' && !host.includes('gitlab')) return null;
  const parts = u.pathname.replace(/^\/+/g, '').split('/').filter(Boolean);
  const dashIdx = parts.indexOf('-'); // GitLab inserts "/-/" before UI routes
  let pathParts = dashIdx !== -1 ? parts.slice(0, dashIdx) : parts.slice();
  pathParts = pathParts.filter(p => p.length);
  if (host.endsWith('.gitlab.io')) {
    // Pages URL: the group is the subdomain, first segment is the project.
    const group = host.replace(/\.gitlab\.io$/, '');
    if (!group || !pathParts.length) return null;
    return { host, projectPath: `${group}/${pathParts[0]}` };
  }
  if (pathParts.length < 2) return null;
  return { host, projectPath: pathParts.slice(0, 2).join('/') };
}

// Derive GitLab REST API v4 URLs for the ips/ directory of a GitLab-hosted
// checkout. Returns { listUrl, fileUrl(path) } or null when base is not a
// derivable GitLab project URL.
function deriveGitlabApiUrl(base) {
  try {
    const parsed = parseGitlabProjectUrl(new URL(base));
    if (!parsed) return null;
    const encoded = encodeURIComponent(parsed.projectPath);
    const apiBase = `https://${parsed.host}/api/v4/projects/${encoded}`;
    return {
      listUrl: `${apiBase}/repository/tree?path=ips&per_page=100`,
      // The raw files endpoint accepts ref=HEAD, so no branch guessing.
      fileUrl: p => `${apiBase}/repository/files/${encodeURIComponent(p)}/raw?ref=HEAD`
    };
  } catch (e) {
    return null;
  }
}

// Derive repository-API fallback URLs from a hosting base URL, shared by the
// two fallback sites in loadDataFromServer. Returns { gitlabApi, apiUrl } where
// apiUrl is the GitHub contents URL when derivable, otherwise the GitLab tree
// listing URL (or null). gitlabApi is returned so callers can build raw file URLs.
function deriveFallbackApiInfo(base) {
  const gitlabApi = deriveGitlabApiUrl(base);
  const apiUrl = deriveGithubApiContentsUrl(base) || (gitlabApi ? gitlabApi.listUrl : null);
  return { gitlabApi, apiUrl };
}

// Try to derive a raw file URL (raw.githubusercontent.com or GitLab) for a
// given filename. Uses BASE_URL or the provided file url as hints. Best-effort
// only; assumes branch "main" (GitHub) / HEAD (GitLab) if none can be determined.
function deriveRawUrlFromHints(base, filename, hintUrl) {
  try {
    // 0) GitLab-hosted checkout: https://{host}/{group}/{project}/-/raw/{branch}/ips/{filename}
    const gitlabBase = parseGitlabProjectUrl(new URL(base));
    if (gitlabBase) {
      return `https://${gitlabBase.host}/${gitlabBase.projectPath}/-/raw/HEAD/ips/${filename}`;
    }

    // 1) Try to extract owner/repo from the API contents URL derived from base
    const api = deriveGithubApiContentsUrl(base);
    let owner = null, repo = null, branch = 'main';
    if (api) {
      const m = api.match(/repos\/([^\/]+)\/([^\/]+)\/contents/);
      if (m) {
        owner = m[1]; repo = m[2];
      }
    }

    // 2) If not found, inspect the hintUrl (could be api.github.com, github.com, or a pages URL)
    if (!owner || !repo) {
      if (hintUrl) {
        try {
          const u = new URL(hintUrl);
          if (u.hostname === 'api.github.com') {
            const parts = u.pathname.split('/').filter(Boolean);
            // /repos/{owner}/{repo}/contents/...
            const reposIdx = parts.indexOf('repos');
            if (reposIdx !== -1 && parts.length >= reposIdx + 3) {
              owner = parts[reposIdx + 1];
              repo = parts[reposIdx + 2];
            }
            // Attempt to pick a ref query param if present
            const ref = u.searchParams.get('ref');
            if (ref) branch = ref;
          } else if (u.hostname === 'github.com') {
            const parts = u.pathname.split('/').filter(Boolean);
            // /{owner}/{repo}/blob/{branch}/path
            if (parts.length >= 2) {
              owner = parts[0]; repo = parts[1];
              const blobIdx = parts.indexOf('blob');
              if (blobIdx !== -1 && parts.length > blobIdx + 1) branch = parts[blobIdx + 1];
            }
          } else if (u.hostname.endsWith('.github.io')) {
            owner = u.hostname.replace('.github.io','');
            const segments = u.pathname.replace(/^\/+|\/+$/g,'').split('/').filter(Boolean);
            if (segments.length) repo = segments[0];
          }
          } catch (_) {}
          }
          }

          if (owner && repo) {
          return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/ips/${filename}`;
          }
          } catch (e) {
          // fallback returns null
          }
          return null;
          }

// Update or create a small badge element next to `#status` that shows which
// source was ultimately used to build the file list. Use short labels.
function updateFetchSourceBadge(sourceLabel) {
  try {
    let badge = document.getElementById('fetch-source-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.id = 'fetch-source-badge';
      badge.style.marginLeft = '10px';
      badge.style.fontSize = '0.86em';
      badge.style.padding = '2px 6px';
      badge.style.borderRadius = '4px';
      badge.style.background = '#eef';
      badge.style.color = '#033';
      // insert after the status element so status text updates won't remove it
      if (statusEl && statusEl.parentNode) statusEl.parentNode.insertBefore(badge, statusEl.nextSibling);
    }
    badge.textContent = sourceLabel;
  } catch (e) {
    // non-fatal
    console.debug('Could not update fetch source badge', e);
  }
}

// Add event listener for the search input
document.getElementById('search-input').addEventListener('input', e => {
  searchText = e.target.value.trim().toLowerCase();
  applyFilters();
});

// Entry Point: Handle Load-Mode Switch
loadRadios.forEach(radio => {
  radio.addEventListener('change', async () => {
    resetTable();
    if (radio.value === 'github' && radio.checked) {
      fileInput.style.display = 'none';
      await Promise.all([loadProjectsData(), loadRepoStats()]);
      loadDataFromServer();
    }
    if (radio.value === 'local' && radio.checked) {
      fileInput.style.display = 'inline-block';
      statusEl.textContent = 'Select one or more local JSON files.';
      await Promise.all([loadProjectsData(), loadRepoStats()]);
    }
  });
});

// Local File Handling
fileInput.addEventListener('change', async event => {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  resetTable();
  try {
    await Promise.all([loadAllowedCategories(), loadRepoStats()]);
    statusEl.textContent = `Reading ${files.length} local file(s)…`;
    const arrs = await Promise.all(files.map(file => {
      return new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(reader.result);
            // Only inject Category if filename has at least 2 dots
            const dotCount = (file.name.match(/\./g) || []).length;
            if (dotCount >= 2) {
              const match = file.name.match(/^.*\.(.*?)\.json$/i);
              const categoryString = match ? match[1] : file.name.replace(/\.json$/i,'');
              const categoryName = findCategory(categoryString);
              if (categoryName) {
                res(Array.isArray(data)
                  ? data.map(item => ({ ...item, Category: categoryName }))
                  : []);
              } else {
                console.warn(`Skipping file with invalid category: ${file.name}`);
                res([]);
              }
            } else {
              res(Array.isArray(data) ? data : []);
            }
          } catch(e) {
            rej(`Invalid JSON: ${file.name}`);
          }
        };
        reader.onerror = () => rej(`Read error: ${file.name}`);
        reader.readAsText(file);
      });
    }));

    masterData   = arrs.flat();
    masterData.sort((a, b) => String(a.Name ?? '').localeCompare(String(b.Name ?? '')));
    filteredData = [...masterData];
    deriveColumns();
    applyFilters();
    buildTable();
    setInitialFilterSelections(parseFiltersFromQuery()); // Apply URL filters now
  statusEl.textContent = 'Local files loaded.';
  srStatus.textContent = `${filteredData.length} items loaded from local files.`;
    exportBtn.disabled = false;
  } catch(err) {
    statusEl.textContent = 'Error: ' + err;
    console.error(err);
  }
});

// Load Virtual Repo IPs info from server (GitHub or self hosted)
async function loadDataFromServer() {
  let ips_url;

  // Normalize BASE_URL and avoid double-appending IPS_PATH.
  // Many callers set BASE_URL to the site root (e.g. https://.../),
  // and we append IPS_PATH. But if BASE_URL already contains
  // the ips subpath (e.g. someone set BASE_URL = '.../ips/'),
  // appending would produce '.../ips/ips/' and result in 404s.
  // Build ips_url by separating query part (if present), ensuring
  // the base path ends with exactly one IPS_PATH, then reattach query.
  const queryPos = BASE_URL.indexOf("?");
  const baseNoQuery = queryPos !== -1 ? BASE_URL.slice(0, queryPos) : BASE_URL;
  const queryPart = queryPos !== -1 ? BASE_URL.slice(queryPos) : '';

  // Ensure there is exactly one trailing slash on baseNoQuery for safe concatenation
  const normalizedBase = baseNoQuery.endsWith('/') ? baseNoQuery : baseNoQuery + '/';

  if (normalizedBase.endsWith(IPS_PATH)) {
    // BASE_URL already points into the ips folder; use it as-is (preserving query)
    ips_url = BASE_URL;
  } else {
    // Append IPS_PATH once, then reattach any query string.
    ips_url = normalizedBase + IPS_PATH.replace(/^\//, '');
    if (queryPart) ips_url += queryPart;
  }

  try {
    await Promise.all([loadAllowedCategories(), loadRepoStats()]);
    statusEl.textContent = 'Fetching file list from the hosting server…';

    statusEl.textContent = `Fetching file list from ${ips_url}…`;
    // indicate we attempted the same-origin directory listing first
    updateFetchSourceBadge('Directory listing (attempt)');

    let resp = await fetch(ips_url);

    // If the pages URL returns a non-OK status, attempt a GitHub API fallback
    // immediately rather than aborting — this handles GitHub Pages 404s or
    // directory listings that aren't machine-friendly.
    if (!resp.ok) {
      console.warn(`Primary fetch failed (${resp.status}) for ${ips_url}`);
      statusEl.textContent = `Fetch ${resp.status} from the listing; trying repository API fallback…`;
      try {
        // Only fall back to APIs derivable from the current location — never
        // silently pull someone else's repository.
        const gitlabApi = deriveGitlabApiUrl(BASE_URL);
        const apiUrl = deriveGithubApiContentsUrl(BASE_URL) || (gitlabApi ? gitlabApi.listUrl : null);
        if (!apiUrl) {
          throw new Error('no GitHub/GitLab API URL could be derived from this hosting location');
        }
        const apiResp = await fetch(apiUrl);
        if (apiResp.ok) {
          // Use the API response body as the primary 'text' source below
          const apiText = await apiResp.text();
          var text = apiText;
          updateFetchSourceBadge('Derived repository API');
        } else {
          throw new Error(`API fallback fetch ${apiResp.status}`);
        }
      } catch (e) {
        // Re-throw a helpful error for the outer catch to handle and report
        throw new Error(`Failed to fetch the IPS list from ${ips_url} (${resp.status}) and the API fallback failed: ${e.message}`);
      }
    } else {
      // Normal path: read the response text from the primary fetch
      var text = await resp.text();
      updateFetchSourceBadge('Directory listing');
    }
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      parsed = null;
    }

    let fileEntries = [];

    if (Array.isArray(parsed)) {
      // Case A: array of strings (filenames) or array of objects (GitHub API)
      if (parsed.length && typeof parsed[0] === 'string') {
        // Array of filenames — resolve relative to the base URL
        const base = ips_url.endsWith('/') ? ips_url : ips_url + '/';
        fileEntries = parsed.filter(n => n.endsWith('.json')).map(n => ({ name: n, url: new URL(n, base).toString() }));
      } else {
        // Array of objects (likely GitHub API). Prefer download_url, fall back to url/html_url
        fileEntries = parsed
          .filter(i => i && ((i.type === 'file') || (i.name && i.name.endsWith('.json'))))
          .map(i => ({ name: i.name, url: i.download_url || i.url || i.html_url }));
      }
    } else {
      // Case B: Not JSON — try to extract hrefs from HTML listing
      const hrefs = Array.from(text.matchAll(/href=["']([^"']+\.json)["']/gi)).map(m => m[1]);
      fileEntries = hrefs.map(h => {
        try {
          const full = new URL(h, ips_url).toString();
          const name = full.split('/').pop();
          return { name, url: full };
        } catch (e) {
          return null;
        }
      }).filter(Boolean);
    }

    // Deduplicate by filename (keep first seen)
    const seen = new Map();
    fileEntries.forEach(fe => {
      if (!fe || !fe.name || !fe.url) return;
      if (!fe.name.endsWith('.json')) return;
      if (!seen.has(fe.name)) seen.set(fe.name, fe.url);
    });

    let finalFiles = Array.from(seen.entries()).map(([name, url]) => ({ name, url }));

    // If the listing returned no usable files, try a repository API fallback
    // derived from the current location (GitHub or GitLab), which reliably
    // lists repository contents.
    if (finalFiles.length === 0) {
      const gitlabApi = deriveGitlabApiUrl(BASE_URL);
      const apiUrl = deriveGithubApiContentsUrl(BASE_URL) || (gitlabApi ? gitlabApi.listUrl : null);
      if (apiUrl) {
        try {
          statusEl.textContent = 'No files found in the listing — trying repository API fallback…';
          const apiResp = await fetch(apiUrl);
          if (apiResp && apiResp.ok) {
            const apiJson = await apiResp.json();
            if (Array.isArray(apiJson) && apiJson.length) {
              let apiFiles;
              if (gitlabApi && !deriveGithubApiContentsUrl(BASE_URL)) {
                // GitLab tree entries: keep files only, build raw file URLs.
                apiFiles = apiJson
                  .filter(i => i && i.type === 'blob' && i.name && i.name.endsWith('.json'))
                  .map(i => ({ name: i.name, url: gitlabApi.fileUrl(`ips/${i.path || i.name}`) }));
              } else {
                apiFiles = apiJson
                  .filter(i => i && ((i.type === 'file') || (i.name && i.name.endsWith('.json'))))
                  .map(i => ({ name: i.name, url: i.download_url || i.url || i.html_url }));
              }
              const seenApi = new Map();
              apiFiles.forEach(f => { if (f && f.name && f.url && !seenApi.has(f.name)) seenApi.set(f.name, f.url); });
              const apiFinal = Array.from(seenApi.entries()).map(([name, url]) => ({ name, url }));
              if (apiFinal.length) {
                finalFiles = apiFinal;
                updateFetchSourceBadge('Derived repository API');
              }
            }
          }
        } catch (e) {
          console.warn('Repository API fallback failed', e);
        }
      }
    }

    statusEl.textContent = `Found ${finalFiles.length} remote JSONs; loading…`;

    const arrs = await Promise.all(finalFiles.map(async f => {
      // Try the primary URL first
      let r = null;
      try { r = await fetch(f.url); } catch (e) { r = null; }
      if (!r || !r.ok) {
        console.warn(`Failed to fetch ${f.url}: ${r ? r.status : 'network'}`);
        // Best-effort: attempt a raw.githubusercontent.com URL derived from hints
        const rawUrl = deriveRawUrlFromHints(BASE_URL, f.name, f.url);
        if (rawUrl) {
          try {
            const r2 = await fetch(rawUrl);
            if (r2 && r2.ok) {
              updateFetchSourceBadge('Raw file fallback');
              const txt2 = await r2.text();
              try {
                const data = JSON.parse(txt2);
                // proceed with category injection below
                const dotCount = (f.name.match(/\./g) || []).length;
                if (dotCount >= 2) {
                  const match = f.name.match(/^.*\.(.*?)\.json$/i);
                  const categoryString = match ? match[1] : f.name.replace(/\.json$/i, '');
                  const categoryName = findCategory(categoryString);
                  if (categoryName) return Array.isArray(data) ? data.map(item => ({ ...item, Category: categoryName })) : [];
                  console.warn(`Skipping file with invalid category: ${f.name}`);
                  return [];
                } else {
                  return Array.isArray(data) ? data : [];
                }
              } catch (e) {
                console.warn(`Invalid JSON at ${rawUrl}`);
                return [];
              }
            }
          } catch (e) {
            console.warn('raw.githubusercontent fallback failed', e);
          }
        }
        return [];
      }
      const txt2 = await r.text();
      let data;
      try {
        data = JSON.parse(txt2);
      } catch (e) {
        console.warn(`Invalid JSON at ${f.url}`);
        return [];
      }

      const dotCount = (f.name.match(/\./g) || []).length;
      if (dotCount >= 2) {
        const match = f.name.match(/^.*\.(.*?)\.json$/i);
        const categoryString = match ? match[1] : f.name.replace(/\.json$/i, '');
        const categoryName = findCategory(categoryString);
        if (categoryName) {
          return Array.isArray(data) ? data.map(item => ({ ...item, Category: categoryName })) : [];
        } else {
          console.warn(`Skipping file with invalid category: ${f.name}`);
          return [];
        }
      } else {
        return Array.isArray(data) ? data : [];
      }
    }));

    masterData = arrs.flat();
    masterData.sort((a, b) => String(a.Name ?? '').localeCompare(String(b.Name ?? '')));
    filteredData = [...masterData];
    deriveColumns();
    applyFilters();
    buildTable();
    setInitialFilterSelections(parseFiltersFromQuery()); // Apply URL filters now
    dataLoaded = true;
    if (pendingSearch !== null) {
      searchText = pendingSearch.toLowerCase();
      const searchInput = document.getElementById('search-input');
      if (searchInput) searchInput.value = pendingSearch;
      pendingSearch = null;
      applyFilters();
    }
    statusEl.textContent = 'Catalogue data loaded.';
    srStatus.textContent = `${filteredData.length} items loaded from the catalogue source.`;
    exportBtn.disabled = false;
  } catch (err) {
    statusEl.textContent = 'Error: ' + (err.message || err);
    console.error(err);
  }
}

// Helpers
function resetTable() {
  masterData = [];
  filteredData = [];
  columns = [];
  thead.innerHTML = '';
  tbody.innerHTML = '';
  exportBtn.disabled = true;
}

function buildTable() {
  thead.innerHTML = '';
  tbody.innerHTML = '';

  let cg = table.querySelector('colgroup');
  if (!cg) {
    cg = document.createElement('colgroup');
    table.insertBefore(cg, thead);
  }
  cg.innerHTML = '';
  // Default initial column widths
  const DEFAULT_COL_WIDTHS = {
    'Project': '140px',
    'Name': '320px',
    'Category': '180px',
    'License': '170px',
    'Status': '170px',
    'Repo Stats': '200px',
    'IP Card': '110px',
    };

  visibleColumns.forEach(col => {
    const colEl = document.createElement('col');
    const w = DEFAULT_COL_WIDTHS[col];
    if (w) colEl.style.width = w;
    cg.appendChild(colEl);
  });

  const headerRow = document.createElement('tr');
  // Columns whose cells are not simple values: no per-value filter dropdown.
  const SKIP_DROPDOWN = new Set(['Description', 'Comment', 'Repo Stats', IP_CARD_COLUMN]);

  visibleColumns.forEach((col, i) => {
    const th = document.createElement('th');
    th.style.position = 'relative';
    th.style.verticalAlign = 'top';

    // If this column is in the skip-list, render a plain, non-interactive label
    if (SKIP_DROPDOWN.has(col)) {
      const labelDiv = document.createElement('div');
      labelDiv.className = 'header-label';
      labelDiv.textContent = col;
      labelDiv.style.padding = '6px 4px';
      labelDiv.setAttribute('aria-hidden', 'false');
      th.appendChild(labelDiv);
      headerRow.appendChild(th);
      return; // skip dropdown construction and listeners for this column
    }

    // Header button: use the column name itself as the dropdown toggle for filters
    const dropdown = document.createElement('div');
    dropdown.className = 'custom-dropdown';
    dropdown.tabIndex = 0;

    const headerBtn = document.createElement('button');
    // text content is just the column name; caret is provided via CSS ::after
    headerBtn.textContent = columnLabels[col] || col;
    headerBtn.type = 'button';
    headerBtn.className = 'header-filter-btn';
    // Accessibility: indicate this button opens a popup and manage expanded state
    headerBtn.setAttribute('aria-haspopup', 'true');
    headerBtn.setAttribute('aria-expanded', 'false');
    const portalId = `portal-dropdown-${col.replace(/\s+/g,'_')}-${i}`;
    headerBtn.setAttribute('aria-controls', portalId);
    // Keyboard: allow Enter/Space to open the dropdown
    headerBtn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        headerBtn.click();
      }
    });
    th.appendChild(headerBtn);

    const dropdownContent = document.createElement('div');
    dropdownContent.className = 'dropdown-content';
    // Accessibility: mark as a popup menu for assistive tech
    dropdownContent.setAttribute('role', 'menu');
    dropdownContent.setAttribute('aria-label', `Filter ${col}`);

    // attach header button as the visible toggle
    dropdown.appendChild(headerBtn);
    dropdown.appendChild(dropdownContent);
    th.appendChild(dropdown);

    // Toggle dropdown visibility
    headerBtn.addEventListener('click', e => {
      e.stopPropagation();
      // If this column's portal is already open, close it (toggle behavior)
      const existingPortal = document.getElementById(portalId);
      if (existingPortal) {
        existingPortal.remove();
        headerBtn.setAttribute('aria-expanded', 'false');
        return;
      }

      // Clear previous content and rebuild it based on the CURRENT filter state.
      dropdownContent.innerHTML = '';

      // Add search input to dropdown
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Search...';
      searchInput.style.width = '100%';
      dropdownContent.appendChild(searchInput);

      // 1. Get all possible unique values for the current column from the master dataset.
      const allPossibleValues = [...new Set(masterData.flatMap(r => {
        const v = r[col];
        return Array.isArray(v) ? v : [v];
      }))].sort();

      // 2. Determine which values are currently selected for this column.
      const selectedValues = new Set(filterState[col] || []);

      // 3. Determine which values are "valid" based on filters applied to *other* columns.
      const otherFilters = { ...filterState };
      delete otherFilters[col];
      const partiallyFilteredData = masterData.filter(row =>
        Object.entries(otherFilters).every(([filterCol, vals]) => {
          const cell = row[filterCol];
          return Array.isArray(cell) ? cell.some(v => vals.includes(v)) : vals.includes(String(cell));
        })
      );
      const validValues = new Set(partiallyFilteredData.flatMap(r => {
        const v = r[col];
        return Array.isArray(v) ? v : [v];
      }));

      // 4. Categorize all possible values for sorting and rendering.
      const items = allPossibleValues.map(val => ({
        value: val,
        isSelected: selectedValues.has(val),
        isValid: validValues.has(val)
      }));

      // 5. Sort the items: selected first, then valid, then invalid (grayed out).
      items.sort((a, b) => {
        if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
        if (a.isValid !== b.isValid) return a.isValid ? -1 : 1;
        return String(a.value ?? '').localeCompare(String(b.value ?? ''));
      });

      // 6. Create and append the checkbox elements.
      items.forEach(item => {
        const label = document.createElement('label');
        label.style.display = 'block';
        label.style.padding = '6px';
        label.style.cursor = 'pointer';
        label.setAttribute('role', 'menuitem');

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = item.value;
        cb.dataset.column = col;
        cb.checked = item.isSelected;
        cb.setAttribute('role', 'menuitemcheckbox');
        cb.setAttribute('aria-checked', cb.checked ? 'true' : 'false');

        if (!item.isValid && !item.isSelected) {
          cb.disabled = true;
          label.style.color = '#999';
          label.style.cursor = 'not-allowed';
        }

        label.appendChild(cb);
        label.appendChild(document.createTextNode(item.value));
        dropdownContent.appendChild(label);
      });
      // --- END: On-demand dropdown generation ---

      // Remove any other existing portal dropdowns
      document.querySelectorAll('.portal-dropdown').forEach(dc => dc.remove());

      // Get button position
      const rect = headerBtn.getBoundingClientRect();

      // Clone dropdownContent and expose it as a portal dropdown
      const portalDropdown = dropdownContent.cloneNode(true);
      portalDropdown.className = 'dropdown-content portal-dropdown';
      portalDropdown.id = portalId;
      portalDropdown.dataset.column = col; // Add column context to the portal
      portalDropdown.style.position = 'absolute';
      portalDropdown.style.left = rect.left + 'px';
      portalDropdown.style.top = (rect.bottom + window.scrollY) + 'px';
      portalDropdown.style.zIndex = 99999;
      portalDropdown.style.display = 'block';
      portalDropdown.style.background = '#fff';
      portalDropdown.style.border = '1px solid #ccc';
      portalDropdown.style.maxHeight = '400px';
      portalDropdown.style.overflowY = 'auto';
      portalDropdown.style.width = rect.width + 'px';

      // Add search functionality to the portal dropdown's search input
      const portalSearchInput = portalDropdown.querySelector('input[type="text"]');
      if (portalSearchInput) {
        portalSearchInput.addEventListener('input', e => {
          const filter = e.target.value.toLowerCase();
          const labels = portalDropdown.querySelectorAll('label');
          labels.forEach(label => {
            const text = label.textContent.toLowerCase();
            label.style.display = text.includes(filter) ? 'block' : 'none';
          });
        });
      }

      // Sync checked state from original dropdown
      portalDropdown.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        const orig = dropdownContent.querySelector(`input[value="${cb.value}"]`);
        if (orig) {
          cb.checked = orig.checked;
          cb.setAttribute('aria-checked', cb.checked ? 'true' : 'false');
        }

        // When changed, update original dropdown and apply filter
        cb.addEventListener('change', () => {
          if (orig) {
            orig.checked = cb.checked;
            orig.setAttribute('aria-checked', orig.checked ? 'true' : 'false');
          }
          cb.setAttribute('aria-checked', cb.checked ? 'true' : 'false');

          applyFilters();
          refreshOpenDropdown();
        });
      });

      document.body.appendChild(portalDropdown);
      // Mark as expanded for assistive tech
      headerBtn.setAttribute('aria-expanded', 'true');

      // Hide on outside click
      document.addEventListener('click', function hideDropdown(ev) {
        if (!portalDropdown.contains(ev.target) && ev.target !== headerBtn) {
          const p = document.getElementById(portalId);
          if (p) {
            p.remove();
            headerBtn.setAttribute('aria-expanded', 'false');
          }
          document.removeEventListener('click', hideDropdown);
          // remove esc handler if present
          document.removeEventListener('keydown', escHandler);
        }
      });

      // Close on Escape key for accessibility
      function escHandler(ev) {
        if (ev.key === 'Escape' || ev.key === 'Esc') {
          if (portalDropdown && portalDropdown.parentNode) {
            portalDropdown.remove();
          }
          headerBtn.setAttribute('aria-expanded', 'false');
          document.removeEventListener('keydown', escHandler);
        }
      }
      document.addEventListener('keydown', escHandler);
    });

    // Hide dropdown when clicking outside (original inline content)
    document.addEventListener('click', () => {
      dropdownContent.style.display = 'none';
      headerBtn.setAttribute('aria-expanded', 'false');
    });
    dropdown.addEventListener('click', e => e.stopPropagation());

    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  makeResizable(headerRow);

  // Render rows (even if empty)
  renderRows(filteredData);
}

// Returns a numeric score representing the completeness of a row, where lower is better
function getCompletenessScore(row) {
  const allFields = [...new Set(masterData.flatMap(Object.keys))];
  let emptyCount = 0;

  for (const field of allFields) {
    const value = row[field];
    if (value == null || value === '') {
      emptyCount++;
    } else if (Array.isArray(value) && value.length === 0) {
      emptyCount++;
    } else if (String(value).trim().toUpperCase() === 'TBD') {
      emptyCount++;
    }
  }

  return emptyCount;
}

// Update applyFilters for OR logic
function applyFilters(initialState = null) {
  if (initialState) {
    // If an initial state is provided (from URL), use it directly.
    filterState = initialState;
  } else {
    // Otherwise, build the filter state from the DOM (user interaction).
    const newFilterState = {};
    const openPortal = document.querySelector('.portal-dropdown');
    if (openPortal) {
      const checkedCbs = openPortal.querySelectorAll('input[type="checkbox"]:checked');
      if (checkedCbs.length > 0) {
        const col = checkedCbs[0].dataset.column;
        newFilterState[col] = Array.from(checkedCbs).map(cb => cb.value);
      }
    }
    // Merge with existing filters from other columns
    filterState = newFilterState;
  }

  // Filtering logic
  filteredData = masterData.filter(row =>
    Object.entries(filterState).every(([col, vals]) => {
      const cell = row[col];
      if (Array.isArray(cell)) {
        return cell.some(v => vals.includes(v));
      }
      return vals.includes(String(cell));
    }) &&
    (
      !searchText ||
      columns.some(col => {
        const cell = row[col];
        if (cell == null) return false;
        if (Array.isArray(cell)) {
          return cell.some(v => String(v).toLowerCase().includes(searchText));
        }
        return String(cell).toLowerCase().includes(searchText);
      }) ||
      [row['IP_CARD_URL'], row['IP_CARD_PDF_URL']].some(v => v && String(v).toLowerCase().includes(searchText))
    )
  );

  // Sort by completeness
  filteredData.sort((a, b) => {
    const scoreA = getCompletenessScore(a);
    const scoreB = getCompletenessScore(b);
    return scoreA - scoreB;
  });

  // Announce filter results to assistive tech
  try {
    const activeFilters = Object.entries(filterState).map(([c,vals]) => `${c}: ${vals.join(', ')}`).join('; ');
    srStatus.textContent = `${filteredData.length} results.` + (activeFilters ? ` Active filters: ${activeFilters}.` : '');
  } catch (e) {
    srStatus.textContent = `${filteredData.length} results.`;
  }
  // Always render the rows with the newly filtered data.
  renderRows(filteredData);
}

function refreshOpenDropdown() {
  const openPortal = document.querySelector('.portal-dropdown');
  if (!openPortal) return;

  const col = openPortal.dataset.column;

  // This logic is duplicated from buildTable, now isolated for just refreshing a dropdown
  const allPossibleValues = [...new Set(masterData.flatMap(r => {
    const v = r[col];
    return Array.isArray(v) ? v : [v];
  }))].sort();

  const selectedValues = new Set(filterState[col] || []);

  const otherFilters = { ...filterState };
  delete otherFilters[col];
  const partiallyFilteredData = masterData.filter(row =>
    Object.entries(otherFilters).every(([filterCol, vals]) => {
      const cell = row[filterCol];
      return Array.isArray(cell) ? cell.some(v => vals.includes(v)) : vals.includes(String(cell));
    })
  );
  const validValues = new Set(partiallyFilteredData.flatMap(r => {
      const v = r[col];
      return Array.isArray(v) ? v : [v];
  }));

  const items = allPossibleValues.map(val => ({
    value: val,
    isSelected: selectedValues.has(val),
    isValid: validValues.has(val)
  }));

  items.sort((a, b) => {
    if (a.isSelected !== b.isSelected) return a.isSelected ? -1 : 1;
    if (a.isValid !== b.isValid) return a.isValid ? -1 : 1;
    return String(a.value ?? '').localeCompare(String(b.value ?? ''));
  });

  // Store the search input element to re-insert it later
  const searchInput = openPortal.querySelector('input[type="text"]');
  // Create a document fragment to hold the reordered labels
  const fragment = document.createDocumentFragment();

  // Create a map of existing label elements for efficient lookup and to preserve existing DOM elements
  const existingLabelElements = new Map();
  openPortal.querySelectorAll('label').forEach(label => {
    const cb = label.querySelector('input[type="checkbox"]');
    if (cb) {
      existingLabelElements.set(cb.value, label);
    }
  });

  // Clear all existing content from the portal (except the search input if it's the only thing we want to preserve)
  // This is the most robust way to ensure correct reordering.
  openPortal.innerHTML = '';
  if (searchInput) {
    openPortal.appendChild(searchInput);
  }

  // Re-order and update labels based on the sorted items array and append to fragment
  items.forEach(item => {
    const label = existingLabelElements.get(item.value);
    if (!label) return;

    const cb = label.querySelector('input');
    // Ensure checked state is updated
    cb.checked = item.isSelected;
    cb.disabled = !item.isValid && !item.isSelected;
    label.style.color = cb.disabled ? '#999' : '';
    label.style.cursor = cb.disabled ? 'not-allowed' : 'pointer';
    cb.setAttribute('aria-checked', cb.checked ? 'true' : 'false');

    // Re-apply display style in case it was hidden by search filter
    // This ensures that if a search filter is active, only matching items are shown,
    // but if it's cleared, all items become visible again.
    if (searchInput && searchInput.value) {
      const filterText = searchInput.value.toLowerCase();
      const labelText = label.textContent.toLowerCase();
      label.style.display = labelText.includes(filterText) ? 'block' : 'none';
    } else {
      label.style.display = 'block'; // Show all if no search filter
    }

    fragment.appendChild(label);
  });

  // Append the sorted and updated labels after the search input
  openPortal.appendChild(fragment);
}

function isValidUrl(string) {
  if (!string) return false;
  try {
    // Use the URL constructor to check for validity.
    // It will throw a TypeError if the URL is malformed.
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Repository statistics helpers (GitHub + GitLab)
// The key normalisation rules below must stay in sync with parse_repo_refs()
// (GithubProvider.parse_repos / GitlabProvider.parse_repos) in
// scripts/fetch_repo_stats.py:
//   - GitHub: accepts github.com/{owner}/{repo}, optionally followed by
//     /tree/<ref>, /blob/<ref>/... (only owner/repo is kept)
//   - GitLab: any host containing "gitlab"; the first two path segments are
//     taken as group/project, everything from "/-/" onward and "#anchor" are
//     stripped. Known limitation: nested subgroups are not resolved.
//   - several URLs may be separated by ';' in one string
//   - trailing prose is tolerated: the slug stops at the first invalid character
//   - other hosts (bitbucket.org, vendor pages, ...) and empty values ignored
// Cache keys are lowercase "<host>/owner/repo".
// ---------------------------------------------------------------------------
// The lookbehind prevents matching other hosts such as
// "mirror.github.com/owner/repo"; a "www." subdomain is accepted.
const GITHUB_SLUG_RE = /(?<![A-Za-z0-9.\-])(?:www\.)?github\.com\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)/g;
// GitLab project URLs: any scheme://host containing "gitlab", followed by at
// least two path segments (group/project). Requiring the scheme prevents false
// positives on paths such as github.com/gitlab-tools/foo.
const GITLAB_SLUG_RE = /https?:\/\/([A-Za-z0-9.\-]*gitlab[A-Za-z0-9.\-]*)\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)/gi;

function parseRepoRefs(urlValue) {
  if (!urlValue || typeof urlValue !== 'string') return [];
  const refs = [];
  const seen = new Set();
  const push = (provider, key) => {
    const lower = key.toLowerCase();
    if (seen.has(lower)) return;
    seen.add(lower);
    refs.push({ provider, key: lower });
  };
  urlValue.split(';').forEach(chunk => {
    // GitHub refs first, mirroring the Python provider order.
    const ghRe = new RegExp(GITHUB_SLUG_RE.source, 'g');
    let match;
    while ((match = ghRe.exec(chunk)) !== null) {
      const owner = match[1].replace(/^\.+|\.+$/g, '');
      const repo = match[2].replace(/^\.+|\.+$/g, '');
      if (!owner || !repo) continue;
      push('github', `github.com/${owner}/${repo}`);
    }
    const glRe = new RegExp(GITLAB_SLUG_RE.source, 'gi');
    while ((match = glRe.exec(chunk)) !== null) {
      const host = match[1].toLowerCase();
      if (host !== 'gitlab.com' && !host.includes('gitlab')) continue;
      const group = match[2].replace(/^\.+|\.+$/g, '');
      const project = match[3].replace(/^\.+|\.+$/g, '');
      // The regex character classes stop at '/' and '#', so "/-/tree/<ref>"
      // and "#anchor" never enter the captured segments. A trailing slash
      // yields an empty project segment and is skipped here.
      if (!group || !project) continue;
      push('gitlab', `${host}/${group}/${project}`);
    }
  });
  return refs;
}

function lookupRepoStats(key) {
  if (!repoStatsIndex || !key) return null;
  const record = repoStatsIndex.get(key.toLowerCase());
  return record || null;
}

// Merge the stats of every GitHub/GitLab repo referenced by a row's URL field.
// Returns { repos: [{key, provider, record|null}], total: {...}|null } or null
// when the row references no known repository host at all.
function getRowRepoStats(row) {
  const refs = parseRepoRefs(row ? row['URL'] : '');
  if (!refs.length) return null;

  const repos = refs.map(ref => ({ ...ref, record: lookupRepoStats(ref.key) }));
  const found = repos.filter(r => r.record).map(r => r.record);
  if (!found.length) return { repos, total: null };

  const sumField = field => {
    const values = found.map(r => r[field]).filter(v => typeof v === 'number');
    return values.length ? values.reduce((acc, v) => acc + v, 0) : null;
  };
  const licenses = [...new Set(
    found.map(r => r.license_spdx_id).filter(v => v && v !== 'NOASSERTION')
  )];
  const pushedValues = found.map(r => Date.parse(r.pushed_at)).filter(ts => !Number.isNaN(ts));
  const latestPush = pushedValues.length
    ? new Date(Math.max(...pushedValues)).toISOString()
    : null;

  return {
    repos,
    total: {
      stars: sumField('stars'),
      forks: sumField('forks'),
      commits: sumField('commits'),
      watchers: sumField('watchers'),
      open_issues: sumField('open_issues'),
      contributors: sumField('contributors'),
      pushed_at: latestPush,
      license_spdx_id: licenses.length ? licenses.join(', ') : null,
      archived: found.every(r => r.archived === true)
    }
  };
}

// Compact "12d ago" / "3mo ago" style formatting for cache and push dates.
function formatRelativeDate(isoString) {
  const ts = Date.parse(isoString);
  if (!isoString || Number.isNaN(ts)) return 'unknown';
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (Number.isNaN(days)) return 'unknown';
  if (days < 0) return 'today';
  if (days < 31) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// Thousands separator for chip values (keeps cells narrow).
function formatStatNumber(value) {
  if (value === null || value === undefined) return '?';
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 10000) return `${Math.round(value / 1000)}k`;
  return value.toLocaleString('en-US');
}

// Provider/host prefix for the tooltip, e.g. "GitLab · gitlab.com".
function statsProviderLine(repos) {
  const records = repos.filter(r => r.record).map(r => r.record);
  if (!records.length) return null;
  const labels = [...new Set(records.map(r => {
    const provider = (r.provider || '').toLowerCase() === 'gitlab' ? 'GitLab' : 'GitHub';
    return r.host ? `${provider} · ${r.host}` : provider;
  }))];
  return labels.join(', ');
}

function statsTooltipText(total, generatedAt, providerLine) {
  const parts = [];
  if (providerLine) parts.push(providerLine);
  if (total.watchers !== null) parts.push(`Watchers: ${total.watchers}`);
  if (total.open_issues !== null) parts.push(`Open issues/PRs: ${total.open_issues}`);
  if (total.contributors !== null) parts.push(`Contributors: ${total.contributors}`);
  parts.push(`Last push: ${formatRelativeDate(total.pushed_at)}`);
  parts.push(`Detected license: ${total.license_spdx_id || 'unknown'}`);
  if (generatedAt) parts.push(`Stats refreshed ${formatRelativeDate(generatedAt)}`);
  return parts.join('\n');
}

// Build the content of the Repo Stats cell for one row.
function renderRepoStatsCell(td, row) {
  const stats = getRowRepoStats(row);
  if (!stats) {
    const na = document.createElement('span');
    na.className = 'gh-stats-na';
    na.textContent = 'n/a';
    na.title = 'No GitHub or GitLab repository referenced for this entry (empty URL or a non-repository source).';
    td.appendChild(na);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'gh-stats';

  if (!stats.total) {
    // Repositories are known but the cache has no (fresh) entry for them.
    const missing = document.createElement('span');
    missing.className = 'gh-stats-na';
    missing.textContent = '—';
    missing.title = `Statistics for ${stats.repos.map(r => r.key).join(', ')} are not refreshed yet.`;
    wrapper.appendChild(missing);
    td.appendChild(wrapper);
    return;
  }

  const t = stats.total;
  const generatedAt = repoStats ? repoStats.generated_at : null;

  // With several repositories in one row, show which block belongs to which repo.
  if (stats.repos.length > 1) {
    stats.repos.forEach(entry => {
      const line = document.createElement('a');
      line.className = 'gh-stats-repo';
      line.textContent = entry.key;
      const record = entry.record;
      if (record && record.html_url) {
        line.href = record.html_url;
        line.target = '_blank';
        line.rel = 'noopener noreferrer';
      } else {
        line.title = 'Statistics not refreshed yet for this repository.';
      }
      wrapper.appendChild(line);
    });
  }

  const addChip = (iconClass, value, label) => {
    const chip = document.createElement('span');
    chip.className = 'gh-stat';
    const icon = document.createElement('i');
    icon.className = `fas ${iconClass}`;
    icon.setAttribute('aria-hidden', 'true');
    chip.appendChild(icon);
    chip.appendChild(document.createTextNode(formatStatNumber(value)));
    chip.title = `${label}: ${value === null ? 'unknown' : value}`;
    wrapper.appendChild(chip);
  };

  addChip('fa-star', t.stars, 'Stars');
  addChip('fa-code-fork', t.forks, 'Forks');
  addChip('fa-code-commit', t.commits, 'Commits');

  // GitLab's public API exposes no watchers/subscribers count: show n/a for
  // rows whose records have no watcher data at all.
  if (t.watchers === null && stats.repos.some(r => r.record)) {
    const chip = document.createElement('span');
    chip.className = 'gh-stat';
    const icon = document.createElement('i');
    icon.className = 'fas fa-eye';
    icon.setAttribute('aria-hidden', 'true');
    chip.appendChild(icon);
    chip.appendChild(document.createTextNode('n/a'));
    chip.title = 'Watchers: not exposed by the GitLab API.';
    wrapper.appendChild(chip);
  }

  if (t.archived) {
    const archived = document.createElement('span');
    archived.className = 'gh-stat gh-stat--archived';
    archived.textContent = 'archived';
    archived.title = 'The repository is marked as archived.';
    wrapper.appendChild(archived);
  }

  if (stats.repos.length === 1) {
    const record = stats.repos[0].record;
    if (record && record.html_url) {
      const line = document.createElement('a');
      line.className = 'gh-stats-repo';
      line.href = record.html_url;
      line.target = '_blank';
      line.rel = 'noopener noreferrer';
      line.textContent = stats.repos[0].key;
      wrapper.appendChild(line);
    }
  }

  wrapper.title = statsTooltipText(t, generatedAt, statsProviderLine(stats.repos));
  td.appendChild(wrapper);
  }

function renderRows(rows) {
  tbody.innerHTML = '';
  if (rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = visibleColumns.length;
    td.textContent = 'No results found.';
    td.style.textAlign = 'center';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  rows.forEach(row => {
    const tr = document.createElement('tr');
    visibleColumns.forEach(col => {
      const td = document.createElement('td');
      td.setAttribute('data-label', col);
      if (col === 'Project') {
        const project = projectsData.find(p => p.name === row[col]);
        if (project && project.logo) {
          const img = document.createElement('img');
          img.src = project.logo;
          img.alt = project.name;
          img.style.height = '64px';
          td.appendChild(img);
        } else {
          td.textContent = row[col] ?? '';
        }
      } else if (col === 'Name') {
        const nameVal = row['Name'];
        const urlVal = row['URL'];
        if (isValidUrl(urlVal)) {
          const a = document.createElement('a');
          a.href = urlVal;
          a.textContent = Array.isArray(nameVal) ? nameVal.join(', ') : (nameVal ?? urlVal);
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          td.appendChild(a);
        } else {
          td.textContent = Array.isArray(nameVal) ? nameVal.join(', ') : (nameVal ?? '');
        }
      } else if (col === 'URL') {
        // Keep URL rendering for cases where URL is visible (fallback)
        if (row[col]) {
          const a = document.createElement('a');
          a.href = row[col];
          a.textContent = row[col];
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          td.appendChild(a);
        } else {
          td.textContent = '';
        }
      } else if (col === IP_CARD_COLUMN) {
        const iconSpecs = [
          { key: 'IP_CARD_URL',       cls: 'fas fa-file-code', title: 'Open IP Card (JSON)', aria: 'IP Card JSON' },
          { key: 'IP_CARD_PDF_URL',   cls: 'fas fa-file-pdf',  title: 'Open IP Card (PDF)',  aria: 'IP Card PDF'  }
        ];
        td.style.whiteSpace = 'nowrap';
        iconSpecs.forEach(spec => {
          if (row[spec.key]) {
            const a = document.createElement('a');
            a.href = row[spec.key];
            a.className = 'ip-card-link';
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.title = spec.title;
            a.setAttribute('aria-label', spec.aria);

            const icon = document.createElement('i');
            icon.className = spec.cls;
            icon.setAttribute('aria-hidden', 'true');
            a.appendChild(icon);

            td.appendChild(a);
          }
        });
      } else if (col === REPO_STATS_COLUMN) {
        renderRepoStatsCell(td, row);
      } else {
        td.textContent = Array.isArray(row[col]) ? row[col].join(', ') : (row[col] ?? '');
      }
      tr.appendChild(td);
      });
    tbody.appendChild(tr);
  });
}

// Human-readable CSV value for a cell. Needed for the Repo Stats column,
// whose data is not part of the row object.
function cellToCsv(col, row) {
  if (col === REPO_STATS_COLUMN) {
    const stats = getRowRepoStats(row);
    if (!stats) return 'n/a';
    if (!stats.total) {
      return `repos: ${stats.repos.map(r => r.key).join(' ')} (stats not refreshed yet)`;
    }
    const t = stats.total;
    const parts = [
      `stars=${t.stars ?? ''}`,
      `forks=${t.forks ?? ''}`,
      `commits=${t.commits ?? ''}`,
      `watchers=${t.watchers ?? ''}`,
      `open_issues=${t.open_issues ?? ''}`,
      `contributors=${t.contributors ?? ''}`,
      `last_push=${t.pushed_at ? t.pushed_at.slice(0, 10) : ''}`
    ];
    if (stats.repos.length > 1) {
      parts.unshift(`repos=${stats.repos.map(r => r.key).join(' ')}`);
    }
    return parts.join('; ');
    }
    if (col === IP_CARD_COLUMN) {
    return [row['IP_CARD_URL'], row['IP_CARD_PDF_URL']].filter(Boolean).join('; ');
    }
    return (row[col] || '').toString();
    }

// CSV export
exportBtn.addEventListener('click', () => {
  if (!filteredData.length) return;
  const lines = [visibleColumns.join(',')];
  filteredData.forEach(r => {
    lines.push(visibleColumns.map(c => `"${cellToCsv(c, r).replace(/"/g,'""')}"`).join(','));
  });
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'table.csv'; a.click();
  URL.revokeObjectURL(url);
});

// Auto‐start GitHub mode on first load
document.addEventListener('DOMContentLoaded', async () => {
  // trigger the default “github” radio
  document.querySelector('input[name="load-mode"][value="github"]')
          .dispatchEvent(new Event('change'));

          // Setup tab navigation and load compatibility matrix
          setupTabNavigation();
          await loadCompatibilityMatrixData();
          renderCompatibilityMatrix();
          });

// Settings Panel Toggle Logic
document.addEventListener('DOMContentLoaded', () => {
  const settingsToggleBtn = document.getElementById('settings-toggle-btn');
  const settingsPanel = document.getElementById('settings-panel');
  const settingsCloseBtn = document.getElementById('settings-close-btn');

  function showSettingsPanel() {
    settingsPanel.hidden = false;
  }

  function hideSettingsPanel() {
    settingsPanel.hidden = true;
  }

  settingsToggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (settingsPanel.hidden) {
      showSettingsPanel();
    } else {
      hideSettingsPanel();
    }
  });

  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener('click', hideSettingsPanel);
  }

  document.addEventListener('click', (e) => {
    if (!settingsPanel.hidden && !settingsPanel.contains(e.target) && e.target !== settingsToggleBtn) {
      hideSettingsPanel();
    }
  });
});

// Preselect filters
// 1) Through GET method, which is embedded on the URL
//    Ex: ?filter_Project=TRISTAN or ?filter_Project=TRISTAN,ISOLDE
// 2) POST method, through postMessage from a parent frame:
//    Ex: window.postMessage({ type: 'setFilters', filters: { Project: ['TRISTAN'] } }, '*')

function parseFiltersFromQuery() {
  const params = new URLSearchParams(window.location.search || '');
  const filters = {};
  for (const [k,v] of params.entries()) {
    // Accept either filter_<Column>=v or plain column param like Project=TRISTAN
    if (k.startsWith('filter_')) {
      const col = k.replace(/^filter_/, '');
      filters[col] = v.split(',').map(s=>decodeURIComponent(s).trim()).filter(Boolean);
    } else {
      filters[k] = v.split(',').map(s=>decodeURIComponent(s).trim()).filter(Boolean);
    }
  }
  return filters;
}

function setInitialFilterSelections(filters) {
  if (!filters || Object.keys(filters).length === 0) return;
  // Pass the filters from the URL directly to applyFilters.
  applyFilters(filters);
}

// Accept filters via postMessage for cross-document embedding
window.addEventListener('message', (ev) => {
  try {
    const msg = ev.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'setFilters' && msg.filters) {
      // If the table is already built, apply immediately; otherwise store and apply after build
      setInitialFilterSelections(msg.filters);
    }
  } catch (e) {
    console.debug('Ignored message', e);
  }
});

function makeResizable(headerRow) {
  const cols = table.querySelectorAll('col');
  headerRow.querySelectorAll('th').forEach((th, i) => {
    const resizer = document.createElement('div');
    resizer.className = 'resizer';
    th.appendChild(resizer);

    // Make the resizer keyboard and pointer accessible
    resizer.tabIndex = 0;
    resizer.setAttribute('role', 'separator');
    resizer.setAttribute('aria-orientation', 'horizontal');
    const headerLabel = th.querySelector('div')?.textContent?.trim() || `column ${i+1}`;
    resizer.setAttribute('aria-label', `Resize ${headerLabel}`);

    let startX, startWidth;
    const onPointerMove = e => {
      const x = e.pageX ?? (e.touches && e.touches[0] && e.touches[0].pageX) ?? e.clientX;
      const delta = x - startX;
      cols[i].style.width = startWidth + delta + 'px';
    };
    const onPointerUp = e => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      try { resizer.releasePointerCapture && resizer.releasePointerCapture(e.pointerId); } catch(_) {}
    };

    // Pointer (mouse/touch/pen) handling
    resizer.addEventListener('pointerdown', e => {
      e.preventDefault();
      startX = e.pageX || e.clientX;
      startWidth = th.offsetWidth;
      try { resizer.setPointerCapture && resizer.setPointerCapture(e.pointerId); } catch(_) {}
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    });

    // Fallback mouse handling (older browsers)
    const onMouseMove = e => onPointerMove(e);
    const onMouseUp = e => onPointerUp(e);
    resizer.addEventListener('mousedown', e => {
      startX = e.pageX;
      startWidth = th.offsetWidth;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Keyboard support: Arrow keys adjust width in 10px increments
    resizer.addEventListener('keydown', e => {
      const cur = parseInt(getComputedStyle(cols[i]).width, 10) || th.offsetWidth;
      if (e.key === 'ArrowLeft') {
        cols[i].style.width = Math.max(20, cur - 10) + 'px';
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        cols[i].style.width = (cur + 10) + 'px';
        e.preventDefault();
      }
    });
  });
}

// Handle view change
document.querySelectorAll('input[name="table-view"]').forEach(radio => {
  radio.addEventListener('change', e => {
    viewMode = e.target.value;
    updateVisibleColumns();
    buildTable();
  });
});

// Update visibleColumns based on view
function updateVisibleColumns() {
  if (viewMode === "default") {
    visibleColumns = columns.filter(col => defaultColumns.includes(col));
  } else {
    visibleColumns = [...columns];
  }
  // If both Name and URL exist in the dataset, hide the URL column
  // from the visible columns because Name will be rendered as a
  // hyperlink using the URL value.
  if (columns.includes('Name') && columns.includes('URL')) {
    visibleColumns = visibleColumns.filter(c => c !== 'URL');
  }
  // Always move Project to the end of visibleColumns
	if (visibleColumns.includes('Project')) {
	  visibleColumns = visibleColumns.filter(c => c !== 'Project');
	  visibleColumns.push('Project');
	}
}

// When columns are derived, update visibleColumns for current view
function deriveColumns() {
  const raw = Object.keys(masterData[0]||{});
  const ordered = [];
  if (raw.includes('Name'))     ordered.push('Name');
  if (raw.includes('Category')) ordered.push('Category');
  if (raw.includes('License'))  ordered.push('License');
  if (raw.includes('Status'))  ordered.push('Status');
  // Synthetic IP Card column: rendered from IP_CARD_URL/IP_CARD_PDF_URL raw
  // fields, which are otherwise not shown directly. Placed right after Status.
  if (raw.includes('IP_CARD_URL') || raw.includes('IP_CARD_PDF_URL')) ordered.push(IP_CARD_COLUMN);
  // Synthetic column: not a key of the IP JSON objects, rendered from the
  // pre-computed repository statistics cache. Placed after Status/IP Card.
  const ensureRepoStats = () => {
    if (!ordered.includes(REPO_STATS_COLUMN)) ordered.push(REPO_STATS_COLUMN);
  };
  if (raw.includes('Description'))  ordered.push('Description');
  ensureRepoStats();
  raw.forEach(c => {
  if (!['Name', 'Category', 'License', 'Status', 'Description', 'Project'].includes(c) &&
      c !== 'IP_CARD_URL' && c !== 'IP_CARD_PDF_URL') ordered.push(c);
  });
  ensureRepoStats();
  if (raw.includes('Project'))  ordered.push('Project'); // ALWAYS LAST
  columns = ordered;
  updateVisibleColumns();
  renderColumnToggleDropdown?.();
}


function renderColumnToggleDropdown() {
  const dropdown = document.getElementById('column-toggle-dropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '';
  columns.forEach(col => {
    const label = document.createElement('label');
    label.style.display = 'block';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = col;
    cb.checked = visibleColumns.includes(col);
    cb.addEventListener('change', () => {
      if (cb.checked) {
        if (!visibleColumns.includes(col)) visibleColumns.push(col);
      } else {
        visibleColumns = visibleColumns.filter(c => c !== col);
      }
      buildTable();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(col));
    dropdown.appendChild(label);
  });
}


// Compatibility Matrix section
let cfgMatrixData = null;

async function loadCompatibilityMatrixData() {
  try {
    const response = await fetch('cfg/compatibility-matrix.json');
    if (!response.ok) {
      throw new Error(`Failed to load compatibility matrix: ${response.statusText}`);
    }
    cfgMatrixData = await response.json();
  } catch (error) {
    console.error(error);
  }
}

function renderCompatibilityMatrix() {
  const table = document.getElementById('compatibility-table');
  if (!table || !cfgMatrixData) return;

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');

  thead.innerHTML = '';
  tbody.innerHTML = '';

  function addMatrixHover(cell) {
    const colIndex = cell.cellIndex;
    const row = cell.parentElement;
    row.querySelectorAll('td, th').forEach(c => c.classList.add('matrix-row-highlight'));
    const headerCell = thead.querySelectorAll('tr')[0]?.children[colIndex];
    if (headerCell) headerCell.classList.add('matrix-col-highlight');
    tbody.querySelectorAll('tr').forEach(tr => {
      const cellInCol = tr.children[colIndex];
      if (cellInCol) cellInCol.classList.add('matrix-col-highlight');
    });
  }

  function clearMatrixHover() {
    table.querySelectorAll('.matrix-row-highlight, .matrix-col-highlight').forEach(el => {
      el.classList.remove('matrix-row-highlight', 'matrix-col-highlight');
    });
  }

  // Create Header Row
  const headerRow = document.createElement('tr');
  const thEmpty = document.createElement('th');
  thEmpty.textContent = 'Technical contribution per Processor family';
  headerRow.appendChild(thEmpty);

  cfgMatrixData.columns.forEach(col => {
    const th = document.createElement('th');
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = col.name;
    link.style.cursor = 'pointer';
    link.style.textDecoration = 'underline';
    link.style.color = 'inherit';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchToCatalogue(col.ipName);
    });
    th.appendChild(link);
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  // Create Data Rows
  cfgMatrixData.rows.forEach(row => {
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    const displayName = row.officialName || row.name;
    const ipName = row.ipName || row.name;
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = displayName;
    link.style.cursor = 'pointer';
    link.style.textDecoration = 'underline';
    link.style.color = '#0056b3';
    link.addEventListener('click', (e) => {
      e.preventDefault();
      switchToCatalogue(ipName);
    });
    tdName.appendChild(link);
    tr.appendChild(tdName);

    row.values.forEach(val => {
      const td = document.createElement('td');
      if (val === 'CT') td.className = 'cell-ct';
      else if (val === 'CNT') td.className = 'cell-cnt';
      else if (val === 'NC') td.className = 'cell-nc';
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.querySelectorAll('th, td').forEach(cell => {
    cell.addEventListener('mouseenter', () => addMatrixHover(cell));
    cell.addEventListener('mouseleave', () => clearMatrixHover());
  });
  }

function switchToCatalogue(ipName) {
  history.pushState({ tab: 'catalogue', search: ipName }, '', '#catalogue');

  searchText = ipName.toLowerCase();
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.value = ipName;
  }

  applyFilters();

  const tabBtns = document.querySelectorAll('.tab-btn');
  const catalogueView = document.getElementById('catalogue-view');
  const compatibilityView = document.getElementById('compatibility-view');

  tabBtns.forEach(b => b.classList.remove('active'));
  tabBtns[0]?.classList.add('active');

  if (catalogueView) catalogueView.hidden = false;
  if (compatibilityView) compatibilityView.hidden = true;
}

function switchTab(tab) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const catalogueView = document.getElementById('catalogue-view');
  const compatibilityView = document.getElementById('compatibility-view');

  tabBtns.forEach(b => b.classList.remove('active'));
  tabBtns.forEach(b => {
    if (b.dataset.tab === tab) b.classList.add('active');
  });

  if (tab === 'catalogue') {
    catalogueView.hidden = false;
    compatibilityView.hidden = true;
  } else {
    catalogueView.hidden = true;
    compatibilityView.hidden = false;
  }
}

function setupTabNavigation() {
  const tabBtns = document.querySelectorAll('.tab-btn');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      history.pushState({ tab }, '', '#' + tab);
      switchTab(tab);
    });
  });

  // Handle browser Back/Forward buttons
  window.addEventListener('popstate', (event) => {
    if (event.state && event.state.tab) {
      switchTab(event.state.tab);
      // Restore search if going back to catalogue with a search term
      if (event.state.search) {
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = event.state.search;
        if (dataLoaded) {
          searchText = event.state.search.toLowerCase();
          applyFilters();
        } else {
          // Defer filtering until data finishes loading
          pendingSearch = event.state.search;
        }
      }
    } else {
      // No state (e.g., direct navigation) — default to catalogue
      switchTab('catalogue');
    }
  });

  // Hash-based tab initialization on page load
  const hash = window.location.hash.replace('#', '');
  if (hash === 'compatibility') {
    switchTab('compatibility');
  } else if (hash === 'catalogue') {
    switchTab('catalogue');
  }
}