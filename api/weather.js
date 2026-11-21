/**
 * GET /api/weather?q=<city>
 *
 * Server-side proxy for WeatherAPI.com. Keeping the call here means the
 * API key lives only in the environment (.env locally, Vercel env vars in
 * production) and is never shipped to the browser.
 *
 * Responds with a trimmed, UI-ready payload:
 *   { location, current, today, forecast[6], fetched_at }
 */

const WEATHER_BASE = "https://api.weatherapi.com/v1";
const DEFAULT_CITY = "Mumbai";
const MAX_CITY_LENGTH = 80;
const UPSTREAM_TIMEOUT_MS = 8000;

function sendError(res, status, code, message) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json({ error: { code, message } });
}

async function readJson(response) {
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

function normalizeCity(raw) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const city = String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return city.slice(0, MAX_CITY_LENGTH);
}

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return sendError(res, 405, "method_not_allowed", "This endpoint only accepts GET requests.");
  }

  const city = normalizeCity(req.query && req.query.q) || DEFAULT_CITY;

  if (!city) {
    return sendError(res, 400, "invalid_city", "Please provide a city name.");
  }

  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) {
    console.error("[weather] WEATHER_API_KEY is not set in the environment.");
    return sendError(
      res,
      500,
      "missing_api_key",
      "The weather service is not configured yet. Please try again later."
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const params = new URLSearchParams({
      key: apiKey,
      q: city,
      aqi: "no",
      alerts: "no",
      lang: "en",
    });

    const [currentResponse, forecastResponse] = await Promise.all([
      fetch(`${WEATHER_BASE}/current.json?${params.toString()}`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }),
      fetch(`${WEATHER_BASE}/forecast.json?${params.toString()}&days=7`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }),
    ]);

    const currentPayload = await readJson(currentResponse);

    if (!currentResponse.ok) {
      const upstreamError = (currentPayload && currentPayload.error) || {};
      const upstreamCode = upstreamError.code;

      if (upstreamCode === 1006) {
        return sendError(res, 404, "city_not_found", `No matching location found for "${city}".`);
      }

      if (currentResponse.status === 401 || currentResponse.status === 403) {
        console.error("[weather] WeatherAPI rejected the key:", upstreamError.message || currentResponse.status);
        return sendError(res, 500, "upstream_auth", "The weather service could not authenticate the request.");
      }

      if (currentResponse.status === 429) {
        return sendError(res, 429, "rate_limited", "The weather service is busy. Please try again shortly.");
      }

      console.error("[weather] current.json failed:", currentResponse.status, upstreamError.message || "");
      return sendError(res, 502, "upstream_error", "The weather service could not complete this request. Please try again.");
    }

    if (!forecastResponse.ok) {
      console.error("[weather] forecast.json failed:", forecastResponse.status);
      return sendError(res, 502, "upstream_error", "The weather service could not load the forecast. Please try again.");
    }

    const forecastPayload = await readJson(forecastResponse);

    if (
      !currentPayload ||
      !currentPayload.location ||
      !currentPayload.current ||
      !forecastPayload ||
      !forecastPayload.forecast ||
      !Array.isArray(forecastPayload.forecast.forecastday) ||
      forecastPayload.forecast.forecastday.length === 0
    ) {
      return sendError(res, 502, "bad_upstream_payload", "The weather service returned an unexpected response.");
    }

    const location = currentPayload.location;
    const current = currentPayload.current;
    const days = forecastPayload.forecast.forecastday;
    const today = days[0];
    const astro = today.astro || {};

    const payload = {
      location: {
        name: location.name,
        region: location.region,
        country: location.country,
        lat: location.lat,
        lon: location.lon,
        tz_id: location.tz_id,
        localtime: location.localtime,
        localtime_epoch: location.localtime_epoch,
      },
      current: {
        last_updated: current.last_updated,
        last_updated_epoch: current.last_updated_epoch,
        temp_c: current.temp_c,
        temp_f: current.temp_f,
        feelslike_c: current.feelslike_c,
        feelslike_f: current.feelslike_f,
        is_day: current.is_day,
        condition: {
          text: current.condition ? current.condition.text : "",
          icon: current.condition ? current.condition.icon : "",
          code: current.condition ? current.condition.code : 1000,
        },
        wind_kph: current.wind_kph,
        wind_mph: current.wind_mph,
        wind_dir: current.wind_dir,
        wind_degree: current.wind_degree,
        gust_kph: current.gust_kph,
        pressure_mb: current.pressure_mb,
        precip_mm: current.precip_mm,
        humidity: current.humidity,
        cloud: current.cloud,
        vis_km: current.vis_km,
        vis_miles: current.vis_miles,
        uv: current.uv,
        chance_of_rain: current.chance_of_rain,
      },
      today: {
        date: today.date,
        maxtemp_c: today.day.maxtemp_c,
        maxtemp_f: today.day.maxtemp_f,
        mintemp_c: today.day.mintemp_c,
        mintemp_f: today.day.mintemp_f,
        avgtemp_c: today.day.avgtemp_c,
        avgtemp_f: today.day.avgtemp_f,
        uv: today.day.uv,
        daily_chance_of_rain: today.day.daily_chance_of_rain,
        condition: {
          text: today.day.condition ? today.day.condition.text : "",
          icon: today.day.condition ? today.day.condition.icon : "",
          code: today.day.condition ? today.day.condition.code : 1000,
        },
        sunrise: astro.sunrise || "",
        sunset: astro.sunset || "",
        moon_phase: astro.moon_phase || "",
        moon_illumination: astro.moon_illumination || "",
      },
      // Today is shown separately, so the chart covers the next six days.
      forecast: days.slice(1, 7).map((entry) => ({
        date: entry.date,
        maxtemp_c: entry.day.maxtemp_c,
        maxtemp_f: entry.day.maxtemp_f,
        mintemp_c: entry.day.mintemp_c,
        mintemp_f: entry.day.mintemp_f,
        avgtemp_c: entry.day.avgtemp_c,
        avgtemp_f: entry.day.avgtemp_f,
        daily_chance_of_rain: entry.day.daily_chance_of_rain,
        condition: {
          text: entry.day.condition ? entry.day.condition.text : "",
          icon: entry.day.condition ? entry.day.condition.icon : "",
          code: entry.day.condition ? entry.day.condition.code : 1000,
        },
      })),
      fetched_at: new Date().toISOString(),
    };

    // Cache at the edge for 5 minutes so repeat searches stay fast and
    // don't burn through the WeatherAPI quota. Vercel reads the
    // Vercel-CDN-Cache-Control header for serverless responses.
    res.setHeader("Vercel-CDN-Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
    res.setHeader("CDN-Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
    res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    return res.status(200).json(payload);
  } catch (error) {
    if (error && (error.name === "AbortError" || error.name === "TimeoutError")) {
      return sendError(res, 504, "upstream_timeout", "The weather service took too long to respond. Please try again.");
    }

    console.error("[weather] unexpected failure:", error);
    return sendError(res, 502, "upstream_unreachable", "We couldn't reach the weather service. Please try again.");
  } finally {
    clearTimeout(timeout);
  }
};
