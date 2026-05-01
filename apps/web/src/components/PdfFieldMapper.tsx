import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { GlobalWorkerOptions, getDocument, version } from 'pdfjs-dist';
import { authHeader } from '../lib/api';

GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;

type FieldLike = {
  id?: string;
  field_id: string;
  field_name: string;
  page_number: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Props = {
  templateId: string;
  token: string;
  fields: FieldLike[];
  draftField: {
    field_id: string;
    field_name: string;
    page_number: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  onPositionPick: (payload: { x: number; y: number; width: number; height: number; page_number: number }) => void;
  onPageChange: (pageNumber: number) => void;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';
const WORKER_URL = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
GlobalWorkerOptions.workerSrc = WORKER_URL;

export function PdfFieldMapper({ templateId, token, fields, draftField, onPositionPick, onPageChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNumber, setPageNumber] = useState<number>(Math.max(1, draftField.page_number || 1));
  const [pageCount, setPageCount] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.2);
  const [viewport, setViewport] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setPageNumber(Math.max(1, draftField.page_number || 1));
  }, [draftField.page_number]);

  useEffect(() => {
    let cancelled = false;
    async function loadPdf() {
      setLoading(true);
      setLoadError('');
      try {
        const response = await fetch(`${API_BASE}/api/staff/templates/${templateId}/source`, {
          headers: authHeader(token),
        });

        if (!response.ok) {
          throw new Error('Unable to load source PDF for mapper');
        }

        const bytes = await response.arrayBuffer();
        const task = getDocument({ data: bytes });
        const loaded = await task.promise;

        if (cancelled) return;
        setPdfDoc(loaded);
        setPageCount(loaded.numPages);

        const firstPage = await loaded.getPage(1);
        const firstViewport = firstPage.getViewport({ scale: 1 });
        const targetWidth = 760;
        const nextScale = targetWidth / firstViewport.width;
        setScale(nextScale);
      } catch (error) {
        if (cancelled) return;
        setLoadError((error as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [templateId, token]);

  useEffect(() => {
    let cancelled = false;
    async function renderPage() {
      if (!pdfDoc || !canvasRef.current) return;
      const pageIndex = Math.min(Math.max(1, pageNumber), pageCount || 1);
      const page = await pdfDoc.getPage(pageIndex);
      if (cancelled || !canvasRef.current) return;

      const nextViewport = page.getViewport({ scale });
      setViewport({ width: nextViewport.width, height: nextViewport.height });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.width = nextViewport.width;
      canvas.height = nextViewport.height;

      await page.render({ canvasContext: context, viewport: nextViewport }).promise;
    }

    renderPage();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, pageNumber, pageCount, scale]);

  const pageFields = useMemo(
    () => fields.filter((field) => Number(field.page_number || 1) === Number(pageNumber || 1)),
    [fields, pageNumber],
  );

  const draftOverlay = useMemo(() => {
    if (Number(draftField.page_number || 1) !== Number(pageNumber || 1)) return null;
    return {
      left: Number(draftField.x || 0) * scale,
      top: viewport.height - (Number(draftField.y || 0) + Number(draftField.height || 0)) * scale,
      width: Math.max(10, Number(draftField.width || 0) * scale),
      height: Math.max(10, Number(draftField.height || 0) * scale),
    };
  }, [draftField, pageNumber, scale, viewport.height]);

  const dragOverlay = useMemo(() => {
    if (!dragStart || !dragCurrent) return null;
    const left = Math.min(dragStart.x, dragCurrent.x);
    const top = Math.min(dragStart.y, dragCurrent.y);
    const width = Math.abs(dragCurrent.x - dragStart.x);
    const height = Math.abs(dragCurrent.y - dragStart.y);
    return {
      left,
      top,
      width: Math.max(2, width),
      height: Math.max(2, height),
    };
  }, [dragStart, dragCurrent]);

  function toCanvasPoint(event: MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left + event.currentTarget.scrollLeft;
    const y = event.clientY - rect.top + event.currentTarget.scrollTop;
    return { x, y };
  }

  function handleMouseDown(event: MouseEvent<HTMLDivElement>) {
    if (!viewport.width || !viewport.height) return;
    const point = toCanvasPoint(event);
    setDragStart(point);
    setDragCurrent(point);
  }

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (!dragStart) return;
    setDragCurrent(toCanvasPoint(event));
  }

  function handleMouseUp(event: MouseEvent<HTMLDivElement>) {
    if (!dragStart || !viewport.width || !viewport.height) {
      setDragStart(null);
      setDragCurrent(null);
      return;
    }

    const end = toCanvasPoint(event);
    const leftCanvas = Math.min(dragStart.x, end.x);
    const topCanvas = Math.min(dragStart.y, end.y);
    const rightCanvas = Math.max(dragStart.x, end.x);
    const bottomCanvas = Math.max(dragStart.y, end.y);

    const widthPdf = Math.max(10, (rightCanvas - leftCanvas) / scale);
    const heightPdf = Math.max(10, (bottomCanvas - topCanvas) / scale);
    const xPdf = Math.max(0, leftCanvas / scale);
    const yPdf = Math.max(0, (viewport.height - bottomCanvas) / scale);

    onPositionPick({
      x: Math.round(xPdf),
      y: Math.round(yPdf),
      width: Math.round(widthPdf),
      height: Math.round(heightPdf),
      page_number: pageNumber,
    });

    setDragStart(null);
    setDragCurrent(null);
  }

  return (
    <div className="card" style={{ marginTop: 12, background: '#f7faff' }}>
      <h4 style={{ marginTop: 0 }}>Graphical Field Placement</h4>
      <p style={{ marginTop: 0, marginBottom: 8, fontSize: 13 }}>
        Select page, then click-and-drag from one corner of the field to the opposite corner.
      </p>

      <div className="row" style={{ marginBottom: 10 }}>
        <div className="field">
          <label>Page</label>
          <select
            value={pageNumber}
            onChange={(event) => {
              const nextPage = Math.min(Math.max(1, Number(event.target.value) || 1), Math.max(1, pageCount));
              setPageNumber(nextPage);
              onPageChange(nextPage);
            }}
          >
            {Array.from({ length: Math.max(1, pageCount) }).map((_, idx) => (
              <option key={idx + 1} value={idx + 1}>
                Page {idx + 1}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Zoom</label>
          <input
            type="range"
            min="0.6"
            max="2.2"
            step="0.1"
            value={scale}
            onChange={(event) => setScale(Number(event.target.value))}
          />
        </div>
      </div>

      {loading ? <p>Loading source PDF...</p> : null}
      {loadError ? <div className="error">{loadError}</div> : null}

      {!loading && !loadError ? (
        <div
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            setDragStart(null);
            setDragCurrent(null);
          }}
          style={{
            position: 'relative',
            width: viewport.width || 'auto',
            maxWidth: '100%',
            border: '1px solid #cfe0ff',
            cursor: 'crosshair',
            overflow: 'auto',
            background: '#fff',
          }}
        >
          <canvas ref={canvasRef} style={{ display: 'block' }} />

          {pageFields.map((field) => {
            const left = Number(field.x || 0) * scale;
            const top = viewport.height - (Number(field.y || 0) + Number(field.height || 0)) * scale;
            const width = Math.max(10, Number(field.width || 0) * scale);
            const height = Math.max(10, Number(field.height || 0) * scale);

            return (
              <div
                key={field.id ?? field.field_id}
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width,
                  height,
                  border: '2px solid #2467d6',
                  background: 'rgba(36,103,214,0.08)',
                  pointerEvents: 'none',
                  boxSizing: 'border-box',
                }}
                title={`${field.field_id}: ${field.field_name}`}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: -16,
                    left: 0,
                    fontSize: 10,
                    background: '#2467d6',
                    color: '#fff',
                    padding: '1px 4px',
                    borderRadius: 3,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {field.field_id}
                </div>
              </div>
            );
          })}

          {draftOverlay ? (
            <div
              style={{
                position: 'absolute',
                left: draftOverlay.left,
                top: draftOverlay.top,
                width: draftOverlay.width,
                height: draftOverlay.height,
                border: '2px dashed #15a36a',
                background: 'rgba(21,163,106,0.14)',
                pointerEvents: 'none',
                boxSizing: 'border-box',
              }}
              title="Draft field placement"
            />
          ) : null}

          {dragOverlay ? (
            <div
              style={{
                position: 'absolute',
                left: dragOverlay.left,
                top: dragOverlay.top,
                width: dragOverlay.width,
                height: dragOverlay.height,
                border: '2px dotted #0f2235',
                background: 'rgba(15,34,53,0.08)',
                pointerEvents: 'none',
                boxSizing: 'border-box',
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
