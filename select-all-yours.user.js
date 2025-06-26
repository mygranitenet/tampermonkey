// ==UserScript==
// @name         Select All "Yours"
// @namespace    http://tampermonkey.net/
// @version      0.8
// @description  Click all "Yours" radio buttons when any "Yours" radio button is clicked. Supports dynamically added radios.
// @author       ilakskills
// @match        https://www.workmarket.com/assignments/details/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Toggle this to enable debug output
    const DEBUG = false;
    const log = (...args) => { if (DEBUG) console.log('[select-all-yours]', ...args); };

    function clickAllYours() {
        log('Click function called');
        const radios = document.querySelectorAll('input[type="radio"][value="yours"]');
        radios.forEach(radio => {
            if (!radio.checked) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
                log('Clicked:', radio);
            }
        });
    }

    function handleClick(event) {
        if (event.target.matches('input[type="radio"][value="yours"]')) {
            clickAllYours();
        }
    }

    window.addEventListener('load', () => {
        document.addEventListener('click', handleClick);
        log('Event delegation attached');
    });
})();
