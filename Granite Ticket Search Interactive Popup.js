// ==UserScript==
// @name         Granite Ticket Search Interactive Popup (Back, Move, Close)
// @namespace    http://tampermonkey.net/
// @version      4.12
// @description  Search Smartsheet by highlighting text and open results directly from the popup, only after confirmation. Now with back button, draggable, and closable popup!
// @author       ilakskills
// @match        *://*/*
// @connect      api.smartsheet.com
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
    'use strict';

    let gtsConfirmMenuOpen = false;
    let gtsViewStack = []; // For back/forward navigation

    const SMARTSHEET_API_BASE_URL = 'https://api.smartsheet.com/2.0';
    let SMARTSHEET_API_KEY = '';

    // Strong popup CSS, draggable, floating, centered
    GM_addStyle(`
#gts-popup {
  position: fixed !important;
  z-index: 999999 !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  background: #fff !important;
  box-shadow: 0 4px 24px rgba(0,0,0,0.18) !important;
  border-radius: 12px !important;
  min-width: 400px !important;
  max-width: 90vw !important;
  font-family: system-ui,sans-serif !important;
  border: 1px solid #dee2e6 !important;
  display: block !important;
  user-select: none;
}
#gts-popup[hidden] { display: none !important; }
#gts-popup-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6; border-radius: 12px 12px 0 0; cursor: move; }
#gts-popup-title { font-size: 16px; font-weight: 600;}
#gts-popup-header-buttons { display: flex; gap: 8px;}
#gts-popup-content { padding: 18px 20px; max-height: 60vh; overflow-y: auto; }
.gts-details-table { width: 100%; margin-top: 10px; border-collapse: collapse;}
.gts-details-table th, .gts-details-table td { padding: 5px 8px; border-bottom: 1px solid #eee;}
.gts-section { margin-top: 25px; border-top: 1px solid #eee; padding-top: 20px;}
.gts-comment { margin-bottom: 10px; }
.gts-comment-header { font-size: 13px; color: #555; margin-bottom: 2px;}
.gts-spinner { border: 4px solid #f3f3f3; border-top: 4px solid #0d6efd; border-radius: 50%; width: 32px; height: 32px; animation: spin 1s linear infinite; margin: 20px auto; display: block;}
@keyframes spin { 0%{transform:rotate(0deg);} 100%{transform:rotate(360deg);} }
.gts-error { color: #842029; background: #f8d7da; border: 1px solid #f5c2c7; border-radius: 8px; padding: 10px;}
.gts-list { list-style: none; padding: 0; margin: 0; }
.gts-list li { padding: 8px 0; }
#gts-popup-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #888;}
#gts-popup-close:focus { outline: 2px solid #0d6efd;}
#gts-confirm-menu { animation: fadeIn 0.1s; }
#gts-popup-back { background: none; border: none; font-size: 22px; cursor: pointer; color: #888; margin-right: 8px;}
#gts-popup-back:focus { outline: 2px solid #0d6efd;}
@keyframes fadeIn { from {opacity:0;} to {opacity:1;} }
`);

    // Utility
    function sanitize(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : str;
        return div.innerHTML;
    }
    function linkify(text) {
        if (text == null) return '';
        const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
        return String(text).replace(urlRegex, url => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    }
    function showSpinner() {
        renderView('Loading...', '<div class="gts-spinner" aria-label="Loading"></div>', true, false);
    }

    // Popup UI
    function createPopup() {
        let popup = document.getElementById('gts-popup');
        if (popup) {
            popup.hidden = false;
            popup.style.top = "50%";
            popup.style.left = "50%";
            popup.style.transform = "translate(-50%, -50%)";
            return;
        }
        popup = document.createElement('div');
        popup.id = 'gts-popup';
        popup.setAttribute("role", "dialog");
        popup.setAttribute("aria-modal", "true");
        popup.style.top = "50%";
        popup.style.left = "50%";
        popup.style.transform = "translate(-50%, -50%)";
        popup.innerHTML = `
        <div id="gts-popup-header">
            <span id="gts-popup-title" aria-live="polite"></span>
            <div id="gts-popup-header-buttons">
                <button id="gts-popup-back" title="Back" style="display:none;">&#8592;</button>
                <button id="gts-popup-apikey" title="Manage API Key">🔑</button>
                <button id="gts-popup-close" aria-label="Close popup">&times;</button>
            </div>
        </div>
        <div id="gts-popup-content"></div>
        `;
        document.body.appendChild(popup);
        document.getElementById('gts-popup-close').onclick = closePopup;
        document.getElementById('gts-popup-apikey').onclick = manageApiKey;
        document.getElementById('gts-popup-back').onclick = goBack;
        makeDraggable(popup, document.getElementById('gts-popup-header'));
    }
    function renderView(title, html, show = true, pushToStack = true) {
        createPopup();
        // Save to view stack for Back button
        if (pushToStack) {
            let prev = {
                title: document.getElementById('gts-popup-title').textContent,
                html: document.getElementById('gts-popup-content').innerHTML
            };
            // Only push if not duplicate (prevents infinite back loop)
            if (!gtsViewStack.length || prev.html !== html) {
                gtsViewStack.push(prev);
            }
        }
        document.getElementById('gts-popup-title').textContent = title;
        document.getElementById('gts-popup-content').innerHTML = html;
        document.getElementById('gts-popup').hidden = !show;
        // Show/hide Back button
        document.getElementById('gts-popup-back').style.display = gtsViewStack.length ? '' : 'none';
    }
    function goBack() {
        if (gtsViewStack.length) {
            let prev = gtsViewStack.pop();
            // Don't push to stack again (infinite loop)
            renderView(prev.title, prev.html, true, false);
        }
        if (!gtsViewStack.length) {
            document.getElementById('gts-popup-back').style.display = 'none';
        }
    }
    function closePopup() {
        let popup = document.getElementById('gts-popup');
        if (popup) popup.hidden = true;
        gtsViewStack = [];
    }
    function makeDraggable(element, handle) {
        let isDragging = false, offsetX, offsetY;
        handle.onmousedown = function (e) {
            isDragging = true;
            let rect = element.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;
            document.body.style.userSelect = "none";
        };
        document.onmousemove = function (e) {
            if (isDragging) {
                element.style.left = e.clientX - offsetX + "px";
                element.style.top = e.clientY - offsetY + "px";
                element.style.transform = "none";
            }
        };
        document.onmouseup = function () {
            isDragging = false;
            document.body.style.userSelect = "";
        };
    }

    // API Key Management
    async function getApiKey() {
        if (!SMARTSHEET_API_KEY) {
            SMARTSHEET_API_KEY = await GM_getValue('SMARTSHEET_API_KEY', '');
        }
        return SMARTSHEET_API_KEY;
    }
    async function manageApiKey() {
        const current = await GM_getValue('SMARTSHEET_API_KEY', '');
        const input = prompt('Enter your Smartsheet API Key (leave blank to clear):', current);
        if (input === null) return;
        if (input.trim()) {
            if (!/^([a-zA-Z0-9-_]{20,})$/.test(input.trim())) {
                alert('Invalid API key format.');
                return;
            }
            await GM_setValue('SMARTSHEET_API_KEY', input.trim());
            SMARTSHEET_API_KEY = input.trim();
            alert('API key saved!');
        } else {
            await GM_setValue('SMARTSHEET_API_KEY', '');
            SMARTSHEET_API_KEY = '';
            alert('API key cleared.');
        }
    }

    // Smartsheet API
    function buildApiUrl(objectType, parentObjectId, objectId) {
        const t = (objectType || '').toUpperCase();
        if (t === 'ROW') {
            return `${SMARTSHEET_API_BASE_URL}/sheets/${parentObjectId}/rows/${objectId}?include=discussions,attachments,columns`;
        } else if (t === 'DISCUSSION') {
            return `${SMARTSHEET_API_BASE_URL}/sheets/${parentObjectId}/discussions/${objectId}?include=comments`;
        }
        return null;
    }
    function apiRequest({ url, method = 'GET', onSuccess, onError }) {
        GM_xmlhttpRequest({
            method,
            url,
            headers: { 'Authorization': `Bearer ${SMARTSHEET_API_KEY}` },
            onload: function (response) {
                if (response.status >= 200 && response.status < 300) {
                    try {
                        if (!response.responseText.trim()) throw new Error("Response body is empty.");
                        const data = JSON.parse(response.responseText);
                        onSuccess(data);
                    } catch (e) {
                        onError('Parsing Error', e.message, response.responseText);
                    }
                } else {
                    let details = '';
                    try {
                        const d = JSON.parse(response.responseText);
                        details = d.message;
                    } catch (e) {
                        details = response.responseText;
                    }
                    onError('API Error', `${response.status} - ${response.statusText}<br>${sanitize(details)}`);
                }
            },
            onerror: function () {
                onError('Network Error', 'A network error occurred while fetching details.');
            }
        });
    }

    // Details View (Row)
    function renderRowDetailsView(rowData) {
        const columnMap = rowData.columns.reduce((map, col) => ({ ...map, [col.id]: col.title }), {});
        let content = '<h4>Row Details</h4><table class="gts-details-table">';
        content += rowData.cells.filter(cell => columnMap[cell.columnId])
            .map(cell => `<tr><th>${sanitize(columnMap[cell.columnId])}</th><td>${linkify(cell.displayValue || cell.value)}</td></tr>`)
            .join('');
        content += '</table>';
        if (rowData.attachments && rowData.attachments.length > 0) {
            content += '<div class="gts-section"><h5>Attachments</h5><ul class="gts-list">' +
                rowData.attachments.map(att =>
                    `<li><a href="${sanitize(att.url)}" target="_blank" rel="noopener noreferrer">${sanitize(att.name)}</a> <small>(${sanitize(att.mimeType)})</small></li>`
                ).join('') + '</ul></div>';
        }
        if (rowData.discussions && rowData.discussions.length > 0) {
            content += '<div class="gts-section"><h5>Comments</h5>' +
                rowData.discussions.map(disc =>
                    (disc.comments || []).map(comment =>
                        `<div class="gts-comment"><div class="gts-comment-header"><strong>${sanitize(comment.createdBy?.name || '')}</strong> on ${new Date(comment.createdAt).toLocaleString()}</div><div>${linkify(comment.text)}</div></div>`
                    ).join('')
                ).join('') + '</div>';
        }
        renderView(`Row in ${sanitize(rowData.sheetName)}`, content, true, true);
    }
    function renderDiscussionDetailsView(discussionData) {
        let content = `<h4 style="margin-top:0;">Discussion: ${sanitize(discussionData.title)}</h4>` +
            (discussionData.comments && discussionData.comments.length > 0 ?
                discussionData.comments.map(comment =>
                    `<div class="gts-comment"><div class="gts-comment-header"><strong>${sanitize(comment.createdBy.name)}</strong> on ${new Date(comment.createdAt).toLocaleString()}</div><div>${linkify(comment.text)}</div></div>`
                ).join('') : '<div class="gts-message">No comments in this discussion.</div>');
        renderView(`Discussion in ${sanitize(discussionData.parentName)}`, content, true, true);
    }
    function buildResultLabel(item) {
        if (item.objectType === "row") {
            let label = sanitize(item.text || "");
            if (
                item.contextData &&
                item.contextData[0] &&
                !/^\d+$/.test(item.contextData[0].trim()) &&
                item.contextData[0].trim() !== (item.text || "").trim()
            ) {
                label += " — " + sanitize(item.contextData[0]);
            }
            label += ` (row ${item.objectId})`;
            return label;
        }
        if (item.objectType === "sheet") {
            let label = sanitize(item.text || "Untitled");
            label += ` (sheet ${item.objectId})`;
            return label;
        }
        return JSON.stringify(item).slice(0, 80);
    }
    function renderSearchResultsView(results) {
        if (!results.length) {
            renderView('No Results', '<div class="gts-message">No results found.</div>', true, true);
            return;
        }
        let html = `
            <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:1em;">
              <thead>
                <tr style="background:#f8f9fa;">
                  <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #ddd;">Label</th>
                  <th style="text-align:left; padding:6px 8px; border-bottom:1px solid #ddd;">Sheet</th>
                  <th style="padding:6px 8px; border-bottom:1px solid #ddd;">Details</th>
                </tr>
              </thead>
              <tbody>
        `;
        results.forEach((item, i) => {
            html += `
              <tr>
                <td style="padding:6px 8px; border-bottom:1px solid #f0f0f0; vertical-align:top;">${buildResultLabel(item)}</td>
                <td style="padding:6px 8px; border-bottom:1px solid #f0f0f0; vertical-align:top;">${sanitize(item.parentObjectName || '')}</td>
                <td style="padding:6px 8px; border-bottom:1px solid #f0f0f0; vertical-align:top;"><button data-index="${i}" class="gts-details-btn">Details</button></td>
              </tr>
            `;
        });
        html += '</tbody></table></div>';
        renderView('Search Results', html, true, true);

        document.querySelectorAll('.gts-details-btn').forEach(btn => {
            btn.onclick = function () {
                const idx = parseInt(this.getAttribute('data-index'), 10);
                getObjectDetails(results[idx]);
            };
        });
    }
    function getObjectDetails(r) {
        const objectType = r.objectType || r.type;
        const objectId = r.objectId || r.id;
        const parentObjectId = r.parentObjectId || r.sheetId || r.parentId;
        if (!objectType || !objectId || !parentObjectId) {
            renderView('Error', `<div class="gts-error">Missing required fields.<br><pre>${sanitize(JSON.stringify(r, null, 2))}</pre></div>`, true, true);
            return;
        }
        showSpinner();
        const url = buildApiUrl(objectType, parentObjectId, objectId);
        if (!url) {
            renderView('Unsupported Type', `<div class="gts-error">Cannot get details for object type: ${sanitize(objectType)}</div>`, true, true);
            return;
        }
        apiRequest({
            url,
            onSuccess: (data) => {
                if (objectType.toUpperCase() === 'ROW') {
                    renderRowDetailsView(data);
                } else if (objectType.toUpperCase() === 'DISCUSSION') {
                    renderDiscussionDetailsView(data);
                } else {
                    renderView('Unsupported Type', `<div class="gts-error">Cannot render details for object type: ${sanitize(objectType)}</div>`, true, true);
                }
            },
            onError: (title, message, raw = '') => {
                renderView(title, `<div class="gts-error">${sanitize(message)}${raw ? `<br><br><pre class="gts-raw-response">${sanitize(raw)}</pre>` : ''}</div>`, true, true);
            }
        });
    }
    function searchSmartsheet(q) {
        showSpinner();
        const url = `${SMARTSHEET_API_BASE_URL}/search?query=${encodeURIComponent(q)}`;
        apiRequest({
            url,
            onSuccess: (data) => {
                const results = (data.results || []);
                renderSearchResultsView(results);
            },
            onError: (title, message) => {
                renderView(title, `<div class="gts-error">${sanitize(message)}</div>`, true, true);
            }
        });
    }

    // Confirm Menu
    function getSelectionRect() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return null;
        const range = selection.getRangeAt(0).cloneRange();
        if (range.collapsed) return null;
        const rect = range.getBoundingClientRect();
        return rect;
    }
    function showConfirmSearchMenu(searchText, onConfirm) {
        if (gtsConfirmMenuOpen) return;
        gtsConfirmMenuOpen = true;

        const existing = document.getElementById('gts-confirm-menu');
        if (existing) existing.remove();

        const rect = getSelectionRect();
        if (!rect) {
            gtsConfirmMenuOpen = false;
            return;
        }

        const menu = document.createElement('div');
        menu.id = 'gts-confirm-menu';
        menu.style.position = 'fixed';
        menu.style.left = `${rect.left + window.scrollX}px`;
        menu.style.top = `${rect.bottom + window.scrollY + 8}px`;
        menu.style.background = '#fff';
        menu.style.border = '1px solid #ccc';
        menu.style.borderRadius = '8px';
        menu.style.padding = '10px 16px';
        menu.style.boxShadow = '0 2px 16px #0003';
        menu.style.zIndex = '999999';
        menu.style.fontFamily = 'system-ui,sans-serif';
        menu.style.display = 'flex';
        menu.style.alignItems = 'center';
        menu.style.gap = '10px';

        menu.innerHTML = `
          <span>Search Smartsheet for: <b>${sanitize(searchText)}</b>?</span>
          <button id="gts-confirm-search" style="margin-left:8px;">Search</button>
          <button id="gts-confirm-cancel">Cancel</button>
        `;
        document.body.appendChild(menu);

        let closed = false;
        function cleanup() {
            if (closed) return;
            closed = true;
            if (menu.parentNode) menu.parentNode.removeChild(menu);
            gtsConfirmMenuOpen = false;
        }

        menu.querySelector('#gts-confirm-search').onclick = (evt) => {
            evt.stopPropagation();
            cleanup();
            onConfirm();
        };
        menu.querySelector('#gts-confirm-cancel').onclick = (evt) => {
            evt.stopPropagation();
            cleanup();
        };
        setTimeout(() => {
            if (!closed) cleanup();
        }, 2000);
    }

    // Event: Highlight triggers confirm menu
    document.addEventListener('mouseup', async function () {
        if (window.getSelection) {
            const sel = window.getSelection().toString().trim();
            if (sel.length > 2) {
                showConfirmSearchMenu(sel, async () => {
                    if (!await getApiKey()) {
                        await manageApiKey();
                    }
                    if (await getApiKey()) {
                        searchSmartsheet(sel);
                    }
                });
            }
        }
    });

    // ESC closes popup
    document.addEventListener('keydown', e => {
        const popup = document.getElementById('gts-popup');
        if (!popup || popup.hidden) return;
        if (e.key === 'Escape') {
            closePopup();
        }
    });

})();
