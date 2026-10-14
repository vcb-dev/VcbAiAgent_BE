/** Tạo tài khoản admin đầu tiên:  npm run seed:admin */
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@vcb.vn').toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'Vcb@12345';

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash: await bcrypt.hash(password, 12),
      fullName: 'Quản trị hệ thống',
      roles: [UserRole.admin],
    },
  });

  console.log(`admin: ${user.email} (id=${user.id})`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`mật khẩu mặc định: ${password} — đổi ngay sau lần đăng nhập đầu tiên`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
