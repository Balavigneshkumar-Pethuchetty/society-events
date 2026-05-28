import React from 'react';
import { SponsorDashboard } from './pages/SponsorDashboard';

interface Props { firstName?: string }

export function SponsorApp({ firstName }: Props) {
  return <SponsorDashboard firstName={firstName} />;
}
