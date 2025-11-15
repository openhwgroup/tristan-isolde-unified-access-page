// Copyright (c) 2025 Eclipse Foundation


// Configuration
const BASE_URL =
(window.location.href).replace("index.html", ""); //local hosting
// 'https://cairo-caplan.github.io/tristan-isolde-unified-access-page';
// 'https://api.github.com/repos/openhwgroup/tristan-isolde-unified-access-page/contents/';


const IPS_PATH = '/ips/';
const CATEGORIES_URL = 'cfg/categories.json';
const PROJECTS_URL = 'cfg/projects.json';

const defaultColumns = ["Name", "Category", "URL", "License", "Status", "Project", "Description"];
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
let visibleColumns = [];

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

function findCategory(categoryString) {
  if (!categoryString) return null;
  const cat = allowedCategories.find(c =>
    c.name.toLowerCase() === categoryString.toLowerCase() ||
    (c.aliases && c.aliases.map(a => a.toLowerCase()).includes(categoryString.toLowerCase()))
  );
  return cat ? cat.name : null;
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

// Try to derive a raw.githubusercontent.com URL for a given filename.
// Uses BASE_URL or the provided file url as hints. Best-effort only;
// assumes branch "main" if none can be determined.
function deriveRawUrlFromHints(base, filename, hintUrl) {
  try {
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
      await loadProjectsData();
      loadDataFromServer();
    }
    if (radio.value === 'local' && radio.checked) {
      fileInput.style.display = 'inline-block';
      statusEl.textContent = 'Select one or more local JSON files.';
      await loadProjectsData();
    }
  });
});

// Local File Handling
fileInput.addEventListener('change', async event => {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  resetTable();
  try {
    await loadAllowedCategories();
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
  var ips_url;

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
    ips_url = normalizedBase + queryPart.replace(/^[?]/, '') ? normalizedBase + queryPart : normalizedBase;
    // Note: if BASE_URL already had a query, queryPart includes the leading '?'
    // the above ternary keeps behavior consistent.
    // Simpler: keep the original BASE_URL to preserve any query exactly.
    ips_url = BASE_URL;
  } else {
    // Append IPS_PATH once, then reattach any query string.
    ips_url = normalizedBase + IPS_PATH.replace(/^\//, '');
    if (queryPart) ips_url += queryPart;
  }

  try{
    await loadAllowedCategories();
    statusEl.textContent = 'Fetching file list from GitHub…';

  // Diagnostic: show which URL we're fetching
  console.info('Fetching IPS list from:', ips_url);
  statusEl.textContent = `Fetching file list from ${ips_url}…`;
  // indicate we attempted the pages listing first
  updateFetchSourceBadge('Pages listing (attempt)');

    let resp = await fetch(ips_url);

    // If the pages URL returns a non-OK status, attempt a GitHub API fallback
    // immediately rather than aborting — this handles GitHub Pages 404s or
    // directory listings that aren't machine-friendly.
    if (!resp.ok) {
      console.warn(`Primary fetch failed (${resp.status}) for ${ips_url}`);
      statusEl.textContent = `Fetch ${resp.status} from pages; trying GitHub API fallback…`;
      try {
        const apiUrl = deriveGithubApiContentsUrl(BASE_URL) || 'https://api.github.com/repos/openhwgroup/tristan-isolde-unified-access-page/contents/ips';
        const apiResp = await fetch(apiUrl);
        if (apiResp.ok) {
          // Use the API response body as the primary 'text' source below
          const apiText = await apiResp.text();
          var text = apiText;
          // Indicate whether we used a derived API URL or the default fallback
          const usedDerived = !!deriveGithubApiContentsUrl(BASE_URL);
          updateFetchSourceBadge(
            usedDerived ?
              'Derived GitHub API ' + apiUrl :
              'Default GitHub API fallback (openhwgroup/tristan-isolde-unified-access-page)');
        } else {
          throw new Error(`API fallback fetch ${apiResp.status}`);
        }
      } catch (e) {
        // Re-throw a helpful error for the outer catch to handle and report
        throw new Error(`Failed to fetch IPS list from pages (${resp.status}) and API fallback failed: ${e.message}`);
      }
    } else {
      // Normal path: read the response text from the primary fetch
      var text = await resp.text();
      updateFetchSourceBadge('Pages listing');
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

    // If we didn't find any files via the pages listing, and we're likely
    // running on GitHub Pages, try the GitHub API fallback which reliably
    // lists repository contents (including download_url fields).
    if (finalFiles.length === 0) {
      const hostname = (window.location && window.location.hostname) ? window.location.hostname : '';
      const isGithubPages = hostname.includes('.github.io') || BASE_URL.includes('.github.io');
      if (isGithubPages) {
        try {
          statusEl.textContent = 'No files found in Pages listing — trying GitHub API fallback…';
          const derived = deriveGithubApiContentsUrl(BASE_URL);
          const apiUrl = derived || 'https://api.github.com/repos/openhwgroup/tristan-isolde-unified-access-page/contents/ips';
          const apiResp = await fetch(apiUrl);
          if (apiResp && apiResp.ok) {
            const apiJson = await apiResp.json();
            if (Array.isArray(apiJson) && apiJson.length) {
              const apiFiles = apiJson
                .filter(i => i && ((i.type === 'file') || (i.name && i.name.endsWith('.json'))))
                .map(i => ({ name: i.name, url: i.download_url || i.url || i.html_url }));
              const seenApi = new Map();
              apiFiles.forEach(f => { if (f && f.name && f.url && !seenApi.has(f.name)) seenApi.set(f.name, f.url); });
              const apiFinal = Array.from(seenApi.entries()).map(([name, url]) => ({ name, url }));
              if (apiFinal.length) {
                finalFiles = apiFinal;
                // indicate which API we used
                updateFetchSourceBadge(
                  derived ?
                    'Derived GitHub API ' + apiUrl :
                    'Default GitHub API fallback (openhwgroup/tristan-isolde-unified-access-page)');
              }
            }
          }
        } catch (e) {
          console.warn('GitHub API fallback failed', e);
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
              console.info(`Fetched ${f.name} from raw.githubusercontent fallback`);
              updateFetchSourceBadge('raw.githubusercontent.com fallback');
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
    buildTable();
    setInitialFilterSelections(parseFiltersFromQuery()); // Apply URL filters now
    statusEl.textContent = 'GitHub data loaded.';
    srStatus.textContent = `${filteredData.length} items loaded from GitHub.`;
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

function buildTable(skipPortalId = null) {
  // clear old
  thead.innerHTML = '';
  tbody.innerHTML = '';

  // colgroup, header row (unchanged)
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
  };

  visibleColumns.forEach(col => {
    const colEl = document.createElement('col');
    const w = DEFAULT_COL_WIDTHS[col];
    if (w) colEl.style.width = w;
    cg.appendChild(colEl);
  });

  const headerRow = document.createElement('tr');
  const SKIP_DROPDOWN = new Set(['Description', 'Comment']);

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
    headerBtn.textContent = col;
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
      document.querySelectorAll('.portal-dropdown').forEach(dc => {
        if (dc.id !== skipPortalId) {
          dc.remove();
        }
      });

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
      })
    )
  );

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
      } else {
        td.textContent = row[col] ?? '';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// CSV export
exportBtn.addEventListener('click', () => {
  if (!filteredData.length) return;
  const lines = [visibleColumns.join(',')];
  filteredData.forEach(r => {
    lines.push(visibleColumns.map(c => `"${(r[c]||'').toString().replace(/"/g,'""')}"`).join(','));
  });
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'table.csv'; a.click();
  URL.revokeObjectURL(url);
});

// Auto‐start GitHub mode on first load
document.addEventListener('DOMContentLoaded', () => {
  // trigger the default “github” radio
  document.querySelector('input[name="load-mode"][value="github"]')
          .dispatchEvent(new Event('change'));
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

// Ensure primary columns appear first in any visibleColumns/orderings
function reorderPrimaryFirst(arr) {
  if (!Array.isArray(arr)) return arr;
  const primaries = ['Name', 'Category', 'Project' , 'License', 'Status', 'Description'];
  const set = new Set(arr);
  const head = primaries.filter(p => set.has(p));
  const tail = arr.filter(c => !primaries.includes(c));
  return [...head, ...tail];
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
}

// When columns are derived, update visibleColumns for current view
function deriveColumns() {
  const raw = Object.keys(masterData[0]||{});
  const ordered = [];
  if (raw.includes('Name'))     ordered.push('Name');
  if (raw.includes('Category')) ordered.push('Category');
  if (raw.includes('License'))  ordered.push('License');
  if (raw.includes('Status'))  ordered.push('Status');
  if (raw.includes('Project'))  ordered.push('Project');
  if (raw.includes('Description'))  ordered.push('Description');
  raw.forEach(c => {
    if (!['Name', 'Category', 'License', 'Status', 'Project', 'Description'].includes(c)) ordered.push(c);
  });
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