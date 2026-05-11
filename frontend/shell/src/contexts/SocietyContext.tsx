import React, { createContext, useContext } from 'react';

interface Society {
  name: string;
  shortName: string;
  city: string;
  baseCurrency: string;
}

const DEFAULT: Society = {
  name: 'Prestige Verdant Heights',
  shortName: 'PVH',
  city: 'Bengaluru',
  baseCurrency: 'INR',
};

const SocietyContext = createContext<Society>(DEFAULT);

export function SocietyProvider({ children }: { children: React.ReactNode }) {
  return (
    <SocietyContext.Provider value={DEFAULT}>
      {children}
    </SocietyContext.Provider>
  );
}

export function useSociety(): Society {
  return useContext(SocietyContext);
}
