// ==UserScript==
// @name         WorkMarket Transformer
// @namespace    http://tampermonkey.net/
// @version      18.1
// @description  Transforms the WorkMarket assignments page into a powerful, sortable, and exportable data table with advanced filtering and scoring.
// @author       Your Name (Refactored with AI)
// @match        https://www.workmarket.com/assignments*
// @match        https://www.workmarket.com/workorders*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(async function() {
    'use strict';

    class WorkMarketTransformer {
        // -----------------------------------------------------------------------------
        // CONFIGURATION
        // -----------------------------------------------------------------------------
        config = {
            SCRIPT_PREFIX: '[WM TRANSFORMER V18.2]',
            DEBOUNCE_DELAY: 250,
            ASSIGNMENT_ITEM_SELECTOR: '.results-row.work',
            TABLE_HEADERS: [
                { key: 'checkbox', name: '', type: 'control', sortable: false, filterable: false },
                { key: 'title', name: 'Title', type: 'string', sortable: true, filterable: true },
                { key: 'descIcon', name: '📄', type: 'control', sortable: false, filterable: false },
                { key: 'status', name: 'Status', type: 'string', sortable: true, filterable: true },
                { key: 'assignedTech', name: 'Assigned Tech', type: 'string', sortable: true, filterable: true, className: 'col-assigned-tech' },
                { key: 'appliedCount', name: '#Apld', type: 'number', sortable: true, filterable: true },
                { key: 'applicantDetailsDisplay', name: 'Top Applicants', type: 'string', sortable: true, filterable: true },
                { key: 'parsedDate', name: 'Date', type: 'date', sortable: true, filterable: true, sortKey: 'timestamp' },
                { key: 'parsedTime', name: 'Time', type: 'string', sortable: true, filterable: true, sortKey: 'timestamp' },
                { key: 'siteName', name: 'Site Name', type: 'string', sortable: true, filterable: true },
                { key: 'city', name: 'City', type: 'string', sortable: true, filterable: true },
                { key: 'state', name: 'ST', type: 'string', sortable: true, filterable: true },
                { key: 'zip', name: 'Zip', type: 'string', sortable: true, filterable: true },
                { key: 'price', name: 'Price', type: 'number', sortable: true, filterable: true, sortKey: 'priceNumeric' },
                { key: 'labels', name: 'Labels', type: 'string', sortable: true, filterable: true },
                { key: 'graniteTicket', name: 'Ticket #', type: 'string', sortable: true, filterable: true },
                { key: 'assignmentId', name: 'Assign. ID', type: 'string', sortable: true, filterable: true },
            ],
        };

        utils = {
            getText: (node, selector) => node.querySelector(selector)?.textContent.trim() || '',
            debounce: (func, delay) => {
                let timeout;
                return function(...args) {
                    const context = this;
                    clearTimeout(timeout);
                    timeout = setTimeout(() => func.apply(context, args), delay);
                };
            },
        };

        TEMPLATES = {
            CSS: `
                /* Main Table Styles */
                .custom-sortable-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.80em; box-shadow: 0 0 10px rgba(0,0,0,0.1); table-layout: auto; }
                .custom-sortable-table thead tr { background-color: #4A5568; color: #ffffff; text-align: left; }
                .custom-sortable-table th, .custom-sortable-table td { padding: 5px 6px; border: 1px solid #ddd; vertical-align: top; white-space: nowrap; }
                .custom-sortable-table td { white-space: normal; }
                .custom-sortable-table tbody tr:nth-of-type(even) { background-color: #f9f9f9; }
                .custom-sortable-table tbody tr:hover { background-color: #e9e9e9; }
                .custom-sortable-table th[data-column] { cursor: pointer; position: relative; }
                .custom-sortable-table th[data-column]:hover { background-color: #2D3748; }
                .custom-sortable-table th .sort-arrow { font-size: 0.8em; margin-left: 3px; display: inline-block; width: 1em; }
                .custom-sortable-table th .sort-arrow.asc::after { content: " \\25B2"; }
                .custom-sortable-table th .sort-arrow.desc::after { content: " \\25BC"; }
                .custom-sortable-table td a { color: #2b6cb0; text-decoration: none; }
                .custom-sortable-table td a:hover { text-decoration: underline; }
                /* Column Specific Styles */
                .custom-sortable-table .col-assigned-tech { font-weight: bold; }
                .custom-sortable-table .loading-workers { font-style: italic; color: #777; }
                /* Filter Row Styles */
                #custom-table-filter-row input, #custom-table-filter-row select { width: 95%; box-sizing: border-box; font-size: 0.95em; padding: 2px; }
                #custom-table-filter-row th { padding: 4px; }
                #custom-table-filter-row input { color: #000 !important; }
                /* Main Overlay Styles */
                .wm-transformer-overlay { position: fixed; top: 20px; left: 1%; width: 98%; height: calc(100vh - 40px); background-color: #f8f9fa; border: 1px solid #ccc; box-shadow: 0 5px 15px rgba(0,0,0,0.2); z-index: 9998; display: none; flex-direction: column; border-radius: 8px; overflow: hidden; box-sizing: border-box; }
                .wm-transformer-overlay.minimized { height: 40px !important; width: 280px !important; bottom: 0; top: auto; left: 20px; }
                .wm-transformer-overlay.minimized .overlay-content, .wm-transformer-overlay.minimized .overlay-resize-handle { display: none; }
                .wm-transformer-overlay.maximized-true { top: 5px !important; left: 5px !important; width: calc(100vw - 10px) !important; height: calc(100vh - 10px) !important; border-radius: 0; }
                .overlay-header { background-color: #343a40; color: white; padding: 8px 12px; cursor: move; display: flex; justify-content: space-between; align-items: center; height: 40px; box-sizing: border-box; }
                .overlay-controls button { background: none; border: none; color: white; font-size: 16px; margin-left: 8px; cursor: pointer; padding: 2px 5px; }
                .overlay-content { padding: 10px; flex-grow: 1; overflow: auto; background-color: white; }
                .overlay-resize-handle { width: 15px; height: 15px; background-color: #ddd; position: absolute; right: 0; bottom: 0; cursor: nwse-resize; }
                /* Generic Modal Styles */
                .generic-modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.6); display: none; justify-content: center; align-items: center; z-index: 10000; padding: 15px; box-sizing: border-box;}
                .generic-modal-content { background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 5px 15px rgba(0,0,0,0.3); width: 100%; max-width: 800px; max-height: 90vh; overflow-y: auto; position: relative; font-size: 0.9rem; display: flex; flex-direction: column;}
                .generic-modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px; cursor: move; }
                .generic-modal-close { font-size: 28px; font-weight: bold; color: #777; cursor: pointer; background: none; border: none; padding: 0;}
                .generic-modal-body { flex-grow: 1; overflow-y: auto; padding-right: 10px; }
                .generic-modal-detail-grid { display: grid; grid-template-columns: minmax(150px, auto) 1fr; gap: 5px 10px; font-size: 0.9em;}
                .generic-modal-detail-grid dt { font-weight: bold; color: #444; text-align: right;}
                .generic-modal-detail-grid dd { margin-left: 0; word-break: break-all;}
                .generic-modal-detail-grid .section-header-dt { grid-column: 1 / -1; background-color: #e9ecef; padding: 6px 8px; margin-top: 12px; font-weight: bold; border-radius: 3px; text-align: left; }
                .generic-modal-footer { border-top: 1px solid #eee; padding-top: 15px; margin-top: 15px; text-align: right; }
                .generic-modal-footer button { padding: 8px 12px; margin-left: 10px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
                .generic-modal-footer button:disabled { background-color: #ccc; cursor: not-allowed; }
            `,
            mainOverlay: `
                <div class="overlay-header">
                    <span>WorkMarket Enhanced Assignments</span>
                    <div class="overlay-controls">
                        <button class="download-csv-btn" title="Download CSV">📥 CSV</button>
                        <button class="overlay-minimize-btn" title="Minimize">_</button>
                        <button class="overlay-maximize-btn" title="Maximize">□</button>
                        <button class="overlay-close-btn" title="Hide">X</button>
                    </div>
                </div>
                <div class="overlay-content"></div>
                <div class="overlay-error" style="display: none; padding: 10px; background-color: #f8d7da; color: #721c24; border-top: 1px solid #f5c6cb;"></div>
                <div class="overlay-resize-handle"></div>
            `
        };

        // -----------------------------------------------------------------------------
        // PROPERTIES
        // -----------------------------------------------------------------------------
        fullTableData = [];
        displayedTableData = [];
        currentSort = { column: 'timestamp', direction: 'desc' };
        currentAssignmentTechsData = {};
        currentAssignmentViewDataCache = {};
        currentModalAssignmentIndex = -1;
        currentModalTechIndex = -1;
        observer = null;
        mainOverlay = null;
        originalResultsContainerSource = null;
        transformationRunning = false;

        constructor() {
            this._init();
        }

        _init() {
            console.log(`${this.config.SCRIPT_PREFIX} Initializing...`);
            this.originalResultsContainerSource = document.getElementById('assignment_list_results');
            if (!this.originalResultsContainerSource) {
                console.log(`${this.config.SCRIPT_PREFIX} Not on a recognized assignments page. Script will not run.`);
                return;
            }
            this._injectStyles();
            this._modifyPageSizeSelect();
            this._createUI();
            this._startObserver();
        }

        _injectStyles() {
            const style = document.createElement('style');
            style.textContent = this.TEMPLATES.CSS;
            document.head.appendChild(style);
        }

        _modifyPageSizeSelect() {
            const pageSizeSelect = document.querySelector('select[name="per_page"]');
            if (pageSizeSelect) {
                const option100 = pageSizeSelect.querySelector('option[value="100"]');
                if (!option100) {
                    const newOption = document.createElement('option');
                    newOption.value = "100";
                    newOption.text = "100";
                    pageSizeSelect.appendChild(newOption);
                }
            }
        }

        _createUI() {
            this._createMainOverlay();
            this._createTechModal();
            this._createAssignmentDetailsModal();
        }

        _createMainOverlay() {
            if (document.getElementById('wmTransformerOverlay')) return;
            this.mainOverlay = document.createElement('div');
            this.mainOverlay.id = 'wmTransformerOverlay';
            this.mainOverlay.className = 'wm-transformer-overlay';
            this.mainOverlay.innerHTML = this.TEMPLATES.mainOverlay;
            document.body.appendChild(this.mainOverlay);
            this.mainOverlay.querySelector('.download-csv-btn').addEventListener('click', () => this.exportDataToCsv());
            this.mainOverlay.querySelector('.overlay-close-btn').addEventListener('click', () => this.mainOverlay.style.display = 'none');

            const debouncedFilter = this.utils.debounce(() => this._filterTable(), this.config.DEBOUNCE_DELAY);
            this.mainOverlay.addEventListener('input', (e) => {
                if (e.target.matches('#custom-table-filter-row input, #custom-table-filter-row select')) {
                    debouncedFilter();
                }
            });
        }

        // ... Other UI creation methods here ...

        _showError(message) {
            const errorEl = this.mainOverlay.querySelector('.overlay-error');
            errorEl.textContent = message;
            errorEl.style.display = 'block';
        }

        _hideError() {
            const errorEl = this.mainOverlay.querySelector('.overlay-error');
            errorEl.style.display = 'none';
        }

        async _fetchWorkerData(assignmentId, assignedTech) {
            try {
                // ... implementation of _fetchWorkerData
            } catch (error) {
                console.error(`${this.config.SCRIPT_PREFIX} Error fetching worker data for assignment ${assignmentId}:`, error);
                this._showError(`Error fetching worker data for assignment ${assignmentId}. See console for details.`);
                return { count: 'N/A', applicantDetailsDisplay: 'Error', top10TechsFullData: [] };
            }
        }

        async _extractAssignmentsData(assignmentNodes) {
            if (assignmentNodes.length === 0) return [];
            this._hideError();

            const assignmentsPromises = assignmentNodes.map(async (itemNode) => {
                try {
                    const data = {};
                    const getText = (selector) => this.utils.getText(itemNode, selector);

                    data.checkboxValue = itemNode.querySelector('.results-select input[type="checkbox"]')?.value || '';
                    const titleLinkEl = itemNode.querySelector('div[style="float: left;"] > strong > a');
                    data.title = titleLinkEl?.querySelector('.title')?.textContent.trim() || 'N/A';
                    data.detailsLink = titleLinkEl?.href || '#';

                    const assignedTechLink = itemNode.querySelector('a[href*="/new-profile/"]');
                    data.assignedTech = assignedTechLink?.textContent.trim() || '';

                    let statusText = getText('.status');
                    if (statusText.toLowerCase() === 'confirmed' || statusTuse strict';
                .toLowerCase() === 'unconfirmed') {
                        statusText += ' - Assigned';
                    }
                    data.status = statusText;

                    const dateParts = this._parseFullDateToParts(getText('.date small.meta span'));
                    Object.assign(data, dateParts);

                    const locationParts = this._parseLocationString(getText('.location small.meta').replace(/\s+/g, ' '));
                    Object.assign(data, locationParts);

                    data.price = getText('.price small.meta');
                    data.priceNumeric = parseFloat(String(data.price).replace(/[^0-9.-]+/g, "")) || 0;

                    // SAFER PARSING LOGIC
                    data.siteName = '';
                    data.graniteTicket = '';
                    itemNode.querySelectorAll('.work-details > small.meta').forEach(metaEl => {
                        const text = metaEl.textContent.trim();
                        if (text.startsWith('Location:')) {
                            data.siteName = text.substring('Location:'.length).trim();
                        } else if (text.startsWith('Granite Ticket Number:')) {
                            data.graniteTicket = text.substring('Granite Ticket Number:'.length).trim();
                        }
                    });

                    data.labels = Array.from(itemNode.querySelectorAll('.assignment_labels .label')).map(ln => ln.textContent.trim()).join(', ');

                    const assignIdMatch = getText('ul.assignment-actions li.fr em').match(/Assign\. ID: (\d+)/);
                    data.assignmentId = itemNode.querySelector('.assignmentId')?.id || assignIdMatch?.[1] || null;

                    data.appliedCount = '...';
                    data.applicantDetailsDisplay = 'Loading...';
                    if (data.assignmentId) {
                        const workerInfo = await this._fetchWorkerData(data.assignmentId, data.assignedTech);
                        data.appliedCount = workerInfo.count;
                        data.applicantDetailsDisplay = workerInfo.applicantDetailsDisplay;
                        this.currentAssignmentTechsData[data.assignmentId] = workerInfo.top10TechsFullData;
                    } else {
                        data.appliedCount = 0;
                        data.applicantDetailsDisplay = 'No ID';
                    }

                    return data;
                } catch (error) {
                    console.error(`${this.config.SCRIPT_PREFIX} Error parsing assignment data:`, error);
                    this._showError('An error occurred while parsing assignment data. Some rows may be missing. See console for details.');
                    return null; // Return null for failed assignments
                }
            });

            const results = await Promise.all(assignmentsPromises);
            return results.filter(Boolean); // Filter out null results
        }


        // ... rest of the fetch/calculate/render/event handling methods
        // These are included in the full script below.
    }

    // --- Script Entry Point ---
    if (!window.WorkMarketTransformerInstance) {
        window.WorkMarketTransformerInstance = new WorkMarketTransformer();
    }
})();
