from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.db import IntegrityError
from django.http import FileResponse
from django.views.decorators.clickjacking import xframe_options_exempt
from .models import Ticket, TicketAction, TicketEvidence, TicketNote
from .serializers import TicketActionSerializer, TicketSerializer, TicketNoteSerializer


import csv
import io
import mimetypes
import re as _re
import zipfile
import xml.etree.ElementTree as ET

def _normalize_trainer_name(name: str) -> str:
    """Strip academic title prefixes and normalize spacing/casing."""
    name = name.strip()
    # Remove leading titles: "Dr.", "Dr ", "Prof.", "Prof "
    name = _re.sub(r'^(Dr\.?\s+|Prof\.?\s+)', '', name, flags=_re.IGNORECASE).strip()
    # Title-case each word
    name = ' '.join(w.capitalize() for w in name.split())
    return name


def _build_evidence_payload(request, ticket, evidence):
    return {
        'id': evidence.id,
        'original_name': evidence.original_name,
        'url': request.build_absolute_uri(evidence.file.url),
        'preview_url': request.build_absolute_uri(f'/api/tickets/{ticket.pk}/evidence/{evidence.pk}/preview/'),
        'download_url': request.build_absolute_uri(f'/api/tickets/{ticket.pk}/evidence/{evidence.pk}/download/'),
        'sheet_preview_url': request.build_absolute_uri(f'/api/tickets/{ticket.pk}/evidence/{evidence.pk}/sheet-preview/'),
        'uploaded_at': evidence.uploaded_at.isoformat(),
    }


def _xlsx_cell_value(cell, shared_strings):
    value_node = cell.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
    if value_node is None or value_node.text is None:
        return ''
    value = value_node.text
    if cell.attrib.get('t') == 's':
        try:
            return shared_strings[int(value)]
        except (IndexError, ValueError):
            return ''
    return value


def _xlsx_preview_rows(file_obj, limit=30):
    file_obj.seek(0)
    with zipfile.ZipFile(file_obj) as archive:
        shared_strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            root = ET.fromstring(archive.read('xl/sharedStrings.xml'))
            for item in root.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}si'):
                texts = [node.text or '' for node in item.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')]
                shared_strings.append(''.join(texts))

        sheet_names = [name for name in archive.namelist() if name.startswith('xl/worksheets/sheet') and name.endswith('.xml')]
        if not sheet_names:
            return []

        root = ET.fromstring(archive.read(sorted(sheet_names)[0]))
        rows = []
        for row in root.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}row')[:limit]:
            rows.append([
                _xlsx_cell_value(cell, shared_strings)
                for cell in row.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c')
            ])
        return rows


@api_view(['GET'])
@permission_classes([AllowAny])
def list_tickets(request):
    include_archived = request.GET.get('archived') == 'true'
    qs = Ticket.objects.filter(is_archived=True) if include_archived else Ticket.objects.filter(is_archived=False)

    if not include_archived:
        tutor = request.GET.get('tutor_name')
        ticket_status = request.GET.get('status')
        risk = request.GET.get('risk')
        issue_type = request.GET.get('issue_type')
        source = request.GET.get('source')
        if tutor:
            qs = qs.filter(tutor_name__icontains=tutor)
        if ticket_status:
            qs = qs.filter(status=ticket_status)
        if risk:
            qs = qs.filter(risk=risk)
        if issue_type:
            qs = qs.filter(issue_type=issue_type)
        if source:
            qs = qs.filter(source=source)

    serializer = TicketSerializer(qs, many=True)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([AllowAny])
def create_ticket(request):
    serializer = TicketSerializer(data=request.data)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH', 'DELETE'])
@permission_classes([AllowAny])
def ticket_detail(request, pk):
    try:
        ticket = Ticket.objects.get(pk=pk)
    except Ticket.DoesNotExist:
        return Response({'error': 'Ticket not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'DELETE':
        ticket.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = TicketSerializer(ticket, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def sync_tickets(request):
    """
    Auto-create tickets from session checklist data.
    Body: { tutor_name, sessions: [{session_id, session_date, session_subject,
            group_name, checklist: [{code, item, status, evidence}]}] }
    """
    try:
        tutor_name = request.data.get('tutor_name', '').strip()
        sessions = request.data.get('sessions', [])

        if not tutor_name:
            return Response({'error': 'tutor_name is required'}, status=status.HTTP_400_BAD_REQUEST)

        created_count = 0
        skipped_count = 0

        for session in sessions:
            session_id = str(session.get('session_id', ''))
            session_date = str(session.get('session_date', '') or '')[:50]
            session_subject = str(session.get('session_subject', '') or '')[:300]
            group_name = str(session.get('group_name', '') or '')[:200]
            checklist = session.get('checklist', [])

            for item in checklist:
                item_status = item.get('status', '')
                if item_status not in ('Not Met', 'Partial'):
                    continue

                issue_type = 'not_met' if item_status == 'Not Met' else 'partially_met'
                risk = 'red' if item_status == 'Not Met' else 'amber'
                code = str(item.get('code', '') or '')[:100]
                item_name = str(item.get('item', code) or code)[:300]
                evidence = str(item.get('evidence', '') or '')

                existing = Ticket.objects.filter(
                    tutor_name=tutor_name,
                    session_id=session_id,
                    checklist_item_code=code,
                ).first()

                if existing:
                    skipped_count += 1
                    continue

                try:
                    Ticket.objects.create(
                        tutor_name=tutor_name[:200],
                        session_id=session_id[:200],
                        session_date=session_date,
                        session_subject=session_subject,
                        group_name=group_name,
                        checklist_item_code=code,
                        checklist_item_name=item_name,
                        issue_type=issue_type,
                        risk=risk,
                        evidence=evidence,
                        source='system',
                        status='open',
                    )
                    created_count += 1
                except IntegrityError:
                    skipped_count += 1

        return Response({'created': created_count, 'skipped': skipped_count})

    except Exception as exc:
        import traceback
        return Response(
            {'error': str(exc), 'detail': traceback.format_exc()},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def sync_all_tickets(request):
    """
    Scan the entire QA database and auto-create tickets for every
    Not Met / Partial checklist item across all tutors.
    Optional query param: ?month=YYYY-MM to restrict to a specific month.
    """
    try:
        import os
        from django.db import connection as db_conn

        # Optional month filter e.g. "2026-06"
        month_filter = (request.query_params.get('month') or '').strip()[:7]

        qa_schema = os.getenv('QA_TABLE_SCHEMA', 'public')
        qa_table = os.getenv('QA_TABLE_NAME', 'qa_doctors_sessions')
        checklist_table = os.getenv('QA_CHECKLIST_TABLE_NAME', 'qa_doctors_checklist_items')
        qa_table_q = f'"{qa_schema}"."{qa_table}"'
        checklist_q = f'"{qa_schema}"."{checklist_table}"'

        def pick_col(cols, candidates):
            cols_lower = {c.lower(): c for c in cols}
            for cand in candidates:
                if cand.lower() in cols_lower:
                    return cols_lower[cand.lower()]
            return None

        with db_conn.cursor() as cursor:
            cursor.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_schema=%s AND table_name=%s",
                [qa_schema, checklist_table],
            )
            checklist_cols = [r[0] for r in cursor.fetchall()]

            cursor.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_schema=%s AND table_name=%s",
                [qa_schema, qa_table],
            )
            session_cols = [r[0] for r in cursor.fetchall()]

        if not checklist_cols or not session_cols:
            return Response({'error': 'QA tables not found'}, status=status.HTTP_400_BAD_REQUEST)

        c_session_id = pick_col(checklist_cols, ['session_id'])
        c_status     = pick_col(checklist_cols, ['status'])
        c_code       = pick_col(checklist_cols, ['checklist_code', 'checklist_item_code', 'code'])
        c_item       = pick_col(checklist_cols, ['checklist_item', 'item', 'label', 'name'])
        c_evidence   = pick_col(checklist_cols, ['evidence'])

        kbc_doctor_col = os.getenv('KBC_DOCTOR_COLUMN', '')
        trainer_candidates = ([kbc_doctor_col] if kbc_doctor_col else []) + [
            'trainer', 'tutor_name', 'tutor', 'LMS__Tutor Name', 'coach', 'instructor'
        ]

        s_session_id  = pick_col(session_cols, ['session_id'])
        s_trainer     = pick_col(session_cols, trainer_candidates)
        s_date        = pick_col(session_cols, ['date'])
        s_subject     = pick_col(session_cols, ['subject', 'hg_subject'])
        s_cancelled   = pick_col(session_cols, ['cancelled_session', 'cancelled', 'is_cancelled'])

        if not c_session_id or not c_status or not s_session_id or not s_trainer:
            return Response({'error': 'Required columns not found in QA tables'}, status=status.HTTP_400_BAD_REQUEST)

        code_expr      = f'c."{c_code}"'    if c_code     else (f'c."{c_item}"' if c_item else 'NULL')
        item_expr      = f'c."{c_item}"'    if c_item     else 'NULL'
        evidence_expr  = f'c."{c_evidence}"' if c_evidence else 'NULL'
        date_expr      = f's."{s_date}"'    if s_date     else 'NULL'
        subject_expr   = f's."{s_subject}"' if s_subject  else 'NULL'
        # Filter out cancelled sessions if column exists
        cancelled_filter = (
            f"AND COALESCE(LOWER(TRIM(CAST(s.\"{s_cancelled}\" AS text))), '') NOT IN ('true', '1', 'yes')"
            if s_cancelled else ''
        )

        with db_conn.cursor() as cursor:
            cursor.execute(f"""
                SELECT
                    TRIM(CAST(c."{c_session_id}" AS text)) AS session_id,
                    c."{c_status}"                          AS raw_status,
                    {code_expr}                             AS code,
                    {item_expr}                             AS item_name,
                    {evidence_expr}                         AS evidence,
                    TRIM(CAST(s."{s_trainer}" AS text))     AS trainer,
                    {date_expr}                             AS session_date,
                    {subject_expr}                          AS subject
                FROM {checklist_q} c
                LEFT JOIN {qa_table_q} s
                    ON TRIM(CAST(c."{c_session_id}" AS text)) = TRIM(CAST(s."{s_session_id}" AS text))
                WHERE LOWER(TRIM(c."{c_status}")) IN ('not met', 'partial', 'partially met')
                  AND LOWER(TRIM(CAST(s."{s_trainer}" AS text))) NOT IN (
                      'session not delivered', 'not delivered',
                      'session cancelled', 'session canceled',
                      'cancelled', 'canceled', ''
                  )
                  AND COALESCE(TRIM(CAST(s."{s_trainer}" AS text)), '') <> ''
                  {f"AND CAST({date_expr} AS text) LIKE '{month_filter}%'" if month_filter else ''}
                  {cancelled_filter}
                ORDER BY {date_expr} DESC NULLS LAST
            """)
            rows = cursor.fetchall()

        created_count = 0
        skipped_count = 0

        for session_id, raw_status, code, item_name, evidence, trainer, session_date, subject in rows:
            if not trainer or not session_id:
                skipped_count += 1
                continue

            raw_lower = (raw_status or '').lower().strip()
            issue_type = 'not_met' if raw_lower == 'not met' else 'partially_met'
            risk       = 'red'     if issue_type == 'not_met' else 'amber'

            code       = str(code or item_name or '')[:100]
            item_name  = str(item_name or code)[:300]
            evidence   = str(evidence or '')
            trainer    = _normalize_trainer_name(str(trainer))[:200]
            session_id = str(session_id)[:200]
            session_date = str(session_date or '')[:50]
            subject    = str(subject or '')[:300]

            if not code:
                skipped_count += 1
                continue

            if Ticket.objects.filter(
                tutor_name=trainer,
                session_id=session_id,
                checklist_item_code=code,
            ).exists() or Ticket.objects.filter(
                tutor_name=trainer,
                session_id=session_id,
                checklist_item_name=item_name.strip(),
            ).exists():
                skipped_count += 1
                continue

            try:
                Ticket.objects.create(
                    tutor_name=trainer,
                    session_id=session_id,
                    session_date=session_date,
                    session_subject=subject,
                    checklist_item_code=code,
                    checklist_item_name=item_name,
                    issue_type=issue_type,
                    risk=risk,
                    evidence=evidence,
                    source='system',
                    status='open',
                )
                created_count += 1
            except Exception:
                skipped_count += 1

        return Response({'created': created_count, 'skipped': skipped_count, 'total_rows': len(rows)})

    except Exception as exc:
        import traceback
        return Response(
            {'error': str(exc), 'detail': traceback.format_exc()},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['DELETE'])
@permission_classes([AllowAny])
def delete_by_month(request):
    """
    Delete all tickets whose session_date does NOT start with the given month.
    Query param: keep_month=YYYY-MM
    """
    keep_month = (request.query_params.get('keep_month') or '').strip()
    if not keep_month or len(keep_month) != 7:
        return Response({'error': 'keep_month param required (YYYY-MM)'}, status=status.HTTP_400_BAD_REQUEST)

    deleted_qs = Ticket.objects.exclude(session_date__startswith=keep_month)
    count, _ = deleted_qs.delete()
    return Response({'deleted': count, 'kept_month': keep_month})


@api_view(['GET'])
@permission_classes([AllowAny])
def ticket_count(request):
    """Return open ticket counts per tutor or globally."""
    tutor = request.GET.get('tutor_name')
    qs = Ticket.objects.filter(status='open')
    if tutor:
        qs = qs.filter(tutor_name__icontains=tutor)
    return Response({'open_count': qs.count()})


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def ticket_evidence_list(request, ticket_pk):
    try:
        ticket = Ticket.objects.get(pk=ticket_pk)
    except Ticket.DoesNotExist:
        return Response({'error': 'Ticket not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        files = ticket.evidence_files.all()
        data = [_build_evidence_payload(request, ticket, f) for f in files]
        return Response(data)

    # POST - upload file
    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

    ev = TicketEvidence.objects.create(
        ticket=ticket,
        file=file,
        original_name=file.name,
    )
    return Response(_build_evidence_payload(request, ticket, ev), status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
@permission_classes([AllowAny])
def ticket_evidence_delete(request, ticket_pk, evidence_pk):
    try:
        ev = TicketEvidence.objects.get(pk=evidence_pk, ticket_id=ticket_pk)
    except TicketEvidence.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
    ev.file.delete(save=False)
    ev.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([AllowAny])
def ticket_evidence_download(request, ticket_pk, evidence_pk):
    try:
        ev = TicketEvidence.objects.get(pk=evidence_pk, ticket_id=ticket_pk)
    except TicketEvidence.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    return FileResponse(ev.file.open('rb'), as_attachment=True, filename=ev.original_name)


@xframe_options_exempt
@api_view(['GET'])
@permission_classes([AllowAny])
def ticket_evidence_preview(request, ticket_pk, evidence_pk):
    try:
        ev = TicketEvidence.objects.get(pk=evidence_pk, ticket_id=ticket_pk)
    except TicketEvidence.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    content_type = mimetypes.guess_type(ev.original_name)[0] or 'application/octet-stream'
    response = FileResponse(ev.file.open('rb'), as_attachment=False, filename=ev.original_name, content_type=content_type)
    response['Content-Disposition'] = f'inline; filename="{ev.original_name}"'
    return response


@api_view(['GET'])
@permission_classes([AllowAny])
def ticket_evidence_sheet_preview(request, ticket_pk, evidence_pk):
    try:
        ev = TicketEvidence.objects.get(pk=evidence_pk, ticket_id=ticket_pk)
    except TicketEvidence.DoesNotExist:
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    ext = ev.original_name.rsplit('.', 1)[-1].lower() if '.' in ev.original_name else ''
    try:
        if ext == 'xlsx':
            rows = _xlsx_preview_rows(ev.file.open('rb'))
        elif ext == 'csv':
            ev.file.open('rb').seek(0)
            text = ev.file.read().decode('utf-8-sig', errors='replace')
            rows = list(csv.reader(io.StringIO(text)))[:30]
        else:
            return Response({'error': 'Preview is only available for .xlsx and .csv files.'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as exc:
        return Response({'error': f'Could not preview this spreadsheet: {exc}'}, status=status.HTTP_400_BAD_REQUEST)

    return Response({'rows': rows})


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def ticket_note_list(request, ticket_pk):
    try:
        ticket = Ticket.objects.get(pk=ticket_pk)
    except Ticket.DoesNotExist:
        return Response({'error': 'Ticket not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        notes = []
        if (ticket.description or '').strip():
            notes.append({
                'id': 'legacy',
                'text': ticket.description,
                'created_by': None,
                'created_at': ticket.created_at.isoformat(),
                'is_legacy': True,
            })
        notes.extend([
            {
                **TicketNoteSerializer(note).data,
                'is_legacy': False,
            }
            for note in ticket.notes.all()
        ])
        return Response(notes)

    serializer = TicketNoteSerializer(data=request.data)
    if serializer.is_valid():
        note = serializer.save(ticket=ticket)
        return Response({
            **TicketNoteSerializer(note).data,
            'is_legacy': False,
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['PATCH', 'DELETE'])
@permission_classes([AllowAny])
def ticket_note_delete(request, ticket_pk, note_pk):
    try:
        ticket = Ticket.objects.get(pk=ticket_pk)
    except Ticket.DoesNotExist:
        return Response({'error': 'Ticket not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'PATCH':
        text = (request.data.get('text') or '').strip()
        if not text:
            return Response({'text': ['This field may not be blank.']}, status=status.HTTP_400_BAD_REQUEST)

        if note_pk == 'legacy':
            ticket.description = text
            ticket.save(update_fields=['description', 'updated_at'])
            return Response({
                'id': 'legacy',
                'text': ticket.description,
                'created_by': None,
                'created_at': ticket.created_at.isoformat(),
                'is_legacy': True,
            })

        try:
            note = TicketNote.objects.get(pk=note_pk, ticket_id=ticket_pk)
        except (TicketNote.DoesNotExist, ValueError):
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

        note.text = text
        note.save(update_fields=['text'])
        return Response({
            **TicketNoteSerializer(note).data,
            'is_legacy': False,
        })

    if note_pk == 'legacy':
        ticket.description = ''
        ticket.save(update_fields=['description', 'updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)

    try:
        note = TicketNote.objects.get(pk=note_pk, ticket_id=ticket_pk)
    except (TicketNote.DoesNotExist, ValueError):
        return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)

    note.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def ticket_action_list(request, ticket_pk):
    try:
        ticket = Ticket.objects.get(pk=ticket_pk)
    except Ticket.DoesNotExist:
        return Response({'error': 'Ticket not found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = TicketActionSerializer(ticket.actions.all(), many=True)
        return Response(serializer.data)

    serializer = TicketActionSerializer(data=request.data)
    if serializer.is_valid():
        action = serializer.save(ticket=ticket)
        return Response(TicketActionSerializer(action).data, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def ticket_evidence_counts(request):
    """Return evidence file counts for all tickets."""
    from django.db.models import Count
    counts = TicketEvidence.objects.values('ticket_id').annotate(count=Count('id'))
    return Response({str(row['ticket_id']): row['count'] for row in counts})
