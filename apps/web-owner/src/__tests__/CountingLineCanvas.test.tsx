import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CountingLineCanvas } from '../components/CountingLineCanvas';

describe('CountingLineCanvas Component', () => {
  it('renders camera preview and initial coordinates', () => {
    const handleSave = vi.fn();
    const handleCancel = vi.fn();

    render(
      <CountingLineCanvas
        cameraName="Main Entrance Front"
        initialCoordinates={{ x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5 }}
        initialInDirection="IN"
        initialOutDirection="OUT"
        initialEnabled={true}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );

    expect(screen.getByText('Main Entrance Front')).toBeInTheDocument();
    expect(screen.getByText('Virtual Counting Line Calibration')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0.1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0.9')).toBeInTheDocument();
  });

  it('allows applying presets for horizontal and vertical lines', () => {
    const handleSave = vi.fn();
    const handleCancel = vi.fn();

    render(
      <CountingLineCanvas
        cameraName="Test Camera"
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );

    const verticalBtn = screen.getByText('Vertical Turnstile');
    fireEvent.click(verticalBtn);

    expect(screen.getByDisplayValue('0.15')).toBeInTheDocument();
    expect(screen.getByDisplayValue('0.85')).toBeInTheDocument();
  });

  it('submits updated coordinates and directions on save', async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleCancel = vi.fn();

    render(
      <CountingLineCanvas
        cameraName="Test Camera"
        initialCoordinates={{ x1: 0.2, y1: 0.4, x2: 0.8, y2: 0.4 }}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    );

    const saveBtn = screen.getByText('Save Counting Line');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith({
        coordinates: { x1: 0.2, y1: 0.4, x2: 0.8, y2: 0.4 },
        inDirection: 'IN',
        outDirection: 'OUT',
        enabled: true
      });
    });
  });
});
