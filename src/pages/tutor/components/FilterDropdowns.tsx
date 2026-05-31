
import { useState, useEffect } from 'react';
import { apiClient } from '../../../utils/apiClient';
import ModernSelect, { type ModernSelectOption } from './ModernSelect';

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
    const controller = new AbortController();

    apiClient
      .get('/api/tutor/doctors', { signal: controller.signal })
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
      .catch((error: any) => {
        if (error?.code === 'ERR_CANCELED') return;
        if (!mounted) return;
        setDoctors([]);
      });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    if (selectedDoctor) {
      onGroupChange(null);

      apiClient
        .get(`/api/tutor/doctors/${selectedDoctor}/groups`, { signal: controller.signal })
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
        .catch((error: any) => {
          if (error?.code === 'ERR_CANCELED') return;
          if (!mounted) return;
          setGroups([]);
        });
    } else {
      setGroups([]);
    }
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [selectedDoctor]);

  const wrapperClass = compact
    ? 'grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr),minmax(0,1fr)]'
    : 'grid grid-cols-1 gap-4';

  const labelClass = compact
    ? 'mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500'
    : 'mb-1.5 block text-xs font-medium text-gray-500';

  const doctorOptions: ModernSelectOption[] = doctors.map((doctor) => ({
    value: String(doctor.id),
    label: doctor.display_name,
  }));

  const groupOptions: ModernSelectOption[] = [
    { value: '', label: 'All Group', description: selectedDoctor ? 'Show every group for this doctor' : undefined },
    ...groups.map((group) => ({
      value: String(group.id),
      label: group.name,
      description: `${group.students_count || 0} students`,
    })),
  ];

  return (
    <div className={wrapperClass}>
      <ModernSelect
        label="Doctor"
        labelClassName={labelClass}
        value={selectedDoctor ? String(selectedDoctor) : ''}
        onChange={(nextValue) => onDoctorChange(nextValue ? Number(nextValue) : null)}
        options={doctorOptions}
        placeholder="Select Doctor"
        searchable
        icon="ri-user-3-line"
        emptyText="No doctors found"
      />

      <ModernSelect
        label="Group"
        labelClassName={labelClass}
        value={selectedGroup ? String(selectedGroup) : ''}
        onChange={(nextValue) => onGroupChange(nextValue ? Number(nextValue) : null)}
        options={groupOptions}
        placeholder={selectedDoctor ? 'All Group' : 'Select doctor first'}
        disabled={!selectedDoctor}
        searchable={groups.length > 8}
        icon="ri-group-line"
        emptyText="No groups found"
      />
    </div>
  );
}
