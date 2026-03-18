// ============================================================================
// Weather Service — Real-Time Weather Data Integration
// ============================================================================
// Abstracted weather service that can plug into any weather API.
// Includes a mock implementation for development and a real API adapter.

import type { WeatherConditions, GPSCoordinate } from '../models/types';

export interface WeatherProvider {
  getWeather(location: GPSCoordinate): Promise<WeatherConditions>;
}

/**
 * Mock weather provider for development and testing.
 */
export class MockWeatherProvider implements WeatherProvider {
  private conditions: WeatherConditions;

  constructor(conditions?: Partial<WeatherConditions>) {
    this.conditions = {
      windSpeedMph: 8,
      windDirectionDeg: 225, // SW wind
      temperatureF: 72,
      humidity: 55,
      altitudeFt: 300,
      barometricPressure: 29.92,
      precipitation: 'none',
      ...conditions,
    };
  }

  async getWeather(_location: GPSCoordinate): Promise<WeatherConditions> {
    return { ...this.conditions };
  }
}

/**
 * OpenWeatherMap API adapter.
 * API docs: https://openweathermap.org/api/one-call-3
 *
 * To use: set WEATHER_API_KEY in your environment.
 */
export class OpenWeatherProvider implements WeatherProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async getWeather(location: GPSCoordinate): Promise<WeatherConditions> {
    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${location.lat}&lon=${location.lng}&exclude=minutely,hourly,daily&units=imperial&appid=${this.apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();
    const current = data.current;

    return {
      windSpeedMph: current.wind_speed ?? 0,
      windDirectionDeg: current.wind_deg ?? 0,
      temperatureF: current.temp ?? 70,
      humidity: current.humidity ?? 50,
      altitudeFt: (location.elevationMeters ?? 0) * 3.281,
      barometricPressure: (current.pressure ?? 1013.25) * 0.02953,
      precipitation: this.mapPrecipitation(current.weather?.[0]?.main),
      gustFactor: current.wind_gust
        ? current.wind_gust / Math.max(current.wind_speed, 1)
        : undefined,
    };
  }

  private mapPrecipitation(weatherMain?: string): WeatherConditions['precipitation'] {
    switch (weatherMain) {
      case 'Rain': return 'light_rain';
      case 'Drizzle': return 'light_rain';
      case 'Thunderstorm': return 'heavy_rain';
      case 'Mist':
      case 'Fog': return 'mist';
      default: return 'none';
    }
  }
}

/**
 * Weather service that caches results and provides update intervals.
 */
export class WeatherService {
  private provider: WeatherProvider;
  private cache: { conditions: WeatherConditions; timestamp: number } | null = null;
  private cacheDurationMs: number;

  constructor(provider: WeatherProvider, cacheDurationMinutes: number = 15) {
    this.provider = provider;
    this.cacheDurationMs = cacheDurationMinutes * 60 * 1000;
  }

  async getConditions(location: GPSCoordinate): Promise<WeatherConditions> {
    const now = Date.now();
    if (this.cache && (now - this.cache.timestamp) < this.cacheDurationMs) {
      return this.cache.conditions;
    }

    const conditions = await this.provider.getWeather(location);
    this.cache = { conditions, timestamp: now };
    return conditions;
  }

  invalidateCache(): void {
    this.cache = null;
  }
}
