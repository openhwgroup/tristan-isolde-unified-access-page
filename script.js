// Copyright (c) 2025 Eclipse Foundation


// Configuration
const GITHUB_API_URL =
  'https://api.github.com/repos/openhwgroup/tristan-isolde-unified-access-page/contents/ips?ref=virtual_rep_improv';
  // 'https://api.github.com/repos/openhwgroup/tristan-isolde-unified-access-page/contents/ips';
  // 'https://api.github.com/repos/cairo-caplan/tristan-isolde-unified-access-page/contents/ips?ref=virtual_rep_improv';

// Cached DOM Elements
const statusEl   = document.getElementById('status');
const exportBtn  = document.getElementById('export-btn');
const fileInput  = document.getElementById('file-input');
const loadRadios = document.querySelectorAll('input[name="load-mode"]');
const table      = document.getElementById('data-table');
const thead      = table.querySelector('thead');
const tbody      = table.querySelector('tbody');

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

// derive and reorder columns → Project, Category, then rest
function deriveColumns() {
  const raw = Object.keys(masterData[0]||{});
  const ordered = [];
  if (raw.includes('Project'))  ordered.push('Project');
  if (raw.includes('Category')) ordered.push('Category');
  raw.forEach(c => {
    if (c!=='Project' && c!=='Category') ordered.push(c);
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
  visibleColumns.forEach(() => {
    const colEl = document.createElement('col');
    cg.appendChild(colEl);
  });

  const headerRow = document.createElement('tr');
  visibleColumns.forEach(col => {
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

    const dropdownContent = document.createElement('div');
    dropdownContent.className = 'dropdown-content';

    // Only show filter options present in filteredData
    const values = filteredData.flatMap(r => {
      const v = r[col];
      return Array.isArray(v) ? v : [v];
    });
    const uniqueVals = [...new Set(values)];

    uniqueVals.forEach(val => {
      const label = document.createElement('label');
      label.style.display = 'block';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = val;
      cb.dataset.column = col;
      cb.checked = filterState[col]?.includes(val) || false; // preserve checked state
      cb.addEventListener('change', applyFilters);
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

      // Clone dropdownContent
      const portalDropdown = dropdownContent.cloneNode(true);
      portalDropdown.className = 'dropdown-content portal-dropdown';
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
        if (orig) cb.checked = orig.checked;

        // When changed, update original dropdown and apply filter
        cb.addEventListener('change', () => {
          if (orig) orig.checked = cb.checked;
          applyFilters();
        });
      });

      document.body.appendChild(portalDropdown);

      // Hide on outside click
      document.addEventListener('click', function hideDropdown(ev) {
        if (!portalDropdown.contains(ev.target) && ev.target !== dropdownBtn) {
          portalDropdown.remove();
          document.removeEventListener('click', hideDropdown);
        }
      });
    });

    // Hide dropdown when clicking outside
    document.addEventListener('click', () => {
      dropdownContent.style.display = 'none';
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
      if (col === 'URL' && row[col]) {
        const a = document.createElement('a');
        a.href = row[col];
        a.textContent = row[col];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        td.appendChild(a);
      } else {
        td.textContent = row[col] ?? '';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// CSV export (unchanged)
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

    let startX, startWidth;
    const onMouseMove = e => {
      const delta = e.pageX - startX;
      cols[i].style.width = startWidth + delta + 'px';
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    resizer.addEventListener('mousedown', e => {
      startX = e.pageX;
      startWidth = th.offsetWidth;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  });
}




const defaultColumns = ["Project", "Category", "Repository", "URL", "License", "Status"];
let viewMode = "default";
let visibleColumns = [];

function updateVisibleColumns() {
  if (viewMode === "default") {
    visibleColumns = defaultColumns.filter(col => columns.includes(col));
  } else {
    visibleColumns = [...columns];
  }
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
}

// When columns are derived, update visibleColumns for current view
function deriveColumns() {
  const raw = Object.keys(masterData[0]||{});
  const ordered = [];
  if (raw.includes('Project'))  ordered.push('Project');
  if (raw.includes('Category')) ordered.push('Category');
  raw.forEach(c => {
    if (c!=='Project' && c!=='Category') ordered.push(c);
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
