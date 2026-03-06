(function() {
    'use strict';
    
    // Configuration parameters
    const CONFIG = {
        RETRY_INTERVAL: 300,           // Milliseconds between retry attempts
        MAX_RETRY_DURATION: 5000,      // Maximum time to retry before giving up
        SUCCESS_WAIT_TIME: 500         // Time to wait after successful load before stopping
    };
    
    console.log('%c[Parental Guide] Script started', 'color: purple; font-weight: bold');
    console.log('%c[Parental Guide] Config - Retry Interval: ' + CONFIG.RETRY_INTERVAL + 'ms, Max Duration: ' + CONFIG.MAX_RETRY_DURATION + 'ms, Success Wait: ' + CONFIG.SUCCESS_WAIT_TIME + 'ms', 'color: purple');
    
    let lastHash = '';
    let scriptRunning = false;
    let currentInterval = null;
    let mutationDebounceTimer = null;
    
    function cleanupOldScript() {
        console.log('%c[Parental Guide] Cleaning up old script instance...', 'color: orange');
        
        // Clear any running intervals
        if (currentInterval) {
            clearInterval(currentInterval);
            currentInterval = null;
            console.log('%c[Parental Guide] Cleared interval', 'color: orange');
        }
        
        // Clear any debounce timers
        if (mutationDebounceTimer) {
            clearTimeout(mutationDebounceTimer);
            mutationDebounceTimer = null;
        }
        
        // Remove old modal if it exists
        const oldModal = document.querySelector('.parentalGuideModal');
        if (oldModal) {
            oldModal.remove();
            console.log('%c[Parental Guide] Removed old modal', 'color: orange');
        }
        
        // Remove old rating groups if they exist
        const oldRatingGroup = document.querySelector('.detailsGroupItem.ratingGroup');
        if (oldRatingGroup) {
            oldRatingGroup.remove();
            console.log('%c[Parental Guide] Removed old rating group', 'color: orange');
        }
        
        // Remove old content warnings if they exist
        const oldContentWarnings = document.querySelector('.detailsGroupItem.contentWarningsGroup');
        if (oldContentWarnings) {
            oldContentWarnings.remove();
            console.log('%c[Parental Guide] Removed old content warnings group', 'color: orange');
        }
        
        scriptRunning = false;
        console.log('%c[Parental Guide] Cleanup complete', 'color: orange');
    }
    
    function initializeScript() {
        // Check if this is a detail page by looking at the URL hash
        const isDetailPage = window.location.hash.includes('details?id=');
        console.log('%c[Parental Guide] Checking page - Current hash: ' + window.location.hash, 'color: purple');
        console.log('%c[Parental Guide] Is detail page?', 'color: purple', isDetailPage);
        
        if (!isDetailPage) {
            console.log('%c[Parental Guide] Not a detail page, skipping initialization', 'color: orange');
            scriptRunning = false;
            return;
        }
        
        // Clean up any old instances
        cleanupOldScript();
        
        console.log('%c[Parental Guide] Detail page detected, initializing...', 'color: green');
        scriptRunning = true;
        
        // Color mapping for severity levels
        const colorMap = {
            'None': '#4CAF50',        // Green
            'Mild': '#8BC34A',        // Light Green
            'Moderate': '#FFC107',    // Amber/Yellow
            'Severe': '#cc2222'       // Red
        };
        
        function getStatusColor(status) {
            return colorMap[status] || '#999';
        }
        
        let modalInstance = null; // Store modal reference for external access
        let categoryToOpen = null; // Track which category to open
        
        function tryParseParentalGuide() {
            console.log('%c[Parental Guide] Attempting to parse parental guide...', 'color: purple');
            
            // Find the studios group
            const studiosGroup = document.querySelector('.studiosGroup');
            
            if (!studiosGroup) {
                console.warn('%c[Parental Guide] studiosGroup NOT FOUND', 'color: red');
                return false;
            }
            
            console.log('%c[Parental Guide] ✓ Found studiosGroup', 'color: green');
            
            // Find all studio links
            const studioLinks = studiosGroup.querySelectorAll('a[href*="studioId"]');
            
            if (studioLinks.length === 0) {
                console.warn('%c[Parental Guide] No studio links found', 'color: orange');
                return false;
            }
            
            console.log('%c[Parental Guide] ✓ Found', 'color: green', studioLinks.length, 'studio links');
            
            let parentalGuideData = null;
            let guideLinkElement = null;
            
            // Search through studio links for the parental guide JSON
            for (let link of studioLinks) {
                const linkText = link.textContent.trim();
                
                // Check if this link contains JSON (starts with {)
                if (linkText.startsWith('{')) {
                    console.log('%c[Parental Guide] Found parental guide JSON in link', 'color: blue');
                    
                    try {
                        parentalGuideData = JSON.parse(linkText);
                        guideLinkElement = link;
                        console.log('%c[Parental Guide] ✓ Successfully parsed JSON', 'color: green', parentalGuideData);
                        break;
                    } catch (e) {
                        console.warn('%c[Parental Guide] Failed to parse JSON:', 'color: orange', e);
                    }
                }
            }
            
            if (!parentalGuideData || !guideLinkElement) {
                console.warn('%c[Parental Guide] No parental guide data found', 'color: orange');
                return false;
            }
            
            // Hide the parental guide link element
            console.log('%c[Parental Guide] Hiding parental guide link...', 'color: blue');
            guideLinkElement.style.display = 'none';
            
            // Remove the comma and space after the guide link
            let nextNode = guideLinkElement.nextSibling;
            if (nextNode && nextNode.nodeType === Node.TEXT_NODE) {
                const textContent = nextNode.textContent;
                if (textContent.match(/^,\s+$/)) {
                    console.log('%c[Parental Guide] Removing comma and space after guide link', 'color: blue');
                    nextNode.remove();
                } else if (textContent.startsWith(', ')) {
                    console.log('%c[Parental Guide] Trimming comma and space from text node', 'color: blue');
                    nextNode.textContent = textContent.substring(2);
                }
            }
            
            // Get the parent details group
            const itemDetailsGroup = studiosGroup.closest('.itemDetailsGroup');
            
            if (!itemDetailsGroup) {
                console.warn('%c[Parental Guide] itemDetailsGroup NOT FOUND', 'color: red');
                return false;
            }
            
            // Find external links container for IMDb ID extraction
            const externalLinksContainer = document.querySelector('.externalLinks') || 
                                           document.querySelector('.itemExternalLinks');
            
            let imdbId = null;
            if (externalLinksContainer) {
                const existingIMDbLink = externalLinksContainer.querySelector('a[href*="imdb.com/title"]');
                if (existingIMDbLink) {
                    const imdbIdMatch = existingIMDbLink.href.match(/tt\d{7,8}/);
                    if (imdbIdMatch) {
                        imdbId = imdbIdMatch[0];
                        console.log('%c[Parental Guide] ✓ Extracted IMDb ID:', 'color: green', imdbId);
                    }
                }
            }
            
            // Create the rating group (same style as studios/genres)
            console.log('%c[Parental Guide] Creating rating group...', 'color: blue');
            
            const ratingGroup = document.createElement('div');
            ratingGroup.className = 'detailsGroupItem ratingGroup';
            
            const ratingLabel = document.createElement('div');
            ratingLabel.className = 'ratingLabel label';
            ratingLabel.textContent = 'Rating';
            
            const ratingContent = document.createElement('div');
            ratingContent.className = 'rating content focuscontainer-x';
            
            const guide = parentalGuideData.parentalGuide;
            
            // MPA Rating text (clickable)
            const ratingText = document.createElement('span');
            ratingText.style.color = 'inherit';
            ratingText.style.cursor = 'pointer';
            ratingText.style.fontWeight = 'bold';
            if (guide.mpaRating) {
                ratingText.textContent = `${guide.mpaRating.rating} - ${guide.mpaRating.reason}`;
            } else {
                ratingText.textContent = 'Not Rated';
            }
            
            // Info icon button
            const infoButton = document.createElement('button');
            infoButton.className = 'emby-button paper-icon-button-light';
            infoButton.style.padding = '0';
            infoButton.style.margin = '0 0 0 10px';
            infoButton.style.cursor = 'pointer';
            infoButton.style.backgroundColor = 'transparent';
            infoButton.style.border = 'none';
            infoButton.innerHTML = '&#9432;'; // ℹ symbol
            infoButton.title = 'View detailed parental guide';
            
            ratingContent.appendChild(ratingText);
            ratingContent.appendChild(infoButton);
            
            ratingGroup.appendChild(ratingLabel);
            ratingGroup.appendChild(ratingContent);
            
            // Insert rating group after studios group
            itemDetailsGroup.insertBefore(ratingGroup, studiosGroup.nextSibling);
            console.log('%c[Parental Guide] ✓ Rating group inserted', 'color: green');
            
            // Create content warning badges group
            console.log('%c[Parental Guide] Creating content warning badges...', 'color: blue');
            
            const badgesGroup = document.createElement('div');
            badgesGroup.className = 'detailsGroupItem contentWarningsGroup';
            
            const badgesLabel = document.createElement('div');
            badgesLabel.className = 'contentWarningsLabel label';
            badgesLabel.textContent = 'Content';
            
            const badgesContent = document.createElement('div');
            badgesContent.className = 'content focuscontainer-x';
            
            // Helper function to create category badges
            function createBadge(title, status, categoryIndex) {
                const badge = document.createElement('a');
                badge.className = 'button-link emby-button';
                badge.style.color = 'inherit';
                badge.style.cursor = 'pointer';
                
                const statusColor = getStatusColor(status);
                const lightColor = statusColor + '33'; // Add transparency
                
                badge.style.backgroundColor = lightColor;
                badge.style.border = `1px solid ${statusColor}`;
                badge.style.borderRadius = '4px';
                badge.style.padding = '6px 12px';
                badge.style.color = '#fff';
                badge.style.fontSize = '0.9em';
                badge.style.fontWeight = '600';
                badge.style.textAlign = 'center';
                badge.style.transition = 'all 0.2s ease';
                badge.style.display = 'inline-flex';
                badge.style.alignItems = 'center';
                badge.style.gap = '6px';
                badge.style.marginRight = '8px';
                badge.style.marginBottom = '4px';
                
                const statusDot = document.createElement('span');
                statusDot.style.width = '8px';
                statusDot.style.height = '8px';
                statusDot.style.backgroundColor = statusColor;
                statusDot.style.borderRadius = '50%';
                statusDot.style.display = 'inline-block';
                statusDot.style.flexShrink = '0';
                statusDot.style.transition = 'background-color 0.2s ease';
                
                const titleSpan = document.createElement('span');
                titleSpan.textContent = `${title}: ${status}`;
                
                badge.appendChild(statusDot);
                badge.appendChild(titleSpan);
                
                // Hover effects
                badge.addEventListener('mouseover', () => {
                    badge.style.backgroundColor = statusColor;
                    badge.style.boxShadow = `0 0 8px ${statusColor}80`;
                    badge.style.transform = 'scale(1.05)';
                    statusDot.style.backgroundColor = '#ffffff';
                });
                
                badge.addEventListener('mouseout', () => {
                    badge.style.backgroundColor = lightColor;
                    badge.style.boxShadow = 'none';
                    badge.style.transform = 'scale(1)';
                    statusDot.style.backgroundColor = statusColor;
                });
                
                // Click to open modal
                badge.addEventListener('click', () => {
                    categoryToOpen = categoryIndex;
                    if (modalInstance) {
                        modalInstance.open();
                    }
                });
                
                return badge;
            }
            
            // Add badges for each category
            const badges = [
                { title: 'Sex & Nudity', data: guide.sexAndNudity, index: 0 },
                { title: 'Violence', data: guide.violenceAndGore, index: 1 },
                { title: 'Language', data: guide.profanity, index: 2 },
                { title: 'Drugs', data: guide.alcoholDrugsSmoking, index: 3 },
                { title: 'Intense', data: guide.frighteningIntenseScenes, index: 4 }
            ];
            
            let badgesCreated = 0;
            badges.forEach(badge => {
                if (badge.data) {
                    const badgeElement = createBadge(badge.title, badge.data.status, badge.index);
                    badgesContent.appendChild(badgeElement);
                    badgesCreated++;
                }
            });
            console.log('%c[Parental Guide] ✓ Created ' + badgesCreated + ' content badges', 'color: green');
            
            badgesGroup.appendChild(badgesLabel);
            badgesGroup.appendChild(badgesContent);
            
            // Insert badges group after rating group
            itemDetailsGroup.insertBefore(badgesGroup, ratingGroup.nextSibling);
            console.log('%c[Parental Guide] ✓ Content badges group inserted', 'color: green');
            
            // Create modal
            const modal = document.createElement('div');
            modal.className = 'parentalGuideModal';
            modal.style.display = 'none';
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
            modal.style.zIndex = '10000';
            modal.style.overflow = 'auto';
            
            const modalContent = document.createElement('div');
            modalContent.style.backgroundColor = '#1a1a1a';
            modalContent.style.margin = '50px auto';
            modalContent.style.padding = '30px';
            modalContent.style.width = '90%';
            modalContent.style.maxWidth = '800px';
            modalContent.style.borderRadius = '8px';
            modalContent.style.color = '#fff';
            modalContent.style.maxHeight = '85vh';
            modalContent.style.overflow = 'auto';
            
            // Modal header
            const modalHeader = document.createElement('div');
            modalHeader.style.display = 'flex';
            modalHeader.style.justifyContent = 'space-between';
            modalHeader.style.alignItems = 'center';
            modalHeader.style.marginBottom = '20px';
            modalHeader.style.borderBottom = '2px solid #fff';
            modalHeader.style.paddingBottom = '15px';
            
            const headerLeft = document.createElement('div');
            headerLeft.style.display = 'flex';
            headerLeft.style.flexDirection = 'column';
            headerLeft.style.flex = '1';
            
            const modalTitle = document.createElement('h2');
            modalTitle.textContent = 'IMDb Parental Guide';
            modalTitle.style.margin = '0 0 8px 0';
            modalTitle.style.color = '#fff';
            
            const mpaRatingDisplay = document.createElement('div');
            if (guide.mpaRating) {
                mpaRatingDisplay.innerHTML = `<strong style="color: #ffd700; font-size: 16px;">${guide.mpaRating.rating}</strong> - ${guide.mpaRating.reason}`;
            }
            mpaRatingDisplay.style.color = '#ccc';
            mpaRatingDisplay.style.fontSize = '14px';
            
            headerLeft.appendChild(modalTitle);
            headerLeft.appendChild(mpaRatingDisplay);
            
            const headerRight = document.createElement('div');
            headerRight.style.display = 'flex';
            headerRight.style.alignItems = 'center';
            headerRight.style.gap = '10px';
            
            // Expand all button
            const expandAllButton = document.createElement('button');
            expandAllButton.className = 'emby-button paper-icon-button-light';
            expandAllButton.style.padding = '0';
            expandAllButton.style.cursor = 'pointer';
            expandAllButton.style.backgroundColor = 'transparent';
            expandAllButton.style.border = 'none';
            expandAllButton.style.color = '#fff';
            expandAllButton.innerHTML = '⊞'; // Box expand symbol
            expandAllButton.title = 'Expand all';
            
            // Collapse all button
            const collapseAllButton = document.createElement('button');
            collapseAllButton.className = 'emby-button paper-icon-button-light';
            collapseAllButton.style.padding = '0';
            collapseAllButton.style.cursor = 'pointer';
            collapseAllButton.style.backgroundColor = 'transparent';
            collapseAllButton.style.border = 'none';
            collapseAllButton.style.color = '#fff';
            collapseAllButton.innerHTML = '⊟'; // Box collapse symbol
            collapseAllButton.title = 'Collapse all';
            
            headerRight.appendChild(expandAllButton);
            headerRight.appendChild(collapseAllButton);
            
            // IMDb Parental Guide link (only if we have IMDb ID)
            if (imdbId) {
                const imdbLink = document.createElement('a');
                imdbLink.href = `https://www.imdb.com/title/${imdbId}/parentalguide/`;
                imdbLink.target = '_blank';
                imdbLink.textContent = 'View on IMDb';
                imdbLink.style.color = '#ffd700';
                imdbLink.style.textDecoration = 'none';
                imdbLink.style.padding = '8px 16px';
                imdbLink.style.backgroundColor = '#333';
                imdbLink.style.borderRadius = '4px';
                imdbLink.style.border = '1px solid #ffd700';
                imdbLink.style.cursor = 'pointer';
                imdbLink.style.transition = 'all 0.3s ease';
                imdbLink.style.fontSize = '14px';
                imdbLink.style.fontWeight = '600';
                
                imdbLink.addEventListener('mouseover', () => {
                    imdbLink.style.backgroundColor = '#ffd700';
                    imdbLink.style.color = '#000';
                });
                
                imdbLink.addEventListener('mouseout', () => {
                    imdbLink.style.backgroundColor = '#333';
                    imdbLink.style.color = '#ffd700';
                });
                
                headerRight.appendChild(imdbLink);
                console.log('%c[Parental Guide] ✓ IMDb link added', 'color: green');
            } else {
                console.warn('%c[Parental Guide] No IMDb ID found, IMDb link not added', 'color: orange');
            }
            
            const closeButton = document.createElement('button');
            closeButton.innerHTML = '&times;';
            closeButton.style.backgroundColor = 'transparent';
            closeButton.style.border = 'none';
            closeButton.style.color = '#fff';
            closeButton.style.fontSize = '32px';
            closeButton.style.cursor = 'pointer';
            closeButton.style.padding = '0';
            closeButton.style.width = '40px';
            closeButton.style.height = '40px';
            closeButton.style.display = 'flex';
            closeButton.style.alignItems = 'center';
            closeButton.style.justifyContent = 'center';
            
            headerRight.appendChild(closeButton);
            
            modalHeader.appendChild(headerLeft);
            modalHeader.appendChild(headerRight);
            console.log('%c[Parental Guide] ✓ Modal header created', 'color: green');
            
            const modalBody = document.createElement('div');
            modalBody.style.marginTop = '20px';
            
            const categorySections = [];
            
            // Helper function to create collapsible category sections
            function createCategorySection(title, data, index) {
                if (!data) return null;
                
                const statusColor = getStatusColor(data.status);
                
                const section = document.createElement('div');
                section.style.marginBottom = '15px';
                section.style.borderRadius = '4px';
                section.style.overflow = 'hidden';
                section.style.backgroundColor = '#2a2a2a';
                
                // Header (clickable)
                const header = document.createElement('div');
                header.style.padding = '15px';
                header.style.cursor = 'pointer';
                header.style.display = 'flex';
                header.style.alignItems = 'center';
                header.style.gap = '10px';
                header.style.borderLeft = '4px solid ' + statusColor;
                header.style.backgroundColor = '#2a2a2a';
                header.style.transition = 'background-color 0.3s ease';
                
                header.addEventListener('mouseover', () => {
                    header.style.backgroundColor = '#333333';
                });
                
                header.addEventListener('mouseout', () => {
                    header.style.backgroundColor = '#2a2a2a';
                });
                
                // Arrow indicator
                const arrow = document.createElement('span');
                arrow.textContent = '▼';
                arrow.style.color = statusColor;
                arrow.style.fontSize = '12px';
                arrow.style.transition = 'transform 0.3s ease';
                arrow.style.display = 'inline-block';
                arrow.style.minWidth = '12px';
                
                // Title
                const titleDiv = document.createElement('div');
                titleDiv.style.fontWeight = 'bold';
                titleDiv.style.color = statusColor;
                titleDiv.style.fontSize = '15px';
                titleDiv.textContent = title;
                
                // Status badge
                const statusBadge = document.createElement('span');
                statusBadge.textContent = data.status;
                statusBadge.style.marginLeft = 'auto';
                statusBadge.style.backgroundColor = statusColor;
                statusBadge.style.color = '#000';
                statusBadge.style.padding = '4px 12px';
                statusBadge.style.borderRadius = '12px';
                statusBadge.style.fontSize = '12px';
                statusBadge.style.fontWeight = '600';
                
                header.appendChild(arrow);
                header.appendChild(titleDiv);
                header.appendChild(statusBadge);
                
                // Content (initially hidden)
                const content = document.createElement('div');
                content.style.display = 'none';
                content.style.padding = '15px';
                content.style.backgroundColor = '#1a1a1a';
                content.style.borderTop = '1px solid #333';
                
                const itemsList = document.createElement('ul');
                itemsList.style.margin = '0';
                itemsList.style.paddingLeft = '20px';
                itemsList.style.color = '#bbb';
                itemsList.style.fontSize = '14px';
                
                if (data.items && data.items.length > 0) {
                    data.items.forEach(item => {
                        const li = document.createElement('li');
                        li.textContent = item;
                        li.style.marginBottom = '8px';
                        li.style.lineHeight = '1.5';
                        itemsList.appendChild(li);
                    });
                } else {
                    const li = document.createElement('li');
                    li.textContent = 'No specific items listed';
                    li.style.color = '#999';
                    itemsList.appendChild(li);
                }
                
                content.appendChild(itemsList);
                
                // Toggle functionality
                let isOpen = false;
                const toggleSection = () => {
                    isOpen = !isOpen;
                    content.style.display = isOpen ? 'block' : 'none';
                    arrow.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
                };
                
                header.addEventListener('click', toggleSection);
                
                section.appendChild(header);
                section.appendChild(content);
                
                // Store reference for opening/closing later
                categorySections[index] = { 
                    section,
                    header, 
                    content, 
                    arrow,
                    isOpen: () => content.style.display === 'block',
                    toggle: toggleSection
                };
                
                return section;
            }
            
            // Add all categories to modal
            const categories = [
                { title: 'Sex & Nudity', data: guide.sexAndNudity, index: 0 },
                { title: 'Violence & Gore', data: guide.violenceAndGore, index: 1 },
                { title: 'Profanity', data: guide.profanity, index: 2 },
                { title: 'Alcohol, Drugs & Smoking', data: guide.alcoholDrugsSmoking, index: 3 },
                { title: 'Frightening & Intense Scenes', data: guide.frighteningIntenseScenes, index: 4 }
            ];
            
            let categoriesCreated = 0;
            categories.forEach(cat => {
                const section = createCategorySection(cat.title, cat.data, cat.index);
                if (section) {
                    modalBody.appendChild(section);
                    categoriesCreated++;
                }
            });
            console.log('%c[Parental Guide] ✓ Created ' + categoriesCreated + ' category sections in modal', 'color: green');
            
            // Expand all functionality
            expandAllButton.addEventListener('click', () => {
                let expandedCount = 0;
                categorySections.forEach(section => {
                    if (section && !section.isOpen()) {
                        section.toggle();
                        expandedCount++;
                    }
                });
                console.log('%c[Parental Guide] Expanded ' + expandedCount + ' sections', 'color: blue');
            });
            
            // Collapse all functionality
            collapseAllButton.addEventListener('click', () => {
                let collapsedCount = 0;
                categorySections.forEach(section => {
                    if (section && section.isOpen()) {
                        section.toggle();
                        collapsedCount++;
                    }
                });
                console.log('%c[Parental Guide] Collapsed ' + collapsedCount + ' sections', 'color: blue');
            });
            
            // Spoiler notice footer
            const spoilerNotice = document.createElement('div');
            spoilerNotice.style.marginTop = '20px';
            spoilerNotice.style.padding = '10px 14px';
            spoilerNotice.style.backgroundColor = '#2a2a2a';
            spoilerNotice.style.borderRadius = '4px';
            spoilerNotice.style.borderLeft = '3px solid #ffd700';
            spoilerNotice.style.color = '#aaa';
            spoilerNotice.style.fontSize = '13px';
            spoilerNotice.innerHTML = '⚠️ Some items may be hidden because they contain spoilers. '
                + (imdbId
                    ? `<a href="https://www.imdb.com/title/${imdbId}/parentalguide/" target="_blank" style="color:#ffd700;text-decoration:none;">View full guide on IMDb</a> for the complete list.`
                    : 'Check the IMDb parental guide page for the complete list.');

            modalContent.appendChild(modalHeader);
            modalContent.appendChild(modalBody);
            modalContent.appendChild(spoilerNotice);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
            console.log('%c[Parental Guide] ✓ Modal created and appended to document', 'color: green');
            
            // Modal functionality - open modal
            function openModal() {
                modal.style.display = 'block';
                console.log('%c[Parental Guide] Modal opened', 'color: blue');
                // Auto-open the category that was clicked
                if (categoryToOpen !== null && categorySections[categoryToOpen]) {
                    const section = categorySections[categoryToOpen];
                    if (!section.isOpen()) {
                        section.toggle();
                        console.log('%c[Parental Guide] Auto-opened category index ' + categoryToOpen, 'color: blue');
                    }
                    categoryToOpen = null; // Reset after opening
                }
            }
            
            function closeModal() {
                modal.style.display = 'none';
                console.log('%c[Parental Guide] Modal closed', 'color: blue');
            }
            
            // Store modal reference for external access
            modalInstance = { open: openModal, close: closeModal };
            
            // Click handlers
            ratingText.addEventListener('click', openModal);
            infoButton.addEventListener('click', openModal);
            closeButton.addEventListener('click', closeModal);
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal();
                }
            });
            
            console.log('%c[Parental Guide] ✓ PARSING SUCCESSFUL!', 'color: green; font-weight: bold; font-size: 14px');
            
            return true;
        }
        
        function tryInjectMediaInfoRatingClick() {
            console.log('%c[Parental Guide] Attempting to add mediaInfoOfficialRating click handler...', 'color: purple');
            
            // Find the mediaInfoOfficialRating div
            const ratingDiv = document.querySelector('.mediaInfoOfficialRating');
            
            if (!ratingDiv) {
                console.warn('%c[Parental Guide] mediaInfoOfficialRating div NOT FOUND', 'color: orange');
                return false;
            }
            
            console.log('%c[Parental Guide] ✓ Found mediaInfoOfficialRating div', 'color: green');
            
            // Add click handler to open modal if it exists
            ratingDiv.style.cursor = 'pointer';
            ratingDiv.addEventListener('click', () => {
                console.log('%c[Parental Guide] mediaInfoOfficialRating clicked', 'color: blue');
                categoryToOpen = null; // Don't auto-open a category when clicking the rating
                if (modalInstance) {
                    modalInstance.open();
                }
            });
            
            console.log('%c[Parental Guide] ✓ mediaInfoOfficialRating click handler added!', 'color: green; font-weight: bold');
            
            return true;
        }
        
        console.log('%c[Parental Guide] Setting up retries...', 'color: purple');
        console.log('%c[Parental Guide] Will retry every ' + CONFIG.RETRY_INTERVAL + 'ms for up to ' + CONFIG.MAX_RETRY_DURATION + 'ms', 'color: purple');
        
        let attemptCount = 0;
        let guideFound = false;
        let mediaRatingFound = false;
        let startTime = Date.now();
        
        currentInterval = setInterval(() => {
            attemptCount++;
            const elapsedTime = Date.now() - startTime;
            
            console.log('%c[Parental Guide] Retry attempt #' + attemptCount + ' (' + elapsedTime + 'ms elapsed)', 'color: purple');
            
            if (!guideFound) {
                guideFound = tryParseParentalGuide();
                if (guideFound) {
                    console.log('%c[Parental Guide] ✓ Guide parsing successful on attempt #' + attemptCount, 'color: green; font-weight: bold');
                }
            }
            
            if (!mediaRatingFound) {
                mediaRatingFound = tryInjectMediaInfoRatingClick();
                if (mediaRatingFound) {
                    console.log('%c[Parental Guide] ✓ Media rating click handler added on attempt #' + attemptCount, 'color: green; font-weight: bold');
                }
            }
            
            // If both guides found, wait SUCCESS_WAIT_TIME then stop retrying
            if (guideFound && mediaRatingFound) {
                console.log('%c[Parental Guide] ✓ Both components found! Waiting ' + CONFIG.SUCCESS_WAIT_TIME + 'ms before stopping retries...', 'color: green; font-weight: bold');
                setTimeout(() => {
                    clearInterval(currentInterval);
                    const finalTime = Date.now() - startTime;
                    console.log('%c[Parental Guide] ✓✓✓ COMPLETE! Successfully loaded and initialized after ' + attemptCount + ' attempts in ' + finalTime + 'ms', 'color: green; font-weight: bold; font-size: 14px');
                }, CONFIG.SUCCESS_WAIT_TIME);
                return;
            }
            
            // If exceeded max retry duration, stop
            if (elapsedTime >= CONFIG.MAX_RETRY_DURATION) {
                clearInterval(currentInterval);
                console.log(`%c[Parental Guide] ⚠ Stopping retries: Exceeded max duration of ${CONFIG.MAX_RETRY_DURATION}ms after ${attemptCount} attempts`, 'color: red; font-weight: bold');
                console.log(`%c[Parental Guide] Status: Guide found: ${guideFound}, Media rating found: ${mediaRatingFound}`, 'color: orange');
            }
        }, CONFIG.RETRY_INTERVAL);
    }
    
    // Listen for hash changes
    window.addEventListener('hashchange', () => {
        const currentHash = window.location.hash;
        console.log('%c[Parental Guide] Hashchange detected to: ' + currentHash, 'color: blue');
        
        if (currentHash !== lastHash) {
            lastHash = currentHash;
            console.log('%c[Parental Guide] Hash is different from last, reinitializing...', 'color: orange');
            initializeScript();
        }
    });
    
    // Also use MutationObserver to detect DOM changes (for pages that don't trigger hashchange)
    const observer = new MutationObserver((mutations) => {
        const currentHash = window.location.hash;
        
        // Debounce mutation checks to avoid excessive reinitializations
        clearTimeout(mutationDebounceTimer);
        mutationDebounceTimer = setTimeout(() => {
            // Only reinitialize if hash has changed
            if (currentHash !== lastHash) {
                console.log('%c[Parental Guide] DOM mutation detected with new hash: ' + currentHash, 'color: cyan');
                lastHash = currentHash;
                console.log('%c[Parental Guide] Reinitializing due to hash change...', 'color: orange');
                initializeScript();
            }
        }, 500); // Wait 500ms to debounce rapid mutations
    });
    
    // Start observing the main content area for changes
    const contentArea = document.querySelector('div[role="main"]') || document.body;
    observer.observe(contentArea, {
        childList: true,
        subtree: true,
        attributes: false
    });
    console.log('%c[Parental Guide] MutationObserver started on content area', 'color: cyan');
    
    // Initial run
    console.log('%c[Parental Guide] Running initial check...', 'color: purple');
    lastHash = window.location.hash;
    initializeScript();
})();