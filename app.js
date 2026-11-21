/* ------------------------------------------------------------------
   Skyline Weather — client
   Fetches live data from our own /api/weather proxy (the WeatherAPI key
   never reaches the browser), then renders the current conditions and
   the six-day outlook.
   ------------------------------------------------------------------ */

(() => {
  "use strict";

  const DEFAULT_CITY = "Mumbai";
  const UNIT_KEY = "skyline-unit";
  const REQUEST_TIMEOUT_MS = 12000;

  const state = {
    unit: readUnit(),
    city: DEFAULT_CITY,
    lastQuery: DEFAULT_CITY,
    data: null,
    controller: null,
  };

  const $ = (id) => document.getElementById(id);

  const els = {
    body: document.body,
    searchForm: $("searchForm"),
    cityInput: $("cityInput"),
    searchBtn: $("searchBtn"),
    status: $("status"),
    errorPanel: $("errorPanel"),
    errorTitle: $("errorTitle"),
    errorMessage: $("errorMessage"),
    retryBtn: $("retryBtn"),
    weather: $("weather"),
    heroCity: $("heroCity"),
    placeName: $("placeName"),
    placeMeta: $("placeMeta"),
    localTime: $("localTime"),
    updatedText: $("updatedText"),
    conditionIcon: $("conditionIcon"),
    tempValue: $("tempValue"),
    tempUnit: $("tempUnit"),
    conditionText: $("conditionText"),
    feelsLike: $("feelsLike"),
    lowTemp: $("lowTemp"),
    highTemp: $("highTemp"),
    rangeFill: $("rangeFill"),
    rangeDot: $("rangeDot"),
    stats: $("stats"),
    sunrise: $("sunrise"),
    sunset: $("sunset"),
    sunDot: $("sunDot"),
    daylight: $("daylight"),
    uvIndex: $("uvIndex"),
    cloudCover: $("cloudCover"),
    rainChance: $("rainChance"),
    moonPhase: $("moonPhase"),
    forecastChart: $("forecastChart"),
    unitButtons: Array.from(document.querySelectorAll(".unit-toggle__btn")),
    chips: Array.from(document.querySelectorAll(".chip[data-city]")),
  };

  /* ----------------------------------------------------------------
     Helpers
     ---------------------------------------------------------------- */

  function readUnit() {
    try {
      return localStorage.getItem(UNIT_KEY) === "f" ? "f" : "c";
    } catch (error) {
      return "c";
    }
  }

  function saveUnit(unit) {
    try {
      localStorage.setItem(UNIT_KEY, unit);
    } catch (error) {
      /* storage can be unavailable in private mode — not critical */
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (character) => {
      switch (character) {
        case "&": return "&amp;";
        case "<": return "&lt;";
        case ">": return "&gt;";
        case '"': return "&quot;";
        default: return "&#39;";
      }
    });
  }

  function iconUrl(icon, size) {
    if (!icon) return "";
    const scaled = String(icon).replace("64x64", `${size}x${size}`);
    return scaled.startsWith("//") ? `https:${scaled}` : scaled;
  }

  function formatClock(value) {
    if (!value) return "--";
    const match = String(value).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return String(value);
    let hours = Number(match[1]);
    const minutes = match[2];
    const suffix = match[3] ? match[3].toUpperCase() : null;
    if (suffix) return `${hours}:${minutes} ${suffix}`;
    const period = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${period}`;
  }

  function minutesSinceMidnight(value) {
    const match = String(value || "").match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return null;
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const suffix = match[3] ? match[3].toUpperCase() : null;
    if (suffix === "PM" && hours !== 12) hours += 12;
    if (suffix === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  function formatDay(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }

  function formatShortDate(dateString) {
    const date = new Date(`${dateString}T12:00:00`);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function uvLabel(uv) {
    const value = Number(uv) || 0;
    if (value < 3) return "Low";
    if (value < 6) return "Moderate";
    if (value < 8) return "High";
    if (value < 11) return "Very high";
    return "Extreme";
  }

  function themeFor(code, isDay) {
    if (!isDay) return "night";
    const c = Number(code);
    const snow = new Set([1066, 1069, 1114, 1117, 1204, 1207, 1210, 1213, 1216, 1219, 1222, 1225, 1237, 1249, 1252, 1255, 1258, 1261, 1264]);
    const rain = new Set([1063, 1072, 1150, 1153, 1168, 1171, 1180, 1183, 1186, 1189, 1192, 1195, 1198, 1201, 1240, 1243, 1246]);
    const storm = new Set([1087, 1273, 1276, 1279, 1282]);
    const fog = new Set([1012, 1015, 1018, 1021, 1024, 1027, 1030, 1033, 1036, 1039, 1042, 1045, 1048]);

    if (c === 1000) return "sunny";
    if (snow.has(c)) return "snow";
    if (storm.has(c)) return "storm";
    if (rain.has(c)) return "rain";
    if (fog.has(c)) return "fog";
    return "cloudy";
  }

  function setStatus(message, kind) {
    els.status.textContent = message || "";
    els.status.className = "status";
    if (kind === "busy") els.status.classList.add("is-busy");
    if (kind === "error") els.status.classList.add("is-error");
  }

  function setLoading(loading) {
    els.weather.classList.toggle("is-loading", loading);
    els.weather.setAttribute("aria-busy", String(loading));
    els.searchForm.classList.toggle("is-loading", loading);
    els.searchForm.setAttribute("aria-busy", String(loading));
    // Keep the button enabled so a new search can supersede a slow one.
  }

  function showError(title, message) {
    els.errorTitle.textContent = title;
    els.errorMessage.textContent = message;
    els.errorPanel.hidden = false;
  }

  function hideError() {
    els.errorPanel.hidden = true;
  }

  /* ----------------------------------------------------------------
     Rendering
     ---------------------------------------------------------------- */

  function render(data) {
    const { location, current, today, forecast } = data;
    const condition = current.condition || {};
    const isF = state.unit === "f";

    const temp = (celsius, fahrenheit) => `${Math.round(isF ? fahrenheit : celsius)}°`;
    const unitSuffix = isF ? "°F" : "°C";

    document.body.dataset.theme = themeFor(condition.code, current.is_day);

    els.heroCity.textContent = location.name;
    els.placeName.textContent = location.name;

    const meta = [location.region, location.country].filter(Boolean).join(", ");
    const localTime = String(location.localtime || "").split(" ")[1] || "";
    els.placeMeta.innerHTML = `${escapeHtml(meta)} · <span id="localTime">${escapeHtml(formatClock(localTime))}</span>`;
    els.localTime = $("localTime");

    els.updatedText.textContent = `Updated ${formatClock(current.last_updated)}`;
    els.tempValue.textContent = Math.round(isF ? current.temp_f : current.temp_c);
    els.tempUnit.textContent = unitSuffix;
    els.conditionText.textContent = condition.text || "—";
    els.feelsLike.textContent = temp(current.feelslike_c, current.feelslike_f);

    els.conditionIcon.src = iconUrl(condition.icon, 128);
    els.conditionIcon.alt = condition.text ? `${condition.text} weather icon` : "";

    const lowC = today.mintemp_c;
    const lowF = today.mintemp_f;
    const highC = today.maxtemp_c;
    const highF = today.maxtemp_f;
    els.lowTemp.textContent = temp(lowC, lowF);
    els.highTemp.textContent = temp(highC, highF);

    const currentValue = isF ? current.temp_f : current.temp_c;
    const lowValue = isF ? lowF : lowC;
    const highValue = isF ? highF : highC;
    const span = highValue - lowValue;
    const progress = span > 0 ? Math.min(1, Math.max(0, (currentValue - lowValue) / span)) : 0.5;
    els.rangeFill.style.width = `${Math.round(progress * 100)}%`;
    els.rangeDot.style.left = `${Math.round(progress * 100)}%`;

    const windValue = isF ? current.wind_mph : current.wind_kph;
    const windUnit = isF ? "mph" : "km/h";
    const visibility = isF ? current.vis_miles : current.vis_km;
    const visibilityUnit = isF ? "mi" : "km";

    const stats = [
      {
        label: "Feels like",
        value: temp(current.feelslike_c, current.feelslike_f),
        icon: '<path d="M10 13.7V5a2 2 0 1 1 4 0v8.7a4 4 0 1 1-4 0Z" />',
      },
      {
        label: "Humidity",
        value: `${Math.round(current.humidity)}%`,
        icon: '<path d="M12 3.4s5.6 5.3 5.6 9.1a5.6 5.6 0 1 1-11.2 0C6.4 8.7 12 3.4 12 3.4Z" />',
      },
      {
        label: current.wind_dir ? `Wind · ${current.wind_dir}` : "Wind",
        value: `${Math.round(windValue)} ${windUnit}`,
        icon: '<path d="M3 8h10.2a2.8 2.8 0 1 0-2.8-2.8" /><path d="M3 12.2h14.2a2.8 2.8 0 1 1-2.8 2.8" /><path d="M3 16.4h7" />',
      },
      {
        label: "Pressure",
        value: `${Math.round(current.pressure_mb)} hPa`,
        icon: '<circle cx="12" cy="12" r="8.2" /><path d="M12 12l3.4-3.4" /><path d="M12 3.8v1.4M20.2 12h-1.4M12 20.2v-1.4M3.8 12h1.4" />',
      },
      {
        label: "Visibility",
        value: `${Number(visibility).toFixed(visibility >= 10 ? 0 : 1)} ${visibilityUnit}`,
        icon: '<path d="M2.6 12S6.1 5.9 12 5.9 21.4 12 21.4 12 17.9 18.1 12 18.1 2.6 12 2.6 12Z" /><circle cx="12" cy="12" r="2.9" />',
      },
      {
        label: "UV index",
        value: `${Math.round(current.uv)} ${uvLabel(current.uv)}`,
        icon: '<circle cx="12" cy="12" r="4" /><path d="M12 2.6v2M12 19.4v2M2.6 12h2M19.4 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />',
      },
    ];

    els.stats.innerHTML = stats
      .map(
        (item) => `
          <div class="stat">
            <svg class="stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${item.icon}</svg>
            <div class="stat__body">
              <span class="stat__label">${escapeHtml(item.label)}</span>
              <span class="stat__value">${escapeHtml(item.value)}</span>
            </div>
          </div>`
      )
      .join("");

    els.sunrise.textContent = formatClock(today.sunrise);
    els.sunset.textContent = formatClock(today.sunset);
    els.uvIndex.textContent = `${Math.round(today.uv)} ${uvLabel(today.uv)}`;
    els.cloudCover.textContent = `${Math.round(current.cloud)}%`;
    els.rainChance.textContent = `${Math.round(today.daily_chance_of_rain)}%`;

    const sunriseMinutes = minutesSinceMidnight(today.sunrise);
    const sunsetMinutes = minutesSinceMidnight(today.sunset);
    if (sunriseMinutes != null && sunsetMinutes != null) {
      const dayLength = Math.max(0, sunsetMinutes - sunriseMinutes);
      els.daylight.textContent = `${Math.floor(dayLength / 60)}h ${dayLength % 60}m`;

      const nowMinutes = minutesSinceMidnight(localTime);
      if (nowMinutes != null && nowMinutes >= sunriseMinutes && nowMinutes <= sunsetMinutes && dayLength > 0) {
        const fraction = (nowMinutes - sunriseMinutes) / dayLength;
        const radius = 96;
        const x = 120 - radius * Math.cos(Math.PI * fraction);
        const y = 110 - radius * Math.sin(Math.PI * fraction);
        els.sunDot.setAttribute("cx", x.toFixed(1));
        els.sunDot.setAttribute("cy", y.toFixed(1));
        els.sunDot.setAttribute("opacity", "1");
      } else {
        els.sunDot.setAttribute("opacity", "0");
      }
    }

    els.moonPhase.textContent = today.moon_phase
      ? `Moon · ${today.moon_phase}${today.moon_illumination ? ` · ${today.moon_illumination}% illuminated` : ""}`
      : "";

    renderForecast(forecast || [], isF);

    document.title = `${Math.round(isF ? current.temp_f : current.temp_c)}${unitSuffix} in ${location.name} — Skyline Weather`;
  }

  function renderForecast(days, isF) {
    if (!days.length) {
      els.forecastChart.innerHTML = "";
      return;
    }

    const highs = days.map((day) => (isF ? day.maxtemp_f : day.maxtemp_c));
    const lowestHigh = Math.min(...highs);
    const highestHigh = Math.max(...highs);
    const spread = Math.max(highestHigh - lowestHigh, 1);

    els.forecastChart.style.setProperty("--cols", String(days.length));

    els.forecastChart.innerHTML = days
      .map((day, index) => {
        const condition = day.condition || {};
        const max = Math.round(isF ? day.maxtemp_f : day.maxtemp_c);
        const min = Math.round(isF ? day.mintemp_f : day.mintemp_c);
        const barPercent = Math.round(30 + ((highs[index] - lowestHigh) / spread) * 70);
        const rain = Math.round(day.daily_chance_of_rain || 0);
        const rainClass = rain > 0 ? "day__rain" : "day__rain day__rain--none";
        const rainIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5s5.4 5 5.4 8.8a5.4 5.4 0 1 1-10.8 0C6.6 8.5 12 3.5 12 3.5Z" /></svg>';

        return `
          <article class="day" role="listitem" style="--i:${index}" title="${escapeHtml(condition.text || "")} — high ${max}°, low ${min}°, ${rain}% chance of rain">
            <span class="day__name">${escapeHtml(formatDay(day.date))}</span>
            <span class="day__date">${escapeHtml(formatShortDate(day.date))}</span>
            <img class="day__icon" src="${escapeHtml(iconUrl(condition.icon, 64))}" alt="${escapeHtml(condition.text || "Forecast")}" width="38" height="38" loading="lazy" />
            <span class="day__max">${max}°</span>
            <span class="day__track" aria-hidden="true"><span class="day__bar" style="height:${barPercent}%"></span></span>
            <span class="day__min">${min}°</span>
            <span class="${rainClass}">${rainIcon}${rain}%</span>
          </article>`;
      })
      .join("");
  }

  /* ----------------------------------------------------------------
     Data loading
     ---------------------------------------------------------------- */

  function friendlyError(error, city) {
    const status = error && error.status;
    const raw = error && error.message ? error.message : "";

    if (error && error.name === "AbortError" && error.timedOut) {
      return {
        title: "The request timed out",
        message: "The weather service took too long to respond. Please try again.",
      };
    }

    if (status === 404 || /no matching location/i.test(raw)) {
      return {
        title: "City not found",
        message: `We couldn't find “${city}”. Check the spelling, or try a nearby city or district.`,
      };
    }

    if (status === 429) {
      return {
        title: "Too many requests",
        message: "The weather service is a little busy right now. Give it a few seconds and try again.",
      };
    }

    if (status === 401 || status === 403) {
      return {
        title: "Weather service unavailable",
        message: "The weather service rejected the request. Please try again later.",
      };
    }

    if (status >= 500) {
      return {
        title: "Weather service unavailable",
        message: raw || "The weather service is temporarily unavailable. Please try again in a moment.",
      };
    }

    if (error instanceof TypeError || /failed to fetch|network/i.test(raw)) {
      return {
        title: "Connection problem",
        message: "We can't reach the weather service. Check your internet connection and try again.",
      };
    }

    return {
      title: "Couldn't load the weather",
      message: raw || "Something went wrong while fetching the forecast. Please try again.",
    };
  }

  async function loadWeather(city, options) {
    const settings = options || {};
    const query = String(city || "").trim();

    if (!query) {
      setStatus("Enter a city name to see its weather.", "error");
      els.cityInput.focus();
      return;
    }

    if (state.controller) state.controller.abort();

    const controller = new AbortController();
    state.controller = controller;
    state.lastQuery = query;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    setLoading(true);
    hideError();
    setStatus(`Fetching live weather for ${query}…`, "busy");

    try {
      const response = await fetch(`/api/weather?q=${encodeURIComponent(query)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const apiMessage = payload && payload.error && payload.error.message;
        const error = new Error(apiMessage || `Request failed with status ${response.status}`);
        error.status = response.status;
        throw error;
      }

      if (!payload || !payload.location || !payload.current || !payload.today) {
        throw new Error("The weather service returned an unexpected response.");
      }

      state.data = payload;
      state.city = payload.location.name;
      render(payload);
      setStatus("");

      if (settings.updateUrl !== false) {
        try {
          const url = new URL(window.location.href);
          if (payload.location.name.toLowerCase() === DEFAULT_CITY.toLowerCase()) {
            url.searchParams.delete("city");
          } else {
            url.searchParams.set("city", payload.location.name);
          }
          window.history.replaceState({}, "", url);
        } catch (error) {
          /* history may be unavailable in embedded contexts */
        }
      }

      els.cityInput.value = "";
      if (document.activeElement === els.cityInput) els.cityInput.blur();
    } catch (error) {
      if (controller.signal.aborted && !timedOut) {
        return; // a newer search replaced this one
      }

      if (timedOut) error.timedOut = true;

      const friendly = friendlyError(error, query);
      showError(friendly.title, friendly.message);
      setStatus(friendly.message, "error");
    } finally {
      clearTimeout(timer);
      if (state.controller === controller) {
        state.controller = null;
        setLoading(false);
      }
    }
  }

  /* ----------------------------------------------------------------
     Events
     ---------------------------------------------------------------- */

  function applyUnit(unit, persist) {
    state.unit = unit === "f" ? "f" : "c";
    els.unitButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.unit === state.unit));
    });
    if (persist) saveUnit(state.unit);
    if (state.data) {
      render(state.data);
    } else {
      els.tempUnit.textContent = state.unit === "f" ? "°F" : "°C";
    }
  }

  els.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    loadWeather(els.cityInput.value);
  });

  els.chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const city = chip.dataset.city;
      if (city) loadWeather(city);
    });
  });

  els.unitButtons.forEach((button) => {
    button.addEventListener("click", () => applyUnit(button.dataset.unit, true));
  });

  els.retryBtn.addEventListener("click", () => {
    loadWeather(state.lastQuery || state.city || DEFAULT_CITY);
  });

  window.addEventListener("online", () => {
    if (!els.errorPanel.hidden) {
      loadWeather(state.lastQuery || state.city || DEFAULT_CITY);
    }
  });

  /* ----------------------------------------------------------------
     Boot: Mumbai on first launch, or a shared ?city= link.
     ---------------------------------------------------------------- */

  applyUnit(state.unit, false);

  let initialCity = DEFAULT_CITY;
  try {
    const requested = new URLSearchParams(window.location.search).get("city");
    if (requested && requested.trim()) initialCity = requested.trim().slice(0, 80);
  } catch (error) {
    /* ignore malformed URLs */
  }

  loadWeather(initialCity, { updateUrl: false });
})();
