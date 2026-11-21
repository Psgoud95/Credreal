# Skyline Weather

A login-free weather app: open it, see Mumbai's live conditions, and search any city on Earth for current weather plus a six-day outlook.

**Live app:** [https://credreal-weather.vercel.app](https://credreal-weather.vercel.app)

**Repository:** [https://github.com/Psgoud95/Credreal](https://github.com/Psgoud95/Credreal)

![Stack](https://img.shields.io/badge/stack-HTML%20%C2%B7%20CSS%20%C2%B7%20vanilla%20JS%20%C2%B7%20Vercel%20Functions-8fc7ff)

## Why this exists

Finding the weather of your city should take one search — not an account, a paywall, or five taps. Skyline Weather removes everything between the user and the forecast:

- **No login, ever.** Open the page and the weather is already there.
- **Mumbai loads on launch.** No empty state, no "search to begin".
- **One search box.** Type a city, press enter, get live data.
- **A six-day outlook** with a temperature bar graph, because "will it rain this weekend?" is the next question users ask.
- **Real data only.** Every value on screen comes from WeatherAPI.com at request time. There is no mock or hardcoded weather data anywhere in the codebase.

## Features

- Current conditions for any city: temperature, feels-like, condition, humidity, wind, pressure, visibility, UV, cloud cover.
- Local time, sunrise/sunset arc, daylight length, moon phase.
- Six-day temperature trend as an animated bar chart with highs, lows, condition icons, and rain chance.
- Instant °C / °F switch (both units are returned by the API, so toggling does not refetch).
- Shareable links: `?city=Tokyo` opens straight to that city.
- Loading, invalid-city, rate-limit, timeout, and offline states.
- Responsive, keyboard-accessible, reduced-motion friendly.

## How it works

```
Browser  ──GET /api/weather?q=Mumbai──▶  Vercel Function (api/weather.js)
                                              │
                                              ├─GET /v1/current.json?key=…&q=Mumbai
                                              └─GET /v1/forecast.json?key=…&q=Mumbai&days=7
                                              │
Browser  ◀── trimmed JSON payload ────────────┘
```

The API key is read from `process.env.WEATHER_API_KEY` **server-side only**. The browser never sees it, and no weather value is hardcoded.

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | Semantic HTML, modern CSS (glassmorphism, responsive grid), vanilla JavaScript |
| API proxy | Node.js serverless function on Vercel (`api/weather.js`) |
| Data | [WeatherAPI.com](https://www.weatherapi.com/) — `/v1/current.json` + `/v1/forecast.json` |
| Local dev | Zero-dependency Node server (`server.js`) that mirrors Vercel routing |
| Hosting | Vercel |

No framework, no build step, no runtime dependencies.

## Project structure

```
.
├── api/
│   └── weather.js      # Serverless proxy: validates input, calls WeatherAPI, shapes response
├── index.html          # App shell and accessible markup
├── styles.css          # Design system, weather themes, responsive layout
├── app.js              # Fetching, rendering, unit toggle, error handling
├── server.js           # Local dev server (static files + /api/weather)
├── vercel.json         # Security headers, clean URLs
├── .env.example        # Environment template (real .env is gitignored)
└── README.md
```

## Run locally

Requirements: Node.js 18+.

```bash
# 1. Install the WeatherAPI key
cp .env.example .env
# then edit .env and set WEATHER_API_KEY=your_key

# 2. Start the app
npm run dev
```

Open <http://localhost:3000>. On launch it requests Mumbai through `/api/weather?q=Mumbai`.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `WEATHER_API_KEY` | Yes | WeatherAPI.com key. Server-side only. |

`.env` is gitignored. In production the same variable is set in the Vercel project's environment settings.

## API contract

`GET /api/weather?q={city}`

- `200` — weather payload
- `400` — missing/invalid city
- `404` — city not found
- `405` — non-GET method
- `429` — WeatherAPI rate limit
- `500` — missing/invalid API key
- `502` — upstream failure or malformed payload
- `504` — upstream timeout

Example (trimmed):

```json
{
  "location": {
    "name": "Mumbai",
    "region": "Maharashtra",
    "country": "India",
    "localtime": "2026-11-21 16:23"
  },
  "current": {
    "temp_c": 28.1,
    "temp_f": 82.6,
    "feelslike_c": 28.2,
    "humidity": 46,
    "wind_kph": 12.2,
    "wind_dir": "WSW",
    "condition": { "text": "Sunny", "icon": "//cdn.weatherapi.com/weather/64x64/day/113.png", "code": 1000 }
  },
  "today": { "maxtemp_c": 29.7, "mintemp_c": 20.1, "sunrise": "06:49 AM", "sunset": "05:58 PM" },
  "forecast": [
    { "date": "2026-11-22", "maxtemp_c": 29.9, "mintemp_c": 20.4, "daily_chance_of_rain": 0 }
  ]
}
```

Responses are cached at the edge for 5 minutes (`s-maxage=300`) to keep repeat searches fast and protect the WeatherAPI quota.

## Error handling

| Situation | What the user sees |
| --- | --- |
| Unknown city | "City not found" with spelling guidance; previous weather stays visible |
| WeatherAPI down | "Weather service unavailable" + retry button |
| Timeout (>12 s) | "The request timed out" |
| No connection | "Connection problem"; retries automatically when the browser comes back online |
| Rate limited | "Too many requests" |

The server maps upstream WeatherAPI errors to clear status codes and never forwards raw provider errors or the key.

## Deployment

The app is deployed on Vercel with `WEATHER_API_KEY` set as a production environment variable.

```bash
npx vercel --prod
```

Vercel auto-detects `api/weather.js` as a Node function and serves the three static files. No build command is required.

To ship an update, run `npx vercel --prod` again (or connect the repository in the Vercel dashboard for Git-based deployments).

## Acceptance criteria

| Requirement | Status |
| --- | --- |
| Mumbai weather loads on initial launch | ✅ `loadWeather("Mumbai")` on boot |
| Values match the API response | ✅ rendered directly from `/api/weather` payload |
| City searches trigger new API requests | ✅ form, quick chips, and `?city=` links |
| No hardcoded or mock weather data | ✅ all values sourced from WeatherAPI |
| API key stored in `.env` | ✅ `.env` locally, Vercel env var in production |
| Search bar + current weather | ✅ |
| 6-day outlook with bar graph | ✅ |
| No login | ✅ no auth anywhere |
