"use client";

import { Plus, Trash2 } from "lucide-react";
import type { StaffScheduleConflict } from "@/api/staff-management";
import { compactFieldClass, useManagementCopy } from "@/components/staff/staff-management-shared";
import type { ScheduleDay } from "@/components/staff/staff-schedule-helpers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatManagementMessage } from "@/i18n/staff-management-messages";

export function WeeklyScheduleEditor({ days, onChange, disabled }: {
  days: ScheduleDay[];
  onChange: (days: ScheduleDay[]) => void;
  disabled?: boolean;
}) {
  const copy = useManagementCopy();
  const dayNames = [copy.day1, copy.day2, copy.day3, copy.day4, copy.day5, copy.day6, copy.day7];

  function update(dayIndex: number, next: ScheduleDay) {
    onChange(days.map((day, index) => index === dayIndex ? next : day));
  }

  return (
    <div className="space-y-3">
      {days.map((day, dayIndex) => (
        <fieldset key={day.dayOfWeek} className="rounded-xl border bg-card p-4">
          <legend className="sr-only">{dayNames[dayIndex]}</legend>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex min-h-11 items-center gap-3 font-semibold">
              <input
                type="checkbox"
                className="size-4"
                checked={day.enabled}
                disabled={disabled}
                onChange={(event) => update(dayIndex, {
                  ...day,
                  enabled: event.target.checked,
                  shifts: event.target.checked ? (day.shifts.length ? day.shifts : [{ start: "09:00", end: "18:00" }]) : [],
                })}
              />
              {dayNames[dayIndex]}
            </label>
            <span className="text-xs font-medium text-muted-foreground">{day.enabled ? copy.open : copy.closed}</span>
          </div>
          {day.enabled && (
            <div className="mt-3 space-y-2">
              {day.shifts.map((shift, shiftIndex) => (
                <div key={`${day.dayOfWeek}-${shiftIndex}`} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <label className="text-xs font-medium text-muted-foreground">{copy.start}
                    <input
                      type="time"
                      step={60}
                      className={compactFieldClass}
                      value={shift.start}
                      disabled={disabled}
                      onChange={(event) => update(dayIndex, {
                        ...day,
                        shifts: day.shifts.map((item, index) => index === shiftIndex ? { ...item, start: event.target.value } : item),
                      })}
                    />
                  </label>
                  <label className="text-xs font-medium text-muted-foreground">{copy.end}
                    <input
                      type="time"
                      step={60}
                      className={compactFieldClass}
                      value={shift.end}
                      disabled={disabled}
                      onChange={(event) => update(dayIndex, {
                        ...day,
                        shifts: day.shifts.map((item, index) => index === shiftIndex ? { ...item, end: event.target.value } : item),
                      })}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={disabled}
                    onClick={() => update(dayIndex, { ...day, shifts: day.shifts.filter((_item, index) => index !== shiftIndex) })}
                  >
                    <Trash2 aria-hidden="true" /><span className="sr-only">{copy.removeShift}</span>
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={disabled || day.shifts.length >= 6}
                onClick={() => update(dayIndex, { ...day, shifts: [...day.shifts, { start: "09:00", end: "18:00" }] })}
              >
                <Plus aria-hidden="true" />{copy.addShift}
              </Button>
            </div>
          )}
        </fieldset>
      ))}
    </div>
  );
}

export function ScheduleImpactDialog({ open, conflicts, conflictCount, truncated, pending, onCancel, onConfirm }: {
  open: boolean;
  conflicts: StaffScheduleConflict[];
  conflictCount: number;
  truncated: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy = useManagementCopy();
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onCancel()}>
      <DialogContent closeLabel={copy.reviewAgain} className="w-[min(calc(100%-2rem),48rem)]">
        <DialogTitle>{copy.impactTitle}</DialogTitle>
        <DialogDescription className="mt-2">{copy.impactIntro}</DialogDescription>
        <p className="mt-4 text-sm font-semibold">{formatManagementMessage(copy.impactCount, { count: conflictCount })}</p>
        <div className="mt-3 max-h-72 overflow-auto rounded-xl border">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="sticky top-0 bg-muted"><tr><th className="px-3 py-2">{copy.date}</th><th className="px-3 py-2">{copy.start}</th><th className="px-3 py-2">{copy.end}</th><th className="px-3 py-2">{copy.status}</th><th className="px-3 py-2">ID</th></tr></thead>
            <tbody>{conflicts.map((conflict) => <tr key={conflict.appointmentId} className="border-t"><td className="px-3 py-2">{conflict.date}</td><td className="px-3 py-2">{conflict.startTime}</td><td className="px-3 py-2">{conflict.endTime}</td><td className="px-3 py-2">{conflict.status}</td><td className="px-3 py-2 font-mono text-xs">…{conflict.appointmentId.slice(-6)}</td></tr>)}</tbody>
          </table>
        </div>
        {truncated && <p className="mt-3 text-sm font-medium text-destructive">{copy.impactTruncated}</p>}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>{copy.reviewAgain}</Button>
          <Button type="button" onClick={onConfirm} disabled={pending}>{pending ? copy.saving : copy.acknowledgeImpact}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
