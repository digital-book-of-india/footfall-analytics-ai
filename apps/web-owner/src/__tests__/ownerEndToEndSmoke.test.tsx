import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { api } from '../services/apiClient';

describe('Owner Flow End-to-End Smoke Test', () => {
  beforeEach(() => {
    localStorage.clear();
    api.setToken(null);
    api.setForceMock(true);
  });


  it('completes the full end-to-end owner journey successfully', async () => {
    const { unmount } = render(<App />);

    // Step 1: Sign in screen is displayed
    expect(screen.getByText('DBI Footfall Analytics')).toBeInTheDocument();
    expect(screen.getByText('One-Click Demo Owner Sign-In')).toBeInTheDocument();

    // Sign in via demo button
    const demoSignInBtn = screen.getByText('One-Click Demo Owner Sign-In');
    fireEvent.click(demoSignInBtn);

    // Step 2: Dashboard renders shop name and footfall summary
    await waitFor(() => {
      expect(screen.getAllByText('Downtown Flagship Store').length).toBeGreaterThanOrEqual(1);
    });

    // Check KPI cards
    await waitFor(() => {
      expect(screen.getByText("Today's Entries")).toBeInTheDocument();
      expect(screen.getByText("Today's Exits")).toBeInTheDocument();
      expect(screen.getByText('Current Occupancy')).toBeInTheDocument();
    });

    // Check Data Source and Quality Badges
    await waitFor(() => {
      expect(screen.getByText('DEMO MODE')).toBeInTheDocument();
      expect(screen.getByText('Quality: OK')).toBeInTheDocument();
    });

    // Step 3: Navigate to Store Settings and Edit Shop Profile
    const settingsTabBtns = screen.getAllByRole('button', { name: /settings/i });
    fireEvent.click(settingsTabBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Store Profile & Operating Settings')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Downtown Flagship Store')).toBeInTheDocument();
    });

    // Edit store name
    const storeNameInput = screen.getByDisplayValue('Downtown Flagship Store');
    fireEvent.change(storeNameInput, { target: { value: 'Downtown Flagship Store Renamed' } });
    const saveProfileBtn = screen.getByRole('button', { name: /save profile changes/i });
    fireEvent.click(saveProfileBtn);

    await waitFor(() => {
      expect(screen.getByText(/Store profile and operating timezone updated successfully/i)).toBeInTheDocument();
    });

    // Step 4: Navigate to Cameras & Counting Lines tab
    const camerasTabBtns = screen.getAllByRole('button', { name: /cameras/i });
    fireEvent.click(camerasTabBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Entrance Cameras & AI Counting Lines')).toBeInTheDocument();
    });

    // Check existing camera in list
    await waitFor(() => {
      expect(screen.getByText('Main Entrance Camera')).toBeInTheDocument();
      // Verify Secret Handling: Passwords must NOT appear in raw text
      expect(screen.getByText(/rtsp:\/\/admin:\*\*\*\*@/i)).toBeInTheDocument();
    });

    // Step 5: Run Stream Test
    const testConnectionBtn = screen.getAllByRole('button', { name: /test connection/i })[0];
    fireEvent.click(testConnectionBtn);

    await waitFor(() => {
      expect(screen.getByText(/RTSP handshake and frame grab verified successfully/i)).toBeInTheDocument();
    });

    // Step 6: Edit Camera Stream Metadata
    const editStreamBtn = screen.getAllByRole('button', { name: /edit stream/i })[0];
    fireEvent.click(editStreamBtn);

    await waitFor(() => {
      expect(screen.getByText('Edit Camera Configuration')).toBeInTheDocument();
    });

    const editNameInput = screen.getByDisplayValue('Main Entrance Camera');
    fireEvent.change(editNameInput, { target: { value: 'Main Front Door Camera' } });
    const saveEditCameraBtn = screen.getByRole('button', { name: /save configuration/i });
    fireEvent.click(saveEditCameraBtn);

    await waitFor(() => {
      expect(screen.queryByText('Edit Camera Configuration')).not.toBeInTheDocument();
      expect(screen.getByText('Main Front Door Camera')).toBeInTheDocument();
    });

    // Step 7: Open Virtual Counting Line Modal
    const configLineBtn = screen.getAllByRole('button', { name: /configure counting line/i })[0];
    fireEvent.click(configLineBtn);

    await waitFor(() => {
      expect(screen.getByText('Virtual Counting Line Calibration')).toBeInTheDocument();
    });

    // Save counting line
    const saveLineBtn = screen.getByRole('button', { name: /save counting line/i });
    fireEvent.click(saveLineBtn);

    // Modal closes
    await waitFor(() => {
      expect(screen.queryByText('Virtual Counting Line Calibration')).not.toBeInTheDocument();
    });

    // Step 8: Open Calibrate Occupancy on Dashboard
    const dashboardTabBtns = screen.getAllByRole('button', { name: /dashboard/i });
    fireEvent.click(dashboardTabBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Current Occupancy')).toBeInTheDocument();
    });

    const calibrateBtn = screen.getByRole('button', { name: /calibrate occupancy/i });
    fireEvent.click(calibrateBtn);

    await waitFor(() => {
      expect(screen.getByText('Calibrate Estimated Occupancy')).toBeInTheDocument();
    });

    const occupancyInput = screen.getByLabelText(/current actual in-store occupancy/i);
    fireEvent.change(occupancyInput, { target: { value: '75' } });
    const confirmCalibrateBtn = screen.getByRole('button', { name: /confirm calibration/i });
    fireEvent.click(confirmCalibrateBtn);

    await waitFor(() => {
      expect(screen.getByText(/Occupancy count calibrated successfully/i)).toBeInTheDocument();
    });

    // Step 9: Navigate to Reports & CSV Export
    const reportsTabBtns = screen.getAllByRole('button', { name: /reports/i });
    fireEvent.click(reportsTabBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('Footfall Reports & Audit Logs')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /export to csv/i })).toBeInTheDocument();
    });

    // Step 10: Refresh the application and verify persisted data
    unmount();
    render(<App />);

    // Persisted session reloads directly into dashboard without sign-in prompt
    await waitFor(() => {
      expect(screen.getAllByText('Downtown Flagship Store Renamed').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Today's Entries")).toBeInTheDocument();
    });
  });
});
