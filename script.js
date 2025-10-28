// Copyright (c) 2025 Eclipse Foundation


// Configuration
const GITHUB_API_URL =
  // 'https://api.github.com/repos/openhwgroup/tristan-isolde-unified-access-page/contents/ips?ref=virtual_rep_improv';
  // 'https://api.github.com/repos/openhwgroup/tristan-isolde-unified-access-page/contents/ips';
  'https://api.github.com/repos/cairo-caplan/tristan-isolde-unified-access-page/contents/ips?ref=virtual_rep_improv';

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
let filterState = {}; // { columnName: [checkedValues] }

// Add event listener for the search input
document.getElementById('search-input').addEventListener('input', e => {
  searchText = e.target.value.trim().toLowerCase();
  applyFilters();
});

// Entry Point: Handle Load-Mode Switch
loadRadios.forEach(radio => {
  radio.addEventListener('change', () => {
    resetTable();
    if (radio.value === 'github' && radio.checked) {
      fileInput.style.display = 'none';
      loadFromGitHub();
    }
    if (radio.value === 'local' && radio.checked) {
      fileInput.style.display = 'inline-block';
      statusEl.textContent = 'Select one or more local JSON files.';
    }
  });
});

// Local File Handling
fileInput.addEventListener('change', async event => {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  resetTable();
  try {
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
              const category = match ? match[1] : file.name.replace(/\.json$/i,'');
              res(Array.isArray(data)
                ? data.map(item => ({ ...item, Category: category }))
                : []);
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
    filteredData = [...masterData];
    deriveColumns();
    buildTable();
  statusEl.textContent = 'Local files loaded.';
  srStatus.textContent = `${filteredData.length} items loaded from local files.`;
    exportBtn.disabled = false;
  } catch(err) {
    statusEl.textContent = 'Error: ' + err;
    console.error(err);
  }
});

// GitHub Loading
async function loadFromGitHub() {
  try {
    statusEl.textContent = 'Fetching file list from GitHub…';
    const resp = await fetch(GITHUB_API_URL);
    if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
    const items = await resp.json();
    const jsonFiles = items.filter(i => i.type==='file' && i.name.endsWith('.json'));
    statusEl.textContent = `Found ${jsonFiles.length} remote JSONs; loading…`;

    const arrs = await Promise.all(jsonFiles.map(async f => {
      const txt = await fetch(f.download_url).then(r=>r.text());
      const data = JSON.parse(txt);
      const dotCount = (f.name.match(/\./g) || []).length;
      if (dotCount >= 2) {
        const match = f.name.match(/^.*\.(.*?)\.json$/i);
        const category = match ? match[1] : f.name.replace(/\.json$/i,'');
        return Array.isArray(data)
          ? data.map(item => ({ ...item, Category: category }))
          : [];
      } else {
        return Array.isArray(data) ? data : [];
      }
    }));

    masterData   = arrs.flat();
    filteredData = [...masterData];
    deriveColumns();
    buildTable();
  statusEl.textContent = 'GitHub data loaded.';
  srStatus.textContent = `${filteredData.length} items loaded from GitHub.`;
    exportBtn.disabled = false;
  } catch(err) {
    statusEl.textContent = 'Error: ' + err.message;
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

// derive and reorder columns → Name, Category, Project, then the rest
function deriveColumns() {
  const raw = Object.keys(masterData[0]||{});
  const ordered = [];
  if (raw.includes('Name'))     ordered.push('Name');
  if (raw.includes('Category')) ordered.push('Category');
  if (raw.includes('Project'))  ordered.push('Project');
  raw.forEach(c => {
    if (!['Name', 'Category', 'Project'].includes(c)) ordered.push(c);
  });
  columns = ordered;
}

function buildTable() {
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
    'License': '130px',
  };

  visibleColumns.forEach(col => {
    const colEl = document.createElement('col');
    const w = DEFAULT_COL_WIDTHS[col];
    if (w) colEl.style.width = w;
    cg.appendChild(colEl);
  });

  const headerRow = document.createElement('tr');
  visibleColumns.forEach((col, i) => {
    const th = document.createElement('th');
    th.style.position = 'relative';
    th.style.verticalAlign = 'top';

    // Header text
    const headerText = document.createElement('div');
    headerText.textContent = col;
    headerText.style.marginBottom = '4px';
    th.appendChild(headerText);

    // Dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'custom-dropdown';
    dropdown.tabIndex = 0;

    const dropdownBtn = document.createElement('button');
    dropdownBtn.textContent = `Filter ${col} ▼`;
    dropdownBtn.type = 'button';
    dropdownBtn.className = 'dropdown-btn';
    // Accessibility: indicate this button opens a popup and manage expanded state
    dropdownBtn.setAttribute('aria-haspopup', 'true');
    dropdownBtn.setAttribute('aria-expanded', 'false');
    const portalId = `portal-dropdown-${col.replace(/\s+/g,'_')}-${i}`;
    dropdownBtn.setAttribute('aria-controls', portalId);
    // Keyboard: allow Enter/Space to open the dropdown
    dropdownBtn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dropdownBtn.click();
      }
    });

  const dropdownContent = document.createElement('div');
  dropdownContent.className = 'dropdown-content';
  // Accessibility: mark as a popup menu for assistive tech
  dropdownContent.setAttribute('role', 'menu');
  dropdownContent.setAttribute('aria-label', `Filter ${col}`);

    // Only show filter options present in filteredData
    const values = filteredData.flatMap(r => {
      const v = r[col];
      return Array.isArray(v) ? v : [v];
    });
    const uniqueVals = [...new Set(values)];

    uniqueVals.forEach(val => {
      const label = document.createElement('label');
      label.style.display = 'block';
      label.style.padding = '6px';
      label.style.cursor = 'pointer';
      // role for the label container
      label.setAttribute('role', 'menuitem');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = val;
      cb.dataset.column = col;
      cb.checked = filterState[col]?.includes(val) || false; // preserve checked state
      // Accessibility: expose checkbox state
      cb.setAttribute('role', 'menuitemcheckbox');
      cb.setAttribute('aria-checked', cb.checked ? 'true' : 'false');
      cb.addEventListener('change', e => {
        cb.setAttribute('aria-checked', cb.checked ? 'true' : 'false');
        applyFilters(e);
      });
      label.appendChild(cb);
      label.appendChild(document.createTextNode(val));
      dropdownContent.appendChild(label);
    });

    dropdown.appendChild(dropdownBtn);
    dropdown.appendChild(dropdownContent);
    th.appendChild(dropdown);

    // Toggle dropdown visibility
    dropdownBtn.addEventListener('click', e => {
      e.stopPropagation();
      // Remove any existing portal dropdowns
      document.querySelectorAll('.portal-dropdown').forEach(dc => dc.remove());

      // Get button position
      const rect = dropdownBtn.getBoundingClientRect();

  // Clone dropdownContent and expose it as a portal dropdown
  const portalDropdown = dropdownContent.cloneNode(true);
  portalDropdown.className = 'dropdown-content portal-dropdown';
  portalDropdown.id = portalId;
      portalDropdown.style.position = 'absolute';
      portalDropdown.style.left = rect.left + 'px';
      portalDropdown.style.top = (rect.bottom + window.scrollY) + 'px';
      portalDropdown.style.zIndex = 99999;
      portalDropdown.style.display = 'block';
      portalDropdown.style.background = '#fff';
      portalDropdown.style.border = '1px solid #ccc';
      portalDropdown.style.maxHeight = '200px';
      portalDropdown.style.overflowY = 'auto';
      portalDropdown.style.width = rect.width + 'px';

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
        });
      });

      document.body.appendChild(portalDropdown);
      // Mark as expanded for assistive tech
      dropdownBtn.setAttribute('aria-expanded', 'true');

      // Hide on outside click
      document.addEventListener('click', function hideDropdown(ev) {
        if (!portalDropdown.contains(ev.target) && ev.target !== dropdownBtn) {
          portalDropdown.remove();
          dropdownBtn.setAttribute('aria-expanded', 'false');
          document.removeEventListener('click', hideDropdown);
        }
      });
    });

    // Hide dropdown when clicking outside (original inline content)
    document.addEventListener('click', () => {
      dropdownContent.style.display = 'none';
      dropdownBtn.setAttribute('aria-expanded', 'false');
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
function applyFilters() {
  // Update filterState
  filterState = {};
  const dropdowns = [
    ...thead.querySelectorAll('.custom-dropdown'),
    ...document.querySelectorAll('.portal-dropdown')
  ];
  dropdowns.forEach(dropdown => {
    const checked = Array.from(dropdown.querySelectorAll('input[type="checkbox"]:checked'));
    if (checked.length) {
      const col = checked[0].dataset.column;
      filterState[col] = checked.map(cb => cb.value);
    }
  });

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
  renderRows(filteredData);
  // Announce filter results to assistive tech
  try {
    const activeFilters = Object.entries(filterState).map(([c,vals]) => `${c}: ${vals.join(', ')}`).join('; ');
    srStatus.textContent = `${filteredData.length} results.` + (activeFilters ? ` Active filters: ${activeFilters}.` : '');
  } catch (e) {
    srStatus.textContent = `${filteredData.length} results.`;
  }
  buildTable(); // <-- ensures dropdowns are rebuilt from filteredData
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
          // If both Name and URL are present in the data set, hide the
          // URL column from the view and render the Name cell as a
          // hyperlink pointing to the URL value when available.
          if (col === 'Name') {
            const nameVal = row['Name'];
            const urlVal = row['URL'];
            if (urlVal) {
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
  const primaries = ['Name', 'Category', 'Project'];
  const set = new Set(arr);
  const head = primaries.filter(p => set.has(p));
  const tail = arr.filter(c => !primaries.includes(c));
  return [...head, ...tail];
}

const defaultColumns = ["Name", "Category", "Project", "URL", "License", "Status"];
let viewMode = "default";
let visibleColumns = [];

function updateVisibleColumns() {
  if (viewMode === "default") {
    visibleColumns = defaultColumns.filter(col => columns.includes(col));
  } else {
    visibleColumns = [...columns];
  }
  // Ensure primary ordering is respected
  visibleColumns = reorderPrimaryFirst(visibleColumns);
}

// Show/hide the view dropdown
const viewToggleBtn = document.getElementById('view-toggle-btn');
const viewToggleDropdown = document.getElementById('view-toggle-dropdown');
viewToggleBtn.addEventListener('click', e => {
  e.stopPropagation();
  viewToggleDropdown.style.display =
    viewToggleDropdown.style.display === 'block' ? 'none' : 'block';
});
document.addEventListener('click', () => {
  viewToggleDropdown.style.display = 'none';
});
viewToggleDropdown.addEventListener('click', e => e.stopPropagation());

// Handle view change
viewToggleDropdown.querySelectorAll('input[name="table-view"]').forEach(radio => {
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
  if (raw.includes('Project'))  ordered.push('Project');
  raw.forEach(c => {
    if (!['Name', 'Category', 'Project'].includes(c)) ordered.push(c);
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
