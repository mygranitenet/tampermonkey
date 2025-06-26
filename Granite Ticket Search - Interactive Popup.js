// ==UserScript==
// @name         Granite Ticket Search (Interactive Popup)
// @namespace    http://tampermonkey.net/
// @version      4.5
// @description  Search Smartsheet by highlighting text and open results directly from the popup.
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

    const SMARTSHEET_API_BASE_URL = 'https://api.smartsheet.com/2.0';
    let SMARTSHEET_API_KEY = '';

    GM_addStyle(`
        #gts-popup { position: fixed; z-index: 10001; top: 70px; left: 50%; transform: translateX(-50%); background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.10); border-radius: 12px; min-width: 400px; max-width: 90vw; font-family: system-ui,sans-serif; border: 1px solid #dee2e6;}
        #gts-popup-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6; border-radius: 12px 12px 0 0; cursor: move;}
        #gts-popup-title { font-size: 16px; font-weight: 600;}
        #gts-popup-header-buttons { display: flex; gap: 8px;}
        #gts-popup-content { padding: 18px 20px;}
        .gts-details-table { width: 100%; margin-top: 10px;}
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
    `);

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
        renderView('Loading...', '<div class="gts-spinner" aria-label="Loading"></div>', true);
    }

    function createPopup() {
        if (document.getElementById('gts-popup')) return;
        const popup = document.createElement('div');
        popup.id = 'gts-popup';
        popup.innerHTML = `
            <div id="gts-popup-header">
                <span id="gts-popup-title" aria-live="polite"></span>
                <div id="gts-popup-header-buttons">
                    <button id="gts-popup-apikey" title="Manage API Key">🔑</button>
                    <button id="gts-popup-close" aria-label="Close popup">&times;</button>
                </div>
            </div>
            <div id="gts-popup-content"></div>
        `;
        document.body.appendChild(popup);

        document.getElementById('gts-popup-close').onclick = closePopup;
        document.getElementById('gts-popup-apikey').onclick = manageApiKey;
        makeDraggable(popup, document.getElementById('gts-popup-header'));
    }

    function renderView(title, html, show = true) {
        createPopup();
        document.getElementById('gts-popup-title').textContent = title;
        document.getElementById('gts-popup-content').innerHTML = html;
        if (show)
            document.getElementById('gts-popup').style.display = '';
    }

    function closePopup() {
        const popup = document.getElementById('gts-popup');
        if (popup) popup.style.display = 'none';
    }

    function makeDraggable(element, handle) {
        let isDragging = false, offsetX, offsetY;
        handle.addEventListener('mousedown', startDrag);
        function startDrag(e) {
            isDragging = true;
            offsetX = e.clientX - element.offsetLeft;
            offsetY = e.clientY - element.offsetTop;
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', stopDrag);
        }
        function drag(e) {
            if (!isDragging) return;
            element.style.left = `${e.clientX - offsetX}px`;
            element.style.top = `${e.clientY - offsetY}px`;
        }
        function stopDrag() {
            isDragging = false;
            document.removeEventListener('mousemove', drag);
            document.removeEventListener('mouseup', stopDrag);
        }
    }

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

    function buildApiUrl(objectType, parentObjectId, objectId) {
        const t = objectType.toUpperCase();
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
            content += '<div class="gts-section"><h5>Discussions</h5>' +
                rowData.discussions.map(disc =>
                    `<h6>${sanitize(disc.title)}</h6>` +
                    (disc.comments.map(comment =>
                        `<div class="gts-comment"><div class="gts-comment-header"><strong>${sanitize(comment.createdBy.name)}</strong> on ${new Date(comment.createdAt).toLocaleString()}</div><div>${linkify(comment.text)}</div></div>`
                    ).join(''))
                ).join('') + '</div>';
        }
        renderView(`Row in ${sanitize(rowData.sheetName)}`, content, true);
    }

    function renderDiscussionDetailsView(discussionData) {
        let content = `<h4 style="margin-top:0;">Discussion: ${sanitize(discussionData.title)}</h4>` +
            (discussionData.comments && discussionData.comments.length > 0 ?
                discussionData.comments.map(comment =>
                    `<div class="gts-comment"><div class="gts-comment-header"><strong>${sanitize(comment.createdBy.name)}</strong> on ${new Date(comment.createdAt).toLocaleString()}</div><div>${linkify(comment.text)}</div></div>`
                ).join('') : '<div class="gts-message">No comments in this discussion.</div>');
        renderView(`Discussion in ${sanitize(discussionData.parentName)}`, content, true);
    }

    // --- NEW BUILD LABEL FUNCTION ---
    function buildResultLabel(item) {
        if (item.objectType === "row") {
            let label = sanitize(item.text || "");
            // Only show context if it's meaningful & not just an ID or empty
            if (
                item.contextData &&
                item.contextData[0] &&
                !/^\d+$/.test(item.contextData[0].trim())
            ) {
                label += " — " + sanitize(item.contextData[0]);
            }
            label += ` (row ${item.objectId})`;
            if (item.parentObjectName) {
                label += ` in ${sanitize(item.parentObjectName)}`;
            }
            return label;
        }
        if (item.objectType === "sheet") {
            let label = sanitize(item.text || "Untitled");
            label += ` (sheet ${item.objectId})`;
            return label;
        }
        // Fallback
        return JSON.stringify(item).slice(0, 80);
    }

    function renderSearchResultsView(results) {
        console.log('Smartsheet search results:', results);

        if (!results.length) {
            renderView('No Results', '<div class="gts-message">No results found.</div>');
            return;
        }
        let html = '<ul class="gts-list">';
        results.forEach((item, i) => {
            let label = buildResultLabel(item);
            html += `<li><strong>${label}</strong> <button data-index="${i}" class="gts-details-btn">Details</button></li>`;
        });
        html += '</ul>';
        renderView('Search Results', html, true);

        document.querySelectorAll('.gts-details-btn').forEach(btn => {
            btn.onclick = function () {
                const idx = parseInt(this.getAttribute('data-index'), 10);
                console.log('Clicked result item:', results[idx]);
                getObjectDetails(results[idx]);
            };
        });
    }

    function getObjectDetails(r) {
        const objectType = r.objectType || r.type;
        const objectId = r.objectId || r.id;
        const parentObjectId = r.parentObjectId || r.sheetId || r.parentId;
        if (!objectType || !objectId || !parentObjectId) {
            renderView('Error', `<div class="gts-error">Missing required fields.<br><pre>${sanitize(JSON.stringify(r, null, 2))}</pre></div>`);
            return;
        }
        showSpinner();
        const url = buildApiUrl(objectType, parentObjectId, objectId);
        if (!url) {
            renderView('Unsupported Type', `<div class="gts-error">Cannot get details for object type: ${sanitize(objectType)}</div>`, true);
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
                    renderView('Unsupported Type', `<div class="gts-error">Cannot render details for object type: ${sanitize(objectType)}</div>`);
                }
            },
            onError: (title, message, raw = '') => {
                renderView(title, `<div class="gts-error">${sanitize(message)}${raw ? `<br><br><pre class="gts-raw-response">${sanitize(raw)}</pre>` : ''}</div>`, true);
            }
        });
    }

    function searchSmartsheet(q) {
        showSpinner();
        const url = `${SMARTSHEET_API_BASE_URL}/search?query=${encodeURIComponent(q)}`;
        apiRequest({
            url,
            onSuccess: (data) => {
                const results = (data.results || []).sort((a, b) => (new Date(b.modifiedAt || 0) - new Date(a.modifiedAt || 0)));
                renderSearchResultsView(results);
            },
            onError: (title, message) => {
                renderView(title, `<div class="gts-error">${sanitize(message)}</div>`);
            }
        });
    }

    document.addEventListener('mouseup', async function () {
        if (window.getSelection) {
            const sel = window.getSelection().toString().trim();
            if (sel.length > 2) {
                if (!await getApiKey()) {
                    await manageApiKey();
                }
                if (await getApiKey()) {
                    searchSmartsheet(sel);
                }
            }
        }
    });

    document.addEventListener('keydown', e => {
        const popup = document.getElementById('gts-popup');
        if (!popup || popup.style.display === 'none') return;
        if (e.key === 'Escape') closePopup();
    });

})();
