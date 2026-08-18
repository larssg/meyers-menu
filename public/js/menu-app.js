// Constants
const TOAST_DURATION = 1800;
const AUTO_REFRESH_INTERVAL = 3600000; // 1 hour
const BASE_URL = window.location.origin;

// Current state
let currentMenuMode = 'simple';
let menuData = null;
let isInitializing = false;

// URL Codec Class
class MenuUrlCodec {
    static DAY_CHARS = {
        1: 'M', // Monday
        2: 'T', // Tuesday
        3: 'W', // Wednesday
        4: 'R', // Thursday
        5: 'F'  // Friday
    };

    static CHAR_TO_DAY = {
        'M': 1, // Monday
        'T': 2, // Tuesday
        'W': 3, // Wednesday
        'R': 4, // Thursday
        'F': 5  // Friday
    };

    static DEFAULT_MENU_SLUG = 'det-velkendte';

    static parseUrl() {
        const params = new URLSearchParams(window.location.search);
        return {
            mode: params.get('mode'),
            menu: params.get('menu'),
            config: params.get('config'),
            alarm: params.get('alarm') === 'true'
        };
    }

    static buildUrl(state) {
        const params = new URLSearchParams();

        if (state.mode === 'simple') {
            // Only add menu parameter if not default
            if (state.menuSlug && state.menuSlug !== this.DEFAULT_MENU_SLUG) {
                params.set('menu', state.menuSlug);
            }
        } else {
            params.set('mode', 'custom');
            if (state.config) {
                params.set('config', state.config);
            }
        }

        if (state.alarm) {
            params.set('alarm', 'true');
        }

        const paramString = params.toString();
        return paramString ? `${window.location.pathname}?${paramString}` : window.location.pathname;
    }

    static encodeCustomConfig(dayMenuMap) {
        const config = [];

        Object.entries(dayMenuMap).forEach(([dayOfWeek, menuTypeId]) => {
            const dayChar = this.DAY_CHARS[parseInt(dayOfWeek)];
            if (dayChar && menuTypeId) {
                config.push(dayChar + menuTypeId);
            }
        });

        return config.join('');
    }

    static decodeCustomConfig(configString) {
        const dayMenuMap = {};

        if (!configString) return dayMenuMap;

        const matches = configString.match(/([MTWRF])(\d+)/g);
        if (matches) {
            matches.forEach(match => {
                const dayChar = match[0];
                const menuTypeId = match.substring(1);
                const dayOfWeek = this.CHAR_TO_DAY[dayChar];

                if (dayOfWeek) {
                    dayMenuMap[dayOfWeek] = menuTypeId;
                }
            });
        }

        return dayMenuMap;
    }

    static getDayChar(dayOfWeek) {
        return this.DAY_CHARS[dayOfWeek] || null;
    }

    static getDayOfWeek(dayChar) {
        return this.CHAR_TO_DAY[dayChar] || null;
    }
}

// Helper functions
function $(id) {
    return document.getElementById(id);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        const existing = $('copy-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'copy-toast';
        toast.textContent = 'Copied to clipboard';
        toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 ' +
            'rounded-sm bg-ink text-cream font-mono text-[11px] uppercase tracking-[0.18em] shadow-lg';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), TOAST_DURATION);
    });
}

function formatDate(dateStr) {
    const date = new Date(dateStr + 'T12:00:00');
    return {
        dayName: date.toLocaleDateString('en-US', {weekday: 'short'}),
        dayNumber: date.getDate(),
        monthName: date.toLocaleDateString('en-US', {month: 'short'})
    };
}

// URL Parameter handling
function updateUrlParameters() {
    if (isInitializing) return; // Don't update URL during initialization

    const state = {
        mode: currentMenuMode,
        alarm: false
    };

    if (currentMenuMode === 'simple') {
        const simpleSelect = $('simpleMenuSelect');
        if (simpleSelect && simpleSelect.value) {
            const selectedOption = simpleSelect.selectedOptions[0];
            state.menuSlug = selectedOption.getAttribute('data-slug');
        }
    } else {
        // Custom mode
        const daySelects = document.querySelectorAll('.custom-day-select');
        const dayMenuMap = {};

        daySelects.forEach(select => {
            const dayOfWeek = parseInt(select.getAttribute('data-day'));
            const menuTypeId = select.value;

            if (menuTypeId && menuTypeId !== '') {
                dayMenuMap[dayOfWeek] = menuTypeId;
            }
        });

        state.config = MenuUrlCodec.encodeCustomConfig(dayMenuMap);
    }

    // Add alarm parameter if checkbox is checked
    const alarmCheckbox = $('alarmCheckbox');
    if (alarmCheckbox && alarmCheckbox.checked) {
        state.alarm = true;
    }

    // Update URL without reloading the page
    const newUrl = MenuUrlCodec.buildUrl(state);
    window.history.replaceState({}, '', newUrl);
}

function loadFromUrlParameters() {
    if (!menuData) return;

    isInitializing = true;
    const params = MenuUrlCodec.parseUrl();

    // Set mode
    if (params.mode === 'custom') {
        currentMenuMode = 'custom';
        const customRadio = document.querySelector('input[name="menuMode"][value="custom"]');
        if (customRadio) {
            customRadio.checked = true;
        }
    } else {
        currentMenuMode = 'simple';
        const simpleRadio = document.querySelector('input[name="menuMode"][value="simple"]');
        if (simpleRadio) {
            simpleRadio.checked = true;
        }
    }

    // Update mode visibility
    toggleMenuMode();

    // Set selections based on mode
    if (currentMenuMode === 'simple' && params.menu) {
        const simpleSelect = $('simpleMenuSelect');
        if (simpleSelect) {
            // Find option with matching slug
            const options = simpleSelect.querySelectorAll('option');
            for (const option of options) {
                if (option.getAttribute('data-slug') === params.menu) {
                    simpleSelect.value = option.value;
                    break;
                }
            }
        }
    } else if (currentMenuMode === 'custom' && params.config) {
        // Parse config string like "M1T1W1R2F1"
        const dayMenuMap = MenuUrlCodec.decodeCustomConfig(params.config);

        Object.entries(dayMenuMap).forEach(([dayOfWeek, menuTypeId]) => {
            const daySelect = document.querySelector(`select[data-day="${dayOfWeek}"]`);
            if (daySelect) {
                daySelect.value = menuTypeId;
            }
        });
    }

    // Set alarm checkbox
    const alarmCheckbox = $('alarmCheckbox');
    if (alarmCheckbox) {
        alarmCheckbox.checked = params.alarm;
    }

    isInitializing = false;
}

// Menu Mode Toggle
function toggleMenuMode() {
    const simpleRadio = document.querySelector('input[name="menuMode"][value="simple"]');
    const customRadio = document.querySelector('input[name="menuMode"][value="custom"]');
    const simpleMode = $('simpleMode');
    const customMode = $('customMode');

    if (simpleRadio.checked) {
        currentMenuMode = 'simple';
        simpleMode.classList.remove('hidden');
        customMode.classList.add('hidden');
    } else if (customRadio.checked) {
        currentMenuMode = 'custom';
        simpleMode.classList.add('hidden');
        customMode.classList.remove('hidden');
    }

    updateCalendarUrl();
    updateUrlParameters();
}

// Calendar URL Generation
function updateCalendarUrl() {
    const baseUrl = BASE_URL.replace(/^http:/, 'https:');
    let calendarUrl = '';

    if (currentMenuMode === 'simple') {
        const simpleSelect = $('simpleMenuSelect');
        if (simpleSelect && simpleSelect.selectedOptions.length > 0) {
            const selectedOption = simpleSelect.selectedOptions[0];
            const slug = selectedOption.getAttribute('data-slug');
            if (slug) {
                calendarUrl = `${baseUrl}/calendar/${slug}.ics`;
            }
        }
    } else {
        // Custom mode
        const daySelects = document.querySelectorAll('.custom-day-select');
        const config = [];

        daySelects.forEach(select => {
            const dayOfWeek = parseInt(select.getAttribute('data-day'));
            const menuTypeId = select.value;

            if (menuTypeId && menuTypeId !== '') {
                const dayChar = getDayChar(dayOfWeek);
                if (dayChar) {
                    config.push(dayChar + menuTypeId);
                }
            }
        });

        if (config.length > 0) {
            const configString = config.join('');
            calendarUrl = `${baseUrl}/calendar/custom/${configString}.ics`;
        }
    }

    // Add alarm parameter if checkbox is checked
    const alarmCheckbox = $('alarmCheckbox');
    if (calendarUrl && alarmCheckbox && alarmCheckbox.checked) {
        const separator = calendarUrl.includes('?') ? '&' : '?';
        calendarUrl += `${separator}alarm=true`;
    }

    const input = $('calendarUrl');
    if (input) {
        input.value = calendarUrl;
    }

    // Also update the preview whenever URL changes
    updateWeeklyPreview();
    updateUrlParameters();
}

function getDayChar(dayOfWeek) {
    return MenuUrlCodec.getDayChar(dayOfWeek);
}

// Weekly Preview
function updateWeeklyPreview() {
    const previewContainer = $('weeklyPreview');
    if (!previewContainer || !menuData) return;

    const startDate = new Date(menuData.startDate + 'T12:00:00');
    const weekDays = [];

    // Generate 7 days starting from today
    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        weekDays.push(currentDate);
    }

    previewContainer.innerHTML = '';

    weekDays.forEach((date, index) => {
        const dateStr = date.toISOString().split('T')[0];
        const dayInfo = formatDate(dateStr);
        const isWeekend = date.getDay() === 0 || date.getDay() === 6; // Sunday or Saturday

        let menuEntry = null;
        let menuTypeName = '';

        if (!isWeekend) {
            // Get menu entry based on current mode
            if (currentMenuMode === 'simple') {
                const simpleSelect = $('simpleMenuSelect');
                if (simpleSelect && simpleSelect.value) {
                    const menuTypeId = simpleSelect.value;
                    if (menuData.weeklyData[menuTypeId] && menuData.weeklyData[menuTypeId][dateStr]) {
                        menuEntry = menuData.weeklyData[menuTypeId][dateStr];
                        const menuType = menuData.menuTypes.find(mt => mt.id == menuTypeId);
                        menuTypeName = menuType ? menuType.name : '';
                    }
                }
            } else {
                // Custom mode - find which menu type is selected for this day
                const dayOfWeek = date.getDay();
                const daySelect = document.querySelector(`select[data-day="${dayOfWeek}"]`);
                if (daySelect && daySelect.value) {
                    const menuTypeId = daySelect.value;
                    if (menuData.weeklyData[menuTypeId] && menuData.weeklyData[menuTypeId][dateStr]) {
                        menuEntry = menuData.weeklyData[menuTypeId][dateStr];
                        const menuType = menuData.menuTypes.find(mt => mt.id == menuTypeId);
                        menuTypeName = menuType ? menuType.name : '';
                    }
                }
            }
        }

        const row = document.createElement('div');
        row.className = 'menu-row' + (index === 0 ? ' menu-row-today' : '');

        const dateLabel = index === 0
            ? '<span class="tag-today">Today</span>'
            : `${dayInfo.dayName} ${dayInfo.dayNumber} ${dayInfo.monthName}`;

        let line;
        if (isWeekend) {
            line = '<span class="menu-dish menu-dish-muted">Weekend &mdash; the kitchen rests</span>';
        } else if (menuEntry) {
            line = `<span class="menu-dish" title="${menuEntry.title}">${menuEntry.title}</span>` +
                '<span class="menu-leader"></span>' +
                `<span class="menu-type">${menuTypeName}</span>`;
        } else {
            line = '<span class="menu-dish menu-dish-muted">No menu published yet</span>';
        }

        row.innerHTML = `
            <div class="menu-row-date">${dateLabel}</div>
            <div class="menu-row-line">${line}</div>
        `;

        previewContainer.appendChild(row);
    });
}

// Auto-refresh functionality
let refreshInterval;

function startAutoRefresh() {
    refreshInterval = setInterval(() => {
        console.log('Auto-refreshing menu data...');
        window.location.reload();
    }, AUTO_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Load menu data from global variable
    if (window.menuData) {
        menuData = window.menuData;
    }

    // Load URL parameters first, then initialize
    loadFromUrlParameters();

    // Initialize interface
    updateCalendarUrl();

    startAutoRefresh();
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAutoRefresh();
    else startAutoRefresh();
});

window.addEventListener('beforeunload', stopAutoRefresh);