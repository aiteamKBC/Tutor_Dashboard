import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import kentLogo from '../../../Kent-Business-College.webp';
import FilterDropdowns from './components/FilterDropdowns';
import SessionsList from './components/SessionsList';
import ChartsSection from './components/ChartsSection';
import { apiClient } from '../../utils/apiClient';
import type { TutorDashboardData } from '../../types';

interface DoctorSearchResult {
  id: number;
  display_name: string;
  groups: Array<{
    id: number;
    name: string;
    students_count: number;
    modules: Array<{
      id: number;
      name: string;
      code?: string;
    }>;
  }>;
}

export default function TutorDashboard() {
  const [selectedDoctor, setSelectedDoctor] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [dashboardData, setDashboardData] = useState<TutorDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelledFilter, setCancelledFilter] = useState('');
  const [doctorSearch, setDoctorSearch] = useState('');
  const [searchResults, setSearchResults] = useState<DoctorSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [showHeaderFilters, setShowHeaderFilters] = useState(false);

  const applyDoctorSearchSelection = (doctor: DoctorSearchResult) => {
    setSelectedDoctor(doctor.id);
    setSelectedGroup(null);
    setDoctorSearch(doctor.display_name);
    setSearchResults([]);
  };

  useEffect(() => {
    if (selectedDoctor) {
      loadDashboardData();
    } else {
      setDashboardData(null);
    }
  }, [selectedDoctor, selectedGroup, dateFrom, dateTo]);

  const loadDashboardData = () => {
    setLoading(true);

    apiClient
      .get('/api/tutor/dashboard', {
        params: {
          doctor_id: selectedDoctor,
          group_id: selectedGroup ?? 0,
          module_id: 0,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
        },
      })
      .then((res) => {
        setDashboardData(res.data as TutorDashboardData);
      })
      .catch(() => {
        setDashboardData(null);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    const q = doctorSearch.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      setSearchLoading(true);
      apiClient
        .get('/api/tutor/doctors/search', { params: { q } })
        .then((res) => {
          setSearchResults(Array.isArray(res.data) ? (res.data as DoctorSearchResult[]) : []);
        })
        .catch(() => {
          setSearchResults([]);
        })
        .finally(() => setSearchLoading(false));
    }, 300);

    return () => clearTimeout(timer);
  }, [doctorSearch]);

  useEffect(() => {
    const q = doctorSearch.trim().toLowerCase();
    if (q.length < 2 || searchLoading || searchResults.length === 0) return;

    const exactMatch = searchResults.find((d) => d.display_name.toLowerCase() === q);
    if (exactMatch) {
      applyDoctorSearchSelection(exactMatch);
      return;
    }

    if (searchResults.length === 1) {
      applyDoctorSearchSelection(searchResults[0]);
    }
  }, [doctorSearch, searchResults, searchLoading]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const doctorIdParam = params.get('doctor_id');
    if (!doctorIdParam) return;
    const parsedId = Number(doctorIdParam);
    if (!Number.isFinite(parsedId) || parsedId <= 0) return;
    setSelectedDoctor(parsedId);
    setSelectedGroup(null);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const doctorIdParam = params.get('doctor_id');
    const doctorNameParam = params.get('doctor_name');
    if (doctorIdParam || !doctorNameParam) return;

    const q = doctorNameParam.trim();
    if (!q) return;

    apiClient
      .get('/api/tutor/doctors/search', { params: { q } })
      .then((res) => {
        const results = Array.isArray(res.data) ? (res.data as DoctorSearchResult[]) : [];
        if (results.length === 0) return;

        const exact = results.find((d) => d.display_name.toLowerCase() === q.toLowerCase());
        const chosen = exact || results[0];
        setSelectedDoctor(chosen.id);
        setSelectedGroup(null);
        setDoctorSearch(chosen.display_name);
      })
      .catch(() => {
        // Keep page stable if name-based resolution fails.
      });
  }, []);

  const cancelledSessionsCount = (dashboardData?.sessions || []).filter((session) => session.cancelled_session).length;
  const completedSessionsCount = Math.max(0, (dashboardData?.kpis.total_sessions || 0) - cancelledSessionsCount);
  const normalizeDoctorIdentity = (value: string) =>
    String(value || '')
      .toLowerCase()
      .replace(/\bdr\.?\b/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const doctorIdentityMatches = (left: string, right: string) => {
    const leftTokens = normalizeDoctorIdentity(left).split(' ').filter(Boolean);
    const rightTokens = new Set(normalizeDoctorIdentity(right).split(' ').filter(Boolean));
    if (leftTokens.length === 0 || rightTokens.size === 0) return false;
    const overlap = leftTokens.filter((token) => rightTokens.has(token)).length;
    return overlap >= Math.min(2, leftTokens.length);
  };

  const adjustedSessions = useMemo(() => {
    const normalizedDoctorName = dashboardData?.doctor?.name ? String(dashboardData.doctor.name).trim() : '';

    return (dashboardData?.sessions || []).filter((session) => {
      if (session.cancelled_session) return false;
      if (!session.is_covered_session) return true;

      const owner = String(session.owner_doctor || '').trim();
      return normalizedDoctorName ? !doctorIdentityMatches(owner, normalizedDoctorName) : true;
    });
  }, [dashboardData]);

  const adjustedSessionsCount = adjustedSessions.length;
  const adjustedChecklistExpected = adjustedSessionsCount * 12;

  const completedChecklistSummary = useMemo(
    () =>
      adjustedSessions.reduce(
        (acc, session) => {
          const sessionItems = Array.isArray(session.checklist) ? session.checklist : [];
          for (const item of sessionItems) {
            if (item?.status === 'Met') acc.met += 1;
            if (item?.status === 'Partial') acc.partial += 1;
            if (item?.status === 'Not Met') acc.notMet += 1;
          }

          return acc;
        },
        { met: 0, partial: 0, notMet: 0 }
      ),
    [adjustedSessions]
  );
  const complianceRate =
    adjustedChecklistExpected > 0
      ? Math.round((completedChecklistSummary.met / adjustedChecklistExpected) * 100)
      : 0;
  const coveredSessionsSummary = useMemo(() => {
    const normalizedDoctorName = dashboardData?.doctor?.name ? String(dashboardData.doctor.name).trim() : '';
    const sessions = dashboardData?.sessions || [];

    const coveredForDoctor = sessions.filter((session) => {
      if (!session.is_covered_session) return false;
      const owner = String(session.owner_doctor || '').trim();
      return normalizedDoctorName ? doctorIdentityMatches(owner, normalizedDoctorName) : true;
    });

    const coveredByNames = Array.from(
      new Set(
        coveredForDoctor
          .map((session) => String(session.covered_by || '').trim())
          .filter((name) => name.length > 0)
      )
    );

    const coveredByDoctorForOthers = sessions.filter((session) => {
      if (!session.is_covered_session) return false;
      const coveredBy = String(session.covered_by || '').trim();
      const owner = String(session.owner_doctor || '').trim();
      return (
        !!normalizedDoctorName &&
        doctorIdentityMatches(coveredBy, normalizedDoctorName) &&
        owner.length > 0 &&
        !doctorIdentityMatches(owner, normalizedDoctorName)
      );
    });

    const ownerNames = Array.from(
      new Set(
        coveredByDoctorForOthers
          .map((session) => String(session.owner_doctor || '').trim())
          .filter((name) => name.length > 0)
      )
    );

    return {
      coveredForDoctorCount: coveredForDoctor.length,
      coveredByNames,
      coveredByDoctorCount: coveredByDoctorForOthers.length,
      ownerNames,
    };
  }, [dashboardData]);
  const dashboardOverviewCards = useMemo(
    () => [
      {
        label: 'Adjusted Sessions',
        value: String(adjustedSessionsCount),
        detail: '',
        tone: 'bg-gradient-to-br from-indigo-50 to-violet-100 text-indigo-800 ring-1 ring-indigo-200',
        labelTone: 'text-indigo-700',
        featured: true,
      },
      {
        label: 'Total Sessions',
        value: String(dashboardData?.kpis.total_sessions || 0),
        detail: '',
        tone: 'bg-slate-50 text-slate-900',
        labelTone: 'text-slate-500',
        featured: false,
      },
      {
        label: 'Completed Sessions',
        value: String(completedSessionsCount),
        detail: '',
        tone: 'bg-emerald-50 text-emerald-700',
        labelTone: 'text-emerald-700/80',
        featured: false,
      },
      {
        label: 'Canceled',
        value: String(cancelledSessionsCount),
        detail: '',
        tone: 'bg-rose-50 text-rose-700',
        labelTone: 'text-rose-700/80',
        featured: false,
      },
      {
        label: 'Compliance',
        value: `${complianceRate}%`,
        detail: '',
        tone: 'bg-violet-50 text-violet-700',
        labelTone: 'text-violet-700/80',
        featured: false,
      },
      {
        label: 'Met',
        value: String(completedChecklistSummary.met),
        detail: '',
        tone: 'bg-emerald-50 text-emerald-700',
        labelTone: 'text-emerald-700/80',
        featured: false,
      },
      {
        label: 'Partial',
        value: String(completedChecklistSummary.partial),
        detail: '',
        tone: 'bg-amber-50 text-amber-700',
        labelTone: 'text-amber-700/80',
        featured: false,
      },
      {
        label: 'Not Met',
        value: String(completedChecklistSummary.notMet),
        detail: '',
        tone: 'bg-rose-50 text-rose-700',
        labelTone: 'text-rose-700/80',
        featured: false,
      },
      {
        label: 'Coverage Received',
        value: String(coveredSessionsSummary.coveredForDoctorCount),
        detail: coveredSessionsSummary.coveredByNames.length ? `By: ${coveredSessionsSummary.coveredByNames.join(', ')}` : 'By: None',
        tone: 'bg-violet-50 text-violet-700',
        labelTone: 'text-violet-700/80',
        featured: false,
      },
      {
        label: 'Coverage Provided',
        value: String(coveredSessionsSummary.coveredByDoctorCount),
        detail: coveredSessionsSummary.ownerNames.length ? `For: ${coveredSessionsSummary.ownerNames.join(', ')}` : 'For: None',
        tone: 'bg-sky-50 text-sky-700',
        labelTone: 'text-sky-700/80',
        featured: false,
      },
    ],
    [
      adjustedSessionsCount,
      cancelledSessionsCount,
      adjustedChecklistExpected,
      completedChecklistSummary.met,
      completedChecklistSummary.notMet,
      completedChecklistSummary.partial,
      completedSessionsCount,
      complianceRate,
      coveredSessionsSummary.coveredByDoctorCount,
      coveredSessionsSummary.coveredByNames,
      coveredSessionsSummary.coveredForDoctorCount,
      coveredSessionsSummary.ownerNames,
      dashboardData,
    ]
  );
  const primaryOverviewCards = dashboardOverviewCards.filter((card) =>
    ['Adjusted Sessions', 'Total Sessions', 'Completed Sessions', 'Canceled', 'Compliance'].includes(card.label)
  );
  const secondaryOverviewCards = dashboardOverviewCards.filter(
    (card) => !['Adjusted Sessions', 'Total Sessions', 'Completed Sessions', 'Canceled', 'Compliance'].includes(card.label)
  );
  const activeHeaderFilters = useMemo(() => {
    const filters: Array<{ key: string; label: string; value: string }> = [];

    if (cancelledFilter === 'cancelled') {
      filters.push({ key: 'cancelled', label: 'Cancelled', value: 'Cancelled Only' });
    } else if (cancelledFilter === 'not_cancelled') {
      filters.push({ key: 'cancelled', label: 'Cancelled', value: 'Not Cancelled' });
    }

    if (dateFrom) {
      filters.push({ key: 'dateFrom', label: 'From', value: dateFrom });
    }

    if (dateTo) {
      filters.push({ key: 'dateTo', label: 'To', value: dateTo });
    }

    return filters;
  }, [cancelledFilter, dateFrom, dateTo]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[110rem] mx-auto px-4 md:px-5 py-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 flex items-center justify-center overflow-visible">
                <img
                  src={kentLogo}
                  alt="Kent Business College"
                  className="w-[95px] sm:w-[125px] lg:w-[150px] h-auto object-contain"
                />
              </div>
              <div className="min-w-0">
                <h1 className=" sm:text-xl  font-bold text-gray-900 leading-tight">Tutor Dashboard</h1>
                <p className="text-xs text-gray-500">Performance Monitoring System</p>
              </div>
            </div>
            <div className="w-full lg:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 relative">
              <div className="relative w-full lg:w-[420px]">
                <input
                  value={doctorSearch}
                  onChange={(e) => setDoctorSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchResults.length > 0) {
                      applyDoctorSearchSelection(searchResults[0]);
                    }
                  }}
                  placeholder="Search doctor name..."
                  className="w-full min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-10 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                {searchLoading && (
                  <i className="ri-loader-4-line absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin"></i>
                )}

                {searchResults.length > 0 && (
                  <div className="absolute z-30 mt-2 max-h-96 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {searchResults.map((doctor) => (
                      <button
                        key={doctor.id}
                        type="button"
                        className="w-full border-b border-gray-100 px-3 py-2 text-left hover:bg-violet-50"
                        onClick={() => {
                          applyDoctorSearchSelection(doctor);
                        }}
                      >
                        <div className="text-sm font-semibold text-gray-900">{doctor.display_name}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {doctor.groups.length} groups, {doctor.groups.reduce((acc, g) => acc + g.modules.length, 0)} modules
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {doctor.groups.slice(0, 2).map((g) => g.name).join(' - ')}
                          {doctor.groups.length > 2 ? ' ...' : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Link
                to="/tutor-summary"
                className="w-full sm:w-auto text-center whitespace-nowrap rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors"
              >
                View Performance Overview
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[110rem] mx-auto px-4 md:px-5 py-6">
        <div className="mb-6">
          <div className="bg-white rounded-[24px] border border-violet-200/90 p-5 lg:p-6 shadow-[0_18px_48px_rgba(109,40,217,0.08)]">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 via-violet-500 to-fuchsia-500 shadow-sm">
                    <i className="ri-user-3-line text-xl text-white"></i>
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold leading-tight text-violet-700">
                      {dashboardData?.doctor.name || 'Select Doctor'}
                    </h2>
                  </div>
                </div>
                {dashboardData && (
                  <div className="relative shrink-0 self-start">
                    <button
                      type="button"
                      onClick={() => setShowHeaderFilters((prev) => !prev)}
                      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
                        activeHeaderFilters.length > 0
                          ? 'border-violet-600 bg-violet-600 text-white hover:bg-violet-700'
                          : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                      }`}
                    >
                      <i className="ri-equalizer-line text-base"></i>
                      Filters
                      {activeHeaderFilters.length > 0 && (
                        <span
                          className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                            activeHeaderFilters.length > 0
                              ? 'bg-white/20 text-white'
                              : 'bg-violet-100 text-violet-700'
                          }`}
                        >
                          {activeHeaderFilters.length}
                        </span>
                      )}
                    </button>

                    {showHeaderFilters && (
                      <>
                        <button
                          type="button"
                          aria-label="Close filters"
                          onClick={() => setShowHeaderFilters(false)}
                          className="fixed inset-0 z-30 bg-slate-900/35 backdrop-blur-[1px] sm:hidden"
                        />
                        <div className="fixed inset-x-4 top-24 z-40 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_18px_48px_rgba(15,23,42,0.18)] sm:absolute sm:right-0 sm:left-auto sm:top-full sm:z-20 sm:mt-3 sm:w-[360px]">
                          <div className="mb-4 flex items-center justify-between">
                            <div>
                              <h3 className="text-sm font-semibold text-gray-900">Filters</h3>
                              <p className="text-xs text-gray-500">Refine the visible sessions</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setShowHeaderFilters(false)}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            >
                              <i className="ri-close-line text-lg"></i>
                            </button>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">Cancelled</label>
                              <select
                                value={cancelledFilter}
                                onChange={(e) => setCancelledFilter(e.target.value)}
                                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                              >
                                <option value="">All</option>
                                <option value="cancelled">Cancelled Only</option>
                                <option value="not_cancelled">Not Cancelled</option>
                              </select>
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                              <div>
                                <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">From</label>
                                <input
                                  type="date"
                                  value={draftDateFrom}
                                  onChange={(e) => setDraftDateFrom(e.target.value)}
                                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                />
                              </div>
                              <div>
                                <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">To</label>
                                <input
                                  type="date"
                                  value={draftDateTo}
                                  onChange={(e) => setDraftDateTo(e.target.value)}
                                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="mt-5 flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                setCancelledFilter('');
                                setDraftDateFrom('');
                                setDraftDateTo('');
                                setDateFrom('');
                                setDateTo('');
                                setShowHeaderFilters(false);
                              }}
                              className="flex-1 rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-100 sm:flex-none"
                            >
                              Clear
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setDateFrom(draftDateFrom);
                                setDateTo(draftDateTo);
                                setShowHeaderFilters(false);
                              }}
                              className="flex-1 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 sm:flex-none"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="rounded-[22px] border border-violet-200/80 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50/50 p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm ring-1 ring-violet-200/80">
                    <i className="ri-filter-3-line text-base"></i>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Doctor Filters</div>
                    <div className="text-xs text-violet-700/70">Choose doctor and group</div>
                  </div>
                </div>

                <FilterDropdowns
                  compact
                  selectedDoctor={selectedDoctor}
                  selectedGroup={selectedGroup}
                  onDoctorChange={setSelectedDoctor}
                  onGroupChange={setSelectedGroup}
                />
              </div>

              {dashboardData && activeHeaderFilters.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-500">Active Filters</span>
                  {activeHeaderFilters.map((filter) => (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => {
                        if (filter.key === 'cancelled') {
                          setCancelledFilter('');
                        }
                        if (filter.key === 'dateFrom') {
                          setDraftDateFrom('');
                          setDateFrom('');
                        }
                        if (filter.key === 'dateTo') {
                          setDraftDateTo('');
                          setDateTo('');
                        }
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
                    >
                      <span>{filter.label}: {filter.value}</span>
                      <i className="ri-close-line text-sm"></i>
                    </button>
                  ))}
                </div>
              )}

              {dashboardData ? (
                <div className="rounded-[30px] border border-slate-100 bg-gradient-to-br from-white via-slate-50 to-violet-50/30 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
                    {[...primaryOverviewCards, ...secondaryOverviewCards].map((card) => (
                      <div
                        key={card.label}
                        className={`flex min-h-[94px] flex-col items-center justify-center rounded-3xl p-4 text-center ring-1 ring-white/80 ${
                          card.featured
                            ? 'border border-indigo-200/80 shadow-[0_16px_40px_rgba(99,102,241,0.16)]'
                            : 'shadow-sm'
                        } ${card.tone}`}
                      >
                        <div className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${card.labelTone}`}>
                          {card.label}
                        </div>
                        <div className="mt-3">
                          <div className={`${card.featured ? 'text-[2.25rem]' : 'text-3xl'} font-bold leading-none`}>
                            {card.value}
                          </div>
                        </div>
                        {card.detail ? (
                          <div className="mt-2 line-clamp-2 text-[11px] font-medium leading-5 opacity-80">
                            {card.detail}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <div className="hidden xl:grid xl:grid-cols-5 gap-3">
                    {primaryOverviewCards.map((card) => (
                      <div
                        key={card.label}
                        className={`flex min-h-[102px] flex-col items-center justify-center rounded-3xl p-4 text-center ring-1 ring-white/80 ${
                          card.featured
                            ? 'border border-indigo-200/80 shadow-[0_16px_40px_rgba(99,102,241,0.16)]'
                            : 'shadow-sm'
                        } ${card.tone}`}
                      >
                        <div className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${card.labelTone}`}>
                          {card.label}
                        </div>
                        <div className="mt-3">
                          <div className={`${card.featured ? 'text-[2.25rem]' : 'text-3xl'} font-bold leading-none`}>
                            {card.value}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 hidden xl:grid xl:grid-cols-5 gap-3">
                    {secondaryOverviewCards.map((card) => (
                      <div
                        key={card.label}
                        className={`flex min-h-[94px] flex-col items-center justify-center rounded-3xl p-4 text-center shadow-sm ring-1 ring-white/80 ${card.tone}`}
                      >
                        <div className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${card.labelTone}`}>
                          {card.label}
                        </div>
                        <div className="mt-3">
                          <div className="text-[2rem] font-bold leading-none">{card.value}</div>
                        </div>
                        {card.detail ? (
                          <div className="mt-2 line-clamp-2 text-[11px] font-medium leading-5 opacity-80">
                            {card.detail}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-center text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                    Based on Adjusted Sessions only
                  </div>
                </div>
              ) : loading && selectedDoctor ? (
                <div className="rounded-[30px] border border-slate-100 bg-gradient-to-br from-white via-slate-50 to-violet-50/30 p-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {Array.from({ length: 10 }).map((_, index) => (
                      <div
                        key={index}
                        className="min-h-[94px] rounded-3xl bg-white/90 p-4 shadow-sm ring-1 ring-slate-100 animate-pulse"
                      >
                        <div className="h-3 w-24 rounded-full bg-slate-200"></div>
                        <div className="mt-5 h-8 w-16 rounded-full bg-slate-300"></div>
                        <div className="mt-3 h-3 w-20 rounded-full bg-slate-200"></div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[260px] items-center justify-center rounded-[24px] border border-violet-100/80 bg-gradient-to-br from-white via-slate-50 to-violet-50/20 px-6 py-10">
                  <div className="max-w-2xl text-center">
                    <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                      <i className="ri-bar-chart-box-line text-4xl"></i>
                    </div>
                    <h3 className="text-[2rem] font-semibold tracking-tight text-slate-900">Select Filters to View Data</h3>
                    <p className="mt-3 text-base leading-7 text-slate-500">
                      Choose a doctor and optional group from the filters above to display performance analytics.
                    </p>
                  </div>
                </div>
              )}
              </div>
            </div>
            {loading && (
              <div className="mt-6 space-y-6 animate-pulse">
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                  <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                    <div className="h-4 w-36 rounded-full bg-slate-200"></div>
                    <div className="h-4 w-24 rounded-full bg-slate-200"></div>
                  </div>
                  <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
                    <div className="flex flex-wrap gap-3">
                      <div className="h-10 w-40 rounded-xl bg-slate-200"></div>
                      <div className="h-10 w-40 rounded-xl bg-slate-200"></div>
                      <div className="h-10 w-40 rounded-xl bg-slate-200"></div>
                    </div>
                  </div>
                  <div className="space-y-4 px-6 py-5">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div key={index} className="grid grid-cols-[120px,minmax(0,1fr),80px,80px] gap-4">
                        <div className="h-4 rounded-full bg-slate-200"></div>
                        <div className="h-4 rounded-full bg-slate-200"></div>
                        <div className="h-4 rounded-full bg-slate-200"></div>
                        <div className="h-4 rounded-full bg-slate-200"></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

        </div>

        {!loading && dashboardData && (
          <div className="mt-6 space-y-6">
            <SessionsList
              sessions={dashboardData.sessions as any}
              cancelledFilter={cancelledFilter}
              onCancelledFilterChange={setCancelledFilter}
              dateFrom={draftDateFrom}
              dateTo={draftDateTo}
              onDateFromChange={setDraftDateFrom}
              onDateToChange={setDraftDateTo}
              onApplyDateFilter={() => {
                setDateFrom(draftDateFrom);
                setDateTo(draftDateTo);
              }}
              onClearDateFilter={() => {
                setDraftDateFrom('');
                setDraftDateTo('');
                setDateFrom('');
                setDateTo('');
              }}
              showFilters
              doctorName={dashboardData.doctor.name}
              groupName={dashboardData.group.name}
              moduleName={dashboardData.module?.name}
              studentsCount={dashboardData.group.total_students}
            />
            <ChartsSection charts={dashboardData.charts} sessions={dashboardData.sessions} />
          </div>
        )}
      </div>
    </div>
  );
}





