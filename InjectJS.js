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

    // ── Helpers to build small detail-page elements (still dynamic) ──────────

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
                li.textContent = item;   // textContent — safe from XSS
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

    // ── Main logic ───────────────────────────────────────────────────────────

    function initializeScript() {
        var isDetailPage = window.location.hash.includes('details?id=');
        if (!isDetailPage) {
            console.log('%c[Parental Guide] Not a detail page, skipping', 'color: orange');
            return;
        }

        console.log('%c[Parental Guide] Detail page detected, initializing…', 'color: green');

        function tryParseParentalGuide() {
            var studiosGroup = document.querySelector('.studiosGroup');
            if (!studiosGroup) return false;

            var studioLinks = studiosGroup.querySelectorAll('a[href*="studioId"]');
            if (studioLinks.length === 0) return false;

            var parentalGuideData = null;
            var guideLinkElement  = null;

            for (var i = 0; i < studioLinks.length; i++) {
                var text = studioLinks[i].textContent.trim();
                if (text.startsWith('{')) {
                    try {
                        parentalGuideData = JSON.parse(text);
                        guideLinkElement  = studioLinks[i];
                        break;
                    } catch (e) { /* skip */ }
                }
            }

            if (!parentalGuideData || !guideLinkElement) return false;

            // Hide the carrier link and clean up trailing ", "
            guideLinkElement.style.display = 'none';
            var next = guideLinkElement.nextSibling;
            if (next && next.nodeType === Node.TEXT_NODE) {
                var t = next.textContent;
                if (t.match(/^,\s+$/))       next.remove();
                else if (t.startsWith(', '))  next.textContent = t.substring(2);
            }

            var itemDetailsGroup = studiosGroup.closest('.itemDetailsGroup');
            if (!itemDetailsGroup) return false;

            // Extract IMDb ID
            var imdbId   = null;
            var extLinks = document.querySelector('.externalLinks, .itemExternalLinks');
            if (extLinks) {
                var anchor = extLinks.querySelector('a[href*="imdb.com/title"]');
                if (anchor) {
                    var m = anchor.href.match(/tt\d{7,8}/);
                    if (m) imdbId = m[0];
                }
            }

            var guide = parentalGuideData.parentalGuide;

            // ── Populate the static modal with this title's data ─────────────
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

            // ── Rating row (injected into the detail page) ───────────────────
            var ratingGroup = buildRatingGroup(guide.mpaRating);
            var ratingText  = ratingGroup.querySelector('.pg-rating-text');
            var infoButton  = ratingGroup.querySelector('.pg-info-btn');
            itemDetailsGroup.insertBefore(ratingGroup, studiosGroup.nextSibling);

            ratingText.addEventListener('click', openModal);
            infoButton.addEventListener('click', openModal);

            // ── Content-warning badges (injected into the detail page) ────────
            var badgesGroup = document.createElement('div');
            badgesGroup.className = 'detailsGroupItem contentWarningsGroup';

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

            // ── Category sections (injected into pre-existing modal body) ─────
            modalBody.innerHTML = '';   // clear any leftover from previous navigation
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

            console.log('%c[Parental Guide] ✓ PARSING SUCCESSFUL!', 'color: green; font-weight: bold; font-size: 14px');
            return true;
        }

        function tryInjectMediaInfoRatingClick() {
            var ratingDiv = document.querySelector('.mediaInfoOfficialRating');
            if (!ratingDiv) return false;

            ratingDiv.addEventListener('click', function () {
                categoryToOpen = null;
                openModal();
            });
            return true;
        }

        // ── Retry loop ──────────────────────────────────────────────────────
        var attemptCount     = 0;
        var guideFound       = false;
        var mediaRatingFound = false;
        var startTime        = Date.now();

        var interval = setInterval(function () {
            attemptCount++;
            var elapsed = Date.now() - startTime;

            if (!guideFound)       guideFound       = tryParseParentalGuide();
            if (!mediaRatingFound) mediaRatingFound = tryInjectMediaInfoRatingClick();

            if (guideFound && mediaRatingFound) {
                setTimeout(function () {
                    clearInterval(interval);
                    console.log('%c[Parental Guide] ✓✓✓ COMPLETE in ' + attemptCount + ' attempts (' + (Date.now() - startTime) + 'ms)', 'color: green; font-weight: bold; font-size: 14px');
                }, CONFIG.SUCCESS_WAIT_TIME);
                return;
            }

            if (elapsed >= CONFIG.MAX_RETRY_DURATION) {
                clearInterval(interval);
                console.log('%c[Parental Guide] ⚠ Stopped after ' + attemptCount + ' attempts (' + elapsed + 'ms)', 'color: red; font-weight: bold');
            }
        }, CONFIG.RETRY_INTERVAL);
    }

    console.log('%c[Parental Guide] Running initial check…', 'color: purple');
    initializeScript();
})();
