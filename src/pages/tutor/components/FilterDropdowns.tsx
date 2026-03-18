
import { useState, useEffect } from 'react';
import { apiClient } from '../../../utils/apiClient';

interface Doctor {
  id: number;
  display_name: string;
}

interface Group {
  id: number;
  name: string;
  students_count: number;
}

interface FilterDropdownsProps {
  selectedDoctor: number | null;
  selectedGroup: number | null;
  onDoctorChange: (id: number | null) => void;
  onGroupChange: (id: number | null) => void;
  compact?: boolean;
}

export default function FilterDropdowns({
  selectedDoctor,
  selectedGroup,
  onDoctorChange,
  onGroupChange,
  compact = false,
}: FilterDropdownsProps) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    let mounted = true;

    apiClient
      .get('/api/tutor/doctors')
      .then((res) => {
        if (!mounted) return;
        const rawDoctors = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.results)
            ? res.data.results
            : [];

        const normalizedDoctors: Doctor[] = rawDoctors
          .map((item: any) => ({
            id: Number(item?.id),
            display_name: String(item?.display_name ?? item?.full_name ?? item?.name ?? '').trim(),
          }))
          .filter((item: Doctor) => Number.isFinite(item.id) && item.id > 0 && item.display_name.length > 0);

        setDoctors(normalizedDoctors);
      })
      .catch(() => {
        if (!mounted) return;
        setDoctors([]);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    if (selectedDoctor) {
      onGroupChange(null);

      apiClient
        .get(`/api/tutor/doctors/${selectedDoctor}/groups`)
        .then((res) => {
          if (!mounted) return;
          const rawGroups = Array.isArray(res.data) ? res.data : [];
          const normalizedGroups: Group[] = rawGroups
            .map((item: any) => ({
              id: Number(item?.id),
              name: String(item?.name ?? '').trim(),
              students_count: Number(item?.students_count ?? 0),
            }))
            .filter((item: Group) => Number.isFinite(item.id) && item.id > 0 && item.name.length > 0);
          setGroups(normalizedGroups);
        })
        .catch(() => {
          if (!mounted) return;
          setGroups([]);
        });
    } else {
      setGroups([]);
    }
    return () => {
      mounted = false;
    };
  }, [selectedDoctor]);

  const wrapperClass = compact
    ? 'grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr),minmax(0,1fr)]'
    : 'grid grid-cols-1 gap-4';

  const labelClass = compact
    ? 'mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500'
    : 'mb-1.5 block text-xs font-medium text-gray-500';

  const inputClass = compact
    ? 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent cursor-pointer appearance-none whitespace-nowrap'
    : 'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent cursor-pointer appearance-none whitespace-nowrap';

  const disabledInputClass = compact
    ? 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent cursor-pointer disabled:opacity-50 disabled:bg-slate-100 appearance-none whitespace-nowrap'
    : 'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent cursor-pointer disabled:opacity-50 disabled:bg-gray-100 appearance-none whitespace-nowrap';

  return (
    <div className={wrapperClass}>
      {/* Doctor Dropdown */}
      <div>
        <label className={labelClass}>Doctor</label>
        <div className="relative">
          <select
            value={selectedDoctor || ''}
            onChange={(e) => onDoctorChange(e.target.value ? Number(e.target.value) : null)}
            className={inputClass}
          >
            <option value="">Select Doctor</option>
            {doctors.map((doctor) => (
              <option key={doctor.id} value={doctor.id}>
                {doctor.display_name}
              </option>
            ))}
          </select>
          <i className="ri-arrow-down-s-line absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
        </div>
      </div>

      {/* Group Dropdown */}
      <div>
        <label className={labelClass}>Group</label>
        <div className="relative">
          <select
            value={selectedGroup || ''}
            onChange={(e) => onGroupChange(e.target.value ? Number(e.target.value) : null)}
            disabled={!selectedDoctor}
            className={disabledInputClass}
          >
            <option value="0">All Group</option>

            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}

              </option>
            ))}
          </select>
          <i className="ri-arrow-down-s-line absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
        </div>
      </div>
    </div>
  );
}
