// Application logic: initialization, async data loading, filters, settings

// Chart instances
let charts = {
    weight: null,
    bmi: null,
    calorie: null,
    distribution: null,
    proteins: null,
    fats: null,
    carbs: null,
    proteinsDist: null,
    fatsDist: null,
    carbsDist: null,
    proteinsGauge: null,
    fatsGauge: null
};

// DOM Elements
const loadingOverlay = document.getElementById('loadingOverlay');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const settingsModal = document.getElementById('settingsModal');

// Show/hide loading
function showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';
}

// Show error
function showError(message) {
    errorText.textContent = message;
    errorMessage.style.display = 'flex';
}

// Hide error
function hideError() {
    errorMessage.style.display = 'none';
}

// Open settings panel
function openSettingsPanel() {
    populateSettingsForm();
    settingsModal.classList.add('active');
}

// Close settings panel
function closeSettingsPanel() {
    settingsModal.classList.remove('active');
}

// Populate settings form with current values
function populateSettingsForm() {
    document.getElementById('settingSheetUrl').value = getSheetUrl();
    document.getElementById('settingBmiTarget').value = targets.bmi;

    // Macro targets
    document.getElementById('settingProteins').value = targets.proteins || '';
    document.getElementById('settingFats').value = targets.fats || '';
    document.getElementById('settingCarbs').value = targets.carbs || '';

    document.getElementById('settingZoneUnhealthyDeficit').value = targets.calorieZones.unhealthyDeficit;
    document.getElementById('settingZoneFastLoss').value = targets.calorieZones.fastLoss;
    document.getElementById('settingZoneHealthyLoss').value = targets.calorieZones.healthyLoss;
    document.getElementById('settingZoneSlowLoss').value = targets.calorieZones.slowLoss;
    document.getElementById('settingZoneMaintenance').value = targets.calorieZones.maintenance;
}

// Save settings from form
function handleSaveSettings() {
    const sheetUrl = document.getElementById('settingSheetUrl').value.trim();
    saveSheetUrl(sheetUrl);

    const newSettings = {
        bmi: parseFloat(document.getElementById('settingBmiTarget').value),
        proteins: parseInt(document.getElementById('settingProteins').value) || null,
        fats: parseInt(document.getElementById('settingFats').value) || null,
        carbs: parseInt(document.getElementById('settingCarbs').value) || null,
        calorieZones: {
            unhealthyDeficit: parseInt(document.getElementById('settingZoneUnhealthyDeficit').value),
            fastLoss: parseInt(document.getElementById('settingZoneFastLoss').value),
            healthyLoss: parseInt(document.getElementById('settingZoneHealthyLoss').value),
            slowLoss: parseInt(document.getElementById('settingZoneSlowLoss').value),
            maintenance: parseInt(document.getElementById('settingZoneMaintenance').value),
            surplus: 10000 // Upper bound for surplus (virtual)
        }
    };

    saveSettings(newSettings);
    closeSettingsPanel();

    // Reload dashboard with new settings
    initDashboard();
}

// Initialize dashboard
async function initDashboard() {
    showLoading(true);
    hideError();

    const sheetUrl = getSheetUrl();

    if (!sheetUrl) {
        showLoading(false);
        showError('Укажите URL Google Apps Script в настройках');
        return;
    }

    try {
        await fetchDataFromSheets(sheetUrl);

        if (weightData.length === 0 && kbjuData.length === 0) {
            showLoading(false);
            showError('Нет данных в таблице. Добавьте данные и обновите страницу.');
            return;
        }

        // Set date ranges
        initializeDateRanges();

        // Create charts
        if (weightData.length > 0) {
            const weeklyAverages = getWeeklyAverages(weightData);
            if (charts.weight) charts.weight.destroy();
            if (charts.bmi) charts.bmi.destroy();
            charts.weight = createWeightChart(weeklyAverages, weightData);
            charts.bmi = createBMIChart(weeklyAverages, weightData);
        }

        if (kbjuData.length > 0) {
            updateKBJUCharts(kbjuData);
            updateMacroCharts(kbjuData);
        }

        showLoading(false);
    } catch (error) {
        console.error('Dashboard init error:', error);
        showLoading(false);
        showError(error.message);
    }
}

// Update КБЖУ charts (calories and distribution)
function updateKBJUCharts(data) {
    if (charts.calorie) charts.calorie.destroy();
    if (charts.distribution) charts.distribution.destroy();

    if (data.length === 0) return;

    charts.calorie = createCalorieChart(data);
    charts.distribution = createDistributionChart(data);
}

// Update Macro charts and stats
function updateMacroCharts(data) {
    if (charts.proteins) charts.proteins.destroy();
    if (charts.fats) charts.fats.destroy();
    if (charts.carbs) charts.carbs.destroy();

    const filteredData = data.filter(d => d.proteins !== null || d.fats !== null || d.carbs !== null);

    if (filteredData.length === 0) return;

    const proteinStats = getMacroStats(filteredData, 'proteins');
    const fatStats = getMacroStats(filteredData, 'fats');
    const carbStats = getMacroStats(filteredData, 'carbs');

    charts.proteins = createMacroThermometerChart('proteinsChart', filteredData, 'proteins', colors.proteins, targets.proteins, proteinStats.avg);
    charts.fats = createMacroThermometerChart('fatsChart', filteredData, 'fats', colors.fats, targets.fats, fatStats.avg);
    charts.carbs = createMacroThermometerChart('carbsChart', filteredData, 'carbs', colors.carbs, targets.carbs, carbStats.avg);

    // Gauge charts
    if (charts.proteinsGauge) charts.proteinsGauge.destroy();
    if (charts.fatsGauge) charts.fatsGauge.destroy();

    charts.proteinsGauge = createMacroGaugeChart('proteinsGaugeChart', proteinStats);
    charts.fatsGauge = createMacroGaugeChart('fatsGaugeChart', fatStats);

    // Dynamic Insight Text
    const updateInsight = (elementId, avg, target, macroType) => {
        const diff = avg - target;
        const absDiff = Math.abs(diff).toFixed(1);
        const element = document.getElementById(elementId);

        if (!element) return;

        let text = '';
        if (macroType === 'proteins') {
            if (avg < target) {
                text = `⚠️ <span class="highlight">${absDiff} г</span> белка не хватает для достижения цели`;
            } else {
                text = `🎯 <span class="highlight">${absDiff} г</span> белка сверх нормы. Отличный результат!`;
            }
        } else if (macroType === 'fats') {
            if (avg <= target) {
                text = `🎯 <span class="highlight">${absDiff} г</span> жиров в запасе до лимита. Так держать!`;
            } else {
                text = `⚠️ <span class="highlight">${absDiff} г</span> жиров сверх нормы. Лимит превышен`;
            }
        }

        element.innerHTML = text;
    };

    updateInsight('proteinsInsight', parseFloat(proteinStats.avg), targets.proteins, 'proteins');
    updateInsight('fatsInsight', parseFloat(fatStats.avg), targets.fats, 'fats');
}

// Initialize date range inputs with data bounds
const MIN_ALLOWED_DATE = "2025-12-22";
let nutritionDatePicker = null;
let metricsDatePicker = null;

function initializeDateRanges() {
    if (nutritionDatePicker) nutritionDatePicker.destroy();
    if (metricsDatePicker) metricsDatePicker.destroy();

    let kbjuRange = getDateRange(kbjuData);
    let weightRange = getDateRange(weightData);

    // Ensure initial range doesn't start before the constant limit
    if (kbjuRange.min < MIN_ALLOWED_DATE) kbjuRange.min = MIN_ALLOWED_DATE;
    if (weightRange.min < MIN_ALLOWED_DATE) weightRange.min = MIN_ALLOWED_DATE;

    // Helper functions
    const formatDisplayDate = (dateStr) => {
        const [year, month, day] = dateStr.split('-');
        return `${day}.${month}.${year}`;
    };

    const formatDateToString = (date) => {
        if (!date) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const updateLabel = (textId, countId, startDate, endDate, presetName = null) => {
        document.getElementById(textId).textContent =
            `${formatDisplayDate(startDate)} — ${formatDisplayDate(endDate)}`;

        const countEl = document.getElementById(countId);

        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        let suffix = 'дней';
        const lastDigit = diffDays % 10;
        const lastTwoDigits = diffDays % 100;
        if (lastDigit === 1 && lastTwoDigits !== 11) suffix = 'день';
        else if ([2, 3, 4].includes(lastDigit) && ![12, 13, 14].includes(lastTwoDigits)) suffix = 'дня';

        const daysText = `${diffDays} ${suffix}`;

        if (presetName === 'весь период') {
            countEl.textContent = `${presetName}: ${daysText}`;
        } else if (presetName) {
            countEl.textContent = presetName;
        } else {
            countEl.textContent = daysText;
        }
    };

    // Helper to inject quick buttons and Apply button into Flatpickr
    const injectExtras = (instance, fullRange, type) => {
        const container = instance.calendarContainer;

        // 1. Sidebar Presets
        if (!container.querySelector('.quick-filters')) {
            const filtersDiv = document.createElement('div');
            filtersDiv.className = 'quick-filters';

            const buttons = [
                { label: 'последние 7 дней', range: '7-days' },
                { label: 'последние 14 дней', range: '14-days' },
                { label: 'текущая неделя', range: 'current-week' },
                { label: 'прошлая неделя', range: 'last-week' },
                { label: 'весь период', range: 'all' }
            ];

            buttons.forEach(btnInfo => {
                const btn = document.createElement('button');
                btn.className = 'quick-filter-btn';
                btn.textContent = btnInfo.label;
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const now = new Date();
                    let start = new Date();
                    let end = new Date();

                    if (btnInfo.range === '7-days') {
                        start.setDate(now.getDate() - 6);
                        end = new Date();
                    } else if (btnInfo.range === '14-days') {
                        start.setDate(now.getDate() - 13);
                        end = new Date();
                    } else if (btnInfo.range === 'current-week') {
                        const day = now.getDay();
                        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
                        start = new Date(now.setDate(diff));
                        end = new Date();
                    } else if (btnInfo.range === 'last-week') {
                        const day = now.getDay();
                        const diff = now.getDate() - day + (day === 0 ? -13 : -6);
                        start = new Date(now.setDate(diff));
                        end = new Date(start);
                        end.setDate(end.getDate() + 6);
                    } else if (btnInfo.range === 'all') {
                        start = new Date(fullRange.min);
                        end = new Date(fullRange.max);
                    }

                    instance._isQuickFilterTrigger = true;
                    instance._activePresetName = btnInfo.label;
                    instance.setDate([formatDateToString(start), formatDateToString(end)], true);
                    instance._isQuickFilterTrigger = false;

                    filtersDiv.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                };
                filtersDiv.appendChild(btn);
            });

            // Add spacer
            const spacer = document.createElement('div');
            spacer.style.flex = '1';
            filtersDiv.appendChild(spacer);

            // 2. Apply Button inside sidebar
            const applyBtn = document.createElement('button');
            applyBtn.className = 'apply-btn';
            applyBtn.textContent = 'Применить';
            applyBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                handleApply(instance, type);
                instance.close();
            };
            filtersDiv.appendChild(applyBtn);

            container.prepend(filtersDiv);

            instance.set('onValueUpdate', (selectedDates, dateStr, inst) => {
                if (!inst._isQuickFilterTrigger) {
                    filtersDiv.querySelectorAll('.quick-filter-btn').forEach(b => b.classList.remove('active'));
                    inst._activePresetName = null;
                }
            });
        }

    };

    const handleApply = (instance, type) => {
        const selectedDates = instance.selectedDates;
        if (selectedDates.length === 2) {
            const startDate = formatDateToString(selectedDates[0]);
            const endDate = formatDateToString(selectedDates[1]);

            if (type === 'nutrition') {
                updateLabel('nutritionDateRangeText', 'nutritionDaysCount', startDate, endDate, instance._activePresetName);
                const filteredData = filterByDateRange(kbjuData, startDate, endDate);
                updateKBJUCharts(filteredData);
                updateMacroCharts(filteredData);
            } else if (type === 'metrics') {
                updateLabel('metricsDateRangeText', 'metricsDaysCount', startDate, endDate, instance._activePresetName);
                const filteredData = filterByDateRange(weightData, startDate, endDate);
                if (charts.weight) charts.weight.destroy();
                if (charts.bmi) charts.bmi.destroy();
                const weeklyAverages = getWeeklyAverages(filteredData);
                charts.weight = createWeightChart(weeklyAverages, filteredData);
                charts.bmi = createBMIChart(weeklyAverages, filteredData);
            }
        }
    };

    nutritionDatePicker = flatpickr('#nutritionDateRange', {
        mode: 'range',
        dateFormat: 'Y-m-d',
        defaultDate: [kbjuRange.min, kbjuRange.max],
        minDate: MIN_ALLOWED_DATE,
        maxDate: new Date(),
        locale: 'ru',
        onReady: (selectedDates, dateStr, instance) => {
            injectExtras(instance, kbjuRange, 'nutrition');
        },
        onChange: (selectedDates, dateStr, instance) => {
            // Only toggle preset highlights, don't filter charts
        }
    });

    metricsDatePicker = flatpickr('#metricsDateRange', {
        mode: 'range',
        dateFormat: 'Y-m-d',
        defaultDate: [weightRange.min, weightRange.max],
        minDate: MIN_ALLOWED_DATE,
        maxDate: new Date(),
        locale: 'ru',
        onReady: (selectedDates, dateStr, instance) => {
            injectExtras(instance, weightRange, 'metrics');
        },
        onChange: (selectedDates, dateStr, instance) => {
            // Only toggle preset highlights, don't filter charts
        }
    });

    // Set initial labels
    updateLabel('nutritionDateRangeText', 'nutritionDaysCount', kbjuRange.min, kbjuRange.max, 'весь период');
    updateLabel('metricsDateRangeText', 'metricsDaysCount', weightRange.min, weightRange.max, 'весь период');

    // Button Click Handlers
    document.getElementById('nutritionDateRangeBtn').onclick = () => nutritionDatePicker.open();
    document.getElementById('metricsDateRangeBtn').onclick = () => metricsDatePicker.open();

}

// Settings modal handlers
document.getElementById('openSettings').addEventListener('click', openSettingsPanel);
document.getElementById('closeSettings').addEventListener('click', closeSettingsPanel);
document.getElementById('cancelSettings').addEventListener('click', closeSettingsPanel);
document.getElementById('saveSettings').addEventListener('click', handleSaveSettings);

// Close modal on overlay click
settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
        closeSettingsPanel();
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && settingsModal.classList.contains('active')) {
        closeSettingsPanel();
    }
});

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', initDashboard);
