import React, { createContext, useContext, useEffect, useState } from 'react';

export interface Society {
  name: string;
  shortName: string;
  city: string;
  baseCurrency: string;
}

const DEFAULT: Society = {
  name: 'GM Global Techies Town',
  shortName: 'GMGT',
  city: 'Bengaluru',
  baseCurrency: 'INR',
};

const API_BASE =
  window.location.port === '3000'
    ? `${window.location.protocol}//${window.location.hostname}:8080/api/users`
    : `${window.location.origin}/api/users`;

const SocietyContext = createContext<Society>(DEFAULT);

export function SocietyProvider({ children }: { children: React.ReactNode }) {
  const [society, setSociety] = useState<Society>(DEFAULT);

  useEffect(() => {
    fetch(`${API_BASE}/society`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data) {
          setSociety({
            name:         data.name         ?? DEFAULT.name,
            shortName:    data.shortName    ?? DEFAULT.shortName,
            city:         data.city         ?? DEFAULT.city,
            baseCurrency: data.baseCurrency ?? DEFAULT.baseCurrency,
          });
        }
      })
      .catch(() => {}); // keep DEFAULT on any error
  }, []);

  return (
    <SocietyContext.Provider value={society}>
      {children}
    </SocietyContext.Provider>
  );
}

export function useSociety(): Society {
  return useContext(SocietyContext);
}
