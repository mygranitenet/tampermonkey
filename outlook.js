
// ==UserScript==
// @name         Email Thread Analysis with Gemini
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Analyze email thread with Gemini and draft a response
// @author       Your Name
// @match        *://mail.your-email-provider.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Function to create the pop-up
    function createPopup() {
        let popup = document.createElement('div');
        popup.id = 'gemini-popup';
        popup.style.position = 'fixed';
        popup.style.top = '50%';
        popup.style.left = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.padding = '20px';
        popup.style.backgroundColor = '#fff';
        popup.style.border = '1px solid #000';
        popup.style.zIndex = '1000';

        let message = document.createElement('p');
        message.textContent = 'Do you want to send this email thread to Gemini for analysis?';
        popup.appendChild(message);

        let yesButton = document.createElement('button');
        yesButton.textContent = 'Yes';
        yesButton.onclick = function() {
            popup.remove();
            sendToGemini();
        };
        popup.appendChild(yesButton);

        let noButton = document.createElement('button');
        noButton.textContent = 'No';
        noButton.onclick = function() {
            popup.remove();
        };
        popup.appendChild(noButton);

        document.body.appendChild(popup);
    }

    // Function to send email thread to Gemini
    function sendToGemini() {
        let emailThread = document.querySelector('.email-thread-selector').innerText; // Adjust the selector to match your email provider's structure
        fetch('https://api.gemini.com/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ text: emailThread })
        })
        .then(response => response.json())
        .then(data => {
            let replyBox = document.querySelector('.reply-box-selector'); // Adjust the selector to match your email provider's structure
            replyBox.value = data.draft;
        })
        .catch(error => console.error('Error:', error));
    }

    // Add event listeners to reply and reply all buttons
    document.querySelector('.reply-button-selector').addEventListener('click', createPopup); // Adjust the selector to match your email provider's structure
    document.querySelector('.reply-all-button-selector').addEventListener('click', createPopup); // Adjust the selector to match your email provider's structure
})();