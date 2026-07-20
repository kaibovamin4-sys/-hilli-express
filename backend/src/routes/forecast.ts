import type { FastifyPluginAsync } from 'fastify';
import { getWeather, getAirQuality } from '../external/openMeteo.js';
import { config } from '../config.js';

export const forecastRoutes: FastifyPluginAsync = async (app) => {
  app.get('/api/forecast', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          lat: { type: 'number' },
          lng: { type: 'number' },
        },
      },
    },
  }, async (req) => {
    const q = req.query as { lat?: number; lng?: number };
    const lat = q.lat ?? config.cityLat;
    const lng = q.lng ?? config.cityLng;

    const [w, a] = await Promise.allSettled([getWeather(lat, lng), getAirQuality(lat, lng)]);
    const weather = w.status === 'fulfilled' ? w.value : null;
    const air = a.status === 'fulfilled' ? a.value : null;

    return {
      lat, lng,
      weather: weather ? {
        current: weather.current,
        hourly: weather.hourly,
        daily: weather.daily,
      } : null,
      air_quality_current: air?.current ?? null,
      pm25_hourly: air?.hourly_pm25 ?? null,
      pollen: air?.pollen ?? null,
    };
  });
};
