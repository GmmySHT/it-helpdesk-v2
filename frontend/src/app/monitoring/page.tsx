'use client';

// app/monitoring/page.tsx
// Monitoring Pendapatan & Kunjungan RS.
//
//  - Periode : Harian / Bulanan / Tahunan + tombol sebelumnya / berikutnya
//  - KPI     : carousel yang bergeser otomatis (ada tombol jeda)
//  - Baris 1 : pendapatan & kunjungan (line chart vs periode sebelumnya), kategori pembayaran (pie)
//  - Baris 2 : ruangan Rawat Jalan, ruangan Rawat Inap, pendaftaran hari ini per ruangan
//              (pendaftaran batal dihitung terpisah)
//  - Baris 3 : instalasi, penjamin, komponen tarif
//  - Layar penuh (TV): F / Esc. Panah kiri/kanan = ganti periode.
//
// Izin akses sepenuhnya dijaga backend (RequireModuleAccess "monitoring").

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { getMonitoring, DashboardPayload, PeriodSel, PharmacyStats, getDashboardConfig } from '@/lib/api';
import { Sidebar } from '@/components/sidebar';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
  LabelList,
  ReferenceLine,
} from 'recharts';
import {
  Maximize2,
  Minimize2,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Tipe data (mengikuti model Go) + normalisasi                       */
/* ------------------------------------------------------------------ */
type Period = PeriodSel['period'];

type Penjamin = { penjamin_nama: string; kategori_bayar: string; jumlah: number; revenue: number };
type Ruangan = {
  instalasi_nama: string;
  ruangan_nama: string;
  total_tindakan: number;
  total_tarif: number;
};
type Komponen = { komponen_nama: string; total_komponen: number };
type TrendPoint = { bucket: string; revenue: number; visits: number };
type ActiveRoom = { instalasi_nama: string; ruangan_nama: string; jumlah: number; batal: number };
type Active = {
  total: number; // pendaftaran hari ini yang tidak dibatalkan
  antri: number;
  sedang_periksa: number;
  sudah_pulang: number;
  rawat_inap: number;
  batal: number; // pendaftaran hari ini yang dibatalkan
  rooms: ActiveRoom[];
};

type Row = Record<string, unknown>;
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown, fallback = '') =>
  typeof v === 'string' && v.trim() ? v : fallback;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);

const toPenjamin = (r: Row): Penjamin => ({
  penjamin_nama: str(r.penjamin_nama, 'Tanpa penjamin'),
  kategori_bayar: str(r.kategori_bayar, 'Lainnya'),
  jumlah: num(r.jumlah),
  revenue: num(r.revenue),
});
const toRuangan = (r: Row): Ruangan => ({
  instalasi_nama: str(r.instalasi_nama, 'Lainnya'),
  ruangan_nama: str(r.ruangan_nama ?? r.nama_ruangan, 'Tanpa nama'),
  total_tindakan: num(r.total_tindakan ?? r.jumlah_pasien),
  total_tarif: num(r.total_tarif ?? r.revenue),
});
const toKomponen = (r: Row): Komponen => ({
  komponen_nama: str(r.komponen_nama, 'Lainnya'),
  total_komponen: num(r.total_komponen),
});
const toTrend = (r: Row): TrendPoint => ({
  bucket: str(r.bucket),
  revenue: num(r.revenue),
  visits: num(r.visits),
});
const toPharmacySummary = (v: unknown): PharmacyStats => {
  const o = (v as any) ?? {};
  return {
    total_qty: o.total_qty ?? 0,
    total_revenue: o.total_revenue ?? 0,
    total_hpp: o.total_hpp ?? 0,
    total_retur: o.total_retur ?? 0,
    total_kunjungan: o.total_kunjungan ?? 0,
    jumlah_retur: o.jumlah_retur ?? 0,
  };
};

const toActive = (v: unknown): Active => {
  const r = (v && typeof v === 'object' ? v : {}) as Row;
  return {
    total: num(r.total),
    antri: num(r.antri),
    sedang_periksa: num(r.sedang_periksa),
    sudah_pulang: num(r.sudah_pulang),
    rawat_inap: num(r.rawat_inap),
    batal: num(r.batal),
    rooms: asRows(r.rooms).map((x) => ({
      instalasi_nama: str(x.instalasi_nama, 'Lainnya'),
      ruangan_nama: str(x.ruangan_nama, 'Tanpa nama'),
      jumlah: num(x.jumlah),
      batal: num(x.batal),
    })),
  };
};

type RankItem = { key: string; name: string; sub?: string; value: number; color: string };

// Satu titik line chart: periode ini vs pembanding. null = tidak digambar
// (jam/hari/bulan yang belum terjadi, atau tanggal yang tidak ada di pembanding).
type CompareRow = {
  key: string;
  label: string;
  full: string;
  prevFull: string;
  rev: number | null;
  revPrev: number | null;
  vis: number | null;
  visPrev: number | null;
};

type TRow = {
  key: string;
  name: string;
  hint?: string;
  color?: string;
  cells: string[];
  pct: number;
};

/* ------------------------------------------------------------------ */
/*  Konstanta & helper                                                 */
/* ------------------------------------------------------------------ */
const PAID = '#10B981';
const UNPAID = '#F59E0B';
const RECEIVABLE = '#F87171';
const INSTALASI_COLORS = ['#FB923C', '#FACC15', '#A3E635', '#22D3EE', '#C084FC', '#F472B6', '#94A3B8', '#FDBA74'];
const KATEGORI_COLORS = ['#38BDF8', '#818CF8', '#2DD4BF', '#E879F9', '#60A5FA', '#67E8F9', '#A78BFA', '#94A3B8'];
const RJ_COLOR = '#38BDF8'; // biru = rawat jalan
const RI_COLOR = '#A78BFA'; // ungu = rawat inap
const LINE_REV = '#38BDF8';
const LINE_VIS = '#34D399';
const LINE_PREV = '#94A3B8';
const FALLBACK_COLOR = '#94A3B8';

const FOCUS =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400';

const isRJ = (s: string) => /rawat\s*jalan/i.test(s);
const isRI = (s: string) => /rawat\s*inap/i.test(s);

const fmtRp = (n?: number) => 'Rp ' + (n ?? 0).toLocaleString('id-ID');
const fmtCompact = (n: number) =>
  new Intl.NumberFormat('id-ID', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const fmtRpShort = (n: number) => 'Rp ' + fmtCompact(n);
const fmtVisits = (n: number) => n.toLocaleString('id-ID') + ' kunjungan';
const fmtPatients = (n: number) => n.toLocaleString('id-ID') + ' pasien';
const fmtPct = (n: number) =>
  n.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
const share = (part?: number, whole?: number) =>
  whole && whole > 0 ? ((part ?? 0) / whole) * 100 : 0;
const sumOf = (a: RankItem[]) => a.reduce((s, i) => s + i.value, 0);
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(n - 1, 1)) + '…' : s);
const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const samePeriod = (a: PeriodSel, b: PeriodSel) =>
  a.period === b.period &&
  a.year === b.year &&
  (a.period === 'year' || a.month === b.month) &&
  (a.period !== 'day' || a.day === b.day);

const prevOf = (p: PeriodSel): PeriodSel => {
  if (p.period === 'year') return { period: 'year', year: p.year - 1 };
  if (p.period === 'month') {
    const m = p.month ?? 1;
    return m === 1
      ? { period: 'month', year: p.year - 1, month: 12 }
      : { period: 'month', year: p.year, month: m - 1 };
  }
  const y = p.year;
  const m = p.month ?? 1;
  const d = p.day ?? 1;
  const dt = new Date(y, m - 1, d - 1);
  return { period: 'day', year: dt.getFullYear(), month: dt.getMonth() + 1, day: dt.getDate() };
};

const nameOf = (p: PeriodSel) => {
  if (p.period === 'year') return String(p.year);
  if (p.period === 'month') {
    const m = p.month ?? 1;
    return new Date(p.year, m - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
  }
  const m = p.month ?? 1;
  const d = p.day ?? 1;
  return new Date(p.year, m - 1, d).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const TOOLTIP_STYLE = {
  backgroundColor: '#0F172A',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  color: '#F1F5F9',
  fontSize: 12,
};

// Susun deret perbandingan: jam 0..23 (harian), hari 1..31 (bulanan) atau
// bulan 1..12 (tahunan). Periode ini dan pembanding disejajarkan per posisi.
function buildCompare(
  trend: TrendPoint[],
  prevTrend: TrendPoint[],
  p: PeriodSel,
  today: Date
): CompareRow[] {
  const keyLen = p.period === 'day' ? 13 : p.period === 'month' ? 10 : 7;
  const index = (a: TrendPoint[]) => new Map(a.map((t) => [t.bucket.slice(0, keyLen), t] as const));
  const cur = index(trend);
  const prev = index(prevTrend);

  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  const py = p.year;
  const pm = p.month ?? 1;
  const pd = p.day ?? 1;
  const nowKey =
    p.period === 'day'
      ? `${ymd(ty, tm, today.getDate())} ${pad(today.getHours())}`
      : p.period === 'month'
      ? ymd(ty, tm, today.getDate())
      : `${ty}-${pad(tm)}`;

  const pp = prevOf(p);
  const ppy = pp.year;
  const ppm = pp.month ?? 1;
  const ppd = pp.day ?? 1;
  const make = (
    key: string,
    prevKey: string,
    label: string,
    full: string,
    prevFull: string,
    prevOk = true
  ): CompareRow => {
    const future = key > nowKey;
    const c = cur.get(key);
    const q = prev.get(prevKey);
    return {
      key,
      label,
      full,
      prevFull,
      rev: future ? null : c?.revenue ?? 0,
      vis: future ? null : c?.visits ?? 0,
      revPrev: prevOk ? q?.revenue ?? 0 : null,
      visPrev: prevOk ? q?.visits ?? 0 : null,
    };
  };

  const rows: CompareRow[] = [];
  if (p.period === 'day') {
    for (let h = 0; h < 24; h++) {
      rows.push(
        make(
          `${ymd(py, pm, pd)} ${pad(h)}`,
          `${ymd(ppy, ppm, ppd)} ${pad(h)}`,
          pad(h),
          `${nameOf(p)}, ${pad(h)}.00`,
          `${nameOf(pp)}, ${pad(h)}.00`
        )
      );
    }
  } else if (p.period === 'month') {
    const days = new Date(py, pm, 0).getDate();
    const prevDays = new Date(ppy, ppm, 0).getDate();
    const mName = new Date(py, pm - 1, 1).toLocaleDateString('id-ID', { month: 'long' });
    const pName = new Date(ppy, ppm - 1, 1).toLocaleDateString('id-ID', { month: 'long' });
    for (let d = 1; d <= days; d++) {
      rows.push(
        make(
          ymd(py, pm, d),
          ymd(ppy, ppm, d),
          String(d),
          `${d} ${mName} ${py}`,
          `${d} ${pName} ${ppy}`,
          d <= prevDays
        )
      );
    }
  } else {
    for (let m = 1; m <= 12; m++) {
      const dt = new Date(py, m - 1, 1);
      rows.push(
        make(
          `${py}-${pad(m)}`,
          `${ppy}-${pad(m)}`,
          dt.toLocaleDateString('id-ID', { month: 'short' }),
          dt.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }),
          `${dt.toLocaleDateString('id-ID', { month: 'long' })} ${ppy}`
        )
      );
    }
  }
  return rows;
}

const toRoomItems = (list: Ruangan[], color: string): RankItem[] =>
  [...list]
    .sort((a, b) => b.total_tarif - a.total_tarif)
    .map((r) => ({
      key: r.instalasi_nama + '|' + r.ruangan_nama,
      name: r.ruangan_nama,
      sub: `${r.instalasi_nama}, ${r.total_tindakan.toLocaleString('id-ID')} tindakan`,
      value: r.total_tarif,
      color,
    }));

/* ------------------------------------------------------------------ */
/*  Komponen kecil                                                     */
/* ------------------------------------------------------------------ */
// Jam dipisah supaya re-render tiap detik tidak menyentuh seluruh halaman
// dan tidak menyebabkan hydration mismatch.
function Clock({ big }: { big: boolean }) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!now) return <div className="h-8" />;

  return (
    <div className="text-right leading-tight">
      <div className={`font-bold tabular-nums text-white ${big ? 'text-2xl' : 'text-lg'}`}>
        {now.toLocaleTimeString('id-ID')}
      </div>
      <div className={`text-slate-400 ${big ? 'text-xs' : 'text-[11px]'}`}>
        {now.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </div>
    </div>
  );
}

function Panel({
  title,
  aside,
  children,
  className = '',
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`flex h-64 min-h-0 flex-col rounded-lg border border-white/10 bg-white/[0.03] p-3 lg:h-auto ${className}`}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="truncate text-[13px] font-semibold text-slate-100">{title}</h3>
        {aside && <div className="shrink-0 text-[11px] text-slate-500">{aside}</div>}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center text-xs text-slate-500">{text}</div>;
}

function Kpi({
  label,
  value,
  note,
  size,
  title,
}: {
  label: string;
  value: string;
  note?: string;
  size: string;
  title?: string;
}) {
  return (
    <div className="h-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className={`font-bold leading-tight tabular-nums text-white ${size}`} title={title}>
        {value}
      </p>
      {note && <p className="text-[11px] text-slate-500">{note}</p>}
    </div>
  );
}

// KPI yang bergeser otomatis. Jumlah kartu per slide menyesuaikan lebar layar
// (3 / 2 / 1). Berhenti saat kursor di atasnya, saat fokus, saat user menekan
// jeda, dan bila sistem meminta pengurangan animasi.
function Carousel({ items, intervalMs = 7000 }: { items: React.ReactNode[]; intervalMs?: number }) {
  const [perView, setPerView] = useState(3);
  const [page, setPage] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const wide = window.matchMedia('(min-width: 1024px)');
    const mid = window.matchMedia('(min-width: 640px)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setPerView(wide.matches ? 3 : mid.matches ? 2 : 1);
      setReduced(motion.matches);
    };
    sync();
    const all = [wide, mid, motion];
    all.forEach((m) => m.addEventListener('change', sync));
    return () => all.forEach((m) => m.removeEventListener('change', sync));
  }, []);

  const pages = useMemo(() => {
    const out: React.ReactNode[][] = [];
    for (let i = 0; i < items.length; i += perView) out.push(items.slice(i, i + perView));
    return out;
  }, [items, perView]);
  const n = pages.length;
  const cur = Math.min(page, n - 1);

  useEffect(() => {
    if (userPaused || hovering || reduced || n < 2) return;
    const t = setInterval(() => setPage((p) => (p + 1) % n), intervalMs);
    return () => clearInterval(t);
  }, [userPaused, hovering, reduced, n, intervalMs]);

  const go = (i: number) => setPage(((i % n) + n) % n);
  const btn = `rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white ${FOCUS}`;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Ringkasan"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
      className="mb-3"
    >
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${cur * 100}%)` }}
        >
          {pages.map((group, i) => (
            <div
              key={i}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} dari ${n}`}
              aria-hidden={i !== cur}
              className="grid w-full shrink-0 gap-3"
              style={{ gridTemplateColumns: `repeat(${perView}, minmax(0, 1fr))` }}
            >
              {group}
            </div>
          ))}
        </div>
      </div>

      {n > 1 && (
        <div className="mt-1.5 flex items-center justify-center gap-1.5">
          <button onClick={() => go(cur - 1)} aria-label="Slide sebelumnya" className={btn}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              aria-label={`Slide ${i + 1}`}
              aria-current={i === cur}
              className={`h-1.5 rounded-full transition-all ${FOCUS} ${
                i === cur ? 'w-5 bg-emerald-400' : 'w-1.5 bg-white/25 hover:bg-white/40'
              }`}
            />
          ))}
          <button onClick={() => go(cur + 1)} aria-label="Slide berikutnya" className={btn}>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {!reduced && (
            <button
              onClick={() => setUserPaused((v) => !v)}
              aria-label={userPaused ? 'Putar otomatis' : 'Jeda geser otomatis'}
              title={userPaused ? 'Putar otomatis' : 'Jeda geser otomatis'}
              className={`ml-1 ${btn}`}
            >
              {userPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function LineLegend({ cur, prev, color }: { cur: string; prev: string; color: string }) {
  return (
    <span className="flex items-center gap-3 text-slate-400">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-4 rounded" style={{ backgroundColor: color }} />
        <span className="capitalize">{cur}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-4 border-t border-dashed" style={{ borderColor: LINE_PREV }} />
        <span className="capitalize">{prev}</span>
      </span>
    </span>
  );
}

function RankTooltip({
  active,
  payload,
  total,
  fmtVal = fmtRp,
}: {
  active?: boolean;
  payload?: { payload: RankItem }[];
  total: number;
  fmtVal?: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const it = payload[0].payload;
  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <div className="font-semibold">{it.name}</div>
      {it.sub && <div className="text-slate-400">{it.sub}</div>}
      <div className="mt-1 tabular-nums">
        {fmtVal(it.value)} ({share(it.value, total).toFixed(1)}%)
      </div>
    </div>
  );
}

function CompareTooltip({
  active,
  payload,
  metric,
  fmt,
}: {
  active?: boolean;
  payload?: { payload: CompareRow }[];
  metric: 'rev' | 'vis';
  fmt: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const cur = metric === 'rev' ? row.rev : row.vis;
  const prev = metric === 'rev' ? row.revPrev : row.visPrev;
  const delta = cur !== null && prev !== null && prev > 0 ? ((cur - prev) / prev) * 100 : null;

  return (
    <div style={TOOLTIP_STYLE} className="px-3 py-2">
      <div className="font-semibold">{row.full}</div>
      <div className="mt-1 tabular-nums">{cur === null ? 'Belum ada data' : fmt(cur)}</div>
      <div className="mt-0.5 tabular-nums text-slate-400">
        {row.prevFull}: {prev === null ? '-' : fmt(prev)}
      </div>
      {delta !== null && (
        <div className={`mt-0.5 tabular-nums ${delta >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
          {delta >= 0 ? '+' : ''}
          {delta.toFixed(1).replace('.', ',')}% dari pembanding
        </div>
      )}
    </div>
  );
}

// Diagram batang horizontal untuk peringkat (instalasi, ruangan).
function HBar({
  items,
  total,
  limit = 8,
  fs,
  labelWidth,
  fmtVal = fmtRp,
}: {
  items: RankItem[];
  total: number;
  limit?: number;
  fs: number;
  labelWidth: number;
  fmtVal?: (n: number) => string;
}) {
  const shown = items.slice(0, limit);
  const maxChars = Math.floor(labelWidth / (fs * 0.56));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={shown}
        layout="vertical"
        margin={{ top: 0, right: 52, bottom: 0, left: 0 }}
        barCategoryGap="18%"
      >
        <XAxis type="number" hide domain={[0, 'dataMax']} />
        <YAxis
          type="category"
          dataKey="name"
          width={labelWidth}
          interval={0}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#CBD5E1', fontSize: fs }}
          tickFormatter={(v) => clip(String(v), maxChars)}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
          content={<RankTooltip total={total} fmtVal={fmtVal} />}
        />
        <Bar dataKey="value" radius={[0, 3, 3, 0]} isAnimationActive={false}>
          {shown.map((it) => (
            <Cell key={it.key} fill={it.color} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v: unknown) => fmtCompact(Number(v))}
            fill="#E2E8F0"
            fontSize={fs}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Line chart: periode ini (tebal) vs periode pembanding (putus-putus).
function CompareChart({
  rows,
  metric,
  color,
  fmt,
  fs,
  targetDaily,
}: {
  rows: CompareRow[];
  metric: 'rev' | 'vis';
  color: string;
  fmt: (n: number) => string;
  fs: number;
  targetDaily?: number | null;
}) {
  const prevKey = metric === 'rev' ? 'revPrev' : 'visPrev';
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="label"
          interval={rows.length > 20 ? 1 : 0}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#94A3B8', fontSize: fs - 1 }}
        />
        <YAxis
          width={42}
          tickLine={false}
          axisLine={false}
          tick={{ fill: '#94A3B8', fontSize: fs - 1 }}
          tickFormatter={(v) => fmtCompact(Number(v))}
        />
        <Tooltip
          cursor={{ stroke: 'rgba(255,255,255,0.2)' }}
          content={<CompareTooltip metric={metric} fmt={fmt} />}
        />
        {metric === 'rev' && targetDaily && (
          <ReferenceLine
            y={targetDaily}
            stroke="#F97316"
            strokeDasharray="5 5"
            strokeWidth={1.5}
            label={{ value: 'Target', fill: '#F97316', fontSize: 11, offset: 8 }}
          />
        )}
        <Line
          type="monotone"
          dataKey={prevKey}
          stroke={LINE_PREV}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          activeDot={{ r: 3 }}
          isAnimationActive={false}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey={metric}
          stroke={color}
          strokeWidth={2.25}
          dot={rows.length <= 12 ? { r: 2.5, fill: color, strokeWidth: 0 } : false}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Pie + legenda berisi nilai dan persen.
function PieLegend({ items, total, fs }: { items: RankItem[]; total: number; fs: number }) {
  return (
    <div className="flex h-full items-center gap-3">
      <div className="relative h-full min-h-0 w-[46%] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="value"
              nameKey="name"
              innerRadius="58%"
              outerRadius="98%"
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {items.map((it) => (
                <Cell key={it.key} fill={it.color} />
              ))}
            </Pie>
            <Tooltip content={<RankTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] text-slate-400">Total</span>
          <span className="text-sm font-bold tabular-nums text-white">{fmtRpShort(total)}</span>
        </div>
      </div>

      <ul className="min-w-0 flex-1 space-y-1.5" style={{ fontSize: fs }}>
        {items.map((it) => (
          <li key={it.key} className="flex items-center gap-1.5" title={`${it.name}: ${fmtRp(it.value)}`}>
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: it.color }} />
            <span className="min-w-0 flex-1 truncate text-slate-200">{it.name}</span>
            <span className="tabular-nums text-slate-400">{fmtCompact(it.value)}</span>
            <span className="w-9 text-right font-medium tabular-nums text-white">
              {share(it.value, total).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Tabel ringkas: kolom pertama = nama, kolom terakhir = persen.
function MiniTable({ head, rows, big }: { head: string[]; rows: TRow[]; big: boolean }) {
  return (
    <div className="slim-scroll h-full overflow-auto">
      <table className={`w-full ${big ? 'text-[13px]' : 'text-[11px]'}`}>
        <thead className="sticky top-0 bg-[#0F1626] text-slate-400">
          <tr>
            {head.map((h, i) => (
              <th
                key={h}
                scope="col"
                className={`py-1 font-medium ${i === 0 ? 'pr-2 text-left' : 'pl-2 text-right'}`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-slate-200">
          {rows.map((r) => (
            <tr key={r.key} title={r.hint}>
              <td className="w-full max-w-0 truncate py-1 pr-2">
                {r.color && (
                  <span
                    className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ backgroundColor: r.color }}
                  />
                )}
                {r.name}
              </td>
              {r.cells.map((c, i) => (
                <td key={i} className="whitespace-nowrap py-1 pl-2 text-right tabular-nums">
                  {c}
                </td>
              ))}
              <td className="whitespace-nowrap py-1 pl-2 text-right font-semibold tabular-nums text-white">
                {fmtPct(r.pct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
export default function MonitoringPage() {
  const { token, isLoading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<DashboardPayload | null>(null);
  const [dataPeriod, setDataPeriod] = useState<PeriodSel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [targetDaily, setTargetDaily] = useState<number | null>(null);

  const [period, setPeriod] = useState<Period>('month');
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [day, setDay] = useState(() => new Date().getDate());

  const rootRef = useRef<HTMLDivElement>(null);
  const reqRef = useRef(0);
  const [isFull, setIsFull] = useState(false);

  /* ----------------------------- data ------------------------------ */
  // Fetch target revenue dari API
  useEffect(() => {
    if (!token) return;
    const fetchTarget = async () => {
      try {
        const data = await getDashboardConfig(token);
        const monthlyTarget = data.monthly_revenue_target || 8500000000;
        
        // Target line: periode 'year' -> titik chart = pendapatan per bulan,
        // jadi target = monthly target full (8.5M). Periode 'month' (per hari)
        // tidak menampilkan target line.
        if (period === 'year' && dataPeriod) {
          setTargetDaily(monthlyTarget);
        } else {
          setTargetDaily(null);
        }
      } catch (err) {
        console.error('Fetch target error:', err);
      }
    };
    fetchTarget();
  }, [token, period, dataPeriod]);
  const load = useCallback(async () => {
    if (!token) return 30_000;
    const id = ++reqRef.current; // hanya respons terbaru yang dipakai
    const sel: PeriodSel = { period, year, month, day };
    setRefreshing(true);
    try {
      const json = await getMonitoring(token, sel);
      if (!json) throw new Error('Respons kosong dari server');
      if (id !== reqRef.current) return 30_000;
      setData(json);
      setDataPeriod(sel);
      setError(null);
      setUpdatedAt(new Date());
      return (json.config?.refresh_interval_seconds || 30) * 1000;
    } catch (e) {
      if (id !== reqRef.current) return 30_000;
      setError(e instanceof Error ? e.message : 'Gagal memuat data monitoring');
      return 30_000;
    } finally {
      if (id === reqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token, period, year, month, day]);

  useEffect(() => {
    if (isLoading) return; // tunggu sesi dipulihkan dari localStorage
    if (!token) {
      router.push('/login');
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    // Polling berantai: request berikutnya dijadwalkan SETELAH yang
    // sekarang selesai, jadi tidak pernah menumpuk. Ganti periode
    // otomatis memulai rantai baru.
    const tick = async () => {
      const nextMs = await load();
      if (!cancelled) timer = setTimeout(tick, nextMs);
    };
    tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isLoading, token, router, load]);

  /* ---------------------------- periode ---------------------------- */
  const today = new Date();
  const curY = today.getFullYear();
  const curM = today.getMonth() + 1;
  const curD = today.getDate();
  const atCurrent =
    period === 'year'
      ? year === curY
      : period === 'month'
      ? year === curY && month === curM
      : year === curY && month === curM && day === curD;
  const sel: PeriodSel = { period, year, month, day };
  const periodLabel = nameOf(sel);

  const choose = (id: Period) => {
    setPeriod(id);
    if (id === 'day') {
      const now = new Date();
      let d = Math.min(day, new Date(year, month, 0).getDate());
      if (year === now.getFullYear() && month === now.getMonth() + 1) d = Math.min(d, now.getDate());
      setDay(d);
    }
  };

  const shift = useCallback(
    (dir: 1 | -1) => {
      const now = new Date();
      const cy = now.getFullYear();
      const cm = now.getMonth() + 1;
      if (period === 'year') {
        const y = year + dir;
        if (y <= cy) setYear(y);
        return;
      }
      if (period === 'day') {
        const d = new Date(year, month - 1, day + dir);
        const limit = new Date();
        limit.setHours(23, 59, 59, 999);
        if (d > limit) return; // tidak ke masa depan
        setYear(d.getFullYear());
        setMonth(d.getMonth() + 1);
        setDay(d.getDate());
        return;
      }
      let y = year;
      let m = month + dir;
      if (m < 1) {
        m = 12;
        y -= 1;
      } else if (m > 12) {
        m = 1;
        y += 1;
      }
      if (y > cy || (y === cy && m > cm)) return;
      setYear(y);
      setMonth(m);
    },
    [period, year, month, day]
  );

  const goNow = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setDay(now.getDate());
  };

  /* --------------------------- layar penuh -------------------------- */
  const enterFull = useCallback(async () => {
    setIsFull(true); // CSS fallback langsung aktif
    try {
      await rootRef.current?.requestFullscreen?.();
    } catch {
      /* browser menolak: tetap pakai mode CSS */
    }
  }, []);

  const exitFull = useCallback(async () => {
    setIsFull(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* abaikan */
    }
  }, []);

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setIsFull(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Pintasan: F = layar penuh, Esc = keluar, panah kiri/kanan = ganti periode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Escape' && isFull) exitFull();
      if (e.key === 'f' || e.key === 'F') {
        if (isFull) exitFull();
        else enterFull();
      }
      if (e.key === 'ArrowLeft') shift(-1);
      if (e.key === 'ArrowRight') shift(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFull, enterFull, exitFull, shift]);

  /* ----------------------------- turunan --------------------------- */
  const cfg = data?.config;
  const stats = data?.stats;
  // Backend membalas `warning` saat database SIMRS tidak terkoneksi
  // (data kosong, bukan error) — ditampilkan sebagai banner di atas halaman.
  const simrsWarning = (data as unknown as { warning?: string } | null)?.warning;

  const { patients, rooms, comps, trend, trendPrev, active, pharmacy_summary, pharmacy_sales, pharmacy_rooms } = useMemo(() => {
    const raw = (data ?? {}) as unknown as Record<string, unknown>;
    return {
      patients: asRows(raw.patients).map(toPenjamin),
      rooms: asRows(raw.rooms).map(toRuangan),
      comps: asRows(raw.components ?? raw.komponen).map(toKomponen),
      trend: asRows(raw.trend).map(toTrend),
      trendPrev: asRows(raw.trend_prev).map(toTrend),
      active: toActive(raw.active),
      pharmacy_summary: toPharmacySummary(raw.pharmacy_summary),
      pharmacy_sales: asRows(raw.pharmacy_sales),
      pharmacy_rooms: asRows(raw.pharmacy_rooms),
    };
  }, [data]);

  const drugRows = useMemo<TRow[]>(() => {
    const total = pharmacy_summary.total_revenue || 1;
    return pharmacy_sales.slice(0, 5).map((d: any, idx: number) => ({
      key: d.obatalkes_id ? String(d.obatalkes_id) : `drug-${idx}`,
      name: d.obat_nama || 'Obat',
      cells: [fmtRpShort(d.revenue), `${((d.revenue / total) * 100).toFixed(1)}%`],
      pct: Math.min(100, Math.round((d.revenue / total) * 100)),
    }));
  }, [pharmacy_sales, pharmacy_summary.total_revenue]);

  const phRoomRows = useMemo<TRow[]>(() => {
    const total = pharmacy_rooms.reduce((s: number, r: any) => s + (r.revenue || 0), 0);
    return pharmacy_rooms.slice(0, 8).map((r: any) => ({
      key: r.instalasi_nama + '|' + r.ruangan_nama,
      name: r.ruangan_nama,
      hint: `${r.instalasi_nama}: ${r.kunjungan} kunjungan, ${Math.round(r.qty_obat)} item`,
      cells: [fmtRpShort(r.revenue), r.qty_obat.toLocaleString('id-ID', {maxFractionDigits: 0})],
      pct: share(r.revenue, total),
    }));
  }, [pharmacy_rooms]);

  const totalRevenue = stats?.total_revenue ?? 0;
  const totalVisits = stats?.total_visits ?? 0;
  const paidPct = share(stats?.total_paid, totalRevenue);
  const unpaidPct = share(stats?.total_unpaid, totalRevenue);
  const recvPct = share(stats?.total_receivable, totalRevenue);
  const avgPerVisit = totalVisits > 0 ? totalRevenue / totalVisits : 0;

  // Deret perbandingan dibangun dari periode milik data yang tampil (bukan
  // dari pilihan terbaru), supaya tidak ada jeda tampilan kosong saat berpindah.
  const compareRows = useMemo(
    () => (dataPeriod ? buildCompare(trend, trendPrev, dataPeriod, new Date()) : []),
    [trend, trendPrev, dataPeriod]
  );
  const curName = dataPeriod ? nameOf(dataPeriod) : '';
  const prevName = dataPeriod ? nameOf(prevOf(dataPeriod)) : '';
  const stale = !dataPeriod || !samePeriod(dataPeriod, sel);
  const unit = dataPeriod?.period === 'day' ? 'jam' : dataPeriod?.period === 'year' ? 'bulanan' : 'harian';

  const kategori = useMemo<RankItem[]>(() => {
    const m = new Map<string, { value: number; count: number }>();
    for (const p of patients) {
      const e = m.get(p.kategori_bayar) ?? { value: 0, count: 0 };
      e.value += p.revenue;
      e.count += p.jumlah;
      m.set(p.kategori_bayar, e);
    }
    return Array.from(m, ([name, e]) => ({
      key: name,
      name,
      value: e.value,
      sub: `${e.count.toLocaleString('id-ID')} kunjungan`,
      color: '',
    }))
      .sort((a, b) => b.value - a.value)
      .map((x, i) => ({ ...x, color: KATEGORI_COLORS[i % KATEGORI_COLORS.length] }));
  }, [patients]);

  const kategoriColor = useMemo(
    () => new Map(kategori.map((k) => [k.name, k.color] as [string, string])),
    [kategori]
  );

  const instalasi = useMemo<RankItem[]>(() => {
    const m = new Map<string, { value: number; count: number; rooms: number }>();
    for (const r of rooms) {
      const e = m.get(r.instalasi_nama) ?? { value: 0, count: 0, rooms: 0 };
      e.value += r.total_tarif;
      e.count += r.total_tindakan;
      e.rooms += 1;
      m.set(r.instalasi_nama, e);
    }
    return Array.from(m, ([name, e]) => ({
      key: name,
      name,
      value: e.value,
      sub: `${e.rooms} ruangan, ${e.count.toLocaleString('id-ID')} tindakan`,
      color: '',
    }))
      .sort((a, b) => b.value - a.value)
      .map((x, i) => ({ ...x, color: INSTALASI_COLORS[i % INSTALASI_COLORS.length] }));
  }, [rooms]);

  // Ruangan dipisah menurut instalasi (dicocokkan dari nama instalasi)
  const roomsRJ = useMemo(() => toRoomItems(rooms.filter((r) => isRJ(r.instalasi_nama)), RJ_COLOR), [rooms]);
  const roomsRI = useMemo(() => toRoomItems(rooms.filter((r) => isRI(r.instalasi_nama)), RI_COLOR), [rooms]);

  // Pendaftaran hari ini per ruangan (pendaftaran batal tidak masuk hitungan
  // utama, ditampilkan di kolom terpisah).
  const activeTotal = active.total;
  const activeRows = useMemo<TRow[]>(() => {
    const total = active.rooms.reduce((s, r) => s + r.jumlah, 0);
    return [...active.rooms]
      .sort((a, b) => b.jumlah - a.jumlah || b.batal - a.batal)
      .slice(0, 8)
      .map((r) => ({
        key: r.instalasi_nama + '|' + r.ruangan_nama,
        name: r.ruangan_nama,
        hint: `${r.instalasi_nama}: ${r.jumlah} pasien, ${r.batal} batal`,
        color: isRI(r.instalasi_nama) ? RI_COLOR : RJ_COLOR,
        cells: [r.jumlah.toLocaleString('id-ID'), r.batal.toLocaleString('id-ID')],
        pct: share(r.jumlah, total),
      }));
  }, [active]);

  const penjaminRows = useMemo<TRow[]>(() => {
    const sorted = [...patients].sort((a, b) => b.revenue - a.revenue);
    const total = sorted.reduce((s, p) => s + p.revenue, 0);
    return sorted.slice(0, 8).map((p) => ({
      key: p.penjamin_nama + '|' + p.kategori_bayar,
      name: p.penjamin_nama,
      hint: `${p.penjamin_nama} (${p.kategori_bayar}): ${fmtRp(p.revenue)}`,
      color: kategoriColor.get(p.kategori_bayar) ?? FALLBACK_COLOR,
      cells: [p.jumlah.toLocaleString('id-ID'), fmtRpShort(p.revenue)],
      pct: share(p.revenue, total),
    }));
  }, [patients, kategoriColor]);

  const komponenRows = useMemo<TRow[]>(() => {
    const sorted = [...comps].sort((a, b) => b.total_komponen - a.total_komponen);
    const total = sorted.reduce((s, c) => s + c.total_komponen, 0);
    return sorted.slice(0, 8).map((c) => ({
      key: c.komponen_nama,
      name: c.komponen_nama,
      hint: `${c.komponen_nama}: ${fmtRp(c.total_komponen)}`,
      cells: [fmtRpShort(c.total_komponen)],
      pct: share(c.total_komponen, total),
    }));
  }, [comps]);

  const fs = isFull ? 13 : 11;
  const labelWidth = isFull ? 132 : 108;
  const kpiSize = isFull ? 'text-3xl' : 'text-xl';

  const rank = (items: RankItem[], emptyText: string, fmtVal?: (n: number) => string) =>
    items.length === 0 ? (
      <Empty text={emptyText} />
    ) : (
      <HBar items={items} total={sumOf(items)} fs={fs} labelWidth={labelWidth} fmtVal={fmtVal} />
    );

  /* ----------------------------- header ---------------------------- */
  const header = (
    <header className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h1 className={`font-bold text-white ${isFull ? 'text-xl' : 'text-base'}`}>
          Monitoring Pendapatan & Kunjungan
        </h1>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                error || simrsWarning ? 'bg-amber-400' : 'animate-pulse bg-emerald-400 motion-reduce:animate-none'
              }`}
            />
            {error ? 'Koneksi bermasalah' : simrsWarning ? 'SIMRS tidak terkoneksi' : 'Data langsung'}
          </span>
          <span>RS INTAN HUSADA</span>
          {updatedAt && (
            <span>
              Diperbarui {updatedAt.toLocaleTimeString('id-ID')} (tiap{' '}
              {cfg?.refresh_interval_seconds || 30} detik)
            </span>
          )}
        </div>
      </div>

      {/* Pilihan periode */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Jenis periode" className="flex rounded-lg border border-white/10 p-0.5">
          {(
            [
              ['day', 'Harian'],
              ['month', 'Bulanan'],
              ['year', 'Tahunan'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={period === id}
              onClick={() => choose(id)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${FOCUS} ${
                period === id
                  ? 'bg-emerald-400/20 text-emerald-200'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => shift(-1)}
            aria-label={period === 'year' ? 'Tahun sebelumnya' : period === 'month' ? 'Bulan sebelumnya' : 'Hari sebelumnya'}
            title="Sebelumnya (←)"
            className={`rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/10 ${FOCUS}`}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span
            className="min-w-[8.5rem] text-center text-sm font-semibold capitalize text-white"
            aria-live="polite"
          >
            {periodLabel}
          </span>
          <button
            onClick={() => shift(1)}
            disabled={atCurrent}
            aria-label={period === 'year' ? 'Tahun berikutnya' : period === 'month' ? 'Bulan berikutnya' : 'Hari berikutnya'}
            title="Berikutnya (→)"
            className={`rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/10 disabled:opacity-30 ${FOCUS}`}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!atCurrent && (
            <button
              onClick={goNow}
              className={`rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/10 ${FOCUS}`}
            >
              {period === 'year' ? 'Tahun ini' : period === 'month' ? 'Bulan ini' : 'Hari ini'}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Clock big={isFull} />
        <div className="flex items-center gap-1.5">
          <button
            onClick={load}
            disabled={refreshing}
            aria-label="Muat ulang data"
            title="Muat ulang data"
            className={`rounded-lg border border-white/10 p-1.5 text-slate-300 hover:bg-white/10 disabled:opacity-50 ${FOCUS}`}
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`}
            />
          </button>
          <button
            onClick={isFull ? exitFull : enterFull}
            aria-label={isFull ? 'Keluar layar penuh' : 'Layar penuh'}
            title={isFull ? 'Keluar layar penuh (Esc)' : 'Layar penuh (F)'}
            className={`flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/10 ${FOCUS}`}
          >
            {isFull ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            {isFull ? 'Keluar' : 'Layar penuh'}
          </button>
        </div>
      </div>
    </header>
  );

  /* ----------------------------- isi ------------------------------- */
  let content: React.ReactNode;

  if (loading && !data) {
    content = (
      <div className="flex min-h-[60vh] flex-1 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-700 border-t-emerald-400 motion-reduce:animate-none" />
      </div>
    );
  } else if (error && !data) {
    content = (
      <div className="flex min-h-[60vh] flex-1 items-center justify-center">
        <div className="max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center">
          <h2 className="mb-2 text-lg font-semibold text-red-300">Gagal memuat monitoring</h2>
          <p className="text-sm text-slate-300">{error}</p>
          <button
            onClick={load}
            className={`mt-5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 ${FOCUS}`}
          >
            Coba lagi
          </button>
        </div>
      </div>
    );
  } else {
    const cards: React.ReactNode[] = [
      <Kpi
        key="rev"
        label={`Total pendapatan ${periodLabel.toLowerCase()}`}
        value={fmtRp(totalRevenue)}
        size={kpiSize}
      />,
      <Kpi
        key="vis"
        label="Kunjungan pasien"
        value={totalVisits.toLocaleString('id-ID')}
        note={periodLabel}
        size={kpiSize}
      />,
      <Kpi
        key="avg"
        label="Rata-rata / kunjungan"
        value={fmtRpShort(avgPerVisit)}
        title={fmtRp(Math.round(avgPerVisit))}
        size={kpiSize}
      />,
      <div key="pay" className="h-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>Realisasi pembayaran</span>
          <span>{paidPct.toFixed(0)}% lunas</span>
        </div>
        <div
          className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full bg-white/10"
          role="img"
          aria-label={`Lunas ${paidPct.toFixed(0)}%, belum bayar ${unpaidPct.toFixed(0)}%, piutang ${recvPct.toFixed(0)}%`}
        >
          <div style={{ width: `${paidPct}%`, backgroundColor: PAID }} />
          <div style={{ width: `${unpaidPct}%`, backgroundColor: UNPAID }} />
          <div style={{ width: `${recvPct}%`, backgroundColor: RECEIVABLE }} />
        </div>
        <dl className="mt-1.5 grid grid-cols-3 gap-2 text-[11px]">
          {[
            { label: 'Lunas', v: stats?.total_paid, color: PAID, hint: '' },
            { label: 'Belum bayar', v: stats?.total_unpaid, color: UNPAID, hint: '' },
            { label: 'Piutang', v: stats?.total_receivable, color: RECEIVABLE, hint: 'Piutang klaim asuransi & KRIS' },
          ].map((s) => (
            <div key={s.label}>
              <dt className="flex items-center gap-1.5 text-slate-400" title={s.hint || undefined}>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </dt>
              <dd className="font-semibold tabular-nums text-slate-100" title={fmtRp(s.v)}>
                {fmtRpShort(s.v ?? 0)}
              </dd>
            </div>
          ))}
        </dl>
      </div>,
      <Kpi
        key="hariini"
        label="Pendaftaran hari ini"
        value={active.total.toLocaleString('id-ID')}
        note={`${active.antri} antre, ${active.sedang_periksa} diperiksa, ${active.rawat_inap} inap, ${active.sudah_pulang} pulang`}
        size={kpiSize}
      />,
      <Kpi
        key="batal"
        label="Batal daftar hari ini"
        value={active.batal.toLocaleString('id-ID')}
        note="Tidak dihitung di pendaftaran"
        size={kpiSize}
      />,
      <Kpi
        key="periksa"
        label="Antre & diperiksa (hari ini)"
        value={(active.antri + active.sedang_periksa).toLocaleString('id-ID')}
        note={`${active.antri} antre, ${active.sedang_periksa} sedang diperiksa`}
        size={kpiSize}
      />,
      <Kpi
        key="inap"
        label="Status rawat inap (hari ini)"
        value={active.rawat_inap.toLocaleString('id-ID')}
        note="Dari pendaftaran hari ini"
        size={kpiSize}
      />,
    ];

    content = (
      <>
        {header}

        {simrsWarning && (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
          >
            ⚠️ {simrsWarning} Pastikan terhubung ke jaringan/VPN RS, lalu restart backend.
          </div>
        )}

        {error && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
            Gagal memperbarui: {error}. Menampilkan data terakhir.
          </div>
        )}

        {/* Badan halaman: meredup sebentar saat data periode baru dimuat */}
        <div
          aria-busy={stale}
          className={`flex min-h-0 flex-1 flex-col transition-opacity ${stale ? 'opacity-50' : ''}`}
        >
          <Carousel items={cards} />

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-12 lg:grid-rows-[repeat(3,minmax(230px,1fr))]">
            {/* Baris 1 */}
            <Panel
              title={`Pendapatan per ${unit === 'jam' ? 'jam' : unit}`}
              aside={<LineLegend cur={curName} prev={prevName} color={LINE_REV} />}
              className="lg:col-span-5"
            >
              <CompareChart rows={compareRows} metric="rev" color={LINE_REV} fmt={fmtRp} fs={fs} targetDaily={targetDaily} />
            </Panel>

            <Panel
              title={`Kunjungan per ${unit === 'jam' ? 'jam' : unit}`}
              aside={<LineLegend cur={curName} prev={prevName} color={LINE_VIS} />}
              className="lg:col-span-4"
            >
              <CompareChart rows={compareRows} metric="vis" color={LINE_VIS} fmt={fmtVisits} fs={fs} />
            </Panel>

            <Panel title="Kategori pembayaran" aside={fmtRpShort(sumOf(kategori))} className="lg:col-span-3">
              {kategori.length === 0 ? (
                <Empty text="Belum ada data penjamin." />
              ) : (
                <PieLegend items={kategori} total={sumOf(kategori)} fs={fs} />
              )}
            </Panel>

            {/* Baris 2 */}
            <Panel title="Ruangan Rawat Jalan" aside={fmtRpShort(sumOf(roomsRJ))} className="lg:col-span-4">
              {rank(roomsRJ, 'Belum ada data ruangan rawat jalan.')}
            </Panel>

            <Panel title="Ruangan Rawat Inap" aside={fmtRpShort(sumOf(roomsRI))} className="lg:col-span-4">
              {rank(roomsRI, 'Belum ada data ruangan rawat inap.')}
            </Panel>

            <Panel
              title="Pendaftaran hari ini per ruangan"
              aside={`${fmtPatients(activeTotal)}, ${active.batal.toLocaleString('id-ID')} batal`}
              className="lg:col-span-4"
            >
              {activeRows.length === 0 ? (
                <Empty text="Belum ada pendaftaran hari ini." />
              ) : (
                <MiniTable head={['Ruangan', 'Pasien', 'Batal', '%']} rows={activeRows} big={isFull} />
              )}
            </Panel>

            {/* Baris 3 - Slider Informasi Pendukung & Farmasi */}
            <div className="lg:col-span-12">
              <Carousel
                items={[
                  <Panel key="inst" title="Pendapatan per instalasi" aside={fmtRpShort(sumOf(instalasi))}>
                    {rank(instalasi, 'Belum ada data instalasi.')}
                  </Panel>,
                  <Panel key="pjm" title="Penjamin teratas" aside={`${penjaminRows.length} dari ${patients.length}`}>
                    {penjaminRows.length === 0 ? <Empty text="Belum ada data penjamin." /> : <MiniTable head={['Penjamin', 'Kunj.', 'Pendapatan', '%']} rows={penjaminRows} big={isFull} />}
                  </Panel>,
                  <Panel key="comp" title="Komponen tarif" aside={`${komponenRows.length} dari ${comps.length}`}>
                    {komponenRows.length === 0 ? <Empty text="Belum ada data komponen." /> : <MiniTable head={['Komponen', 'Total', '%']} rows={komponenRows} big={isFull} />}
                  </Panel>,
                  <Panel key="ph_summary" title="Ringkasan Farmasi" aside={fmtRpShort(pharmacy_summary.total_revenue)}>
                    <div className="grid grid-cols-2 gap-4 h-full p-2">
                      <div className="flex flex-col justify-center border-r border-[#1F2937]">
                        <span className="text-[10px] text-[#94A3B8] uppercase">Laba Kotor</span>
                        <span className="text-lg font-bold text-[#00A693]">{fmtRpShort(pharmacy_summary.total_revenue - pharmacy_summary.total_hpp)}</span>
                        <span className="text-[10px] text-[#94A3B8] mt-1">Margin: {pharmacy_summary.total_revenue > 0 ? ((pharmacy_summary.total_revenue - pharmacy_summary.total_hpp) / pharmacy_summary.total_revenue * 100).toFixed(1) : 0}%</span>
                      </div>
                      <div className="flex flex-col justify-center">
                        <span className="text-[10px] text-[#94A3B8] uppercase">Volume Terjual</span>
                        <span className="text-lg font-bold text-[#F8FAFC]">{pharmacy_summary.total_qty.toLocaleString('id-ID')} <small className="text-[10px] font-normal text-[#94A3B8]">item</small></span>
                        <span className="text-[10px] text-[#94A3B8] mt-1">{pharmacy_summary.total_kunjungan ?? 0} kunjungan</span>
                      </div>
                    </div>
                  </Panel>,
                  <Panel key="ph_drugs" title="Obat Terlaris" aside={`Top ${drugRows.length} obat`}>
                    {drugRows.length === 0 ? <Empty text="Belum ada data penjualan obat." /> : <MiniTable head={['Nama Obat', 'Total', '%']} rows={drugRows} big={isFull} />}
                  </Panel>,
                  <Panel key="ph_rooms" title="Penjualan Farmasi per Ruangan" aside={fmtRpShort(pharmacy_rooms.reduce((s: number, r: any) => s + (r.revenue || 0), 0))}>
                    {phRoomRows.length === 0 ? <Empty text="Belum ada data farmasi per ruangan." /> : <MiniTable head={['Ruangan', 'Revenue', 'Qty']} rows={phRoomRows} big={isFull} />}
                  </Panel>,
                  <Panel key="ph_retur" title="Obat Retur" aside={`${pharmacy_summary.jumlah_retur ?? 0}x retur`}>
                    <div className="flex flex-col justify-center items-center h-full p-4">
                      <span className="text-sm text-[#94A3B8] mb-2">Total Nilai Retur</span>
                      <span className="text-2xl font-bold text-red-400">{fmtRpShort(pharmacy_summary.total_retur)}</span>
                      <span className="text-xs text-[#64748B] mt-2">{pharmacy_summary.jumlah_retur ?? 0} transaksi retur</span>
                      <span className="text-xs text-[#64748B]">{pharmacy_summary.total_retur > 0 && pharmacy_summary.total_revenue > 0 ? `${((pharmacy_summary.total_retur / pharmacy_summary.total_revenue) * 100).toFixed(2)}% dari total penjualan` : 'Tidak ada retur'}</span>
                    </div>
                  </Panel>,
                ]}
              />
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ---------------------------- kerangka --------------------------- */
  // Sidebar tetap ter-mount; saat layar penuh, panel di bawah menutupinya
  // (fixed + z lebih tinggi), jadi state sidebar tidak hilang.
  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto slim-scroll">
        <div className="w-full px-3 pb-4 pt-14 sm:px-4 lg:pt-4">
          <div className={isFull ? '' : 'mx-auto max-w-[1800px]'}>
            <div
              ref={rootRef}
              className={
                isFull
                  ? 'fixed inset-0 z-[60] flex flex-col overflow-y-auto slim-scroll bg-[#0b1120] p-4'
                  : 'flex flex-col rounded-xl bg-[#0b1120b8] p-3 lg:min-h-[calc(100vh-2rem)]'
              }
            >
              {content}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
