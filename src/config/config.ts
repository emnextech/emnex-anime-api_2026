const parseOrigins = (value: string) => {
  if (value.includes(',')) {
    return value.split(',').map(origin => origin.trim()).filter(Boolean);
  }

  return value === '*' ? '*' : [value];
};

const corsOrigin = parseOrigins(process.env.CORS_ORIGIN ?? '*');

const config = {
  // Upstream data source (JSON API).
  baseurl: process.env.BASE_URL ?? 'https://kaa.lt',
  baseurl2: process.env.BASE_URL_2 ?? 'https://kaa.lt',
  imageBase: process.env.IMAGE_BASE ?? 'https://kaa.lt/image/poster',
  origin: corsOrigin,
  port: Number(process.env.PORT ?? 5000),

  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
  },

  logLevel: process.env.LOG_LEVEL ?? 'INFO',
  enableLogging: process.env.ENABLE_LOGGING ? process.env.ENABLE_LOGGING === 'true' : true,
  isProduction: process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL),
  isDevelopment: process.env.NODE_ENV === 'development',
  isVercel: Boolean(process.env.VERCEL),
};

export default config;
