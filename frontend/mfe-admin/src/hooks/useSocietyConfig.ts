import { useEffect, useState } from 'react';

export interface SocietyConfig {
  name: string;
  shortName: string;
  city: string;
  baseCurrency: string;
}

const DEFAULT: SocietyConfig = {
  name: 'GM Global Techies Town',
  shortName: 'GMGT',
  city: 'Bengaluru',
  baseCurrency: 'INR',
};

const API_BASE =
  window.location.port === '4004'
    ? 'http://localhost:8080/api/users'
    : `${window.location.origin}/api/users`;

let cached: SocietyConfig | null = null;

export function useSocietyConfig(): SocietyConfig {
  const [config, setConfig] = useState<SocietyConfig>(cached ?? DEFAULT);

  useEffect(() => {
    if (cached) return;
    fetch(`${API_BASE}/society`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data) {
          cached = {
            name:         data.name         ?? DEFAULT.name,
            shortName:    data.shortName    ?? DEFAULT.shortName,
            city:         data.city         ?? DEFAULT.city,
            baseCurrency: data.baseCurrency ?? DEFAULT.baseCurrency,
          };
          setConfig(cached);
        }
      })
      .catch(() => {});
  }, []);

  return config;
}
