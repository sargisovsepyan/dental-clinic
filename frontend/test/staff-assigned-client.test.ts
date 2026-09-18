import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StaffApiClient, type MyAppointmentFilters } from '@/api/staff-client';
const id = '64b000000000000000000071';
const user = { id: '64b000000000000000000093', name: 'Davit', email: 'dentist@preview.local', role: 'dentist' };
const row = { _id: id, patientName: 'Own patient', patientPhone: '+37499000001', date: '2026-09-18', startTime: '09:00', endTime: '10:00', status: 'confirmed', serviceSnapshot: { name: 'Մաքրում', durationMinutes: 60, translations: { en: { name: 'Hygiene', description: 'PRIVATE' } } }, patientEmail: 'PRIVATE', internalNote: 'PRIVATE' };
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, data }), { status, headers: { 'content-type': 'application/json' } });
const auth = () => response({ accessToken: 'access-token-value-long-enough', user });
beforeEach(() => { process.env.NEXT_PUBLIC_API_URL = 'http://localhost:5000/api/v1'; process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'; process.env.NEXT_PUBLIC_BOOKING_CHALLENGE_PROVIDER = 'disabled'; });
afterEach(() => vi.unstubAllGlobals());
describe('assigned patient client boundary', () => {
  it('only reads mine and retains the exact minimal projection even with hostile upstream extras', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(response({ appointments: [row], pagination: { page: 1, limit: 12, total: 1, pages: 1 }, today: '2026-09-17', timezone: 'Asia/Yerevan' })).mockResolvedValueOnce(response({ appointment: row }));
    vi.stubGlobal('fetch', fetch); const api = new StaffApiClient(); await api.login(user.email, 'Local123!');
    const page = await api.listMyAppointments({ page: 1, limit: 12 });
    expect(Object.keys(page.appointments[0]).sort()).toEqual(['_id', 'patientName', 'patientPhone', 'date', 'startTime', 'endTime', 'status', 'serviceSnapshot'].sort());
    expect(JSON.stringify(page)).not.toContain('PRIVATE');
    await expect(api.getMyAppointment(id)).resolves.toEqual(page.appointments[0]);
    expect(String(fetch.mock.calls[1][0])).toContain('/appointments/mine?page=1&limit=12');
    expect(String(fetch.mock.calls[2][0])).toContain(`/appointments/mine/details/${id}`);
    expect(fetch.mock.calls[1][1].cache).toBe('no-store');
    await expect(api.listMyAppointments({ page: 1, limit: 12, dentistId: id } as MyAppointmentFilters)).rejects.toMatchObject({ kind: 'configuration' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('never refreshes or replays a forbidden own-read and does not expose error messages', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(response({ message: 'PRIVATE' }, 403));
    vi.stubGlobal('fetch', fetch); const api = new StaffApiClient(); await api.login(user.email, 'Local123!');
    await expect(api.listMyAppointments({ page: 1, limit: 12 })).rejects.toMatchObject({ status: 403 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('returns the verified explicit admin binding and never assumes a mismatched save succeeded', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(auth()).mockResolvedValueOnce(response({ dentistId: id })).mockResolvedValueOnce(response({ dentistId: null }));
    vi.stubGlobal('fetch', fetch); const api = new StaffApiClient(); await api.login(user.email, 'Local123!');
    await expect(api.setDentistProfile(user.id, id)).resolves.toBe(id);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ dentistId: id });
    await expect(api.setDentistProfile(user.id, id)).rejects.toMatchObject({ kind: 'protocol' });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
