
// ==UserScript==
// @name         WorkMarket Tech Specialization Insight
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Fetches tech ratings and sends to Gemini for specialization analysis, then displays it on the page.
// @match        *://www.workmarket.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const GEMINI_API_KEY = 'AIzaSyByqKL0p4UYoO8S73KXgRGrZxVJGivJ5ZM'; // Replace with your Gemini API key

    async function analyzeTechSpecialization() {
        const profile = document.querySelector('.profile-card--avatar[data-number]');
        const breakdownDiv = document.querySelector('.details');

        if (!profile || !breakdownDiv) return;

        const techId = profile.getAttribute('data-number');
        const ratingsUrl = `https://www.workmarket.com/profile/${techId}/ratings.json?sEcho=1&iColumns=5&sColumns=%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=20&mDataProp_0=0&bSortable_0=false&mDataProp_1=1&bSortable_1=false&mDataProp_2=2&bSortable_2=false&mDataProp_3=3&bSortable_3=false&mDataProp_4=4&bSortable_4=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&scopeToCompany=`;

        try {
            const ratingsRes = await fetch(ratingsUrl, {
                credentials: 'include'
            });

            const contentType = ratingsRes.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                console.warn("Expected JSON but got something else.");
                return;
            }

            const ratingsJson = await ratingsRes.json();

            const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Based on this technician's work history JSON, what type of work do they specialize in?\n\n${JSON.stringify(ratingsJson)}`
                        }]
                    }]
                })
            });

            const geminiData = await geminiRes.json();
            const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "No response from Gemini.";

            const responseDiv = document.createElement("div");
            responseDiv.style.marginTop = "10px";
            responseDiv.style.padding = "10px";
            responseDiv.style.border = "1px solid #ccc";
            responseDiv.style.backgroundColor = "#f9f9f9";
            responseDiv.innerHTML = `<strong>Gemini Insight:</strong><p>${responseText}</p>`;

            breakdownDiv.insertAdjacentElement("afterend", responseDiv);
        } catch (err) {
            console.error("Error fetching or analyzing tech data:", err);
        }
    }

    window.addEventListener('load', () => {
        setTimeout(analyzeTechSpecialization, 2000);
    });
})();
