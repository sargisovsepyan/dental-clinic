import { fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffMyAppointments } from '@/components/staff/staff-my-appointments';
import { StaffApiError } from '@/api/staff-client';
import { staffMessages } from '@/i18n/staff-messages';
const api = { listMyAppointments: vi.fn(), listAppointments: vi.fn(), listDentists: vi.fn(), getClinic: vi.fn() };
const auth = { user: { id: '64b000000000000000000093', role: 'dentist' }, api, locale: 'en', copy: staffMessages.en, handleApiError: vi.fn() };
vi.mock('@/components/staff/staff-auth-provider', () => ({ useStaffAuth: () => auth }));
const row = { _id: '64b000000000000000000071', patientName: 'Own patient', patientPhone: '+37499000001',
  date: '2026-09-18', startTime: '09:00', endTime: '10:00', status: 'confirmed',
  serviceSnapshot: { name: 'Մաքրում', durationMinutes: 60, translations: { en: { name: 'Hygiene' } } } };
const result = { appointments: [row], pagination: { page: 1, limit: 12, total: 1, pages: 1 }, today: '2026-09-17', timezone: 'Asia/Yerevan' };
beforeEach(() => { vi.clearAllMocks(); auth.user.role = 'dentist'; api.listMyAppointments.mockResolvedValue(result); });
describe('dentist read-only workspace', () => {
  it('shows owned minimal data and phone details without management reads or mutations', async () => {
    render(<StaffMyAppointments />);
    expect(await screen.findByText('Own patient')).toBeVisible();
    expect(screen.getByText('Hygiene')).toBeVisible();
    expect(screen.queryByText('Մաքրում')).not.toBeInTheDocument();
    expect(screen.queryByText(row.patientPhone)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View' }));
    expect(screen.getByText(row.patientPhone)).toBeVisible();
    expect(api.listMyAppointments).toHaveBeenCalledWith({ page: 1, limit: 12 }, expect.any(AbortSignal));
    expect(api.listAppointments).not.toHaveBeenCalled(); expect(api.listDentists).not.toHaveBeenCalled(); expect(api.getClinic).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /cancel|reschedule|confirm/i })).not.toBeInTheDocument();
  });
  it('uses server clinic day for today, not a browser-local date', async () => {
    render(<StaffMyAppointments />); await screen.findByText('Own patient');
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    await waitFor(() => expect(api.listMyAppointments).toHaveBeenLastCalledWith({ page: 1, limit: 12, date: result.today }, expect.any(AbortSignal)));
  });
  it('denies other roles without any protected reads', async () => {
    auth.user.role = 'receptionist'; render(<StaffMyAppointments />);
    expect(screen.getByText('Access denied')).toBeVisible(); await Promise.resolve();
    expect(api.listMyAppointments).not.toHaveBeenCalled();
  });
  it('suppresses an aborted stale patient response after changing the period', async () => {
    let resolve!: (data: typeof result) => void;
    api.listMyAppointments.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    render(<StaffMyAppointments />); await waitFor(() => expect(api.listMyAppointments).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    await screen.findByText('Own patient');
    await act(async () => resolve({ ...result, appointments: [{ ...row, patientName: 'Stale private patient' }] }));
    expect(screen.queryByText('Stale private patient')).not.toBeInTheDocument();
    expect(api.listMyAppointments.mock.calls[0][1].aborted).toBe(true);
  });
  it('explains an unlinked profile without exposing any other patient data', async () => {
    api.listMyAppointments.mockRejectedValue(new StaffApiError({ kind: 'http', status: 403, code: 'DENTIST_PROFILE_REQUIRED' }));
    render(<StaffMyAppointments />);
    expect(await screen.findByText(/Ask an administrator/i)).toBeVisible(); expect(screen.queryByText('Own patient')).not.toBeInTheDocument();
  });
});
