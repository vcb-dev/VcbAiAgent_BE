import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NasSyncStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiClientService } from '../studio/ai-client.service';

/** Thứ tự thư mục trên ổ; dùng làm mã loại ở cả nhánh Visual lẫn Chế tác. */
const CATEGORY_LABELS: Record<string, string> = {
  '1': 'Nhẫn',
  '2': 'Lắc tay',
  '3': 'Bông tai',
  '4': 'Dây chuyền',
};

/** Tuyến A4 dùng 4 công đoạn chế tác và 2 cảnh HuyK xen giữa. */
const CRAFT_SLOTS = 4;
const HUYK_SLOTS = 2;

/** Thứ tự quy trình kim hoàn — khớp CRAFT_FORMULA bên FE / VCB_AI. */
const STEP_ORDER = [
  'thiet_ke',
  'chuan_bi_nguyen_lieu',
  'nung_nau',
  'do_khuon',
  'dap_can',
  'tao_dang',
  'cua_cat',
  'han',
  'dua_mai',
  'khoan',
  'gan_da_chu',
  'dinh_da',
  'lam_sach',
  'danh_bong',
  'khac_laser',
  'hoan_thien',
] as const;

/** 4 ô chế tác A4 chia đều quy trình, từ khâu đầu tới khâu cuối. */
const CRAFT_FORMULA: readonly (readonly string[])[] = [
  ['thiet_ke', 'chuan_bi_nguyen_lieu', 'nung_nau'],
  ['do_khuon', 'dap_can', 'tao_dang', 'cua_cat'],
  ['han', 'dua_mai', 'khoan', 'gan_da_chu'],
  ['dinh_da', 'lam_sach', 'danh_bong', 'khac_laser', 'hoan_thien'],
];

type ScannedProduct = { sku: string; name: string; folders: string[]; paths: string[] };
type ScannedCategory = { id: string; label: string; products: ScannedProduct[] };
type ScannedStep = {
  shoot?: string;
  index: number | null;
  name: string;
  folder: string;
  step: string | null;
  clips: number;
  path: string;
};

/**
 * Kho footage cho Studio.
 *
 * Duyệt ổ mạng mất hàng chục giây nên web không bao giờ đọc thẳng ổ: VCB_AI quét,
 * dữ liệu nằm sẵn trong Postgres, và đồng bộ chỉ chạy khi được gọi. Riêng công đoạn
 * chế tác quét theo từng sản phẩm lúc người dùng chọn — quét sẵn cả 339 sản phẩm thì
 * quá lâu mà phần lớn không dùng tới.
 */
@Injectable()
export class NasService {
  private readonly logger = new Logger(NasService.name);
  /** Chặn hai lần đồng bộ cùng phạm vi chạy chồng lên nhau trên cùng ổ. */
  private readonly running = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClientService,
  ) {}

  // --- Đọc từ DB: web chỉ gọi những hàm dưới đây ---------------------------

  async categories() {
    const [rows, ready] = await Promise.all([
      this.prisma.nasCategory.findMany({
        orderBy: { code: 'asc' },
        include: { _count: { select: { products: true } } },
      }),
      this.prisma.nasProduct.groupBy({
        by: ['categoryCode'],
        where: { craftSteps: { some: {} } },
        _count: { _all: true },
      }),
    ]);
    const readyBy = Object.fromEntries(ready.map((r) => [r.categoryCode, r._count._all]));
    return rows.map((c) => ({
      code: c.code,
      label: c.label,
      products: c._count.products,
      ready: readyBy[c.code] ?? 0,
      syncedAt: c.syncedAt,
    }));
  }

  async products(categoryCode: string, search?: string, readyOnly = false) {
    const rows = await this.prisma.nasProduct.findMany({
      where: {
        categoryCode,
        ...(readyOnly ? { craftSteps: { some: {} } } : {}),
        ...(search?.trim()
          ? {
              OR: [
                { sku: { contains: search.trim(), mode: 'insensitive' as const } },
                { name: { contains: search.trim(), mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { sku: 'asc' },
      select: { sku: true, name: true, folders: true, craftSyncedAt: true },
    });
    return rows;
  }

  /**
   * Công đoạn chế tác của một sản phẩm. Lần đầu chưa có trong DB thì quét ổ ngay
   * (khoảng vài giây) rồi lưu lại, các lần sau trả về tức thì.
   */
  async craftSteps(categoryCode: string, sku: string, forceRefresh = false) {
    const product = await this.prisma.nasProduct.findUnique({
      where: { categoryCode_sku: { categoryCode, sku } },
      select: { id: true, craftSyncedAt: true },
    });
    if (!product) throw new NotFoundException(`Không có sản phẩm ${sku} trong loại ${categoryCode}`);

    if (forceRefresh || !product.craftSyncedAt) {
      await this.syncCraftSteps(categoryCode, sku);
    }
    return this.prisma.nasCraftStep.findMany({
      where: { productId: product.id },
      orderBy: [{ shoot: 'asc' }, { orderIndex: 'asc' }, { name: 'asc' }],
      select: {
        shoot: true,
        orderIndex: true,
        name: true,
        folder: true,
        step: true,
        clips: true,
        path: true,
      },
    });
  }

  huykActions() {
    return this.prisma.nasHuykAction.findMany({
      orderBy: [{ orderIndex: 'asc' }, { name: 'asc' }],
      select: { orderIndex: true, name: true, folder: true, step: true, clips: true, path: true },
    });
  }

  /**
   * Kế hoạch tuyến A4 cho một mã: 4 công đoạn chế tác xen 2 cảnh HuyK.
   *
   * Bốn ô chế tác luôn theo thứ tự quy trình (công thức 4 nhóm), không bốc theo số
   * thư mục trên ổ — số folder hay lệch so với khâu thật (cưa trước nung, …).
   * HuyK vẫn bốc ngẫu nhiên trong kho chung.
   */
  async a4Plan(categoryCode: string, sku: string) {
    const [steps, actions] = await Promise.all([
      this.craftSteps(categoryCode, sku),
      this.huykActions(),
    ]);

    const craft = formulaPick(steps, CRAFT_SLOTS);
    const shoots = [...new Set(steps.map((s) => s.shoot))];

    return {
      sku,
      shoot: craft[0]?.shoot ?? pickOne(shoots) ?? null,
      shoots: shoots.length,
      craft,
      huyk: pickMany(actions, HUYK_SLOTS),
    };
  }

  async status() {
    const [nas, lastRuns, products, craftSynced, actions] = await Promise.all([
      this.ai
        .request<{ mounted: boolean; root: string }>('get', '/nas/status')
        .catch(() => ({ mounted: false, root: '' })),
      this.prisma.nasSyncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 5 }),
      this.prisma.nasProduct.count(),
      this.prisma.nasProduct.count({ where: { craftSyncedAt: { not: null } } }),
      this.prisma.nasHuykAction.count(),
    ]);
    return {
      nas,
      products,
      huykActions: actions,
      craft: { synced: craftSynced, total: products, running: this.running.has('craft-all') },
      recentSyncs: lastRuns.map(serializeRun),
    };
  }

  /**
   * Kéo footage của tuyến A4 về máy để dựng được.
   *
   * Kho trên ổ chỉ có mục lục, clip vẫn nằm ngoài mạng. Hàm này gom đúng các thư mục của
   * kế hoạch A4 — cảnh sản phẩm, 4 công đoạn, 2 cảnh HuyK — rồi để VCB_AI tải về và nén
   * thành proxy. Mất vài phút, nhưng chỉ lần đầu của mỗi mã.
   */
  async prepareFootage(categoryCode: string, sku: string, plan: { craft?: string[]; huyk?: string[] }) {
    const product = await this.prisma.nasProduct.findUnique({
      where: { categoryCode_sku: { categoryCode, sku } },
      select: { paths: true },
    });
    if (!product) throw new NotFoundException(`Không có sản phẩm ${sku} trong loại ${categoryCode}`);

    const sources = [
      ...product.paths.map((folder) => ({ slot: 'product', folder, name: sku })),
      ...(plan.craft ?? []).map((folder) => ({ slot: 'craft', folder, name: '' })),
      ...(plan.huyk ?? []).map((folder) => ({ slot: 'huyk', folder, name: '' })),
    ];
    return this.once(`prepare:${sku}`, () =>
      this.ai.request('post', '/nas/prepare', {
        data: { sku, sources },
        timeoutMs: 30 * 60_000,
      }),
    );
  }

  // --- Đồng bộ: chọc vào ổ rồi ghi đè bản trong DB -------------------------

  /** Quét toàn bộ loại + sản phẩm từ nhánh Visual. Mất khoảng 2 phút. */
  syncProducts() {
    return this.once('products', async () => {
      const run = await this.startRun('products');
      try {
        const { categories } = await this.ai.request<{ categories: ScannedCategory[] }>(
          'get',
          '/nas/scan/products',
          { timeoutMs: 15 * 60_000 },
        );

        let items = 0;
        for (const category of categories) {
          const label = CATEGORY_LABELS[category.id] ?? category.label;
          await this.prisma.nasCategory.upsert({
            where: { code: category.id },
            create: { code: category.id, label, syncedAt: new Date() },
            update: { label, syncedAt: new Date() },
          });

          // Sản phẩm bị gỡ khỏi ổ thì cũng biến khỏi danh sách chọn.
          const skus = category.products.map((p) => p.sku);
          await this.prisma.nasProduct.deleteMany({
            where: { categoryCode: category.id, sku: { notIn: skus } },
          });

          for (const p of category.products) {
            await this.prisma.nasProduct.upsert({
              where: { categoryCode_sku: { categoryCode: category.id, sku: p.sku } },
              create: { categoryCode: category.id, ...p },
              update: { name: p.name, folders: p.folders, paths: p.paths },
            });
          }
          items += category.products.length;
          this.logger.log(`Đồng bộ ${label}: ${category.products.length} sản phẩm`);
        }
        return this.finishRun(run, items);
      } catch (e) {
        await this.failRun(run, e);
        throw e;
      }
    });
  }

  /** Quét công đoạn chế tác của đúng một sản phẩm. */
  syncCraftSteps(categoryCode: string, sku: string) {
    return this.once(`craft:${categoryCode}:${sku}`, async () => {
      const product = await this.prisma.nasProduct.findUnique({
        where: { categoryCode_sku: { categoryCode, sku } },
        select: { id: true },
      });
      if (!product) throw new NotFoundException(`Không có sản phẩm ${sku} trong loại ${categoryCode}`);

      const run = await this.startRun(`craft:${sku}`);
      try {
        const { steps } = await this.ai.request<{ steps: ScannedStep[] }>(
          'get',
          `/nas/scan/craft-steps?category=${encodeURIComponent(categoryCode)}&sku=${encodeURIComponent(sku)}`,
          { timeoutMs: 10 * 60_000 },
        );

        await this.prisma.$transaction([
          this.prisma.nasCraftStep.deleteMany({ where: { productId: product.id } }),
          this.prisma.nasCraftStep.createMany({
            data: steps.map((s) => ({
              productId: product.id,
              shoot: s.shoot ?? '',
              orderIndex: s.index,
              name: s.name,
              folder: s.folder,
              step: s.step,
              clips: s.clips,
              path: s.path,
            })),
          }),
          this.prisma.nasProduct.update({
            where: { id: product.id },
            data: { craftSyncedAt: new Date() },
          }),
        ]);
        return this.finishRun(run, steps.length);
      } catch (e) {
        await this.failRun(run, e);
        throw e;
      }
    });
  }

  /**
   * Nạp công đoạn chế tác của mọi sản phẩm vào DB.
   *
   * Quét một mã mất khoảng một phút nên cả kho mất vài giờ — chạy nền và ghi dần từng
   * sản phẩm, xem tiến độ qua `status()`. Mã nào đã có trong DB thì bỏ qua, nên lần chạy
   * sau tiếp tục được từ chỗ dở.
   */
  async syncAllCraftSteps() {
    if (this.running.has('craft-all')) return { running: true, message: 'Đang chạy rồi' };

    const pending = await this.prisma.nasProduct.findMany({
      where: { craftSyncedAt: null },
      select: { categoryCode: true, sku: true },
      orderBy: [{ categoryCode: 'asc' }, { sku: 'asc' }],
    });
    const run = await this.startRun('craft-all');

    // Vòng quét chạy ở nền để HTTP trả về ngay; giữ chỗ trong `running` suốt thời gian đó.
    const task = (async () => {
      let done = 0;
      for (const p of pending) {
        try {
          await this.syncCraftSteps(p.categoryCode, p.sku);
        } catch (e) {
          // Một mã hỏng không nên chặn cả kho; lần chạy sau sẽ thử lại mã đó.
          this.logger.warn(`Bỏ qua ${p.sku}: ${e instanceof Error ? e.message : String(e)}`);
        }
        done += 1;
        await this.prisma.nasSyncRun.update({ where: { id: run.id }, data: { items: done } });
      }
      await this.prisma.nasSyncRun.update({
        where: { id: run.id },
        data: { status: NasSyncStatus.success, finishedAt: new Date() },
      });
      this.logger.log(`Đã nạp xong công đoạn chế tác: ${done}/${pending.length} sản phẩm`);
    })().finally(() => this.running.delete('craft-all'));

    this.running.set('craft-all', task);
    return { running: true, pending: pending.length, run: serializeRun(run) };
  }

  /** Quét kho HuyK thao tác (47 thư mục hành động). */
  syncHuykActions() {
    return this.once('huyk', async () => {
      const run = await this.startRun('huyk');
      try {
        const { actions } = await this.ai.request<{ actions: ScannedStep[] }>(
          'get',
          '/nas/scan/huyk-actions',
          { timeoutMs: 10 * 60_000 },
        );

        const folders = actions.map((a) => a.folder);
        await this.prisma.nasHuykAction.deleteMany({ where: { folder: { notIn: folders } } });
        for (const a of actions) {
          const data = {
            orderIndex: a.index,
            name: a.name,
            step: a.step,
            clips: a.clips,
            path: a.path,
            syncedAt: new Date(),
          };
          await this.prisma.nasHuykAction.upsert({
            where: { folder: a.folder },
            create: { folder: a.folder, ...data },
            update: data,
          });
        }
        return this.finishRun(run, actions.length);
      } catch (e) {
        await this.failRun(run, e);
        throw e;
      }
    });
  }

  // --- Phụ trợ -------------------------------------------------------------

  /** Gộp các lời gọi trùng phạm vi vào cùng một lần quét đang chạy. */
  private once<T>(scope: string, task: () => Promise<T>): Promise<T> {
    const inflight = this.running.get(scope) as Promise<T> | undefined;
    if (inflight) return inflight;

    const p = task().finally(() => this.running.delete(scope));
    this.running.set(scope, p);
    return p;
  }

  private startRun(scope: string) {
    return this.prisma.nasSyncRun.create({ data: { scope } });
  }

  private async finishRun(run: { id: bigint }, items: number) {
    const done = await this.prisma.nasSyncRun.update({
      where: { id: run.id },
      data: { status: NasSyncStatus.success, items, finishedAt: new Date() },
    });
    return serializeRun(done);
  }

  private async failRun(run: { id: bigint }, e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    this.logger.error(`Đồng bộ ổ NAS thất bại: ${message}`);
    await this.prisma.nasSyncRun.update({
      where: { id: run.id },
      data: { status: NasSyncStatus.failed, error: message.slice(0, 500), finishedAt: new Date() },
    });
  }
}

function pickOne<T>(items: T[]): T | undefined {
  return items.length ? items[Math.floor(Math.random() * items.length)] : undefined;
}

/** Bốc ngẫu nhiên tối đa `count` phần tử khác nhau. */
function pickMany<T>(items: T[], count: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (pool.length && out.length < count) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

function stepRank(step: string | null | undefined): number {
  const i = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number]);
  return i < 0 ? 999 : i;
}

/**
 * Bốc đúng `count` thư mục theo công thức 4 nhóm, luôn trả về theo thứ tự quy trình.
 * Trong một nhóm, nếu có nhiều thư mục thì bốc ngẫu nhiên để lần "đổi cảnh" khác folder,
 * nhưng ô 1 vẫn là khâu đầu, ô 4 vẫn là khâu cuối.
 */
function formulaPick(
  items: Array<{
    shoot?: string;
    orderIndex?: number | null;
    name: string;
    folder: string;
    step: string | null;
    clips: number;
    path: string;
  }>,
  count: number,
): typeof items {
  if (items.length <= count) {
    return [...items].sort(
      (a, b) =>
        stepRank(a.step) - stepRank(b.step) || (a.orderIndex ?? 99) - (b.orderIndex ?? 99),
    );
  }
  const byProcess = [...items].sort(
    (a, b) => stepRank(a.step) - stepRank(b.step) || (a.orderIndex ?? 99) - (b.orderIndex ?? 99),
  );
  const used = new Set<string>();
  const out: typeof items = [];
  for (const wanted of CRAFT_FORMULA.slice(0, count)) {
    const free = byProcess.filter((f) => f.path && !used.has(f.path));
    const matches = free.filter((f) => f.step && wanted.includes(f.step));
    const pool = matches.length ? matches : free;
    if (!pool.length) continue;
    const hit = pool[Math.floor(Math.random() * pool.length)];
    used.add(hit.path);
    out.push(hit);
  }
  return out;
}

function serializeRun(run: {
  id: bigint;
  scope: string;
  status: NasSyncStatus;
  items: number;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}) {
  return { ...run, id: run.id.toString() };
}
