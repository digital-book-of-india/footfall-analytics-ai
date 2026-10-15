import mongoose from 'mongoose';
import { escapeRegex } from './admin.validation';

export type EvaluatedStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'NEEDS_SETUP';

export function deriveCameraStatus(
  status: string | undefined, 
  lastHeartbeatAt: Date | string | null | undefined, 
  nowMs: number = Date.now()
): EvaluatedStatus {
  if (!lastHeartbeatAt) {
    return 'NEEDS_SETUP';
  }
  const hbMs = new Date(lastHeartbeatAt).getTime();
  if (nowMs - hbMs > 90000) {
    return 'OFFLINE';
  }
  if (status === 'DEGRADED' || status === 'CONFIG_ERROR') {
    return 'DEGRADED';
  }
  return 'ONLINE';
}

const getDb = () => mongoose.connection;
const getAuditColl = () => getDb().collection('auditlogs');

export async function fetchPlatformOverview() {
  const db = getDb();
  const [totalShops, activeShops, suspendedShops, totalCameras, allCameras] = await Promise.all([
    db.collection('shops').countDocuments(),
    db.collection('shops').countDocuments({ status: 'ACTIVE' }),
    db.collection('shops').countDocuments({ status: 'SUSPENDED' }),
    db.collection('cameras').countDocuments(),
    db.collection('cameras').find({}, { projection: { status: 1, lastHeartbeatAt: 1 } }).toArray()
  ]);

  const now = Date.now();
  let onlineCameras = 0;
  let degradedCameras = 0;
  let offlineCameras = 0;
  let latestHeartbeat: Date | null = null;

  for (const cam of allCameras) {
    if (cam.lastHeartbeatAt) {
      const hbTime = new Date(cam.lastHeartbeatAt).getTime();
      if (!latestHeartbeat || hbTime > new Date(latestHeartbeat).getTime()) {
        latestHeartbeat = cam.lastHeartbeatAt;
      }
    }
    const evaluated = deriveCameraStatus(cam.status, cam.lastHeartbeatAt, now);
    if (evaluated === 'ONLINE') onlineCameras++;
    else if (evaluated === 'DEGRADED') degradedCameras++;
    else offlineCameras++;
  }

  const isWorkerOnline = totalCameras > 0 && latestHeartbeat && (now - new Date(latestHeartbeat).getTime() <= 90000);

  return {
    totalShops,
    activeShops,
    suspendedShops,
    totalCameras,
    onlineCameras,
    degradedCameras,
    offlineCameras,
    workerHealth: {
      status: totalCameras === 0 ? 'NEEDS_SETUP' : (isWorkerOnline ? 'ONLINE' : 'OFFLINE'),
      lastHeartbeatAt: latestHeartbeat
    }
  };
}

export async function fetchShopsDirectory(page: number, limit: number, status?: string, search?: string) {
  const db = getDb();
  const matchStage: Record<string, any> = {};
  if (status && ['ACTIVE', 'SUSPENDED'].includes(status)) {
    matchStage.status = status;
  }

  const pipeline: any[] = [
    { $match: matchStage },
    {
      $lookup: {
        from: 'users',
        localField: 'ownerUserId',
        foreignField: '_id',
        as: 'owner'
      }
    },
    { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'cameras',
        localField: '_id',
        foreignField: 'shopId',
        as: 'cameras'
      }
    },
    {
      $project: {
        _id: 1,
        name: 1,
        timezone: 1,
        status: 1,
        occupancyBaseline: 1,
        createdAt: 1,
        cameraCount: { $size: '$cameras' },
        ownerEmail: '$owner.email',
        ownerName: '$owner.name'
      }
    }
  ];

  if (search) {
    const escaped = escapeRegex(search);
    pipeline.push({
      $match: {
        $or: [
          { name: { $regex: escaped, $options: 'i' } },
          { ownerEmail: { $regex: escaped, $options: 'i' } }
        ]
      }
    });
  }

  const countPipeline = [...pipeline, { $count: 'total' }];
  const countResult = await db.collection('shops').aggregate(countPipeline).toArray();
  const total = countResult[0]?.total || 0;

  pipeline.push({ $sort: { createdAt: -1 } });
  pipeline.push({ $skip: (page - 1) * limit });
  pipeline.push({ $limit: limit });

  const items = await db.collection('shops').aggregate(pipeline).toArray();
  return { items, total, page, limit };
}

export async function fetchMerchantsDirectory(page: number, limit: number, search?: string) {
  const db = getDb();
  const matchStage: Record<string, any> = { role: 'SHOP_OWNER' };
  if (search) {
    const escaped = escapeRegex(search);
    matchStage.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { email: { $regex: escaped, $options: 'i' } }
    ];
  }

  const pipeline: any[] = [
    { $match: matchStage },
    {
      $lookup: {
        from: 'shops',
        localField: '_id',
        foreignField: 'ownerUserId',
        as: 'shops'
      }
    },
    {
      $project: {
        _id: 1,
        name: 1,
        email: 1,
        status: 1,
        createdAt: 1,
        shopsCount: { $size: '$shops' }
      }
    },
    { $sort: { createdAt: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit }
  ];

  const [items, total] = await Promise.all([
    db.collection('users').aggregate(pipeline).toArray(),
    db.collection('users').countDocuments(matchStage)
  ]);

  return { items, total, page, limit };
}

export async function executeAtomicStatusUpdate(
  shopId: string, 
  status: 'ACTIVE' | 'SUSPENDED', 
  reason: string, 
  actorUserId: string, 
  requestId: string
) {
  const db = getDb();
  const shopsColl = db.collection('shops');
  const auditColl = getAuditColl();

  const shopObjectId = new mongoose.Types.ObjectId(shopId);
  const actorObjectId = new mongoose.Types.ObjectId(actorUserId);

  const updateResult = await shopsColl.updateOne(
    { _id: shopObjectId, status: { $ne: status } },
    { $set: { status, updatedAt: new Date() } }
  );

  if (updateResult.matchedCount === 0) {
    const exists = await shopsColl.findOne({ _id: shopObjectId });
    if (!exists) {
      throw { statusCode: 404, code: 'SHOP_NOT_FOUND', message: 'Target shop does not exist' };
    }
    throw { statusCode: 409, code: 'STATUS_CONFLICT', message: `Shop is already marked as ${status}` };
  }

  const auditId = new mongoose.Types.ObjectId();
  await auditColl.insertOne({
    _id: auditId,
    actor: actorObjectId,
    action: `SHOP_${status}`,
    target: shopObjectId,
    targetType: 'SHOP',
    reason: reason.trim(),
    status: 'SUCCESS',
    requestId,
    createdAt: new Date()
  });

  return { shopId, status, auditLogId: auditId };
}

export async function fetchCameraFleetHealth() {
  const db = getDb();
  const rawCameras = await db.collection('cameras').aggregate([
    {
      $lookup: {
        from: 'shops',
        localField: 'shopId',
        foreignField: '_id',
        as: 'shop'
      }
    },
    { $unwind: { path: '$shop', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        name: 1,
        shopName: '$shop.name',
        connectionType: 1,
        status: 1,
        lastHeartbeatAt: 1,
        safeErrorCode: 1,
        updatedAt: 1
      }
    },
    { $sort: { updatedAt: -1 } }
  ]).toArray();

  const now = Date.now();
  const items = rawCameras.map(c => ({
    id: c._id,
    name: c.name,
    shopName: c.shopName || 'Unknown Shop',
    connectionType: c.connectionType || 'RTSP',
    status: deriveCameraStatus(c.status, c.lastHeartbeatAt, now),
    lastHeartbeatAt: c.lastHeartbeatAt || null,
    safeErrorCode: c.safeErrorCode || null
  }));

  return { items, total: items.length };
}

export async function fetchAuditLogsTimeline(page: number, limit: number) {
  const db = getDb();
  const auditColl = getAuditColl();

  const pipeline: any[] = [
    {
      $lookup: {
        from: 'users',
        localField: 'actor',
        foreignField: '_id',
        as: 'actorUser'
      }
    },
    { $unwind: { path: '$actorUser', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        id: '$_id',
        actorEmail: { $ifNull: ['$actorUser.email', 'System'] },
        action: 1,
        targetId: '$target',
        reason: 1,
        status: 1,
        requestId: 1,
        createdAt: 1
      }
    },
    { $sort: { createdAt: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit }
  ];

  const [items, total] = await Promise.all([
    auditColl.aggregate(pipeline).toArray(),
    auditColl.countDocuments()
  ]);

  return { items, total, page, limit };
}
