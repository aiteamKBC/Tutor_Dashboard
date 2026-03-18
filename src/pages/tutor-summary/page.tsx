import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../../utils/apiClient';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface SummaryResponse {
  period: { from: string | null; to: string | null };
  totals: {
    total_sessions?: number;
    matched_sessions?: number;
    compliance_rate: number;
    met: number;
    partial: number;
    not_met: number;
    observations: number;
    trainers_count: number;
    evidence_with: number;
    evidence_without: number;
    evidence_coverage_rate: number;
  };
  trainers: Array<{
    name: string;
    sessions_count: number;
    full_met_sessions: number;
    observations: number;
    met: number;
    partial: number;
    not_met: number;
    compliance_rate: number;
    last_session_date: string | null;
  }>;
  strengths: Array<{ code: string; met_rate: number; met: number; total: number }>;
  improvements: Array<{ code: string; met_rate: number; not_met_rate: number; not_met: number; total: number }>;
  checklist_stats: Array<{
    code: string;
    label: string;
    order: number | null;
    met: number;
    partial: number;
    not_met: number;
    total: number;
    met_rate: number;
    partial_rate: number;
    not_met_rate: number;
    open_count: number;
    open_rate: number;
    not_met_by_doctor?: Array<{
      id?: number | null;
      name: string;
      count: number;
      sessions?: Array<{
        session_id?: string | null;
        date?: string | null;
        subject?: string;
      }>;
    }>;
    not_met_unmapped?: {
      count: number;
      sessions?: Array<{
        session_id?: string | null;
        date?: string | null;
        subject?: string;
      }>;
    };
    partial_by_doctor?: Array<{
      id?: number | null;
      name: string;
      count: number;
      sessions?: Array<{
        session_id?: string | null;
        date?: string | null;
        subject?: string;
      }>;
    }>;
    partial_unmapped?: {
      count: number;
      sessions?: Array<{
        session_id?: string | null;
        date?: string | null;
        subject?: string;
      }>;
    };
  }>;
  open_actions: Array<{
    code: string;
    label: string;
    open_count: number;
    open_rate: number;
    not_met: number;
    partial: number;
    total: number;
  }>;
  cancelled_sessions?: Array<{
    doctor_id?: number | null;
    doctor_name: string;
    date?: string | null;
    subject?: string;
    session_id?: string | null;
    trainer?: string | null;
  }>;
}

const formatCode = (code: string) =>
  code
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());


const formatDate = (value: string | null) => {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatTutorAxisName = (name: string) => {
  const cleaned = name
    .replace(/\b(dr|prof)\.?\s*/gi, '')
    .replace(/\s+and\s+.*/i, '')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return cleaned;
  return `${parts[0]} ${parts[1]}`;
};

const formatTutorAxisCompactName = (name: string) => {
  const hasProf = /\bprof\.?/i.test(name);
  const cleaned = name
    .replace(/\b(dr|prof)\.?\s*/gi, '')
    .replace(/\s+and\s+.*/i, '')
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return cleaned;
  const firstName = parts[0];
  const prefix = hasProf ? 'Prof.' : 'Dr.';
  return `${prefix} ${firstName}`;
};

export default function TutorSummaryPage() {
  const [data, setData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [isNarrowViewport, setIsNarrowViewport] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cancelledFilter, setCancelledFilter] = useState('not_cancelled');
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [draftCancelledFilter, setDraftCancelledFilter] = useState('not_cancelled');
  const [selectedNotMetCode, setSelectedNotMetCode] = useState<string | null>(null);
  const [selectedPartialCode, setSelectedPartialCode] = useState<string | null>(null);
  const [detailsModal, setDetailsModal] = useState<
    | null
    | {
      kind: 'not_met' | 'partial';
      item: SummaryResponse['checklist_stats'][number];
    }
  >(null);

  useEffect(() => {
    setLoading(true);
    apiClient
      .get('/api/tutor/summary', {
        params: {
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          cancelled_filter: cancelledFilter || undefined,
        },
      })
      .then((res) => setData(res.data as SummaryResponse))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, cancelledFilter]);

  useEffect(() => {
    const updateViewport = () => setIsNarrowViewport(window.innerWidth < 2000);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    setDraftDateFrom(dateFrom);
    setDraftDateTo(dateTo);
    setDraftCancelledFilter(cancelledFilter);
  }, [dateFrom, dateTo, cancelledFilter]);

  const periodText = useMemo(() => {
    if (!data?.period?.from || !data?.period?.to) return 'N/A';
    return `${formatDate(data.period.from)} - ${formatDate(data.period.to)}`;
  }, [data]);

  const headlineData = useMemo(() => {
    if (!data) return null;
    const topStrength = data.strengths[0];
    const topRisk = data.improvements[0];
    const sessions = data.totals.total_sessions ?? data.trainers.reduce((acc, t) => acc + (t.sessions_count || 0), 0);
    return {
      compliance: Math.round(data.totals.compliance_rate),
      observations: data.totals.observations,
      tutors: data.totals.trainers_count,
      sessions,
      met: data.totals.met,
      partial: data.totals.partial,
      notMet: data.totals.not_met,
      topStrength: topStrength ? formatCode(topStrength.code) : 'N/A',
      topRisk: topRisk ? formatCode(topRisk.code) : 'N/A',
    };
  }, [data]);

  const topTutors = useMemo(() => {
    if (!data) return [];
    return [...data.trainers]
      .sort(
        (a, b) =>
          (b.full_met_sessions - a.full_met_sessions) ||
          (b.sessions_count - a.sessions_count) ||
          (b.compliance_rate - a.compliance_rate) ||
          (b.observations - a.observations)
      )
      .slice(0, 3);
  }, [data]);

    const aiRequirementPlan = useMemo(() => {
    if (!data) return null;

    const checklist = [...data.checklist_stats].sort(
      (a, b) =>
        b.open_rate - a.open_rate ||
        b.not_met_rate - a.not_met_rate ||
        b.partial_rate - a.partial_rate
    );

    const topRiskItems = checklist.slice(0, 3);
    const nextRiskItems = checklist.slice(3, 6);
    const topStrengthItems = [...data.checklist_stats]
      .sort((a, b) => b.met_rate - a.met_rate)
      .slice(0, 2);

    const topRisk = topRiskItems[0];
    const secondRisk = topRiskItems[1];
    const topStrength = topStrengthItems[0];
    const weakestTutor = [...data.trainers].sort((a, b) => a.compliance_rate - b.compliance_rate)[0];
    const strongestTutor = [...data.trainers].sort((a, b) => b.compliance_rate - a.compliance_rate)[0];

    const complianceRate = Math.round(data.totals.compliance_rate);
    const partialRate = data.totals.observations
      ? Math.round((data.totals.partial / data.totals.observations) * 100)
      : 0;

    const itemsAnalyzed = data.checklist_stats.length;
    const avgOpenRate = itemsAnalyzed
      ? Math.round(
          data.checklist_stats.reduce((sum, item) => sum + (item.open_rate || 0), 0) /
            itemsAnalyzed
        )
      : 0;

    const priority =
      complianceRate < 85
        ? 'High'
        : complianceRate < 92
          ? 'Medium'
          : 'Low';

    const nextTarget =
      priority === 'High'
        ? 'Raise compliance to 90%+ within 30 days.'
        : priority === 'Medium'
          ? 'Raise compliance to 94%+ within 30 days.'
          : 'Stabilize performance and keep compliance above 95%.';

    return {
      priority,
      nextTarget,
      itemsAnalyzed,
      avgOpenRate,
      topRisk: topRisk ? formatCode(topRisk.code) : 'N/A',
      secondRisk: secondRisk ? formatCode(secondRisk.code) : 'N/A',
      topStrength: topStrength ? formatCode(topStrength.code) : 'N/A',
      weakestTutor: weakestTutor?.name || 'N/A',
      strongestTutor: strongestTutor?.name || 'N/A',
      complianceRate,
      partialRate,
      nowItems: topRiskItems.map((item) => ({
        label: formatCode(item.code),
        openRate: Math.round(item.open_rate),
        notMetRate: Math.round(item.not_met_rate),
      })),
      nextItems: nextRiskItems.map((item) => ({
        label: formatCode(item.code),
        openRate: Math.round(item.open_rate),
        partialRate: Math.round(item.partial_rate),
      })),
      strengthItems: topStrengthItems.map((item) => ({
        label: formatCode(item.code),
        metRate: Math.round(item.met_rate),
      })),
    };
  }, [data]);

  const tickerMessages = useMemo(() => {
    if (!data || !headlineData || !aiRequirementPlan) return [] as string[];

    const topTrainer = [...data.trainers].sort((a, b) => b.compliance_rate - a.compliance_rate)[0];
    const weakestTrainer = [...data.trainers].sort((a, b) => a.compliance_rate - b.compliance_rate)[0];

    return [
      `Checklist coverage: ${aiRequirementPlan.itemsAnalyzed} items analyzed with ${aiRequirementPlan.avgOpenRate}% average open rate.`,
      `Primary risk cluster: ${aiRequirementPlan.nowItems.map((item) => item.label).join(', ') || 'N/A'}.`,
      `Top strength cluster: ${aiRequirementPlan.strengthItems.map((item) => item.label).join(', ') || 'N/A'}.`,
      topTrainer
        ? `Top tutor by compliance: ${topTrainer.name} (${Math.round(topTrainer.compliance_rate)}%).`
        : 'Top tutor by compliance: N/A.',
      weakestTrainer
        ? `Coaching focus tutor: ${weakestTrainer.name} (${Math.round(weakestTrainer.compliance_rate)}%).`
        : 'Coaching focus tutor: N/A.',
      `Overall compliance: ${headlineData.compliance}% across ${headlineData.observations} observations and ${headlineData.sessions} sessions.`,
    ];
  }, [data, headlineData, aiRequirementPlan]);
  const trainerChartData = useMemo(() => {
    if (!data) return [];
    return [...data.trainers]
      .sort((a, b) => b.observations - a.observations)
      .map((t) => {
        const total = t.observations || 1;
        return {
          name: t.name,
          met: t.met,
          partial: t.partial,
          notMet: t.not_met,
          observations: t.observations,
          metRate: Number(((t.met / total) * 100).toFixed(1)),
          partialRate: Number(((t.partial / total) * 100).toFixed(1)),
          notMetRate: Number(((t.not_met / total) * 100).toFixed(1)),
          complianceRate: Number((t.compliance_rate || 0).toFixed(1)),
          sessionsCount: t.sessions_count,
        };
      });
  }, [data]);

  const useCompactXAxis = isNarrowViewport || trainerChartData.length > 8;

  const renderTrainerTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const row = payload[0]?.payload as
      | {
        met?: number;
        partial?: number;
        notMet?: number;
        metRate?: number;
        partialRate?: number;
        notMetRate?: number;
        complianceRate?: number;
        sessionsCount?: number;
      }
      | undefined;
    if (!row) return null;

    return (
      <div className="rounded-xl border border-gray-200 bg-white/95 px-4 py-3 shadow-md transition-all duration-1000">
        <p className="text-base font-semibold text-gray-900 mb-2">{label}</p>
        <p className="text-sm text-violet-700 font-semibold mb-1">Compliance: {row.complianceRate}%</p>
        <p className="text-sm text-gray-600 mb-1">Adjusted Sessions: {row.sessionsCount ?? 0}</p>
        <p className="text-sm text-emerald-700">Met %: {row.metRate}% ({row.met})</p>
        <p className="text-sm text-rose-600">Not Met %: {row.notMetRate}% ({row.notMet})</p>
        <p className="text-sm text-amber-600">Partially Met %: {row.partialRate}% ({row.partial})</p>
      </div>
    );
  };

  return (
    <>
      <div className="max-w-[110rem] mx-auto px-4 md:px-5 py-6 space-y-6">
        <div className="rounded-2xl overflow-hidden">
            {loading ? (
              <div className="py-12 text-center text-sm text-gray-500">Loading summary...</div>
            ) : !data ? (
              <div className="py-12 text-center text-sm text-gray-500">No summary data available.</div>
            ) : (
              <>
                {headlineData && (
                  <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 via-white to-indigo-50/60 p-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between pb-2 border-b border-violet-100">
                      <h2 className="text-2xl sm:text-[30px] font-bold text-violet-800 leading-none">KBC Tutor Performance Report</h2>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
                      <div className="flex items-center gap-2 rounded-full bg-white border border-violet-200 px-2 py-1">
                        <span className="text-xs text-gray-500">From</span>
                        <input
                          type="date"
                          value={draftDateFrom}
                          onChange={(e) => setDraftDateFrom(e.target.value)}
                          className="text-xs bg-transparent outline-none text-gray-700"
                        />
                      </div>
                      <div className="flex items-center gap-2 rounded-full bg-white border border-violet-200 px-2 py-1">
                        <span className="text-xs text-gray-500">To</span>
                        <input
                          type="date"
                          value={draftDateTo}
                          onChange={(e) => setDraftDateTo(e.target.value)}
                          className="text-xs bg-transparent outline-none text-gray-700"
                        />
                      </div>
                      <div className="flex items-center gap-2 rounded-full bg-white border border-violet-200 px-2 py-1">
                        <span className="text-xs text-gray-500">Canceled</span>
                        <select
                          value={draftCancelledFilter}
                          onChange={(e) => setDraftCancelledFilter(e.target.value)}
                          className="text-xs bg-transparent outline-none text-gray-700"
                        >
                          <option value="cancelled">Canceled</option>
                          <option value="not_cancelled">Not Canceled</option>
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDateFrom(draftDateFrom);
                          setDateTo(draftDateTo);
                          setCancelledFilter(draftCancelledFilter);
                        }}
                        disabled={
                          draftDateFrom === dateFrom &&
                          draftDateTo === dateTo &&
                          draftCancelledFilter === cancelledFilter
                        }
                        className="rounded-full bg-violet-600 border border-violet-600 px-3 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Apply
                      </button>
                      {(dateFrom || dateTo || cancelledFilter || draftDateFrom || draftDateTo || draftCancelledFilter) && (
                        <button
                          type="button"
                          onClick={() => {
                            setDateFrom('');
                            setDateTo('');
                            setCancelledFilter('');
                            setDraftDateFrom('');
                            setDraftDateTo('');
                            setDraftCancelledFilter('');
                          }}
                          className="rounded-full bg-white border border-violet-200 px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-50"
                        >
                          Clear
                        </button>
                      )}
                      <span className="rounded-full bg-white border border-violet-200 px-3 py-1">{headlineData.tutors} tutors</span>
                      <span className="rounded-full bg-white border border-violet-200 px-3 py-1">{headlineData.sessions} sessions</span>
                    </div>
                  </div>

                    <div className="mt-3 grid grid-cols-2 min-[520px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-2.5">
                      <div className="rounded-lg border border-violet-200 bg-white px-3 py-3 min-h-[78px] flex flex-col justify-between">
                        <p className="text-[11px] uppercase tracking-wide text-violet-700">Compliance</p>
                        <p className="text-2xl md:text-3xl font-bold text-violet-700 mt-1 leading-none">{headlineData.compliance}%</p>
                      </div>
                      <div className="rounded-lg border border-gray-200 bg-white px-3 py-3 min-h-[78px] flex flex-col justify-between">
                        <p className="text-[11px] uppercase tracking-wide text-gray-500">Observations</p>
                        <p className="text-2xl md:text-3xl font-bold text-gray-900 mt-1 leading-none">{headlineData.observations}</p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 min-h-[78px] flex flex-col justify-between">
                        <p className="text-[11px] uppercase tracking-wide text-emerald-700">Fully Met</p>
                        <p className="text-2xl md:text-3xl font-bold text-emerald-800 mt-1 leading-none">{headlineData.met}</p>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 min-h-[78px] flex flex-col justify-between">
                        <p className="text-[11px] uppercase tracking-wide text-amber-700">Partially Met</p>
                        <p className="text-2xl md:text-3xl font-bold text-amber-800 mt-1 leading-none">{headlineData.partial}</p>
                      </div>
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 min-h-[78px] flex flex-col justify-between">
                        <p className="text-[11px] uppercase tracking-wide text-rose-700">Not Met</p>
                        <p className="text-2xl md:text-3xl font-bold text-rose-800 mt-1 leading-none">{headlineData.notMet}</p>
                      </div>
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 min-h-[78px] flex flex-col justify-between">
                        <p className="text-[11px] uppercase tracking-wide text-emerald-700">Top Strength</p>
                        <p className="text-base md:text-lg font-semibold text-emerald-900 leading-tight break-words">{headlineData.topStrength}</p>
                      </div>
                      <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 min-h-[78px] flex flex-col justify-between">
                        <p className="text-[11px] uppercase tracking-wide text-rose-700">Main Risk</p>
                        <p className="text-base md:text-lg font-semibold text-rose-900 leading-tight break-words">{headlineData.topRisk}</p>
                      </div>
                    </div>
                  </div>
                      
                )}

              </>
            )}
        </div>


        {data && cancelledFilter !== 'cancelled' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2 transition-all duration-200">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Tutor Performance by Status</h2>
                <div className="sm:hidden space-y-2 max-h-[22rem] overflow-y-auto">
                  {trainerChartData.map((row) => (
                    <div key={`mobile-${row.name}`} className="rounded-lg border border-gray-100 bg-gray-50 p-2.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-900 truncate">{row.name}</p>
                        <p className="text-[11px] text-gray-600">{row.observations}</p>
                      </div>
                      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-200 flex">
                        <div className="h-full bg-[#34d399]" style={{ width: `${row.metRate}%` }} />
                        <div className="h-full bg-[#fbbf24]" style={{ width: `${row.partialRate}%` }} />
                        <div className="h-full bg-[#fb7185]" style={{ width: `${row.notMetRate}%` }} />
                      </div>
                      <div className="mt-1.5 text-[11px] text-gray-600">
                        <span className="text-emerald-700 font-medium">M {row.metRate}%</span> |{' '}
                        <span className="text-amber-700 font-medium">P {row.partialRate}%</span> |{' '}
                        <span className="text-rose-700 font-medium">N {row.notMetRate}%</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden sm:block h-[20rem]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={trainerChartData}
                      margin={{ top: 6, right: 12, left: 0, bottom: useCompactXAxis ? 20 : 8 }}
                      barCategoryGap="20%"
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        minTickGap={useCompactXAxis ? 2 : 8}
                        tickFormatter={useCompactXAxis ? formatTutorAxisCompactName : formatTutorAxisName}
                        tick={{ fontSize: useCompactXAxis ? 11 : 11, fill: '#111827', fontWeight: 600 }}
                        angle={useCompactXAxis ? -32 : 0}
                        textAnchor={useCompactXAxis ? 'end' : 'middle'}
                        tickMargin={useCompactXAxis ? 6 : 2}
                        height={useCompactXAxis ? 72 : 30}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 11 }}
                        width={42}
                      />
                      <Tooltip
                        content={renderTrainerTooltip}
                        animationDuration={1000}
                        cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
                        contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb' }}
                        formatter={(value: any, name: string) => [`${value}%`, name]}
                      />
                      <Legend
                        verticalAlign="bottom"
                        align="center"
                        wrapperStyle={{ paddingBottom: 0, paddingTop: 0 }}
                        height={24}
                        iconSize={11}
                        iconType="circle"
                        formatter={(value) => <span style={{ marginRight: 16 }}>{value}</span>}
                      />
                      <Bar dataKey="metRate" name="Met %" fill="#34d399" activeBar={{ fill: '#6ee7b7' }} radius={[6, 6, 0, 0]} barSize={12} />
                      <Bar dataKey="partialRate" name="Partially Met %" fill="#fbbf24" activeBar={{ fill: '#fde68a' }} radius={[6, 6, 0, 0]} barSize={12} />
                      <Bar dataKey="notMetRate" name="Not Met %" fill="#fb7185" activeBar={{ fill: '#fda4af' }} radius={[6, 6, 0, 0]} barSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-1 transition-all duration-200 h-full flex flex-col">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 3 Tutors</h3>
                <p className="mb-3 rounded-md border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] text-violet-800">
                  Note: Perfect Sessions = sessions where all 12 checklist items were Met.
                </p>
                <div className="space-y-3 flex-1 flex flex-col">
                  {topTutors.map((t, idx) => (
                    <div
                      key={`${t.name}-${idx}`}
                      className="rounded-lg border border-gray-100 bg-gray-50 p-3 transition-all duration-150 hover:bg-gray-50 hover:border-gray-200 hover:shadow-[0_1px_4px_rgba(0,0,0,0.04)] flex-1"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900">{idx + 1}. {t.name}</div>
                        <div className="text-xs font-bold text-violet-700 bg-violet-50 border border-violet-200 rounded-md px-2 py-1">
                          Perfect Sessions: {t.full_met_sessions}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        {t.sessions_count} sessions | {t.observations} observations | {Math.round(t.compliance_rate)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
        )}

        {data && cancelledFilter !== 'cancelled' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
            <div className="bg-white rounded-xl border border-gray-200 p-6 h-full flex flex-col">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Overall Criteria</h3>
              <div className="sm:hidden space-y-2">
                {data.checklist_stats.map((item) => (
                  <div key={`mobile-criteria-${item.code}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <p className="text-sm font-semibold text-gray-900">{formatCode(item.code)}</p>
                    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <p className="text-emerald-700 font-medium">Met: {item.met} ({Math.round(item.met_rate)}%)</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPartialCode(item.code);
                          setSelectedNotMetCode(null);
                          setDetailsModal({ kind: 'partial', item });
                        }}
                        className="text-left text-amber-700 font-medium underline decoration-dotted underline-offset-2"
                        title="Click to filter tutors with Partial for this item"
                      >
                        Partial: {item.partial} ({Math.round(item.partial_rate)}%)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedNotMetCode(item.code);
                          setSelectedPartialCode(null);
                          setDetailsModal({ kind: 'not_met', item });
                        }}
                        className="text-left text-rose-700 font-medium underline decoration-dotted underline-offset-2"
                        title="Click to filter tutors with Not Met for this item"
                      >
                        Not Met: {item.not_met} ({Math.round(item.not_met_rate)}%)
                      </button>
                      <p className="text-gray-700 font-semibold">Total: {item.total}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden sm:block overflow-hidden flex-1">
                <table className="w-full table-auto border-separate [border-spacing:0_8px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Checklist Item</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-emerald-700 uppercase">Met</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-amber-700 uppercase">Partial</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-rose-700 uppercase">Not Met</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.checklist_stats.map((item) => (
                      <tr key={item.code} className="bg-white hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm font-medium text-gray-900 whitespace-nowrap rounded-l-md">
                          {formatCode(item.code)}
                        </td>
                        <td className="px-3 py-2 text-center text-sm font-semibold text-emerald-700">
                          {item.met} ({Math.round(item.met_rate)}%)
                        </td>
                        <td className="px-3 py-2 text-center text-sm font-semibold text-amber-700">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPartialCode(item.code);
                              setSelectedNotMetCode(null);
                              setDetailsModal({ kind: 'partial', item });
                            }}
                            title="Click to filter tutors with Partial for this item"
                            className={`underline decoration-dotted underline-offset-2 ${
                              selectedPartialCode === item.code ? 'font-bold text-amber-800' : ''
                            }`}
                          >
                            {item.partial} ({Math.round(item.partial_rate)}%)
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center text-sm font-semibold text-rose-700">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedNotMetCode(item.code);
                              setSelectedPartialCode(null);
                              setDetailsModal({ kind: 'not_met', item });
                            }}
                            title="Click to filter tutors with Not Met for this item"
                            className={`underline decoration-dotted underline-offset-2 ${
                              selectedNotMetCode === item.code ? 'font-bold text-rose-800' : ''
                            }`}
                          >
                            {item.not_met} ({Math.round(item.not_met_rate)}%)
                          </button>
                        </td>
                        <td className="px-3 py-2 text-center text-sm font-semibold text-gray-900 rounded-r-md">{item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-6 h-full flex flex-col">
              <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                <div className="flex flex-col">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 3 Strengths</h3>
                  <div className="space-y-3">
                    {data.strengths.slice(0, 3).map((s, idx) => (
                      <div key={s.code} className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 min-h-[74px] flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{idx + 1}. {formatCode(s.code)}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-2xl leading-none font-bold tabular-nums text-emerald-700">{Math.round(s.met_rate)}%</div>
                          <div className="text-xs text-emerald-700 mt-1">({s.met}/{s.total})</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Top 3 Risk Areas</h3>
                  <div className="space-y-3">
                    {data.improvements.slice(0, 3).map((s, idx) => (
                      <div key={s.code} className="rounded-lg border border-rose-100 bg-rose-50 p-3 min-h-[74px] flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{idx + 1}. {formatCode(s.code)}</div>
                          <div className="text-xs text-rose-700 mt-1">Not met: {Math.round(s.not_met_rate)}%</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-2xl leading-none font-bold tabular-nums text-rose-700">{Math.round(s.met_rate)}%</div>
                          <div className="text-xs text-rose-700 mt-1">({s.not_met}/{s.total})</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {data && cancelledFilter === 'cancelled' && data.cancelled_sessions && data.cancelled_sessions.length > 0 && (
          <div className="bg-white rounded-xl border border-rose-200 p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Canceled Sessions Follow-up</h3>
                <p className="text-xs text-gray-500">
                  {cancelledFilter === 'cancelled'
                    ? 'Showing canceled sessions only for the selected filters.'
                    : 'Canceled sessions found within the selected filters.'}
                </p>
              </div>
              <div className="rounded-full bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700">
                {data.cancelled_sessions.length} canceled
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead className="bg-rose-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-rose-700 uppercase">Doctor</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-rose-700 uppercase">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-rose-700 uppercase">Subject</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-100">
                  {data.cancelled_sessions.map((item, idx) => (
                    <tr key={`${item.session_id || item.doctor_name}-${idx}`} className="hover:bg-rose-50/40">
                      <td className="px-3 py-2 text-sm font-medium text-gray-900">
                        {item.doctor_id ? (
                          <Link
                            to={`/tutor?doctor_id=${item.doctor_id}`}
                            className="underline decoration-dotted underline-offset-2 hover:text-violet-700"
                          >
                            {item.doctor_name}
                          </Link>
                        ) : (
                          item.doctor_name
                        )}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-700">{formatDate(item.date || null)}</td>
                      <td className="px-3 py-2 text-sm text-gray-700">{item.subject || 'Unknown Subject'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
      {detailsModal && (
        <div
          className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4"
          onClick={() => setDetailsModal(null)}
        >
          <div
            className={`w-full max-w-2xl rounded-xl border bg-white shadow-2xl ${
              detailsModal.kind === 'not_met' ? 'border-rose-200' : 'border-amber-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className={`flex items-center justify-between px-4 py-3 border-b ${
                detailsModal.kind === 'not_met'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}
            >
              <h4 className="text-sm font-semibold">
                {detailsModal.kind === 'not_met' ? 'Not Met Tutors' : 'Partial Tutors'}: {formatCode(detailsModal.item.code)}
              </h4>
              <button
                type="button"
                onClick={() => setDetailsModal(null)}
                className="rounded-md border border-current/30 bg-white/70 px-2 py-1 text-xs font-medium hover:bg-white"
              >
                Close
              </button>
            </div>
            <div className="max-h-[60vh] overflow-auto p-4 space-y-2">
              {(
                detailsModal.kind === 'not_met'
                  ? detailsModal.item.not_met_by_doctor
                  : detailsModal.item.partial_by_doctor
              )?.length ? (
                (
                  detailsModal.kind === 'not_met'
                    ? detailsModal.item.not_met_by_doctor
                    : detailsModal.item.partial_by_doctor
                )!.map((d, idx) => (
                  <div
                    key={`${d.name}-${idx}`}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          to={d.id ? `/tutor?doctor_id=${d.id}` : `/tutor?doctor_name=${encodeURIComponent(d.name)}`}
                          className="text-sm font-medium text-gray-900 underline decoration-dotted underline-offset-2 hover:text-violet-700"
                        >
                          {d.name}
                        </Link>
                        <span className="text-xs font-semibold text-gray-600">Count: {d.count}</span>
                      </div>
                      {d.sessions && d.sessions.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {d.sessions.slice(0, 3).map((s, sIdx) => (
                            <p key={`${d.name}-session-${sIdx}`} className="text-xs text-gray-600 truncate">
                              {formatDate(s.date || null)} - {s.subject || 'Unknown Subject'}
                            </p>
                          ))}
                          {d.sessions.length > 3 && (
                            <p className="text-[11px] text-gray-500">+{d.sessions.length - 3} more sessions</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No tutor mapping found for this item in current dataset.</p>
              )}

              {(() => {
                const unmapped =
                  detailsModal.kind === 'not_met'
                    ? detailsModal.item.not_met_unmapped
                    : detailsModal.item.partial_unmapped;
                if (!unmapped || !unmapped.count) return null;

                return (
                  <div className="rounded-lg border border-gray-200 bg-amber-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-amber-800">Unmapped Sessions</span>
                      <span className="text-xs font-semibold text-amber-800">Count: {unmapped.count}</span>
                    </div>
                    {unmapped.sessions && unmapped.sessions.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {unmapped.sessions.slice(0, 5).map((s, sIdx) => (
                          <p key={`unmapped-session-${sIdx}`} className="text-xs text-amber-900 truncate">
                            {formatDate(s.date || null)} - {s.subject || 'Unknown Subject'}
                          </p>
                        ))}
                        {unmapped.sessions.length > 5 && (
                          <p className="text-[11px] text-amber-700">+{unmapped.sessions.length - 5} more sessions</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
        )}

    </>


  );
}













