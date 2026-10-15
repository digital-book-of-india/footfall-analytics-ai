import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from './db/connection.js';
import { UserModel } from './models/User.js';
import { ShopModel } from './models/Shop.js';

async function seed() {
  console.log('[Seed] Starting database seed...');
  await connectDatabase();

  try {
    const salt = await bcrypt.genSalt(10);
    const defaultPasswordHash = await bcrypt.hash('Password@123', salt);

    // 1. Seed Super Admin
    let admin = await UserModel.findOne({ email: 'admin@dbi.ai' });
    if (!admin) {
      admin = await UserModel.create({
        name: 'Super Admin',
        email: 'admin@dbi.ai',
        passwordHash: defaultPasswordHash,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      });
      console.log(`[Seed] Created Super Admin: admin@dbi.ai / Password@123 (ID: ${admin._id})`);
    } else {
      console.log(`[Seed] Super Admin already exists: admin@dbi.ai`);
    }

    // 2. Seed Primary Shop Owner
    let owner = await UserModel.findOne({ email: 'owner@demo.com' });
    if (!owner) {
      owner = await UserModel.create({
        name: 'Demo Shop Owner',
        email: 'owner@demo.com',
        passwordHash: defaultPasswordHash,
        role: 'SHOP_OWNER',
        status: 'ACTIVE',
      });
      console.log(`[Seed] Created Demo Owner: owner@demo.com / Password@123 (ID: ${owner._id})`);
    } else {
      console.log(`[Seed] Demo Owner already exists: owner@demo.com`);
    }

    // 3. Seed Primary Shop
    let shop = await ShopModel.findOne({ ownerUserId: owner._id, name: 'DBI Flagship Retail Store' });
    if (!shop) {
      shop = await ShopModel.create({
        ownerUserId: owner._id,
        name: 'DBI Flagship Retail Store',
        timezone: 'Asia/Kolkata',
        status: 'ACTIVE',
        occupancyBaseline: 0,
      });
      console.log(`[Seed] Created Primary Shop: 'DBI Flagship Retail Store' (ID: ${shop._id})`);
    } else {
      console.log(`[Seed] Primary Shop already exists (ID: ${shop._id})`);
    }

    // 4. Seed Secondary Owner for Tenant Isolation Testing
    let otherOwner = await UserModel.findOne({ email: 'other@demo.com' });
    if (!otherOwner) {
      otherOwner = await UserModel.create({
        name: 'Second Shop Owner',
        email: 'other@demo.com',
        passwordHash: defaultPasswordHash,
        role: 'SHOP_OWNER',
        status: 'ACTIVE',
      });
      console.log(`[Seed] Created Second Owner: other@demo.com / Password@123 (ID: ${otherOwner._id})`);
    }

    // 5. Seed Secondary Shop
    let otherShop = await ShopModel.findOne({ ownerUserId: otherOwner._id, name: 'Downtown Fashion Boutique' });
    if (!otherShop) {
      otherShop = await ShopModel.create({
        ownerUserId: otherOwner._id,
        name: 'Downtown Fashion Boutique',
        timezone: 'Asia/Kolkata',
        status: 'ACTIVE',
        occupancyBaseline: 0,
      });
      console.log(`[Seed] Created Second Shop: 'Downtown Fashion Boutique' (ID: ${otherShop._id})`);
    }

    console.log('[Seed] Database seeding completed successfully! ✨');
  } catch (err) {
    console.error('[Seed] Error during seeding:', err);
  } finally {
    await disconnectDatabase();
  }
}

seed();
