import { useMemo } from 'react';
import type { TutorDashboardData } from '../../../types';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface ChartsSectionProps {
  charts: {
    student_engagement?: Array<{
      session: string;
      date: string;
      engagement: number;
      attendance?: number;
      engaged_speaker_count?: number;
    }>;
  };
  sessions?: TutorDashboardData['sessions'];
}

type EngagementPoint = {
  xKey: string;
  session: string;
  date: string;
  engagement: number;
  attendance: number;
  engagedSpeakerCount: number;
};

const toIntOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
};

const makeSessionMetricKey = (date: string, session: string) =>
  `${date}__${String(session || '').trim().toLowerCase()}`;

export default function ChartsSection({ charts, sessions = [] }: ChartsSectionProps) {
  const sessionMetricsByKey = useMemo(() => {
    const map = new Map<string, { attendance: number | null; spoke: number | null }>();

    sessions.forEach((s) => {
      const date = String(s.session_date || '');
      const subject = String(s.subject || '');
      if (!date) return;

      const attendance = toIntOrNull(s.attended_students);
      const spoke = toIntOrNull(s.engaged_speaker_count ?? s.engaged_speakers_count);
      const key = makeSessionMetricKey(date, subject);
      const prev = map.get(key);

      // Keep non-zero/non-null values if duplicates exist for same date+subject.
      map.set(key, {
        attendance:
          attendance && attendance > 0
            ? attendance
            : prev?.attendance ?? attendance ?? null,
        spoke:
          spoke && spoke > 0
            ? spoke
            : prev?.spoke ?? spoke ?? null,
      });
    });

    return map;
  }, [sessions]);

  const normalizedEngagement = useMemo<EngagementPoint[]>(
    () =>
      [...(charts.student_engagement ?? [])]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((item, index) => {
          const raw = Number(item.engagement ?? 0);
          const asPercent = raw <= 1 ? raw * 100 : raw;
          const engagement = Math.max(0, Math.min(100, Number(asPercent.toFixed(1))));

          const metrics = sessionMetricsByKey.get(makeSessionMetricKey(item.date, item.session));
          const attendance = toIntOrNull(item.attendance) ?? metrics?.attendance ?? 0;
          const spoke = toIntOrNull(item.engaged_speaker_count) ?? metrics?.spoke ?? 0;

          // Use unique x key to avoid collapsing multiple sessions on the same date.
          return {
            xKey: `${item.date}__${index}`,
            session: item.session,
            date: item.date,
            engagement,
            attendance,
            engagedSpeakerCount: spoke,
          };
        }),
    [charts.student_engagement, sessionMetricsByKey]
  );

  const yDomain = useMemo<[number, number]>(() => {
    if (!normalizedEngagement.length) return [0, 100];
    const values = normalizedEngagement.map((s) => s.engagement);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const minBound = Math.max(0, Math.floor(min / 10) * 10 - 10);
    const maxBound = Math.min(100, Math.ceil(max / 10) * 10 + 10);
    if (maxBound - minBound < 20) {
      const center = (maxBound + minBound) / 2;
      return [Math.max(0, Math.floor(center - 10)), Math.min(100, Math.ceil(center + 10))];
    }
    return [minBound, maxBound];
  }, [normalizedEngagement]);

  const avgEngagement =
    normalizedEngagement.length > 0
      ? Math.round(
          normalizedEngagement.reduce((acc, s) => acc + s.engagement, 0) /
            normalizedEngagement.length
        )
      : 0;

  const bestSession =
    normalizedEngagement.length > 0
      ? normalizedEngagement.reduce((best, current) =>
          current.engagement > best.engagement ? current : best
        )
      : null;

  const nonZeroEngagement = normalizedEngagement.filter((point) => point.engagement > 0);

  const lowestSession =
    nonZeroEngagement.length > 0
      ? nonZeroEngagement.reduce((lowest, current) =>
          current.engagement < lowest.engagement ? current : lowest
        )
      : null;

  const isFewSessions = normalizedEngagement.length <= 6;
  const isMediumSessions = normalizedEngagement.length > 6 && normalizedEngagement.length <= 10;

  const chartMinWidthClass = isFewSessions
    ? 'min-w-[320px]'
    : isMediumSessions
      ? 'min-w-[460px]'
      : 'min-w-[560px]';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-[2fr,1fr] gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
              <i className="ri-user-voice-line text-white text-sm"></i>
            </div>
            Student Engagement by Session Date
          </h3>

          {normalizedEngagement.length === 0 ? (
            <div className="flex items-center justify-center h-48">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
                  <i className="ri-user-line text-3xl text-gray-300"></i>
                </div>
                <p className="text-sm text-gray-500">No engagement data available</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className={`${chartMinWidthClass} mx-auto`}>
                <div className="flex items-center gap-4 mb-4">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-50 rounded-full">
                    <div className="w-3 h-3 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500"></div>
                    <span className="text-xs font-medium text-violet-700">Engagement %</span>
                  </div>
                </div>

                <div className="h-72 pr-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={normalizedEngagement}
                      margin={{ top: 12, right: 12, left: 0, bottom: 24 }}
                    >
                      <defs>
                        <linearGradient id="engagementAreaFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.24} />
                          <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.03} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#ececf3" />

                      <XAxis
                        dataKey="xKey"
                        tick={{ fill: '#6b7280', fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: '#e5e7eb' }}
                        minTickGap={24}
                        tickMargin={12}
                        height={42}
                        tickFormatter={(value) =>
                          new Date(String(value).split('__')[0]).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })
                        }
                      />

                      <YAxis
                        tick={{ fill: '#9ca3af', fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        width={44}
                        domain={yDomain}
                        tickFormatter={(value) => `${Math.round(value)}%`}
                      />

                      <Tooltip
                        cursor={{ stroke: '#a78bfa', strokeDasharray: '3 3' }}
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const point = payload[0]?.payload as EngagementPoint | undefined;
                          if (!point) return null;

                          const displayDate = new Date(point.date).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          });

                          return (
                            <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-lg">
                              <p className="text-sm font-semibold text-gray-900">{displayDate}</p>
                              <p className="text-xs text-gray-500 mt-1">Subject: {point.session || '-'}</p>
                              <p className="text-sm font-semibold text-violet-700 mt-1">Engagement: {point.engagement.toFixed(1)}%</p>
                              <p className="text-xs text-gray-600 mt-1">Attendance: {point.attendance} | Spoke: {point.engagedSpeakerCount}</p>
                            </div>
                          );
                        }}
                      />

                      <Area
                        type="monotone"
                        dataKey="engagement"
                        fill="url(#engagementAreaFill)"
                        stroke="none"
                        isAnimationActive
                        animationDuration={500}
                      />

                      <Line
                        type="monotone"
                        dataKey="engagement"
                        stroke="#6d4af6"
                        strokeWidth={3}
                        dot={{ r: 2.5, fill: '#fff', stroke: '#6d4af6', strokeWidth: 1.5 }}
                        activeDot={{ r: 4, fill: '#6d4af6', stroke: '#fff', strokeWidth: 1.5 }}
                        isAnimationActive
                        animationDuration={500}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Engagement Insights</h3>
          </div>

          {normalizedEngagement.length === 0 ? (
            <div className="flex items-center justify-center h-48 rounded-xl border border-dashed border-gray-200 text-sm text-gray-500">
              No insights available
            </div>
          ) : (
            <div className="space-y-3 ">
              <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-4 py-6 mb-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-600">Avg Engagement</p>
                  <p className="text-3xl leading-none font-bold tabular-nums text-violet-700">{avgEngagement}%</p>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5  ">
                <div className="flex items-center justify-between gap-3 ">
                  <p className="text-xs font-medium text-gray-600">Best Session</p>
                  <span className="text-3xl leading-none font-bold tabular-nums text-emerald-700">
                    {bestSession ? `${bestSession.engagement}%` : 'N/A'}
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-emerald-800 truncate" title={bestSession?.session || ''}>
                  {bestSession?.session || '-'}
                </p>
                <p className="mt-1 text-[11px] text-gray-500">
                  {bestSession ? new Date(bestSession.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                </p>
              </div>

              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3.5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-gray-600">Lowest Session</p>
                  <span className="text-3xl leading-none font-bold tabular-nums text-rose-700">
                    {lowestSession ? `${lowestSession.engagement}%` : 'N/A'}
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-rose-800 truncate" title={lowestSession?.session || ''}>
                  {lowestSession?.session || '-'}
                </p>
                <p className="mt-1 text-[11px] text-gray-500">
                  {lowestSession ? new Date(lowestSession.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                </p>
              </div>            </div>
          )}
        </div>
      </div>
    </div>
  );
}




