// Chart.js configuration and chart creation functions

// Chart.js global defaults for dark theme
Chart.defaults.color = 'rgba(160, 174, 192, 0.4)'; // Semi-transparent labels
Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.05)';
Chart.defaults.font.family = "'Roboto', sans-serif";

// Common chart options
const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: {
            display: false
        }
    }
};

const pointLabelsPlugin = {
    id: 'pointLabels',
    afterDatasetsDraw(chart) {
        const { ctx } = chart;
        ctx.save();
        ctx.font = '600 11px Roboto';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        chart.data.datasets.forEach((dataset, i) => {
            // Only show labels for primary data (Weight/BMI), ignore targets
            if (dataset.label === 'Цель по BMI' || dataset.label === 'Дневной вес' || dataset.label === 'Дневной BMI') return;

            const meta = chart.getDatasetMeta(i);

            meta.data.forEach((element, index) => {
                const value = dataset.data[index];
                if (value !== null && value !== undefined && !dataset.hidden) {
                    const { x, y } = element;
                    const mainLabel = value.toFixed(1);

                    // Main weight label
                    const isIncomplete = dataset.isIncompleteMap && dataset.isIncompleteMap[index];
                    ctx.fillStyle = isIncomplete ? '#a0aec0' : '#ffffff'; // Gray for incomplete, white for others
                    ctx.font = '600 11px Roboto'; // Standard size for all

                    ctx.fillText(mainLabel, x, y - 10);
                }
            });
        });
        ctx.restore();
    }
};

// Formatting helper for space as thousands separator
const formatNumber = (val) => {
    if (val === null || val === undefined) return '';
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
};

// Weight Chart
function createWeightChart(weeklyData, dailyData = []) {
    const canvas = document.getElementById('weightChart');
    if (!canvas) return null;

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    const ctx = canvas.getContext('2d');

    // Create maps for efficient lookup
    const weeklyMap = {};
    weeklyData.forEach(d => {
        weeklyMap[d.fullDate] = { avg: d.avgWeight, incomplete: d.isIncomplete };
    });

    const dailyMap = {};
    dailyData.forEach(d => {
        dailyMap[d.date] = d.weight;
    });

    // Merge all unique dates from both sources to ensure all points appear
    const allDates = [...new Set([
        ...dailyData.map(d => d.date),
        ...weeklyData.map(w => w.fullDate)
    ])].sort();

    // Calculate Y-axis bounds based on available weight data
    const weights = dailyData.map(d => parseFloat(d.weight)).filter(w => !isNaN(w));
    const weeklyWeights = weeklyData.map(d => parseFloat(d.avgWeight)).filter(w => !isNaN(w));
    const allWeights = [...weights, ...weeklyWeights];

    const dataMin = allWeights.length > 0 ? Math.min(...allWeights) : 70;
    const dataMax = allWeights.length > 0 ? Math.max(...allWeights) : 80;

    const isIncompleteMap = allDates.map(d => weeklyMap[d] && weeklyMap[d].incomplete);

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: allDates.map(d => formatDateDDMM(d)),
            datasets: [
                {
                    label: 'Средний вес',
                    data: allDates.map(d => weeklyMap[d] ? parseFloat(weeklyMap[d].avg) : null),
                    isIncompleteMap: isIncompleteMap,
                    borderColor: colors.primary,
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: false,
                    pointRadius: 6,
                    pointBackgroundColor: (ctx) => isIncompleteMap[ctx.dataIndex] ? '#718096' : colors.primary,
                    pointBorderColor: '#1a1a2e',
                    pointBorderWidth: 3,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: (ctx) => isIncompleteMap[ctx.dataIndex] ? '#718096' : colors.primary,
                    spanGaps: true,
                    order: 1,
                    segment: {
                        borderColor: colors.primary, // Same color as main line
                        borderDash: (ctx) => isIncompleteMap[ctx.p1DataIndex] ? [6, 4] : undefined
                    }
                },
                {
                    label: 'Дневной вес',
                    data: allDates.map(d => dailyMap[d] !== undefined ? parseFloat(dailyMap[d]) : null),
                    borderColor: 'rgba(160, 174, 192, 0.15)', // Even more transparent gray
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 2,
                    pointBackgroundColor: 'rgba(160, 174, 192, 0.2)', // More transparent points
                    pointBorderWidth: 0,
                    pointHitRadius: 10,
                    fill: false,
                    spanGaps: true,
                    order: 2
                }
            ]
        },
        plugins: [pointLabelsPlugin],
        options: {
            ...commonOptions,
            scales: {
                y: {
                    title: {
                        display: true,
                        text: 'Вес, кг',
                        font: { size: 11, weight: '500' },
                        color: 'rgba(113, 128, 150, 0.4)'
                    },
                    min: Math.floor((dataMin - 0.5) * 2) / 2,
                    max: Math.ceil((dataMax + 0.5) * 2) / 2,
                    ticks: {
                        stepSize: 0.5,
                        callback: (value) => formatNumber(value.toFixed(1))
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.015)'
                    }
                },
                x: {
                    offset: true,
                    title: {
                        display: false
                    },
                    grid: {
                        display: false
                    },
                    ticks: {
                        // Only show labels for entries that correspond to weekly averages (Sundays)
                        callback: function (val, index) {
                            const dateStr = allDates[index];
                            return weeklyMap[dateStr] ? this.getLabelForValue(val) : '';
                        },
                        autoSkip: false,
                        maxRotation: 0
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                intersect: false
            },
            layout: {
                padding: {
                    left: 15,
                    right: 15,
                    top: 25
                }
            },
            plugins: {
                ...commonOptions.plugins,
                tooltip: {
                    backgroundColor: '#16213e',
                    displayColors: false,
                    padding: 12,
                    filter: (tooltipItem) => tooltipItem.datasetIndex === 1, // Only daily weight
                    callbacks: {
                        title: (items) => {
                            const date = new Date(allDates[items[0].dataIndex]);
                            const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
                            return `${date.getDate()} ${months[date.getMonth()]}`;
                        },
                        label: (context) => {
                            const val = parseFloat(context.raw);
                            return `${formatNumber(val.toFixed(1))} кг`;
                        },
                        labelTextColor: () => '#ffffff'
                    }
                }
            }
        }
    });
}

// BMI Chart
function createBMIChart(weeklyData, dailyData = []) {
    const canvas = document.getElementById('bmiChart');
    if (!canvas) return null;

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    const ctx = canvas.getContext('2d');

    // Create maps for efficient lookup
    const weeklyMap = {};
    weeklyData.forEach(d => {
        weeklyMap[d.fullDate] = { avg: d.avgBmi, incomplete: d.isIncomplete };
    });

    const dailyMap = {};
    dailyData.forEach(d => {
        dailyMap[d.date] = d.bmi;
    });

    // Merge all unique dates
    const allDates = [...new Set([
        ...dailyData.map(d => d.date),
        ...weeklyData.map(w => w.fullDate)
    ])].sort();

    // Calculate Y-axis bounds
    const bmis = dailyData.map(d => parseFloat(d.bmi)).filter(b => !isNaN(b));
    const weeklyBmis = weeklyData.map(d => parseFloat(d.avgBmi)).filter(b => !isNaN(b));
    const allBmis = [...bmis, ...weeklyBmis, targets.bmi];

    const dataMin = allBmis.length > 0 ? Math.min(...allBmis) : 23;
    const dataMax = allBmis.length > 0 ? Math.max(...allBmis) : 27;

    const isIncompleteMap = allDates.map(d => weeklyMap[d] && weeklyMap[d].incomplete);

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: allDates.map(d => formatDateDDMM(d)),
            datasets: [
                {
                    label: 'Средний BMI',
                    data: allDates.map(d => weeklyMap[d] ? parseFloat(weeklyMap[d].avg) : null),
                    isIncompleteMap: isIncompleteMap,
                    borderColor: colors.primary,
                    backgroundColor: 'transparent',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: false,
                    pointRadius: 6,
                    pointBackgroundColor: (ctx) => isIncompleteMap[ctx.dataIndex] ? '#718096' : colors.primary,
                    pointBorderColor: '#1a1a2e',
                    pointBorderWidth: 3,
                    pointHoverRadius: 6,
                    pointHoverBackgroundColor: (ctx) => isIncompleteMap[ctx.dataIndex] ? '#718096' : colors.primary,
                    spanGaps: true,
                    order: 1,
                    segment: {
                        borderColor: colors.primary,
                        borderDash: (ctx) => isIncompleteMap[ctx.p1DataIndex] ? [6, 4] : undefined
                    }
                },
                {
                    label: 'Дневной BMI',
                    data: allDates.map(d => dailyMap[d] !== undefined ? parseFloat(dailyMap[d]) : null),
                    borderColor: 'rgba(160, 174, 192, 0.15)',
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 2,
                    pointBackgroundColor: 'rgba(160, 174, 192, 0.2)',
                    pointBorderWidth: 0,
                    pointHitRadius: 10,
                    fill: false,
                    spanGaps: true,
                    order: 3
                },
                {
                    label: 'Цель по BMI',
                    data: allDates.map(() => targets.bmi),
                    borderColor: colors.targetLine,
                    borderDash: [8, 4],
                    borderWidth: 2,
                    pointRadius: 0,
                    fill: false,
                    order: 2
                }
            ]
        },
        plugins: [pointLabelsPlugin],
        options: {
            ...commonOptions,
            scales: {
                y: {
                    title: {
                        display: false
                    },
                    min: Math.ceil((dataMin - 0.5) * 2) / 2,
                    max: Math.floor((dataMax + 0.5) * 2) / 2,
                    ticks: {
                        stepSize: 0.5,
                        callback: (value) => formatNumber(value.toFixed(1))
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.015)'
                    }
                },
                x: {
                    offset: true,
                    title: {
                        display: false
                    },
                    grid: {
                        display: false
                    },
                    ticks: {
                        callback: function (val, index) {
                            const dateStr = allDates[index];
                            return weeklyMap[dateStr] ? this.getLabelForValue(val) : '';
                        },
                        autoSkip: false,
                        maxRotation: 0
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                intersect: false
            },
            layout: {
                padding: {
                    left: 15,
                    right: 15,
                    top: 25
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#16213e',
                    displayColors: false,
                    padding: 12,
                    filter: (tooltipItem) => tooltipItem.datasetIndex === 1, // Only daily BMI
                    callbacks: {
                        title: (items) => {
                            const date = new Date(allDates[items[0].dataIndex]);
                            const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
                            return `${date.getDate()} ${months[date.getMonth()]}`;
                        },
                        label: (context) => {
                            const val = parseFloat(context.raw);
                            return formatNumber(val.toFixed(1));
                        },
                        labelTextColor: () => '#ffffff'
                    }
                }
            }
        }
    });
}

// Calorie Chart with full-width background zones and offset data points
function createCalorieChart(data) {
    const canvas = document.getElementById('calorieChart');
    if (!canvas) return null;

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    const ctx = canvas.getContext('2d');
    const zones = targets.calorieZones;

    // Calculate dynamic min/max
    const calories = data.map(d => d.calories).filter(c => c !== null);

    // Calculate and display average
    const avgCalories = calories.length > 0
        ? Math.round(calories.reduce((a, b) => a + b, 0) / calories.length)
        : 0;

    const titleEl = document.getElementById('calorieChartTitle');
    if (titleEl) {
        titleEl.innerHTML = `
            <div>Динамика по дням</div>
            <div style="font-size: 13px; color: var(--text-muted); font-weight: 400; margin-top: 2px;">
                ~${formatNumber(avgCalories)} ккал
            </div>
        `;
    }

    const dataMin = calories.length > 0 ? Math.min(...calories) : 1700;
    const dataMax = calories.length > 0 ? Math.max(...calories) : 2600;

    const baseMin = 1500;
    const baseMax = 2800;

    const yMin = dataMin <= baseMin
        ? Math.floor((dataMin - 100) / 100) * 100
        : baseMin;
    const yMax = dataMax >= baseMax
        ? Math.ceil((dataMax + 100) / 100) * 100
        : baseMax;

    // Custom plugin for full-width background zones + right-side labels
    const calorieZonesPlugin = {
        id: 'calorieZones',
        beforeDatasetsDraw(chart) {
            const { ctx, chartArea: { left, top, width, height }, scales: { y } } = chart;
            const zones = targets.calorieZones;

            const bands = [
                { color: '#FF6B6B', top: zones.unhealthyDeficit, bottom: y.min },
                { color: '#ABEBC6', top: zones.fastLoss, bottom: zones.unhealthyDeficit },
                { color: '#58D68D', top: zones.healthyLoss, bottom: zones.fastLoss },
                { color: '#ABEBC6', top: zones.slowLoss, bottom: zones.healthyLoss },
                { color: '#FFB74D', top: zones.maintenance, bottom: zones.slowLoss },
                { color: '#FF6B6B', top: y.max, bottom: zones.maintenance }
            ];

            ctx.save();
            bands.forEach(band => {
                const yTop = y.getPixelForValue(band.top);
                const yBottom = y.getPixelForValue(band.bottom);

                // Draw background rectangle (full chart width)
                ctx.fillStyle = band.color;
                const rectY = Math.max(top, Math.min(yTop, yBottom));
                const rectHeight = Math.abs(yBottom - yTop);
                // Ensure it doesn't spill over chartArea top/bottom bounds
                const clampedHeight = Math.min(rectHeight, chart.chartArea.bottom - rectY);
                if (clampedHeight > 0) {
                    ctx.fillRect(left, rectY, width, clampedHeight);
                }
            });
            ctx.restore();
        },
        afterDatasetsDraw(chart) {
            const { ctx, chartArea: { right }, scales: { y } } = chart;
            const zones = targets.calorieZones;
            const labelSpecs = [
                { label: 'Нездоровый дефицит', top: zones.unhealthyDeficit, bottom: y.min },
                { label: 'Быстрое похудение', top: zones.fastLoss, bottom: zones.unhealthyDeficit },
                { label: 'Здоровое похудение', top: zones.healthyLoss, bottom: zones.fastLoss },
                { label: 'Медленное похудение', top: zones.slowLoss, bottom: zones.healthyLoss },
                { label: 'Поддержание веса', top: zones.maintenance, bottom: zones.slowLoss },
                { label: 'Избыток', top: y.max, bottom: zones.maintenance }
            ];

            ctx.save();
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.font = '600 10px Roboto, sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';

            labelSpecs.forEach(spec => {
                const yTop = y.getPixelForValue(spec.top);
                const yBottom = y.getPixelForValue(spec.bottom);
                const yCenter = (yTop + yBottom) / 2;

                if (yCenter >= chart.chartArea.top && yCenter <= chart.chartArea.bottom) {
                    ctx.fillText(spec.label, right + 10, yCenter);
                }
            });
            ctx.restore();
        }
    };

    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => {
                const date = new Date(d.date);
                return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
            }),
            datasets: [{
                label: 'Калории',
                data: calories,
                borderColor: '#fff',
                backgroundColor: 'rgba(255, 255, 255, 0.2)', // Point background
                borderWidth: 2,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#16213e',
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.3
            }]
        },
        plugins: [calorieZonesPlugin],
        options: {
            ...commonOptions,
            layout: {
                padding: {
                    right: 125
                }
            },
            scales: {
                y: {
                    min: yMin,
                    max: yMax,
                    ticks: {
                        stepSize: 100,
                        padding: 10,
                        callback: (value) => formatNumber(value)
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.015)'
                    }
                },
                x: {
                    offset: true,
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#16213e',
                    displayColors: false,
                    padding: 12,
                    callbacks: {
                        title: (items) => {
                            const date = new Date(data[items[0].dataIndex].date);
                            const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
                            return `${date.getDate()} ${months[date.getMonth()]}`;
                        },
                        label: (context) => `${formatNumber(Math.round(context.raw))} ккал`
                    }
                }
            }
        }
    });
}

// Calorie Category Distribution Chart (Vertical Sidebar)
function createDistributionChart(data) {
    const canvas = document.getElementById('distributionChart');
    if (!canvas) return null;

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    const ctx = canvas.getContext('2d');

    // Categorize data
    const categories = {
        unhealthy_deficit: 0,
        fast_loss: 0,
        healthy_loss: 0,
        slow_loss: 0,
        maintenance: 0,
        surplus: 0
    };

    data.forEach(d => {
        const cat = getCalorieCategory(d.calories);
        if (categories[cat] !== undefined) {
            categories[cat]++;
        }
    });

    const totalDays = Object.values(categories).reduce((a, b) => a + b, 0);
    if (totalDays === 0) return null;

    const labels = [
        'Нездоровый дефицит',
        'Быстрое похудение',
        'Здоровое похудение',
        'Медленное похудение',
        'Поддержание веса',
        'Избыток'
    ];

    const categoryKeys = [
        'unhealthy_deficit',
        'fast_loss',
        'healthy_loss',
        'slow_loss',
        'maintenance',
        'surplus'
    ];

    const colors = [
        '#FF6B6B', // unhealthy_deficit
        '#ABEBC6', // fast_loss
        '#58D68D', // healthy_loss
        '#ABEBC6', // slow_loss
        '#FFB74D', // maintenance
        '#FF6B6B'  // surplus
    ];

    // Build only active datasets
    const activeKeys = categoryKeys.filter(key => categories[key] > 0);
    const datasets = activeKeys.map((key, i) => {
        const val = categories[key];
        const isFirst = i === 0;
        const isLast = i === activeKeys.length - 1;
        const originalIndex = categoryKeys.indexOf(key);

        let borderRadius = 0;
        if (isFirst && isLast) borderRadius = 15;
        else if (isFirst) borderRadius = { bottomLeft: 15, bottomRight: 15 };
        else if (isLast) borderRadius = { topLeft: 15, topRight: 15 };

        return {
            label: labels[originalIndex],
            data: [val],
            backgroundColor: colors[originalIndex],
            borderColor: 'transparent',
            borderWidth: 0,
            borderRadius: borderRadius,
            barThickness: 160,
            borderSkipped: isFirst ? (isLast ? false : 'top') : (isLast ? 'bottom' : 'middle')
        };
    });

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [''],
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#16213e',
                    padding: 12,
                    usePointStyle: true, // Use circle from point style
                    boxPadding: 4,
                    callbacks: {
                        label: function (context) {
                            const val = context.raw;

                            // Russian declension for "из M дней/дня"
                            // 1, 21, 31... -> дня
                            // everything else -> дней
                            let word = 'дней';
                            const n = Math.abs(totalDays) % 100;
                            const n1 = n % 10;
                            if (n1 === 1 && n !== 11) word = 'дня';

                            const label = context.dataset.label || '';
                            return [
                                label,
                                `${val} из ${totalDays} ${word}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    display: false
                },
                y: {
                    stacked: true,
                    display: false,
                    max: totalDays
                }
            }
        },
        plugins: [{
            id: 'distributionLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    if (!meta.hidden && dataset.data[0] > 0) {
                        const model = meta.data[0];
                        const pct = ((dataset.data[0] / totalDays) * 100).toFixed(0);
                        const label = dataset.label;

                        // Precise Center: halfway between top (y) and bottom (base)
                        const centerX = model.x;
                        const centerY = (model.y + model.base) / 2;

                        // Conditional label color: White for red (#FF6B6B), Dark for others
                        const isRed = dataset.backgroundColor === '#FF6B6B';
                        ctx.fillStyle = isRed ? '#ffffff' : '#16213e';

                        if (model.height > 50) {
                            // Large segment: Show % + Category
                            ctx.font = '800 18px Roboto, sans-serif'; // Increased size & weight
                            ctx.fillText(`${pct}%`, centerX, centerY - 10);
                            ctx.font = '400 11px Roboto, sans-serif'; // Removed bold (400)
                            ctx.fillText(label, centerX, centerY + 12);
                        } else if (model.height > 15) {
                            // Small/Medium segment: Show only % centered
                            ctx.font = '800 15px Roboto, sans-serif'; // Slightly increased
                            ctx.fillText(`${pct}%`, centerX, centerY);
                        }
                    }
                });
                ctx.restore();
            }
        }]
    });
}

// Macro Line Chart
// Macro Thermometer Chart (Stacked Bar)
function createMacroThermometerChart(canvasId, data, macro, color, targetValue, averageValue = null) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    const ctx = canvas.getContext('2d');

    // Update title with average if provided
    if (averageValue !== null) {
        const titleId = `${macro}ChartTitle`;
        const titleEl = document.getElementById(titleId);

        if (titleEl) {
            // Keep original icon/text map
            const titles = {
                proteins: '🥩 Белки',
                fats: '🥑 Жиры',
                carbs: '🍞 Углеводы'
            };

            const baseTitle = titles[macro] || titleEl.textContent;

            titleEl.innerHTML = `
                <div>${baseTitle}</div>
                <div style="font-size: 13px; color: var(--text-muted); font-weight: 400; margin-top: 2px;">
                    ~${formatNumber(averageValue)} г
                </div>
            `;
        }
    }

    const validData = data.filter(d => d[macro] !== null);
    const labels = validData.map(d => {
        const date = new Date(d.date);
        return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
    });

    // Calculate segments
    const s1 = [], s2 = [];
    const target = targetValue || 0;

    validData.forEach(d => {
        const val = d[macro];
        if (macro === 'carbs') {
            s1.push(val);
            s2.push(0);
        } else {
            // Segment 1: Base (Grey) up to target
            const base = Math.min(val, target);
            s1.push(base);
            // Segment 2: Success/Excess (Green or Red) above target
            const extra = Math.max(0, val - target);
            s2.push(extra);
        }
    });

    // Dynamic Y-axis Bounds Calculation
    const allTotals = validData.map(d => d[macro]);
    if (target) allTotals.push(target);

    const yMaxLimit = Math.max(...allTotals);
    const paddingMultiplier = 0.1;
    const yMax = Math.ceil((yMaxLimit * (1 + paddingMultiplier)) / 20) * 20;

    // Single Target Line Plugin
    const targetLinePlugin = {
        id: 'targetLine',
        beforeDatasetsDraw(chart) {
            const { ctx, chartArea: { left, width }, scales: { y } } = chart;
            if (!target) return;

            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';

            const yLine = y.getPixelForValue(target);
            ctx.beginPath();
            ctx.moveTo(left, yLine);
            ctx.lineTo(left + width, yLine);
            ctx.stroke();
            ctx.restore();
        }
    };

    const datasets = [];
    if (macro === 'carbs') {
        datasets.push({
            data: s1,
            backgroundColor: color,
            borderRadius: 6,
            barPercentage: 0.7
        });
    } else {
        const radiusFn = (arr, segIndex) => arr.map((v, i) => {
            if (v === 0) return 0;
            // Check if this is the topmost visible segment
            const isTop = (segIndex === 1 && s2[i] > 0) ||
                (segIndex === 0 && s1[i] > 0 && s2[i] === 0);
            return isTop ? 6 : 0;
        });

        datasets.push(
            {
                label: 'База',
                data: s1,
                backgroundColor: 'rgba(255, 255, 255, 0.12)',
                borderRadius: radiusFn(s1, 0),
                barPercentage: 0.7
            },
            {
                label: macro === 'proteins' ? 'Результат' : 'Перебор',
                data: s2,
                backgroundColor: macro === 'proteins' ? '#58D68D' : '#FF6B6B',
                borderRadius: radiusFn(s2, 1),
                barPercentage: 0.7
            }
        );
    }

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        plugins: [targetLinePlugin],
        options: {
            ...commonOptions,
            scales: {
                y: {
                    stacked: true,
                    min: 0,
                    max: yMax,
                    ticks: {
                        stepSize: 20,
                        callback: (value) => formatNumber(value)
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.015)'
                    }
                },
                x: {
                    stacked: true,
                    grid: {
                        display: false
                    }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#16213e',
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        title: (items) => {
                            const date = new Date(validData[items[0].dataIndex].date);
                            const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
                            return `${date.getDate()} ${months[date.getMonth()]}`;
                        },
                        label: (context) => {
                            const val = validData[context.dataIndex][macro];
                            return `${formatNumber(val)} г`;
                        }
                    }
                }
            }
        }
    });
}

// Macro deviation stats and other helpers would follow here if they existed

// Macro Distribution Horizontal Stacked Bar (100%)
function createMacroDistributionChart(canvasId, stats) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    const ctx = canvas.getContext('2d');

    const totalDays = stats.total;
    if (totalDays === 0) return null;

    const labels = ['Ниже плана', 'В рамках плана', 'Выше плана'];
    const keys = ['below', 'within', 'above'];
    const distributionColors = [
        '#FF6B6B', // Red for below
        '#22c55e', // Green for within
        '#FFB74D'  // Orange for above
    ];

    const datasets = keys.map((key, i) => {
        const val = stats.distribution[key];
        const isFirst = i === 0;
        const isLast = i === keys.length - 1;

        let borderRadius = 0;
        if (isFirst && isLast) borderRadius = 8;
        else if (isFirst) borderRadius = { topLeft: 8, bottomLeft: 8 };
        else if (isLast) borderRadius = { topRight: 8, bottomRight: 8 };

        return {
            label: labels[i],
            data: [val],
            backgroundColor: distributionColors[i],
            borderColor: 'transparent',
            borderWidth: 0,
            borderRadius: borderRadius,
            barThickness: 24,
            borderSkipped: false
        };
    });

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: [''],
            datasets: datasets
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#16213e',
                    padding: 10,
                    callbacks: {
                        label: function (context) {
                            const val = context.raw;
                            const pct = ((val / totalDays) * 100).toFixed(0);

                            let word = 'дней';
                            const n = Math.abs(val) % 100;
                            const n1 = n % 10;
                            if (n > 10 && n < 20) word = 'дней';
                            else if (n1 > 1 && n1 < 5) word = 'дня';
                            else if (n1 === 1) word = 'день';

                            return `${context.dataset.label}: ${val} ${word} (${pct}%)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    display: false,
                    max: totalDays
                },
                y: {
                    stacked: true,
                    display: false
                }
            },
            layout: {
                padding: { left: 0, right: 0, top: 0, bottom: 0 }
            }
        },
        plugins: [{
            id: 'macroDistLabels',
            afterDatasetsDraw(chart) {
                const { ctx } = chart;
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = '600 10px Roboto, sans-serif';

                chart.data.datasets.forEach((dataset, i) => {
                    const meta = chart.getDatasetMeta(i);
                    if (!meta.hidden && dataset.data[0] > 0) {
                        const model = meta.data[0];
                        const width = model.width;
                        const pct = ((dataset.data[0] / totalDays) * 100).toFixed(0);

                        if (width > 25) { // Hide label if segment is too narrow
                            ctx.fillStyle = '#ffffff';
                            ctx.fillText(`${pct}%`, model.x - width / 2, model.y);
                        }
                    }
                });
                ctx.restore();
            }
        }]
    });
}

// Gauge Chart (Full Circle)
function createMacroGaugeChart(canvasId, stats) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    const ctx = canvas.getContext('2d');

    const successRate = stats.successRate;
    const successCount = stats.successCount;
    const totalDays = stats.total;

    // Gauge center text plugin
    const gaugeCenterText = {
        id: 'gaugeCenterText',
        afterDraw(chart) {
            const { ctx, chartArea: { left, right, top, bottom } } = chart;
            ctx.save();

            const centerX = (left + right) / 2;
            const centerY = (top + bottom) / 2;

            // Draw Percentage
            ctx.font = 'bold 28px Roboto';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${successRate}%`, centerX, centerY - 6);

            // Draw X of X days
            ctx.font = '500 11px Roboto';
            ctx.fillStyle = '#a0aec0';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${successCount} из ${totalDays} дней`, centerX, centerY + 16);

            ctx.restore();
        }
    };

    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [successRate, 100 - successRate],
                backgroundColor: [
                    '#4facfe',
                    'rgba(255, 255, 255, 0.05)'
                ],
                borderWidth: 0,
                circumference: 360,
                rotation: 0,
                cutout: '93%',
                borderRadius: 2
            }]
        },
        plugins: [gaugeCenterText],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            events: [] // Disable interactions
        }
    });
}
