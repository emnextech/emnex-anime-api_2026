const config = {
  // Upstream data source (JSON API).
  baseurl: 'https://kaa.lt',
  baseurl2: 'https://kaa.lt',
  imageBase: 'https://kaa.lt/image/poster',
  origin: '*',
  port: 5000,

  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36',
  },

  logLevel: 'INFO',
  enableLogging: true,
  isProduction: true,
  isDevelopment: false,
  isVercel: false,
};

export default config;
