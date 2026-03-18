import { useMemo, useRef, useState } from 'react';
import { apiClient } from '../../../utils/apiClient';
import kentLogo from '../../../../Kent-Business-College.webp';

interface ChecklistItem {
  code: string;
  status: 'Met' | 'Partial' | 'Not Met';
  order?: number | null;
  item?: string;
  evidence?: string;
  has_evidence?: boolean;
}

interface Session {
  id: number;
  session_date: string;
  duration_minutes: number;
  duration_text?: string;
  trainer: string;
  owner_doctor?: string;
  covered_by?: string;
  is_covered_session?: boolean;
  cancelled_session?: boolean;
  subject: string;
  students_count: number;
  attended_students?: number;
  met_count: number;
  partial_count: number;
  not_met_count: number;
  criteria_status: string;
  checklist: ChecklistItem[];
}

interface SessionsListProps {
  sessions: Session[];
  cancelledFilter?: string;
  onCancelledFilterChange?: (value: string) => void;
  dateFrom?: string;
  dateTo?: string;
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  onApplyDateFilter?: () => void;
  onClearDateFilter?: () => void;
  showFilters?: boolean;
  doctorName?: string;
  groupName?: string;
  moduleName?: string;
  studentsCount?: number;
}

interface SessionReportData {
  session: {
    session_id: string;
    date: string;
    subject: string;
    trainer: string;
    duration: string;
    engagement: number | null;
    lms_module: string;
    lms_students_count: number;
    meeting_id: string;
    observation_status: string;
    cancelled_session: boolean;
    engaged_speakers_count: number | null;
  };
  qa_observation: {
    overall_judgement: string;
    teaching_quality_rating: number | null;
    teaching_quality_comment: string;
    safeguarding_status: string;
    safeguarding_comment: string;
    areas_for_development: Record<string, any> | any[];
  };
  observation_flags?: {
    observed: boolean;
    cancelled: boolean;
    pending: boolean;
  };
  source_columns?: Record<string, string>;
  checklist_summary: {
    met: number;
    partial: number;
    not_met: number;
    total: number;
    compliance_rate: number;
  };
  report_text_sections?: {
    duration_score?: string;
    ksbs_covered?: string;
    quality_of_teaching_evaluation?: string;
    quality_of_teaching_comments?: string;
    learner_engagement?: string;
    safeguarding_evaluation?: string;
    safeguarding_comments?: string;
    qa_checklist?: string;
    strengths?: string;
    areas_for_development?: string;
    overall_judgement?: string;
  };
  checklist_items: Array<{
    code: string;
    status: 'Met' | 'Partial' | 'Not Met';
    item?: string;
    evidence?: string;
  }>;
  ui_meta?: {
    attended_students: number;
    enrolled_students: number;
    session_date: string;
    session_subject: string;
    trainer: string;
    duration_text: string;
  };
}

export default function SessionsList({
  sessions,
  cancelledFilter = '',
  onCancelledFilterChange,
  dateFrom = '',
  dateTo = '',
  onDateFromChange,
  onDateToChange,
  onApplyDateFilter,
  onClearDateFilter,
  showFilters = true,
  doctorName,
  groupName,
  moduleName,
  studentsCount,
}: SessionsListProps) {
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

  const normalizedModuleName = String(moduleName || '').trim();
  const hasSpecificModule = normalizedModuleName.length > 0 && normalizedModuleName.toLowerCase() !== 'all modules';
  const normalizedDoctorName = String(doctorName || '').trim();
  const completedSessions = useMemo(() => sessions.filter((session) => !session.cancelled_session), [sessions]);
  const cancelledSessionsCount = useMemo(() => sessions.filter((session) => !!session.cancelled_session).length, [sessions]);
  const coveredSessionsSummary = useMemo(() => {
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
  }, [sessions, normalizedDoctorName]);
  const [evidencePopup, setEvidencePopup] = useState<{
    title: string;
    text: string;
  } | null>(null);
  const [reportModal, setReportModal] = useState<SessionReportData | null>(null);
  const [reportLoadingForSession, setReportLoadingForSession] = useState<string | null>(null);
  const [doctorOverviewOpen, setDoctorOverviewOpen] = useState(false);
  const reportPrintCardRef = useRef<HTMLDivElement | null>(null);
  const doctorOverviewPrintRef = useRef<HTMLDivElement | null>(null);
  // printing handled by browser CSS on the open modal

  const checklistColumns = Array.from(
    new Map(
      sessions
        .flatMap((session) => session.checklist || [])
        .filter((item) => item.code)
        .map((item) => [
          item.code,
          {
            code: item.code,
            order: item.order ?? 999,
            label: (item.item || '').trim(),
          },
        ])
    ).values()
  ).sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

  const filteredSessions = sessions.filter((session) => {
    if (cancelledFilter === 'cancelled' && !session.cancelled_session) return false;
    if (cancelledFilter === 'not_cancelled' && session.cancelled_session) return false;
    return true;
  });

  const getChecklistBinaryCell = (status: ChecklistItem['status'] | undefined) => {
    if (!status) {
      return (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-gray-500">
          <i className="ri-subtract-line text-xs font-bold"></i>
        </span>
      );
    }
    if (status === 'Met') {
      return (
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-700"
          title="Correct"
        >
          <i className="ri-check-line text-xs font-bold"></i>
        </span>
      );
    }
    if (status === 'Partial') {
      return (
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-amber-300 bg-amber-100 text-amber-800"
          title="Partial"
        >
          <i className="ri-subtract-line text-xs font-bold"></i>
        </span>
      );
    }
    return (
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-rose-100 text-rose-700"
        title="Wrong"
      >
        <i className="ri-close-line text-xs font-bold"></i>
      </span>
    );
  };

  const formatChecklistLabel = (value: string) => {
    const raw = (value || '')
      .replace(/^\s*\d+\s*[-).:]*\s*/, '')
      .replace(/\b\d+\b/g, ' ')
      .replace(/^\s*[-).:]+\s*/, '')
      .replace(/\\s+/g, ' ')
      .trim();
    if (!raw) return '';
    // checklist_item usually comes like "Session duration: Minimum of two hours"
    if (raw.includes(':')) return raw.split(':')[0].trim();
    if (raw.includes('_')) {
      return raw
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
    }
    return raw;
  };

  const doctorChecklistOverview = useMemo(() => {
    const bucket = new Map<string, { code: string; label: string; order: number; met: number; partial: number; notMet: number }>();

    for (const col of checklistColumns) {
      bucket.set(col.code, {
        code: col.code,
        label: formatChecklistLabel(col.label || col.code) || col.code,
        order: col.order ?? 999,
        met: 0,
        partial: 0,
        notMet: 0,
      });
    }

    for (const session of completedSessions) {
      for (const item of session.checklist || []) {
        const code = String(item.code || '').trim();
        if (!code) continue;

        if (!bucket.has(code)) {
          bucket.set(code, {
            code,
            label: formatChecklistLabel(item.item || code) || code,
            order: item.order ?? 999,
            met: 0,
            partial: 0,
            notMet: 0,
          });
        }

        const row = bucket.get(code)!;
        if (item.status === 'Met') row.met += 1;
        else if (item.status === 'Partial') row.partial += 1;
        else if (item.status === 'Not Met') row.notMet += 1;
      }
    }

    return Array.from(bucket.values())
      .map((row) => {
        const total = row.met + row.partial + row.notMet;
        const compliance = total ? Math.round((row.met / total) * 100) : 0;
        return { ...row, total, compliance };
      })
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  }, [completedSessions, checklistColumns]);

  const doctorOverviewTotals = useMemo(() => {
    const met = doctorChecklistOverview.reduce((acc, row) => acc + row.met, 0);
    const partial = doctorChecklistOverview.reduce((acc, row) => acc + row.partial, 0);
    const notMet = doctorChecklistOverview.reduce((acc, row) => acc + row.notMet, 0);
    const total = met + partial + notMet;
    const compliance = total ? Math.round((met / total) * 100) : 0;
    return { met, partial, notMet, total, compliance, completedSessions: completedSessions.length, cancelledSessions: cancelledSessionsCount };
  }, [doctorChecklistOverview, completedSessions.length, cancelledSessionsCount]);
  const doctorOverviewCards = [
    {
      label: 'Adjusted Sessions',
      value: String(
        doctorOverviewTotals.completedSessions - coveredSessionsSummary.coveredForDoctorCount
      ),
      tone: 'bg-gradient-to-br from-indigo-50 to-violet-100 text-indigo-800 ring-1 ring-indigo-200',
      detail: '',
      featured: true,
    },
    {
      label: 'Completed Sessions',
      value: String(doctorOverviewTotals.completedSessions),
      tone: 'bg-slate-50 text-slate-900',
      detail: '',
      featured: false,
    },
    {
      label: 'Canceled',
      value: String(doctorOverviewTotals.cancelledSessions),
      tone: 'bg-rose-50 text-rose-700',
      detail: '',
      featured: false,
    },
    {
      label: 'Met',
      value: String(doctorOverviewTotals.met),
      tone: 'bg-emerald-50 text-emerald-700',
      detail: '',
      featured: false,
    },
    {
      label: 'Partial',
      value: String(doctorOverviewTotals.partial),
      tone: 'bg-amber-50 text-amber-700',
      detail: '',
      featured: false,
    },
    {
      label: 'Not Met',
      value: String(doctorOverviewTotals.notMet),
      tone: 'bg-rose-50 text-rose-700',
      detail: '',
      featured: false,
    },
    {
      label: 'Compliance',
      value: `${doctorOverviewTotals.compliance}%`,
      tone: 'bg-violet-50',
      detail: '',
      featured: false,
    },
    {
      label: 'Coverage Received',
      value: String(coveredSessionsSummary.coveredForDoctorCount),
      tone: 'bg-violet-50 text-violet-700',
      detail: coveredSessionsSummary.coveredByNames.length ? `By: ${coveredSessionsSummary.coveredByNames.join(', ')}` : 'By: None',
      featured: false,
    },
    {
      label: 'Coverage Provided',
      value: String(coveredSessionsSummary.coveredByDoctorCount),
      tone: 'bg-sky-50 text-sky-700',
      detail: coveredSessionsSummary.ownerNames.length ? `For: ${coveredSessionsSummary.ownerNames.join(', ')}` : 'For: None',
      featured: false,
    },
  ];
  const openSessionReport = async (session: Session) => {
    const sid = String(session.id);
    setReportLoadingForSession(sid);
    try {
      const res = await apiClient.get('/api/tutor/session-report', { params: { session_id: sid } });
      const payload = res.data as SessionReportData;
      payload.ui_meta = {
        attended_students: session.attended_students ?? 0,
        enrolled_students: session.students_count ?? 0,
        session_date: session.session_date,
        session_subject: session.subject,
        trainer: session.trainer,
        duration_text: session.duration_text || `${session.duration_minutes || 0} min`,
      };
      setReportModal(payload);
    } catch {
      setReportModal(null);
    } finally {
      setReportLoadingForSession(null);
    }
  };

  const printReport = () => {
    // clone the modal into a new window and copy computed styles to preserve appearance
    if (!reportModal) return;
    const source = reportPrintCardRef.current;
    if (!source) return;

    const sessionTitle =
      reportModal?.ui_meta?.session_subject || reportModal?.session.subject || 'QA Observation Report';
    const sessionDate = reportModal?.ui_meta?.session_date || reportModal?.session.date || '';
    const safeTitle = sessionTitle + (sessionDate ? ` - ${sessionDate}` : '');

    // build a clean printable document using the inner content of the modal
    // clone and clean the source so we remove action buttons and any UI chrome
    const cloned = source.cloneNode(true) as HTMLElement;
    const temp = document.createElement('div');
    temp.appendChild(cloned);

    // remove the actions area (print / close buttons)
    const actionsEl = temp.querySelector('#qa-report-print-actions');
    if (actionsEl && actionsEl.parentNode) actionsEl.parentNode.removeChild(actionsEl);

    // remove any remaining buttons (safeguard) that are clearly UI controls labelled Print/Close
    const buttons = Array.from(temp.querySelectorAll('button'));
    for (const btn of buttons) {
      const txt = (btn.textContent || '').trim().toLowerCase();
      if (txt === 'print' || txt === 'close' || txt === 'save' || txt === 'cancel') {
        if (btn.parentNode) btn.parentNode.removeChild(btn);
      }
    }

    // pull out the modal header so it appears only once at the top of the printed document
    let headerHtml = '';
    const headerEl = temp.querySelector('.sticky.top-0');
    if (headerEl) {
      headerHtml = headerEl.innerHTML || '';
      if (headerEl.parentNode) headerEl.parentNode.removeChild(headerEl);
    }

    const contentHtml = `<div class="report-print-header">${headerHtml}</div><div class="report-print-body">${temp.innerHTML}</div>`;
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((n) => n.outerHTML)
      .join('\n');

    const html = `
      <html>
        <head>
          <title>${safeTitle}</title>
          ${styles}
          <style>
            @page { size: A4; margin: 12mm; }
            html, body { height: auto; margin: 0; }
            * { box-sizing: border-box; }
            /* make the print wrapper use full printable width so content fills pages */
            #print-wrapper { width: 210mm; max-width: 210mm; margin: 0 auto; }
            /* ensure cloned content flows and can break across pages where needed */
            #print-wrapper * { position: static !important; overflow: visible !important; max-height: none !important; }
            /* remove shadows/borders that may affect scaling */
            #print-wrapper .shadow-xl, #print-wrapper .shadow { box-shadow: none !important; }
            /* allow elements to break across pages (avoid forcing large blocks to move to next page)
               forcing 'avoid' often creates large empty spaces when a block doesn't fit the remainder
               of a page. Allow breaks so pages fill naturally. */
            .rounded-lg, .rounded-md { page-break-inside: auto !important; }
            .page-break { page-break-after: always; }
            img, svg { max-width: 100% !important; height: auto !important; }
            body { -webkit-print-color-adjust: exact; -ms-print-color-adjust: exact; print-color-adjust: exact; }
            /* reduce logo size in print to match modal view */
            #print-wrapper img[alt="Kent Business College"] { height: 28px !important; width: auto !important; }
            /* header container that will appear only once */
            .report-print-header { width: 100%; margin: 0 0 6px 0; padding: 6px 0; }
            .report-print-header .flex { align-items: center; gap: 8px; }
            .report-print-header h4 { font-size: 13px !important; margin: 0; }
            /* make sure the body flows after header and can break across pages */
            .report-print-body { display: block; }
          </style>
        </head>
        <body>
          <div id="print-wrapper">${contentHtml}</div>
        </body>
      </html>
    `;

    const win = window.open('', '_blank', 'width=1200,height=900');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.document.title = safeTitle;
    win.onload = () => {
      setTimeout(() => {
        try {
          win.focus();
          win.print();
        } catch {
          /* ignore */
        }
      }, 300);
    };
  };

  // nothing needed; printing handled by browser directly via CSS

  const printDoctorOverview = () => {
    const source = doctorOverviewPrintRef.current;
    if (!source) return;

    const title = `${doctorName || 'Doctor'} - Checklist Overview Report`;
    const cloned = source.cloneNode(true) as HTMLElement;
    const temp = document.createElement('div');
    temp.appendChild(cloned);

    const actionsEl = temp.querySelector('#doctor-overview-actions');
    if (actionsEl && actionsEl.parentNode) actionsEl.parentNode.removeChild(actionsEl);

    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((n) => n.outerHTML)
      .join('\n');

    const html = `
      <html>
        <head>
          <title>${title}</title>
          ${styles}
          <style>
            @page { size: A4; margin: 12mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            #print-wrapper { max-width: 1000px; margin: 0 auto; }
            #print-wrapper * { overflow: visible !important; }
            #print-wrapper .overflow-x-auto,
            #print-wrapper .overflow-y-auto {
              overflow: visible !important;
            }
            #print-wrapper ::-webkit-scrollbar {
              display: none !important;
              width: 0 !important;
              height: 0 !important;
            }
            #print-wrapper table {
              width: 100% !important;
            }
          </style>
        </head>
        <body>
          <div id="print-wrapper">${temp.innerHTML}</div>
        </body>
      </html>
    `;

    const win = window.open('', '_blank', 'width=1200,height=900');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.onload = () => {
      setTimeout(() => {
        try {
          win.focus();
          win.print();
        } catch {
          /* ignore */
        }
      }, 300);
    };
  };
  const renderAreasForDevelopment = (value: any) => {
    if (!value || (typeof value === 'object' && Object.keys(value).length === 0)) {
      return <p className="text-sm text-gray-500">No areas for development recorded.</p>;
    }
    if (Array.isArray(value)) {
      return (
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
          {value.map((item, idx) => (
            <li key={`afd-${idx}`}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
          ))}
        </ul>
      );
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value);
      return (
        <div className="space-y-2">
          {entries.map(([key, val], idx) => {
            const item = (val && typeof val === 'object' ? val : null) as Record<string, any> | null;
            const title = item ? String(item.title || '').trim() : '';
            const evidence = item ? String(item.evidence || '').trim() : '';
            const clips = item && Array.isArray(item.evidence_clips) ? item.evidence_clips.length : 0;

            if (item && (title || evidence || clips > 0)) {
              return (
                <div key={key} className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
                  <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">Area {idx + 1}</p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">{title || key}</p>
                  <p className="mt-1 text-xs text-gray-700 whitespace-pre-wrap break-words">{evidence || 'No evidence noted.'}</p>
                  {clips > 0 ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-700">Evidence clips: {clips}</p>
                  ) : null}
                </div>
              );
            }

            return (
              <div key={key} className="rounded-md border border-gray-200 bg-gray-50 p-2">
                <p className="text-xs font-semibold text-gray-700">{key}</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                  {typeof val === 'string' ? val : String(val ?? '-')}
                </p>
              </div>
            );
          })}
        </div>
      );
    }
    const raw = String(value || '').trim();
    if (!raw) return <p className="text-sm text-gray-500">No areas for development recorded.</p>;
    const rows = raw
      .split(/\r?\n|â€¢|-/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (rows.length <= 1) return <p className="text-sm text-gray-700">{raw}</p>;
    return (
      <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
        {rows.map((row, idx) => (
          <li key={`afd-text-${idx}`}>{row}</li>
        ))}
      </ul>
    );
  };

  const formatFullDate = (value?: string) => {
    if (!value) return '-';
    try {
      return new Date(value).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return value;
    }
  };

  const parseKsbsCovered = (raw?: string) => {
    const text = (raw || '').trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];

      // convert to array and sort so items are grouped by type (skill, knowledge, behaviour, etc.)
      const list = Object.entries(parsed).map(([key, value]) => {
        const item = (value || {}) as Record<string, any>;
        return {
          key,
          type: String(item.type || '').trim(),
          title: String(item.title || '').trim(),
          evidence: String(item.evidence || '').trim(),
          clipsCount: Array.isArray(item.evidence_clips) ? item.evidence_clips.length : 0,
        };
      });

      list.sort((a, b) => {
        const ta = a.type.toLowerCase();
        const tb = b.type.toLowerCase();
        if (ta !== tb) {
          return ta.localeCompare(tb);
        }
        return a.title.localeCompare(b.title);
      });

      return list;
    } catch {
      return [];
    }
  };

  const parseStructuredSection = (raw?: string, keyPrefix?: string) => {
    const text = (raw || '').trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
      const entries = Object.entries(parsed)
        .filter(([key]) => (keyPrefix ? key.toLowerCase().startsWith(keyPrefix.toLowerCase()) : true))
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
      return entries.map(([key, value]) => {
        const item = (value || {}) as Record<string, any>;
        return {
          key,
          title: String(item.title || '').trim(),
          evidence: String(item.evidence || '').trim(),
          clipsCount: Array.isArray(item.evidence_clips) ? item.evidence_clips.length : 0,
        };
      });
    } catch {
      return [];
    }
  };

  const parseQaChecklistSection = (raw?: string) => {
    const text = (raw || '').trim();
    if (!text) return null;
    const countsMatch = text.match(/(\d+)\s*Pass.*?(\d+)\s*Partial.*?(\d+)\s*Not\s*Met/i);
    const pass = countsMatch ? Number(countsMatch[1]) : null;
    const partial = countsMatch ? Number(countsMatch[2]) : null;
    const notMet = countsMatch ? Number(countsMatch[3]) : null;

    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const getLineValue = (pattern: RegExp) =>
      lines.find((line) => pattern.test(line))?.replace(pattern, '').trim() || '';

    const passLine = getLineValue(/^Pass\s*:\s*/i);
    const partialLine = getLineValue(/^Partial\s*:\s*/i);
    const notMetLine = getLineValue(/^Not\s*Met\s*:\s*/i);

    const splitItems = (line: string) =>
      line
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    return {
      pass,
      partial,
      notMet,
      passItems: splitItems(passLine),
      partialItems: splitItems(partialLine),
      notMetItems: splitItems(notMetLine),
      hasStructured:
        countsMatch !== null || !!passLine || !!partialLine || !!notMetLine,
    };
  };

  const truncateText = (value: string, max = 220) => {
    const text = (value || '').trim();
    if (!text) return '';
    // when showing the report modal, display the whole text
    if (reportModal) return text;
    if (text.length <= max) return text;
    return `${text.slice(0, max)}...`;
  };

  const getComplianceTextClass = (value: number) => {
    if (value < 50) return 'text-rose-700';
    if (value < 75) return 'text-amber-700';
    return 'text-emerald-700';
  };
  const renderChecklistHeaderLabel = (value: string) => {
    const label = formatChecklistLabel(value);
    const words = label.split(/\s+/).filter(Boolean);
    if (words.length === 2) {
      return (
        <>
          <span className="block">{words[0]}</span>
          <span className="block">{words[1]}</span>
        </>
      );
    }
    return label;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <i className="ri-table-line text-violet-500"></i>
            Sessions Matrix
          </h3>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDoctorOverviewOpen(true)}
              className="px-3 py-1.5 text-xs rounded-lg border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
            >
              Doctor Overview Report
            </button>
            <span className="text-xs text-gray-500">{filteredSessions.length} of {sessions.length} sessions</span>
          </div>
        </div>
      </div>

      {showFilters && (
      <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Cancelled:</label>
            <select
              value={cancelledFilter}
              onChange={(e) => onCancelledFilterChange?.(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500 cursor-pointer whitespace-nowrap"
            >
              <option value="">All</option>
              <option value="cancelled">Cancelled Only</option>
              <option value="not_cancelled">Not Cancelled</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">From:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => onDateFromChange?.(e.target.value)}
              className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">To:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => onDateToChange?.(e.target.value)}
              className="px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <button
            type="button"
            onClick={() => onApplyDateFilter?.()}
            className="px-3 py-1.5 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700"
          >
            Apply
          </button>

          <button
            type="button"
            onClick={() => { onCancelledFilterChange?.(''); onClearDateFilter?.(); }}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-100"
          >
            Clear
          </button>
        </div>
      </div>
      )}

      <div className="border-b border-gray-100 bg-slate-50/70 px-6 py-2 text-[11px] font-medium text-slate-500 sm:hidden">
        Swipe sideways to view full session details
      </div>

      <div className={filteredSessions.length > 10 ? 'max-h-[46rem] overflow-auto' : 'overflow-x-auto'}>
        <table className="min-w-[1180px] w-full table-fixed">
          <caption className="caption-top px-6 py-3 text-left text-sm text-gray-600 bg-violet-50 border-b border-violet-100">
            {doctorName || 'Doctor'} | {groupName || 'Group'}
            {hasSpecificModule ? ` | ${normalizedModuleName} | Students: ${studentsCount ?? 0}` : ''}
          </caption>
          <thead className="bg-gray-50">
            <tr>
              <th className="px-2 py-3 text-left text-[11px] font-medium text-gray-500 uppercase whitespace-nowrap w-[92px]">Session Date</th>
              <th className="px-2 py-3 text-left text-[11px] font-medium text-gray-500 uppercase w-[230px]">Subject</th>
              <th className="px-2 py-3 text-center text-[11px] font-medium text-gray-500 uppercase whitespace-nowrap w-[78px]">Duration</th>
              <th className="px-2 py-3 text-center text-[11px] font-medium text-gray-500 uppercase whitespace-nowrap w-[72px]">Attended</th>
              <th className="px-2 py-3 text-center text-[11px] font-medium text-gray-500 uppercase whitespace-nowrap w-[84px]">Compliance</th>
              {checklistColumns.map((col) => (
                <th
                  key={col.code}
                  className="px-0.5 py-2 text-center text-[10px] font-medium text-gray-600 leading-tight normal-case whitespace-normal w-[64px]"
                  title={col.label || col.code}
                >
                  {renderChecklistHeaderLabel(col.label || col.code)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredSessions.length === 0 ? (
              <tr>
                <td colSpan={5 + checklistColumns.length} className="px-6 py-12 text-center">
                  <i className="ri-inbox-line text-4xl text-gray-300 mb-2"></i>
                  <p className="text-sm text-gray-500">No sessions found</p>
                </td>
              </tr>
            ) : (
              filteredSessions.map((session) => (
                <tr key={session.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                    {new Date(session.session_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="px-2 py-3 text-sm text-gray-700 leading-5" title={session.subject}>
                    <div className="flex flex-col gap-1">
                      <span className="truncate">{session.subject || '-'}</span>
                      <button
                        type="button"
                        onClick={() => openSessionReport(session)}
                        className="inline-flex w-fit items-center gap-1 rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 hover:bg-violet-100"
                      >
                        <i className="ri-file-list-3-line text-xs"></i>
                        {reportLoadingForSession === String(session.id) ? 'Loading...' : 'View Report'}
                      </button>
                      {session.is_covered_session && session.covered_by ? (
                        (() => {
                          const coveredByCurrentDoctor =
                            !!normalizedDoctorName && doctorIdentityMatches(session.covered_by || '', normalizedDoctorName);
                          const ownerDoctor = String(session.owner_doctor || '').trim();

                          return (
                            <span
                              className={`inline-flex w-fit items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                coveredByCurrentDoctor
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              <i className="ri-user-shared-line text-xs"></i>
                              {coveredByCurrentDoctor && ownerDoctor
                                ? `Covered by ${session.covered_by} for ${ownerDoctor}`
                                : `Covered by ${session.covered_by}`}
                            </span>
                          );
                        })()
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-700 whitespace-nowrap">
                    {`${session.duration_minutes || 0} min`}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-semibold text-slate-700 whitespace-nowrap">
                    {session.attended_students ?? session.students_count ?? 0}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-semibold text-violet-700 whitespace-nowrap">
                    {Math.round(((session.met_count || 0) / 12) * 100)}%
                  </td>
                  {checklistColumns.map((col) => {
                    const item = (session.checklist || []).find((c) => c.code === col.code);
                    return (
                      <td key={`${session.id}-${col.code}`} className="px-0.5 py-2 text-center">
                        <span className="inline-flex flex-col items-center gap-1">
                          {getChecklistBinaryCell(item?.status)}
                          <span
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-sky-100 text-xs font-extrabold text-sky-700 cursor-pointer hover:bg-sky-200 transition-colors"
                            title={(item?.evidence || '').trim() || 'No evidence text found in database.'}
                            onClick={() => {
                              const dbEvidenceText = (item?.evidence || '').trim();
                              setEvidencePopup({
                                title: `${formatChecklistLabel(col.label || col.code)} - ${new Date(session.session_date).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })}`,
                                text: dbEvidenceText || 'No evidence text found in database.',
                              });
                            }}
                          >
                            E
                          </span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {evidencePopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setEvidencePopup(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white border border-gray-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h4 className="text-sm font-semibold text-gray-900">Evidence Details</h4>
              <button
                type="button"
                onClick={() => setEvidencePopup(null)}
                className="h-8 w-8 rounded-md text-gray-500 hover:bg-gray-100"
                aria-label="Close evidence popup"
              >
                <i className="ri-close-line text-lg"></i>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs font-medium text-violet-700">{evidencePopup.title}</p>
              <p className="text-sm text-gray-700 leading-6 whitespace-pre-wrap break-words">
                {evidencePopup.text}
              </p>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setEvidencePopup(null)}
                className="px-4 py-2 text-sm rounded-lg bg-violet-600 text-white hover:bg-violet-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {doctorOverviewOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 px-4 py-6 overflow-y-auto"
          onClick={() => setDoctorOverviewOpen(false)}
        >
          <div
            ref={doctorOverviewPrintRef}
            className="mx-auto w-full max-w-6xl rounded-xl border border-violet-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-violet-100 bg-white px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-gray-900">Doctor Overview Report</h4>
                  <p className="text-xs text-gray-600">
                    {doctorName || 'Doctor'} | {groupName || 'All Groups'}
                    {hasSpecificModule ? ` | ${normalizedModuleName}` : ''}
                  </p>
                </div>
                <div id="doctor-overview-actions" className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={printDoctorOverview}
                    className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
                  >
                    Print
                  </button>
                  <button
                    type="button"
                    onClick={() => setDoctorOverviewOpen(false)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                {doctorOverviewCards.map((card) => (
                  <div
                    key={card.label}
                    className={`rounded-lg p-3 text-center ${card.tone} ${card.label === 'Compliance' ? getComplianceTextClass(doctorOverviewTotals.compliance) : ''} ${card.featured ? 'md:col-span-2 lg:col-span-1 xl:col-span-1 shadow-sm' : ''}`}
                  >
                    <div className={`text-xs ${card.featured ? 'font-semibold uppercase tracking-[0.14em] text-indigo-700' : 'text-gray-500'}`}>{card.label}</div>
                    <div className={`${card.featured ? 'mt-1 text-2xl font-extrabold' : 'text-xl font-bold'}`}>{card.value}</div>
                    {card.detail ? <div className="mt-1 text-[11px] leading-4">{card.detail}</div> : <div className="mt-1 text-[11px] opacity-0">.</div>}
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full min-w-[760px]">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Checklist Item</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Met</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Partial</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Not Met</th>
                      <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase">Compliance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {doctorChecklistOverview.map((row) => (
                      <tr key={`doctor-overview-${row.code}`}>
                        <td className="px-3 py-2 text-sm text-gray-800">{row.label}</td>
                        <td className="px-3 py-2 text-center text-sm font-semibold text-emerald-700">{row.met}</td>
                        <td className="px-3 py-2 text-center text-sm font-semibold text-amber-700">{row.partial}</td>
                        <td className="px-3 py-2 text-center text-sm font-semibold text-rose-700">{row.notMet}</td>
                        <td className={`px-3 py-2 text-center text-sm font-semibold ${getComplianceTextClass(row.compliance)}`}>{row.compliance}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {reportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setReportModal(null)}
        >
          <div
            ref={reportPrintCardRef}
            id="qa-report-print-card"
            className="w-full max-w-5xl max-h-[90vh] overflow-auto rounded-xl bg-white border border-gray-200 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-white">
              <div className="flex items-center gap-3">
                <img
                  src={kentLogo}
                  alt="Kent Business College"
                  className="h-10 w-auto object-contain"
                />
                <h4 className="text-sm font-semibold text-gray-900">QA Observation Report</h4>
              </div>
              <div id="qa-report-print-actions" className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={printReport}
                  className="px-3 py-1.5 text-xs rounded-lg bg-violet-600 text-white hover:bg-violet-700"
                >
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => setReportModal(null)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-5 space-y-5">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm space-y-1">
                <p>
                  <span className="font-semibold">Session:</span>{' '}
                  {reportModal.ui_meta?.session_subject || reportModal.session.subject || '-'} -{' '}
                  {formatFullDate(reportModal.ui_meta?.session_date || reportModal.session.date)}
                </p>
                <p>
                  <span className="font-semibold">Trainer:</span>{' '}
                  {reportModal.ui_meta?.trainer || reportModal.session.trainer || '-'}
                </p>
                <p>
                  <span className="font-semibold">Duration:</span>{' '}
                  {reportModal.ui_meta?.duration_text || reportModal.session.duration || '-'}
                </p>
                <p>
                  <span className="font-semibold">Learners:</span>{' '}
                  {reportModal.ui_meta?.enrolled_students ?? reportModal.session.lms_students_count ?? 0} enrolled |{' '}
                  {reportModal.ui_meta?.attended_students ?? 0} attendance |{' '}
                  {reportModal.session.engaged_speakers_count ?? '-'} spoke
                </p>
              </div>

              <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm">
                <span className="font-semibold text-violet-800">Observation State: </span>
                {reportModal.observation_flags?.cancelled ? (
                  <span className="font-semibold text-rose-700">Cancelled / Not Delivered</span>
                ) : reportModal.observation_flags?.observed ? (
                  <span className="font-semibold text-emerald-700">Observed</span>
                ) : (
                  <span className="font-semibold text-amber-700">Pending (not observed yet)</span>
                )}
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <h5 className="text-sm font-semibold text-gray-900 mb-3">QA Observation</h5>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <div className="rounded-md border border-violet-200 bg-violet-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-violet-700">Teaching Quality Rating</p>
                    <p className="mt-1 text-2xl font-bold text-violet-800">
                      {reportModal.qa_observation.teaching_quality_rating ?? '-'}
                    </p>
                  </div>
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 md:col-span-2">
                    <p className="text-[11px] uppercase tracking-wide text-amber-700">Safeguarding Status</p>
                    <p className="mt-1 text-base font-semibold text-amber-900">
                      {reportModal.qa_observation.safeguarding_status || '-'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3 md:col-span-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Overall Judgement</p>
                    <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap leading-6">
                      {reportModal.qa_observation.overall_judgement || '-'}
                    </p>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Teaching Quality Comment</p>
                    <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap leading-6">
                      {reportModal.qa_observation.teaching_quality_comment || '-'}
                    </p>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">Safeguarding Comment</p>
                    <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap leading-6">
                      {reportModal.qa_observation.safeguarding_comment || '-'}
                    </p>
                  </div>
                </div>
                <div className="mt-3">
                  <p className="text-sm font-semibold text-gray-900 mb-2">Areas for Development</p>
                  {renderAreasForDevelopment(reportModal.qa_observation.areas_for_development)}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <h5 className="text-sm font-semibold text-gray-900 mb-3">Observation Categories</h5>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] border-collapse">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700">Category</th>
                        <th className="border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700">Evaluation</th>
                        <th className="border border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-700">Comments</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-gray-200 px-3 py-2 text-sm">Duration Score</td>
                        <td className="border border-gray-200 px-3 py-2 text-sm whitespace-pre-wrap">{reportModal.report_text_sections?.duration_score || '-'}</td>
                        <td className="border border-gray-200 px-3 py-2 text-sm">-</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-200 px-3 py-2 text-sm">KSBs Covered</td>
                        {(() => {
                          const rawKsbs = reportModal.report_text_sections?.ksbs_covered || '';
                          const ksbs = parseKsbsCovered(rawKsbs);
                          if (!ksbs.length) {
                            return (
                              <>
                                <td className="border border-gray-200 px-3 py-2 text-sm whitespace-pre-wrap">
                                  {rawKsbs || '-'}
                                </td>
                                <td className="border border-gray-200 px-3 py-2 text-sm">-</td>
                              </>
                            );
                          }
                          return (
                            <>
                              <td className="border border-gray-200 px-3 py-2 text-sm">
                                <div className="font-semibold text-violet-700">
                                  {ksbs.length} KSB item{ksbs.length > 1 ? 's' : ''}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  Structured view
                                </div>
                              </td>
                              <td className="border border-gray-200 px-3 py-2">
                                <div className="rounded-md border border-violet-100 overflow-hidden">
                                  <table className="w-full border-collapse">
                                    <thead>
                                      <tr className="bg-violet-50">
                                        <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-violet-700">Title</th>
                                        <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-violet-700">Evidence</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {ksbs.map((ksb, idx) => {
                                        const prevType = idx > 0 ? ksbs[idx - 1].type : null;
                                        const showGroup = idx === 0 || ksb.type !== prevType;
                                        return (
                                          <>
                                            {showGroup && (
                                              <tr key={`group-${ksb.type}-${idx}`} className="bg-gray-100">
                                                <td colSpan={2} className="px-2 py-1 text-xs font-semibold text-gray-600">
                                                  {ksb.type || '-'}
                                                </td>
                                              </tr>
                                            )}
                                            <tr key={ksb.key} className="border-t border-violet-100">
                                              <td className="px-2 py-1.5 text-xs text-gray-900 align-top w-[180px]">
                                                {ksb.title || ksb.key}
                                              </td>
                                              <td className="px-2 py-1.5 text-xs text-gray-700 align-top">
                                                <div className="whitespace-pre-wrap break-words">
                                                  {(ksb.evidence || '-')}
                                                </div>
                                                {ksb.clipsCount > 0 && (
                                                  <div className="mt-1 text-[10px] font-medium text-violet-700">
                                                    Clips: {ksb.clipsCount}
                                                  </div>
                                                )}
                                              </td>
                                            </tr>
                                          </>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </>
                          );
                        })()}
                      </tr>
                      <tr>
                        <td className="border border-gray-200 px-3 py-2 text-sm">Quality of Teaching</td>
                        <td className="border border-gray-200 px-3 py-2 text-sm whitespace-pre-wrap">{reportModal.report_text_sections?.quality_of_teaching_evaluation || '-'}</td>
                        <td className="border border-gray-200 px-3 py-2 text-sm whitespace-pre-wrap">{reportModal.report_text_sections?.quality_of_teaching_comments || '-'}</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-200 px-3 py-2 text-sm">Learner Engagement</td>
                        <td className="border border-gray-200 px-3 py-2 text-sm whitespace-pre-wrap">{reportModal.report_text_sections?.learner_engagement || '-'}</td>
                        <td className="border border-gray-200 px-3 py-2 text-sm">-</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-200 px-3 py-2 text-sm">Safeguarding</td>
                        <td className="border border-gray-200 px-3 py-2 text-sm whitespace-pre-wrap">{reportModal.report_text_sections?.safeguarding_evaluation || '-'}</td>
                        <td className="border border-gray-200 px-3 py-2 text-sm whitespace-pre-wrap">{reportModal.report_text_sections?.safeguarding_comments || '-'}</td>
                      </tr>
                      <tr>
                        <td className="border border-gray-200 px-3 py-2 text-sm">QA Checklist</td>
                        {(() => {
                          const raw = reportModal.report_text_sections?.qa_checklist || '';
                          const parsed = parseQaChecklistSection(raw);
                          if (!parsed?.hasStructured) {
                            return (
                              <>
                                <td className="border border-gray-200 px-3 py-2 text-sm whitespace-pre-wrap">
                                  {raw || '-'}
                                </td>
                                <td className="border border-gray-200 px-3 py-2 text-sm">-</td>
                              </>
                            );
                          }
                          return (
                            <>
                              <td className="border border-gray-200 px-3 py-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                                    Pass: {parsed.pass ?? '-'}
                                  </span>
                                  <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                                    Partial: {parsed.partial ?? '-'}
                                  </span>
                                  <span className="rounded-md bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800">
                                    Not Met: {parsed.notMet ?? '-'}
                                  </span>
                                </div>
                              </td>
                              <td className="border border-gray-200 px-3 py-2">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2">
                                    <p className="text-[11px] font-semibold text-emerald-800 mb-1">Pass Items</p>
                                    {parsed.passItems.length ? (
                                      <ul className="space-y-1">
                                        {parsed.passItems.slice(0, 8).map((item, idx) => (
                                          <li key={`pass-${idx}`} className="text-xs text-emerald-900">{item}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="text-xs text-gray-500">-</p>
                                    )}
                                  </div>
                                  <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
                                    <p className="text-[11px] font-semibold text-amber-800 mb-1">Partial Items</p>
                                    {parsed.partialItems.length ? (
                                      <ul className="space-y-1">
                                        {parsed.partialItems.slice(0, 8).map((item, idx) => (
                                          <li key={`partial-${idx}`} className="text-xs text-amber-900">{item}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="text-xs text-gray-500">-</p>
                                    )}
                                  </div>
                                  <div className="rounded-md border border-rose-200 bg-rose-50 p-2">
                                    <p className="text-[11px] font-semibold text-rose-800 mb-1">Not Met Items</p>
                                    {parsed.notMetItems.length ? (
                                      <ul className="space-y-1">
                                        {parsed.notMetItems.slice(0, 8).map((item, idx) => (
                                          <li key={`notmet-${idx}`} className="text-xs text-rose-900">{item}</li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="text-xs text-gray-500">-</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </>
                          );
                        })()}
                      </tr>
                      <tr>
                        <td className="border border-gray-200 px-3 py-2 text-sm">Strengths</td>
                        <td className="border border-gray-200 px-3 py-2 text-sm">-</td>
                        <td className="border border-gray-200 px-3 py-2 text-sm">
                          {(() => {
                            const rawStrengths = reportModal.report_text_sections?.strengths || '';
                            const strengths = parseStructuredSection(rawStrengths, 'strength');
                            if (!strengths.length) {
                              return <div className="whitespace-pre-wrap">{rawStrengths || '-'}</div>;
                            }
                            return (
                              <div className="space-y-2">
                                {strengths.map((item, idx) => (
                                  <div key={item.key} className="rounded-md border border-emerald-200 bg-emerald-50/50 p-2">
                                    <div className="text-xs font-semibold text-emerald-700">Strength {idx + 1}</div>
                                    <div className="text-sm font-semibold text-gray-900 mt-0.5">{item.title || item.key}</div>
                                    {item.evidence && (
                                      <div className="mt-1 text-xs text-gray-700 whitespace-pre-wrap break-words">
                                        {item.evidence}
                                      </div>
                                    )}
                                    {item.clipsCount > 0 && (
                                      <div className="mt-1 text-[10px] font-medium text-emerald-700">
                                        Clips: {item.clipsCount}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 p-4">
                <h5 className="text-sm font-semibold text-gray-900 mb-3">Evidence by Checklist Item</h5>
                {reportModal.checklist_items?.length ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {reportModal.checklist_items.map((item, idx) => {
                      const itemLabel = formatChecklistLabel(item.item || item.code || `Item ${idx + 1}`) || `Item ${idx + 1}`;
                      const statusTheme =
                        item.status === 'Met'
                          ? {
                              card: 'border-emerald-200 bg-emerald-50/40',
                              badge: 'border-emerald-200 bg-emerald-100 text-emerald-800',
                            }
                          : item.status === 'Partial'
                            ? {
                                card: 'border-amber-200 bg-amber-50/40',
                                badge: 'border-amber-200 bg-amber-100 text-amber-800',
                              }
                            : {
                                card: 'border-rose-200 bg-rose-50/40',
                                badge: 'border-rose-200 bg-rose-100 text-rose-800',
                              };

                      return (
                        <div key={`${item.code}-${idx}`} className={`rounded-lg border p-3 ${statusTheme.card}`}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-gray-900 leading-5">
                              {idx + 1}. {itemLabel}
                            </p>
                            <span className={`inline-flex shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${statusTheme.badge}`}>
                              {item.status}
                            </span>
                          </div>
                          <div className="mt-2 rounded-md border border-white/80 bg-white/75 p-2">
                            <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Evidence</p>
                            <p className="text-xs text-gray-700 whitespace-pre-wrap break-words leading-5">
                              {(item.evidence || '').trim() || 'No evidence found.'}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No checklist evidence available for this session.</p>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
}








