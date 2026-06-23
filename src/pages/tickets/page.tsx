import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import kentLogo from '../../../Kent-Business-College.webp';
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

interface Ticket {
  id: number;
  ticket_ref: string;
  tutor_name: string;
  session_id: string | null;
  session_date: string | null;
  session_subject: string | null;
  group_name: string | null;
  checklist_item_code: string | null;
  checklist_item_name: string | null;
  issue_type: 'not_met' | 'partially_met' | 'manual';
  risk: 'red' | 'amber';
  evidence: string | null;
  description: string | null;
  assigned_to: string | null;
  is_archived: boolean;
  note_count?: number;
  status: 'open' | 'in_review' | 'resolved' | 'dismissed';
  source: 'system' | 'manual';
  created_at: string;
  updated_at: string;
}

interface EvidenceFile {
  id: number;
  original_name: string;
  url: string;
  preview_url?: string;
  download_url?: string;
  sheet_preview_url?: string;
  uploaded_at: string;
}

interface TicketNote {
  id: number | 'legacy';
  text: string;
  created_by: string | null;
  created_at: string;
  is_legacy: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  in_review: 'In Review',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_review: 'bg-amber-100 text-amber-700',
  resolved: 'bg-emerald-100 text-emerald-700',
  dismissed: 'bg-gray-100 text-gray-500',
};

const RISK_COLORS: Record<string, string> = {
  red: 'bg-rose-100 text-rose-700',
  amber: 'bg-amber-100 text-amber-700',
};

const ISSUE_LABELS: Record<string, string> = {
  not_met: 'Not Met',
  partially_met: 'Partially Met',
  manual: 'Manual',
};

type TicketForm = {
  tutor_name: string;
  session_date: string;
  session_subject: string;
  group_name: string;
  issue_type: Ticket['issue_type'];
  risk: Ticket['risk'];
  description: string;
  evidence: string;
  status: Ticket['status'];
  source: Ticket['source'];
};

const emptyForm: TicketForm = {
  tutor_name: '',
  session_date: '',
  session_subject: '',
  group_name: '',
  issue_type: 'manual',
  risk: 'amber',
  description: '',
  evidence: '',
  status: 'open',
  source: 'manual',
};

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'open' | 'closed'>('all');
  const [riskFilter, setRiskFilter] = useState<'all' | 'red' | 'amber'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'not_met' | 'partially_met' | 'manual'>('all');
  const [tutorFilter, setTutorFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewTicket, setViewTicket] = useState<Ticket | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [tutorOptions, setTutorOptions] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'session_date' | 'tutor_name'>('session_date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [openActionMenu, setOpenActionMenu] = useState<number | null>(null);
  const [actionMenuPosition, setActionMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [actionModal, setActionModal] = useState<{ ticket: Ticket; type: 'contact_coach_tutor' | 'request_more_information' | 'change_risk_level' } | null>(null);
  const [actionDetails, setActionDetails] = useState({ contact_name: '', method: 'Email', message: '', requested_info: '', risk: 'amber' as Ticket['risk'], note: '' });
  const [savingAction, setSavingAction] = useState(false);
  const [editingAssignedId, setEditingAssignedId] = useState<number | null>(null);
  const [notePopup, setNotePopup] = useState<Ticket | null>(null);
  const [evidencePopup, setEvidencePopup] = useState<Ticket | null>(null);
  const [addNoteModal, setAddNoteModal] = useState<Ticket | null>(null);
  const [addEvidenceModal, setAddEvidenceModal] = useState<Ticket | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [evidenceUploadFiles, setEvidenceUploadFiles] = useState<File[]>([]);
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNote, setDeletingNote] = useState(false);
  const [notePopupNotes, setNotePopupNotes] = useState<TicketNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<TicketNote['id'] | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [savingEditedNote, setSavingEditedNote] = useState(false);
  const [savingEvidence, setSavingEvidence] = useState(false);
  const [evidenceCounts, setEvidenceCounts] = useState<Record<number, number>>({});
  const [evidencePopupFiles, setEvidencePopupFiles] = useState<EvidenceFile[]>([]);
  const [loadingEvidencePopup, setLoadingEvidencePopup] = useState(false);
  const [previewEvidenceFile, setPreviewEvidenceFile] = useState<EvidenceFile | null>(null);
  const [sheetPreviewRows, setSheetPreviewRows] = useState<string[][]>([]);
  const [loadingSheetPreview, setLoadingSheetPreview] = useState(false);
  const [sheetPreviewError, setSheetPreviewError] = useState<string | null>(null);
  const [showArchivedPanel, setShowArchivedPanel] = useState(false);
  const [archivedTickets, setArchivedTickets] = useState<Ticket[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [editModal, setEditModal] = useState<Ticket | null>(null);
  const [editForm, setEditForm] = useState<Partial<Ticket>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  const openActionsMenu = (ticketId: number, button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    setOpenActionMenu(openActionMenu === ticketId ? null : ticketId);
    setActionMenuPosition({
      top: rect.bottom + 6,
      left: Math.max(8, rect.right - 208),
    });
  };

  const toggleSort = (field: 'session_date' | 'tutor_name') => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  const getDaysOpen = (createdAt: string) => {
    const diff = Date.now() - new Date(createdAt).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const getNoteCount = (ticket: Ticket) => ticket.note_count ?? (ticket.description ? 1 : 0);

  const getFileExtension = (fileName: string) => fileName.split('.').pop()?.toLowerCase() || '';

  const getEvidencePreviewType = (file: EvidenceFile) => {
    const ext = getFileExtension(file.original_name);
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'pdf';
    if (['xlsx', 'csv'].includes(ext)) return 'sheet';
    return 'download';
  };

  const fetchEvidenceCounts = useCallback(async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/tickets/evidence-counts/`);
      setEvidenceCounts(res.data);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketsRes] = await Promise.all([
        axios.get(`${API_BASE}/api/tickets/`),
        fetchEvidenceCounts(),
      ]);
      setTickets(ticketsRes.data);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [fetchEvidenceCounts]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!previewEvidenceFile || getEvidencePreviewType(previewEvidenceFile) !== 'sheet') {
      setSheetPreviewRows([]);
      setSheetPreviewError(null);
      return;
    }

    setLoadingSheetPreview(true);
    setSheetPreviewRows([]);
    setSheetPreviewError(null);
    if (!previewEvidenceFile.sheet_preview_url) {
      setSheetPreviewError('Spreadsheet preview link is not available yet. Reopen the evidence list and try again.');
      setLoadingSheetPreview(false);
      return;
    }
    axios.get(previewEvidenceFile.sheet_preview_url)
      .then((res) => setSheetPreviewRows(res.data.rows || []))
      .catch((error) => setSheetPreviewError(error?.response?.data?.error || 'Could not preview this spreadsheet.'))
      .finally(() => setLoadingSheetPreview(false));
  }, [previewEvidenceFile]);

  // Build tutor options from loaded tickets
  useEffect(() => {
    const names = [...new Set(tickets.map((t) => t.tutor_name))].sort();
    setTutorOptions(names);
  }, [tickets]);

  // Base filtered = tutor + month + type + search (used for cards & tab counts)
  const baseFiltered = tickets.filter((t) => {
    if (tutorFilter !== 'all' && t.tutor_name !== tutorFilter) return false;
    const ticketDate = (t.session_date || '').slice(0, 10);
    if (fromDate && (!ticketDate || ticketDate < fromDate)) return false;
    if (toDate && (!ticketDate || ticketDate > toDate)) return false;
    if (typeFilter !== 'all' && t.issue_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.ticket_ref.toLowerCase().includes(q) ||
        t.tutor_name.toLowerCase().includes(q) ||
        (t.session_subject || '').toLowerCase().includes(q) ||
        (t.checklist_item_name || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filtered = baseFiltered
    .filter((t) => {
      if (activeTab === 'open'   && !['open', 'in_review'].includes(t.status)) return false;
      if (activeTab === 'closed' && !['resolved', 'dismissed'].includes(t.status)) return false;
      if (riskFilter !== 'all'   && t.risk !== riskFilter) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'session_date') {
        cmp = (a.session_date || '').localeCompare(b.session_date || '');
      } else {
        cmp = (a.tutor_name || '').localeCompare(b.tutor_name || '');
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const allCount     = baseFiltered.length;
  const openCount    = baseFiltered.filter((t) => ['open', 'in_review'].includes(t.status)).length;
  const closedCount  = baseFiltered.filter((t) => ['resolved', 'dismissed'].includes(t.status)).length;
  const redCount     = baseFiltered.filter((t) => t.risk === 'red').length;
  const amberCount   = baseFiltered.filter((t) => t.risk === 'amber').length;
  const openRedCount   = baseFiltered.filter((t) => t.risk === 'red'   && ['open','in_review'].includes(t.status)).length;
  const openAmberCount = baseFiltered.filter((t) => t.risk === 'amber' && ['open','in_review'].includes(t.status)).length;

  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // "2026-06"
      const res = await axios.post(`${API_BASE}/api/tickets/sync-all/?month=${currentMonth}`);
      setSyncResult(`Created ${res.data.created} tickets, skipped ${res.data.skipped} duplicates.`);
      fetchTickets();
    } catch (e: any) {
      setSyncResult('Sync failed: ' + (e?.response?.data?.error || e.message));
    } finally {
      setSyncing(false);
    }
  };

  const handleCreate = async () => {
    if (!form.tutor_name.trim()) return;
    setCreating(true);
    try {
      await axios.post(`${API_BASE}/api/tickets/create/`, form);
      setShowCreateModal(false);
      setForm(emptyForm);
      fetchTickets();
    } catch {
      /* ignore */
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    setUpdatingId(id);
    try {
      await axios.patch(`${API_BASE}/api/tickets/${id}/`, { status: newStatus });
      setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status: newStatus as Ticket['status'] } : t)));
      if (viewTicket?.id === id) setViewTicket((v) => v ? { ...v, status: newStatus as Ticket['status'] } : v);
    } catch {
      /* ignore */
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAssignChange = async (id: number, value: string) => {
    try {
      await axios.patch(`${API_BASE}/api/tickets/${id}/`, { assigned_to: value });
      setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, assigned_to: value } : t)));
      if (viewTicket?.id === id) setViewTicket((v) => v ? { ...v, assigned_to: value } : v);
    } catch {
      /* ignore */
    }
  };

  const handleSaveNote = async () => {
    if (!addNoteModal || !noteInput.trim()) return;
    setSavingNote(true);
    try {
      await axios.post(`${API_BASE}/api/tickets/${addNoteModal.id}/notes/`, { text: noteInput.trim() });
      setTickets((prev) => prev.map((t) => (
        t.id === addNoteModal.id ? { ...t, note_count: getNoteCount(t) + 1 } : t
      )));
      setAddNoteModal(null);
      setNoteInput('');
    } finally {
      setSavingNote(false);
    }
  };

  const handleOpenNotePopup = async (ticket: Ticket) => {
    setNotePopup(ticket);
    setNotePopupNotes([]);
    setLoadingNotes(true);
    try {
      const res = await axios.get(`${API_BASE}/api/tickets/${ticket.id}/notes/`);
      setNotePopupNotes(res.data);
    } catch {
      setNotePopupNotes([]);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleDeleteNote = async (noteId: TicketNote['id']) => {
    if (!notePopup) return;
    setDeletingNote(true);
    try {
      await axios.delete(`${API_BASE}/api/tickets/${notePopup.id}/notes/${noteId}/`);
      setNotePopupNotes((prev) => prev.filter((n) => n.id !== noteId));
      setTickets((prev) => prev.map((t) => (
        t.id === notePopup.id
          ? {
              ...t,
              description: noteId === 'legacy' ? '' : t.description,
              note_count: Math.max(0, getNoteCount(t) - 1),
            }
          : t
      )));
      if (viewTicket?.id === notePopup.id && noteId === 'legacy') {
        setViewTicket((v) => (v ? { ...v, description: '' } : v));
      }
    } finally {
      setDeletingNote(false);
    }
  };

  const handleStartEditNote = (note: TicketNote) => {
    setEditingNoteId(note.id);
    setEditingNoteText(note.text);
  };

  const handleCancelEditNote = () => {
    setEditingNoteId(null);
    setEditingNoteText('');
  };

  const handleSaveEditedNote = async () => {
    if (!notePopup || editingNoteId === null || !editingNoteText.trim()) return;
    setSavingEditedNote(true);
    try {
      const res = await axios.patch(`${API_BASE}/api/tickets/${notePopup.id}/notes/${editingNoteId}/`, {
        text: editingNoteText.trim(),
      });
      setNotePopupNotes((prev) => prev.map((n) => (n.id === editingNoteId ? res.data : n)));
      if (editingNoteId === 'legacy') {
        setTickets((prev) => prev.map((t) => (
          t.id === notePopup.id ? { ...t, description: editingNoteText.trim() } : t
        )));
        if (viewTicket?.id === notePopup.id) {
          setViewTicket((v) => (v ? { ...v, description: editingNoteText.trim() } : v));
        }
      }
      handleCancelEditNote();
    } finally {
      setSavingEditedNote(false);
    }
  };

  const appendEvidenceFiles = (files: File[]) => {
    setEvidenceUploadFiles((prev) => {
      const seen = new Set(prev.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const next = [...prev];
      files.forEach((file) => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (!seen.has(key)) {
          seen.add(key);
          next.push(file);
        }
      });
      return next;
    });
  };

  const handleUploadEvidence = async () => {
    if (!addEvidenceModal || evidenceUploadFiles.length === 0) return;
    setSavingEvidence(true);
    try {
      for (const file of evidenceUploadFiles) {
        const fd = new FormData();
        fd.append('file', file);
        await axios.post(`${API_BASE}/api/tickets/${addEvidenceModal.id}/evidence/`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }
      setAddEvidenceModal(null);
      setEvidenceUploadFiles([]);
      await fetchEvidenceCounts();
    } finally {
      setSavingEvidence(false);
    }
  };

  const handleOpenEvidencePopup = async (ticket: Ticket) => {
    setEvidencePopup(ticket);
    setEvidencePopupFiles([]);
    setLoadingEvidencePopup(true);
    try {
      const res = await axios.get(`${API_BASE}/api/tickets/${ticket.id}/evidence/`);
      setEvidencePopupFiles(res.data);
    } catch {
      setEvidencePopupFiles([]);
    } finally {
      setLoadingEvidencePopup(false);
    }
  };

  const handleDeleteEvidenceFile = async (ticketId: number, evidenceId: number) => {
    await axios.delete(`${API_BASE}/api/tickets/${ticketId}/evidence/${evidenceId}/`);
    setEvidencePopupFiles((prev) => prev.filter((f) => f.id !== evidenceId));
    setEvidenceCounts((prev) => ({ ...prev, [ticketId]: Math.max(0, (prev[ticketId] || 1) - 1) }));
  };

  const handleArchive = async (id: number) => {
    await axios.patch(`${API_BASE}/api/tickets/${id}/`, { is_archived: true });
    setTickets((prev) => prev.filter((t) => t.id !== id));
    if (viewTicket?.id === id) setViewTicket(null);
    setOpenActionMenu(null);
  };

  const handleRestoreFromArchive = async (id: number) => {
    await axios.patch(`${API_BASE}/api/tickets/${id}/`, { is_archived: false });
    setArchivedTickets((prev) => prev.filter((t) => t.id !== id));
    fetchTickets();
  };

  const handlePermanentDelete = async (id: number) => {
    if (!confirm('Permanently delete this ticket? This cannot be undone.')) return;
    await axios.delete(`${API_BASE}/api/tickets/${id}/`);
    setArchivedTickets((prev) => prev.filter((t) => t.id !== id));
  };

  const fetchArchivedTickets = async () => {
    setLoadingArchived(true);
    try {
      const res = await axios.get(`${API_BASE}/api/tickets/?archived=true`);
      setArchivedTickets(res.data);
    } catch {
      setArchivedTickets([]);
    } finally {
      setLoadingArchived(false);
    }
  };

  const openArchivedPanel = () => {
    setShowArchivedPanel(true);
    fetchArchivedTickets();
  };

  const handleOpenEdit = (ticket: Ticket) => {
    setEditModal(ticket);
    setEditForm({
      tutor_name: ticket.tutor_name,
      session_date: ticket.session_date || '',
      session_subject: ticket.session_subject || '',
      group_name: ticket.group_name || '',
      issue_type: ticket.issue_type,
      risk: ticket.risk,
      assigned_to: ticket.assigned_to || '',
      description: ticket.description || '',
      status: ticket.status,
    });
    setOpenActionMenu(null);
  };

  const openActionModal = (ticket: Ticket, type: 'contact_coach_tutor' | 'request_more_information' | 'change_risk_level') => {
    setActionModal({ ticket, type });
    setActionDetails({
      contact_name: ticket.assigned_to || '',
      method: 'Email',
      message: '',
      requested_info: '',
      risk: ticket.risk,
      note: '',
    });
    setOpenActionMenu(null);
  };

  const handleSaveAction = async () => {
    if (!actionModal) return;
    setSavingAction(true);
    try {
      const details =
        actionModal.type === 'contact_coach_tutor'
          ? { contact_name: actionDetails.contact_name, method: actionDetails.method, message: actionDetails.message }
          : actionModal.type === 'request_more_information'
          ? { requested_info: actionDetails.requested_info, note: actionDetails.note }
          : { from_risk: actionModal.ticket.risk, to_risk: actionDetails.risk, note: actionDetails.note };

      await axios.post(`${API_BASE}/api/tickets/${actionModal.ticket.id}/actions/`, {
        action_type: actionModal.type,
        details,
      });

      if (actionModal.type === 'change_risk_level' && actionDetails.risk !== actionModal.ticket.risk) {
        const res = await axios.patch(`${API_BASE}/api/tickets/${actionModal.ticket.id}/`, { risk: actionDetails.risk });
        setTickets((prev) => prev.map((t) => (t.id === actionModal.ticket.id ? { ...t, ...res.data } : t)));
        if (viewTicket?.id === actionModal.ticket.id) setViewTicket((v) => v ? { ...v, ...res.data } : v);
      }

      setActionModal(null);
    } finally {
      setSavingAction(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editModal) return;
    setSavingEdit(true);
    try {
      const res = await axios.patch(`${API_BASE}/api/tickets/${editModal.id}/`, editForm);
      setTickets((prev) => prev.map((t) => (t.id === editModal.id ? { ...t, ...res.data } : t)));
      setEditModal(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this ticket?')) return;
    await axios.delete(`${API_BASE}/api/tickets/${id}/`);
    setTickets((prev) => prev.filter((t) => t.id !== id));
    if (viewTicket?.id === id) setViewTicket(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-[110rem] mx-auto px-4 md:px-5 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={kentLogo} alt="Kent Business College" className="w-[95px] sm:w-[125px] lg:w-[150px] h-auto object-contain" />
              <div>
                <h1 className="sm:text-xl font-bold text-gray-900 leading-tight">Ticket System</h1>
                <p className="text-xs text-gray-500">Monitor tutor performance issues and follow-ups</p>
              </div>
            </div>
            <Link to="/" className="whitespace-nowrap rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 transition-colors flex items-center gap-2">
              <i className="ri-arrow-left-line"></i> Back to Dashboard
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-[110rem] mx-auto px-4 md:px-5 py-6 space-y-6">

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">Open Tickets</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{openCount}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              <i className="ri-ticket-2-line text-blue-500 text-xl"></i>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">Red Risk</p>
              <p className="text-3xl font-bold text-rose-600 mt-1">{openRedCount}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center">
              <i className="ri-close-circle-line text-rose-500 text-xl"></i>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">Amber Risk</p>
              <p className="text-3xl font-bold text-amber-600 mt-1">{openAmberCount}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center">
              <i className="ri-error-warning-line text-amber-500 text-xl"></i>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase font-medium">Resolved</p>
              <p className="text-3xl font-bold text-emerald-600 mt-1">{closedCount}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center">
              <i className="ri-checkbox-circle-line text-emerald-500 text-xl"></i>
            </div>
          </div>
        </div>

        {/* Tickets Panel */}
        <div className="bg-white rounded-xl border border-gray-200">
          {/* Panel header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="font-semibold text-gray-900">Tutor Tickets</h2>
              <p className="text-xs text-gray-500 mt-0.5">Manage performance issues and follow-ups</p>
              {syncResult && (
                <p className={`text-xs mt-1 font-medium ${syncResult.startsWith('Sync failed') ? 'text-rose-500' : 'text-emerald-600'}`}>
                  {syncResult}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openArchivedPanel}
                className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <i className="ri-archive-line"></i> Archived
              </button>
              <button
                onClick={handleSyncAll}
                disabled={syncing}
                className="flex items-center gap-2 rounded-lg border border-violet-300 px-4 py-2 text-sm font-medium text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-50"
              >
                <i className={`ri-refresh-line ${syncing ? 'animate-spin' : ''}`}></i>
                {syncing ? 'Syncing...' : 'Sync All Tutors'}
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors"
              >
                <i className="ri-add-line"></i> Create Ticket
              </button>
            </div>
          </div>

          {/* Search + filters */}
          <div className="flex flex-col items-stretch gap-3 px-5 py-3 border-b border-gray-100 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tickets, subjects, checklist items..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <TutorDropdown
              options={tutorOptions}
              value={tutorFilter}
              onChange={setTutorFilter}
            />
            <div className="grid grid-cols-2 items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/70 px-2 py-1.5 sm:flex sm:items-center">
              <DatePickerField
                label="From"
                value={fromDate}
                onChange={setFromDate}
              />
              <DatePickerField
                label="To"
                value={toDate}
                min={fromDate}
                onChange={setToDate}
              />
              {(fromDate || toDate) && (
                <button
                  onClick={() => { setFromDate(''); setToDate(''); }}
                  className="col-span-2 h-11 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-500 shadow-sm hover:bg-gray-50 sm:col-span-1"
                >
                  Clear
                </button>
              )}
            </div>
            <SimpleDropdown
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as typeof typeFilter)}
              placeholder="All Types"
              icon="ri-flag-line"
              options={[
                { value: 'all',          label: 'All Types' },
                { value: 'not_met',      label: 'Not Met' },
                { value: 'partially_met',label: 'Partially Met' },
                { value: 'manual',       label: 'Manual' },
              ]}
            />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-5 py-3 border-b border-gray-100">
            {([
              { key: 'all', label: 'All Tickets', count: allCount },
              { key: 'open', label: 'Open Tickets', count: openCount },
              { key: 'closed', label: 'Closed Tickets', count: closedCount },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-violet-600 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
                  activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* RAG filter */}
          <div className="flex gap-2 px-5 py-3 border-b border-gray-100">
            <span className="text-xs text-gray-400 uppercase font-medium self-center mr-1">Risk:</span>
            {([
              { key: 'all', label: 'All', count: redCount + amberCount },
              { key: 'red', label: 'Red', count: redCount },
              { key: 'amber', label: 'Amber', count: amberCount },
            ] as const).map((f) => (
              <button
                key={f.key}
                onClick={() => setRiskFilter(f.key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                  riskFilter === f.key
                    ? f.key === 'red'
                      ? 'bg-rose-600 text-white border-rose-600'
                      : f.key === 'amber'
                      ? 'bg-amber-500 text-white border-amber-500'
                      : 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {f.label}
                <span className="font-bold">{f.count}</span>
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="flex justify-center py-16">
                <i className="ri-loader-4-line animate-spin text-2xl text-violet-500"></i>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center py-16 text-center">
                <i className="ri-ticket-2-line text-4xl text-gray-300 mb-3"></i>
                <p className="text-sm text-gray-500">No tickets found</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase">
                    <th className="px-5 py-3 font-medium">Ticket</th>
                    <th className="px-4 py-3 font-medium">
                      <button onClick={() => toggleSort('tutor_name')} className="flex items-center gap-1 hover:text-violet-600 transition-colors">
                        Tutor
                        <span className="text-gray-300">
                          {sortField === 'tutor_name' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium">Issue</th>
                    <th className="px-4 py-3 font-medium">Risk</th>
                    <th className="px-4 py-3 font-medium">Checklist Item</th>
                    <th className="px-4 py-3 font-medium">
                      <button onClick={() => toggleSort('session_date')} className="flex items-center gap-1 hover:text-violet-600 transition-colors">
                        Session
                        <span className={sortField === 'session_date' ? 'text-violet-500' : 'text-gray-300'}>
                          {sortField === 'session_date' ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </button>
                    </th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Assigned To</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium">
                      <span className="inline-flex items-center gap-1">
                        Days
                        <span className="group relative inline-flex">
                          <i tabIndex={0} className="ri-information-line cursor-help text-xs text-gray-400 hover:text-violet-600 focus:text-violet-600 focus:outline-none"></i>
                          <span className="pointer-events-none absolute left-1/2 top-full z-40 mt-2 w-56 -translate-x-1/2 rounded-lg border border-gray-100 bg-gray-900 px-3 py-2 text-[11px] font-medium normal-case leading-relaxed text-white opacity-0 shadow-xl transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            Number of days this ticket has been open since it was created.
                          </span>
                        </span>
                      </span>
                    </th>
                    <th className="px-4 py-3 font-medium">Notes</th>
                    <th className="px-4 py-3 font-medium">Evidence</th>
                    <th className="px-4 py-3 font-medium">View</th>
                    <th className="px-4 py-3 font-medium text-center">Edit</th>
                    <th className="px-4 py-3 font-medium text-center">Archive</th>
                    <th className="px-4 py-3 font-medium text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map((ticket) => (
                    <tr key={ticket.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3">
                        <button
                          onClick={() => setViewTicket(ticket)}
                          className="font-semibold text-violet-600 hover:underline"
                        >
                          {ticket.ticket_ref}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{ticket.tutor_name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          ticket.issue_type === 'not_met'
                            ? 'bg-rose-100 text-rose-700'
                            : ticket.issue_type === 'partially_met'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {ISSUE_LABELS[ticket.issue_type]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${RISK_COLORS[ticket.risk]}`}>
                          {ticket.risk}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate" title={ticket.checklist_item_name || '-'}>
                        {ticket.checklist_item_name || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {ticket.session_date ? ticket.session_date.slice(0, 10) : <span className="text-gray-300">—</span>}
                        {ticket.session_subject && (
                          <div className="text-xs text-gray-400 truncate max-w-[120px]" title={ticket.session_subject}>
                            {ticket.session_subject}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={ticket.status} loading={updatingId === ticket.id} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          ticket.source === 'system' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                        }`}>
                          {ticket.source === 'system' ? 'System' : 'Manual'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <AssignedToCell
                          value={ticket.assigned_to || ''}
                          editing={editingAssignedId === ticket.id}
                          onEdit={() => setEditingAssignedId(ticket.id)}
                          onCancel={() => setEditingAssignedId(null)}
                          onSave={(value) => {
                            if (value !== (ticket.assigned_to || '')) handleAssignChange(ticket.id, value);
                            setEditingAssignedId(null);
                          }}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {ticket.created_at.slice(0, 10)}
                      </td>
                      {/* Days open */}
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-semibold text-gray-700">
                          {getDaysOpen(ticket.created_at)}
                        </span>
                      </td>
                      {/* Notes */}
                      <td className="px-4 py-3 text-center">
                        {getNoteCount(ticket) > 0 ? (
                          <button
                            onClick={() => handleOpenNotePopup(ticket)}
                            title={`${getNoteCount(ticket)} note${getNoteCount(ticket) !== 1 ? 's' : ''}`}
                            className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-violet-100 hover:text-violet-700 transition-colors"
                          >
                            <i className="ri-file-text-line text-sm"></i> {getNoteCount(ticket)}
                          </button>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      {/* Evidence (user-uploaded files) */}
                      <td className="px-4 py-3 text-center">
                        {(evidenceCounts[ticket.id] || 0) > 0 ? (
                          <button
                            onClick={() => handleOpenEvidencePopup(ticket)}
                            title={`${evidenceCounts[ticket.id]} evidence file${evidenceCounts[ticket.id] !== 1 ? 's' : ''}`}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
                          >
                            <i className="ri-attachment-2 text-sm"></i> {evidenceCounts[ticket.id]}
                          </button>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      {/* View column */}
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setViewTicket(ticket)}
                          className="inline-flex items-center gap-1 text-violet-600 hover:text-violet-800 text-xs font-medium"
                        >
                          <i className="ri-eye-line text-sm"></i> View
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleOpenEdit(ticket)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-violet-600 hover:bg-violet-50 hover:text-violet-800 transition-colors"
                          title="Edit ticket"
                          aria-label="Edit ticket"
                        >
                          <i className="ri-edit-line text-base"></i>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleArchive(ticket.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-violet-600 hover:bg-violet-50 hover:text-violet-800 transition-colors"
                          title="Archive ticket"
                          aria-label="Archive ticket"
                        >
                          <i className="ri-archive-line text-base"></i>
                        </button>
                      </td>
                      {/* Actions dropdown */}
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => openActionsMenu(ticket.id, e.currentTarget)}
                          className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-violet-300 transition-colors"
                        >
                          <i className="ri-more-2-fill text-sm"></i> Actions
                        </button>
                        {openActionMenu === ticket.id && actionMenuPosition && (
                          <div
                            ref={actionMenuRef}
                            style={{ top: actionMenuPosition.top, left: actionMenuPosition.left }}
                            className="fixed z-[70] w-52 rounded-xl border border-gray-100 bg-white shadow-2xl py-1"
                          >
                            <div className="px-3 py-1.5 flex items-center gap-2 border-b border-gray-50">
                              <i className="ri-more-2-fill text-gray-400 text-xs"></i>
                              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Case Actions</span>
                            </div>
                            <div className="px-2 pt-1 pb-0.5">
                              <p className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Status</p>
                              {Object.entries(STATUS_LABELS).map(([statusValue, label]) => (
                                <button
                                  key={statusValue}
                                  onClick={() => { handleStatusChange(ticket.id, statusValue); setOpenActionMenu(null); }}
                                  disabled={updatingId === ticket.id || ticket.status === statusValue}
                                  className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors disabled:cursor-default ${
                                    ticket.status === statusValue
                                      ? 'bg-violet-50 font-semibold text-violet-700'
                                      : 'text-gray-700 hover:bg-violet-50 hover:text-violet-700'
                                  }`}
                                >
                                  <span className={`h-2 w-2 rounded-full ${STATUS_DOT[statusValue]}`}></span>
                                  {label}
                                  {ticket.status === statusValue && <i className="ri-check-line ml-auto text-sm"></i>}
                                </button>
                              ))}
                            </div>
                            <div className="px-2 pt-0.5 pb-0.5 border-t border-gray-50">
                              <p className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Contact</p>
                              <button onClick={() => { setAddNoteModal(ticket); setNoteInput(''); setOpenActionMenu(null); }} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-violet-50 hover:text-violet-700 transition-colors">
                                <i className="ri-file-add-line text-sm text-gray-400"></i> Add Case Note
                              </button>
                              <button onClick={() => openActionModal(ticket, 'contact_coach_tutor')} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-violet-50 hover:text-violet-700 transition-colors">
                                <i className="ri-phone-line text-sm text-gray-400"></i> Contact Coach / Tutor
                              </button>
                              <button onClick={() => openActionModal(ticket, 'request_more_information')} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-violet-50 hover:text-violet-700 transition-colors">
                                <i className="ri-question-line text-sm text-gray-400"></i> Request More Information
                              </button>
                            </div>
                            <div className="px-2 pb-0.5 border-t border-gray-50 pt-0.5">
                              <p className="px-2 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Case Record</p>
                              <button onClick={() => { setAddEvidenceModal(ticket); setOpenActionMenu(null); }} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-violet-50 hover:text-violet-700 transition-colors">
                                <i className="ri-attachment-2 text-sm text-gray-400"></i> Add Evidence
                              </button>
                              <button onClick={() => openActionModal(ticket, 'change_risk_level')} className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-700 hover:bg-violet-50 hover:text-violet-700 transition-colors">
                                <i className="ri-alarm-warning-line text-sm text-gray-400"></i> Change Risk Level
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {filtered.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400">
              Showing {filtered.length} of {allCount} tickets
            </div>
          )}
        </div>
      </div>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Create Manual Ticket</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tutor Name *</label>
                <input
                  value={form.tutor_name}
                  onChange={(e) => setForm((f) => ({ ...f, tutor_name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="Enter tutor name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Session Date</label>
                  <input
                    type="date"
                    value={form.session_date}
                    onChange={(e) => setForm((f) => ({ ...f, session_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Group</label>
                  <input
                    value={form.group_name}
                    onChange={(e) => setForm((f) => ({ ...f, group_name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Group name"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Session Subject</label>
                <input
                  value={form.session_subject}
                  onChange={(e) => setForm((f) => ({ ...f, session_subject: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="Session subject"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Issue Type</label>
                  <select
                    value={form.issue_type}
                    onChange={(e) => {
                      const val = e.target.value as typeof form.issue_type;
                      setForm((f) => ({ ...f, issue_type: val, risk: val === 'not_met' ? 'red' : 'amber' }));
                    }}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="not_met">Not Met</option>
                    <option value="partially_met">Partially Met</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Risk</label>
                  <select
                    value={form.risk}
                    onChange={(e) => setForm((f) => ({ ...f, risk: e.target.value as 'red' | 'amber' }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="red">Red</option>
                    <option value="amber">Amber</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  placeholder="Describe the issue..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setShowCreateModal(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !form.tutor_name.trim()}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
              >
                {creating ? 'Creating...' : 'Create Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Ticket Modal */}
      {viewTicket && (
        <ViewTicketModal
          ticket={viewTicket}
          updatingId={updatingId}
          onClose={() => setViewTicket(null)}
          onStatusChange={handleStatusChange}
          apiBase={API_BASE}
        />
      )}

      {/* Add Case Note Modal */}
      {addNoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setAddNoteModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <i className="ri-file-add-line text-violet-600 text-lg"></i>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Add Case Note</h3>
                  <p className="text-xs text-gray-400">{addNoteModal.ticket_ref} · {addNoteModal.tutor_name}</p>
                </div>
              </div>
              <button onClick={() => setAddNoteModal(null)} className="text-gray-400 hover:text-gray-600">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <div className="px-5 py-4">
              <textarea
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Write your case note here..."
                rows={5}
                autoFocus
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 px-5 pb-4">
              <button onClick={() => setAddNoteModal(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleSaveNote}
                disabled={savingNote || !noteInput.trim()}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {savingNote ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Evidence Modal */}
      {addEvidenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => { setAddEvidenceModal(null); setEvidenceUploadFiles([]); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <i className="ri-attachment-2 text-emerald-600 text-lg"></i>
                <div>
                  <h3 className="font-semibold text-gray-900 text-sm">Upload Evidence</h3>
                  <p className="text-xs text-gray-400">{addEvidenceModal.ticket_ref} · {addEvidenceModal.tutor_name}</p>
                </div>
              </div>
              <button onClick={() => { setAddEvidenceModal(null); setEvidenceUploadFiles([]); }} className="text-gray-400 hover:text-gray-600">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 shadow-sm">
                <i className="ri-error-warning-line mr-1 text-amber-500"></i>
                You can select or drop multiple evidence files at once, and add more before uploading.
              </div>
              <label
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  appendEvidenceFiles(Array.from(e.dataTransfer.files || []));
                }}
                className="flex flex-col items-center justify-center w-full h-32 rounded-xl border-2 border-dashed border-emerald-200 bg-emerald-50 cursor-pointer hover:bg-emerald-100 transition-colors"
              >
                <i className="ri-upload-cloud-2-line text-3xl text-emerald-400 mb-1"></i>
                <span className="text-sm font-medium text-emerald-700">Click to select files</span>
                <span className="text-xs text-emerald-500 mt-0.5">Images, PDFs, documents - multiple allowed</span>
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  className="hidden"
                  onChange={(e) => {
                    appendEvidenceFiles(Array.from(e.target.files || []));
                    e.target.value = '';
                  }}
                />
              </label>
              {evidenceUploadFiles.length > 0 && (
                <ul className="space-y-1.5">
                  {evidenceUploadFiles.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg bg-gray-50 border border-gray-100 px-3 py-2">
                      <i className="ri-file-line text-gray-400 shrink-0"></i>
                      <span className="text-xs text-gray-700 truncate flex-1">{f.name}</span>
                      <span className="text-xs text-gray-400 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                      <button onClick={() => setEvidenceUploadFiles((prev) => prev.filter((_, j) => j !== i))} className="text-gray-300 hover:text-rose-500 transition-colors shrink-0">
                        <i className="ri-close-line text-sm"></i>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 pb-4">
              <button onClick={() => { setAddEvidenceModal(null); setEvidenceUploadFiles([]); }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleUploadEvidence}
                disabled={savingEvidence || evidenceUploadFiles.length === 0}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingEvidence ? 'Uploading...' : `Upload ${evidenceUploadFiles.length > 0 ? `(${evidenceUploadFiles.length})` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setActionModal(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {actionModal.type === 'contact_coach_tutor' ? 'Contact Coach / Tutor' : actionModal.type === 'request_more_information' ? 'Request More Information' : 'Change Risk Level'}
                </h3>
                <p className="text-xs text-gray-400">{actionModal.ticket.ticket_ref} - {actionModal.ticket.tutor_name}</p>
              </div>
              <button onClick={() => setActionModal(null)} className="text-gray-400 hover:text-gray-600">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <div className="space-y-3 px-5 py-4">
              {actionModal.type === 'contact_coach_tutor' && (
                <>
                  <input
                    value={actionDetails.contact_name}
                    onChange={(e) => setActionDetails((d) => ({ ...d, contact_name: e.target.value }))}
                    placeholder="Contact name"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                  <select
                    value={actionDetails.method}
                    onChange={(e) => setActionDetails((d) => ({ ...d, method: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option>Email</option>
                    <option>Phone</option>
                    <option>Teams</option>
                    <option>Other</option>
                  </select>
                  <textarea
                    value={actionDetails.message}
                    onChange={(e) => setActionDetails((d) => ({ ...d, message: e.target.value }))}
                    rows={4}
                    placeholder="What was discussed or sent?"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                </>
              )}
              {actionModal.type === 'request_more_information' && (
                <>
                  <textarea
                    value={actionDetails.requested_info}
                    onChange={(e) => setActionDetails((d) => ({ ...d, requested_info: e.target.value }))}
                    rows={4}
                    placeholder="What information is needed?"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                  <input
                    value={actionDetails.note}
                    onChange={(e) => setActionDetails((d) => ({ ...d, note: e.target.value }))}
                    placeholder="Optional note"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </>
              )}
              {actionModal.type === 'change_risk_level' && (
                <>
                  <select
                    value={actionDetails.risk}
                    onChange={(e) => setActionDetails((d) => ({ ...d, risk: e.target.value as Ticket['risk'] }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="red">Red</option>
                    <option value="amber">Amber</option>
                  </select>
                  <textarea
                    value={actionDetails.note}
                    onChange={(e) => setActionDetails((d) => ({ ...d, note: e.target.value }))}
                    rows={3}
                    placeholder="Reason for changing risk level"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  />
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 pb-4">
              <button onClick={() => setActionModal(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSaveAction} disabled={savingAction} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50">
                {savingAction ? 'Saving...' : 'Save Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note Popup */}
      {notePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setNotePopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 bg-violet-700 text-white">
              <div className="flex items-center gap-2">
                <i className="ri-chat-1-line text-lg"></i>
                <span className="font-semibold">Case Notes</span>
                <span className="text-violet-300">· {notePopup.tutor_name}</span>
              </div>
              <button onClick={() => setNotePopup(null)} className="text-white/70 hover:text-white transition-colors">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              {loadingNotes ? (
                <div className="flex justify-center py-8">
                  <i className="ri-loader-4-line animate-spin text-xl text-violet-500"></i>
                </div>
              ) : notePopupNotes.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-4">No case notes.</p>
              ) : (
                <ul className="space-y-3">
                  {notePopupNotes.map((note) => (
                    <li key={note.id} className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-3">
                      {editingNoteId === note.id ? (
                        <textarea
                          value={editingNoteText}
                          onChange={(e) => setEditingNoteText(e.target.value)}
                          rows={3}
                          autoFocus
                          className="w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200 resize-none"
                        />
                      ) : (
                        <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{note.text}</p>
                      )}
                      <div className="mt-3 flex items-center gap-2 text-xs text-violet-500">
                        <i className="ri-time-line"></i>
                        <span>{note.created_at.slice(0, 10)}</span>
                        <span className="text-gray-300">-</span>
                        <span>{notePopup.ticket_ref}</span>
                        {note.is_legacy && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-violet-500">legacy</span>}
                        <div className="ml-auto flex items-center gap-2">
                          {editingNoteId === note.id ? (
                            <>
                              <button
                                onClick={handleSaveEditedNote}
                                disabled={savingEditedNote || !editingNoteText.trim()}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-100 bg-white px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-50 transition-colors"
                              >
                                <i className={savingEditedNote ? 'ri-loader-4-line animate-spin text-sm' : 'ri-check-line text-sm'}></i>
                                Save
                              </button>
                              <button
                                onClick={handleCancelEditNote}
                                disabled={savingEditedNote}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-100 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => handleStartEditNote(note)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-100 bg-white px-2.5 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-50 transition-colors"
                              >
                                <i className="ri-edit-line text-sm"></i>
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                disabled={deletingNote}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-100 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition-colors"
                              >
                                <i className={deletingNote ? 'ri-loader-4-line animate-spin text-sm' : 'ri-delete-bin-line text-sm'}></i>
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="hidden">
              <i className="ri-time-line"></i>
              <span>{notePopup.created_at.slice(0, 10)}</span>
              <span className="text-gray-300">·</span>
              <span>{notePopup.ticket_ref}</span>
              <button
                onClick={() => handleDeleteNote('legacy')}
                disabled={deletingNote}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100 disabled:opacity-50 transition-colors"
              >
                <i className={deletingNote ? 'ri-loader-4-line animate-spin text-sm' : 'ri-delete-bin-line text-sm'}></i>
                {deletingNote ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Popup */}
      {evidencePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => { setEvidencePopup(null); setPreviewEvidenceFile(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 bg-emerald-700 text-white">
              <div className="flex items-center gap-2">
                <i className="ri-attachment-2 text-lg"></i>
                <span className="font-semibold">Evidence Files</span>
                <span className="text-emerald-300">· {evidencePopup.ticket_ref}</span>
              </div>
              <button onClick={() => { setEvidencePopup(null); setPreviewEvidenceFile(null); }} className="text-white/70 hover:text-white transition-colors">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <div className="px-5 py-4">
              {loadingEvidencePopup ? (
                <div className="flex justify-center py-6">
                  <i className="ri-loader-4-line animate-spin text-xl text-emerald-500"></i>
                </div>
              ) : evidencePopupFiles.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-4">No files uploaded yet.</p>
              ) : (
                <ul className="space-y-2">
                  {evidencePopupFiles.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2.5">
                      <i className="ri-file-line text-emerald-500 text-lg shrink-0"></i>
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => setPreviewEvidenceFile(f)}
                          className="block max-w-full truncate text-left text-sm font-medium text-gray-800 hover:text-emerald-700"
                        >
                          {f.original_name}
                        </button>
                        <p className="text-xs text-gray-400">{f.uploaded_at.slice(0, 10)}</p>
                      </div>
                      <button
                        onClick={() => setPreviewEvidenceFile(f)}
                        className="text-emerald-600 hover:text-emerald-800 shrink-0"
                        title="Preview"
                      >
                        <i className="ri-eye-line text-sm"></i>
                      </button>
                      <a
                        href={f.download_url || f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-600 hover:text-emerald-800 shrink-0"
                        title="Download"
                      >
                        <i className="ri-download-line text-sm"></i>
                      </a>
                      <button
                        onClick={() => handleDeleteEvidenceFile(evidencePopup.id, f.id)}
                        className="text-gray-300 hover:text-rose-500 transition-colors shrink-0"
                        title="Delete"
                      >
                        <i className="ri-delete-bin-line text-sm"></i>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-5 pb-4 flex justify-end">
              <button onClick={() => { setEvidencePopup(null); setPreviewEvidenceFile(null); }} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Preview Modal */}
      {previewEvidenceFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setPreviewEvidenceFile(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2 min-w-0">
                <i className="ri-eye-line text-emerald-600 text-lg shrink-0"></i>
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 text-sm">Evidence Preview</h3>
                  <p className="text-xs text-gray-400 truncate">{previewEvidenceFile.original_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewEvidenceFile.download_url || previewEvidenceFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 transition-colors"
                >
                  <i className="ri-download-line text-sm"></i> Download
                </a>
                <button onClick={() => setPreviewEvidenceFile(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-gray-50 p-4">
              {getEvidencePreviewType(previewEvidenceFile) === 'image' ? (
                <img
                  src={previewEvidenceFile.preview_url || previewEvidenceFile.url}
                  alt={previewEvidenceFile.original_name}
                  className="mx-auto max-h-[70vh] max-w-full rounded-lg border border-gray-200 bg-white object-contain"
                />
              ) : getEvidencePreviewType(previewEvidenceFile) === 'pdf' ? (
                <iframe
                  src={previewEvidenceFile.preview_url || previewEvidenceFile.url}
                  title={previewEvidenceFile.original_name}
                  className="h-[70vh] w-full rounded-lg border border-gray-200 bg-white"
                />
              ) : getEvidencePreviewType(previewEvidenceFile) === 'sheet' ? (
                <div className="h-[70vh] overflow-auto rounded-lg border border-gray-200 bg-white">
                  {loadingSheetPreview ? (
                    <div className="flex h-full items-center justify-center">
                      <i className="ri-loader-4-line animate-spin text-2xl text-emerald-500"></i>
                    </div>
                  ) : sheetPreviewError ? (
                    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                      <i className="ri-file-excel-2-line text-4xl text-gray-300 mb-3"></i>
                      <p className="text-sm font-medium text-gray-700">{sheetPreviewError}</p>
                      <p className="mt-1 text-xs text-gray-400">Use Download to open the full file.</p>
                    </div>
                  ) : sheetPreviewRows.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                      <i className="ri-file-excel-2-line text-4xl text-gray-300 mb-3"></i>
                      <p className="text-sm font-medium text-gray-700">No spreadsheet rows to preview.</p>
                    </div>
                  ) : (
                    <table className="min-w-full border-collapse text-xs">
                      <tbody>
                        {sheetPreviewRows.map((row, rowIndex) => (
                          <tr key={rowIndex} className={rowIndex === 0 ? 'bg-emerald-50 font-semibold text-gray-800' : 'odd:bg-white even:bg-gray-50'}>
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex} className="max-w-[220px] border border-gray-200 px-3 py-2 text-gray-700">
                                <span className="block truncate" title={cell}>{cell || '-'}</span>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : (
                <div className="flex min-h-[45vh] flex-col items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-10 text-center">
                  <i className="ri-file-line text-4xl text-gray-300 mb-3"></i>
                  <p className="text-sm font-medium text-gray-700">Preview is not available for this file type.</p>
                  <p className="mt-1 text-xs text-gray-400">Use Download to open it on your device.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Archived Tickets Panel */}
      {showArchivedPanel && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setShowArchivedPanel(false)}>
          <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
                  <i className="ri-archive-line text-gray-500 text-lg"></i>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Archived Tickets</h3>
                  <p className="text-xs text-gray-400">{archivedTickets.length} ticket{archivedTickets.length !== 1 ? 's' : ''} archived</p>
                </div>
              </div>
              <button onClick={() => setShowArchivedPanel(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingArchived ? (
                <div className="flex justify-center py-16">
                  <i className="ri-loader-4-line animate-spin text-2xl text-gray-400"></i>
                </div>
              ) : archivedTickets.length === 0 ? (
                <div className="rounded-xl bg-gray-50 border border-gray-100 px-6 py-10 text-center">
                  <i className="ri-archive-line text-3xl text-gray-300 mb-2 block"></i>
                  <p className="text-sm text-gray-400">No archived tickets.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {archivedTickets.map((t) => (
                    <div key={t.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold text-violet-600">{t.ticket_ref}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RISK_COLORS[t.risk]}`}>{t.risk}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 truncate">{t.tutor_name}</p>
                        <p className="text-xs text-gray-400">{t.session_date?.slice(0, 10)} · {t.checklist_item_name?.slice(0, 50)}</p>
                      </div>
                      <button
                        onClick={() => handleRestoreFromArchive(t.id)}
                        className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 hover:border-violet-300 hover:text-violet-700 transition-colors shrink-0"
                        title="Restore"
                      >
                        <i className="ri-arrow-go-back-line text-sm"></i> Restore
                      </button>
                      <button
                        onClick={() => handlePermanentDelete(t.id)}
                        className="flex items-center gap-1 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-100 transition-colors shrink-0"
                        title="Delete permanently"
                      >
                        <i className="ri-delete-bin-line text-sm"></i> Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Ticket Modal */}
      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEditModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <i className="ri-edit-line text-violet-600 text-lg"></i>
                <div>
                  <h3 className="font-semibold text-gray-900">Edit Ticket</h3>
                  <p className="text-xs text-gray-400">{editModal.ticket_ref} · {editModal.tutor_name}</p>
                </div>
              </div>
              <button onClick={() => setEditModal(null)} className="text-gray-400 hover:text-gray-600">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tutor Name</label>
                  <input
                    value={editForm.tutor_name || ''}
                    onChange={(e) => setEditForm((f) => ({ ...f, tutor_name: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Session Date</label>
                  <input
                    type="date"
                    value={(editForm.session_date || '').slice(0, 10)}
                    onChange={(e) => setEditForm((f) => ({ ...f, session_date: e.target.value }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Session Subject</label>
                <input
                  value={editForm.session_subject || ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, session_subject: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Issue Type</label>
                  <select
                    value={editForm.issue_type || 'manual'}
                    onChange={(e) => setEditForm((f) => ({ ...f, issue_type: e.target.value as Ticket['issue_type'] }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="not_met">Not Met</option>
                    <option value="partially_met">Partially Met</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Risk</label>
                  <select
                    value={editForm.risk || 'amber'}
                    onChange={(e) => setEditForm((f) => ({ ...f, risk: e.target.value as Ticket['risk'] }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="red">Red</option>
                    <option value="amber">Amber</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select
                    value={editForm.status || 'open'}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value as Ticket['status'] }))}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="open">Open</option>
                    <option value="in_review">In Review</option>
                    <option value="resolved">Resolved</option>
                    <option value="dismissed">Dismissed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Assigned To</label>
                <input
                  value={editForm.assigned_to || ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, assigned_to: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="Assign to..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Case Note</label>
                <textarea
                  value={editForm.description || ''}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                  placeholder="Case notes..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button onClick={() => setEditModal(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function ViewTicketModal({
  ticket,
  updatingId,
  onClose,
  onStatusChange,
  apiBase,
}: {
  ticket: Ticket;
  updatingId: number | null;
  onClose: () => void;
  onStatusChange: (id: number, status: string) => void;
  apiBase: string;
}) {
  const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);

  useEffect(() => {
    setLoadingFiles(true);
    axios.get(`${apiBase}/api/tickets/${ticket.id}/evidence/`)
      .then((r) => setFiles(r.data))
      .catch(() => setFiles([]))
      .finally(() => setLoadingFiles(false));
  }, [ticket.id, apiBase]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>

        <div className={`px-6 py-4 flex items-center justify-between ${ticket.risk === 'red' ? 'bg-rose-600' : 'bg-amber-500'}`}>
          <div className="flex items-center gap-3">
            <i className="ri-ticket-2-line text-white text-xl"></i>
            <div>
              <p className="text-white/70 text-xs font-medium uppercase tracking-wider">Ticket</p>
              <p className="text-white font-bold text-lg leading-tight">{ticket.ticket_ref}</p>
            </div>
            <span className="ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold bg-white/20 text-white uppercase">{ticket.risk}</span>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[ticket.status]}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[ticket.status]}`}></span>
              {STATUS_LABELS[ticket.status]}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
              ticket.issue_type === 'not_met' ? 'bg-rose-100 text-rose-700' :
              ticket.issue_type === 'partially_met' ? 'bg-amber-100 text-amber-700' :
              'bg-gray-100 text-gray-600'}`}>
              {ISSUE_LABELS[ticket.issue_type]}
            </span>
            <span className="rounded-full px-3 py-1 text-xs font-medium bg-gray-100 text-gray-500">
              {ticket.source === 'system' ? 'System generated' : 'Manual'}
            </span>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
            <div className="flex items-start gap-3 px-4 py-3">
              <i className="ri-user-line text-violet-400 mt-0.5"></i>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Tutor</p>
                <p className="text-sm font-semibold text-gray-800">{ticket.tutor_name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-3">
              <i className="ri-checkbox-multiple-line text-violet-400 mt-0.5"></i>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Checklist Item</p>
                <p className="text-sm text-gray-800">{ticket.checklist_item_name || '—'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
            <div className="flex items-start gap-3 px-4 py-3">
              <i className="ri-calendar-line text-blue-400 mt-0.5"></i>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Session Date</p>
                <p className="text-sm text-gray-800">{ticket.session_date?.slice(0, 10) || '—'}</p>
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-3">
              <i className="ri-book-open-line text-blue-400 mt-0.5"></i>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Subject</p>
                <p className="text-sm text-gray-800">{ticket.session_subject || '—'}</p>
              </div>
            </div>
            {ticket.assigned_to && (
              <div className="flex items-start gap-3 px-4 py-3">
                <i className="ri-user-follow-line text-blue-400 mt-0.5"></i>
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Assigned To</p>
                  <p className="text-sm text-gray-800">{ticket.assigned_to}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3 px-4 py-3">
              <i className="ri-time-line text-blue-400 mt-0.5"></i>
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Created</p>
                <p className="text-sm text-gray-800">{ticket.created_at.slice(0, 10)}</p>
              </div>
            </div>
          </div>

          {/* QA System Evidence (read-only checklist data) */}
          {ticket.evidence && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <i className="ri-attachment-2 text-emerald-600"></i>
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">QA Evidence</p>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{ticket.evidence}</p>
            </div>
          )}

          {/* Uploaded Evidence Files */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <div className="flex items-center gap-2 mb-3">
              <i className="ri-file-upload-line text-violet-500"></i>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Uploaded Files</p>
            </div>
            {loadingFiles ? (
              <div className="flex justify-center py-3">
                <i className="ri-loader-4-line animate-spin text-lg text-emerald-400"></i>
              </div>
            ) : files.length === 0 ? (
              <p className="text-xs text-gray-400">No files uploaded yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 rounded-lg bg-white border border-gray-100 px-3 py-2">
                    <i className="ri-file-line text-emerald-500 shrink-0"></i>
                    <span className="text-xs text-gray-700 truncate flex-1">{f.original_name}</span>
                    <span className="text-xs text-gray-400 shrink-0">{f.uploaded_at.slice(0, 10)}</span>
                    <a href={f.download_url || f.url} target="_blank" rel="noreferrer" className="text-emerald-600 hover:text-emerald-800 shrink-0" title="Download">
                      <i className="ri-download-line text-sm"></i>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Case Note */}
          {ticket.description && (
            <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <i className="ri-chat-1-line text-violet-600"></i>
                <p className="text-xs font-semibold text-violet-700 uppercase tracking-wider">Case Note</p>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center px-6 py-4 border-t border-gray-100 bg-gray-50">
          <StatusDropdown
            value={ticket.status}
            disabled={updatingId === ticket.id}
            onChange={(v) => onStatusChange(ticket.id, v)}
          />
          <button onClick={onClose} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-gray-400 uppercase font-medium w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-gray-800">{value}</span>
    </div>
  );
}

const STATUS_DOT: Record<string, string> = {
  open:       'bg-blue-500',
  in_review:  'bg-amber-500',
  resolved:   'bg-emerald-500',
  dismissed:  'bg-gray-400',
};

const STATUS_ITEM_COLORS: Record<string, string> = {
  open:       'text-blue-700 hover:bg-blue-50',
  in_review:  'text-amber-700 hover:bg-amber-50',
  resolved:   'text-emerald-700 hover:bg-emerald-50',
  dismissed:  'text-gray-500 hover:bg-gray-50',
};

function StatusBadge({ value, loading }: { value: string; loading?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_COLORS[value]} ${loading ? 'opacity-60' : ''}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[value]}`}></span>
      {STATUS_LABELS[value]}
      {loading && <i className="ri-loader-4-line animate-spin text-xs"></i>}
    </span>
  );
}

function StatusDropdown({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors
          ${STATUS_COLORS[value]} ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[value]}`}></span>
        {STATUS_LABELS[value]}
        {!disabled && <i className="ri-arrow-down-s-line text-xs opacity-60"></i>}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-36 rounded-xl border border-gray-100 bg-white shadow-xl py-1 overflow-hidden">
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <button
              key={v}
              onClick={() => { onChange(v); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${STATUS_ITEM_COLORS[v]} ${v === value ? 'font-semibold' : ''}`}
            >
              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[v]}`}></span>
              {l}
              {v === value && <i className="ri-check-line ml-auto text-sm"></i>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AssignedToCell({
  value,
  editing,
  onEdit,
  onCancel,
  onSave,
}: {
  value: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (editing) setDraft(value);
  }, [editing, value]);

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onSave(draft.trim())}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSave(draft.trim());
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="Assign to..."
        className="h-8 w-36 rounded-lg border border-violet-200 bg-white px-2 text-xs text-gray-700 placeholder-gray-300 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100"
      />
    );
  }

  if (!value) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="inline-flex h-8 w-36 items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-2 text-left text-xs text-gray-400 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-600"
      >
        <span>Assign to...</span>
        <i className="ri-edit-line text-sm"></i>
      </button>
    );
  }

  return (
    <div className="inline-flex h-8 max-w-40 items-center gap-2 rounded-full border border-violet-100 bg-violet-50 px-2.5 text-xs font-medium text-violet-700">
      <span className="truncate">{value}</span>
      <button
        type="button"
        onClick={onEdit}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-violet-500 hover:bg-white hover:text-violet-700"
        title="Edit assignee"
        aria-label="Edit assignee"
      >
        <i className="ri-edit-line text-xs"></i>
      </button>
    </div>
  );
}

function SimpleDropdown({
  options,
  value,
  onChange,
  placeholder,
  icon,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = options.find((o) => o.value === value);
  const label = selected ? selected.label : placeholder;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500 min-w-[140px]"
      >
        <span className="flex items-center gap-1.5 truncate">
          {icon && <i className={`${icon} text-gray-400 text-xs`}></i>}
          <span className={value !== 'all' ? 'font-medium text-violet-700' : ''}>{label}</span>
        </span>
        <i className={`ri-arrow-down-s-line text-gray-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}></i>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-52 rounded-xl border border-gray-200 bg-white shadow-xl">
          <ul className="py-1">
            {options.map((opt) => (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-violet-50 transition-colors flex items-center justify-between gap-2 ${
                    value === opt.value ? 'font-semibold text-violet-600 bg-violet-50' : 'text-gray-700'
                  }`}
                >
                  <span>{opt.label}</span>
                  {value === opt.value && <i className="ri-check-line text-violet-600 shrink-0"></i>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function DatePickerField({
  label,
  value,
  onChange,
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => value ? parseDate(value) : new Date());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (value) setViewDate(parseDate(value));
  }, [value]);

  const monthStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const firstWeekday = monthStart.getDay();
  const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
  const previousMonthDays = new Date(viewDate.getFullYear(), viewDate.getMonth(), 0).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const dayNumber = index - firstWeekday + 1;
    const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), dayNumber);
    const inCurrentMonth = dayNumber >= 1 && dayNumber <= daysInMonth;
    const labelNumber = inCurrentMonth
      ? dayNumber
      : dayNumber < 1
      ? previousMonthDays + dayNumber
      : dayNumber - daysInMonth;
    return { date, inCurrentMonth, labelNumber };
  });

  const selected = value ? parseDate(value) : null;
  const minDate = min ? parseDate(min) : null;
  const displayValue = value ? formatDisplayDate(value) : 'mm/dd/yyyy';
  const monthLabel = viewDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' });

  const moveMonth = (delta: number) => {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const selectDate = (date: Date) => {
    onChange(formatDateInput(date));
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative min-w-[150px]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`relative h-11 w-full rounded-lg border bg-white pl-8 pr-9 text-left text-sm shadow-sm transition-colors hover:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500 ${
          open ? 'border-violet-400 ring-2 ring-violet-100' : 'border-gray-200'
        }`}
      >
        <span className="absolute left-8 top-1 text-[9px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
        <i className="ri-calendar-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
        <span className={`block pt-3 ${value ? 'text-gray-800' : 'text-gray-400'}`}>{displayValue}</span>
        <i className={`ri-arrow-down-s-line absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}></i>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-violet-100 bg-white p-3 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-violet-50 hover:text-violet-700"
            >
              <i className="ri-arrow-left-s-line text-lg"></i>
            </button>
            <div className="text-sm font-semibold text-gray-900">{monthLabel}</div>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-violet-50 hover:text-violet-700"
            >
              <i className="ri-arrow-right-s-line text-lg"></i>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase text-gray-400">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <div key={day} className="py-1">{day}</div>
            ))}
          </div>

          <div className="mt-1 grid grid-cols-7 gap-1">
            {cells.map(({ date, inCurrentMonth, labelNumber }) => {
              const iso = formatDateInput(date);
              const isSelected = selected ? sameDay(date, selected) : false;
              const isToday = sameDay(date, new Date());
              const disabled = minDate ? date < minDate : false;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDate(date)}
                  className={`flex h-8 items-center justify-center rounded-lg text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-violet-600 text-white shadow-sm'
                      : disabled
                      ? 'cursor-not-allowed text-gray-200'
                      : inCurrentMonth
                      ? 'text-gray-700 hover:bg-violet-50 hover:text-violet-700'
                      : 'text-gray-300 hover:bg-gray-50'
                  } ${isToday && !isSelected ? 'ring-1 ring-violet-200' : ''}`}
                >
                  {labelNumber}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => selectDate(new Date())}
              className="rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TutorDropdown({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = options.filter((n) => n.toLowerCase().includes(search.toLowerCase()));
  const label = value === 'all' ? 'All Tutors' : value;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setSearch(''); }}
        className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 hover:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500 min-w-[160px] max-w-[220px]"
      >
        <span className="truncate">{label}</span>
        <i className={`ri-arrow-down-s-line text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}></i>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-64 rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tutor..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 pl-7 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                onClick={() => { onChange('all'); setOpen(false); }}
                className={`w-full px-3 py-2 text-left text-sm hover:bg-violet-50 transition-colors ${value === 'all' ? 'font-semibold text-violet-600 bg-violet-50' : 'text-gray-700'}`}
              >
                All Tutors
              </button>
            </li>
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-xs text-gray-400 text-center">No results</li>
            )}
            {filtered.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => { onChange(name); setOpen(false); }}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-violet-50 transition-colors flex items-center gap-2 ${value === name ? 'font-semibold text-violet-600 bg-violet-50' : 'text-gray-700'}`}
                >
                  <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-600 text-xs font-bold flex items-center justify-center shrink-0">
                    {name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">{name}</span>
                  {value === name && <i className="ri-check-line ml-auto text-violet-600 shrink-0"></i>}
                </button>
              </li>
            ))}
          </ul>
          {options.length > 0 && (
            <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-400">
              {filtered.length} of {options.length} tutors
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value: string) {
  const date = parseDate(value);
  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
