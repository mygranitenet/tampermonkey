// ==UserScript==
// @name         WorkMarket Table Enhancements
// @namespace    http://tampermonkey.net/
// @version      10
// @description  Adds Copy CSV & Refresh buttons and fixes the minimized button container on WorkMarket.
// @author       mygranitenet (revised by AI)
// @match        https://www.workmarket.com/assignments*
// @match        https://www.workmarket.com/workorders*
// @grant        GM_setClipboard
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // --- FIX: Make the button container bigger in minimized/responsive view ---
    // This injects CSS to prevent the "Download CSV" button (and our new buttons)
    // from being hidden when the browser window is not maximized.
    // You can change "50px" to a larger number if you need more space.
    GM_addStyle(`
        .dataTables_wrapper .row:first-child .col-sm-6 {
            min-height: 50px !important;
        }
    `);

    // --- Configuration ---
const tableSelector = '#customAssignmentsTable_overlay';

    // --- Utility: Convert HTML Table to CSV ---
    function tableToCSV(table) {
        let csv = [];
        const rows = table.querySelectorAll('tr');
        for (const row of rows) {
            let vals = [];
            const cells = row.querySelectorAll('th, td');
            for (const cell of cells) {
                let text = (cell.innerText || cell.textContent || '').replace(/"/g, '""');
                vals.push('"' + text.trim() + '"');
            }
            csv.push(vals.join(','));
        }
        return csv.join('\n');
    }

    // --- UI: Add "Copy CSV" and "Refresh" buttons next to the table's "Download CSV" ---
    function addTableActionButtons() {
        // The "Download CSV" button is our anchor. If it doesn't exist, we can't add our buttons.
        const downloadBtn = document.querySelector('.download-csv-btn');
        if (!downloadBtn) {
            return false; // Indicate failure so the interval keeps trying
        }

        // Add "Copy CSV" Button (if it doesn't already exist)
        if (!document.querySelector('.copy-csv-btn')) {
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn btn-default btn-sm copy-csv-btn';
            copyBtn.title = 'Copy table data as CSV to clipboard';
            copyBtn.innerHTML = '📋 Copy CSV';
            copyBtn.style.marginLeft = '8px';
            copyBtn.onclick = function() {
                const table = document.querySelector(tableSelector);
                if (!table) return alert('Data table not found.');
                GM_setClipboard(tableToCSV(table));
                alert('Table data copied to clipboard!');
            };
            downloadBtn.parentNode.insertBefore(copyBtn, downloadBtn.nextSibling);
        }

        // Add "Refresh" (Full Page Reload) Button (if it doesn't already exist)
        if (!document.querySelector('.refresh-table-btn')) {
            const refreshBtn = document.createElement('button');
            refreshBtn.className = 'btn btn-default btn-sm refresh-table-btn';
            refreshBtn.title = 'Reload the page to get the latest table data';
            refreshBtn.innerHTML = '🔄 Refresh';
            refreshBtn.style.marginLeft = '8px';
            refreshBtn.onclick = function() {
                location.reload();
            };
            const copyBtn = document.querySelector('.copy-csv-btn');
            if (copyBtn) {
                 copyBtn.parentNode.insertBefore(refreshBtn, copyBtn.nextSibling);
            }
        }

        return true; // Indicate success
    }

    // --- Initialization ---
    // This loop will run every second until it successfully finds the "Download CSV"
    // button and adds our new buttons next to it.
    const initInterval = setInterval(() => {
        // The function returns 'true' on success.
        if (addTableActionButtons()) {
            // Once the buttons are added, we don't need to check anymore.
            clearInterval(initInterval);
        }
    }, 1000);

})();
