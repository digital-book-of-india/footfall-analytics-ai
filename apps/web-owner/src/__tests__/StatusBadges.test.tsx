import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataSourceBadge, QualityBadge, CameraStatusBadge } from '../components/StatusBadges';

describe('StatusBadges Component Tests', () => {
  it('renders LIVE and DEMO data source badges correctly', () => {
    const { rerender } = render(<DataSourceBadge source="LIVE" />);
    expect(screen.getByText('LIVE MODE')).toBeInTheDocument();

    rerender(<DataSourceBadge source="DEMO" />);
    expect(screen.getByText('DEMO MODE')).toBeInTheDocument();
  });

  it('renders camera statuses correctly', () => {
    const { rerender } = render(<CameraStatusBadge status="ONLINE" />);
    expect(screen.getByText('Online')).toBeInTheDocument();

    rerender(<CameraStatusBadge status="CONNECTING" />);
    expect(screen.getByText('Connecting')).toBeInTheDocument();

    rerender(<CameraStatusBadge status="CONFIG_ERROR" />);
    expect(screen.getByText('Config Error')).toBeInTheDocument();

    rerender(<CameraStatusBadge status="NEEDS_SETUP" />);
    expect(screen.getByText('Needs Setup')).toBeInTheDocument();

    rerender(<CameraStatusBadge status="DEGRADED" />);
    expect(screen.getByText('Degraded')).toBeInTheDocument();

    rerender(<CameraStatusBadge status="OFFLINE" />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('renders quality badges', () => {
    const { rerender } = render(<QualityBadge quality="OK" />);
    expect(screen.getByText('Quality: OK')).toBeInTheDocument();

    rerender(<QualityBadge quality="RESET_REQUIRED" />);
    expect(screen.getByText('Quality: RESET REQUIRED')).toBeInTheDocument();
  });
});
