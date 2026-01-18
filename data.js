// Data module: fetching from Google Sheets and data transformations

// Constants
const HEIGHT_CM = 175;
const STORAGE_KEY_SETTINGS = 'kbju_dashboard_settings';
const STORAGE_KEY_SHEET_URL = 'kbju_dashboard_sheet_url';

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
    healthyLoss: "#58D68D",
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

// Get Google Sheets URL from localStorage
function getSheetUrl() {
  return localStorage.getItem(STORAGE_KEY_SHEET_URL) || '';
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
function getCalorieCategory(calories) {
  const zones = targets.calorieZones;
  if (calories < zones.unhealthyDeficit) return 'unhealthy_deficit';
  if (calories < zones.fastLoss) return 'fast_loss';
  if (calories < zones.healthyLoss) return 'healthy_loss';
  if (calories < zones.slowLoss) return 'slow_loss';
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
  weightData = (data.weight || []).map(row => ({
    date: row.date,
    weight: row.weight,
    bmi: calculateBMI(row.weight),
    week: getWeekEndingSunday(row.date), // Use Sunday as grouping key
    year: new Date(row.date).getFullYear()
  })).filter(row => row.weight !== null && row.weight !== '');

  // Process KBJU data
  kbjuData = (data.kbju || []).map(row => ({
    date: row.date,
    calories: row.calories,
    proteins: row.proteins || null,
    fats: row.fats || null,
    carbs: row.carbs || null,
    category: getCalorieCategory(row.calories),
    week: getWeekEndingSunday(row.date), // Use Sunday as grouping key
    month: new Date(row.date).toLocaleString('en', { month: 'short' })
  })).filter(row => row.calories !== null && row.calories !== '');

  return { weightData, kbjuData };
}

// Get weekly averages for weight/BMI
function getWeeklyAverages(data) {
  const weeks = {};
  const today = new Date().toISOString().split('T')[0];

  data.forEach(item => {
    // Determine the grouping week key (Sunday)
    const weekKey = item.week;

    // Calculate the start of the week (Monday)
    const sunday = new Date(weekKey);
    const monday = new Date(sunday);
    monday.setDate(monday.getDate() - 6);
    const mondayStr = monday.toISOString().split('T')[0];

    // Skip if the week starts in the future (entirely future week)
    if (mondayStr > today) return;

    if (!weeks[weekKey]) {
      weeks[weekKey] = { weight: [], bmi: [], isIncomplete: weekKey > today };
    }
    if (item.weight !== null) weeks[weekKey].weight.push(item.weight);
    if (item.bmi !== null) weeks[weekKey].bmi.push(item.bmi);
  });

  return Object.entries(weeks)
    .sort((a, b) => a[0].localeCompare(b[0])) // Sort by YYYY-MM-DD key
    .map(([weekKey, values]) => ({
      week: formatDateDDMM(weekKey), // Format to DD.MM
      fullDate: weekKey, // Keep full date for tooltips
      avgWeight: values.weight.length > 0
        ? (values.weight.reduce((a, b) => a + b, 0) / values.weight.length).toFixed(1)
        : null,
      avgBmi: values.bmi.length > 0
        ? (values.bmi.reduce((a, b) => a + b, 0) / values.bmi.length).toFixed(1)
        : null,
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
