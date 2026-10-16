const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const timeoutSignal = (ms = 12000) => AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;

async function fetchJSON(url) {
  const response = await fetch(url, { signal: timeoutSignal() });
  if (!response.ok) throw new Error(`Weather service returned an error (${response.status}). Please try again.`);
  return response.json();
}
const cToF = c => c * 9 / 5 + 32;
const formatTemp = (value, unit) => Number.isFinite(value) ? `${Math.round(unit === "fahrenheit" ? cToF(value) : value)}°` : "--°";
const formatClock = value => {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value).slice(-5) : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};
const conditionFromCode = code => {
  if (code === 0) return ["Clear sky", "☀️"];
  if ([1,2].includes(code)) return ["Mainly clear", "🌤️"];
  if (code === 3) return ["Overcast", "☁️"];
  if ([45,48].includes(code)) return ["Foggy", "🌫️"];
  if ([51,53,55,56,57].includes(code)) return ["Drizzle", "🌦️"];
  if ([61,63,65,66,67,80,81,82].includes(code)) return ["Rain", "🌧️"];
  if ([71,73,75,77,85,86].includes(code)) return ["Snow", "❄️"];
  if ([95,96,99].includes(code)) return ["Thunderstorm", "⛈️"];
  return ["Conditions unavailable", "🌡️"];
};
const dayLabel = (date, index) => index === 0 ? "Today" : new Date(`${date}T12:00:00`).toLocaleDateString(undefined,{weekday:"short"});
const weatherURL = (lat, lon) => `${WEATHER_URL}?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max&timezone=auto&forecast_days=7`;

export async function searchCity(query) {
  const term = String(query || "").trim();
  if (term.length < 2) throw new Error("Enter at least two letters to search for a city.");
  const url = `${GEO_URL}?name=${encodeURIComponent(term)}&count=8&language=en&format=json`;
  const data = await fetchJSON(url);
  if (!data.results?.length) throw new Error(`No city found for “${term}”. Check the spelling and try again.`);
  const results = data.results;
  const exact = results.find(place => place.name.toLocaleLowerCase() === term.toLocaleLowerCase());
  return exact || results[0];
}

export async function fetchWeather(latitude, longitude) {
  const data = await fetchJSON(weatherURL(latitude, longitude));
  if (!data.current || !data.daily) throw new Error("The weather service returned incomplete weather data.");
  return data;
}

export function describeWeather(code) { return conditionFromCode(code); }
export function temperature(value, unit) { return formatTemp(value, unit); }
export function clockTime(value) { return formatClock(value); }
export function weekdayLabel(date, index) { return dayLabel(date, index); }

export function renderWeather(data, place, unit) {
  const current = data.current, daily = data.daily, todayCode = current.weather_code;
  const [condition, icon] = conditionFromCode(todayCode);
  const cityName = place.name || "Selected location";
  const country = place.country || "";
  const locationText = [cityName, country].filter(Boolean).join(", ");
  document.getElementById("weather-heading").textContent = condition;
  document.getElementById("weather-location").textContent = locationText;
  document.getElementById("weather-icon").textContent = icon;
  document.getElementById("current-temp").replaceChildren(document.createTextNode(formatTemp(current.temperature_2m, unit).replace("°", "")));
  const tempUnit = unit === "fahrenheit" ? "F" : "C";
  const suffix = `°${tempUnit}`;
  const high = formatTemp(daily.temperature_2m_max?.[0], unit), low = formatTemp(daily.temperature_2m_min?.[0], unit);
  document.getElementById("current-temp").append(document.createElement("span"));
  document.getElementById("current-temp").lastElementChild.textContent = suffix;
  document.getElementById("current-condition").textContent = condition;
  document.getElementById("today-high-low").textContent = `High ${high} · Low ${low}`;
  document.getElementById("feels-like").textContent = formatTemp(current.apparent_temperature, unit);
  document.getElementById("humidity").textContent = Number.isFinite(current.relative_humidity_2m) ? `${current.relative_humidity_2m}%` : "--";
  document.getElementById("wind-speed").textContent = Number.isFinite(current.wind_speed_10m) ? `${Math.round(current.wind_speed_10m)} km/h` : "-- km/h";
  document.getElementById("rain-chance").textContent = Number.isFinite(daily.precipitation_probability_max?.[0]) ? `${daily.precipitation_probability_max[0]}%` : "--";
  document.getElementById("sun-times").textContent = `Sunrise ${formatClock(daily.sunrise?.[0])} · Sunset ${formatClock(daily.sunset?.[0])}`;
  document.getElementById("weather-updated").textContent = `Updated ${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`;

  const forecastGrid = document.getElementById("forecast-grid");
  forecastGrid.replaceChildren();
  daily.time.forEach((date, index) => {
    const [desc, emoji] = conditionFromCode(daily.weather_code[index]);
    const card = document.createElement("article"); card.className = "forecast-card";
    const day = document.createElement("div"); day.className = "forecast-day"; day.textContent = dayLabel(date,index);
    const weatherIcon = document.createElement("span"); weatherIcon.className = "forecast-icon"; weatherIcon.textContent = emoji; weatherIcon.setAttribute("aria-label",desc);
    const conditionText = document.createElement("div"); conditionText.className = "forecast-condition"; conditionText.textContent = desc;
    const temps = document.createElement("div"); temps.className = "forecast-temps";
    const max = document.createElement("span"); max.textContent = formatTemp(daily.temperature_2m_max[index],unit);
    const min = document.createElement("span"); min.textContent = formatTemp(daily.temperature_2m_min[index],unit);
    temps.append(max,min);
    const rain = document.createElement("div"); rain.className = "forecast-rain";
    rain.textContent = Number.isFinite(daily.precipitation_probability_max?.[index]) ? `☂ ${daily.precipitation_probability_max[index]}%` : "";
    card.append(day,weatherIcon,conditionText,temps,rain); forecastGrid.append(card);
  });

  const hourList = document.getElementById("hourly-weather");
  if (hourList) {
    hourList.replaceChildren();
    const nowTime = current.time || "";
    let startIndex = data.hourly.time.findIndex(time => time >= nowTime);
    if (startIndex < 0) startIndex = 0;
    data.hourly.time.slice(startIndex,startIndex+12).forEach((time,index) => {
      const actualIndex = startIndex + index;
      const [desc, emoji] = conditionFromCode(data.hourly.weather_code[actualIndex]);
      const item = document.createElement("div"); item.className = "hourly-item";
      for (const [tag,cls,text] of [["small","",formatClock(time)],["span","",emoji],["strong","",formatTemp(data.hourly.temperature_2m[actualIndex],unit)],["small","",`${data.hourly.precipitation_probability?.[actualIndex] ?? "--"}% rain`]]) {
        const el = document.createElement(tag); if(cls)el.className=cls; el.textContent=text; item.append(el);
      }
      item.setAttribute("aria-label",`${formatClock(time)}, ${desc}`); hourList.append(item);
    });
  }

  document.getElementById("planner-weather-icon").textContent = icon;
  document.getElementById("planner-temp").textContent = `${formatTemp(current.temperature_2m,unit)}${tempUnit}`;
  document.getElementById("planner-condition").textContent = condition;
  const rainChance = daily.precipitation_probability_max?.[0];
  const wind = current.wind_speed_10m;
  document.getElementById("planner-weather-summary").textContent = `High ${high}, low ${low}. ${Number.isFinite(rainChance) ? `${rainChance}% chance of precipitation today.` : ""} ${Number.isFinite(wind) ? `Wind ${Math.round(wind)} km/h.` : ""}`;
  const warning = document.getElementById("planner-weather-warning");
  const warningMessages = [];
  if (Number.isFinite(rainChance) && rainChance >= 60) warningMessages.push(`Rain is likely (${rainChance}% forecast chance). Consider a backup plan for outdoor activities.`);
  if (Number.isFinite(wind) && wind >= 40) warningMessages.push(`Strong winds are forecast (${Math.round(wind)} km/h). Check local conditions before outdoor activities.`);
  warning.hidden = warningMessages.length === 0;
  warning.textContent = warningMessages.join(" ");
  return { city: cityName, country, latitude: place.latitude, longitude: place.longitude, data };
}
