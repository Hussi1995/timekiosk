import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import {
  CalendarDays,
  Clock3,
  Download,
  Lock,
  LogIn,
  LogOut,
  Pencil,
  Search,
  Settings,
  Trash2,
  UserRound,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";

const DEVICE_KEY = import.meta.env.VITE_DEVICE_KEY;

const IS_TONSBERG = DEVICE_KEY === "TONSBERG_123";
const IS_LARVIK = DEVICE_KEY === "LARVIK_456";
const IS_ADMIN = DEVICE_KEY === "ADMIN_999";

type Employee = {
  id: string;
  name: string;
  pin: string;
  active: boolean;
};

type Shift = {
  id: string;
  employeeId: string;
  employeeName: string;
  checkIn: string;
  checkOut: string | null;
  breakMinutes: number;
  note: string;
  edited: boolean;
  source: "kiosk" | "admin";
};

type MonthlySummary = {
  employeeId: string;
  name: string;
  activeDays: number;
  shifts: number;
  totalHours: number;
  totalBreakMinutes: number;
  overtimeHours: number;
};

const ADMIN_PIN = "9999";
const STANDARD_DAILY_HOURS = 7.5;
const STORAGE_KEY = "timekiosk-preview-v2";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function todayKey(date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKey(date = new Date()): string {
  return todayKey(date).slice(0, 7);
}

function formatTime(dateString: string): string {
  return new Intl.DateTimeFormat("nb-NO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Oslo",
  }).format(new Date(dateString));
}

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Oslo",
  }).format(new Date(dateString));
}

function formatDateTime(dateString: string): string {
  return new Intl.DateTimeFormat("nb-NO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Oslo",
  }).format(new Date(dateString));
}

function toInputDateTimeValue(dateString: string | null): string {
  if (!dateString) return "";
  const d = new Date(dateString);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromInputDateTimeValue(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function calcWorkedHours(start: string, end: string | null, breakMinutes = 0): number {
  if (!end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime() - breakMinutes * 60 * 1000;
  if (ms <= 0) return 0;
  return Number((ms / 36e5).toFixed(2));
}

function calcWorkedText(start: string, end: string | null, breakMinutes = 0): string {
  return calcWorkedHours(start, end, breakMinutes).toFixed(2).replace(".", ",");
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("nb-NO", {
    month: "long",
    year: "numeric",
  });
}

function exportCsv(filename: string, rows: string[][]): void {
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";"))
    .join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {

useEffect(() => {
  async function loadInitialData() {
    const { data: employeeData, error: employeeError } = await supabase
      .from("employees")
      .select("id, name, pin, active")
      .order("name", { ascending: true });

    if (!employeeError && employeeData) {
      setEmployees(
        employeeData.map((emp) => ({
          id: String(emp.id),
          name: emp.name,
          pin: emp.pin,
          active: emp.active,
        }))
      );
    }

    const { data: shiftData, error: shiftError } = await supabase
      .from("shifts")
      .select("*")
      .order("check_in", { ascending: false });

    if (!shiftError && shiftData) {
      setShifts(
        shiftData.map((shift) => ({
          id: String(shift.id),
          employeeId: String(shift.employee_id),
          employeeName: shift.employee_name,
          checkIn: shift.check_in,
          checkOut: shift.check_out,
          breakMinutes: shift.break_minutes,
          note: shift.note,
          edited: shift.edited,
          source: shift.source,
        }))
      );
    }
  }

  loadInitialData();
}, []);
  if (!IS_TONSBERG && !IS_LARVIK && !IS_ADMIN) {
    return (
      <div className="min-h-screen bg-slate-100 p-10">
        <div className="mx-auto max-w-2xl rounded-3xl bg-white p-8 shadow-sm">
          <h1 className="mb-4 text-3xl font-bold text-slate-900">Ingen tilgang</h1>
          <p className="text-slate-600">Denne enheten er ikke godkjent.</p>
        </div>
      </div>
    );
  }

  const [now, setNow] = useState(new Date());
 const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [search, setSearch] = useState("");
  const [lastMessage, setLastMessage] = useState("");

  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [enteredPin, setEnteredPin] = useState("");
  const [pinError, setPinError] = useState("");

  const [adminOpen, setAdminOpen] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPinEntry, setAdminPinEntry] = useState("");
  const [adminError, setAdminError] = useState("");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeePin, setNewEmployeePin] = useState("");

  const [selectedMonth, setSelectedMonth] = useState(monthKey());
  const [editOpen, setEditOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [editCheckIn, setEditCheckIn] = useState("");
  const [editCheckOut, setEditCheckOut] = useState("");
  const [editBreakMinutes, setEditBreakMinutes] = useState("30");
  const [editNote, setEditNote] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as { employees: Employee[]; shifts: Shift[] };
      setEmployees(parsed.employees ?? DEFAULT_EMPLOYEES);
      setShifts(parsed.shifts ?? []);
    } catch {
      // ignore
    }
  }, []);

// useEffect(() => {
//   localStorage.setItem(STORAGE_KEY, JSON.stringify({ employees, shifts }));
// }, [employees, shifts]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);

  const filteredEmployees = useMemo(
    () => activeEmployees.filter((e) => e.name.toLowerCase().includes(search.toLowerCase())),
    [activeEmployees, search],
  );

  const today = todayKey(now);

  const todayShifts = useMemo(
    () => shifts.filter((s) => s.checkIn.startsWith(today)).sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
    [shifts, today],
  );

  const openShiftByEmployeeId = useMemo(() => {
    const map = new Map<string, Shift>();
    for (const shift of todayShifts) {
      if (!shift.checkOut) map.set(shift.employeeId, shift);
    }
    return map;
  }, [todayShifts]);

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    months.add(monthKey());
    shifts.forEach((s) => months.add(s.checkIn.slice(0, 7)));
    return Array.from(months).sort().reverse();
  }, [shifts]);

  const monthShifts = useMemo(
    () => shifts.filter((s) => s.checkIn.startsWith(selectedMonth)).sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
    [shifts, selectedMonth],
  );

  const monthlyRows = useMemo<MonthlySummary[]>(() => {
    const totals = new Map<string, MonthlySummary>();
    const daySets = new Map<string, Set<string>>();
    const dailyHours = new Map<string, number>();

    for (const shift of monthShifts) {
      const hours = calcWorkedHours(shift.checkIn, shift.checkOut, shift.breakMinutes);
      const dateKey = shift.checkIn.slice(0, 10);

      const row = totals.get(shift.employeeId) ?? {
        employeeId: shift.employeeId,
        name: shift.employeeName,
        activeDays: 0,
        shifts: 0,
        totalHours: 0,
        totalBreakMinutes: 0,
        overtimeHours: 0,
      };

      row.shifts += 1;
      row.totalHours += hours;
      row.totalBreakMinutes += shift.breakMinutes;
      totals.set(shift.employeeId, row);

      if (!daySets.has(shift.employeeId)) daySets.set(shift.employeeId, new Set());
      daySets.get(shift.employeeId)?.add(dateKey);

      const dailyKey = `${shift.employeeId}__${dateKey}`;
      dailyHours.set(dailyKey, (dailyHours.get(dailyKey) ?? 0) + hours);
    }

    for (const [dailyKey, hours] of dailyHours.entries()) {
      const [employeeId] = dailyKey.split("__");
      const row = totals.get(employeeId);
      if (!row) continue;
      row.overtimeHours += Math.max(0, hours - STANDARD_DAILY_HOURS);
    }

    return Array.from(totals.values())
      .map((row) => ({
        ...row,
        activeDays: daySets.get(row.employeeId)?.size ?? 0,
        totalHours: Number(row.totalHours.toFixed(2)),
        overtimeHours: Number(row.overtimeHours.toFixed(2)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "nb-NO"));
  }, [monthShifts]);

  const monthTotalHours = monthlyRows.reduce((sum, row) => sum + row.totalHours, 0);
  const monthTotalOvertime = monthlyRows.reduce((sum, row) => sum + row.overtimeHours, 0);

  function openEmployeeDialog(employee: Employee): void {
    setSelectedEmployee(employee);
    setEnteredPin("");
    setPinError("");
    setEmployeeDialogOpen(true);
  }

async function handleRegister(): Promise<void> {
  if (!selectedEmployee) return;

  if (enteredPin !== selectedEmployee.pin) {
    setPinError("Feil PIN-kode");
    return;
  }

  const openShift = openShiftByEmployeeId.get(selectedEmployee.id);
  const stamp = new Date().toISOString();

  if (openShift) {
    const { error } = await supabase
      .from("shifts")
      .update({ check_out: stamp })
      .eq("id", Number(openShift.id));

    if (error) {
      console.error("Kunne ikke registrere ut:", error);
      return;
    }

    setShifts((prev) =>
      prev.map((shift) =>
        shift.id === openShift.id
          ? {
              ...shift,
              checkOut: stamp,
            }
          : shift
      )
    );

    setLastMessage(`${selectedEmployee.name} registrerte ut kl. ${formatTime(stamp)}`);
  } else {
    const payload = {
      employee_id: Number(selectedEmployee.id),
      employee_name: selectedEmployee.name,
      check_in: stamp,
      check_out: null,
      break_minutes: 30,
      note: "",
      edited: false,
      source: "kiosk",
    };

    const { data, error } = await supabase
      .from("shifts")
      .insert(payload)
      .select()
      .single();

    if (error || !data) {
      console.error("Kunne ikke registrere inn:", error);
      return;
    }

    const newShift: Shift = {
      id: String(data.id),
      employeeId: String(data.employee_id),
      employeeName: data.employee_name,
      checkIn: data.check_in,
      checkOut: data.check_out,
      breakMinutes: data.break_minutes,
      note: data.note,
      edited: data.edited,
      source: data.source,
    };

    setShifts((prev) => [newShift, ...prev]);
    setLastMessage(`${selectedEmployee.name} registrerte inn kl. ${formatTime(stamp)}`);
  }

  setEmployeeDialogOpen(false);
  setSelectedEmployee(null);
  setEnteredPin("");
  setPinError("");
}

  function unlockAdmin(): void {
    if (adminPinEntry !== ADMIN_PIN) {
      setAdminError("Feil admin-PIN");
      return;
    }
    setAdminUnlocked(true);
  }

async function addEmployee(): Promise<void> {
  if (!newEmployeeName.trim() || !/^\d{4}$/.test(newEmployeePin)) return;

  const payload = {
    name: newEmployeeName.trim(),
    pin: newEmployeePin,
    active: true,
  };

  const { data, error } = await supabase
    .from("employees")
    .insert(payload)
    .select()
    .single();

  if (error || !data) {
    console.error("Kunne ikke legge til ansatt:", error);
    return;
  }

  const employee: Employee = {
    id: String(data.id),
    name: data.name,
    pin: data.pin,
    active: data.active,
  };

  setEmployees((prev) =>
    [...prev, employee].sort((a, b) => a.name.localeCompare(b.name, "nb-NO"))
  );
  setNewEmployeeName("");
  setNewEmployeePin("");
}

  async function toggleEmployee(employeeId: string): Promise<void> {
  const employee = employees.find((e) => e.id === employeeId);
  if (!employee) return;

  const nextActive = !employee.active;

  const { error } = await supabase
    .from("employees")
    .update({ active: nextActive })
    .eq("id", Number(employeeId));

  if (error) {
    console.error("Kunne ikke oppdatere ansatt:", error);
    return;
  }

  setEmployees((prev) =>
    prev.map((e) => (e.id === employeeId ? { ...e, active: nextActive } : e))
  );
}

  function openEditShift(shift: Shift): void {
    setEditingShiftId(shift.id);
    setEditCheckIn(toInputDateTimeValue(shift.checkIn));
    setEditCheckOut(toInputDateTimeValue(shift.checkOut));
    setEditBreakMinutes(String(shift.breakMinutes));
    setEditNote(shift.note);
    setEditOpen(true);
  }

  async function saveShiftEdit(): Promise<void> {
  if (!editingShiftId) return;

  const checkIn = fromInputDateTimeValue(editCheckIn);
  if (!checkIn) return;
  const checkOut = fromInputDateTimeValue(editCheckOut);

  const payload = {
    check_in: checkIn,
    check_out: checkOut,
    break_minutes: Number(editBreakMinutes) || 0,
    note: editNote.trim(),
    edited: true,
    source: "admin",
  };

  const { error } = await supabase
    .from("shifts")
    .update(payload)
    .eq("id", Number(editingShiftId));

  if (error) {
    console.error("Kunne ikke lagre endringer:", error);
    return;
  }

  setShifts((prev) =>
    prev.map((shift) =>
      shift.id === editingShiftId
        ? {
            ...shift,
            checkIn,
            checkOut,
            breakMinutes: Number(editBreakMinutes) || 0,
            note: editNote.trim(),
            edited: true,
            source: "admin",
          }
        : shift
    )
  );

  setEditOpen(false);
  setEditingShiftId(null);
}

 async function deleteShift(shiftId: string): Promise<void> {
  if (!window.confirm("Vil du slette denne registreringen?")) return;

  const { error } = await supabase
    .from("shifts")
    .delete()
    .eq("id", Number(shiftId));

  if (error) {
    console.error("Kunne ikke slette registrering:", error);
    return;
  }

  setShifts((prev) => prev.filter((s) => s.id !== shiftId));
}

  function exportMonthSummary(): void {
    const rows = [
      ["Ansatt", "Måned", "Arbeidsdager", "Registreringer", "Timer totalt", "Pause totalt min", "Overtid"],
      ...monthlyRows.map((row) => [
        row.name,
        monthLabel(selectedMonth),
        String(row.activeDays),
        String(row.shifts),
        row.totalHours.toFixed(2).replace(".", ","),
        String(row.totalBreakMinutes),
        row.overtimeHours.toFixed(2).replace(".", ","),
      ]),
    ];

    exportCsv(`maanedsoppsummering-${selectedMonth}.csv`, rows);
  }

  function exportEmployeeMonth(employeeId: string): void {
    const employee = employees.find((e) => e.id === employeeId);
    if (!employee) return;

    const summary = monthlyRows.find((r) => r.employeeId === employeeId);
    const employeeShifts = monthShifts.filter((s) => s.employeeId === employeeId);

    const rows: string[][] = [
      ["Ansatt", employee.name],
      ["Måned", monthLabel(selectedMonth)],
      ["Arbeidsdager", String(summary?.activeDays ?? 0)],
      ["Registreringer", String(summary?.shifts ?? 0)],
      ["Timer totalt", (summary?.totalHours ?? 0).toFixed(2).replace(".", ",")],
      ["Overtid", (summary?.overtimeHours ?? 0).toFixed(2).replace(".", ",")],
      [],
      ["Dato", "Inn", "Ut", "Pause min", "Timer", "Notat"],
      ...employeeShifts.map((shift) => [
        shift.checkIn.slice(0, 10),
        formatTime(shift.checkIn),
        shift.checkOut ? formatTime(shift.checkOut) : "",
        String(shift.breakMinutes),
        shift.checkOut ? calcWorkedText(shift.checkIn, shift.checkOut, shift.breakMinutes) : "",
        shift.note,
      ]),
    ];

    exportCsv(`${employee.name.toLowerCase().replaceAll(" ", "-")}-${selectedMonth}.csv`, rows);
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 text-slate-900 md:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-6 shadow-sm md:col-span-2">
            <div className="mb-3 flex items-center gap-3 text-3xl font-semibold">
              <Clock3 className="h-8 w-8" /> Time registrering Ren Tekstil AS
            </div>
            <div className="text-lg text-slate-700">
             {new Intl.DateTimeFormat("nb-NO", {
  weekday: "long",
  day: "2-digit",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Oslo",
}).format(now)}
            </div>
            <div className="mt-2 text-5xl font-semibold tabular-nums">
             {new Intl.DateTimeFormat("nb-NO", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Europe/Oslo",
}).format(now)}
            </div>
            <div className="mt-2 text-slate-600">
              Trykk på navnet ditt, tast PIN-koden, og registrer inn eller ut.
            </div>
            {lastMessage && (
              <div className="mt-3 rounded-2xl bg-emerald-50 p-3 text-emerald-700">{lastMessage}</div>
            )}
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="mb-3 flex items-center gap-2 text-2xl font-semibold">
              <Users className="h-6 w-6" /> Drift
            </div>
            <div className="flex flex-col gap-3 text-lg">
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                <span>På jobb nå</span>
                <span className="rounded-full bg-slate-900 px-3 py-1 text-white">{openShiftByEmployeeId.size}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                <span>Registreringer i dag</span>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-800">{todayShifts.length}</span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                <span>Status</span>
                <span className="flex items-center gap-2 text-sm text-slate-600">
                  {navigator.onLine ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                  {navigator.onLine ? "Online" : "Offline"}
                </span>
              </div>

              {IS_ADMIN && (
                <button
                  onClick={() => {
                    setAdminOpen(true);
                    setAdminUnlocked(false);
                    setAdminPinEntry("");
                    setAdminError("");
                  }}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white"
                >
                  <Settings className="h-4 w-4" /> Åpne admin
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="mb-4 text-2xl font-semibold">Ansatte</div>

            <div className="relative mb-5">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Søk etter navn"
                className="h-14 w-full rounded-2xl border border-slate-200 pl-12 pr-4 text-lg outline-none"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredEmployees.map((employee) => {
                const isCheckedIn = openShiftByEmployeeId.has(employee.id);

                return (
                  <button
                    key={employee.id}
                    onClick={() => openEmployeeDialog(employee)}
                    className="min-h-28 rounded-3xl border border-slate-200 bg-white px-5 py-5 text-left shadow-sm transition hover:bg-slate-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="mb-3 flex items-center gap-2 text-xl font-semibold">
                          <UserRound className="h-5 w-5" />
                          {employee.name}
                        </div>
                        <div className="text-base text-slate-600">
                          {isCheckedIn ? "Registrert inn" : "Ikke registrert inn"}
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-sm ${
                          isCheckedIn ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {isCheckedIn ? "På jobb" : "Ute"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-5 shadow-sm">
            <div className="mb-4 text-2xl font-semibold">Dagens registreringer</div>
            <div className="flex flex-col gap-3">
              {todayShifts.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                  Ingen registreringer ennå i dag.
                </div>
              )}

              {todayShifts.map((shift) => (
                <div key={shift.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="text-xl font-semibold">{shift.employeeName}</div>
                      <div className="mt-1 text-slate-600">
                        Inn: {formatTime(shift.checkIn)}
                        {shift.checkOut ? ` • Ut: ${formatTime(shift.checkOut)}` : " • Fortsatt på jobb"}
                        {shift.breakMinutes ? ` • Pause: ${shift.breakMinutes} min` : ""}
                      </div>
                    </div>
                    <div>
                      {shift.checkOut ? (
                        <span className="rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-800">
                          {calcWorkedText(shift.checkIn, shift.checkOut, shift.breakMinutes)} t
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-700">
                          Aktiv
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {employeeDialogOpen && selectedEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl">
            <div className="mb-4">
              <div className="text-2xl font-semibold">{selectedEmployee.name}</div>
              <div className="text-slate-500">
                Tast PIN-koden din for å registrere{" "}
                {openShiftByEmployeeId.has(selectedEmployee.id) ? "ut" : "inn"}.
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl bg-slate-100 p-4 text-base">
                Tidspunkt: {formatDateTime(new Date().toISOString())}
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">PIN-kode</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={enteredPin}
                    onChange={(e) => {
                      setEnteredPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                      setPinError("");
                    }}
                    type="password"
                    inputMode="numeric"
                    placeholder="4 sifre"
                    className="h-14 w-full rounded-2xl border border-slate-200 pl-12 pr-4 text-lg"
                  />
                </div>
                {pinError && <div className="mt-2 text-sm text-red-600">{pinError}</div>}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setEmployeeDialogOpen(false)}
                  className="h-12 flex-1 rounded-2xl border border-slate-200 bg-white"
                >
                  Avbryt
                </button>
                <button
                  onClick={handleRegister}
                  className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-slate-900 text-white"
                >
                  {openShiftByEmployeeId.has(selectedEmployee.id) ? (
                    <LogOut className="h-4 w-4" />
                  ) : (
                    <LogIn className="h-4 w-4" />
                  )}
                  {openShiftByEmployeeId.has(selectedEmployee.id) ? "Registrer ut" : "Registrer inn"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {IS_ADMIN && adminOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 p-4">
          <div className="mx-auto max-h-[95vh] max-w-7xl overflow-auto rounded-3xl bg-slate-100 p-4 shadow-xl">
            {!adminUnlocked ? (
              <div className="mx-auto mt-20 max-w-md rounded-3xl bg-white p-6 shadow-sm">
                <div className="mb-4 text-2xl font-semibold">Admin</div>
                <div className="mb-4 text-slate-500">Tast admin-PIN.</div>
                <input
                  value={adminPinEntry}
                  onChange={(e) => {
                    setAdminPinEntry(e.target.value.replace(/\D/g, "").slice(0, 4));
                    setAdminError("");
                  }}
                  type="password"
                  inputMode="numeric"
                  placeholder="4 sifre"
                  className="mb-3 h-14 w-full rounded-2xl border border-slate-200 px-4 text-lg"
                />
                {adminError && <div className="mb-3 text-sm text-red-600">{adminError}</div>}
                <div className="flex gap-3">
                  <button
                    onClick={() => setAdminOpen(false)}
                    className="h-12 flex-1 rounded-2xl border border-slate-200 bg-white"
                  >
                    Lukk
                  </button>
                  <button onClick={unlockAdmin} className="h-12 flex-1 rounded-2xl bg-slate-900 text-white">
                    Åpne admin
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex justify-end">
                  <button
                    onClick={() => setAdminOpen(false)}
                    className="h-12 rounded-2xl border border-slate-200 bg-white px-4"
                  >
                    Lukk admin
                  </button>
                </div>

                <div className="rounded-3xl bg-white p-5 shadow-sm">
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="flex items-center gap-2 text-2xl font-semibold">
                        <CalendarDays className="h-5 w-5" /> Månedsoppsummering per ansatt
                      </div>
                      <div className="text-slate-500">Bruk denne ved månedsslutt og lønnskjøring.</div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <select
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="h-12 rounded-2xl border border-slate-200 px-4"
                      >
                        {monthOptions.map((month) => (
                          <option key={month} value={month}>
                            {monthLabel(month)}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={exportMonthSummary}
                        className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4"
                      >
                        <Download className="h-4 w-4" /> Eksporter oppsummering
                      </button>
                    </div>
                  </div>

                  <div className="mb-4 grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-sm text-slate-500">Måned</div>
                      <div className="text-xl font-semibold capitalize">{monthLabel(selectedMonth)}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-sm text-slate-500">Ansatte med timer</div>
                      <div className="text-xl font-semibold">{monthlyRows.length}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-sm text-slate-500">Timer totalt</div>
                      <div className="text-xl font-semibold">{monthTotalHours.toFixed(2).replace(".", ",")}</div>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <div className="text-sm text-slate-500">Overtid totalt</div>
                      <div className="text-xl font-semibold">{monthTotalOvertime.toFixed(2).replace(".", ",")}</div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {monthlyRows.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
                        Ingen data for valgt måned.
                      </div>
                    )}

                    {monthlyRows.map((row) => (
                      <div key={row.employeeId} className="rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="text-xl font-semibold">{row.name}</div>
                            <div className="mt-1 text-slate-600">
                              {row.activeDays} arbeidsdager • {row.shifts} registreringer •{" "}
                              {row.totalBreakMinutes} min pause totalt
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-800">
                              {row.totalHours.toFixed(2).replace(".", ",")} t
                            </span>
                            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-700">
                              Overtid {row.overtimeHours.toFixed(2).replace(".", ",")} t
                            </span>
                            <button
                              onClick={() => exportEmployeeMonth(row.employeeId)}
                              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4"
                            >
                              <Download className="h-4 w-4" /> Eksporter ansatt
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-3xl bg-white p-5 shadow-sm lg:col-span-1">
                    <div className="mb-4 text-xl font-semibold">Legg til ansatt</div>
                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="mb-2 block text-sm font-medium">Navn</label>
                        <input
                          value={newEmployeeName}
                          onChange={(e) => setNewEmployeeName(e.target.value)}
                          className="h-12 w-full rounded-2xl border border-slate-200 px-3"
                          placeholder="Fornavn Etternavn"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-medium">PIN-kode</label>
                        <input
                          value={newEmployeePin}
                          onChange={(e) => setNewEmployeePin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                          className="h-12 w-full rounded-2xl border border-slate-200 px-3"
                          placeholder="4 sifre"
                        />
                      </div>

                      <button onClick={addEmployee} className="h-12 rounded-2xl bg-slate-900 text-white">
                        Legg til
                      </button>
                    </div>
                  </div>

                  <div className="rounded-3xl bg-white p-5 shadow-sm lg:col-span-2">
                    <div className="mb-4 text-xl font-semibold">Ansattliste</div>
                    <div className="flex flex-col gap-2">
                      {employees.map((employee) => (
                        <div key={employee.id} className="rounded-2xl bg-slate-50 p-3">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="font-medium">{employee.name}</div>
                              <div className="text-sm text-slate-500">
                                PIN: {employee.pin} • {employee.active ? "Aktiv" : "Inaktiv"}
                              </div>
                            </div>
                            <button
                              onClick={() => toggleEmployee(employee.id)}
                              className="h-10 rounded-2xl border border-slate-200 bg-white px-4"
                            >
                              {employee.active ? "Sett inaktiv" : "Aktiver"}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl bg-white p-5 shadow-sm">
                  <div className="mb-4 text-xl font-semibold">Registreringer</div>
                  <div className="flex flex-col gap-2">
                    {monthShifts.map((shift) => (
                      <div key={shift.id} className="rounded-2xl bg-slate-50 p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="font-medium">{shift.employeeName}</div>
                            <div className="text-sm text-slate-500">
                              {shift.checkIn.slice(0, 10)} • Inn {formatTime(shift.checkIn)} • Ut{" "}
                              {shift.checkOut ? formatTime(shift.checkOut) : "-"} • Pause {shift.breakMinutes} min
                              {shift.edited ? " • Korrigert" : ""}
                            </div>
                            {shift.note && (
                              <div className="mt-1 text-sm text-slate-600">Notat: {shift.note}</div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-800">
                              {shift.checkOut
                                ? `${calcWorkedText(shift.checkIn, shift.checkOut, shift.breakMinutes)} t`
                                : "Aktiv"}
                            </span>
                            <button
                              onClick={() => openEditShift(shift)}
                              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4"
                            >
                              <Pencil className="h-4 w-4" /> Rediger
                            </button>
                            <button
                              onClick={() => deleteShift(shift.id)}
                              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4"
                            >
                              <Trash2 className="h-4 w-4" /> Slett
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl">
            <div className="mb-4 text-2xl font-semibold">Korriger registrering</div>
            <div className="text-slate-500">Endre tider, pause og notat.</div>

            <div className="mt-4 flex flex-col gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium">Inn</label>
                <input
                  type="datetime-local"
                  value={editCheckIn}
                  onChange={(e) => setEditCheckIn(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 px-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Ut</label>
                <input
                  type="datetime-local"
                  value={editCheckOut}
                  onChange={(e) => setEditCheckOut(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-200 px-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Pause i minutter</label>
                <input
                  value={editBreakMinutes}
                  onChange={(e) => setEditBreakMinutes(e.target.value.replace(/\D/g, ""))}
                  className="h-12 w-full rounded-2xl border border-slate-200 px-3"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium">Notat</label>
                <textarea
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="min-h-24 w-full rounded-2xl border border-slate-200 p-3"
                  placeholder="F.eks. glemt utstempling"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setEditOpen(false)}
                className="h-12 flex-1 rounded-2xl border border-slate-200 bg-white"
              >
                Avbryt
              </button>
              <button onClick={saveShiftEdit} className="h-12 flex-1 rounded-2xl bg-slate-900 text-white">
                Lagre endringer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}