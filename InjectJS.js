(function () {
    'use strict';

    const CONFIG = {
        RETRY_INTERVAL:    300,
        MAX_RETRY_DURATION: 5000,
        SUCCESS_WAIT_TIME:  500
    };

    const COLOR_MAP = {
        'None':     '#4CAF50',
        'Mild':     '#8BC34A',
        'Moderate': '#FFC107',
        'Severe':   '#cc2222'
    };

    function getStatusColor(status) {
        return COLOR_MAP[status] || '#999';
    }

    /** Safely escape text for innerHTML (MPA display only). */
    function esc(str) {
        var d = document.createElement('div');
        d.textContent = String(str == null ? '' : str);
        return d.innerHTML;
    }

    console.log('%c[Parental Guide] Script started', 'color: purple; font-weight: bold');

    // ── Grab the pre-injected modal from InjectHTML.html ─────────────────────
    var modal = document.getElementById('parentalGuideModal');
    if (!modal) {
        console.error('%c[Parental Guide] #parentalGuideModal not found — InjectHTML.html must be loaded first', 'color: red; font-weight: bold');
        return;
    }

    var modalBody   = modal.querySelector('.pg-modal-body');
    var closeBtn    = modal.querySelector('.pg-close-btn');
    var toggleAllBtn = modal.querySelector('.pg-toggle-all');
    var toggleAllArrow = modal.querySelector('.pg-toggle-all-arrow');
    var mpaDisplay  = modal.querySelector('.pg-mpa-display');
    var headerImdb  = modal.querySelector('.pg-header-imdb-link');
    var spoilerImdb = modal.querySelector('.pg-spoiler-imdb-link');
    var spoilerFall = modal.querySelector('.pg-spoiler-fallback');

    // ── Helpers to build small detail-page elements ──────────────────────────

    function buildRatingGroup(mpaRating) {
        var text = mpaRating
            ? mpaRating.rating + ' \u2013 ' + mpaRating.reason
            : 'Not Rated';

        var group = document.createElement('div');
        group.className = 'detailsGroupItem ratingGroup';

        var label = document.createElement('div');
        label.className = 'ratingLabel label';
        label.textContent = 'Rating';

        var content = document.createElement('div');
        content.className = 'rating content focuscontainer-x';

        var span = document.createElement('span');
        span.className = 'pg-rating-text';
        span.textContent = text;

        var btn = document.createElement('button');
        btn.className = 'emby-button paper-icon-button-light pg-info-btn';
        btn.title = 'View detailed parental guide';
        btn.innerHTML = '&#9432;';

        content.appendChild(span);
        content.appendChild(btn);
        group.appendChild(label);
        group.appendChild(content);
        return group;
    }

    function buildBadge(title, status, color) {
        var a = document.createElement('a');
        a.className = 'button-link emby-button pg-badge';
        a.style.setProperty('--pg-badge-color',       color);
        a.style.setProperty('--pg-badge-color-light', color + '33');
        a.style.setProperty('--pg-badge-shadow',      color + '80');

        var dot = document.createElement('span');
        dot.className = 'pg-badge-dot';

        var lbl = document.createElement('span');
        lbl.textContent = title + ': ' + status;

        a.appendChild(dot);
        a.appendChild(lbl);
        return a;
    }

    function buildCategorySection(title, data, color) {
        var section = document.createElement('div');
        section.className = 'pg-category-section';
        section.style.setProperty('--pg-status-color', color);

        var header = document.createElement('div');
        header.className = 'pg-category-header';

        var arrow = document.createElement('span');
        arrow.className = 'pg-category-arrow';
        arrow.textContent = '\u25BC';

        var titleDiv = document.createElement('div');
        titleDiv.className = 'pg-category-title';
        titleDiv.textContent = title;

        var badge = document.createElement('span');
        badge.className = 'pg-category-status';
        badge.textContent = data.status;

        header.appendChild(arrow);
        header.appendChild(titleDiv);
        header.appendChild(badge);

        var content = document.createElement('div');
        content.className = 'pg-category-content';

        var ul = document.createElement('ul');
        ul.className = 'pg-items-list';

        if (data.items && data.items.length > 0) {
            data.items.forEach(function (item) {
                var li = document.createElement('li');
                li.textContent = item;
                ul.appendChild(li);
            });
        } else {
            var li = document.createElement('li');
            li.className = 'pg-empty';
            li.textContent = 'No specific items listed';
            ul.appendChild(li);
        }

        content.appendChild(ul);
        section.appendChild(header);
        section.appendChild(content);
        return section;
    }

    // ── Modal open / close ───────────────────────────────────────────────────
    var categorySections = [];
    var categoryToOpen   = null;

    function openModal() {
        modal.style.display = 'block';
        if (categoryToOpen !== null && categorySections[categoryToOpen]) {
            var s = categorySections[categoryToOpen];
            if (!s.isOpen()) s.toggle();
            categoryToOpen = null;
        }
        console.log('%c[Parental Guide] Modal opened', 'color: blue');
    }

    function closeModal() {
        modal.style.display = 'none';
        console.log('%c[Parental Guide] Modal closed', 'color: blue');
    }

    function isAnyCategoryOpen() {
        return categorySections.some(function (s) { return s && s.isOpen(); });
    }

    function updateToggleAllButton() {
        if (!toggleAllBtn || !toggleAllArrow) return;
        var anyOpen = isAnyCategoryOpen();
        toggleAllArrow.textContent = anyOpen ? '\u25B2' : '\u25BC';
        toggleAllBtn.title = anyOpen ? 'Close all' : 'Open all';
        toggleAllBtn.setAttribute('aria-label', anyOpen ? 'Close all' : 'Open all');
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

    if (toggleAllBtn) {
        toggleAllBtn.addEventListener('click', function () {
            var anyOpen = isAnyCategoryOpen();
            categorySections.forEach(function (s) {
                if (!s) return;
                if (anyOpen && s.isOpen()) s.toggle();
                if (!anyOpen && !s.isOpen()) s.toggle();
            });
            updateToggleAllButton();
        });
    }

    // ── API helpers ──────────────────────────────────────────────────────────

    function getItemIdFromHash() {
        var match = window.location.hash.match(/[?&]id=([^&]+)/);
        return match ? match[1] : null;
    }

    function getApiClient() {
        if (window.ApiClient) {
            console.log('%c[Parental Guide] Using window.ApiClient', 'color: #888');
            return window.ApiClient;
        }
        if (window.Emby && window.Emby.Page && window.Emby.Page.apiClient) {
            console.log('%c[Parental Guide] Using Emby.Page.apiClient (fallback)', 'color: #888');
            return window.Emby.Page.apiClient;
        }
        return null;
    }

    function waitForApiClient(timeout) {
        return new Promise(function (resolve) {
            var client = getApiClient();
            if (client) { resolve(client); return; }

            var elapsed = 0;
            var interval = setInterval(function () {
                elapsed += 200;
                client = getApiClient();
                if (client) {
                    clearInterval(interval);
                    resolve(client);
                } else if (elapsed >= timeout) {
                    clearInterval(interval);
                    console.warn('%c[Parental Guide] ApiClient not available after ' + timeout + 'ms', 'color: red');
                    resolve(null);
                }
            }, 200);
        });
    }

    async function fetchItemData(apiClient, itemId) {
        try {
            var userId    = apiClient.getCurrentUserId();
            var serverUrl = apiClient.serverAddress();
            var token     = apiClient.accessToken();

            var url = serverUrl + '/Users/' + userId + '/Items/' + encodeURIComponent(itemId);
            console.log('%c[Parental Guide] Fetching item data: ' + url, 'color: #888');

            var response = await fetch(url, {
                headers: { 'Authorization': 'MediaBrowser Token="' + token + '"' }
            });
            if (!response.ok) {
                console.warn('%c[Parental Guide] API request failed: ' + response.status + ' ' + response.statusText, 'color: red');
                return null;
            }
            return await response.json();
        } catch (e) {
            console.warn('%c[Parental Guide] Failed to fetch item data for ' + itemId, 'color: red', e);
            return null;
        }
    }

    function extractParentalGuide(itemData) {
        var studios = itemData.Studios;
        if (!studios || !studios.length) return null;

        for (var i = 0; i < studios.length; i++) {
            var name = studios[i].Name;
            if (name && name.charAt(0) === '{') {
                try {
                    var parsed = JSON.parse(name);
                    if (parsed.parentalGuide) return { data: parsed, studioId: studios[i].Id };
                } catch (e) { /* not JSON, skip */ }
            }
        }
        return null;
    }

    // ── DOM injection (waits for page elements via retry) ────────────────────

    var currentRetryInterval = null;
    var lastProcessedId      = null;

    async function initializeScript() {
        var hash = window.location.hash;
        if (hash.indexOf('#/details') !== 0) {
            console.log('%c[Parental Guide] Not a detail page, skipping', 'color: orange');
            return;
        }

        var itemId = getItemIdFromHash();
        if (!itemId) {
            console.log('%c[Parental Guide] No item ID in URL, skipping', 'color: orange');
            return;
        }

        // Don't re-process the same item
        if (itemId === lastProcessedId) {
            console.log('%c[Parental Guide] Already processed this item, skipping', 'color: orange');
            return;
        }

        console.log('%c[Parental Guide] Detail page detected (item: ' + itemId + '), fetching data…', 'color: green');

        // ── Clean up old injected elements ───────────────────────────────────
        var oldRatingGroup = document.querySelector('.ratingGroup.pg-injected');
        if (oldRatingGroup) oldRatingGroup.remove();

        var oldBadgesGroup = document.querySelector('.contentWarningsGroup.pg-injected');
        if (oldBadgesGroup) oldBadgesGroup.remove();

        // ── Stop any existing retry interval ─────────────────────────────────
        if (currentRetryInterval) {
            clearInterval(currentRetryInterval);
            currentRetryInterval = null;
        }

        // ── Fetch data via API (no DOM dependency!) ──────────────────────────
        var apiClient = await waitForApiClient(5000);
        if (!apiClient) return;

        var itemData = await fetchItemData(apiClient, itemId);
        if (!itemData) return;

        var result = extractParentalGuide(itemData);
        if (!result) {
            console.log('%c[Parental Guide] No parental guide data in studios for this item', 'color: orange');
            return;
        }

        var parentalGuideData = result.data;
        var guideStudioId     = result.studioId;
        var guide             = parentalGuideData.parentalGuide;

        console.log('%c[Parental Guide] ✓ Parental guide data found via API', 'color: green; font-weight: bold');

        // Extract IMDb ID from ExternalUrls or ProviderIds
        var imdbId = null;
        if (itemData.ProviderIds && itemData.ProviderIds.Imdb) {
            imdbId = itemData.ProviderIds.Imdb;
        } else if (itemData.ExternalUrls) {
            for (var i = 0; i < itemData.ExternalUrls.length; i++) {
                var u = itemData.ExternalUrls[i].Url || '';
                var m = u.match(/imdb\.com\/title\/(tt\d{7,8})/);
                if (m) { imdbId = m[1]; break; }
            }
        }

        // ── Populate the modal with this title's data ────────────────────────
        if (guide.mpaRating) {
            mpaDisplay.innerHTML =
                '<strong style="color:#ffd700;font-size:16px;">' +
                esc(guide.mpaRating.rating) + '</strong> \u2013 ' +
                esc(guide.mpaRating.reason);
        }

        if (imdbId) {
            var guideUrl = 'https://www.imdb.com/title/' + encodeURIComponent(imdbId) + '/parentalguide/';
            headerImdb.href = guideUrl;
            headerImdb.style.display = '';
            spoilerImdb.href = guideUrl;
            spoilerImdb.style.display = '';
            spoilerImdb.textContent = 'View full guide on IMDb';
            if (spoilerFall) spoilerFall.style.display = 'none';
        }

        // ── Build modal category sections ────────────────────────────────────
        modalBody.innerHTML = '';
        categorySections.length = 0;

        var CATEGORY_DEFS = [
            { title: 'Sex & Nudity',                 data: guide.sexAndNudity,            index: 0 },
            { title: 'Violence & Gore',              data: guide.violenceAndGore,          index: 1 },
            { title: 'Profanity',                    data: guide.profanity,                index: 2 },
            { title: 'Alcohol, Drugs & Smoking',     data: guide.alcoholDrugsSmoking,      index: 3 },
            { title: 'Frightening & Intense Scenes', data: guide.frighteningIntenseScenes, index: 4 }
        ];

        CATEGORY_DEFS.forEach(function (cat) {
            if (!cat.data) return;
            var section = buildCategorySection(cat.title, cat.data, getStatusColor(cat.data.status));
            var header  = section.querySelector('.pg-category-header');
            var content = section.querySelector('.pg-category-content');
            var arrow   = section.querySelector('.pg-category-arrow');

            var toggle = function () {
                var open = content.style.display === 'block';
                content.style.display = open ? 'none' : 'block';
                arrow.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
                updateToggleAllButton();
            };

            header.addEventListener('click', toggle);
            categorySections[cat.index] = {
                isOpen: function () { return content.style.display === 'block'; },
                toggle: toggle
            };

            modalBody.appendChild(section);
        });

        updateToggleAllButton();

        // ── Now wait for the DOM to be ready for injection ───────────────────
        var attemptCount     = 0;
        var injectedGuide    = false;
        var injectedRating   = false;
        var startTime        = Date.now();

        currentRetryInterval = setInterval(function () {
            attemptCount++;
            var elapsed = Date.now() - startTime;

            var activePage = document.querySelector('.page:not(.hide)');
            if (!activePage) return;

            // ── Inject rating group + badges into detail page ────────────────
            if (!injectedGuide) {
                var studiosGroup = activePage.querySelector('.studiosGroup');
                if (studiosGroup) {
                    var itemDetailsGroup = studiosGroup.closest('.itemDetailsGroup');
                    if (itemDetailsGroup) {
                        // Hide the raw JSON studio link in the DOM
                        if (guideStudioId) {
                            var studioLinks = studiosGroup.querySelectorAll('a[href*="studioId"]');
                            for (var i = 0; i < studioLinks.length; i++) {
                                var txt = studioLinks[i].textContent.trim();
                                if (txt.charAt(0) === '{') {
                                    studioLinks[i].style.display = 'none';
                                    var next = studioLinks[i].nextSibling;
                                    if (next && next.nodeType === Node.TEXT_NODE) {
                                        var t = next.textContent;
                                        if (t.match(/^,\s+$/))       next.remove();
                                        else if (t.startsWith(', '))  next.textContent = t.substring(2);
                                    }
                                    break;
                                }
                            }
                        }

                        // Rating row
                        var ratingGroup = buildRatingGroup(guide.mpaRating);
                        ratingGroup.classList.add('pg-injected');
                        ratingGroup.querySelector('.pg-rating-text').addEventListener('click', openModal);
                        ratingGroup.querySelector('.pg-info-btn').addEventListener('click', openModal);
                        itemDetailsGroup.insertBefore(ratingGroup, studiosGroup.nextSibling);

                        // Content-warning badges
                        var badgesGroup = document.createElement('div');
                        badgesGroup.className = 'detailsGroupItem contentWarningsGroup pg-injected';

                        var badgesLabel = document.createElement('div');
                        badgesLabel.className = 'contentWarningsLabel label';
                        badgesLabel.textContent = 'Content';

                        var badgesContent = document.createElement('div');
                        badgesContent.className = 'content focuscontainer-x pg-badges-content';

                        badgesGroup.appendChild(badgesLabel);
                        badgesGroup.appendChild(badgesContent);

                        var BADGE_DEFS = [
                            { title: 'Sex & Nudity', data: guide.sexAndNudity,            index: 0 },
                            { title: 'Violence',     data: guide.violenceAndGore,          index: 1 },
                            { title: 'Language',     data: guide.profanity,                index: 2 },
                            { title: 'Drugs',        data: guide.alcoholDrugsSmoking,      index: 3 },
                            { title: 'Intense',      data: guide.frighteningIntenseScenes, index: 4 }
                        ];

                        BADGE_DEFS.forEach(function (def) {
                            if (!def.data) return;
                            var badge = buildBadge(def.title, def.data.status, getStatusColor(def.data.status));
                            badge.addEventListener('click', function () {
                                categoryToOpen = def.index;
                                openModal();
                            });
                            badgesContent.appendChild(badge);
                        });

                        itemDetailsGroup.insertBefore(badgesGroup, ratingGroup.nextSibling);
                        injectedGuide = true;
                        console.log('%c[Parental Guide] ✓ Rating + badges injected', 'color: green; font-weight: bold');
                    }
                }
            }

            // ── Make the official rating clickable ───────────────────────────
            if (!injectedRating) {
                var ratingDiv = activePage.querySelector('.mediaInfoOfficialRating');
                if (ratingDiv) {
                    ratingDiv.addEventListener('click', function () {
                        categoryToOpen = null;
                        openModal();
                    });
                    injectedRating = true;
                }
            }

            // ── Done? ────────────────────────────────────────────────────────
            if (injectedGuide && injectedRating) {
                lastProcessedId = itemId;
                setTimeout(function () {
                    clearInterval(currentRetryInterval);
                    currentRetryInterval = null;
                    console.log('%c[Parental Guide] ✓✓✓ COMPLETE in ' + attemptCount + ' attempts (' + (Date.now() - startTime) + 'ms)', 'color: green; font-weight: bold; font-size: 14px');
                }, CONFIG.SUCCESS_WAIT_TIME);
                return;
            }

            if (elapsed >= CONFIG.MAX_RETRY_DURATION) {
                clearInterval(currentRetryInterval);
                currentRetryInterval = null;
                if (injectedGuide || injectedRating) lastProcessedId = itemId;
                console.log('%c[Parental Guide] ⚠ Stopped after ' + attemptCount + ' attempts (' + elapsed + 'ms)' +
                    ' | guide:' + injectedGuide + ' rating:' + injectedRating, 'color: red; font-weight: bold');
            }
        }, CONFIG.RETRY_INTERVAL);
    }

    // ── Kick off ─────────────────────────────────────────────────────────────

    console.log('%c[Parental Guide] Running initial check…', 'color: purple');
    initializeScript();

    window.addEventListener('hashchange', function () {
        console.log('%c[Parental Guide] Hash changed, checking new page…', 'color: purple');
        lastProcessedId = null;
        initializeScript();
    });

    var lastHash = window.location.hash;
    setInterval(function () {
        if (window.location.hash !== lastHash) {
            lastHash = window.location.hash;
            console.log('%c[Parental Guide] Hash changed (via polling), checking new page…', 'color: purple');
            lastProcessedId = null;
            initializeScript();
        }
    }, 500);
})();
