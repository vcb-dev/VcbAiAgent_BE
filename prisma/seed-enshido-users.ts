/** Nạp tài khoản xưởng còn thiếu. Chạy: npx ts-node prisma/seed-enshido-users.ts */
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'Enshido@123';

const PEOPLE: { username: string; titles: string; roles: UserRole[] }[] = [
  { username: 'buique', titles: 'Admin', roles: [UserRole.admin] },
  { username: 'tranphuong', titles: 'Admin, QC', roles: [UserRole.admin] },
  { username: 'nguyenmai', titles: 'Thủ kho, kế toán', roles: [UserRole.manager] },
  { username: 'nguyenhuy', titles: 'Thợ nguội, thợ vào đá', roles: [UserRole.editor] },
  { username: 'lehoang', titles: 'Thợ nguội, thợ vào đá', roles: [UserRole.editor] },
  { username: 'vantuan', titles: 'Thợ nguội, thợ vào đá, thợ sửa chữa hàng', roles: [UserRole.editor] },
  { username: 'nguyenphi', titles: 'Thợ nguội, thợ vào đá', roles: [UserRole.editor] },
  { username: 'conghoang', titles: 'Thợ xi, thợ đánh bóng, thợ sửa chữa hàng', roles: [UserRole.editor] },
  { username: 'haphuong', titles: 'Thợ nguội', roles: [UserRole.editor] },
  { username: 'vanhuy', titles: 'Thợ nguội, thợ vào đá', roles: [UserRole.editor] },
  { username: 'minhhuan', titles: 'Thợ nguội, thợ vào đá', roles: [UserRole.editor] },
  { username: 'thuyhoai', titles: 'Thợ nguội, thợ vào đá, thợ đánh bóng', roles: [UserRole.editor] },
  { username: 'vanlan', titles: 'Thợ nguội, thợ vào đá', roles: [UserRole.editor] },
  { username: 'maingoc', titles: 'Thợ nguội', roles: [UserRole.editor] },
  { username: 'vanan', titles: 'Thợ nguội, thợ vào đá', roles: [UserRole.editor] },
  { username: 'huuhoang', titles: 'Thợ xi, thợ đánh bóng, thợ sửa chữa hàng', roles: [UserRole.editor] },
  { username: 'habang', titles: 'Thợ nguội', roles: [UserRole.editor] },
  { username: 'theanh', titles: '3D', roles: [UserRole.editor] },
  { username: 'ductuan', titles: 'Thợ nguội', roles: [UserRole.editor] },
  { username: 'vannhat', titles: 'Thợ xi, thợ đánh bóng, thợ sửa chữa hàng', roles: [UserRole.editor] },
];

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);
  let created = 0;
  let existed = 0;
  for (const p of PEOPLE) {
    const email = `${p.username}@vcb.vn`;
    const found = await prisma.user.findUnique({ where: { email } });
    if (found) {
      existed += 1;
      console.log(`đã có  ${email}`);
      continue;
    }
    await prisma.user.create({
      data: {
        email,
        passwordHash: hash,
        fullName: `${p.username} · ${p.titles}`,
        roles: p.roles,
      },
    });
    created += 1;
    console.log(`tạo mới ${email}  [${p.roles.join(',')}]`);
  }
  console.log(`xong: tạo ${created} · bỏ qua ${existed} đã có`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
