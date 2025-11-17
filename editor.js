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
document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('editor-page');

  const GITHUB_API_URL = 'https://api.github.com/repos/openhwgroup/tristan-isolde-unified-access-page/contents/ips?ref=main';
  const CATEGORIES_URL = 'cfg/categories.json';

  const fileSelector = document.getElementById('file-selector');
  const loadBtn = document.getElementById('load-file-btn');
  const createNewBtn = document.getElementById('create-new-btn');
  const loadLocalBtn = document.getElementById('load-local-btn');
  const localFileInput = document.getElementById('local-file-input');
  const saveBtn = document.getElementById('save-json-btn');
  const projectNameInput = document.getElementById('project-name-input');
  const table = document.getElementById('data-table');
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  const tfoot = table.querySelector('tfoot');

  let currentData = [];
  let allowedCategories = [];
  const schemaColumns = ["Name", "Category", "URL", "License", "Status", "Description", "WI", "Partners", "Comment"];

  // --- INITIALIZATION ---

  async function initialize() {
    await Promise.all([
      loadCategories(),
      populateFileSelector()
    ]);
  }

  async function loadCategories() {
    try {
      const response = await fetch(CATEGORIES_URL);
      allowedCategories = await response.json();
    } catch (error) {
      console.error('Failed to load categories:', error);
      alert('Error: Could not load categories configuration.');
    }
  }

  async function populateFileSelector() {
    try {
      const response = await fetch(GITHUB_API_URL);
      const items = await response.json();
      const jsonFiles = items.filter(i => i.type === 'file' && i.name.endsWith('.json'));

      jsonFiles.forEach(file => {
        const option = document.createElement('option');
        option.value = file.download_url;
        option.textContent = file.name;
        fileSelector.appendChild(option);
      });
    } catch (error) {
      console.error('Failed to load file list from GitHub:', error);
    }
  }

  // --- DATA HANDLING ---

  async function loadFileData(url) {
    try {
      const response = await fetch(url);
      currentData = await response.json();
      if (currentData.length > 0 && currentData[0].Project) {
        projectNameInput.value = currentData[0].Project;
      } else {
        projectNameInput.value = '';
      }
      renderTable();
      saveBtn.disabled = false;
      projectNameInput.disabled = false;
    } catch (error) {
      console.error('Failed to load or parse JSON file:', error);
      alert('Error loading file. Please check the console for details.');
    }
  }

  function createNewFile() {
    projectNameInput.value = '';
    projectNameInput.disabled = false;
    projectNameInput.focus();
    currentData = [{}]; // Start with one empty row
    renderTable();
    saveBtn.disabled = false;
  }

  function addRow() {
    currentData.push({});
    renderTable();
  }

  function insertRowBelow(index) {
    currentData.splice(index + 1, 0, {});
    renderTable();
  }

  function deleteRow(index) {
    if (currentData.length === 1) {
      // If it's the last row, just clear its data instead of deleting it.
      currentData[index] = {};
    } else {
      // Otherwise, delete the row.
      currentData.splice(index, 1);
    }
    renderTable();
  }

  function updateData(index, key, value) {
    // For keys that should be arrays, split by comma
    if (['WI', 'Partners', 'Category'].includes(key)) {
      currentData[index][key] = value.split(',').map(s => s.trim()).filter(Boolean);
    } else {
      currentData[index][key] = value;
    }
  }

  function saveFile() {
    const projectName = projectNameInput.value.trim();
    if (!projectName) {
      alert('Please enter a Project Name before saving.');
      projectNameInput.focus();
      return;
    }

    // --- Validation for "Name" field ---
    const seenNames = new Set();
    for (let i = 0; i < currentData.length; i++) {
      const row = currentData[i];
      const name = (row.Name || '').trim();

      // 1. Check for empty names
      if (!name) {
        alert(`Error: The "Name" field in row ${i + 1} cannot be empty.`);
        return; // Stop the save process
      }

      // 2. Check for duplicate names
      if (seenNames.has(name)) {
        alert(`Error: Duplicate "Name" found: "${name}". All names must be unique.`);
        return; // Stop the save process
      }
      seenNames.add(name);
    }

    const outputOrder = ["Name", "URL", "License", "Status", "Description", "Project", "WI", "Partners", "Comment", "Category"];

    // Add the project name to every entry
    const dataToSave = currentData.map(row => {
      const newRow = { Project: projectName };
      outputOrder.forEach(key => {
        if (key !== 'Project') {
          // Ensure all keys exist, defaulting to empty string or empty array
          if (['WI', 'Partners', 'Category'].includes(key)) {
            newRow[key] = row[key] || [];
          } else {
            newRow[key] = row[key] || '';
          }
        }
      });
      return newRow;
    });

    const jsonString = JSON.stringify(dataToSave, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- RENDERING ---

  function renderTable() {
    // Clear existing content
    thead.innerHTML = '';
    tbody.innerHTML = '';
    tfoot.innerHTML = '';

    // Render Header
    const headerRow = document.createElement('tr');
    const actionsHeader = document.createElement('th');
    actionsHeader.className = 'row-actions-cell';
    headerRow.appendChild(actionsHeader);

    schemaColumns.forEach(col => {
      const th = document.createElement('th');
      th.textContent = col;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    makeResizable(headerRow);

    // Render Body Rows
    currentData.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');

      // Add cell for hover actions
      const actionTd = document.createElement('td');
      actionTd.className = 'row-actions-cell';
      actionTd.innerHTML = `<div class="row-actions-container"><button class="row-action-btn add" title="Insert row below" onclick="window.insertRowBelow(${rowIndex})">+</button><button class="row-action-btn delete" title="Delete this row" onclick="window.deleteRow(${rowIndex})">-</button></div>`;
      tr.appendChild(actionTd);

      schemaColumns.forEach(key => {
        const td = document.createElement('td');
        const value = row[key] || '';

        if (key === 'Category') {
          // Create a custom multi-select combobox
          const container = document.createElement('div');
          container.className = 'category-combobox-container';

          const input = document.createElement('input');
          input.type = 'text';
          input.value = Array.isArray(value) ? value.join(', ') : value;
          input.dataset.index = rowIndex;
          input.dataset.key = key;
          container.appendChild(input);

          const dropdown = document.createElement('div');
          dropdown.className = 'category-dropdown';

          allowedCategories.forEach(category => {
            const option = document.createElement('div');
            option.textContent = category.name;
            option.className = 'category-option';
            option.addEventListener('mousedown', (e) => {
              e.preventDefault(); // Prevent input from losing focus
              const currentValues = input.value.split(',').map(s => s.trim()).filter(Boolean);
              if (!currentValues.includes(category.name)) {
                currentValues.push(category.name);
                input.value = currentValues.join(', ') + ', '; // Add comma for next entry
                // Manually trigger the input event to update the data model
                input.dispatchEvent(new Event('input', { bubbles: true }));
                // Set focus and move cursor to the end of the input
                input.focus();
                const end = input.value.length;
                input.setSelectionRange(end, end);
              }
            });
            dropdown.appendChild(option);
          });

          container.appendChild(dropdown);
          td.appendChild(container);

          input.addEventListener('focus', () => {
            dropdown.style.display = 'block';
          });

          input.addEventListener('blur', () => {
            // Delay hiding to allow click on dropdown options
            setTimeout(() => {
              dropdown.style.display = 'none';
            }, 150);
          });

          input.addEventListener('input', () => {
            const filterText = input.value.split(',').pop().trim().toLowerCase();
            dropdown.querySelectorAll('.category-option').forEach(opt => {
              opt.style.display = opt.textContent.toLowerCase().includes(filterText) ? 'block' : 'none';
            });
          });
        } else {
          const input = document.createElement('input');
          input.type = 'text';
          input.value = Array.isArray(value) ? value.join(', ') : value;
          input.dataset.index = rowIndex;
          input.dataset.key = key;
          td.appendChild(input);
        }
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  // Expose functions to global scope so inline onclick handlers can find them
  window.insertRowBelow = insertRowBelow;
  window.deleteRow = deleteRow;

  // --- EVENT LISTENERS ---

  loadBtn.addEventListener('click', () => {
    const selectedUrl = fileSelector.value;
    if (selectedUrl) {
      loadFileData(selectedUrl);
    } else {
      alert('Please select a file to load.');
    }
  });

  createNewBtn.addEventListener('click', createNewFile);
  saveBtn.addEventListener('click', saveFile);
  loadLocalBtn.addEventListener('click', () => localFileInput.click());

  localFileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        currentData = Array.isArray(data) ? data : [data];
        if (currentData.length > 0 && currentData[0].Project) {
          projectNameInput.value = currentData[0].Project;
        }
        renderTable();
        saveBtn.disabled = false;
        projectNameInput.disabled = false;
      } catch (err) {
        alert(`Error parsing JSON file: ${err.message}`);
      }
    };
    reader.readAsText(file);
  });

  // Use 'input' for text fields to update data instantly on every keystroke.
  // Use 'change' for select dropdowns.
  tbody.addEventListener('input', (e) => {
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
      const { index, key } = target.dataset;
      updateData(parseInt(index, 10), key, target.value);
    }
  });

  // --- START ---
  initialize();
});

function makeResizable(headerRow) {
  const table = headerRow.closest('table');
  let cg = table.querySelector('colgroup');
  if (!cg) {
    cg = document.createElement('colgroup');
    table.insertBefore(cg, headerRow.parentElement);
  }
  cg.innerHTML = ''; // Clear existing colgroup

  const ths = Array.from(headerRow.children);
  ths.forEach(() => cg.appendChild(document.createElement('col')));
  const cols = Array.from(cg.children);

  ths.forEach((th, i) => {
    if (i === ths.length - 1) return; // No resizer on the last column

    const resizer = document.createElement('div');
    resizer.className = 'resizer';
    th.appendChild(resizer);

    resizer.tabIndex = 0;
    resizer.setAttribute('role', 'separator');
    resizer.setAttribute('aria-label', `Resize ${th.textContent}`);

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

    resizer.addEventListener('pointerdown', e => {
      e.preventDefault();
      startX = e.pageX || e.clientX;
      startWidth = th.offsetWidth;
      try { resizer.setPointerCapture && resizer.setPointerCapture(e.pointerId); } catch(_) {}
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    });

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
