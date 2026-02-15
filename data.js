// Data module: fetching from Google Sheets and data transformations

// Constants
const HEIGHT_CM = 175;
const STORAGE_KEY_SETTINGS = 'kbju_dashboard_settings';
const STORAGE_KEY_SHEET_URL = 'kbju_dashboard_sheet_url';
const DEFAULT_SHEET_URL = 'https://script.google.com/macros/s/AKfycbznZ_9b18vk8Gs3ys41scrYs0j2c3522zF-xtXVioF9dhesw6-JRvMywow-3GbnmyBJJw/exec';

// Default target values (can be overridden in settings)
let targets = {
  bmi: 25,
  proteins: 150,
  fats: 80,
  carbs: 220,
  calorieZones: {
    unhealthyDeficit: 1700,
    fastLoss: 1900,
    healthyLoss: 2200,
    slowLoss: 2400,
    maintenance: 2600,
    surplus: 10000 // Upper bound for surplus (virtual)
  }
};

// Color scheme
const colors = {
  background: "#0f0f1a",
  primary: "#4facfe",
  targetLine: "#ef4444",
  proteins: "#fbbf24",
  fats: "#4facfe",
  carbs: "#94a3b8",
  zones: {
    unhealthyDeficit: "#FF6B6B",
    fastLoss: "#ABEBC6",
    healthyLoss: "#27AE60",
    slowLoss: "#ABEBC6",
    maintenance: "#FFB74D",
    surplus: "#FF6B6B"
  },
  positive: "#22c55e",
  negative: "#ef4444",
  neutral: "#a0aec0"
};

// Data storage
let weightData = [];
let kbjuData = [];

// Load settings from localStorage
function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migrate old keys if necessary (simple check)
      if (parsed.calorieZones && parsed.calorieZones.severeDeficit) {
        parsed.calorieZones.unhealthyDeficit = parsed.calorieZones.severeDeficit;
        delete parsed.calorieZones.severeDeficit;
      }
      targets = { ...targets, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
}

// Save settings to localStorage
function saveSettings(newSettings) {
  try {
    targets = { ...targets, ...newSettings };
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(targets));
    return true;
  } catch (e) {
    console.error('Failed to save settings:', e);
    return false;
  }
}

// Get Google Sheets URL (from localStorage or hardcoded default)
function getSheetUrl() {
  return localStorage.getItem(STORAGE_KEY_SHEET_URL) || DEFAULT_SHEET_URL;
}

// Save Google Sheets URL to localStorage
function saveSheetUrl(url) {
  localStorage.setItem(STORAGE_KEY_SHEET_URL, url);
}

// Calculate BMI
function calculateBMI(weight, heightCm = HEIGHT_CM) {
  if (!weight || weight <= 0) return null;
  const heightM = heightCm / 100;
  return parseFloat((weight / (heightM * heightM)).toFixed(1));
}

// Get Week Ending Sunday date string (YYYY-MM-DD) for a given date
// Used to label the "end" of the week (Sunday inclusive)
function getWeekEndingSunday(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  // Calculate current week's Monday (ISO week starts Monday)
  // day 0 (Sun) -> diff -6. day 1 (Mon) -> diff 0.
  // We want to align to the Monday of the current week.
  // Standard formula: date - day + (day == 0 ? -6 : 1) works to find Monday.
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);

  // Set to Sunday (Current Monday + 6 days)
  const sunday = new Date(date.setDate(diff + 6));

  return sunday.toISOString().split('T')[0];
}

// Format date string YYYY-MM-DD to DD.MM
function formatDateDDMM(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${day.padStart(2, '0')}.${month.padStart(2, '0')}`;
}

// Determine calorie category
// Determine calorie category
function getCalorieCategory(calories) {
  const zones = targets.calorieZones;
  if (calories < zones.unhealthyDeficit) return 'unhealthyDeficit';
  if (calories < zones.fastLoss) return 'fastLoss';
  if (calories < zones.healthyLoss) return 'healthyLoss';
  if (calories < zones.slowLoss) return 'slowLoss';
  if (calories < zones.maintenance) return 'maintenance';
  return 'surplus';
}

// Fetch data from Google Sheets
async function fetchDataFromSheets(sheetUrl) {
  if (!sheetUrl) {
    throw new Error('Google Sheets URL не указан. Добавьте URL в настройках.');
  }

  const response = await fetch(sheetUrl);
  if (!response.ok) {
    throw new Error(`Ошибка загрузки: ${response.status}`);
  }

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Unknown error from Sheets');
  }

  // Process weight data
  weightData = (data.weight || []).map(row => {
    const w = parseFloat(row.weight);
    return {
      date: row.date,
      weight: !isNaN(w) && w > 0 ? w : null,
      bmi: !isNaN(w) && w > 0 ? calculateBMI(w) : null,
      week: getWeekEndingSunday(row.date), // Use Sunday as grouping key
      year: new Date(row.date).getFullYear()
    };
  }).filter(row => row.weight !== null);

  // Process KBJU data
  kbjuData = (data.kbju || []).map(row => ({
    date: row.date,
    calories: parseFloat(row.calories),
    proteins: row.proteins ? parseFloat(row.proteins) : null,
    fats: row.fats ? parseFloat(row.fats) : null,
    carbs: row.carbs ? parseFloat(row.carbs) : null,
    category: getCalorieCategory(parseFloat(row.calories)),
    week: getWeekEndingSunday(row.date), // Use Sunday as grouping key
    month: new Date(row.date).toLocaleString('en', { month: 'short' })
  })).filter(row => !isNaN(row.calories) && row.calories > 0);

  return { weightData, kbjuData };
}

// Get weekly averages for weight/BMI
function getWeeklyAverages(data) {
  const weeks = {};
  const today = new Date().toISOString().split('T')[0];

  // Helper to get stats for a week
  const getWeeklyNutrition = (weekKey) => {
    const weeklyCalories = kbjuData
      .filter(d => d.week === weekKey)
      .map(d => d.calories);

    if (weeklyCalories.length === 0) return { avg: null, category: null };
    const avgCal = Math.round(weeklyCalories.reduce((a, b) => a + b, 0) / weeklyCalories.length);
    return { avg: avgCal, category: getCalorieCategory(avgCal) };
  };

  data.forEach(item => {
    const weekKey = item.week;
    const sunday = new Date(weekKey);
    const monday = new Date(sunday);
    monday.setDate(monday.getDate() - 6);
    const mondayStr = monday.toISOString().split('T')[0];

    // Skip if the week starts in the future
    if (mondayStr > today) return;

    if (!weeks[weekKey]) {
      const nutrition = getWeeklyNutrition(weekKey);
      weeks[weekKey] = {
        weight: [],
        bmi: [],
        isIncomplete: weekKey > today,
        avgCalories: nutrition.avg,
        calorieCategory: nutrition.category
      };
    }
    if (item.weight && item.weight > 0) weeks[weekKey].weight.push(item.weight);
    if (item.bmi && item.bmi > 0) weeks[weekKey].bmi.push(item.bmi);
  });

  return Object.entries(weeks)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekKey, values]) => ({
      week: formatDateDDMM(weekKey),
      fullDate: weekKey,
      avgWeight: values.weight.length > 0
        ? (values.weight.reduce((a, b) => a + b, 0) / values.weight.length).toFixed(1)
        : null,
      avgBmi: values.bmi.length > 0
        ? (values.bmi.reduce((a, b) => a + b, 0) / values.bmi.length).toFixed(1)
        : null,
      isIncomplete: values.isIncomplete,
      avgCalories: values.avgCalories,
      calorieCategory: values.calorieCategory
    }));
}

// Aggregate data by week for charts
// Uses fullData to calculate averages for all weeks that have at least one day in filteredData
function aggregateDataByWeek(fullData, filteredData, key) {
  const visibleWeeks = new Set(filteredData.map(d => getWeekEndingSunday(d.date)));
  const weeklyMap = {};
  const today = new Date().toISOString().split('T')[0];

  fullData.forEach(d => {
    if (d[key] === null) return;
    const weekKey = getWeekEndingSunday(d.date);
    if (!visibleWeeks.has(weekKey)) return;

    if (!weeklyMap[weekKey]) {
      weeklyMap[weekKey] = {
        sum: 0,
        count: 0,
        isIncomplete: weekKey > today
      };
    }
    weeklyMap[weekKey].sum += d[key];
    weeklyMap[weekKey].count++;
  });

  return Object.entries(weeklyMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, values]) => ({
      date: date,
      [key]: values.sum / values.count,
      isWeekly: true,
      isIncomplete: values.isIncomplete
    }));
}

// Get category distribution for donut chart
function getCategoryDistribution(data) {
  const categories = {};
  data.forEach(item => {
    categories[item.category] = (categories[item.category] || 0) + 1;
  });
  return categories;
}

// Get macro stats (average and success rate)
function getMacroStats(data, macro) {
  const validData = data.filter(item => item[macro] !== null);
  if (validData.length === 0) return { avg: 0, distribution: { below: 0, within: 0, above: 0 }, total: 0, successRate: 0 };

  const avg = validData.reduce((sum, item) => sum + item[macro], 0) / validData.length;

  const target = targets[macro];
  const distribution = { below: 0, within: 0, above: 0 };
  let successCount = 0;

  validData.forEach(item => {
    const val = item[macro];
    if (val < target) distribution.below++;
    else if (val > target) distribution.above++;
    else distribution.within++;

    // Success criteria
    if (macro === 'proteins') {
      if (val >= target) successCount++;
    } else if (macro === 'fats') {
      if (val <= target) successCount++;
    } else if (macro === 'carbs') {
      // For carbs, let's say success is within +/- 10% of target
      if (Math.abs(val - target) / target <= 0.1) successCount++;
    }
  });

  const successRate = (successCount / validData.length) * 100;

  return {
    avg: avg.toFixed(1),
    distribution,
    total: validData.length,
    successCount: successCount,
    successRate: Math.round(successRate)
  };
}

// Filter data by date range
function filterByDateRange(data, startDate, endDate) {
  return data.filter(item => {
    const itemDate = new Date(item.date);
    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    if (start && itemDate < start) return false;
    if (end && itemDate > end) return false;
    return true;
  });
}

// Get date range from data
function getDateRange(data) {
  if (!data || data.length === 0) {
    const today = new Date().toISOString().split('T')[0];
    return { min: today, max: today };
  }
  const dates = data.map(d => d.date).sort();
  return { min: dates[0], max: dates[dates.length - 1] };
}

// Initialize settings on load
loadSettings();
